import { describe, it, expect, afterEach } from "vitest";
import {
  AGENT_PROFILES,
  routeToModel,
  getCacheConfig,
  validateRunePrimaryModel,
  PERPLEXITY_MODELS,
} from "./value-scorer.js";

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

// ─── AGENT_PROFILES ────────────────────────────────────────────────────────

describe("AGENT_PROFILES", () => {
  it("ARI uses anthropic provider", () => {
    expect(AGENT_PROFILES["ARI"].provider).toBe("anthropic");
  });

  it("ARI uses claude-sonnet-4-6 (Sonnet default, not Opus)", () => {
    expect(AGENT_PROFILES["ARI"].model).toBe("claude-sonnet-4-6");
  });

  it("ARI-DEEP uses claude-opus-4-6 (always Opus)", () => {
    expect(AGENT_PROFILES["ARI-DEEP"].model).toBe("claude-opus-4-6");
    expect(AGENT_PROFILES["ARI-DEEP"].provider).toBe("anthropic");
  });

  it("NOVA uses anthropic provider", () => {
    expect(AGENT_PROFILES["NOVA"].provider).toBe("anthropic");
  });

  it("CHASE uses anthropic provider", () => {
    expect(AGENT_PROFILES["CHASE"].provider).toBe("anthropic");
  });

  it("PULSE uses google provider", () => {
    expect(AGENT_PROFILES["PULSE"].provider).toBe("google");
  });

  it("PULSE uses gemini-2.5-flash model", () => {
    expect(AGENT_PROFILES["PULSE"].model).toBe("gemini-2.5-flash");
  });

  it("DEX uses perplexity provider", () => {
    expect(AGENT_PROFILES["DEX"].provider).toBe("perplexity");
  });
});

// ─── PERPLEXITY_MODELS prefix ──────────────────────────────────────────────

describe("PERPLEXITY_MODELS", () => {
  it("retains perplexity/ prefix (NOT stripped in value-scorer)", () => {
    expect(PERPLEXITY_MODELS["pro"]).toBe("perplexity/sonar-pro");
    expect(PERPLEXITY_MODELS["deep"]).toBe("perplexity/sonar-deep-research");
    expect(PERPLEXITY_MODELS["reasoning"]).toBe("perplexity/sonar-reasoning-pro");
    expect(PERPLEXITY_MODELS["basic"]).toBe("perplexity/sonar");
  });
});

// ─── ARI escalation ────────────────────────────────────────────────────────

describe("routeToModel — ARI", () => {
  it("routes ARI routine tasks to Sonnet", () => {
    const route = routeToModel({ prompt: "hello", agentName: "ARI", stakes: 20 });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-sonnet-4-6");
  });

  it("escalates ARI to Opus when stakes >= 85", () => {
    const route = routeToModel({ prompt: "architecture review", agentName: "ARI", stakes: 85 });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-opus-4-6");
  });

  it("escalates ARI to Opus when complexity >= 80", () => {
    const route = routeToModel({ prompt: "hello", agentName: "ARI", complexity: 80 });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-opus-4-6");
  });

  it("escalates ARI to Opus for deep taskType", () => {
    const route = routeToModel({ prompt: "hello", agentName: "ARI", taskType: "deep" });
    expect(route.model).toBe("claude-opus-4-6");
  });

  it("ARI-DEEP always routes to Opus", () => {
    const route = routeToModel({ prompt: "hello", agentName: "ARI-DEEP" });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-opus-4-6");
  });
});

// ─── NOVA escalation ───────────────────────────────────────────────────────

describe("routeToModel — NOVA", () => {
  it("routes routine NOVA tasks to Sonnet", () => {
    const route = routeToModel({ prompt: "write a script", agentName: "NOVA" });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-sonnet-4-6");
  });

  it("escalates NOVA to Opus for high stakes", () => {
    const route = routeToModel({ prompt: "publish", agentName: "NOVA", stakes: 90 });
    expect(route.model).toBe("claude-opus-4-6");
  });

  it("routes NOVA draft tasks to Haiku", () => {
    const route = routeToModel({ prompt: "hello", agentName: "NOVA", taskType: "brief" });
    expect(route.model).toBe("claude-haiku-4-5");
  });
});

// ─── CHASE escalation ──────────────────────────────────────────────────────

describe("routeToModel — CHASE", () => {
  it("routes routine CHASE tasks to Sonnet", () => {
    const route = routeToModel({ prompt: "draft outreach", agentName: "CHASE" });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-sonnet-4-6");
  });

  it("escalates CHASE to Opus for high stakes", () => {
    const route = routeToModel({ prompt: "qualify lead", agentName: "CHASE", stakes: 90 });
    expect(route.model).toBe("claude-opus-4-6");
  });

  it("routes CHASE discovery to Haiku", () => {
    const route = routeToModel({
      prompt: "find leads",
      agentName: "CHASE",
      taskType: "lead-discovery",
    });
    expect(route.model).toBe("claude-haiku-4-5");
  });
});

// ─── PULSE routing ─────────────────────────────────────────────────────────

