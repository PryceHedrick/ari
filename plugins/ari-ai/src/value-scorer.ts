/**
 * ARI ValueScorer — Intelligent model routing for all LLM calls
 *
 * Routing priority (highest to lowest):
 *   1. Named agent → use profile model always
 *   2. Engineering task → RUNE_PRIMARY_MODEL (Sprint 0 winner)
 *   3. Web research → Perplexity tier-aware routing
 *   4. Long context >100K → Gemini 2.5 Flash overflow
 *   5. ValueScore → opus/sonnet/haiku based on complexity+stakes+quality+history
 *
 * No hard budget caps. Best model for every task.
 * Spend tracked via OpenRouter GET /api/v1/key.
 *
 * Prompt caching (OpenRouter):
 *   Named agents: ttl=1h (stable SOUL+workspace context ≥4096 tokens = ~70% cost reduction)
 *   Other:        ttl=5min (default ephemeral)
 *   Threshold:    Opus 4.6 ≥4096 tokens | Sonnet/Haiku ≥1024 tokens
 */

export type ModelTier = "opus" | "sonnet" | "haiku";
export type ResearchDepth = "deep" | "reasoning" | "pro" | "basic";
export type ContextPlane = "apex" | "codex";

export type TaskContext = {
  agentName?: string;
  taskType?: string;
  prompt: string;
  contextTokens?: number;
  researchDepth?: ResearchDepth;
  complexity?: number; // 0-100 (high = more complex)
  stakes?: number; // 0-100 (high = more consequential)
  quality?: number; // 0-100 (high = quality-critical output)
  history?: number; // 0-100 (high = rich usage history)
};

export type ModelRoute = {
  provider: "openrouter" | "perplexity" | "google" | "openai";
  model: string;
  reason: string;
};

// Named agent profiles — always use designated model
const AGENT_PROFILES: Record<string, { model: string; provider: "openrouter" }> = {
  ARI: { model: "anthropic/claude-opus-4-6", provider: "openrouter" },
  NOVA: { model: "anthropic/claude-sonnet-4-6", provider: "openrouter" },
  CHASE: { model: "anthropic/claude-sonnet-4-6", provider: "openrouter" },
  PULSE: { model: "anthropic/claude-haiku-4-5", provider: "openrouter" },
  DEX: { model: "anthropic/claude-haiku-4-5", provider: "openrouter" },
  RUNE: {
    model: process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6",
    provider: "openrouter",
  },
};

// Perplexity tier-aware routing (via OpenRouter)
const PERPLEXITY_MODELS: Record<ResearchDepth, string> = {
  deep: "perplexity/sonar-deep-research", // DEX weekly digest, CHASE deep qualify
  reasoning: "perplexity/sonar-reasoning-pro", // DEX breakthrough scanning
  pro: "perplexity/sonar-pro", // PULSE news, CHASE quick research
  basic: "perplexity/sonar", // High-volume routine daily scans
};

// Engineering task detection
const ENGINEERING_PATTERNS = [
  /build/i,
  /implement/i,
  /refactor/i,
  /test/i,
  /debug/i,
  /deploy/i,
  /typescript/i,
  /vitest/i,
  /plugin/i,
  /code/i,
  /function/i,
  /class/i,
];

// Web research task detection
const RESEARCH_PATTERNS = [
  /search/i,
  /research/i,
  /find.*web/i,
  /look.*up/i,
  /latest.*news/i,
  /current.*price/i,
  /what.*happening/i,
  /live.*data/i,
];

// Long-context detection patterns (for Gemini overflow)
const LONG_CONTEXT_TOKEN_THRESHOLD = 100_000;

/**
 * Compute ValueScore from task dimensions.
 * score = (complexity × 0.40) + (stakes × 0.30) + (quality × 0.20) + (history × 0.10)
 */
export function computeValueScore(ctx: TaskContext): number {
  const complexity = ctx.complexity ?? estimateComplexity(ctx.prompt);
  const stakes = ctx.stakes ?? estimateStakes(ctx.prompt);
  const quality = ctx.quality ?? 60; // default: quality matters
  const history = ctx.history ?? 50; // default: moderate history

  return complexity * 0.4 + stakes * 0.3 + quality * 0.2 + history * 0.1;
}

function estimateComplexity(prompt: string): number {
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 500) {
    return 85;
  }
  if (wordCount > 200) {
    return 70;
  }
  if (wordCount > 100) {
    return 55;
  }
  return 40;
}

function estimateStakes(prompt: string): number {
  const highStakePatterns = [
    /governance/i,
    /security/i,
    /strategy/i,
    /architecture/i,
    /publish/i,
    /outreach/i,
  ];
  const lowStakePatterns = [/heartbeat/i, /health.*check/i, /monitor/i, /status/i];

  if (highStakePatterns.some((p) => p.test(prompt))) {
    return 85;
  }
  if (lowStakePatterns.some((p) => p.test(prompt))) {
    return 20;
  }
  return 55;
}

function scoreToTier(score: number): ModelTier {
  if (score >= 85) {
    return "opus";
  }
  if (score >= 60) {
    return "sonnet";
  }
  return "haiku";
}

