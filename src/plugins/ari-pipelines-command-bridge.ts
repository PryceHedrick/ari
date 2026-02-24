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

type BridgeOpsAutopublishConfig = {
  enabled: boolean;
  intervalMinutes: number;
  windowHours: number;
  startupDelaySeconds: number;
  force: boolean;
  businessUnit: string;
  channelId?: string;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
};

type BridgeOpsCanaryConfig = {
  enabled: boolean;
  intervalMinutes: number;
  startupDelaySeconds: number;
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  businessUnit: string;
  channelId?: string;
};

type BridgeOpsWeeklyDigestConfig = {
  enabled: boolean;
  intervalMinutes: number;
  windowHours: number;
  startupDelaySeconds: number;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
  forceRerunEnabled: boolean;
  forceRerunDelayMinutes: number;
  forceRerunMaxAttempts: number;
};

export type BridgeRuntimeConfig = {
  apiBaseUrl: string;
  apiToken?: string;
  timeoutMs: number;
  retry: BridgeRetryConfig;
  mutationRetryAttempts: number;
  approvalRetryAttempts: number;
  opsAutopublish: BridgeOpsAutopublishConfig;
  opsCanary: BridgeOpsCanaryConfig;
  opsWeeklyDigest: BridgeOpsWeeklyDigestConfig;
  strictRouting: boolean;
  p1Channels: Set<string>;
  p2Channels: Set<string>;
  statusChannels: Set<string>;
  logger: OpenClawPluginApi["logger"];
};

type OpsAutopublishStatus = {
  enabled: boolean;
  active: boolean;
  inFlight: boolean;
  intervalMinutes: number;
  windowHours: number;
  startupDelaySeconds: number;
  force: boolean;
  businessUnit: string;
  channelId?: string;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
  totalRuns: number;
  totalPublished: number;
  totalSkipped: number;
  totalFailures: number;
  consecutiveFailures: number;
  escalationCount: number;
  lastTrigger?: string;
  lastRunAt?: string;
  lastCompletedAt?: string;
  lastPublishedAt?: string;
  lastGatePassed?: boolean;
  lastPublishStatus?: number;
  lastPublishError?: string;
  lastHoldSummary?: string;
  lastP1HoldReasons?: {
    governanceHold: number;
    budgetHold: number;
    dataGap: number;
  };
  lastP2HoldReasons?: {
    governanceHold: number;
    budgetHold: number;
    dataGap: number;
  };
  lastEscalatedAt?: string;
  nextRunAt?: string;
};

type OpsCanaryStatus = {
  enabled: boolean;
  active: boolean;
  inFlight: boolean;
  intervalMinutes: number;
  startupDelaySeconds: number;
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  businessUnit: string;
  channelId?: string;
  totalRuns: number;
  totalSent: number;
  totalFailures: number;
  lastTrigger?: string;
  lastRunAt?: string;
  lastCompletedAt?: string;
  lastSentAt?: string;
  lastError?: string;
  nextRunAt?: string;
};

type OpsWeeklyDigestStatus = {
  enabled: boolean;
  active: boolean;
  inFlight: boolean;
  intervalMinutes: number;
  windowHours: number;
  startupDelaySeconds: number;
  failureAlertThreshold: number;
  failureAlertCooldownMinutes: number;
  forceRerunEnabled: boolean;
  forceRerunDelayMinutes: number;
  forceRerunMaxAttempts: number;
  forceRerunPending: boolean;
  forceRerunAttempts: number;
  totalRuns: number;
  totalPublished: number;
  totalFailures: number;
  consecutiveFailures: number;
  escalationCount: number;
  lastTrigger?: string;
  lastRunAt?: string;
  lastCompletedAt?: string;
  lastPublishedAt?: string;
  lastPublishStatus?: number;
  lastError?: string;
  lastEscalatedAt?: string;
  lastForcedRerunAt?: string;
  nextRunAt?: string;
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
const DEFAULT_OPS_AUTOPUBLISH_INTERVAL_MINUTES = 180;
const DEFAULT_OPS_AUTOPUBLISH_WINDOW_HOURS = 24;
const DEFAULT_OPS_AUTOPUBLISH_STARTUP_DELAY_SECONDS = 45;
const DEFAULT_OPS_AUTOPUBLISH_FAILURE_ALERT_THRESHOLD = 3;
const DEFAULT_OPS_AUTOPUBLISH_FAILURE_ALERT_COOLDOWN_MINUTES = 120;
const DEFAULT_OPS_CANARY_INTERVAL_MINUTES = 24 * 60;
const DEFAULT_OPS_CANARY_STARTUP_DELAY_SECONDS = 90;
const DEFAULT_OPS_WEEKLY_DIGEST_INTERVAL_MINUTES = 7 * 24 * 60;
const DEFAULT_OPS_WEEKLY_DIGEST_WINDOW_HOURS = 168;
const DEFAULT_OPS_WEEKLY_DIGEST_STARTUP_DELAY_SECONDS = 120;
const DEFAULT_OPS_WEEKLY_DIGEST_FAILURE_ALERT_THRESHOLD = 2;
const DEFAULT_OPS_WEEKLY_DIGEST_FAILURE_ALERT_COOLDOWN_MINUTES = 12 * 60;
const DEFAULT_OPS_WEEKLY_DIGEST_FORCE_RERUN_DELAY_MINUTES = 30;
const DEFAULT_OPS_WEEKLY_DIGEST_FORCE_RERUN_MAX_ATTEMPTS = 1;

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
    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off"
    ) {
      return false;
    }
  }
  return undefined;
}

function readEnv(name: string): string | undefined {
  return asTrimmedString(process.env[name]);
}

