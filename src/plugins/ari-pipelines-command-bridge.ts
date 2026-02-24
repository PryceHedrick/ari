import type { ReplyPayload } from "../auto-reply/types.js";
import type { OpenClawConfig } from "../config/config.js";
import { sleep } from "../utils.js";
import type { OpenClawPluginApi, PluginCommandContext } from "./types.js";

type CommandScope = "status" | "p1" | "p2";

type BridgeRetryConfig = {
  attempts: number;
  minDelayMs: number;
  maxDelayMs: number;
  statusCodes: Set<number>;
};

export type BridgeRuntimeConfig = {
  apiBaseUrl: string;
  apiToken?: string;
  timeoutMs: number;
  retry: BridgeRetryConfig;
  mutationRetryAttempts: number;
  approvalRetryAttempts: number;
  strictRouting: boolean;
  p1Channels: Set<string>;
  p2Channels: Set<string>;
  statusChannels: Set<string>;
  logger: OpenClawPluginApi["logger"];
};

type HttpMethod = "GET" | "POST";

type RequestResult = {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
};

type CommandAccessDecision = {
  allowed: boolean;
  channelId?: string;
  reason?: string;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_MIN_DELAY_MS = 350;
const DEFAULT_RETRY_MAX_DELAY_MS = 3_000;
const DEFAULT_RETRY_STATUS_CODES = new Set<number>([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_MUTATION_RETRY_ATTEMPTS = 1;
const DEFAULT_APPROVAL_RETRY_ATTEMPTS = 1;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

function asNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

function readEnv(name: string): string | undefined {
  return asTrimmedString(process.env[name]);
}

function parseStatusCode(candidate: unknown): number | undefined {
  const parsed =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string"
        ? Number(candidate.trim())
        : undefined;
  if (parsed === undefined || !Number.isFinite(parsed)) {
    return undefined;
  }
  const rounded = Math.floor(parsed);
  if (rounded < 100 || rounded > 599) {
    return undefined;
  }
  return rounded;
}

export function parseRetryStatusCodes(value: unknown): Set<number> {
  const set = new Set<number>();

  if (Array.isArray(value)) {
    for (const entry of value) {
      const code = parseStatusCode(entry);
      if (code !== undefined) {
        set.add(code);
      }
    }
    return set;
  }

  if (typeof value === "string") {
    for (const part of value.split(",")) {
      const code = parseStatusCode(part);
      if (code !== undefined) {
        set.add(code);
      }
    }
    return set;
  }

  const single = parseStatusCode(value);
  if (single !== undefined) {
    set.add(single);
  }
  return set;
}

export function computeRetryDelayMs(params: {
  attempt: number;
  minDelayMs: number;
  maxDelayMs: number;
}): number {
  const step = Math.max(0, Math.floor(params.attempt) - 1);
  const baseDelay = params.minDelayMs * 2 ** step;
  return Math.max(params.minDelayMs, Math.min(params.maxDelayMs, Math.round(baseDelay)));
}

function parseAgeMinutesFromIso(iso: string | undefined): number {
  if (!iso) {
    return 0;
  }
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - ts) / 60_000));
}

export function normalizeChannelId(value: unknown): string | undefined {
  const raw = typeof value === "number" ? String(value) : asTrimmedString(value);
  if (!raw || raw === "*" || raw.includes("${")) {
    return undefined;
  }

  const channelSegmentMatch = raw.match(/(?:^|:)channel:([^:]+)$/i);
  if (channelSegmentMatch && channelSegmentMatch[1]) {
    return channelSegmentMatch[1].trim();
  }

  if (raw.startsWith("channel:")) {
    return raw.slice("channel:".length).trim() || undefined;
  }

  if (/^[A-Za-z0-9_-]{2,}$/.test(raw)) {
    return raw;
  }

  return undefined;
}

function addChannelSet(target: Set<string>, raw: unknown): void {
  if (!Array.isArray(raw)) {
    return;
  }
  for (const candidate of raw) {
    const normalized = normalizeChannelId(candidate);
    if (normalized) {
      target.add(normalized);
    }
  }
}

function addChannelIfPresent(target: Set<string>, value: unknown): void {
  const normalized = normalizeChannelId(value);
  if (normalized) {
    target.add(normalized);
  }
}

