/**
 * ARI ValueScorer — Intelligent model routing for all LLM calls
 *
 * Routing priority (highest to lowest):
 *   1. CODEX plane → RUNE_PRIMARY_MODEL (engineering context)
 *   2. Named agent → task-type-aware multi-tier routing
 *      ARI:   Sonnet default; Opus for deep/high-stakes (stakes≥85 or complexity≥80)
 *      ARI-DEEP: always Opus
 *      NOVA:  outline/brief → Haiku | default → Sonnet | polish/final → Opus
 *      CHASE: discovery/score → Haiku | default → Sonnet | deep/high-stakes → Opus
 *      PULSE: market-news → Perplexity sonar-pro | sentiment → xAI Grok | default → Gemini 2.5 Flash
 *      DEX:   web/changelog → Perplexity sonar-pro | breakthrough → sonar-reasoning-pro
 *             paper-analysis → Haiku+thinking | synthesis → Sonnet | long-doc → Gemini 2.5 Flash
 *             default → Perplexity sonar-pro
 *      RUNE:  3-tier: Codex OAuth → OpenAI API → Anthropic Sonnet
 *   3. Engineering task patterns → RUNE_PRIMARY_MODEL
 *   4. Web research patterns → Perplexity tier-aware
 *   5. Long context >100K → Gemini 2.5 Flash overflow
 *   6. Image generation → DALL-E 3
 *   7. Audio transcription → Whisper
 *   8. Default → Claude ValueScore (complexity+stakes+quality+history)
 *
 * All providers: direct API keys (no OpenRouter proxy).
 * Spend tracked via per-provider dashboards.
 *
 * Capability fallbacks (applied automatically):
 *   google absent (GEMINI_API_KEY)   → anthropic claude-sonnet-4-6
 *   xai absent (XAI_API_KEY)         → anthropic claude-haiku-4-5-20251001
 *   perplexity absent (PERPLEXITY_API_KEY) → anthropic claude-haiku-4-5-20251001
 *
 * Prompt caching (Anthropic models only):
 *   Named agents (Anthropic): ttl=1h (~70% cost reduction on stable SOUL+workspace)
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
  provider:
    | "anthropic"
    | "openrouter"
    | "perplexity"
    | "google"
    | "openai"
    | "xai"
    | "openai-codex";
  model: string;
  reason: string;
  extendedThinking?: boolean;
  thinkingBudget?: number;
};

// Named agent profiles — default model when no task-type override applies.
// Note: RUNE uses the 3-tier fallback in routeToModel(); profile is documentation only.
export const AGENT_PROFILES: Record<string, { model: string; provider: ModelRoute["provider"] }> = {
  ARI: { model: "claude-sonnet-4-6", provider: "anthropic" }, // Sonnet default; Opus escalates for high-stakes
  "ARI-DEEP": { model: "claude-opus-4-6", provider: "anthropic" }, // always Opus
  NOVA: { model: "claude-sonnet-4-6", provider: "anthropic" },
  CHASE: { model: "claude-sonnet-4-6", provider: "anthropic" },
  PULSE: { model: "gemini-2.5-flash", provider: "google" }, // 1M context, built-in thinking
  DEX: { model: "perplexity/sonar-pro", provider: "perplexity" }, // keep prefix — perplexity strips it
  RUNE: { model: "gpt-5.3-codex", provider: "openai-codex" }, // 3-tier at runtime; profile is fallback docs
};

// Perplexity tier-aware routing — real-time web search native to model.
// IMPORTANT: keep "perplexity/" prefix — OpenClaw's perplexity provider strips it when forwarding.
export const PERPLEXITY_MODELS: Record<ResearchDepth, string> = {
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
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5",
};

/**
 * Parse RUNE_PRIMARY_MODEL env var (format: "provider/model-name") into provider + model.
 * Falls back to anthropic/claude-sonnet-4-6 for unrecognized formats.
 */
function parseRuneModelEnv(modelEnv: string): {
  provider: ModelRoute["provider"];
  modelName: string;
} {
  const slashIdx = modelEnv.indexOf("/");
  if (slashIdx < 0) {
    // No prefix — assume anthropic (backward compat)
    return { provider: "anthropic", modelName: modelEnv };
  }
  const prefix = modelEnv.slice(0, slashIdx);
  const modelName = modelEnv.slice(slashIdx + 1);
  switch (prefix) {
    case "openai":
      return { provider: "openai", modelName };
    case "openai-codex":
      return { provider: "openai-codex", modelName };
    case "anthropic":
      return { provider: "anthropic", modelName };
    case "google":
      return { provider: "google", modelName };
    case "perplexity":
      return { provider: "perplexity", modelName: modelEnv }; // keep full for perplexity
    default:
      return { provider: "anthropic", modelName: modelEnv };
  }
}

