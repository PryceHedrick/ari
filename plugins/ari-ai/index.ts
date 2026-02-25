import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { routeToModel, computeValueScore, getCacheConfig } from "./src/value-scorer.js";

/**
 * ARI AI Plugin — ValueScorer model routing via OpenRouter
 *
 * Routes every LLM call to the highest-quality model appropriate for the task:
 *   - Named agents → designated model (APEX/CODEX plane aware)
 *   - Engineering → RUNE_PRIMARY_MODEL (Sprint 0 winner: Codex 5.3 or claude-sonnet-4-6)
 *   - Web research → Perplexity tier-aware (sonar-deep / sonar-reasoning-pro / sonar-pro / sonar)
 *   - Long context >100K → Gemini 2.5 Flash overflow
 *   - Default → ValueScore: score ≥85 → opus | 60-84 → sonnet | <60 → haiku
 *
 * ValueScore formula: (complexity × 0.40) + (stakes × 0.30) + (quality × 0.20) + (history × 0.10)
 * No hard budget caps — best model for every task. Spend tracked for visibility.
 */
const plugin = {
  id: "ari-ai",
  name: "ARI AI",
  description: "ValueScorer model routing — best model for every task, no caps",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    api.on("before_model_resolve", (event) => {
      const ctx = event as Record<string, unknown>;
      const route = routeToModel({
        agentName: typeof ctx.agentName === "string" ? ctx.agentName : undefined,
        taskType: typeof ctx.taskType === "string" ? ctx.taskType : undefined,
        prompt: typeof ctx.prompt === "string" ? ctx.prompt : "",
        contextTokens: typeof ctx.contextTokens === "number" ? ctx.contextTokens : undefined,
        researchDepth: ctx.researchDepth as "deep" | "reasoning" | "pro" | "basic" | undefined,
        complexity: typeof ctx.complexity === "number" ? ctx.complexity : undefined,
        stakes: typeof ctx.stakes === "number" ? ctx.stakes : undefined,
      });
      return {
        modelOverride: route.model,
        providerOverride: route.provider,
      };
    });
  },
};

export { routeToModel, computeValueScore, getCacheConfig };
export type { CacheConfig } from "./src/value-scorer.js";
export default plugin;
