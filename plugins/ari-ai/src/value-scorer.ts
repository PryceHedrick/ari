/**
 * ARI ValueScorer — Intelligent model routing for all LLM calls
 *
 * Routing priority (highest to lowest):
 *   1. CODEX plane → RUNE_PRIMARY_MODEL (engineering context)
 *   2. Named agent → task-type-aware multi-tier routing
 *      ARI:   always Opus 4.6 (orchestration)
 *      NOVA:  outline/brief → Haiku | default → Sonnet | polish/final → Opus
 *      CHASE: discovery/score → Haiku | default → Sonnet | deep/high-stakes → Opus
 *      PULSE: market-news → Perplexity sonar-pro | sentiment → Sonnet | default → Gemini 2.5 Flash
 *      DEX:   web/changelog → Perplexity sonar-pro | breakthrough → sonar-reasoning-pro
 *             paper-analysis → Haiku+thinking | synthesis → Sonnet | long-doc → Gemini 2.5 Flash
 *             default → Perplexity sonar-pro
 *      RUNE:  RUNE_PRIMARY_MODEL (engineering)
 *   3. Engineering task patterns → RUNE_PRIMARY_MODEL
 *   4. Web research patterns → Perplexity tier-aware
 *   5. Long context >100K → Gemini 2.5 Flash overflow
 *   6. Image generation → DALL-E 3
 *   7. Audio transcription → Whisper
 *   8. Default → Claude ValueScore (complexity+stakes+quality+history)
 *
 * No hard budget caps. Best model for every task.
 * Spend tracked via OpenRouter GET /api/v1/key.
 *
 * Prompt caching (OpenRouter — Anthropic models only):
 *   Named agents (Anthropic models): ttl=1h (~70% cost reduction on stable SOUL+workspace)
 *   Other large prompts: ttl=5min (default ephemeral)
 *   Threshold: Opus ≥4096 tokens | Sonnet/Haiku ≥1024 tokens
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
  plane?: ContextPlane;
};

export type ModelRoute = {
  provider: "openrouter" | "perplexity" | "google" | "openai";
  model: string;
  reason: string;
  extendedThinking?: boolean;
  thinkingBudget?: number;
};

// Named agent profiles — default model when no task-type override applies
const AGENT_PROFILES: Record<string, { model: string; provider: ModelRoute["provider"] }> = {
  ARI: { model: "anthropic/claude-opus-4-6", provider: "openrouter" },
  "ARI-DEEP": { model: "anthropic/claude-opus-4-6", provider: "openrouter" }, // ari-deep agent → always Opus
  NOVA: { model: "anthropic/claude-sonnet-4-6", provider: "openrouter" },
  CHASE: { model: "anthropic/claude-sonnet-4-6", provider: "openrouter" },
  PULSE: { model: "google/gemini-2.5-flash", provider: "openrouter" },
  DEX: { model: "perplexity/sonar-pro", provider: "perplexity" },
  RUNE: {
    model: process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6",
    provider: "openrouter",
  },
};

// Perplexity tier-aware routing — real-time web search native to model
const PERPLEXITY_MODELS: Record<ResearchDepth, string> = {
  deep: "perplexity/sonar-deep-research", // DEX weekly digest — deepest synthesis
  reasoning: "perplexity/sonar-reasoning-pro", // DEX breakthrough detection, CHASE deep qualify
  pro: "perplexity/sonar-pro", // PULSE news, DEX web research, CHASE lead audit
  basic: "perplexity/sonar", // High-volume routine scans
};

// Engineering task detection patterns
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

// Web research detection patterns (for non-named-agent fallback)
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

// Long-context threshold for Gemini overflow (non-named-agent path)
const LONG_CONTEXT_TOKEN_THRESHOLD = 100_000;

/**
 * Compute ValueScore from task dimensions.
 * score = (complexity × 0.40) + (stakes × 0.30) + (quality × 0.20) + (history × 0.10)
 */
