import { describe, expect, it } from "vitest";
import {
  evaluateCommandAccess,
  extractCommandChannelId,
  normalizeChannelId,
  type BridgeRuntimeConfig,
} from "./ari-pipelines-command-bridge.js";
import type { PluginCommandContext } from "./types.js";

function buildRuntime(overrides?: Partial<BridgeRuntimeConfig>): BridgeRuntimeConfig {
  return {
    apiBaseUrl: "http://127.0.0.1:8787",
    timeoutMs: 20_000,
    strictRouting: true,
    p1Channels: new Set<string>(),
    p2Channels: new Set<string>(),
    statusChannels: new Set<string>(),
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