const TIER_MODEL_MAP: Record<ModelTier, string> = {
  opus: "anthropic/claude-opus-4-6",
  sonnet: "anthropic/claude-sonnet-4-6",
  haiku: "anthropic/claude-haiku-4-5",
};

/**
 * Route a task to the best model.
 * Priority: named agent → engineering → research → long-context → ValueScore
 */
export function routeToModel(ctx: TaskContext): ModelRoute {
  // 1. Named agent — always use profile model
  if (ctx.agentName) {
    const name = ctx.agentName.toUpperCase();
    const profile = AGENT_PROFILES[name];
    if (profile) {
      return {
        provider: profile.provider,
        model: profile.model,
        reason: `Named agent ${name} uses designated model`,
      };
    }
  }

  // 2. Engineering tasks → RUNE routing (CODEX plane)
  if (ctx.taskType === "engineering" || ENGINEERING_PATTERNS.some((p) => p.test(ctx.prompt))) {
    const primaryModel = process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6";
    // Security-sensitive engineering → always Opus
    if (ctx.stakes && ctx.stakes >= 85) {
      return {
        provider: "openrouter",
        model: "anthropic/claude-opus-4-6",
        reason: "High-stakes engineering → Opus (security/architecture)",
      };
    }
    return {
      provider: "openrouter",
      model: primaryModel,
      reason: "Engineering task → RUNE primary model",
    };
  }

  // 3. Web research → Perplexity tier-aware routing
  if (ctx.taskType === "web-research" || RESEARCH_PATTERNS.some((p) => p.test(ctx.prompt))) {
    const depth: ResearchDepth = ctx.researchDepth ?? "basic";
    return {
      provider: "perplexity",
      model: PERPLEXITY_MODELS[depth],
      reason: `Web research (${depth}) → Perplexity ${PERPLEXITY_MODELS[depth]}`,
    };
  }

  // 4. Long-context overflow → Gemini 2.5 Flash
  if (ctx.contextTokens && ctx.contextTokens > LONG_CONTEXT_TOKEN_THRESHOLD) {
    return {
      provider: "google",
      model: "google/gemini-2.5-flash",
      reason: `Context ${ctx.contextTokens} tokens > 100K threshold → Gemini 2.5 Flash overflow`,
    };
  }

  // 5. Image generation → DALL-E 3
  if (ctx.taskType === "image-generation") {
    return {
      provider: "openai",
      model: "dall-e-3",
      reason: "Image generation → DALL-E 3",
    };
  }

  // 6. Audio transcription → Whisper
  if (ctx.taskType === "audio-transcription") {
    return {
      provider: "openai",
      model: "whisper-1",
      reason: "Audio transcription → Whisper",
    };
  }

  // 7. Default: Claude ValueScore routing
  const score = computeValueScore(ctx);
  const tier = scoreToTier(score);
  return {
    provider: "openrouter",
    model: TIER_MODEL_MAP[tier],
    reason: `ValueScore ${Math.round(score)} → ${tier} (${TIER_MODEL_MAP[tier]})`,
  };
}

// === OPENROUTER PROMPT CACHING ===

export type CacheConfig = {
  type: "ephemeral";
  ttl: "5min" | "1h";
};

// Minimum token thresholds for caching to activate (OpenRouter requirement)
const CACHE_THRESHOLD_OPUS = 4_096;
const CACHE_THRESHOLD_SONNET = 1_024;
const CACHE_THRESHOLD_HAIKU = 1_024;

/**
 * Get the appropriate cache configuration for an OpenRouter request.
 *
 * Named agents with stable SOUL+workspace prompts use ttl=1h.
 * This achieves ~70% cost reduction on context-heavy agent requests
 * (90% cache hit rate on stable workspace context per plan Section 19.2).
 *
 * Usage: Mark the stable system prompt block with cache_control:
 *   { type: 'text', text: agentSoulFile + workspaceContext,
 *     cache_control: getCacheConfig(ctx) ?? { type: 'ephemeral' } }
 */
export function getCacheConfig(ctx: TaskContext): CacheConfig | null {
  const tokens = ctx.contextTokens ?? 0;

  // Named agents → 1h TTL (SOUL.md + workspace context is stable across calls)
  if (ctx.agentName) {
    const name = ctx.agentName.toUpperCase();
    const profile = AGENT_PROFILES[name];
    if (profile) {
      const threshold = profile.model.includes("opus")
        ? CACHE_THRESHOLD_OPUS
        : profile.model.includes("haiku")
          ? CACHE_THRESHOLD_HAIKU
          : CACHE_THRESHOLD_SONNET;

      if (tokens >= threshold || tokens === 0) {
        // tokens=0 means unknown — optimistically cache named agents
        return { type: "ephemeral", ttl: "1h" };
      }
    }
  }

  // Other large prompts → 5min default TTL
  const defaultThreshold = CACHE_THRESHOLD_SONNET;
  if (tokens >= defaultThreshold) {
    return { type: "ephemeral", ttl: "5min" };
  }

  return null; // Below caching threshold — don't add cache_control
}
