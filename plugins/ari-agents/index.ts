import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerAgentCoordinator } from "./src/coordinator.js";

/**
 * ARI Agents Plugin — Swarm coordination with DAG dependency resolution.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3 deferred: full Kahn's algorithm coordinator + SwarmPods.
 *
 * Swarm Pods (3 execution lanes):
 * - Core Pod: System health, security, financial API optimization
 * - Production Pod: PayThePryce content, market analysis, video pipeline
 * - Growth Pod: Pryceless Solutions lead gen, CRM, B2B marketing automation
 *
 * Source: src/agents/ (coordinator.ts, swarm-pods.ts)
 */
const plugin = {
  id: "ari-agents",
  name: "ARI Agents",
  description: "Swarm coordination: Kahn DAG executor + Core/Production/Growth pods",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerAgentCoordinator(api);
  },
};

export default plugin;
