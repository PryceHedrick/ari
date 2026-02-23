import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Cognitive Plugin — LOGOS/ETHOS/PATHOS reasoning framework.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: injects cognitive framework into every agent's system prompt.
 *
 * Tools to register (Phase 3):
 * - ari_bayesian_update      — Update beliefs with evidence
 * - ari_expected_value       — Calculate decision value
 * - ari_kelly_fraction       — Optimal position sizing
 * - ari_detect_bias          — 10 cognitive bias types
 * - ari_emotional_state      — VAD model (Valence/Arousal/Dominance)
 * - ari_reframe_thought      — CBT reframing (10 distortions)
 * - ari_stoic_dichotomy      — Control vs no-control analysis
 * - ari_query_wisdom         — 9 wisdom traditions
 * - ari_synthesize           — Combined LOGOS+ETHOS+PATHOS synthesis
 *
 * Source: src/cognition/ (logos.ts, ethos.ts, pathos.ts, synthesis.ts)
 */
const plugin = {
  id: 'ari-cognitive',
  name: 'ARI Cognitive',
  description: 'LOGOS/ETHOS/PATHOS reasoning framework injected into every agent context',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerHook('system_prompt_builder', injectCognitiveFramework)
    // Phase 3: register 9 cognitive tools
  },
};

export default plugin;