function deriveRoutingChannelsFromConfig(
  config: OpenClawConfig,
  target: BridgeRuntimeConfig,
): void {
  const root = config as unknown as Record<string, unknown>;
  const agents = asRecord(root.agents);
  const routing = agents.routing;

  if (Array.isArray(routing)) {
    for (const rawEntry of routing) {
      const entry = asRecord(rawEntry);
      const routeChannel = normalizeChannelId(entry.channel);
      const routeAgent = asTrimmedString(entry.agent)?.toLowerCase();
      if (!routeChannel || !routeAgent) {
        continue;
      }
      if (routeAgent === "market-monitor" || routeAgent === "deep-analysis") {
        target.p1Channels.add(routeChannel);
      }
      if (routeAgent === "growth-pod" || routeAgent === "deep-analysis") {
        target.p2Channels.add(routeChannel);
      }
    }
  }

  const alerts = asRecord(root.alerts);
  addChannelIfPresent(target.p1Channels, alerts.p0Channel);
  addChannelIfPresent(target.p1Channels, alerts.p1Channel);
  addChannelIfPresent(target.statusChannels, alerts.systemChannel);
}

function buildRuntimeConfig(api: OpenClawPluginApi): BridgeRuntimeConfig {
  const pluginConfig = asRecord(api.pluginConfig);
  const routing = asRecord(pluginConfig.routing);
  const retryConfig = asRecord(pluginConfig.retry);

  const apiBaseUrl =
    asTrimmedString(pluginConfig.apiBaseUrl) ??
    readEnv("ARI_PIPELINES_API_BASE_URL") ??
    DEFAULT_API_BASE_URL;
  const apiToken = asTrimmedString(pluginConfig.apiToken) ?? readEnv("ARI_PIPELINES_API_TOKEN");
  const timeoutMs =
    asPositiveInt(pluginConfig.timeoutMs) ??
    asPositiveInt(readEnv("ARI_PIPELINES_API_TIMEOUT_MS")) ??
    DEFAULT_TIMEOUT_MS;
  const retryAttempts =
    asPositiveInt(retryConfig.attempts) ??
    asPositiveInt(readEnv("ARI_PIPELINES_API_RETRY_ATTEMPTS")) ??
    DEFAULT_RETRY_ATTEMPTS;
  const mutationRetryAttempts =
    asPositiveInt(retryConfig.mutationAttempts) ??
    asPositiveInt(readEnv("ARI_PIPELINES_API_RETRY_MUTATION_ATTEMPTS")) ??
    DEFAULT_MUTATION_RETRY_ATTEMPTS;
  const approvalRetryAttempts =
    asPositiveInt(retryConfig.approvalAttempts) ??
    asPositiveInt(readEnv("ARI_PIPELINES_API_RETRY_APPROVAL_ATTEMPTS")) ??
    DEFAULT_APPROVAL_RETRY_ATTEMPTS;
  const retryMinDelayMs =
    asNonNegativeInt(retryConfig.minDelayMs) ??
    asNonNegativeInt(readEnv("ARI_PIPELINES_API_RETRY_MIN_DELAY_MS")) ??
    DEFAULT_RETRY_MIN_DELAY_MS;
  const retryMaxDelayMsRaw =
    asNonNegativeInt(retryConfig.maxDelayMs) ??
    asNonNegativeInt(readEnv("ARI_PIPELINES_API_RETRY_MAX_DELAY_MS")) ??
    DEFAULT_RETRY_MAX_DELAY_MS;
  const retryMaxDelayMs = Math.max(retryMinDelayMs, retryMaxDelayMsRaw);
  const configuredRetryStatuses = parseRetryStatusCodes(retryConfig.statusCodes);
  const envRetryStatuses = parseRetryStatusCodes(readEnv("ARI_PIPELINES_API_RETRY_STATUS_CODES"));
  const resolvedRetryStatuses =
    configuredRetryStatuses.size > 0
      ? configuredRetryStatuses
      : envRetryStatuses.size > 0
        ? envRetryStatuses
        : new Set(DEFAULT_RETRY_STATUS_CODES);
  const strictRouting = asBoolean(routing.strict) ?? true;

  const resolved: BridgeRuntimeConfig = {
    apiBaseUrl,
    apiToken,
    timeoutMs,
    retry: {
      attempts: retryAttempts,
      minDelayMs: retryMinDelayMs,
      maxDelayMs: retryMaxDelayMs,
      statusCodes: resolvedRetryStatuses,
    },
    mutationRetryAttempts,
    approvalRetryAttempts,
    strictRouting,
    p1Channels: new Set<string>(),
    p2Channels: new Set<string>(),
    statusChannels: new Set<string>(),
    logger: api.logger,
  };

  addChannelSet(resolved.p1Channels, routing.p1ChannelIds);
  addChannelSet(resolved.p2Channels, routing.p2ChannelIds);
  addChannelSet(resolved.statusChannels, routing.statusChannelIds);

  deriveRoutingChannelsFromConfig(api.config, resolved);

  return resolved;
}

