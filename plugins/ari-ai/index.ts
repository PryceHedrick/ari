import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI AI Plugin — RL-based model routing via OpenRouter.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: ValueScorer Q-learning + OpenRouter endpoint + circuit breaker.
 *
 * ValueScorer routing (PRESERVED from ARI v10):
 * rawScore = complexity*0.35 + stakes*0.25 + qualityPriority*0.2 + budget*0.1 + history*0.1
 * - Score >= 85  → anthropic/claude-opus-4.6
 * - Score 60-85  → anthropic/claude-sonnet-4.5
 * - Score < 50   → anthropic/claude-haiku-4.5
 * - Heartbeat    → anthropic/claude-haiku-3
 * - Context >600K chars → anthropic/claude-opus-4.6 (1M window)
 *
 * Budget guardrails: $1/day soft → $2/day hard → $5/day emergency (P0 only)
 * Source: src/ai/ (value-scorer.ts, model-registry.ts, circuit-breaker.ts)
 */
const plugin = {
  id: 'ari-ai',
  name: 'ARI AI',
  description: 'ValueScorer RL model routing + OpenRouter gateway + budget guardrails',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: Override OpenClaw model selection with ValueScorer
    // Phase 3: api.registerService({ id: 'model-router', start: initValueScorer })
    // Phase 3: api.registerService({ id: 'budget-tracker', start: initBudgetTracker })
  },
};

export default plugin;
