/**
 * ARI Cognitive Prompt Builder — LOGOS/ETHOS/PATHOS reasoning framework.
 *
 * Distilled from src/cognition/logos/index.ts (34KB → ~50 lines).
 * 14 LOGOS functions compressed into 4 prompt templates.
 *
 * Only active when ValueScorer score ≥ 85 (opus profile = ARI orchestrator).
 * For haiku/sonnet profiles (PULSE monitoring, routine tasks), cognitive overhead
 * is wasteful — skip the framework injection entirely.
 *
 * Plan reference: Section 9 "ari-cognitive" + Section 14 Migration table.
 * Do NOT port: Qdrant, full PATHOS, full ETHOS, RL loop.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// ─── LOGOS templates (Bayesian, EV, Kelly, Systems) ──────────────────────────

const LOGOS_BLOCK = `[ARI-COGNITIVE-LOGOS]
When reasoning about decisions:
1. BAYESIAN PRIOR: State your prior probability before seeing evidence.
   Update with: P(H|E) = P(E|H) × P(H) / P(E). Report posterior.
2. EXPECTED VALUE: EV = Σ(probability × outcome). Include downside scenarios.
   Recommend if EV > 0 and max-loss is survivable.
3. KELLY SIZING: Optimal allocation = (edge / odds). Never risk ruin.
   Conservative Kelly = half-Kelly when uncertainty > 30%.
4. CONFIDENCE: Every claim carries a confidence level (0-100%).
   Distinguish high-confidence facts from speculative assumptions.`;

// ─── ETHOS templates (bias detection, pre-decision discipline) ───────────────

const ETHOS_BLOCK = `[ARI-COGNITIVE-ETHOS]
Before finalizing a recommendation:
1. BIAS CHECK: Flag if any of these are present:
   confirmation bias, availability heuristic, recency bias,
   loss aversion, anchoring, overconfidence, sunk-cost fallacy.
2. SEPARATION: Label each statement as FACT, ASSUMPTION, or INFERENCE.
3. COUNTER-ARGUMENT: State the strongest argument against your recommendation.
4. RISK FLOOR: What's the worst realistic outcome? Is it survivable?`;

// ─── PATHOS templates (framing, audience energy) ──────────────────────────────

const PATHOS_BLOCK = `[ARI-COGNITIVE-PATHOS]
For communication and narrative:
1. AUDIENCE: Who receives this? Match energy and depth to their context.
   Pryce → direct + actionable. Stakeholder → outcome-focused. Technical → precise.
2. FRAMING: Lead with the decision, not the analysis.
   Bottom line up front (BLUF). Analysis comes second.
3. RETENTION: Apply Miller's Law — max 5 items per section.
   If more is needed, group into sub-sections.`;

// ─── Synthesis template ───────────────────────────────────────────────────────

const SYNTHESIS_BLOCK = `[ARI-COGNITIVE-SYNTHESIS]
When producing final recommendations:
A) Decision + Expected Value framing (LOGOS)
B) Confidence level + key assumptions flagged (ETHOS)
C) Actionable next steps, owner, deadline (PATHOS)
Format: max 3 paragraphs. Complex decisions → structured list.`;

/** Build the full cognitive framework block for opus-profile system prompts. */
export function buildCognitivePromptBlock(): string {
  return [LOGOS_BLOCK, ETHOS_BLOCK, PATHOS_BLOCK, SYNTHESIS_BLOCK].join("\n\n");
}

/** Lightweight version for non-opus profiles — just the output structure. */
export function buildMiniCognitiveBlock(): string {
  return `[ARI-COGNITIVE-MINI]
State confidence. Separate facts from assumptions.
Include counter-argument. End with actionable decision + EV framing.`;
}

/**
 * Register cognitive hooks on the OpenClaw API.
 *
 * - 'ari:agent:context_build' with { profile: 'opus' } → inject full framework
 * - 'ari:agent:context_build' with other profiles     → inject mini block
 * - All other events                                  → no injection
 */
export function registerCognitiveHooks(api: OpenClawPluginApi): void {
  // Full cognitive framework for ARI orchestrator (opus profile, score ≥ 85)
  api.on("ari:agent:context_build", (payload: unknown) => {
    const data = payload as { profile?: string; agentName?: string };
    if (data?.profile === "opus" || data?.agentName === "ARI") {
      return { prependContext: buildCognitivePromptBlock() };
    }
    // Lightweight for all other agents — no overhead on haiku/sonnet
    return { prependContext: buildMiniCognitiveBlock() };
  });

  // Also wire the legacy event name for backward compat with any callers
  api.on("before_prompt_build", (payload: unknown) => {
    const data = payload as { profile?: string };
    if (data?.profile === "opus") {
      return { prependContext: buildCognitivePromptBlock() };
    }
    return { prependContext: buildMiniCognitiveBlock() };
  });
}