function readSeverity(
  value: unknown,
  fallback: "info" | "warning" | "critical",
): "info" | "warning" | "critical" {
  const normalized = asTrimmedString(value)?.toLowerCase();
  if (normalized === "info" || normalized === "warning" || normalized === "critical") {
    return normalized;
  }
  return fallback;
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
  const opsAutopublishConfig = asRecord(pluginConfig.opsAutopublish);
  const opsCanaryConfig = asRecord(pluginConfig.opsCanary);
  const opsWeeklyDigestConfig = asRecord(pluginConfig.opsWeeklyDigest);

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
  const opsAutopublishEnabled =
    asBoolean(opsAutopublishConfig.enabled) ??
    asBoolean(readEnv("ARI_OPS_AUTOPUBLISH_ENABLED")) ??
    false;
  const opsAutopublishIntervalMinutes =
    asPositiveInt(opsAutopublishConfig.intervalMinutes) ??
    asPositiveInt(readEnv("ARI_OPS_AUTOPUBLISH_INTERVAL_MINUTES")) ??
    DEFAULT_OPS_AUTOPUBLISH_INTERVAL_MINUTES;
  const opsAutopublishWindowHoursRaw =
    asPositiveInt(opsAutopublishConfig.windowHours) ??
    asPositiveInt(readEnv("ARI_OPS_AUTOPUBLISH_WINDOW_HOURS")) ??
    DEFAULT_OPS_AUTOPUBLISH_WINDOW_HOURS;
  const opsAutopublishWindowHours = Math.max(1, Math.min(168, opsAutopublishWindowHoursRaw));
  const opsAutopublishStartupDelaySeconds =
    asNonNegativeInt(opsAutopublishConfig.startupDelaySeconds) ??
    asNonNegativeInt(readEnv("ARI_OPS_AUTOPUBLISH_STARTUP_DELAY_SECONDS")) ??
    DEFAULT_OPS_AUTOPUBLISH_STARTUP_DELAY_SECONDS;
  const opsAutopublishForce =
    asBoolean(opsAutopublishConfig.force) ??
    asBoolean(readEnv("ARI_OPS_AUTOPUBLISH_FORCE")) ??
    false;
  const opsAutopublishBusinessUnit =
    asTrimmedString(opsAutopublishConfig.businessUnit) ??
    readEnv("ARI_OPS_AUTOPUBLISH_BUSINESS_UNIT") ??
    "operations";
  const opsAutopublishChannelId =
    normalizeChannelId(opsAutopublishConfig.channelId) ??
    normalizeChannelId(readEnv("ARI_OPS_AUTOPUBLISH_CHANNEL_ID"));
  const opsAutopublishFailureAlertThreshold =
    asPositiveInt(opsAutopublishConfig.failureAlertThreshold) ??
    asPositiveInt(readEnv("ARI_OPS_AUTOPUBLISH_FAILURE_ALERT_THRESHOLD")) ??
    DEFAULT_OPS_AUTOPUBLISH_FAILURE_ALERT_THRESHOLD;
  const opsAutopublishFailureAlertCooldownMinutes =
    asPositiveInt(opsAutopublishConfig.failureAlertCooldownMinutes) ??
    asPositiveInt(readEnv("ARI_OPS_AUTOPUBLISH_FAILURE_ALERT_COOLDOWN_MINUTES")) ??
    DEFAULT_OPS_AUTOPUBLISH_FAILURE_ALERT_COOLDOWN_MINUTES;
  const opsCanaryEnabled =
    asBoolean(opsCanaryConfig.enabled) ?? asBoolean(readEnv("ARI_OPS_CANARY_ENABLED")) ?? false;
  const opsCanaryIntervalMinutes =
    asPositiveInt(opsCanaryConfig.intervalMinutes) ??
    asPositiveInt(readEnv("ARI_OPS_CANARY_INTERVAL_MINUTES")) ??
    DEFAULT_OPS_CANARY_INTERVAL_MINUTES;
  const opsCanaryStartupDelaySeconds =
    asNonNegativeInt(opsCanaryConfig.startupDelaySeconds) ??
    asNonNegativeInt(readEnv("ARI_OPS_CANARY_STARTUP_DELAY_SECONDS")) ??
    DEFAULT_OPS_CANARY_STARTUP_DELAY_SECONDS;
  const opsCanarySeverity = readSeverity(
    asTrimmedString(opsCanaryConfig.severity) ?? readEnv("ARI_OPS_CANARY_SEVERITY"),
    "warning",
  );
  const opsCanarySource =
    asTrimmedString(opsCanaryConfig.source) ?? readEnv("ARI_OPS_CANARY_SOURCE") ?? "ops.canary";
  const opsCanaryMessage =
    asTrimmedString(opsCanaryConfig.message) ??
    readEnv("ARI_OPS_CANARY_MESSAGE") ??
    "synthetic canary escalation check";
  const opsCanaryBusinessUnit =
    asTrimmedString(opsCanaryConfig.businessUnit) ??
    readEnv("ARI_OPS_CANARY_BUSINESS_UNIT") ??
    "operations";
  const opsCanaryChannelId =
    normalizeChannelId(opsCanaryConfig.channelId) ??
    normalizeChannelId(readEnv("ARI_OPS_CANARY_CHANNEL_ID"));
  const opsWeeklyDigestEnabled =
    asBoolean(opsWeeklyDigestConfig.enabled) ??
    asBoolean(readEnv("ARI_OPS_WEEKLY_DIGEST_AUTOPUBLISH_ENABLED")) ??
    false;
  const opsWeeklyDigestIntervalMinutes =
    asPositiveInt(opsWeeklyDigestConfig.intervalMinutes) ??
    asPositiveInt(readEnv("ARI_OPS_WEEKLY_DIGEST_AUTOPUBLISH_INTERVAL_MINUTES")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_INTERVAL_MINUTES;
  const opsWeeklyDigestWindowHoursRaw =
    asPositiveInt(opsWeeklyDigestConfig.windowHours) ??
    asPositiveInt(readEnv("ARI_OPS_WEEKLY_DIGEST_AUTOPUBLISH_WINDOW_HOURS")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_WINDOW_HOURS;
  const opsWeeklyDigestWindowHours = Math.max(24, Math.min(24 * 28, opsWeeklyDigestWindowHoursRaw));
  const opsWeeklyDigestStartupDelaySeconds =
    asNonNegativeInt(opsWeeklyDigestConfig.startupDelaySeconds) ??
    asNonNegativeInt(readEnv("ARI_OPS_WEEKLY_DIGEST_AUTOPUBLISH_STARTUP_DELAY_SECONDS")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_STARTUP_DELAY_SECONDS;
  const opsWeeklyDigestFailureAlertThreshold =
    asPositiveInt(opsWeeklyDigestConfig.failureAlertThreshold) ??
    asPositiveInt(readEnv("ARI_OPS_WEEKLY_DIGEST_FAILURE_ALERT_THRESHOLD")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_FAILURE_ALERT_THRESHOLD;
  const opsWeeklyDigestFailureAlertCooldownMinutes =
    asPositiveInt(opsWeeklyDigestConfig.failureAlertCooldownMinutes) ??
    asPositiveInt(readEnv("ARI_OPS_WEEKLY_DIGEST_FAILURE_ALERT_COOLDOWN_MINUTES")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_FAILURE_ALERT_COOLDOWN_MINUTES;
  const opsWeeklyDigestForceRerunEnabled =
    asBoolean(opsWeeklyDigestConfig.forceRerunEnabled) ??
    asBoolean(readEnv("ARI_OPS_WEEKLY_DIGEST_FORCE_RERUN_ENABLED")) ??
    true;
  const opsWeeklyDigestForceRerunDelayMinutes =
    asPositiveInt(opsWeeklyDigestConfig.forceRerunDelayMinutes) ??
    asPositiveInt(readEnv("ARI_OPS_WEEKLY_DIGEST_FORCE_RERUN_DELAY_MINUTES")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_FORCE_RERUN_DELAY_MINUTES;
  const opsWeeklyDigestForceRerunMaxAttempts =
    asPositiveInt(opsWeeklyDigestConfig.forceRerunMaxAttempts) ??
    asPositiveInt(readEnv("ARI_OPS_WEEKLY_DIGEST_FORCE_RERUN_MAX_ATTEMPTS")) ??
    DEFAULT_OPS_WEEKLY_DIGEST_FORCE_RERUN_MAX_ATTEMPTS;
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
    opsAutopublish: {
      enabled: opsAutopublishEnabled,
      intervalMinutes: opsAutopublishIntervalMinutes,
      windowHours: opsAutopublishWindowHours,
      startupDelaySeconds: opsAutopublishStartupDelaySeconds,
      force: opsAutopublishForce,
      businessUnit: opsAutopublishBusinessUnit,
      channelId: opsAutopublishChannelId,
      failureAlertThreshold: opsAutopublishFailureAlertThreshold,
      failureAlertCooldownMinutes: opsAutopublishFailureAlertCooldownMinutes,
    },
    opsCanary: {
      enabled: opsCanaryEnabled,
      intervalMinutes: opsCanaryIntervalMinutes,
      startupDelaySeconds: opsCanaryStartupDelaySeconds,
      severity: opsCanarySeverity,
      source: opsCanarySource,
      message: opsCanaryMessage,
      businessUnit: opsCanaryBusinessUnit,
      channelId: opsCanaryChannelId,
    },
    opsWeeklyDigest: {
      enabled: opsWeeklyDigestEnabled,
      intervalMinutes: opsWeeklyDigestIntervalMinutes,
      windowHours: opsWeeklyDigestWindowHours,
      startupDelaySeconds: opsWeeklyDigestStartupDelaySeconds,
      failureAlertThreshold: opsWeeklyDigestFailureAlertThreshold,
      failureAlertCooldownMinutes: opsWeeklyDigestFailureAlertCooldownMinutes,
      forceRerunEnabled: opsWeeklyDigestForceRerunEnabled,
      forceRerunDelayMinutes: opsWeeklyDigestForceRerunDelayMinutes,
      forceRerunMaxAttempts: opsWeeklyDigestForceRerunMaxAttempts,
    },
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
  if (!resolved.opsAutopublish.channelId && resolved.statusChannels.size > 0) {
    const fallbackStatusChannel = Array.from(resolved.statusChannels)[0];
    resolved.opsAutopublish.channelId = fallbackStatusChannel;
  }
  if (!resolved.opsCanary.channelId && resolved.statusChannels.size > 0) {
    const fallbackStatusChannel = Array.from(resolved.statusChannels)[0];
    resolved.opsCanary.channelId = fallbackStatusChannel;
  }

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

export async function callAriPipelinesApi(params: {
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

export async function callAriPipelinesApiOnce(params: {
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

function parseWeeklyWindowHoursArg(args?: string): number {
  const parsed = Number((args ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return 168;
  }
  return Math.min(24 * 28, Math.max(24, Math.floor(parsed)));
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

function formatMinutes(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "n/a";
  }
  return `${Math.floor(numeric)}m`;
}

function readHoldReasons(value: unknown): {
  governanceHold: number;
  budgetHold: number;
  dataGap: number;
} {
  const record = asRecord(value);
  return {
    governanceHold: asNonNegativeInt(record.governanceHold) ?? 0,
    budgetHold: asNonNegativeInt(record.budgetHold) ?? 0,
    dataGap: asNonNegativeInt(record.dataGap) ?? 0,
  };
}

function formatHoldReasons(value: {
  governanceHold: number;
  budgetHold: number;
  dataGap: number;
}): string {
  return `${value.governanceHold}/${value.budgetHold}/${value.dataGap}`;
}

function parseOpsAutopublishArgs(args?: string): {
  action: "status" | "run";
  force?: boolean;
  windowHours?: number;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "status") {
    return { action: "status" };
  }

  if (tokens[0] !== "run") {
    return { action: "status" };
  }

  let force: boolean | undefined;
  let windowHours: number | undefined;
  for (const token of tokens.slice(1)) {
    if (token === "force" || token === "--force") {
      force = true;
      continue;
    }
    const parsed = Number(token);
    if (Number.isFinite(parsed) && parsed > 0) {
      windowHours = Math.min(168, Math.max(1, Math.floor(parsed)));
    }
  }

  return { action: "run", force, windowHours };
}

export function parseOpsAlertArgs(args?: string): {
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  businessUnit?: string;
  channel?: string;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let severity: "info" | "warning" | "critical" = "critical";
  let source = "operator.manual";
  let businessUnit: string | undefined;
  let channel: string | undefined;
  const messageTokens: string[] = [];

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    const normalized = token.toLowerCase();
    if (
      idx === 0 &&
      (normalized === "info" || normalized === "warning" || normalized === "critical")
    ) {
      severity = normalized;
      continue;
    }
    const eqIdx = token.indexOf("=");
    if (eqIdx > 0) {
      const key = token.slice(0, eqIdx).trim().toLowerCase();
      const value = token.slice(eqIdx + 1).trim();
      if (!value) {
        continue;
      }
      if (key === "source") {
        source = value;
        continue;
      }
      if (key === "bu" || key === "businessunit") {
        businessUnit = value;
        continue;
      }
      if (key === "channel") {
        channel = value;
        continue;
      }
    }
    messageTokens.push(token);
  }

  return {
    severity,
    source,
    message: messageTokens.join(" ").trim() || "manual escalation",
    businessUnit,
    channel,
  };
}

export function parseOpsAckArgs(args?: string): {
  source: string;
  reason: string;
  scope: "canary" | "general";
  businessUnit?: string;
  channel?: string;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  let source = "ops.canary";
  let scope: "canary" | "general" = "canary";
  let businessUnit: string | undefined;
  let channel: string | undefined;
  const reasonTokens: string[] = [];

  for (const token of tokens) {
    const eqIdx = token.indexOf("=");
    if (eqIdx > 0) {
      const key = token.slice(0, eqIdx).trim().toLowerCase();
      const value = token.slice(eqIdx + 1).trim();
      if (!value) {
        continue;
      }
      if (key === "source") {
        source = value;
        continue;
      }
      if (key === "scope") {
        scope = value.toLowerCase() === "general" ? "general" : "canary";
        continue;
      }
      if (key === "bu" || key === "businessunit") {
        businessUnit = value;
        continue;
      }
      if (key === "channel") {
        channel = value;
        continue;
      }
    }
    reasonTokens.push(token);
  }

  return {
    source,
    reason: reasonTokens.join(" ").trim() || "manual canary acknowledgment",
    scope,
    businessUnit,
    channel,
  };
}

export function parseOpsCanaryArgs(args?: string): {
  action: "status" | "run";
  severity?: "info" | "warning" | "critical";
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "status") {
    return { action: "status" };
  }
  if (tokens[0] !== "run") {
    return { action: "status" };
  }
  const severity = readSeverity(tokens[1], "warning");
  return { action: "run", severity };
}

function parseOpsWeeklyDigestSchedulerArgs(args?: string): {
  action: "status" | "run";
  windowHours?: number;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0 || tokens[0] === "status") {
    return { action: "status" };
  }
  if (tokens[0] !== "run") {
    return { action: "status" };
  }
  let windowHours: number | undefined;
  const rawWindow = Number(tokens[1]);
  if (Number.isFinite(rawWindow) && rawWindow > 0) {
    windowHours = Math.max(24, Math.min(24 * 28, Math.floor(rawWindow)));
  }
  return { action: "run", windowHours };
}

export function parseOpsWeeklyOverrideArgs(args?: string): {
  windowHours: number;
  reason?: string;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  let windowHours = 168;
  const reasonTokens: string[] = [];

  const parseWindowHours = (value: string): number | undefined => {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) {
      return undefined;
    }
    return Math.max(24, Math.min(24 * 28, Math.floor(raw)));
  };

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    const lower = token.toLowerCase();
    if (idx === 0) {
      const parsedLeading = parseWindowHours(token);
      if (parsedLeading !== undefined && tokens.length > 1) {
        windowHours = parsedLeading;
        continue;
      }
    }
    if (lower.startsWith("window=")) {
      const parsedWindow = parseWindowHours(token.slice("window=".length));
      if (parsedWindow !== undefined) {
        windowHours = parsedWindow;
        continue;
      }
    }
    reasonTokens.push(token);
  }

  const reason = reasonTokens.join(" ").trim() || undefined;
  return { windowHours, reason };
}

type OpsAutopublishController = {
  start: () => void;
  stop: () => void;
  runNow: (params?: { force?: boolean; windowHours?: number; trigger?: string }) => Promise<void>;
  getStatus: () => OpsAutopublishStatus;
};

type OpsCanaryController = {
  start: () => void;
  stop: () => void;
  runNow: (params?: {
    trigger?: string;
    severity?: "info" | "warning" | "critical";
  }) => Promise<void>;
  getStatus: () => OpsCanaryStatus;
};

type OpsWeeklyDigestController = {
  start: () => void;
  stop: () => void;
  runNow: (params?: { trigger?: string; windowHours?: number }) => Promise<void>;
  getStatus: () => OpsWeeklyDigestStatus;
};

function createOpsAutopublishController(runtime: BridgeRuntimeConfig): OpsAutopublishController {
  const status: OpsAutopublishStatus = {
    enabled: runtime.opsAutopublish.enabled,
    active: false,
    inFlight: false,
    intervalMinutes: runtime.opsAutopublish.intervalMinutes,
    windowHours: runtime.opsAutopublish.windowHours,
    startupDelaySeconds: runtime.opsAutopublish.startupDelaySeconds,
    force: runtime.opsAutopublish.force,
    businessUnit: runtime.opsAutopublish.businessUnit,
    channelId: runtime.opsAutopublish.channelId,
    failureAlertThreshold: runtime.opsAutopublish.failureAlertThreshold,
    failureAlertCooldownMinutes: runtime.opsAutopublish.failureAlertCooldownMinutes,
    totalRuns: 0,
    totalPublished: 0,
    totalSkipped: 0,
    totalFailures: 0,
    consecutiveFailures: 0,
    escalationCount: 0,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    status.nextRunAt = undefined;
  };

  const scheduleNext = (delayMs: number) => {
    if (stopped || !status.enabled) {
      return;
    }
    const safeDelayMs = Math.max(1_000, Math.floor(delayMs));
    clearTimer();
    status.nextRunAt = new Date(Date.now() + safeDelayMs).toISOString();
    timer = setTimeout(() => {
      void runNow({ trigger: "interval" });
    }, safeDelayMs);
  };

  const maybeEscalateFailure = (reason: string) => {
    if (status.failureAlertThreshold <= 0) {
      return;
    }
    if (status.consecutiveFailures < status.failureAlertThreshold) {
      return;
    }
    const nowMs = Date.now();
    const cooldownMs = Math.max(1, status.failureAlertCooldownMinutes) * 60_000;
    const lastEscalatedMs = status.lastEscalatedAt ? new Date(status.lastEscalatedAt).getTime() : 0;
    if (
      Number.isFinite(lastEscalatedMs) &&
      lastEscalatedMs > 0 &&
      nowMs - lastEscalatedMs < cooldownMs
    ) {
      return;
    }
    status.lastEscalatedAt = new Date(nowMs).toISOString();
    status.escalationCount += 1;
    runtime.logger.error(
      `[ari-autonomous] ops dashboard autopublish escalation: consecutiveFailures=${status.consecutiveFailures} threshold=${status.failureAlertThreshold} reason=${reason}`,
    );
    const alertMessage = [
      `autopublish escalation after ${status.consecutiveFailures} consecutive failures`,
      `reason=${reason}`,
      `window=${status.windowHours}h`,
      `interval=${status.intervalMinutes}m`,
      status.lastHoldSummary ? `holds=${status.lastHoldSummary}` : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | ");
    void callAriPipelinesApi({
      runtime,
      method: "POST",
      path: "/api/ops/alerts/escalate",
      body: {
        source: "ari-autonomous.ops-autopublish",
        severity: "critical",
        message: alertMessage,
        metadata: {
          businessUnit: status.businessUnit,
          channel: status.channelId ?? null,
          consecutiveFailures: status.consecutiveFailures,
          threshold: status.failureAlertThreshold,
          cooldownMinutes: status.failureAlertCooldownMinutes,
          lastError: reason,
          lastRunAt: status.lastRunAt ?? null,
          lastCompletedAt: status.lastCompletedAt ?? null,
          p1HoldReasons: status.lastP1HoldReasons ?? null,
          p2HoldReasons: status.lastP2HoldReasons ?? null,
        },
      },
    }).then((alertResult) => {
      if (!alertResult.ok) {
        runtime.logger.warn(
          `[ari-autonomous] ops dashboard escalation alert send failed: ${alertResult.error ?? "unknown error"}`,
        );
      }
    });
  };

  const runNow = async (params?: {
    force?: boolean;
    windowHours?: number;
    trigger?: string;
  }): Promise<void> => {
    const manualTrigger = (params?.trigger ?? "").startsWith("manual");
    if (status.inFlight) {
      return;
    }
    if ((!status.enabled || stopped) && !manualTrigger) {
      return;
    }

    clearTimer();
    status.inFlight = true;
    status.lastTrigger = params?.trigger ?? "manual";
    status.lastRunAt = new Date().toISOString();
    status.totalRuns += 1;
    const force = params?.force ?? status.force;
    const windowHours = params?.windowHours ?? status.windowHours;

    try {
      const result = await callAriPipelinesApi({
        runtime,
        method: "POST",
        path: "/api/ops/dashboard/publish",
        body: { windowHours, force },
      });

      status.lastCompletedAt = new Date().toISOString();

      if (!result.ok) {
        status.totalFailures += 1;
        status.consecutiveFailures += 1;
        status.lastPublishError = result.error ?? "request_failed";
        status.lastPublishStatus = result.status;
        runtime.logger.warn(
          `[ari-autonomous] ops dashboard autopublish failed: ${status.lastPublishError}`,
        );
        maybeEscalateFailure(status.lastPublishError);
      } else {
        const payload = asRecord(result.data);
        const published = payload.published === true;
        const publishError = asTrimmedString(payload.publishError);
        const publishStatus = asPositiveInt(payload.publishStatus);
        const snapshot = asRecord(payload.snapshot);
        const queues = asRecord(snapshot.queues);
        const p1Queue = asRecord(queues.p1);
        const p2Queue = asRecord(queues.p2);
        const p1Holds = readHoldReasons(p1Queue.holdReasons);
        const p2Holds = readHoldReasons(p2Queue.holdReasons);
        status.lastP1HoldReasons = p1Holds;
        status.lastP2HoldReasons = p2Holds;
        status.lastHoldSummary = `p1(gov/budget/dataGap)=${formatHoldReasons(p1Holds)} p2=${formatHoldReasons(p2Holds)}`;
        status.lastGatePassed = payload.gatePassed === true;
        status.lastPublishError = publishError;
        status.lastPublishStatus = publishStatus;

        if (published) {
          status.totalPublished += 1;
          status.consecutiveFailures = 0;
          status.lastPublishedAt = status.lastCompletedAt;
          runtime.logger.info("[ari-autonomous] ops dashboard autopublish succeeded");
        } else {
          status.totalSkipped += 1;
          if (publishError && publishError !== "publish_skipped_by_gate") {
            status.totalFailures += 1;
            status.consecutiveFailures += 1;
            runtime.logger.warn(
              `[ari-autonomous] ops dashboard autopublish skipped with error: ${publishError}`,
            );
            maybeEscalateFailure(publishError);
          } else {
            status.consecutiveFailures = 0;
            runtime.logger.info("[ari-autonomous] ops dashboard autopublish skipped by gate");
          }
        }
      }
    } catch (error) {
      status.totalFailures += 1;
      status.consecutiveFailures += 1;
      status.lastCompletedAt = new Date().toISOString();
      status.lastPublishError =
        error instanceof Error && error.message ? error.message : "unexpected_error";
      runtime.logger.warn(
        `[ari-autonomous] ops dashboard autopublish crashed: ${status.lastPublishError}`,
      );
      maybeEscalateFailure(status.lastPublishError);
    } finally {
      status.inFlight = false;
      if (!stopped && status.enabled) {
        scheduleNext(status.intervalMinutes * 60_000);
      }
    }
  };

  return {
    start: () => {
      if (!status.enabled) {
        runtime.logger.info("[ari-autonomous] ops dashboard autopublish disabled");
        return;
      }
      if (!stopped) {
        return;
      }
      stopped = false;
      status.active = true;
      const delayMs = Math.max(0, status.startupDelaySeconds * 1_000);
      if (delayMs === 0) {
        void runNow({ trigger: "startup" });
      } else {
        scheduleNext(delayMs);
      }
      runtime.logger.info(
        `[ari-autonomous] ops dashboard autopublish started interval=${status.intervalMinutes}m window=${status.windowHours}h force=${String(status.force)}`,
      );
    },
    stop: () => {
      stopped = true;
      status.active = false;
      status.inFlight = false;
      clearTimer();
      runtime.logger.info("[ari-autonomous] ops dashboard autopublish stopped");
    },
    runNow: async (params) => runNow(params),
    getStatus: () => ({ ...status }),
  };
}

function createOpsCanaryController(runtime: BridgeRuntimeConfig): OpsCanaryController {
  const status: OpsCanaryStatus = {
    enabled: runtime.opsCanary.enabled,
    active: false,
    inFlight: false,
    intervalMinutes: runtime.opsCanary.intervalMinutes,
    startupDelaySeconds: runtime.opsCanary.startupDelaySeconds,
    severity: runtime.opsCanary.severity,
    source: runtime.opsCanary.source,
    message: runtime.opsCanary.message,
    businessUnit: runtime.opsCanary.businessUnit,
    channelId: runtime.opsCanary.channelId,
    totalRuns: 0,
    totalSent: 0,
    totalFailures: 0,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    status.nextRunAt = undefined;
  };

  const scheduleNext = (delayMs: number) => {
    if (stopped || !status.enabled) {
      return;
    }
    const safeDelayMs = Math.max(1_000, Math.floor(delayMs));
    clearTimer();
    status.nextRunAt = new Date(Date.now() + safeDelayMs).toISOString();
    timer = setTimeout(() => {
      void runNow({ trigger: "interval" });
    }, safeDelayMs);
  };

  const runNow = async (params?: {
    trigger?: string;
    severity?: "info" | "warning" | "critical";
  }): Promise<void> => {
    const manualTrigger = (params?.trigger ?? "").startsWith("manual");
    if (status.inFlight) {
      return;
    }
    if ((!status.enabled || stopped) && !manualTrigger) {
      return;
    }

    clearTimer();
    status.inFlight = true;
    status.lastTrigger = params?.trigger ?? "manual";
    status.lastRunAt = new Date().toISOString();
    status.totalRuns += 1;
    const severity = params?.severity ?? status.severity;

    try {
      const result = await callAriPipelinesApi({
        runtime,
        method: "POST",
        path: "/api/ops/alerts/escalate",
        body: {
          severity,
          source: status.source,
          message: status.message,
          metadata: {
            triggeredBy: "canary-scheduler",
            businessUnit: status.businessUnit,
            channel: status.channelId ?? null,
          },
        },
      });
      status.lastCompletedAt = new Date().toISOString();
      if (!result.ok) {
        status.totalFailures += 1;
        status.lastError = result.error ?? "request_failed";
        runtime.logger.warn(`[ari-autonomous] ops canary failed: ${status.lastError}`);
      } else {
        const payload = asRecord(result.data);
        if (payload.sent === true) {
          status.totalSent += 1;
          status.lastSentAt = status.lastCompletedAt;
          status.lastError = undefined;
          runtime.logger.info("[ari-autonomous] ops canary sent");
        } else {
          status.lastError = asTrimmedString(payload.error) ?? "canary_not_sent";
          runtime.logger.warn(`[ari-autonomous] ops canary not sent: ${status.lastError}`);
        }
      }
    } catch (error) {
      status.totalFailures += 1;
      status.lastCompletedAt = new Date().toISOString();
      status.lastError =
        error instanceof Error && error.message ? error.message : "unexpected_error";
      runtime.logger.warn(`[ari-autonomous] ops canary crashed: ${status.lastError}`);
    } finally {
      status.inFlight = false;
      if (!stopped && status.enabled) {
        scheduleNext(status.intervalMinutes * 60_000);
      }
    }
  };

  return {
    start: () => {
      if (!status.enabled) {
        runtime.logger.info("[ari-autonomous] ops canary disabled");
        return;
      }
      if (!stopped) {
        return;
      }
      stopped = false;
      status.active = true;
      const delayMs = Math.max(0, status.startupDelaySeconds * 1_000);
      if (delayMs === 0) {
        void runNow({ trigger: "startup" });
      } else {
        scheduleNext(delayMs);
      }
      runtime.logger.info(
        `[ari-autonomous] ops canary started interval=${status.intervalMinutes}m severity=${status.severity}`,
      );
    },
    stop: () => {
      stopped = true;
      status.active = false;
      status.inFlight = false;
      clearTimer();
      runtime.logger.info("[ari-autonomous] ops canary stopped");
    },
    runNow: async (params) => runNow(params),
    getStatus: () => ({ ...status }),
  };
}

function createOpsWeeklyDigestController(runtime: BridgeRuntimeConfig): OpsWeeklyDigestController {
  const status: OpsWeeklyDigestStatus = {
    enabled: runtime.opsWeeklyDigest.enabled,
    active: false,
    inFlight: false,
    intervalMinutes: runtime.opsWeeklyDigest.intervalMinutes,
    windowHours: runtime.opsWeeklyDigest.windowHours,
    startupDelaySeconds: runtime.opsWeeklyDigest.startupDelaySeconds,
    failureAlertThreshold: runtime.opsWeeklyDigest.failureAlertThreshold,
    failureAlertCooldownMinutes: runtime.opsWeeklyDigest.failureAlertCooldownMinutes,
    forceRerunEnabled: runtime.opsWeeklyDigest.forceRerunEnabled,
    forceRerunDelayMinutes: runtime.opsWeeklyDigest.forceRerunDelayMinutes,
    forceRerunMaxAttempts: runtime.opsWeeklyDigest.forceRerunMaxAttempts,
    forceRerunPending: false,
    forceRerunAttempts: 0,
    totalRuns: 0,
    totalPublished: 0,
    totalFailures: 0,
    consecutiveFailures: 0,
    escalationCount: 0,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    status.nextRunAt = undefined;
  };

  const scheduleNext = (delayMs: number, trigger: "interval" | "force-rerun" = "interval") => {
    if (stopped || !status.enabled) {
      return;
    }
    const safeDelayMs = Math.max(1_000, Math.floor(delayMs));
    clearTimer();
    status.nextRunAt = new Date(Date.now() + safeDelayMs).toISOString();
    timer = setTimeout(() => {
      void runNow({ trigger });
    }, safeDelayMs);
  };

  const maybeEscalateFailure = (reason: string) => {
    if (status.failureAlertThreshold <= 0) {
      return;
    }
    if (status.consecutiveFailures < status.failureAlertThreshold) {
      return;
    }
    const nowMs = Date.now();
    const cooldownMs = Math.max(1, status.failureAlertCooldownMinutes) * 60_000;
    const lastEscalatedMs = status.lastEscalatedAt ? new Date(status.lastEscalatedAt).getTime() : 0;
    if (
      Number.isFinite(lastEscalatedMs) &&
      lastEscalatedMs > 0 &&
      nowMs - lastEscalatedMs < cooldownMs
    ) {
      return;
    }
    status.lastEscalatedAt = new Date(nowMs).toISOString();
    status.escalationCount += 1;
    runtime.logger.error(
      `[ari-autonomous] ops weekly digest escalation: consecutiveFailures=${status.consecutiveFailures} threshold=${status.failureAlertThreshold} reason=${reason}`,
    );
    void callAriPipelinesApi({
      runtime,
      method: "POST",
      path: "/api/ops/alerts/escalate",
      body: {
        source: "ari-autonomous.ops-weekly-digest",
        severity: "critical",
        message: [
          `weekly digest publish escalation after ${status.consecutiveFailures} consecutive failures`,
          `reason=${reason}`,
          `window=${status.windowHours}h`,
          `interval=${status.intervalMinutes}m`,
        ].join(" | "),
        metadata: {
          businessUnit: "operations",
          consecutiveFailures: status.consecutiveFailures,
          threshold: status.failureAlertThreshold,
          cooldownMinutes: status.failureAlertCooldownMinutes,
          forceRerunEnabled: status.forceRerunEnabled,
          forceRerunDelayMinutes: status.forceRerunDelayMinutes,
          forceRerunMaxAttempts: status.forceRerunMaxAttempts,
          forceRerunAttempts: status.forceRerunAttempts,
          forceRerunPending: status.forceRerunPending,
          lastError: reason,
          lastRunAt: status.lastRunAt ?? null,
          lastCompletedAt: status.lastCompletedAt ?? null,
          lastPublishedAt: status.lastPublishedAt ?? null,
        },
      },
    }).then((alertResult) => {
      if (!alertResult.ok) {
        runtime.logger.warn(
          `[ari-autonomous] ops weekly digest escalation alert send failed: ${alertResult.error ?? "unknown error"}`,
        );
      }
    });
  };

  const maybeScheduleForceRerun = (reason: string): boolean => {
    if (!status.forceRerunEnabled || status.forceRerunMaxAttempts <= 0) {
      status.forceRerunPending = false;
      return false;
    }
    if (status.forceRerunAttempts >= status.forceRerunMaxAttempts) {
      status.forceRerunPending = false;
      runtime.logger.warn(
        `[ari-autonomous] ops weekly digest force rerun exhausted: attempts=${status.forceRerunAttempts} max=${status.forceRerunMaxAttempts} reason=${reason}`,
      );
      return false;
    }
    status.forceRerunAttempts += 1;
    status.forceRerunPending = true;
    const delayMs = Math.max(1, status.forceRerunDelayMinutes) * 60_000;
    runtime.logger.warn(
      `[ari-autonomous] ops weekly digest scheduling force rerun attempt=${status.forceRerunAttempts}/${status.forceRerunMaxAttempts} in ${status.forceRerunDelayMinutes}m reason=${reason}`,
    );
    scheduleNext(delayMs, "force-rerun");
    return true;
  };

  const runNow = async (params?: { trigger?: string; windowHours?: number }): Promise<void> => {
    const trigger = params?.trigger ?? "manual";
    const manualTrigger = trigger.startsWith("manual");
    const forceRerunTrigger = trigger === "force-rerun";
    if (status.inFlight) {
      return;
    }
    if ((!status.enabled || stopped) && !manualTrigger) {
      return;
    }

    clearTimer();
    status.inFlight = true;
    status.lastTrigger = trigger;
    status.lastRunAt = new Date().toISOString();
    if (forceRerunTrigger) {
      status.forceRerunPending = false;
      status.lastForcedRerunAt = status.lastRunAt;
    } else {
      status.forceRerunPending = false;
      status.forceRerunAttempts = 0;
    }
    status.totalRuns += 1;
    let forceRerunScheduled = false;
    const windowHours =
      typeof params?.windowHours === "number" && Number.isFinite(params.windowHours)
        ? Math.max(24, Math.min(24 * 28, Math.floor(params.windowHours)))
        : status.windowHours;

    try {
      const result = await callAriPipelinesApi({
        runtime,
        method: "POST",
        path: "/api/ops/digest/weekly/publish",
        body: {
          windowHours,
        },
      });
      status.lastCompletedAt = new Date().toISOString();
      if (!result.ok) {
        status.totalFailures += 1;
        status.consecutiveFailures += 1;
        status.lastError = result.error ?? "request_failed";
        status.lastPublishStatus = result.status;
        runtime.logger.warn(
          `[ari-autonomous] ops weekly digest publish failed: ${status.lastError}`,
        );
        maybeEscalateFailure(status.lastError);
        forceRerunScheduled = maybeScheduleForceRerun(status.lastError);
      } else {
        const payload = asRecord(result.data);
        status.lastPublishStatus = asPositiveInt(payload.publishStatus) ?? undefined;
        if (payload.published === true) {
          status.totalPublished += 1;
          status.consecutiveFailures = 0;
          status.forceRerunPending = false;
          status.forceRerunAttempts = 0;
          status.lastPublishedAt = status.lastCompletedAt;
          status.lastError = undefined;
          runtime.logger.info("[ari-autonomous] ops weekly digest published");
        } else {
          status.lastError = asTrimmedString(payload.publishError) ?? "weekly_publish_not_sent";
          if (status.lastError !== "webhook_not_configured") {
            status.totalFailures += 1;
            status.consecutiveFailures += 1;
            maybeEscalateFailure(status.lastError);
            forceRerunScheduled = maybeScheduleForceRerun(status.lastError);
          } else {
            status.consecutiveFailures = 0;
            status.forceRerunPending = false;
          }
          runtime.logger.warn(
            `[ari-autonomous] ops weekly digest publish skipped: ${status.lastError}`,
          );
        }
      }
    } catch (error) {
      status.totalFailures += 1;
      status.consecutiveFailures += 1;
      status.lastCompletedAt = new Date().toISOString();
      status.lastError =
        error instanceof Error && error.message ? error.message : "unexpected_error";
      runtime.logger.warn(
        `[ari-autonomous] ops weekly digest scheduler crashed: ${status.lastError}`,
      );
      maybeEscalateFailure(status.lastError);
      forceRerunScheduled = maybeScheduleForceRerun(status.lastError);
    } finally {
      status.inFlight = false;
      if (!stopped && status.enabled && !forceRerunScheduled) {
        scheduleNext(status.intervalMinutes * 60_000);
      }
    }
  };

  return {
    start: () => {
      if (!status.enabled) {
        runtime.logger.info("[ari-autonomous] ops weekly digest scheduler disabled");
        return;
      }
      if (!stopped) {
        return;
      }
      stopped = false;
      status.active = true;
      const delayMs = Math.max(0, status.startupDelaySeconds * 1_000);
      if (delayMs === 0) {
        void runNow({ trigger: "startup" });
      } else {
        scheduleNext(delayMs);
      }
      runtime.logger.info(
        `[ari-autonomous] ops weekly digest scheduler started interval=${status.intervalMinutes}m window=${status.windowHours}h`,
      );
    },
    stop: () => {
      stopped = true;
      status.active = false;
      status.inFlight = false;
      clearTimer();
      runtime.logger.info("[ari-autonomous] ops weekly digest scheduler stopped");
    },
    runNow: async (params) => runNow(params),
    getStatus: () => ({ ...status }),
  };
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

export function parseP2FeedbackArgs(args?: string): {
  outreachId?: string;
  outcome: "won" | "meeting_booked" | "lost" | "no_response";
  notes?: string;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return {
      outreachId: undefined,
      outcome: "no_response",
      notes: undefined,
    };
  }

  const outreachId = tokens[0];
  const outcomeToken = tokens[1]?.toLowerCase();
  const outcome =
    outcomeToken === "won" ||
    outcomeToken === "meeting_booked" ||
    outcomeToken === "lost" ||
    outcomeToken === "no_response"
      ? outcomeToken
      : "no_response";
  const notesTokens = outcomeToken === outcome ? tokens.slice(2) : tokens.slice(1);
  const notes = notesTokens.join(" ").trim() || undefined;
  return {
    outreachId,
    outcome,
    notes,
  };
}

export function parseP2FeedbackStatsArgs(args?: string): {
  windowDays: number;
  segmentLimit: number;
} {
  const tokens = (args ?? "")
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const toBoundedInt = (
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number => {
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.floor(parsed)));
  };

  return {
    windowDays: toBoundedInt(tokens[0], 30, 7, 90),
    segmentLimit: toBoundedInt(tokens[1], 10, 1, 25),
  };
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
  const p1Holds = asRecord(p1.holdReasons);
  const p2Holds = asRecord(p2.holdReasons);
  const thresholds = asRecord(payload.thresholds);

  return asReply([
    "ARI queue summary",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"}`,
    `p1: total=${formatNumber(p1.total, 0)} pending=${formatNumber(p1.pendingApproval, 0)} stale=${formatNumber(p1.stalePending, 0)} high=${formatNumber(p1.highPriorityPending, 0)} approved=${formatNumber(p1.approved, 0)} rejected=${formatNumber(p1.rejected, 0)} oldestPendingMin=${formatNumber(p1.oldestPendingMinutes, 0)} holds(gov/budget/dataGap)=${formatNumber(p1Holds.governanceHold, 0)}/${formatNumber(p1Holds.budgetHold, 0)}/${formatNumber(p1Holds.dataGap, 0)}`,
    `p2: total=${formatNumber(p2.total, 0)} draft=${formatNumber(p2.draft, 0)} stale=${formatNumber(p2.staleDraft, 0)} high=${formatNumber(p2.highPriorityPending, 0)} queued=${formatNumber(p2.queued, 0)} approved=${formatNumber(p2.approved, 0)} sent=${formatNumber(p2.sent, 0)} rejected=${formatNumber(p2.rejected, 0)} oldestDraftMin=${formatNumber(p2.oldestDraftMinutes, 0)} holds(gov/budget/dataGap)=${formatNumber(p2Holds.governanceHold, 0)}/${formatNumber(p2Holds.budgetHold, 0)}/${formatNumber(p2Holds.dataGap, 0)}`,
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
  const canary = asRecord(payload.canary);
  const escalationDigest = asRecord(payload.escalationDigest);
  const adapters = asRecord(payload.adapters);
  const thresholds = asRecord(payload.thresholds);
  const thresholdProviders = asRecord(thresholds.adapterProviders);
  const thresholdX = asRecord(thresholdProviders.x);
  const thresholdReddit = asRecord(thresholdProviders.reddit);
  const thresholdYouTube = asRecord(thresholdProviders.youtube);
  const thresholdEbay = asRecord(thresholdProviders.ebay);
  const adapterProviders = asRecord(adapters.providers);
  const adapterX = asRecord(adapterProviders.x);
  const adapterReddit = asRecord(adapterProviders.reddit);
  const adapterYouTube = asRecord(adapterProviders.youtube);
  const adapterEbay = asRecord(adapterProviders.ebay);
  const budget = asRecord(payload.budget);
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

  const lines = [
    "ARI ops SLA",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)}`,
    `p1: runs=${formatNumber(p1.totalRuns, 0)} successRate=${formatNumber(p1.successRate, 3)} avgDurationSec=${formatNumber(Number(p1.averageDurationMs) / 1000, 1)} avgCostUsd=${formatNumber(p1.averageCostUsd, 3)}`,
    `p2: runs=${formatNumber(p2.totalRuns, 0)} successRate=${formatNumber(p2.successRate, 3)} avgDurationSec=${formatNumber(Number(p2.averageDurationMs) / 1000, 1)} avgCostUsd=${formatNumber(p2.averageCostUsd, 3)}`,
    `adapters: requests=${formatNumber(adapters.totalRequests, 0)} failed=${formatNumber(adapters.failedRequests, 0)} retryRate=${formatNumber(adapters.retryRate, 3)} failureRate=${formatNumber(adapters.failureRate, 3)} avgAttempts=${formatNumber(adapters.averageAttempts, 3)}`,
    `adapterProviderRetryRate x/reddit/youtube/ebay=${formatNumber(adapterX.retryRate, 3)}/${formatNumber(adapterReddit.retryRate, 3)}/${formatNumber(adapterYouTube.retryRate, 3)}/${formatNumber(adapterEbay.retryRate, 3)}`,
    `thresholds success<${formatNumber(thresholds.successRateWarning, 3)} queueHigh>=${formatNumber(thresholds.queueHighPriorityPendingWarning, 0)} adapterRetry>=${formatNumber(thresholds.adapterRetryRateWarning, 3)} adapterFailureWarn/Crit>=${formatNumber(thresholds.adapterFailureRateWarning, 3)}/${formatNumber(thresholds.adapterFailureRateCritical, 3)}`,
    `thresholdProviderRetryWarn x/reddit/youtube/ebay=${formatNumber(thresholdX.retryRateWarning, 3)}/${formatNumber(thresholdReddit.retryRateWarning, 3)}/${formatNumber(thresholdYouTube.retryRateWarning, 3)}/${formatNumber(thresholdEbay.retryRateWarning, 3)}`,
    `canary: runs=${formatNumber(canary.totalRuns, 0)} notified=${formatNumber(canary.notifiedRuns, 0)} sent=${formatNumber(canary.sentRuns, 0)} failed=${formatNumber(canary.failedRuns, 0)} ackCount=${formatNumber(canary.ackCount, 0)} sendRate=${formatNumber(canary.sendRate, 3)} failureRate=${formatNumber(canary.failureRate, 3)}`,
    `digest: events=${formatNumber(escalationDigest.totalEvents, 0)} sent=${formatNumber(escalationDigest.sentEvents, 0)} failed=${formatNumber(escalationDigest.failedEvents, 0)} suppressed=${formatNumber(escalationDigest.suppressedEvents, 0)}`,
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
  const canary = asRecord(snapshot.canary);
  const escalationDigest = asRecord(snapshot.escalationDigest);
  const adapters = asRecord(snapshot.adapters);
  const thresholds = asRecord(snapshot.thresholds);
  const thresholdProviders = asRecord(thresholds.adapterProviders);
  const thresholdX = asRecord(thresholdProviders.x);
  const thresholdReddit = asRecord(thresholdProviders.reddit);
  const thresholdYouTube = asRecord(thresholdProviders.youtube);
  const thresholdEbay = asRecord(thresholdProviders.ebay);
  const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts.length : 0;

  return asReply([
    "ARI ops dashboard build complete",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)}`,
    `artifactPath: ${asTrimmedString(payload.artifactPath) ?? "n/a"}`,
    `p1Runs=${formatNumber(p1.totalRuns, 0)} p1SuccessRate=${formatNumber(p1.successRate, 3)} p2Runs=${formatNumber(p2.totalRuns, 0)} p2SuccessRate=${formatNumber(p2.successRate, 3)}`,
    `adapters requests=${formatNumber(adapters.totalRequests, 0)} failed=${formatNumber(adapters.failedRequests, 0)} retryRate=${formatNumber(adapters.retryRate, 3)} failureRate=${formatNumber(adapters.failureRate, 3)}`,
    `thresholds success<${formatNumber(thresholds.successRateWarning, 3)} queueHigh>=${formatNumber(thresholds.queueHighPriorityPendingWarning, 0)} adapterRetry>=${formatNumber(thresholds.adapterRetryRateWarning, 3)}`,
    `thresholdProviderRetryWarn x/reddit/youtube/ebay=${formatNumber(thresholdX.retryRateWarning, 3)}/${formatNumber(thresholdReddit.retryRateWarning, 3)}/${formatNumber(thresholdYouTube.retryRateWarning, 3)}/${formatNumber(thresholdEbay.retryRateWarning, 3)}`,
    `canaryRuns=${formatNumber(canary.totalRuns, 0)} canaryFailed=${formatNumber(canary.failedRuns, 0)} canaryAcks=${formatNumber(canary.ackCount, 0)} canarySendRate=${formatNumber(canary.sendRate, 3)}`,
    `digestEvents=${formatNumber(escalationDigest.totalEvents, 0)} digestSent=${formatNumber(escalationDigest.sentEvents, 0)} digestFailed=${formatNumber(escalationDigest.failedEvents, 0)}`,
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
  const snapshot = asRecord(payload.snapshot);
  const queues = asRecord(snapshot.queues);
  const p1Queue = asRecord(queues.p1);
  const p2Queue = asRecord(queues.p2);
  const p1Holds = asRecord(p1Queue.holdReasons);
  const p2Holds = asRecord(p2Queue.holdReasons);
  const canary = asRecord(snapshot.canary);
  const escalationDigest = asRecord(snapshot.escalationDigest);
  const adapters = asRecord(snapshot.adapters);
  const thresholds = asRecord(snapshot.thresholds);
  const thresholdProviders = asRecord(thresholds.adapterProviders);
  const thresholdX = asRecord(thresholdProviders.x);
  const thresholdReddit = asRecord(thresholdProviders.reddit);
  const thresholdYouTube = asRecord(thresholdProviders.youtube);
  const thresholdEbay = asRecord(thresholdProviders.ebay);
  const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts.length : 0;
  return asReply([
    "ARI ops dashboard publish",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)} | force=${String(parsed.force)}`,
    `artifactPath: ${asTrimmedString(payload.artifactPath) ?? "n/a"}`,
    `gateApplied: ${String(gateApplied)} gatePassed: ${String(gatePassed)} gateReason: ${asTrimmedString(payload.gateReason) ?? "none"}`,
    `webhookConfigured: ${String(webhookConfigured)}`,
    `published: ${String(published)}`,
    `status: ${formatNumber(payload.publishStatus, 0)} error: ${asTrimmedString(payload.publishError) ?? "none"}`,
    `adapters requests/failed/retryRate/failureRate=${formatNumber(adapters.totalRequests, 0)}/${formatNumber(adapters.failedRequests, 0)}/${formatNumber(adapters.retryRate, 3)}/${formatNumber(adapters.failureRate, 3)}`,
    `thresholds success<${formatNumber(thresholds.successRateWarning, 3)} queueHigh>=${formatNumber(thresholds.queueHighPriorityPendingWarning, 0)} adapterRetry>=${formatNumber(thresholds.adapterRetryRateWarning, 3)}`,
    `thresholdProviderRetryWarn x/reddit/youtube/ebay=${formatNumber(thresholdX.retryRateWarning, 3)}/${formatNumber(thresholdReddit.retryRateWarning, 3)}/${formatNumber(thresholdYouTube.retryRateWarning, 3)}/${formatNumber(thresholdEbay.retryRateWarning, 3)}`,
    `alerts=${formatNumber(alerts, 0)} canary(sent/notified/failed/acks)=${formatNumber(canary.sentRuns, 0)}/${formatNumber(canary.notifiedRuns, 0)}/${formatNumber(canary.failedRuns, 0)}/${formatNumber(canary.ackCount, 0)}`,
    `digest(events/sent/failed)=${formatNumber(escalationDigest.totalEvents, 0)}/${formatNumber(escalationDigest.sentEvents, 0)}/${formatNumber(escalationDigest.failedEvents, 0)}`,
    `holds p1(gov/budget/dataGap)=${formatNumber(p1Holds.governanceHold, 0)}/${formatNumber(p1Holds.budgetHold, 0)}/${formatNumber(p1Holds.dataGap, 0)} p2=${formatNumber(p2Holds.governanceHold, 0)}/${formatNumber(p2Holds.budgetHold, 0)}/${formatNumber(p2Holds.dataGap, 0)}`,
  ]);
}

async function handleOpsWeeklyDigestCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const windowHours = parseWeeklyWindowHoursArg(args);
  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/digest/weekly",
    body: { windowHours },
  });
  if (!result.ok) {
    return asReply([`ARI ops weekly digest failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const summary = asRecord(payload.summary);
  const totals = asRecord(summary.totals);
  const snapshot = asRecord(payload.snapshot);
  const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts.length : 0;
  return asReply([
    "ARI ops weekly digest export",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)}`,
    `markdownPath: ${asTrimmedString(payload.markdownPath) ?? "n/a"}`,
    `csvPath: ${asTrimmedString(payload.csvPath) ?? "n/a"}`,
    `days=${formatNumber(summary.dayCount, 0)} p1Runs=${formatNumber(totals.p1Runs, 0)} p2Scans=${formatNumber(totals.p2Scans, 0)} p2Demos=${formatNumber(totals.p2Demos, 0)}`,
    `escalations sent/suppressed=${formatNumber(totals.escalationsSent, 0)}/${formatNumber(totals.escalationsSuppressed, 0)} canary runs/fail/ack=${formatNumber(totals.canaryRuns, 0)}/${formatNumber(totals.canaryFailures, 0)}/${formatNumber(totals.canaryAcks, 0)}`,
    `dashboard publish/fail=${formatNumber(totals.dashboardPublishes, 0)}/${formatNumber(totals.dashboardPublishFailures, 0)} currentAlerts=${formatNumber(alerts, 0)}`,
    "usage: /ari-ops-weekly [window-hours]",
  ]);
}

async function handleOpsWeeklyDigestPublishCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const windowHours = parseWeeklyWindowHoursArg(args);
  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/digest/weekly/publish",
    body: { windowHours },
  });
  if (!result.ok) {
    return asReply([`ARI ops weekly digest publish failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const summary = asRecord(payload.summary);
  const totals = asRecord(summary.totals);
  return asReply([
    "ARI ops weekly digest publish",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(payload.windowHours, 0)}`,
    `markdownPath: ${asTrimmedString(payload.markdownPath) ?? "n/a"} csvPath: ${asTrimmedString(payload.csvPath) ?? "n/a"}`,
    `retentionPruned: ${formatNumber(payload.retentionPruned, 0)} webhookConfigured: ${String(payload.webhookConfigured === true)} webhookSource: ${asTrimmedString(payload.webhookSource) ?? "none"}`,
    `published: ${String(payload.published === true)} status: ${formatNumber(payload.publishStatus, 0)} error: ${asTrimmedString(payload.publishError) ?? "none"}`,
    `days=${formatNumber(summary.dayCount, 0)} p1Runs=${formatNumber(totals.p1Runs, 0)} p2Scans=${formatNumber(totals.p2Scans, 0)} escalationsSuppressed=${formatNumber(totals.escalationsSuppressed, 0)}`,
    "usage: /ari-ops-weekly-publish [window-hours]",
  ]);
}

async function handleOpsAutopublishCommand(
  controller: OpsAutopublishController,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseOpsAutopublishArgs(args);

  if (parsed.action === "run") {
    await controller.runNow({
      force: parsed.force,
      windowHours: parsed.windowHours,
      trigger: "manual-command",
    });
  }

  const status = controller.getStatus();
  return asReply([
    `ARI ops autopublish${parsed.action === "run" ? " run complete" : " status"}`,
    `enabled=${String(status.enabled)} active=${String(status.active)} inFlight=${String(status.inFlight)} force=${String(status.force)}`,
    `businessUnit=${status.businessUnit} channel=${status.channelId ?? "n/a"}`,
    `interval=${formatMinutes(status.intervalMinutes)} window=${formatNumber(status.windowHours, 0)}h startupDelay=${formatNumber(status.startupDelaySeconds, 0)}s failureThreshold=${formatNumber(status.failureAlertThreshold, 0)} cooldown=${formatMinutes(status.failureAlertCooldownMinutes)}`,
    `runs=${formatNumber(status.totalRuns, 0)} published=${formatNumber(status.totalPublished, 0)} skipped=${formatNumber(status.totalSkipped, 0)} failures=${formatNumber(status.totalFailures, 0)} consecutiveFailures=${formatNumber(status.consecutiveFailures, 0)}`,
    `lastRunAt=${status.lastRunAt ?? "n/a"} lastCompletedAt=${status.lastCompletedAt ?? "n/a"} lastPublishedAt=${status.lastPublishedAt ?? "n/a"} nextRunAt=${status.nextRunAt ?? "n/a"}`,
    `lastGatePassed=${typeof status.lastGatePassed === "boolean" ? String(status.lastGatePassed) : "n/a"} lastStatus=${formatNumber(status.lastPublishStatus, 0)} lastError=${status.lastPublishError ?? "none"} escalations=${formatNumber(status.escalationCount, 0)} lastEscalatedAt=${status.lastEscalatedAt ?? "n/a"}`,
    `lastHolds=${status.lastHoldSummary ?? "n/a"}`,
    "usage: /ari-ops-autopublish [status|run [window-hours] [force]]",
  ]);
}

async function handleOpsAlertCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseOpsAlertArgs(args);
  const metadata: Record<string, unknown> = {
    triggeredBy: "manual-command",
  };
  if (parsed.businessUnit) {
    metadata.businessUnit = parsed.businessUnit;
  }
  if (parsed.channel) {
    metadata.channel = parsed.channel;
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/alerts/escalate",
    body: {
      severity: parsed.severity,
      source: parsed.source,
      message: parsed.message,
      metadata,
    },
  });
  if (!result.ok) {
    return asReply([`ARI ops alert failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const matchedOverrides = Array.isArray(payload.matchedOverrides)
    ? payload.matchedOverrides
        .map((entry) => asTrimmedString(entry))
        .filter(Boolean)
        .join(",")
    : "none";
  const dedupe = asRecord(payload.dedupe);
  const digest = asRecord(payload.digest);
  const ackWindow = asRecord(payload.ackWindow);
  const holdSummary = asRecord(payload.holdSummary);
  const holdP1 = readHoldReasons(holdSummary.p1);
  const holdP2 = readHoldReasons(holdSummary.p2);
  return asReply([
    "ARI ops alert",
    `severity=${asTrimmedString(payload.severity) ?? parsed.severity} source=${asTrimmedString(payload.source) ?? parsed.source}`,
    `message=${asTrimmedString(payload.message) ?? parsed.message}`,
    `notify=${String(payload.notify === true)} sent=${String(payload.sent === true)} webhookConfigured=${String(payload.webhookConfigured === true)} webhookSource=${asTrimmedString(payload.webhookSource) ?? "n/a"}`,
    `policyAction=${asTrimmedString(payload.policyAction) ?? "n/a"} operatorSlaMinutes=${formatNumber(payload.operatorSlaMinutes, 0)} matchedOverrides=${matchedOverrides}`,
    `holds p1(gov/budget/dataGap)=${formatHoldReasons(holdP1)} p2=${formatHoldReasons(holdP2)} source=${asTrimmedString(holdSummary.source) ?? "n/a"}`,
    `ackWindow active=${String(ackWindow.active === true)} reason=${asTrimmedString(ackWindow.reason) ?? "n/a"} lastAckAt=${asTrimmedString(ackWindow.lastAckAt) ?? "n/a"} window=${formatNumber(ackWindow.windowMinutes, 0)}m`,
    `dedupe suppressed=${String(dedupe.suppressed === true)} recent=${formatNumber(dedupe.recentMatches, 0)} limit=${formatNumber(dedupe.maxPerWindow, 0)} window=${formatNumber(dedupe.windowMinutes, 0)}m`,
    `digest eligible=${String(digest.eligible === true)} sent=${String(digest.sent === true)} suppressedEvents=${formatNumber(digest.suppressedEvents, 0)} reason=${asTrimmedString(digest.reason) ?? "n/a"}`,
    `error=${asTrimmedString(payload.error) ?? "none"}`,
    "usage: /ari-ops-alert <severity?> <message> [source=<id>] [bu=<business-unit>] [channel=<channel-id>]",
  ]);
}

async function handleOpsAckCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseOpsAckArgs(args);
  const metadata: Record<string, unknown> = {
    triggeredBy: "manual-command",
    scope: parsed.scope,
  };
  if (parsed.businessUnit) {
    metadata.businessUnit = parsed.businessUnit;
  }
  if (parsed.channel) {
    metadata.channel = parsed.channel;
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/alerts/ack",
    body: {
      source: parsed.source,
      reason: parsed.reason,
      metadata,
    },
  });
  if (!result.ok) {
    return asReply([`ARI ops ack failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const canary = asRecord(payload.canary);
  return asReply([
    "ARI ops ack",
    `acknowledged=${String(payload.acknowledged === true)} scope=${asTrimmedString(payload.scope) ?? parsed.scope}`,
    `source=${asTrimmedString(payload.source) ?? parsed.source}`,
    `reason=${asTrimmedString(payload.reason) ?? parsed.reason}`,
    `canary acks24h=${formatNumber(canary.ackCount24h, 0)} failedRuns24h=${formatNumber(canary.failedRuns24h, 0)} lastAckAt=${asTrimmedString(canary.lastAckAt) ?? "n/a"} lastFailureAt=${asTrimmedString(canary.lastFailureAt) ?? "n/a"}`,
    "usage: /ari-ops-ack <reason> [source=<id>] [scope=canary|general] [bu=<business-unit>] [channel=<channel-id>]",
  ]);
}

async function handleOpsCanaryCommand(
  controller: OpsCanaryController,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseOpsCanaryArgs(args);
  if (parsed.action === "run") {
    await controller.runNow({
      trigger: "manual-command",
      severity: parsed.severity,
    });
  }

  const status = controller.getStatus();
  return asReply([
    `ARI ops canary${parsed.action === "run" ? " run complete" : " status"}`,
    `enabled=${String(status.enabled)} active=${String(status.active)} inFlight=${String(status.inFlight)} severity=${status.severity}`,
    `source=${status.source} businessUnit=${status.businessUnit} channel=${status.channelId ?? "n/a"}`,
    `interval=${formatMinutes(status.intervalMinutes)} startupDelay=${formatNumber(status.startupDelaySeconds, 0)}s`,
    `runs=${formatNumber(status.totalRuns, 0)} sent=${formatNumber(status.totalSent, 0)} failures=${formatNumber(status.totalFailures, 0)}`,
    `lastRunAt=${status.lastRunAt ?? "n/a"} lastCompletedAt=${status.lastCompletedAt ?? "n/a"} lastSentAt=${status.lastSentAt ?? "n/a"} nextRunAt=${status.nextRunAt ?? "n/a"} lastError=${status.lastError ?? "none"}`,
    "usage: /ari-ops-canary [status|run [severity]]",
  ]);
}

async function handleOpsWeeklyDigestSchedulerCommand(
  controller: OpsWeeklyDigestController,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseOpsWeeklyDigestSchedulerArgs(args);
  if (parsed.action === "run") {
    await controller.runNow({
      trigger: "manual-command",
      windowHours: parsed.windowHours,
    });
  }
  const status = controller.getStatus();
  return asReply([
    `ARI ops weekly digest scheduler${parsed.action === "run" ? " run complete" : " status"}`,
    `enabled=${String(status.enabled)} active=${String(status.active)} inFlight=${String(status.inFlight)}`,
    `interval=${formatMinutes(status.intervalMinutes)} window=${formatNumber(status.windowHours, 0)}h startupDelay=${formatNumber(status.startupDelaySeconds, 0)}s failureThreshold=${formatNumber(status.failureAlertThreshold, 0)} cooldown=${formatMinutes(status.failureAlertCooldownMinutes)}`,
    `forceRerun enabled=${String(status.forceRerunEnabled)} delay=${formatMinutes(status.forceRerunDelayMinutes)} maxAttempts=${formatNumber(status.forceRerunMaxAttempts, 0)} pending=${String(status.forceRerunPending)} attempts=${formatNumber(status.forceRerunAttempts, 0)}`,
    `runs=${formatNumber(status.totalRuns, 0)} published=${formatNumber(status.totalPublished, 0)} failures=${formatNumber(status.totalFailures, 0)} consecutiveFailures=${formatNumber(status.consecutiveFailures, 0)} escalations=${formatNumber(status.escalationCount, 0)}`,
    `lastRunAt=${status.lastRunAt ?? "n/a"} lastCompletedAt=${status.lastCompletedAt ?? "n/a"} lastPublishedAt=${status.lastPublishedAt ?? "n/a"} nextRunAt=${status.nextRunAt ?? "n/a"}`,
    `lastStatus=${formatNumber(status.lastPublishStatus, 0)} lastError=${status.lastError ?? "none"} lastEscalatedAt=${status.lastEscalatedAt ?? "n/a"} lastForcedRerunAt=${status.lastForcedRerunAt ?? "n/a"}`,
    "usage: /ari-ops-weekly-scheduler [status|run [window-hours]]",
  ]);
}

async function handleOpsWeeklyDigestOverrideCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseOpsWeeklyOverrideArgs(args);
  if (!parsed.reason) {
    return asReply([
      "Usage: /ari-ops-weekly-override [window-hours|window=<hours>] <prefix: override-reason>",
    ]);
  }
  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: "/api/ops/digest/weekly/publish/override",
    body: {
      windowHours: parsed.windowHours,
      reason: parsed.reason,
      requestedBy: "manual-command",
    },
  });
  if (!result.ok) {
    return asReply([`ARI ops weekly override failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const publish = asRecord(payload.publish);
  return asReply([
    "ARI ops weekly digest override",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowHours=${formatNumber(parsed.windowHours, 0)} | requestedBy=${asTrimmedString(payload.requestedBy) ?? "manual-command"}`,
    `reason: ${asTrimmedString(payload.reason) ?? parsed.reason}`,
    `controls cooldown=${formatNumber(payload.cooldownWindowMinutes, 0)}m maxPerWindow=${formatNumber(payload.maxPerWindow, 0)} recentOverrides=${formatNumber(payload.recentOverrides, 0)} prefixes=${
      Array.isArray(payload.allowedReasonPrefixes)
        ? payload.allowedReasonPrefixes
            .map((entry) => asTrimmedString(entry))
            .filter(Boolean)
            .join(",") || "n/a"
        : "n/a"
    }`,
    `approved=${String(payload.approved === true)} overrideExecuted=${String(payload.overrideExecuted === true)} ruleKey=${asTrimmedString(payload.ruleKey) ?? "n/a"} requiresManualApproval=${String(payload.requiresManualApproval === true)}`,
    `decision: ${formatDecisionOutcome(payload.decision)}`,
    `publish configured=${String(publish.webhookConfigured === true)} source=${asTrimmedString(publish.webhookSource) ?? "n/a"} published=${String(publish.published === true)} status=${formatNumber(publish.publishStatus, 0)} error=${asTrimmedString(publish.publishError) ?? "none"}`,
    `error=${asTrimmedString(payload.error) ?? "none"}`,
    "usage: /ari-ops-weekly-override [window-hours|window=<hours>] <prefix: reason>",
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
    const sourceQuality = formatNumber(lead.sourceQualityScore, 2);
    lines.push(
      `${idx + 1}. ${name} | score=${score} | vertical=${vertical} | locality=${locality} | sourceQ=${sourceQuality} | leadId=${leadId}`,
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

async function handleP2FeedbackCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseP2FeedbackArgs(args);
  if (!parsed.outreachId) {
    return asReply([
      "Usage: /ari-p2-feedback <outreach-id> <won|meeting_booked|lost|no_response> [notes]",
    ]);
  }

  const result = await callAriPipelinesApi({
    runtime,
    method: "POST",
    path: `/api/p2/outreach/${encodeURIComponent(parsed.outreachId)}/feedback`,
    body: {
      outcome: parsed.outcome,
      ...(parsed.notes ? { notes: parsed.notes } : {}),
    },
  });
  if (!result.ok) {
    return asReply([`P2 outreach feedback failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  return asReply([
    `P2 outreach feedback updated: ${parsed.outreachId}`,
    `updated: ${String(payload.updated === true)} status: ${asTrimmedString(payload.status) ?? "n/a"}`,
    `outcome: ${asTrimmedString(payload.outcome) ?? parsed.outcome} segment: ${asTrimmedString(payload.segmentKey) ?? "n/a"}`,
    `scoreAdjustment: ${formatNumber(payload.scoreAdjustment, 0)} sampleSize: ${formatNumber(payload.sampleSize, 0)}`,
    `error: ${asTrimmedString(payload.error) ?? "none"}`,
  ]);
}

async function handleP2FeedbackStatsCommand(
  runtime: BridgeRuntimeConfig,
  args?: string,
): Promise<ReplyPayload> {
  const parsed = parseP2FeedbackStatsArgs(args);
  const query = new URLSearchParams({
    windowDays: String(parsed.windowDays),
    segmentLimit: String(parsed.segmentLimit),
  });
  const result = await callAriPipelinesApi({
    runtime,
    method: "GET",
    path: `/api/p2/outreach/feedback/stats?${query.toString()}`,
  });
  if (!result.ok) {
    return asReply([`P2 feedback stats failed: ${result.error ?? "unknown error"}`]);
  }

  const payload = asRecord(result.data);
  const confidence = asRecord(payload.confidence);
  const totals = asRecord(payload.totals);
  const allTime = asRecord(totals.allTime);
  const rollingWindow = asRecord(totals.rollingWindow);
  const rolling7d = asRecord(totals.rolling7d);
  const rolling30d = asRecord(totals.rolling30d);
  const deltas = asRecord(totals.deltas);
  const segments = Array.isArray(payload.segments) ? payload.segments : [];

  const lines = [
    "P2 feedback analytics",
    `generatedAt: ${asTrimmedString(payload.generatedAt) ?? "n/a"} | windowDays=${formatNumber(payload.windowDays, 0)} | segmentLimit=${formatNumber(payload.segmentLimit, 0)} | segmentCount=${formatNumber(payload.segmentCount, 0)}`,
    `allTime total=${formatNumber(allTime.totalFeedback, 0)} won/meeting/lost/noResp=${formatNumber(allTime.won, 0)}/${formatNumber(allTime.meetingBooked, 0)}/${formatNumber(allTime.lost, 0)}/${formatNumber(allTime.noResponse, 0)} winRate=${formatNumber(allTime.winRate, 3)} positiveRate=${formatNumber(allTime.positiveRate, 3)}`,
    `window total=${formatNumber(rollingWindow.totalFeedback, 0)} winRate=${formatNumber(rollingWindow.winRate, 3)} positiveRate=${formatNumber(rollingWindow.positiveRate, 3)}`,
    `rolling7 total=${formatNumber(rolling7d.totalFeedback, 0)} winRate=${formatNumber(rolling7d.winRate, 3)} | rolling30 total=${formatNumber(rolling30d.totalFeedback, 0)} winRate=${formatNumber(rolling30d.winRate, 3)}`,
    `delta 7v30 winRate=${formatNumber(deltas.winRate7v30, 3)} positiveRate=${formatNumber(deltas.positiveRate7v30, 3)} responseRate=${formatNumber(deltas.responseRate7v30, 3)}`,
    `confidence minSample=${formatNumber(confidence.minimumSampleThreshold, 0)} medium=${formatNumber(confidence.mediumSampleThreshold, 0)} high=${formatNumber(confidence.highSampleThreshold, 0)} eligibleSegments=${formatNumber(confidence.eligibleSegmentCount, 0)}`,
  ];

  if (segments.length === 0) {
    lines.push("segments: no feedback segments captured yet");
    lines.push("usage: /ari-p2-feedback-stats [window-days] [segment-limit]");
    return asReply(lines);
  }

  lines.push(`top segments (max ${Math.min(segments.length, 10)} shown):`);
  for (let idx = 0; idx < Math.min(segments.length, 10); idx += 1) {
    const segment = asRecord(segments[idx]);
    const key = asTrimmedString(segment.segmentKey) ?? "n/a";
    const segmentRolling30 = asRecord(segment.rolling30d);
    const segmentRolling7 = asRecord(segment.rolling7d);
    lines.push(
      `${idx + 1}. ${key} | 30d total=${formatNumber(segmentRolling30.totalFeedback, 0)} winRate=${formatNumber(segmentRolling30.winRate, 3)} | 7d total=${formatNumber(segmentRolling7.totalFeedback, 0)} winRate=${formatNumber(segmentRolling7.winRate, 3)} | delta=${formatNumber(segment.winRateDelta7v30, 3)} | confidence=${asTrimmedString(segment.confidenceTier) ?? "n/a"} sample30d=${formatNumber(segment.sample30d, 0)} minimumMet=${String(segment.minimumSampleMet === true)} | scoreAdj=${formatNumber(segment.scoreAdjustment, 0)}`,
    );
  }
  lines.push("usage: /ari-p2-feedback-stats [window-days] [segment-limit]");
  return asReply(lines);
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
  const opsAutopublish = createOpsAutopublishController(runtime);
  const opsCanary = createOpsCanaryController(runtime);
  const opsWeeklyDigest = createOpsWeeklyDigestController(runtime);

  api.logger.info(
    `[ari-autonomous] command bridge active: baseUrl=${runtime.apiBaseUrl} strictRouting=${runtime.strictRouting}`,
  );
  api.registerService({
    id: "ari-autonomous-ops-dashboard-autopublish",
    start: () => {
      opsAutopublish.start();
      opsCanary.start();
      opsWeeklyDigest.start();
    },
    stop: () => {
      opsAutopublish.stop();
      opsCanary.stop();
      opsWeeklyDigest.stop();
    },
  });

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
    name: "ari-ops-weekly",
    description: "Export weekly ops digest artifacts (optional: <window-hours>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsWeeklyDigestCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-weekly-publish",
    description: "Export and publish weekly ops digest artifacts (optional: <window-hours>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsWeeklyDigestPublishCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-weekly-scheduler",
    description: "Show or run weekly digest scheduler (optional: run [window-hours])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsWeeklyDigestSchedulerCommand(opsWeeklyDigest, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-weekly-override",
    description:
      "Force weekly digest publish with governance gate (usage: [window-hours|window=<hours>] <prefix: reason>)",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsWeeklyDigestOverrideCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-autopublish",
    description: "Show or run ops dashboard autopublish scheduler (optional: run <hours> [force])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsAutopublishCommand(opsAutopublish, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-canary",
    description: "Show or run ops canary scheduler (optional: run [severity])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsCanaryCommand(opsCanary, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-alert",
    description:
      "Emit a manual ops escalation alert (optional: <severity> <message> [source=...] [bu=...] [channel=...])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsAlertCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-ops-ack",
    description:
      "Acknowledge canary/ops alert ownership (optional: <reason> [source=...] [scope=canary|general] [bu=...] [channel=...])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "status",
      handler: async (ctx) => handleOpsAckCommand(runtime, ctx.args),
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

  api.registerCommand({
    name: "ari-p2-feedback",
    description: "Record Pipeline 2 outreach outcome feedback for scoring loop",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2FeedbackCommand(runtime, ctx.args),
    }),
  });

  api.registerCommand({
    name: "ari-p2-feedback-stats",
    description: "Show Pipeline 2 feedback analytics (optional: [window-days] [segment-limit])",
    acceptsArgs: true,
    handler: withAccessControl({
      runtime,
      scope: "p2",
      handler: async (ctx) => handleP2FeedbackStatsCommand(runtime, ctx.args),
    }),
  });
}