describe("routeToModel — PULSE", () => {
  it("routes PULSE default to Gemini via google provider", () => {
    setEnv({ GEMINI_API_KEY: "test-key" });
    const route = routeToModel({ prompt: "analyze market", agentName: "PULSE" });
    expect(route.provider).toBe("google");
    expect(route.model).toBe("gemini-2.5-flash");
  });

  it("routes PULSE x-sentiment to xai grok-3-mini", () => {
    setEnv({ XAI_API_KEY: "test-key" });
    const route = routeToModel({
      prompt: "sentiment",
      agentName: "PULSE",
      taskType: "x-sentiment",
    });
    expect(route.provider).toBe("xai");
    expect(route.model).toBe("grok-3-mini");
  });

  it("routes PULSE high-stakes x-sentiment to xai grok-3", () => {
    setEnv({ XAI_API_KEY: "test-key" });
    const route = routeToModel({
      prompt: "flash crash",
      agentName: "PULSE",
      taskType: "x-sentiment",
      stakes: 90,
    });
    expect(route.provider).toBe("xai");
    expect(route.model).toBe("grok-3");
  });
});

// ─── RUNE 3-tier fallback ──────────────────────────────────────────────────

describe("routeToModel — RUNE 3-tier fallback", () => {
  it("routes to openai-codex when RUNE_CODEX_AVAILABLE=true", () => {
    setEnv({ RUNE_CODEX_AVAILABLE: "true", OPENAI_API_KEY: undefined });
    const route = routeToModel({ prompt: "build feature", agentName: "RUNE" });
    expect(route.provider).toBe("openai-codex");
    expect(route.model).toBe("gpt-5.3-codex");
  });

  it("routes to openai when OPENAI_API_KEY present (no Codex)", () => {
    setEnv({
      RUNE_CODEX_AVAILABLE: undefined,
      OPENAI_API_KEY: "sk-test",
      RUNE_PRIMARY_MODEL: undefined,
    });
    const route = routeToModel({ prompt: "build feature", agentName: "RUNE" });
    expect(route.provider).toBe("openai");
    expect(route.model).toBe("gpt-4.1");
  });

  it("uses RUNE_PRIMARY_MODEL model part when OPENAI_API_KEY present", () => {
    setEnv({
      RUNE_CODEX_AVAILABLE: undefined,
      OPENAI_API_KEY: "sk-test",
      RUNE_PRIMARY_MODEL: "openai/gpt-5",
    });
    const route = routeToModel({ prompt: "build feature", agentName: "RUNE" });
    expect(route.provider).toBe("openai");
    expect(route.model).toBe("gpt-5");
  });

  it("falls back to anthropic when no OpenAI auth", () => {
    setEnv({
      RUNE_CODEX_AVAILABLE: undefined,
      OPENAI_API_KEY: undefined,
      RUNE_PRIMARY_MODEL: undefined,
    });
    const route = routeToModel({ prompt: "build feature", agentName: "RUNE" });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-sonnet-4-6");
  });
});

// ─── Capability fallbacks ──────────────────────────────────────────────────

describe("routeToModel — capability fallbacks", () => {
  it("falls back to anthropic sonnet when GEMINI_API_KEY absent", () => {
    setEnv({ GEMINI_API_KEY: undefined });
    const route = routeToModel({ prompt: "analyze", agentName: "PULSE" });
    // PULSE default goes to google; fallback kicks in
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-sonnet-4-6");
    expect(route.reason).toContain("fallback: GEMINI_API_KEY absent");
  });

  it("falls back to anthropic haiku when XAI_API_KEY absent", () => {
    setEnv({ XAI_API_KEY: undefined });
    const route = routeToModel({
      prompt: "sentiment",
      agentName: "PULSE",
      taskType: "x-sentiment",
    });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-haiku-4-5-20251001");
    expect(route.reason).toContain("fallback: XAI_API_KEY absent");
  });

  it("falls back to anthropic haiku when PERPLEXITY_API_KEY absent", () => {
    setEnv({ PERPLEXITY_API_KEY: undefined });
    const route = routeToModel({ prompt: "search web", taskType: "web-research" });
    expect(route.provider).toBe("anthropic");
    expect(route.model).toBe("claude-haiku-4-5-20251001");
    expect(route.reason).toContain("fallback: PERPLEXITY_API_KEY absent");
  });
});

// ─── getCacheConfig ────────────────────────────────────────────────────────

describe("getCacheConfig", () => {
  it("returns 1h cache for ARI (anthropic)", () => {
    const cfg = getCacheConfig({ prompt: "hello", agentName: "ARI" });
    expect(cfg).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  it("returns null for PULSE (google provider)", () => {
    const cfg = getCacheConfig({ prompt: "hello", agentName: "PULSE" });
    expect(cfg).toBeNull();
  });

  it("returns null for DEX (perplexity provider)", () => {
    const cfg = getCacheConfig({ prompt: "hello", agentName: "DEX" });
    expect(cfg).toBeNull();
  });
});

// ─── validateRunePrimaryModel ──────────────────────────────────────────────

describe("validateRunePrimaryModel", () => {
  it("accepts anthropic/model", () => {
    expect(validateRunePrimaryModel("anthropic/claude-sonnet-4-6").valid).toBe(true);
  });

  it("accepts openai/model", () => {
    expect(validateRunePrimaryModel("openai/gpt-5").valid).toBe(true);
  });

  it("accepts openai-codex/model", () => {
    expect(validateRunePrimaryModel("openai-codex/gpt-5.3-codex").valid).toBe(true);
  });

  it("rejects unknown provider", () => {
    const result = validateRunePrimaryModel("fakevendor/model");
    expect(result.valid).toBe(false);
  });

  it("rejects missing slash", () => {
    const result = validateRunePrimaryModel("claude-sonnet-4-6");
    expect(result.valid).toBe(false);
  });

  it("accepts undefined (no env set)", () => {
    expect(validateRunePrimaryModel(undefined).valid).toBe(true);
  });
});
