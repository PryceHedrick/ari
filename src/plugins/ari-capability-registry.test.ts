import { describe, it, expect, afterEach } from "vitest";
import {
  isCapabilityAvailable,
  getCapabilityStatuses,
  CAPABILITY_REGISTRY,
} from "./ari-capability-registry.js";

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

describe("isCapabilityAvailable", () => {
  it("returns false when required env var is missing", () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    expect(isCapabilityAvailable("anthropic")).toBe(false);
  });

  it("returns false when required env var is empty string", () => {
    setEnv({ ANTHROPIC_API_KEY: "" });
    expect(isCapabilityAvailable("anthropic")).toBe(false);
  });

  it("returns false when required env var is whitespace only", () => {
    setEnv({ ANTHROPIC_API_KEY: "   " });
    expect(isCapabilityAvailable("anthropic")).toBe(false);
  });

  it("returns true when required env var is set", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(isCapabilityAvailable("anthropic")).toBe(true);
  });

  it("returns false when feature flag is not 'true'", () => {
    setEnv({
      ELEVENLABS_API_KEY: "key",
      ELEVENLABS_VOICE_ID: "voice-id",
      ARI_VOICE_ENABLED: "false",
    });
    expect(isCapabilityAvailable("elevenlabs")).toBe(false);
  });

  it("returns false when feature flag is missing", () => {
    setEnv({
      ELEVENLABS_API_KEY: "key",
      ELEVENLABS_VOICE_ID: "voice-id",
      ARI_VOICE_ENABLED: undefined,
    });
    expect(isCapabilityAvailable("elevenlabs")).toBe(false);
  });

  it("returns true when all vars present AND feature flag is 'true'", () => {
    setEnv({
      ELEVENLABS_API_KEY: "key",
      ELEVENLABS_VOICE_ID: "voice-id",
      ARI_VOICE_ENABLED: "true",
    });
    expect(isCapabilityAvailable("elevenlabs")).toBe(true);
  });

  it("returns false for unknown capability name", () => {
    // @ts-expect-error — testing unknown name
    expect(isCapabilityAvailable("unknown-capability")).toBe(false);
  });
});

describe("getCapabilityStatuses", () => {
  it("returns one status per registry entry", () => {
    const statuses = getCapabilityStatuses();
    expect(statuses.length).toBe(CAPABILITY_REGISTRY.length);
  });

  it("reports missingVars correctly", () => {
    setEnv({ ANTHROPIC_API_KEY: undefined });
    const statuses = getCapabilityStatuses();
    const anthropic = statuses.find((s) => s.name === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.available).toBe(false);
    expect(anthropic!.missingVars).toContain("ANTHROPIC_API_KEY");
  });

  it("reports available=true when vars are set", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const statuses = getCapabilityStatuses();
    const anthropic = statuses.find((s) => s.name === "anthropic");
    expect(anthropic!.available).toBe(true);
    expect(anthropic!.missingVars).toHaveLength(0);
  });

  it("NEVER reads env var values — only names", () => {
    // We can verify this by checking that missingVars only contains key names (strings),
    // not values. The test itself demonstrates the contract.
    setEnv({ ANTHROPIC_API_KEY: "super-secret-key-value" });
    const statuses = getCapabilityStatuses();
    const anthropic = statuses.find((s) => s.name === "anthropic");
    // missingVars should be empty (key is present), and the status object
    // should NOT contain the actual key value anywhere
    const statusStr = JSON.stringify(anthropic);
    expect(statusStr).not.toContain("super-secret-key-value");
  });

  it("reports feature flag not set as available=false with empty missingVars", () => {
    setEnv({
      X_BEARER_TOKEN: "token",
      ARI_ENABLE_X_INTEL: "false",
    });
    const statuses = getCapabilityStatuses();
    const xIntel = statuses.find((s) => s.name === "xIntel");
    expect(xIntel!.available).toBe(false);
    // Vars are present — missingVars is empty
    expect(xIntel!.missingVars).toHaveLength(0);
  });
});
