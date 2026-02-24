import type { ReplyPayload } from "../auto-reply/types.js";
import type { OpenClawConfig } from "../config/config.js";
import type { OpenClawPluginApi, PluginCommandContext } from "./types.js";

type CommandScope = "status" | "p1" | "p2";

export type BridgeRuntimeConfig = {
  apiBaseUrl: string;
  apiToken?: string;
  timeoutMs: number;
  strictRouting: boolean;
  p1Channels: Set<string>;
  p2Channels: Set<string>;
  statusChannels: Set<string>;
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

  const apiBaseUrl =
    asTrimmedString(pluginConfig.apiBaseUrl) ??
    readEnv("ARI_PIPELINES_API_BASE_URL") ??
    DEFAULT_API_BASE_URL;
  const apiToken = asTrimmedString(pluginConfig.apiToken) ?? readEnv("ARI_PIPELINES_API_TOKEN");
  const timeoutMs =
    asPositiveInt(pluginConfig.timeoutMs) ??
    asPositiveInt(readEnv("ARI_PIPELINES_API_TIMEOUT_MS")) ??
    DEFAULT_TIMEOUT_MS;
  const strictRouting = asBoolean(routing.strict) ?? true;

  const resolved: BridgeRuntimeConfig = {
    apiBaseUrl,
    apiToken,
    timeoutMs,
    strictRouting,
    p1Channels: new Set<string>(),
    p2Channels: new Set<string>(),
    statusChannels: new Set<string>(),
  };

  addChannelSet(resolved.p1Channels, routing.p1ChannelIds);
  addChannelSet(resolved.p2Channels, routing.p2ChannelIds);
  addChannelSet(resolved.statusChannels, routing.statusChannelIds);

  deriveRoutingChannelsFromConfig(api.config, resolved);

  return resolved;
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

  return asReply([
    "ARI queue summary",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"}`,
    `p1: total=${formatNumber(p1.total, 0)} pending=${formatNumber(p1.pendingApproval, 0)} approved=${formatNumber(p1.approved, 0)} rejected=${formatNumber(p1.rejected, 0)} oldestPendingMin=${formatNumber(p1.oldestPendingMinutes, 0)}`,
    `p2: total=${formatNumber(p2.total, 0)} draft=${formatNumber(p2.draft, 0)} queued=${formatNumber(p2.queued, 0)} approved=${formatNumber(p2.approved, 0)} sent=${formatNumber(p2.sent, 0)} rejected=${formatNumber(p2.rejected, 0)} oldestDraftMin=${formatNumber(p2.oldestDraftMinutes, 0)}`,
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
    lines.push(`${idx + 1}. ${id} | status=${status} | createdAt=${createdAt}`);
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
    lines.push(`${idx + 1}. ${name} | score=${score} | leadId=${leadId}`);
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
    lines.push(`${idx + 1}. ${id} | leadId=${leadId} | status=${status}`);
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
