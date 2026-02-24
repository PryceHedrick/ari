import { describe, expect, it, vi } from "vitest";
import {
  callAriPipelinesApi,
  computeRetryDelayMs,
  evaluateCommandAccess,
  extractCommandChannelId,
  normalizeChannelId,
  parseOpsAlertArgs,
  parseOpsAckArgs,
  parseOpsCanaryArgs,
  parseP2FeedbackArgs,
  parseP2FeedbackStatsArgs,
  parseDashboardPublishArgs,
  parseRetryStatusCodes,
  resolveRetryPolicyForRequest,
  type BridgeRuntimeConfig,
} from "./ari-pipelines-command-bridge.js";
import type { PluginCommandContext } from "./types.js";

function buildRuntime(overrides?: Partial<BridgeRuntimeConfig>): BridgeRuntimeConfig {
  return {
    apiBaseUrl: "http://127.0.0.1:8787",
    timeoutMs: 20_000,
    retry: {
      attempts: 3,
      minDelayMs: 350,
      maxDelayMs: 3000,
      statusCodes: new Set([408, 429, 500]),
    },
    mutationRetryAttempts: 1,
    approvalRetryAttempts: 1,
    opsAutopublish: {
      enabled: false,
      intervalMinutes: 180,
      windowHours: 24,
      startupDelaySeconds: 45,
      force: false,
      businessUnit: "operations",
      channelId: undefined,
      failureAlertThreshold: 3,
      failureAlertCooldownMinutes: 120,
    },
    opsCanary: {
      enabled: false,
      intervalMinutes: 24 * 60,
      startupDelaySeconds: 90,
      severity: "warning",
      source: "ops.canary",
      message: "synthetic canary escalation check",
      businessUnit: "operations",
      channelId: undefined,
    },
    opsWeeklyDigest: {
      enabled: false,
      intervalMinutes: 7 * 24 * 60,
      windowHours: 168,
      startupDelaySeconds: 120,
      failureAlertThreshold: 2,
      failureAlertCooldownMinutes: 12 * 60,
      forceRerunEnabled: true,
      forceRerunDelayMinutes: 30,
      forceRerunMaxAttempts: 1,
    },
    strictRouting: true,
    p1Channels: new Set<string>(),
    p2Channels: new Set<string>(),
    statusChannels: new Set<string>(),
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    ...overrides,
  };
}

function buildContext(overrides?: Partial<PluginCommandContext>): PluginCommandContext {
  return {
    channel: "discord",
    isAuthorizedSender: true,
    commandBody: "/ari-status",
    config: {},
    ...overrides,
  };
}

describe("normalizeChannelId", () => {
  it("extracts ids from channel addressing formats", () => {
    expect(normalizeChannelId("channel:123")).toBe("123");
    expect(normalizeChannelId("discord:channel:998877")).toBe("998877");
    expect(normalizeChannelId("5566778899")).toBe("5566778899");
  });

  it("ignores wildcards and unresolved env placeholders", () => {
    expect(normalizeChannelId("*")).toBeUndefined();
    expect(normalizeChannelId("${ARI_CHANNEL}")).toBeUndefined();
    expect(normalizeChannelId("slash:123")).toBeUndefined();
  });
});

describe("extractCommandChannelId", () => {
  it("prefers ctx.to then falls back to ctx.from", () => {
    const fromOnly = buildContext({ from: "discord:channel:from-id", to: "slash:123" });
    expect(extractCommandChannelId(fromOnly)).toBe("from-id");

    const withTo = buildContext({ from: "discord:channel:from-id", to: "channel:to-id" });
    expect(extractCommandChannelId(withTo)).toBe("to-id");
  });
});