/**
 * Detect Codex OAuth subscription at runtime.
 * Primary: RUNE_CODEX_AVAILABLE=true env var (for testing + explicit override).
 * Future: will query auth profile store when importable from plugin context.
 */
function hasCodexOAuth(): boolean {
  return process.env.RUNE_CODEX_AVAILABLE === "true";
}

/**
 * Apply capability fallbacks when a provider's key is absent.
 * Never logs or throws — silently degrades to next available provider.
 */
function applyCapabilityFallbacks(route: ModelRoute): ModelRoute {
  if (route.provider === "google" && !process.env.GEMINI_API_KEY?.trim()) {
    return {
      ...route,
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      reason: `${route.reason} [fallback: GEMINI_API_KEY absent → anthropic/sonnet]`,
    };
  }
  if (route.provider === "xai" && !process.env.XAI_API_KEY?.trim()) {
    return {
      ...route,
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      reason: `${route.reason} [fallback: XAI_API_KEY absent → anthropic/haiku]`,
    };
  }
  if (route.provider === "perplexity" && !process.env.PERPLEXITY_API_KEY?.trim()) {
    return {
      ...route,
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      reason: `${route.reason} [fallback: PERPLEXITY_API_KEY absent → anthropic/haiku]`,
    };
  }
  return route;
}

/**
 * Route a task to the best model.
 * Priority: CODEX → named agent (task-type-aware) → engineering → research → long-context → ValueScore
 * All routes pass through applyCapabilityFallbacks before returning.
 */
export function routeToModel(ctx: TaskContext): ModelRoute {
  return applyCapabilityFallbacks(resolveModel(ctx));
}