export function computeValueScore(ctx: TaskContext): number {
  const complexity = ctx.complexity ?? estimateComplexity(ctx.prompt);
  const stakes = ctx.stakes ?? estimateStakes(ctx.prompt);
  const quality = ctx.quality ?? 60;
  const history = ctx.history ?? 50;
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
  const highStake = [
    /governance/i,
    /security/i,
    /strategy/i,
    /architecture/i,
    /publish/i,
    /outreach/i,
  ];
  const lowStake = [/heartbeat/i, /health.*check/i, /monitor/i, /status/i];
  if (highStake.some((p) => p.test(prompt))) {
    return 85;
  }
  if (lowStake.some((p) => p.test(prompt))) {
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

function validateRuneModel(model: string): void {
  if (!model.startsWith("anthropic/") && !model.startsWith("openai/")) {
    throw new Error(
      `[ARI] Invalid RUNE_PRIMARY_MODEL format: "${model}". ` +
        'Must be "anthropic/..." or "openai/..." (e.g., "openai/codex-5.3" or "anthropic/claude-sonnet-4-6")',
    );
  }
}

/**
 * Route a task to the best model.
 * Priority: CODEX → named agent (task-type-aware) → engineering → research → long-context → ValueScore
 */
export function routeToModel(ctx: TaskContext): ModelRoute {
  // 0. CODEX plane fast-path — always routes to RUNE_PRIMARY_MODEL
  if (ctx.plane === "codex") {
    const codexModel = process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6";
    return {
      provider: "openrouter",
      model: codexModel,
      reason: "CODEX plane → RUNE primary model (engineering)",
    };
  }

  // 1. Named agent — task-type-aware multi-tier routing
  if (ctx.agentName) {
    const name = ctx.agentName.toUpperCase();
    const profile = AGENT_PROFILES[name];
    if (profile) {
      // ── ARI 🧠 ────────────────────────────────────────────────────────────────
      // Always Opus. No task-type downgrades. Orchestration demands maximum capability.

      // ── NOVA 🎬 ──────────────────────────────────────────────────────────────
      if (name === "NOVA") {
        // Fast draft tasks → Haiku (outlines, briefs, thumbnail prompts)
        if (
          ctx.taskType === "script-outline" ||
          ctx.taskType === "brief" ||
          ctx.taskType === "thumbnail-prompt" ||
          ctx.taskType === "market-ingest"
        ) {
          return {
            provider: "openrouter",
            model: "anthropic/claude-haiku-4-5",
            reason: "NOVA draft/brief task → Haiku (fast, disposable output)",
          };
        }
        // Quality gate → Opus (final script polish, confidence review)
        if (
          ctx.taskType === "script-polish" ||
          ctx.taskType === "final-review" ||
          ctx.taskType === "quality-review"
        ) {
          return {
            provider: "openrouter",
            model: "anthropic/claude-opus-4-6",
            reason: "NOVA final polish → Opus (quality-critical, Pryce-facing output)",
          };
        }
        // Default NOVA → Sonnet (script generation, evidence synthesis)
      }

      // ── CHASE 🎯 ─────────────────────────────────────────────────────────────
      if (name === "CHASE") {
        // High-volume lead discovery + quick scoring → Haiku (speed at scale)
        if (
          ctx.taskType === "lead-discovery" ||
          ctx.taskType === "quick-score" ||
          ctx.taskType === "audit-triage"
        ) {
          return {
            provider: "openrouter",
            model: "anthropic/claude-haiku-4-5",
            reason: "CHASE discovery/triage → Haiku (high-volume, fast scoring)",
          };
        }
        // Live lead web audit → Perplexity (real prospect data, live site)
        if (ctx.taskType === "lead-audit" || ctx.taskType === "web-research") {
          return {
            provider: "perplexity",
            model: PERPLEXITY_MODELS["pro"],
            reason: "CHASE lead audit → Perplexity sonar-pro (live site verification)",
          };
        }
        // Deep qualification + high-stakes → Opus (P2 revenue on the line)
        if (ctx.researchDepth === "deep" || (ctx.stakes !== undefined && ctx.stakes >= 85)) {
          return {
            provider: "openrouter",
            model: "anthropic/claude-opus-4-6",
            reason: "CHASE deep qualify → Opus (high-stakes lead, P2 revenue path)",
          };
        }
        // Default CHASE → Sonnet (Prompt Forge 4-pass, demo builder, outreach draft)
      }

      // ── PULSE 📡 ─────────────────────────────────────────────────────────────
      if (name === "PULSE") {
        // High-stakes X sentiment (flash crash, major move) → Grok 3 full
        // MUST check high-stakes BEFORE general social-sentiment to avoid dead code
        if (
          (ctx.taskType === "social-sentiment" || ctx.taskType === "x-sentiment") &&
          ctx.stakes !== undefined &&
          ctx.stakes >= 85
        ) {
          return {
            provider: "openrouter",
            model: "x-ai/grok-3",
            reason:
              "PULSE high-stakes X sentiment → Grok 3 (maximum X data quality, financial signal)",
          };
        }
        // X/Twitter social sentiment → Grok 3 Mini (ONLY model with native live X data, $0.30/M)
        // Unique: real-time X posts/trends baked into inference, not a tool call
        if (
          ctx.taskType === "social-sentiment" ||
          ctx.taskType === "x-sentiment" ||
          ctx.taskType === "community-pulse"
        ) {
          return {
            provider: "openrouter",
            model: "x-ai/grok-3-mini",
            reason:
              "PULSE social sentiment → Grok 3 Mini (native X/Twitter live data, cheapest $0.30/M)",
          };
        }
        // Real-time market news + price moves → Perplexity (live web data, cited sources)
        if (
          ctx.taskType === "market-news" ||
          ctx.taskType === "news-aggregation" ||
          ctx.taskType === "price-check" ||
          ctx.taskType === "real-time"
        ) {
          const depth: ResearchDepth = ctx.researchDepth ?? "pro";
          return {
            provider: "perplexity",
            model: PERPLEXITY_MODELS[depth],
            reason: `PULSE real-time data → Perplexity ${PERPLEXITY_MODELS[depth]} (live market web data)`,
          };
        }
        // Sentiment synthesis + narrative → Sonnet (nuanced qualitative analysis)
        if (ctx.taskType === "sentiment-analysis" || ctx.taskType === "narrative-synthesis") {
          return {
            provider: "openrouter",
            model: "anthropic/claude-sonnet-4-6",
            reason: "PULSE sentiment/narrative → Sonnet (nuanced qualitative analysis)",
          };
        }
        // Default PULSE → Gemini 2.5 Flash (1M context, built-in thinking, market data ingestion)
        return {
          provider: "openrouter",
          model: "google/gemini-2.5-flash",
          reason: "PULSE default → Gemini 2.5 Flash (1M context, thinking mode, market data)",
        };
      }

      // ── DEX 🗂️ ───────────────────────────────────────────────────────────────
      if (name === "DEX") {
        // Web research: arXiv search, blog tracking, changelog monitoring → Perplexity tier-aware
        if (
          ctx.taskType === "web-research" ||
          ctx.taskType === "changelog-monitoring" ||
          ctx.taskType === "blog-tracking" ||
          ctx.taskType === "model-monitoring"
        ) {
          const depth: ResearchDepth = ctx.researchDepth ?? "pro";
          return {
            provider: "perplexity",
            model: PERPLEXITY_MODELS[depth],
            reason: `DEX web research (${depth}) → Perplexity ${PERPLEXITY_MODELS[depth]} (real-time web)`,
          };
        }
        // Breakthrough detection → sonar-reasoning-pro (web + reasoning, highest alert quality)
        if (ctx.taskType === "breakthrough-analysis") {
          return {
            provider: "perplexity",
            model: PERPLEXITY_MODELS["reasoning"],
            reason: "DEX breakthrough → Perplexity sonar-reasoning-pro (web + reasoning)",
          };
        }
        // Deep arxiv paper analysis → Haiku + extended thinking (cost-effective for many papers)
        if (ctx.taskType === "paper-analysis") {
          return {
            provider: "openrouter",
            model: "anthropic/claude-haiku-4-5-20251001",
            reason:
              "DEX paper analysis → Haiku 4.5 + extended thinking (deep arxiv, cost-efficient)",
            extendedThinking: true,
            thinkingBudget: 8000,
          };
        }
        // Weekly digest synthesis → Sonnet (quality is critical for ARI's most important weekly output)
        if (ctx.taskType === "weekly-digest-synthesis") {
          return {
            provider: "openrouter",
            model: "anthropic/claude-sonnet-4-6",
            reason: "DEX weekly-digest-synthesis → Sonnet (quality-critical weekly output)",
          };
        }
        // Long document analysis (>50K tokens) → Gemini 2.5 Flash (1M context window)
        if (ctx.contextTokens !== undefined && ctx.contextTokens > 50_000) {
          return {
            provider: "openrouter",
            model: "google/gemini-2.5-flash",
            reason: `DEX long-doc analysis (${ctx.contextTokens} tokens) → Gemini 2.5 Flash (1M context)`,
          };
        }
        // Default DEX → Perplexity sonar-pro (research agent defaults to web-connected model)
        return {
          provider: "perplexity",
          model: PERPLEXITY_MODELS["pro"],
          reason: "DEX default → Perplexity sonar-pro (web-connected research)",
        };
      }

      // ── RUNE 🔧 (CODEX plane catches most RUNE calls above; this handles edge cases)
      if (name === "RUNE") {
        const runeModel = process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6";
        validateRuneModel(runeModel);
        if (ctx.stakes !== undefined && ctx.stakes >= 85) {
          return {
            provider: "openrouter",
            model: "anthropic/claude-opus-4-6",
            reason: "RUNE high-stakes engineering → Opus (security/architecture)",
          };
        }
        return {
          provider: "openrouter",
          model: runeModel,
          reason: "RUNE → primary model (engineering build)",
        };
      }

      // ── Default: use profile model (ARI + any unrecognized named agent)
      return {
        provider: profile.provider,
        model: profile.model,
        reason: `Named agent ${name} → ${profile.model}`,
      };
    }
  }

  // 2. Engineering tasks → RUNE routing
  if (ctx.taskType === "engineering" || ENGINEERING_PATTERNS.some((p) => p.test(ctx.prompt))) {
    const primaryModel = process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6";
    validateRuneModel(primaryModel);
    if (ctx.stakes !== undefined && ctx.stakes >= 85) {
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

  // 4. Long-context overflow → Gemini 2.5 Flash (1M context)
  if (ctx.contextTokens !== undefined && ctx.contextTokens > LONG_CONTEXT_TOKEN_THRESHOLD) {
    return {
      provider: "openrouter",
      model: "google/gemini-2.5-flash",
      reason: `Context ${ctx.contextTokens} tokens > 100K → Gemini 2.5 Flash (1M context)`,
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

// Minimum token thresholds for Anthropic prompt caching activation
const CACHE_THRESHOLD_OPUS = 4_096;
const CACHE_THRESHOLD_SONNET = 1_024;
const CACHE_THRESHOLD_HAIKU = 1_024;

/**
 * Get the appropriate cache configuration for an OpenRouter request.
 *
 * IMPORTANT: Prompt caching via cache_control is only supported for Anthropic
 * models routed through OpenRouter. Returns null for Gemini and Perplexity models.
 *
 * Named Anthropic agents use ttl=1h — stable SOUL+workspace context achieves
 * ~70% cost reduction (90% cache hit rate on SOUL.md + workspace files).
 */
export function getCacheConfig(ctx: TaskContext): CacheConfig | null {
  const tokens = ctx.contextTokens ?? 0;

  if (ctx.agentName) {
    const name = ctx.agentName.toUpperCase();
    const profile = AGENT_PROFILES[name];
    if (profile) {
      // Prompt caching only works for Anthropic models
      if (!profile.model.startsWith("anthropic/")) {
        return null;
      }
      const threshold = profile.model.includes("opus")
        ? CACHE_THRESHOLD_OPUS
        : profile.model.includes("haiku")
          ? CACHE_THRESHOLD_HAIKU
          : CACHE_THRESHOLD_SONNET;

      if (tokens >= threshold || tokens === 0) {
        return { type: "ephemeral", ttl: "1h" };
      }
    }
  }

  // Other large Anthropic prompts → 5min default TTL
  if (tokens >= CACHE_THRESHOLD_SONNET) {
    return { type: "ephemeral", ttl: "5min" };
  }

  return null;
}

/**
 * Validate RUNE_PRIMARY_MODEL format at startup.
 * Must be provider/model-name (e.g. 'anthropic/claude-sonnet-4-6', 'openai/codex-5.3').
 */
export function validateRunePrimaryModel(value: string | undefined): {
  valid: boolean;
  reason?: string;
} {
  if (!value) {
    return { valid: true };
  }
  if (!value.includes("/")) {
    return {
      valid: false,
      reason: `RUNE_PRIMARY_MODEL must be 'provider/model' format, got: ${value}`,
    };
  }
  const [provider] = value.split("/");
  const ALLOWED_PROVIDERS = ["anthropic", "openai", "google", "perplexity", "mistral"];
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return {
      valid: false,
      reason: `RUNE_PRIMARY_MODEL provider '${provider}' not in allowed list: ${ALLOWED_PROVIDERS.join(", ")}`,
    };
  }
  return { valid: true };
}
