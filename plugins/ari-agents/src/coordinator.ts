import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * ARI Named Agent Coordinator
 *
 * ZOE plane (full business context — SOUL files + workspace + goals):
 *   ARI   🧠  claude-opus-4-6    CFO / Meta-Orchestrator
 *   NOVA  🎬  claude-sonnet-4-6  P1 Content Creator (PayThePryce)
 *   CHASE 🎯  claude-sonnet-4-6  P2 Lead Connector (Pryceless Solutions)
 *   PULSE 🔮  claude-haiku-4-5   Market Analyst
 *   DEX   🗂️  claude-haiku-4-5   Research Scout
 *
 * CODEX plane (engineering only — task spec + AGENTS.md, NO SOUL files, NO business context):
 *   RUNE  🔧  claude-sonnet-4-6  Engineering Builder
 *
 * Model routing is handled exclusively by ari-ai (ValueScorer + AGENT_PROFILES).
 * This module owns: registry, capability cards, plane enforcement.
 */

// Context plane for each agent:
//   "zoe"   = full business context (ZOE plane): ARI, NOVA, CHASE, PULSE, DEX
//   "codex" = engineering context only (CODEX plane): RUNE only
//   Note: "codex" plane name ≠ "OpenAI Codex" model. The plane isolates context, not model choice.
type AgentProfile = {
  name: string;
  emoji: string;
  role: string;
  plane: "zoe" | "codex";
};

// Named agent registry — the six members of Pryce's empire
export const NAMED_AGENTS: Record<string, AgentProfile> = {
  ARI: { name: "ARI", emoji: "🧠", role: "CFO / Meta-Orchestrator", plane: "zoe" },
  NOVA: { name: "NOVA", emoji: "🎬", role: "P1 Content Creator", plane: "zoe" },
  CHASE: { name: "CHASE", emoji: "🎯", role: "P2 Lead Connector", plane: "zoe" },
  PULSE: { name: "PULSE", emoji: "🔮", role: "Market Analyst", plane: "zoe" },
  DEX: { name: "DEX", emoji: "🗂️", role: "Research Scout", plane: "zoe" },
  RUNE: { name: "RUNE", emoji: "🔧", role: "Engineering Builder", plane: "codex" },
};

/**
 * Validate APEX/CODEX plane context enforcement.
 * Called at agent spawn time — throws on violation.
 */
export function validateContextBundlePlane(
  agentName: string | undefined,
  contextFiles: string[],
): void {
  if (!agentName) {
    return;
  }
  const name = agentName.toUpperCase();
  const profile = NAMED_AGENTS[name];
  if (!profile || profile.plane !== "codex") {
    return;
  }

  const prohibited = contextFiles.filter(
    (f) =>
      f !== "AGENTS.md" && !f.startsWith("task-spec") && !f.endsWith(".ts") && !f.endsWith(".md"),
  );

  // SOUL files are prohibited for CODEX plane
  const hasSoulFiles = contextFiles.some(
    (f) =>
      f === "SOUL.md" ||
      f === "USER.md" ||
      f === "HEARTBEAT.md" ||
      f === "GOALS.md" ||
      f === "MEMORY.md",
  );

  if (hasSoulFiles || prohibited.length > 0) {
    const violations = contextFiles
      .filter((f) => ["SOUL.md", "USER.md", "HEARTBEAT.md", "GOALS.md", "MEMORY.md"].includes(f))
      .join(", ");
    throw new Error(
      `[ARI-GOVERNANCE] CODEX plane violation for ${name}: PROHIBITED files detected: ${violations}. ` +
        "RUNE/CODEX agents NEVER receive SOUL files, workspace files, or business context.",
    );
  }
}

/**
 * Get agent capability card for the registry.
 * Used by ari-agents to route tasks to the best available agent.
 */
export function getAgentCapabilityCard(agentName: string): AgentProfile | undefined {
  return NAMED_AGENTS[agentName.toUpperCase()];
}

export function registerAgentCoordinator(_api: OpenClawPluginApi): void {
  // Model routing is handled exclusively by ari-ai (before_model_resolve).
  // This function registers the agent registry — do NOT re-register the routing
  // hook here as it would shadow ari-ai's comprehensive Perplexity/Gemini routing.
  // NAMED_AGENTS, resolveAgentModel, and getAgentCapabilityCard are exported
  // for direct consumption by other plugins.
}
