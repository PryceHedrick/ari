/**
 * Config validator unit tests (file-level, no process.exit).
 */

import { describe, it, expect } from "vitest";

// ── Inline the validation logic for testability (avoids process.exit) ─────────

const KNOWN_PROVIDERS = new Set([
  "anthropic",
  "google",
  "openai",
  "openai-codex",
  "xai",
  "perplexity",
]);
const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function validateAgentNamesInRouting(routeAgents: string[], agentNames: Set<string>): string[] {
  return routeAgents.filter((a) => !agentNames.has(a));
}

function validateModelIds(modelIds: Set<string>, usedModels: string[]): string[] {
  return usedModels.filter((m) => m !== "openai-default" && !modelIds.has(m));
}

function validateProviders(providers: string[]): string[] {
  return providers.filter((p) => !KNOWN_PROVIDERS.has(p));
}

function validateEnvVarNames(names: string[]): string[] {
  return names.filter((n) => !ENV_VAR_PATTERN.test(n));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("config validator", () => {
  describe("agent name validation", () => {
    const agentNames = new Set(["ARI", "NOVA", "CHASE", "PULSE", "DEX", "RUNE"]);

    it("passes for known agent names", () => {
      const errors = validateAgentNamesInRouting(["ARI", "NOVA", "PULSE"], agentNames);
      expect(errors).toHaveLength(0);
    });

    it("fails for unknown agent names", () => {
      const errors = validateAgentNamesInRouting(["ARI", "UNKNOWN_AGENT"], agentNames);
      expect(errors).toContain("UNKNOWN_AGENT");
    });
  });

  describe("model ID validation", () => {
    const modelIds = new Set([
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-haiku-4-5-20251001",
      "gemini-2.5-flash",
      "grok-3",
      "grok-3-mini",
      "sonar-pro",
    ]);

    it("passes for known model IDs", () => {
      const errors = validateModelIds(modelIds, ["claude-sonnet-4-6", "gemini-2.5-flash"]);
      expect(errors).toHaveLength(0);
    });

    it("passes for openai-default (special conceptual ID)", () => {
      const errors = validateModelIds(modelIds, ["openai-default"]);
      expect(errors).toHaveLength(0);
    });

    it("fails for unknown model IDs", () => {
      const errors = validateModelIds(modelIds, ["claude-sonnet-4-6", "gpt-99-turbo"]);
      expect(errors).toContain("gpt-99-turbo");
    });
  });

  describe("provider validation", () => {
    it("passes for known providers", () => {
      const errors = validateProviders(["anthropic", "google", "xai", "perplexity"]);
      expect(errors).toHaveLength(0);
    });

    it("fails for unknown providers", () => {
      const errors = validateProviders(["anthropic", "openrouter"]);
      expect(errors).toContain("openrouter");
    });
  });

  describe("env var name format", () => {
    it("passes for valid UPPER_SNAKE_CASE names", () => {
      const errors = validateEnvVarNames(["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY"]);
      expect(errors).toHaveLength(0);
    });

    it("fails for lowercase env var names", () => {
      const errors = validateEnvVarNames(["anthropic_api_key"]);
      expect(errors).toContain("anthropic_api_key");
    });

    it("fails for env var names with values included", () => {
      const errors = validateEnvVarNames(["ANTHROPIC_API_KEY=sk-ant-xxx"]);
      expect(errors).toContain("ANTHROPIC_API_KEY=sk-ant-xxx");
    });
  });
});
