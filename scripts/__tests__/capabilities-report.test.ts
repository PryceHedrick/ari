/**
 * Integration tests for the capabilities-report script logic.
 * Tests exit code behavior and formatting contracts.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  isCapabilityAvailable,
  getCapabilityStatuses,
} from "../../src/plugins/ari-capability-registry.js";

// Helper: set env vars and restore after each test
const savedEnv: Record<string, string | undefined> = {};
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  for (const k of Object.keys(savedEnv)) {
    delete savedEnv[k];
  }
});

describe("capabilities report — exit code logic", () => {
  const CORE = ["ANTHROPIC_API_KEY", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "PERPLEXITY_API_KEY"];

  it("all core capabilities available → statuses report no missing core vars", () => {
    const envVars: Record<string, string> = {};
    for (const v of CORE) {
      envVars[v] = "test-value";
    }
    setEnv(envVars);

    const statuses = getCapabilityStatuses();
    const coreNames = new Set(["anthropic", "discord", "perplexity"]);
    const missingCore = statuses.filter(
      (s) => coreNames.has(s.name) && !s.available && s.missingVars.length > 0,
    );
    // Exit code 0 logic: no missing core vars
    expect(missingCore).toHaveLength(0);
  });

  it("missing ANTHROPIC_API_KEY → core capability unavailable (exit 1 logic)", () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    const statuses = getCapabilityStatuses();
    const anthropic = statuses.find((s) => s.name === "anthropic");
    expect(anthropic!.available).toBe(false);
    expect(anthropic!.missingVars.length).toBeGreaterThan(0);
  });
});

describe("capabilities report — safety contract", () => {
  it("getCapabilityStatuses output never contains secret values", () => {
    setEnv({
      ANTHROPIC_API_KEY: "sk-ant-secret123",
      DISCORD_BOT_TOKEN: "token-secret456",
      PERPLEXITY_API_KEY: "pplx-secret789",
    });
    const statuses = getCapabilityStatuses();
    const output = JSON.stringify(statuses);
    expect(output).not.toContain("sk-ant-secret123");
    expect(output).not.toContain("token-secret456");
    expect(output).not.toContain("pplx-secret789");
  });

  it("isCapabilityAvailable returns false when env var is missing", () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    expect(isCapabilityAvailable("anthropic")).toBe(false);
  });

  it("isCapabilityAvailable returns false when feature flag not true", () => {
    setEnv({
      ELEVENLABS_API_KEY: "key",
      ELEVENLABS_VOICE_ID: "voice",
      ARI_VOICE_ENABLED: undefined,
    });
    expect(isCapabilityAvailable("elevenlabs")).toBe(false);
  });
});