describe("evaluateCommandAccess", () => {
  it("allows when no channel policy exists", () => {
    const runtime = buildRuntime({ p1Channels: new Set(), strictRouting: true });
    const access = evaluateCommandAccess({
      ctx: buildContext({ to: "channel:abc" }),
      scope: "p1",
      runtime,
    });
    expect(access.allowed).toBe(true);
  });

  it("blocks strict command when channel does not match allowed set", () => {
    const runtime = buildRuntime({
      strictRouting: true,
      p2Channels: new Set(["allowed-channel"]),
    });
    const access = evaluateCommandAccess({
      ctx: buildContext({ to: "channel:blocked-channel" }),
      scope: "p2",
      runtime,
    });
    expect(access.allowed).toBe(false);
    expect(access.reason).toContain("blocked-channel");
  });

  it("allows non-discord commands regardless of policy", () => {
    const runtime = buildRuntime({
      strictRouting: true,
      p2Channels: new Set(["allowed-channel"]),
    });
    const access = evaluateCommandAccess({
      ctx: buildContext({ channel: "telegram", to: "channel:blocked-channel" }),
      scope: "p2",
      runtime,
    });
    expect(access.allowed).toBe(true);
  });
});

describe("parseRetryStatusCodes", () => {
  it("parses comma-separated values and ignores invalid entries", () => {
    expect(
      Array.from(parseRetryStatusCodes("429, 503, nope, 42, 600")).toSorted((a, b) => a - b),
    ).toEqual([429, 503]);
  });

  it("parses numeric arrays", () => {
    expect(
      Array.from(parseRetryStatusCodes([408, "500", "bad"])).toSorted((a, b) => a - b),
    ).toEqual([408, 500]);
  });
});

describe("computeRetryDelayMs", () => {
  it("applies exponential delays and clamps to max", () => {
    expect(computeRetryDelayMs({ attempt: 1, minDelayMs: 200, maxDelayMs: 2000 })).toBe(200);
    expect(computeRetryDelayMs({ attempt: 2, minDelayMs: 200, maxDelayMs: 2000 })).toBe(400);
    expect(computeRetryDelayMs({ attempt: 5, minDelayMs: 200, maxDelayMs: 2000 })).toBe(2000);
  });
});

describe("parseDashboardPublishArgs", () => {
  it("parses default args", () => {
    expect(parseDashboardPublishArgs()).toEqual({ windowHours: 24, force: false });
  });

  it("parses force token and numeric window", () => {
    expect(parseDashboardPublishArgs("48 force")).toEqual({ windowHours: 48, force: true });
    expect(parseDashboardPublishArgs("--force 12")).toEqual({ windowHours: 12, force: true });
  });
});

describe("parseOpsAlertArgs", () => {
  it("parses defaults when args are missing", () => {
    expect(parseOpsAlertArgs()).toEqual({
      severity: "critical",
      source: "operator.manual",
      message: "manual escalation",
      businessUnit: undefined,
      channel: undefined,
    });
  });

  it("parses severity, metadata tokens, and message text", () => {
    expect(
      parseOpsAlertArgs(
        "warning source=ops.autopublish bu=pokemon channel=123456 pipeline delay detected",
      ),
    ).toEqual({
      severity: "warning",
      source: "ops.autopublish",
      message: "pipeline delay detected",
      businessUnit: "pokemon",
      channel: "123456",
    });
  });
});

describe("parseOpsAckArgs", () => {
  it("parses defaults when args are missing", () => {
    expect(parseOpsAckArgs()).toEqual({
      source: "ops.canary",
      reason: "manual canary acknowledgment",
      scope: "canary",
      businessUnit: undefined,
      channel: undefined,
    });
  });

  it("parses source/scope metadata and reason text", () => {
    expect(
      parseOpsAckArgs(
        "source=ops.canary scope=general bu=pokemon channel=123 owner acknowledged and investigating",
      ),
    ).toEqual({
      source: "ops.canary",
      reason: "owner acknowledged and investigating",
      scope: "general",
      businessUnit: "pokemon",
      channel: "123",
    });
  });
});

describe("parseOpsCanaryArgs", () => {
  it("defaults to status", () => {
    expect(parseOpsCanaryArgs()).toEqual({ action: "status" });
    expect(parseOpsCanaryArgs("status")).toEqual({ action: "status" });
  });

  it("parses run action with severity override", () => {
    expect(parseOpsCanaryArgs("run info")).toEqual({ action: "run", severity: "info" });
    expect(parseOpsCanaryArgs("run critical")).toEqual({ action: "run", severity: "critical" });
  });
});

