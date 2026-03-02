/**
 * ARI Context Plane Names — canonical type + backward-compat normalizer.
 *
 * Canonical names (as of Phase 9):
 *   "mission" — full business context (ARI, NOVA, CHASE, PULSE, DEX)
 *               replaces deprecated "zoe" and "apex"
 *   "build"   — engineering-only context (RUNE — task spec + AGENTS.md)
 *               replaces deprecated "codex" (the plane name; NOT the model name)
 *
 * The model name "gpt-5.3-codex", provider "openai-codex", and env var
 * RUNE_CODEX_AVAILABLE are unchanged — they refer to the OpenAI Codex model,
 * not the context plane.
 */

export type ContextPlane = "mission" | "build";

/**
 * Normalize a raw plane string (including legacy values from DB or old config)
 * to the canonical ContextPlane type.
 *
 * Accepts:
 *   "mission" → "mission"  (canonical)
 *   "zoe"     → "mission"  (legacy)
 *   "apex"    → "mission"  (legacy — was used in value-scorer.ts)
 *   "build"   → "build"    (canonical)
 *   "codex"   → "build"    (legacy — plane name, not model)
 *   anything else → "mission" (safe default)
 */
export function normalizePlane(raw: string): ContextPlane {
  if (raw === "build" || raw === "codex") {
    return "build";
  }
  // "mission", "zoe", "apex", or unknown → mission
  return "mission";
}