export function resolveRetryPolicyForRequest(params: {
  runtime: BridgeRuntimeConfig;
  method: HttpMethod;
  path: string;
}): BridgeRetryConfig {
  if (params.method === "GET") {
    return params.runtime.retry;
  }
  if (/\/approve$|\/reject$/.test(params.path)) {
    return {
      ...params.runtime.retry,
      attempts: params.runtime.approvalRetryAttempts,
    };
  }
  return {
    ...params.runtime.retry,
    attempts: params.runtime.mutationRetryAttempts,
  };
}

export function extractCommandChannelId(ctx: PluginCommandContext): string | undefined {
  return (
    normalizeChannelId(ctx.to) ??
    normalizeChannelId(ctx.from) ??
    normalizeChannelId(ctx.messageThreadId)
  );
}

function commandScopeLabel(scope: CommandScope): string {
  if (scope === "status") {
    return "status";
  }
  if (scope === "p1") {
    return "Pipeline 1";
  }
  return "Pipeline 2";
}

export function evaluateCommandAccess(params: {
  ctx: PluginCommandContext;
  scope: CommandScope;
  runtime: BridgeRuntimeConfig;
}): CommandAccessDecision {
  const { ctx, scope, runtime } = params;
  const channelId = extractCommandChannelId(ctx);

  if (ctx.channel !== "discord") {
    return { allowed: true, channelId };
  }

  const allowedSet =
    scope === "p1"
      ? runtime.p1Channels
      : scope === "p2"
        ? runtime.p2Channels
        : runtime.statusChannels;

  if (allowedSet.size === 0) {
    return { allowed: true, channelId };
  }

  if (!channelId) {
    if (!runtime.strictRouting) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `/${scope === "status" ? "ari-status" : scope === "p1" ? "ari-p1" : "ari-p2"} command blocked: unable to resolve discord channel id for ${commandScopeLabel(scope)} policy.`,
    };
  }

  if (allowedSet.has(channelId)) {
    return { allowed: true, channelId };
  }

  if (!runtime.strictRouting) {
    return { allowed: true, channelId };
  }

  return {
    allowed: false,
    channelId,
    reason: `Command blocked in channel ${channelId}. ${commandScopeLabel(scope)} commands are restricted by ARI routing policy.`,
  };
}