describe("parseP2FeedbackArgs", () => {
  it("returns defaults when args are missing", () => {
    expect(parseP2FeedbackArgs()).toEqual({
      outreachId: undefined,
      outcome: "no_response",
      notes: undefined,
    });
  });

  it("parses outreach id, outcome, and notes", () => {
    expect(parseP2FeedbackArgs("outreach-123 won client accepted proposal")).toEqual({
      outreachId: "outreach-123",
      outcome: "won",
      notes: "client accepted proposal",
    });
  });
});

describe("parseP2FeedbackStatsArgs", () => {
  it("returns defaults when args are missing", () => {
    expect(parseP2FeedbackStatsArgs()).toEqual({
      windowDays: 30,
      segmentLimit: 10,
    });
  });

  it("parses bounded numeric args", () => {
    expect(parseP2FeedbackStatsArgs("14 5")).toEqual({
      windowDays: 14,
      segmentLimit: 5,
    });
    expect(parseP2FeedbackStatsArgs("999 999")).toEqual({
      windowDays: 90,
      segmentLimit: 25,
    });
  });
});

describe("resolveRetryPolicyForRequest", () => {
  it("uses full retry policy for GET requests", () => {
    const runtime = buildRuntime({
      retry: {
        attempts: 4,
        minDelayMs: 100,
        maxDelayMs: 1000,
        statusCodes: new Set([408, 429]),
      },
      mutationRetryAttempts: 2,
      approvalRetryAttempts: 1,
    });
    const policy = resolveRetryPolicyForRequest({
      runtime,
      method: "GET",
      path: "/api/ops/sla",
    });
    expect(policy.attempts).toBe(4);
  });

  it("uses mutation attempts for non-approval POST requests", () => {
    const runtime = buildRuntime({
      retry: {
        attempts: 4,
        minDelayMs: 100,
        maxDelayMs: 1000,
        statusCodes: new Set([408, 429]),
      },
      mutationRetryAttempts: 2,
      approvalRetryAttempts: 1,
    });
    const policy = resolveRetryPolicyForRequest({
      runtime,
      method: "POST",
      path: "/api/p2/demo/build",
    });
    expect(policy.attempts).toBe(2);
  });

  it("uses approval attempts for approve/reject paths", () => {
    const runtime = buildRuntime({
      retry: {
        attempts: 4,
        minDelayMs: 100,
        maxDelayMs: 1000,
        statusCodes: new Set([408, 429]),
      },
      mutationRetryAttempts: 2,
      approvalRetryAttempts: 1,
    });
    const approvePolicy = resolveRetryPolicyForRequest({
      runtime,
      method: "POST",
      path: "/api/p2/outreach/123/approve",
    });
    const rejectPolicy = resolveRetryPolicyForRequest({
      runtime,
      method: "POST",
      path: "/api/p2/outreach/123/reject",
    });
    expect(approvePolicy.attempts).toBe(1);
    expect(rejectPolicy.attempts).toBe(1);
  });
});

describe("callAriPipelinesApi", () => {
  it("retries retryable failures and recovers on a later attempt", async () => {
    const runtime = buildRuntime({
      timeoutMs: 200,
      retry: {
        attempts: 3,
        minDelayMs: 1,
        maxDelayMs: 1,
        statusCodes: new Set([500, 503]),
      },
    });
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "transient upstream failure" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof global.fetch;

    try {
      const result = await callAriPipelinesApi({
        runtime,
        method: "GET",
        path: "/healthz",
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(calls).toBe(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("does not retry non-retryable status codes", async () => {
    const runtime = buildRuntime({
      timeoutMs: 200,
      retry: {
        attempts: 4,
        minDelayMs: 1,
        maxDelayMs: 1,
        statusCodes: new Set([500, 503]),
      },
    });
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof global.fetch;

    try {
      const result = await callAriPipelinesApi({
        runtime,
        method: "GET",
        path: "/api/p1/run",
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(calls).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns timeout error when request exceeds timeout", async () => {
    const runtime = buildRuntime({
      timeoutMs: 20,
      retry: {
        attempts: 1,
        minDelayMs: 1,
        maxDelayMs: 1,
        statusCodes: new Set([500]),
      },
    });
    const originalFetch = global.fetch;
    global.fetch = vi.fn(
      async (_url: URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            return;
          }
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    ) as unknown as typeof global.fetch;

    try {
      const result = await callAriPipelinesApi({
        runtime,
        method: "GET",
        path: "/healthz",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("timeout");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
