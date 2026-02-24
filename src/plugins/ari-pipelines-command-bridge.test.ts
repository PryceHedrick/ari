import { describe, expect, it } from "vitest";
import {
  computeRetryDelayMs,
  evaluateCommandAccess,
  extractCommandChannelId,
  normalizeChannelId,
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