function resolveModel(ctx: TaskContext): ModelRoute {
  // 0. CODEX plane fast-path — always routes to RUNE_PRIMARY_MODEL
  if (ctx.plane === "codex") {
    const runeEnv = process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6";
    const { provider, modelName } = parseRuneModelEnv(runeEnv);
    return {
      provider,
      model: modelName,
      reason: "CODEX plane → RUNE primary model (engineering)",
    };
  }

  // 1. Named agent — task-type-aware multi-tier routing
  if (ctx.agentName) {
    const name = ctx.agentName.toUpperCase();
    const profile = AGENT_PROFILES[name];
    if (profile) {
      // ── ARI 🧠 / ARI-DEEP ────────────────────────────────────────────────────
      if (name === "ARI" || name === "ARI-DEEP") {
        if (name === "ARI-DEEP") {
          return {
            provider: "anthropic",
            model: "claude-opus-4-6",
            reason: "ARI-DEEP → always Opus (deep analysis mode)",
          };
        }
        // ARI default: Sonnet; escalate to Opus for high-stakes / deep / complex tasks
        const isDeepMode = ctx.taskType === "deep" || ctx.taskType === "deep-analysis";
        const escalate =
          isDeepMode ||
          (ctx.stakes !== undefined && ctx.stakes >= 85) ||
          (ctx.complexity !== undefined && ctx.complexity >= 80);
        return {
          provider: "anthropic",
          model: escalate ? "claude-opus-4-6" : "claude-sonnet-4-6",
          reason: escalate
            ? "ARI high-stakes/deep → Opus (orchestration, quality-critical)"
            : "ARI routine → Sonnet (cost-efficient default)",
        };
      }

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
            provider: "anthropic",
            model: "claude-haiku-4-5",
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
            provider: "anthropic",
            model: "claude-opus-4-6",
            reason: "NOVA final polish → Opus (quality-critical, Pryce-facing output)",
          };
        }
        // High-stakes NOVA → Opus
        if (ctx.stakes !== undefined && ctx.stakes >= 85) {
          return {
            provider: "anthropic",
            model: "claude-opus-4-6",
            reason: "NOVA high-stakes → Opus (quality-critical output)",
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
            provider: "anthropic",
            model: "claude-haiku-4-5",
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
            provider: "anthropic",
            model: "claude-opus-4-6",
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
            provider: "xai",
            model: "grok-3",
            reason:
              "PULSE high-stakes X sentiment → Grok 3 (maximum X data quality, financial signal)",
          };
        }
        // X/Twitter social sentiment → Grok 3 Mini (native live X data, $0.30/M)
        // Unique: real-time X posts/trends baked into inference, not a tool call
        if (
          ctx.taskType === "social-sentiment" ||
          ctx.taskType === "x-sentiment" ||
          ctx.taskType === "community-pulse"
        ) {
          return {
            provider: "xai",
            model: "grok-3-mini",
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
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            reason: "PULSE sentiment/narrative → Sonnet (nuanced qualitative analysis)",
          };
        }
        // Default PULSE → Gemini 2.5 Flash (1M context, built-in thinking, market data ingestion)
        return {
          provider: "google",
          model: "gemini-2.5-flash",
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
            provider: "anthropic",
            model: "claude-haiku-4-5-20251001",
            reason:
              "DEX paper analysis → Haiku 4.5 + extended thinking (deep arxiv, cost-efficient)",
            extendedThinking: true,
            thinkingBudget: 8000,
          };
        }
        // Weekly digest synthesis → Sonnet (quality is critical for ARI's most important weekly output)
        if (ctx.taskType === "weekly-digest-synthesis") {
          return {
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            reason: "DEX weekly-digest-synthesis → Sonnet (quality-critical weekly output)",
          };
        }
        // Long document analysis (>50K tokens) → Gemini 2.5 Flash (1M context window)
        if (ctx.contextTokens !== undefined && ctx.contextTokens > 50_000) {
          return {
            provider: "google",
            model: "gemini-2.5-flash",
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
        // 3-tier: Codex OAuth subscription → OpenAI API → Anthropic Sonnet
        if (hasCodexOAuth()) {
          return {
            provider: "openai-codex",
            model: "gpt-5.3-codex",
            reason: "RUNE → Codex OAuth subscription (free, no API cost)",
          };
        }
        if (process.env.OPENAI_API_KEY?.trim()) {
          const runeEnv = process.env.RUNE_PRIMARY_MODEL;
          const modelName = runeEnv ? parseRuneModelEnv(runeEnv).modelName : "gpt-4.1";
          return {
            provider: "openai",
            model: modelName,
            reason: "RUNE → OpenAI API (OPENAI_API_KEY present)",
          };
        }
        return {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          reason: "RUNE → Anthropic fallback (no OpenAI auth)",
        };
      }

      // ── Default: use profile model (any unrecognized named agent)
      return {
        provider: profile.provider,
        model: profile.model,
        reason: `Named agent ${name} → ${profile.model}`,
      };
    }
  }

  // 2. Engineering tasks → RUNE routing
  if (ctx.taskType === "engineering" || ENGINEERING_PATTERNS.some((p) => p.test(ctx.prompt))) {
    if (ctx.stakes !== undefined && ctx.stakes >= 85) {
      return {
        provider: "anthropic",
        model: "claude-opus-4-6",
        reason: "High-stakes engineering → Opus (security/architecture)",
      };
    }
    const runeEnv = process.env.RUNE_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-6";
    const { provider, modelName } = parseRuneModelEnv(runeEnv);
    return {
      provider,
      model: modelName,
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
      provider: "google",
      model: "gemini-2.5-flash",
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
    provider: "anthropic",
    model: TIER_MODEL_MAP[tier],
    reason: `ValueScore ${Math.round(score)} → ${tier} (${TIER_MODEL_MAP[tier]})`,
  };
}

// === PROMPT CACHING ===

export type CacheConfig = {
  type: "ephemeral";
  ttl: "5min" | "1h";
};

// Minimum token thresholds for Anthropic prompt caching activation
const CACHE_THRESHOLD_OPUS = 4_096;
const CACHE_THRESHOLD_SONNET = 1_024;
const CACHE_THRESHOLD_HAIKU = 1_024;

/**
 * Get the appropriate cache configuration for an Anthropic direct API request.
 *
 * IMPORTANT: Prompt caching via cache_control is only supported for Anthropic models.
 * Returns null for Gemini, Perplexity, xAI, and OpenAI models.
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
      if (profile.provider !== "anthropic") {
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
 * Must be provider/model-name (e.g. 'anthropic/claude-sonnet-4-6', 'openai/gpt-5.3-codex').
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
  const ALLOWED_PROVIDERS = [
    "anthropic",
    "openai",
    "openai-codex",
    "google",
    "perplexity",
    "mistral",
  ];
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return {
      valid: false,
      reason: `RUNE_PRIMARY_MODEL provider '${provider}' not in allowed list: ${ALLOWED_PROVIDERS.join(", ")}`,
    };
  }
  return { valid: true };
}
