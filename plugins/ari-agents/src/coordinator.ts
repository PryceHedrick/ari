import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * ARI Named Agent Coordinator
 *
 * Six named agents with distinct model routing, SOUL files, and context planes:
 *   ARI   🧠  claude-opus-4-6    APEX   CFO/Orchestrator
 *   NOVA  🎬  claude-sonnet-4-6  APEX   P1 Content Creator
 *   CHASE 🎯  claude-sonnet-4-6  APEX   P2 Lead Connector
 *   PULSE 🔮  claude-haiku-4-5   APEX   Market Analyst
 *   DEX   🗂️  claude-haiku-4-5   APEX   Research Scout
 *   RUNE  🔧  claude-sonnet-4-6  CODEX  Engineering Builder
 *
 * ValueScorer routes to the highest-quality model appropriate for each task.
 * No hard budget caps — best model wins. Cost is tracked, not capped.
 */

type AgentProfile = {
  name: string;
  emoji: string;
  role: string;
  model: string;
  provider: string;
  plane: "apex" | "codex";
};

// Named agent registry — the six members of Pryce's empire
export const NAMED_AGENTS: Record<string, AgentProfile> = {
  ARI: {
    name: "ARI",
    emoji: "🧠",
    role: "CFO / Meta-Orchestrator",
    model: "anthropic/claude-opus-4-6",
    provider: "openrouter",
    plane: "apex",
  },
  NOVA: {
    name: "NOVA",
    emoji: "🎬",
    role: "P1 Content Creator",
    model: "anthropic/claude-sonnet-4-6",
    provider: "openrouter",
    plane: "apex",
  },
  CHASE: {
    name: "CHASE",
    emoji: "🎯",
    role: "P2 Lead Connector",
    model: "anthropic/claude-sonnet-4-6",
    provider: "openrouter",
    plane: "apex",
  },
  PULSE: {
    name: "PULSE",
    emoji: "🔮",
    role: "Market Analyst",
    model: "anthropic/claude-haiku-4-5",
    provider: "openrouter",
    plane: "apex",
  },
  DEX: {
    name: "DEX",
    emoji: "🗂️",
    role: "Research Scout",
    model: "anthropic/claude-haiku-4-5",
    provider: "openrouter",
    plane: "apex",
  },
  RUNE: {
    name: "RUNE",
    emoji: "🔧",
    role: "Engineering Builder",
    model: "anthropic/claude-sonnet-4-6",
    provider: "openrouter",
    plane: "codex",
  },
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
