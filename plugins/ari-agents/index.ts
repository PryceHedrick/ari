import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerAgentCoordinator } from "./src/coordinator.js";

/**
 * ARI Agents Plugin — Named agent coordinator for Pryce's empire.
 *
 * Six named agents. Each has a personality (SOUL file), a designated model,
 * and a context plane — ZOE or CODEX:
 *
 *   ZOE plane  (full business context: SOUL files + workspace + goals):
 *     ARI   🧠  claude-opus-4-6    CFO/Orchestrator
 *     NOVA  🎬  claude-sonnet-4-6  P1 Content Creator (PayThePryce)
 *     CHASE 🎯  claude-sonnet-4-6  P2 Lead Connector (Pryceless Solutions)
 *     PULSE 📡  claude-haiku-4-5   Market Analyst
 *     DEX   🗂️  claude-haiku-4-5   Research Scout
 *
 *   CODEX plane  (engineering only — NO business context, NO SOUL files):
 *     RUNE  🔧  claude-sonnet-4-6  Engineering Builder
 *
 * Note: "CODEX plane" = engineering context isolation. Separate from any model named Codex.
 * validateContextBundlePlane() throws at spawn time if RUNE receives SOUL.md/USER.md/etc.
 */
const plugin = {
  id: "ari-agents",
  name: "ARI Agents",
  description:
    "ARI named agent coordinator — ZOE plane (ARI/NOVA/CHASE/PULSE/DEX) + CODEX plane (RUNE, engineering-only context)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerAgentCoordinator(api);
  },
};

export default plugin;