function parseJsonSafe(raw: string): unknown {
  if (!raw.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function callAriPipelinesApi(params: {
  runtime: BridgeRuntimeConfig;
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
}): Promise<RequestResult> {
  const retryPolicy = resolveRetryPolicyForRequest({
    runtime: params.runtime,
    method: params.method,
    path: params.path,
  });
  const attempts = Math.max(1, retryPolicy.attempts);
  let lastResult: RequestResult | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await callAriPipelinesApiOnce(params);
    if (result.ok) {
      if (attempt > 1) {
        params.runtime.logger.info(
          `[ari-autonomous] ${params.method} ${params.path} recovered on attempt ${attempt}/${attempts}`,
        );
      }
      return result;
    }

    lastResult = result;
    const retryable =
      attempt < attempts && (result.status ? retryPolicy.statusCodes.has(result.status) : true);
    if (!retryable) {
      return result;
    }

    const delayMs = computeRetryDelayMs({
      attempt,
      minDelayMs: retryPolicy.minDelayMs,
      maxDelayMs: retryPolicy.maxDelayMs,
    });
    params.runtime.logger.warn(
      `[ari-autonomous] ${params.method} ${params.path} retry ${attempt + 1}/${attempts} in ${delayMs}ms after error: ${result.error ?? "unknown error"}`,
    );
    await sleep(delayMs);
  }

  return (
    lastResult ?? {
      ok: false,
      error: "request failed without response",
    }
  );
}

async function callAriPipelinesApiOnce(params: {
  runtime: BridgeRuntimeConfig;
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
}): Promise<RequestResult> {
  const url = new URL(
    params.path,
    params.runtime.apiBaseUrl.endsWith("/")
      ? params.runtime.apiBaseUrl
      : `${params.runtime.apiBaseUrl}/`,
  );

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (params.runtime.apiToken) {
    headers.authorization = `Bearer ${params.runtime.apiToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.runtime.timeoutMs);

  try {
    const response = await fetch(url, {
      method: params.method,
      headers,
      body: params.body ? JSON.stringify(params.body) : undefined,
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const parsed = parseJsonSafe(rawBody);

    if (!response.ok) {
      const errorText =
        asTrimmedString(asRecord(parsed).error) ?? response.statusText ?? "request failed";
      return {
        ok: false,
        status: response.status,
        error: `${response.status} ${errorText}`,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: parsed,
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { ok: false, error: `timeout after ${params.runtime.timeoutMs}ms` };
    }
    return { ok: false, error: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

function formatDecisionOutcome(value: unknown): string {
  const outcome = asTrimmedString(asRecord(value).outcome);
  return outcome ?? "unknown";
}

function formatNumber(value: unknown, digits = 2): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }
  return numeric.toFixed(digits);
}

function formatQueuePriority(value: unknown): string {
  const priority = asTrimmedString(value)?.toLowerCase();
  if (priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "n/a";
}

function formatReasonCodes(value: unknown): string {
  if (!Array.isArray(value)) {
    return "none";
  }
  const tokens = value
    .map((entry) => asTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (tokens.length === 0) {
    return "none";
  }
  return tokens.slice(0, 4).join(",");
}

function parseSeedsFromArgs(args?: string): string[] {
  if (!args) {
    return [];
  }
  return args
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseLimitArg(args?: string): number {
  const parsed = Number((args ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.min(25, Math.max(1, Math.floor(parsed)));
}

function parseWindowHoursArg(args?: string): number {
  const parsed = Number((args ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return 24;
  }
  return Math.min(72, Math.max(1, Math.floor(parsed)));
}

export function parseDashboardPublishArgs(args?: string): { windowHours: number; force: boolean } {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  let windowHours = 24;
  let force = false;
  for (const token of tokens) {
    if (token === "force" || token === "--force") {
      force = true;
      continue;
    }
    const parsed = Number(token);
    if (Number.isFinite(parsed) && parsed > 0) {
      windowHours = Math.min(72, Math.max(1, Math.floor(parsed)));
    }
  }
  return { windowHours, force };
}

function parseQueueArgs(params: { args?: string; validStatuses: Set<string> }): {
  limit: number;
  status?: string;
} {
  const tokens = (params.args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    return { limit: 10 };
  }

  let status: string | undefined;
  let limit = 10;

  const first = tokens[0];
  if (params.validStatuses.has(first)) {
    status = first;
    if (tokens[1]) {
      const parsed = Number(tokens[1]);
      if (Number.isFinite(parsed)) {
        limit = Math.min(25, Math.max(1, Math.floor(parsed)));
      }
    }
    return { limit, status };
  }

  const parsed = Number(first);
  if (Number.isFinite(parsed)) {
    limit = Math.min(25, Math.max(1, Math.floor(parsed)));
  }

  return { limit };
}

function parseLeadAndEvidence(args?: string): { leadId?: string; evidence?: string[] } {
  const trimmed = (args ?? "").trim();
  if (!trimmed) {
    return {};
  }
  const [leadIdToken, ...rest] = trimmed.split(/\s+/);
  const leadId = leadIdToken?.trim() || undefined;
  const remainder = rest.join(" ").trim();
  if (!remainder) {
    return { leadId };
  }
  const evidence = remainder
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);
  return evidence.length > 0 ? { leadId, evidence } : { leadId };
}

function parseRequiredId(args: string | undefined): string | undefined {
  const first = (args ?? "").trim().split(/\s+/)[0];
  return first ? first.trim() : undefined;
}

function asReply(textLines: string[]): ReplyPayload {
  return { text: textLines.join("\n") };
}

async function handleStatusCommand(runtime: BridgeRuntimeConfig): Promise<ReplyPayload> {
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: "/api/system/status",
  });
  if (!result.ok) {
    return asReply([`ARI status failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const schedule = asRecord(payload.schedule);
  const budget = asRecord(payload.budget);
  const tasks = Array.isArray(schedule.tasks) ? schedule.tasks.length : 0;
  const auditCount = Array.isArray(payload.recentAudit) ? payload.recentAudit.length : 0;

  return asReply([
    "ARI status",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"}`,
    `schedulerTasks: ${tasks}`,
    `budgetRemainingUsd: ${formatNumber(budget.dailyRemainingUsd)}`,
    `budgetSpentUsd: ${formatNumber(budget.dailySpentUsd)}`,
    `recentAuditRecords: ${auditCount}`,
  ]);
}

async function handleOpsQueuesCommand(runtime: BridgeRuntimeConfig): Promise<ReplyPayload> {
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: "/api/ops/queues/summary",
  });
  if (!result.ok) {
    return asReply([`ARI ops queue summary failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const p1 = asRecord(payload.p1);
  const p2 = asRecord(payload.p2);
  const thresholds = asRecord(payload.thresholds);

  return asReply([
    "ARI queue summary",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"}`,
    `p1: total=${formatNumber(p1.total, 0)} pending=${formatNumber(p1.pendingApproval, 0)} stale=${formatNumber(p1.stalePending, 0)} high=${formatNumber(p1.highPriorityPending, 0)} approved=${formatNumber(p1.approved, 0)} rejected=${formatNumber(p1.rejected, 0)} oldestPendingMin=${formatNumber(p1.oldestPendingMinutes, 0)}`,
    `p2: total=${formatNumber(p2.total, 0)} draft=${formatNumber(p2.draft, 0)} stale=${formatNumber(p2.staleDraft, 0)} high=${formatNumber(p2.highPriorityPending, 0)} queued=${formatNumber(p2.queued, 0)} approved=${formatNumber(p2.approved, 0)} sent=${formatNumber(p2.sent, 0)} rejected=${formatNumber(p2.rejected, 0)} oldestDraftMin=${formatNumber(p2.oldestDraftMinutes, 0)}`,
    `thresholds: p1 stale=${formatNumber(thresholds.p1StaleMinutes, 0)}m critical=${formatNumber(thresholds.p1CriticalMinutes, 0)}m | p2 stale=${formatNumber(thresholds.p2StaleMinutes, 0)}m critical=${formatNumber(thresholds.p2CriticalMinutes, 0)}m`,
  ]);
}

async function handleOpsSlaCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const windowHours = parseWindowHoursArg(args);
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: `/api/ops/sla?windowHours=${windowHours}`,
  });
  if (!result.ok) {
    return asReply([`ARI ops SLA failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const pipelines = asRecord(payload.pipelines);
  const p1 = asRecord(pipelines.p1);
  const p2 = asRecord(pipelines.p2);
  const budget = asRecord(payload.budget);
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

  const lines = [
    "ARI ops SLA",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)}`,
    `p1: runs=${formatNumber(p1.totalRuns, 0)} successRate=${formatNumber(p1.successRate, 3)} avgDurationSec=${formatNumber(Number(p1.averageDurationMs) / 1000, 1)} avgCostUsd=${formatNumber(p1.averageCostUsd, 3)}`,
    `p2: runs=${formatNumber(p2.totalRuns, 0)} successRate=${formatNumber(p2.successRate, 3)} avgDurationSec=${formatNumber(Number(p2.averageDurationMs) / 1000, 1)} avgCostUsd=${formatNumber(p2.averageCostUsd, 3)}`,
    `budget: remainingUsd=${formatNumber(budget.dailyRemainingUsd, 2)} usedUsd=${formatNumber(budget.dailyUsedUsd, 2)} limitUsd=${formatNumber(budget.dailyLimitUsd, 2)}`,
  ];

  if (alerts.length === 0) {
    lines.push("alerts: none");
    return asReply(lines);
  }

  lines.push(`alerts: ${alerts.length}`);
  for (let idx = 0; idx < Math.min(alerts.length, 5); idx += 1) {
    const alert = asRecord(alerts[idx]);
    const severity = asTrimmedString(alert.severity) ?? "n/a";
    const code = asTrimmedString(alert.code) ?? "n/a";
    const message = asTrimmedString(alert.message) ?? "n/a";
    lines.push(`  - [${severity}] ${code}: ${message}`);
  }
  return asReply(lines);
}

async function handleOpsDashboardCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const windowHours = parseWindowHoursArg(args);
  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/dashboard/build",
    body: { windowHours },
  });
  if (!result.ok) {
    return asReply([`ARI ops dashboard build failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const snapshot = asRecord(payload.snapshot);
  const pipelines = asRecord(snapshot.pipelines);
  const p1 = asRecord(pipelines.p1);
  const p2 = asRecord(pipelines.p2);
  const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts.length : 0;

  return asReply([
    "ARI ops dashboard build complete",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)}`,
    `artifactPath: ${asTrimmedString(payload.artifactPath) ?? "n/a"}`,
    `p1Runs=${formatNumber(p1.totalRuns, 0)} p1SuccessRate=${formatNumber(p1.successRate, 3)} p2Runs=${formatNumber(p2.totalRuns, 0)} p2SuccessRate=${formatNumber(p2.successRate, 3)}`,
    `alerts=${alerts}`,
  ]);
}

async function handleOpsDashboardPublishCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseDashboardPublishArgs(args);
  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/dashboard/publish",
    body: { windowHours: parsed.windowHours, force: parsed.force },
  });
  if (!result.ok) {
    return asReply([`ARI ops dashboard publish failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const published = payload.published === true;
  const webhookConfigured = payload.webhookConfigured === true;
  const gateApplied = payload.gateApplied === true;
  const gatePassed = payload.gatePassed === true;
  return asReply([
    "ARI ops dashboard publish",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)} | force=${String(parsed.force)}`,
    `artifactPath: ${asTrimmedString(payload.artifactPath) ?? "n/a"}`,
    `gateApplied: ${String(gateApplied)} gatePassed: ${String(gatePassed)} gateReason: ${asTrimmedString(payload.gateReason) ?? "none"}`,
    `webhookConfigured: ${String(webhookConfigured)}`,
    `published: ${String(published)}`,
    `status: ${formatNumber(payload.publishStatus, 0)} error: ${asTrimmedString(payload.publishError) ?? "none"}`,
  ]);
}

async function handleP1RunCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const sourceHint = asTrimmedString(args);
  const body = sourceHint ? { sourceHint } : undefined;

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/p1/run",
    body,
  });
  if (!result.ok) {
    return asReply([`P1 run failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const context = asRecord(payload.context);
  const output = asRecord(payload.output);
  const sourceCounts = asRecord(output.sourceCounts);
  const metrics = asRecord(payload.metrics);

  return asReply([
    `P1 run complete: ${asTrimmedString(context.runId) ?? "unknown-run"}`,
    `decision: ${formatDecisionOutcome(payload.decision)}`,
    `scriptPackId: ${asTrimmedString(output.scriptPackId) ?? "n/a"}`,
    `marketReportId: ${asTrimmedString(output.marketReportId) ?? "n/a"}`,
    `sources: x=${formatNumber(sourceCounts.x, 0)} reddit=${formatNumber(sourceCounts.reddit, 0)} youtube=${formatNumber(sourceCounts.youtube, 0)} ebay=${formatNumber(sourceCounts.ebay, 0)} portfolio=${formatNumber(sourceCounts.portfolio, 0)}`,
    `estimatedCostUsd: ${formatNumber(metrics.costUsd, 3)}`,
  ]);
}

async function handleP1VideoCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const inputAssetId = asTrimmedString(args);
  if (!inputAssetId) {
    return asReply(["Usage: /ari-p1-video <input-asset-id>"]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/p1/video/edit",
    body: { inputAssetId },
  });
  if (!result.ok) {
    return asReply([`P1 video edit failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const output = asRecord(payload.output);
  const clips = Array.isArray(output.clips) ? output.clips.length : 0;

  return asReply([
    `P1 video job created: ${asTrimmedString(payload.jobId) ?? "n/a"}`,
    `status: ${asTrimmedString(payload.status) ?? "n/a"}`,
    `requiresApproval: ${String(payload.requiresApproval === true)}`,
    `masterVideoPath: ${asTrimmedString(output.masterVideoPath) ?? "n/a"}`,
    `clips: ${clips}`,
    "approve with: /ari-p1-approve <job-id>",
  ]);
}

async function handleP1ApproveCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const jobId = parseRequiredId(args);
  if (!jobId) {
    return asReply(["Usage: /ari-p1-approve <job-id>"]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: `/api/p1/video/job/${encodeURIComponent(jobId)}/approve`,
  });
  if (!result.ok) {
    return asReply([`P1 approve failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  return asReply([
    `P1 approval processed for ${jobId}`,
    `approved: ${String(payload.approved === true)}`,
    `status: ${asTrimmedString(payload.status) ?? "n/a"}`,
    `decision: ${formatDecisionOutcome(payload.decision)}`,
  ]);
}

async function handleP1JobStatusCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const jobId = parseRequiredId(args);
  if (!jobId) {
    return asReply(["Usage: /ari-p1-job <job-id>"]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: `/api/p1/video/job/${encodeURIComponent(jobId)}`,
  });
  if (!result.ok) {
    return asReply([`P1 job lookup failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const output = asRecord(payload.output);
  const clips = Array.isArray(output.clips) ? output.clips.length : 0;

  return asReply([
    `P1 video job: ${jobId}`,
    `status: ${asTrimmedString(payload.status) ?? "n/a"}`,
    `masterVideoPath: ${asTrimmedString(output.masterVideoPath) ?? "n/a"}`,
    `clips: ${clips}`,
  ]);
}

async function handleP1QueueCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseQueueArgs({
    args,
    validStatuses: new Set(["pending_approval", "approved", "rejected"]),
  });
  const query = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.status) {
    query.set("status", parsed.status);
  }
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: `/api/p1/video/jobs?${query.toString()}`,
  });
  if (!result.ok) {
    return asReply([`P1 queue lookup failed: ${result.error ?? "unknown error"}`]);
  }

  const jobs = Array.isArray(result.data) ? result.data : [];
  if (jobs.length === 0) {
    return asReply(["P1 queue is empty for current filter."]);
  }

  const lines = [
    `P1 video queue (count=${jobs.length}${parsed.status ? `, status=${parsed.status}` : ""})`,
  ];
  for (let idx = 0; idx < Math.min(jobs.length, 20); idx += 1) {
    const job = asRecord(jobs[idx]);
    const id = asTrimmedString(job.id) ?? "n/a";
    const status = asTrimmedString(job.status) ?? "n/a";
    const createdAt = asTrimmedString(job.createdAt) ?? "n/a";
    const ageMinutes = asPositiveInt(job.ageMinutes) ?? parseAgeMinutesFromIso(createdAt);
    const stale = job.stale === true ? "yes" : "no";
    const priority = formatQueuePriority(job.priority);
    const reasons = formatReasonCodes(job.reasonCodes);
    lines.push(
      `${idx + 1}. ${id} | status=${status} | ageMin=${ageMinutes} | stale=${stale} | priority=${priority} | reasons=${reasons} | createdAt=${createdAt}`,
    );
  }
  return asReply(lines);
}

