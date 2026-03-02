/**
 * Plane Naming Tests — backward-compat + RUNE routing invariants
 *
 * Verifies:
 *   1. normalizePlane() accepts all legacy values
 *   2. RUNE agent still resolves to openai-codex/gpt-5.3-codex (model unaffected by rename)
 *   3. validateContextBundlePlane() enforces BUILD plane (formerly CODEX)
 */

import { describe, it, expect, afterEach } from "vitest";
import { validateContextBundlePlane } from "../../../ari-agents/src/coordinator.js";
import { routeToModel } from "../../../ari-ai/src/value-scorer.js";
import { normalizePlane } from "../../../ari-shared/src/plane-names.js";

describe("normalizePlane", () => {
  it("accepts canonical 'mission' → 'mission'", () => {
    expect(normalizePlane("mission")).toBe("mission");
  });

  it("accepts legacy 'zoe' → 'mission'", () => {
    expect(normalizePlane("zoe")).toBe("mission");
  });

  it("accepts legacy 'apex' → 'mission'", () => {
    expect(normalizePlane("apex")).toBe("mission");
  });

  it("accepts canonical 'build' → 'build'", () => {
    expect(normalizePlane("build")).toBe("build");
  });

  it("accepts legacy 'codex' → 'build'", () => {
    expect(normalizePlane("codex")).toBe("build");
  });

  it("unknown value → 'mission' safe default", () => {
    expect(normalizePlane("unknown")).toBe("mission");
    expect(normalizePlane("")).toBe("mission");
  });
});

describe("RUNE model routing — unaffected by plane rename", () => {
  afterEach(() => {
    delete process.env.RUNE_CODEX_AVAILABLE;
    delete process.env.OPENAI_API_KEY;
    delete process.env.RUNE_PRIMARY_MODEL;
  });

  it("RUNE with RUNE_CODEX_AVAILABLE=true → openai-codex/gpt-5.3-codex", () => {
    process.env.RUNE_CODEX_AVAILABLE = "true";
    const result = routeToModel({ agentName: "RUNE", prompt: "write a test" });
    expect(result.provider).toBe("openai-codex");
    expect(result.model).toBe("gpt-5.3-codex");
  });

  it("BUILD plane fast-path → RUNE_PRIMARY_MODEL (fallback anthropic/sonnet)", () => {
    delete process.env.RUNE_CODEX_AVAILABLE;
    const result = routeToModel({ plane: "build", prompt: "write a plugin" });
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
  });
});

describe("validateContextBundlePlane — BUILD plane enforcement", () => {
  it("throws when BUILD-plane agent (RUNE) receives SOUL.md", () => {
    expect(() => validateContextBundlePlane("RUNE", ["SOUL.md", "AGENTS.md"])).toThrow(
      /BUILD plane violation/,
    );
  });

  it("allows AGENTS.md for BUILD-plane agent", () => {
    expect(() => validateContextBundlePlane("RUNE", ["AGENTS.md"])).not.toThrow();
  });

  it("does not restrict MISSION-plane agents", () => {
    expect(() =>
      validateContextBundlePlane("ARI", ["SOUL.md", "USER.md", "AGENTS.md"]),
    ).not.toThrow();
  });
});
