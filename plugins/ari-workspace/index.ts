import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerWorkspaceHooks } from "./src/workspace-loader.js";

/**
 * ARI Workspace Plugin — ZOE/CODEX plane context injection.
 *
 * ZOE plane (ARI, NOVA, CHASE, PULSE, DEX) receives 7 workspace files:
 *   ~/.ari/workspace/
 *   ├── SOUL.md       — ARI identity, voice, values, security invariants
 *   ├── USER.md       — Pryce's full context (schedule, businesses, investments)
 *   ├── HEARTBEAT.md  — Proactive monitoring checklist + P-level routing
 *   ├── GOALS.md      — 30/90/365-day goals + active experiments
 *   ├── AGENTS.md     — Named agent registry, coordination rules
 *   ├── MEMORY.md     — Cross-session learnings (auto-updated by ari-memory)
 *   └── RECOVERY.md   — Disaster recovery and self-healing protocol
 *
 * Plus: ~/.ari/workspace/agents/{agentName}/SOUL.md (injected first for named agents)
 *
 * CODEX plane (RUNE — engineering only):
 *   Receives AGENTS.md ONLY. All business context is prohibited.
 *   "CODEX plane" = context isolation. Not named after any AI model.
 *
 * Loading order: SOUL (agent) → SOUL → USER → HEARTBEAT → GOALS → AGENTS → MEMORY → RECOVERY
 */
const plugin = {
  id: "ari-workspace",
  name: "ARI Workspace",
  description: "Workspace context loader: SOUL/USER/HEARTBEAT/AGENTS/RECOVERY → agent context",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerWorkspaceHooks(api);
  },
};

export default plugin;