async function handleP2ScanCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const seedBusinesses = parseSeedsFromArgs(args);
  const body = seedBusinesses.length > 0 ? { seedBusinesses } : undefined;

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/p2/leads/scan",
    body,
  });
  if (!result.ok) {
    return asReply([`P2 scan failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const leads = Array.isArray(payload.leads) ? payload.leads : [];

  return asReply([
    "P2 lead scan complete",
    `scannedAt: ${asTrimmedString(payload.scannedAt) ?? "n/a"}`,
    `leadCount: ${leads.length}`,
    `decision: ${formatDecisionOutcome(payload.decision)}`,
    `artifactPath: ${asTrimmedString(payload.artifactPath) ?? "n/a"}`,
  ]);
}

async function handleP2TopCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const limit = parseLimitArg(args);
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: `/api/p2/leads/top?limit=${limit}`,
  });
  if (!result.ok) {
    return asReply([`P2 top leads failed: ${result.error ?? "unknown error"}`]);
  }

  const leads = Array.isArray(result.data) ? result.data : [];
  if (leads.length === 0) {
    return asReply(["P2 top leads: no leads found. Run /ari-p2-scan first."]);
  }

  const lines = ["P2 top leads"];
  for (let idx = 0; idx < Math.min(leads.length, 20); idx += 1) {
    const lead = asRecord(leads[idx]);
    const name = asTrimmedString(lead.businessName) ?? "unknown";
    const score = formatNumber(lead.score, 3);
    const leadId = asTrimmedString(lead.leadId) ?? "n/a";
    const vertical = asTrimmedString(lead.verticalSegment) ?? "n/a";
    const locality = asTrimmedString(lead.localityTier) ?? "n/a";
    lines.push(
      `${idx + 1}. ${name} | score=${score} | vertical=${vertical} | locality=${locality} | leadId=${leadId}`,
    );
  }

  return asReply(lines);
}

async function handleP2QueueCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseQueueArgs({
    args,
    validStatuses: new Set(["draft", "queued", "approved", "sent", "rejected"]),
  });
  const query = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.status) {
    query.set("status", parsed.status);
  }
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: `/api/p2/outreach/queue?${query.toString()}`,
  });
  if (!result.ok) {
    return asReply([`P2 queue lookup failed: ${result.error ?? "unknown error"}`]);
  }

  const items = Array.isArray(result.data) ? result.data : [];
  if (items.length === 0) {
    return asReply(["P2 outreach queue is empty for current filter."]);
  }

  const lines = [
    `P2 outreach queue (count=${items.length}${parsed.status ? `, status=${parsed.status}` : ""})`,
  ];
  for (let idx = 0; idx < Math.min(items.length, 20); idx += 1) {
    const item = asRecord(items[idx]);
    const id = asTrimmedString(item.id) ?? "n/a";
    const status = asTrimmedString(item.status) ?? "n/a";
    const leadId = asTrimmedString(item.leadId) ?? "n/a";
    const createdAt = asTrimmedString(item.createdAt);
    const ageMinutes = asPositiveInt(item.ageMinutes) ?? parseAgeMinutesFromIso(createdAt);
    const stale = item.stale === true ? "yes" : "no";
    const priority = formatQueuePriority(item.priority);
    const reasons = formatReasonCodes(item.reasonCodes);
    lines.push(
      `${idx + 1}. ${id} | leadId=${leadId} | status=${status} | ageMin=${ageMinutes} | stale=${stale} | priority=${priority} | reasons=${reasons}`,
    );
  }
  return asReply(lines);
}

async function handleP2DemoCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseLeadAndEvidence(args);
  if (!parsed.leadId) {
    return asReply(["Usage: /ari-p2-demo <lead-id> [evidence-1 | evidence-2]"]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/p2/demo/build",
    body: {
      leadId: parsed.leadId,
      ...(parsed.evidence && parsed.evidence.length > 0 ? { evidence: parsed.evidence } : {}),
    },
  });
  if (!result.ok) {
    return asReply([`P2 demo failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const lead = asRecord(payload.lead);
  const artifact = asRecord(payload.artifact);
  const outreach = asRecord(payload.outreach);

  return asReply([
    `P2 demo complete: ${asTrimmedString(lead.businessName) ?? parsed.leadId}`,
    `decision: ${formatDecisionOutcome(payload.decision)}`,
    `previewUrl: ${asTrimmedString(artifact.previewUrl) ?? "n/a"}`,
    `repoPath: ${asTrimmedString(artifact.repoPath) ?? "n/a"}`,
    `outreachId: ${asTrimmedString(outreach.id) ?? "n/a"}`,
    "approve outreach with: /ari-p2-approve <outreach-id>",
  ]);
}

async function handleP2ApproveCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const outreachId = parseRequiredId(args);
  if (!outreachId) {
    return asReply(["Usage: /ari-p2-approve <outreach-id>"]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: `/api/p2/outreach/${encodeURIComponent(outreachId)}/approve`,
  });
  if (!result.ok) {
    return asReply([`P2 outreach approve failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  return asReply([
    `P2 outreach approval processed: ${outreachId}`,
    `approved: ${String(payload.approved === true)}`,
    `status: ${asTrimmedString(payload.status) ?? "n/a"}`,
    `decision: ${formatDecisionOutcome(payload.decision)}`,
  ]);
}

async function handleP2RejectCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const outreachId = parseRequiredId(args);
  if (!outreachId) {
    return asReply(["Usage: /ari-p2-reject <outreach-id>"]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: `/api/p2/outreach/${encodeURIComponent(outreachId)}/reject`,
  });
  if (!result.ok) {
    return asReply([`P2 outreach reject failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  return asReply([
    `P2 outreach rejected: ${outreachId}`,
    `rejected: ${String(payload.rejected === true)}`,
    `status: ${asTrimmedString(payload.status) ?? "n/a"}`,
  ]);
}

function withAccessControl(params: {
  runtime: BridgeRuntimeConfig;
  scope: CommandScope;
  handler: (ctx: PluginCommandContext) => Promise<ReplyPayload>;
}): (ctx: PluginCommandContext) => Promise<ReplyPayload> {
  return async (ctx: PluginCommandContext) => {
    const access = evaluateCommandAccess({
      ctx,
      scope: params.scope,
      runtime: params.runtime,
    });
    if (!access.allowed) {
      return asReply([access.reason ?? "Command blocked by policy."]);
    }
    return params.handler(ctx);
  };
}

export function registerAriPipelinesCommandBridge(api: OpenClawPluginApi): void {
  const runtime = buildRuntimeConfig(api);

  api.logger.info(
    `[ari-autonomous] command bridge active: baseUrl=${runtime.apiBaseUrl} strictRouting=${runtime.strictRouting}`,
  );

  api.registerCommand({
    name: "ari-status",
    description: "Show ARI pipeline scheduler, budget, and audit status",
    acceptsArgs: false,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async () => handleStatusCommand(runtime),
    }),
  });

  api.registerCommand({
    name: "ari-ops-queues",
    description: "Show queue backlog summary for Pipeline 1 and Pipeline 2",
    acceptsArgs: false,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async () => handleOpsQueuesCommand(runtime),
    }),
  });

  api.registerCommand({
    name: "ari-ops-sla",
    description: "Show 24h SLA, budget, and alert telemetry (optional: <window-hours>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsSlaCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-dashboard",
    description: "Build dashboard artifact from ops telemetry (optional: <window-hours>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsDashboardCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-dashboard-publish",
    description: "Build + publish ops dashboard artifact via webhook (optional: <hours> [force])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsDashboardPublishCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p1-run",
    description: "Run Pipeline 1 cycle (optional: source hint)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p1",
      handler: async (ctx) => handleP1RunCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p1-video",
    description: "Build Pipeline 1 video package from asset id",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p1",
      handler: async (ctx) => handleP1VideoCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p1-queue",
    description: "List Pipeline 1 video jobs (optional: <status> <limit>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p1",
      handler: async (ctx) => handleP1QueueCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p1-job",
    description: "Fetch Pipeline 1 video job status by id",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p1",
      handler: async (ctx) => handleP1JobStatusCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p1-approve",
    description: "Approve Pipeline 1 video publish job",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p1",
      handler: async (ctx) => handleP1ApproveCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-scan",
    description: "Run Pipeline 2 lead scan (optional: comma-separated seed businesses)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2ScanCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-top",
    description: "List top Pipeline 2 leads (optional: limit)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2TopCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-queue",
    description: "List Pipeline 2 outreach queue (optional: <status> <limit>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2QueueCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-demo",
    description: "Build Pipeline 2 demo from lead id",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2DemoCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-approve",
    description: "Approve Pipeline 2 outreach item",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2ApproveCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-reject",
    description: "Reject Pipeline 2 outreach item",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2RejectCommand(runtime, ctx.args),
    }),
  });
}
