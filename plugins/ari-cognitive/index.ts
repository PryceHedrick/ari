import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerCognitiveHooks } from "./src/cognitive-prompt.js";

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
  id: "ari-cognitive",
  name: "ARI Cognitive",
  description: "LOGOS/ETHOS/PATHOS reasoning framework injected into every agent context",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerCognitiveHooks(api);
  },
};

export default plugin;
