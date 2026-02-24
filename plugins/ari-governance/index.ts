import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerGovernanceGate } from "./src/governance-gate.js";

/**
 * ARI Governance Plugin — Constitutional governance for destructive operations.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3 deferred: full Council of 15 voting + Arbiter + Overseer implementation.
 *
 * Council of 15 (preserved exactly from ARI v10):
 * Infrastructure: ATLAS(router), BOLT(executor), ECHO(memory)
 * Protection: AEGIS(guardian), SCOUT(risk)
 * Strategy: TRUE(planner), TEMPO(scheduler), OPAL(resources)
 * Life: PULSE(wellness), EMBER(relationships), PRISM(creative), MINT(wealth), BLOOM(growth)
 * Meta: VERA(ethics), NEXUS(integrator)
 *
 * Voting thresholds: MAJORITY 8/15 | SUPERMAJORITY 11/15 | UNANIMOUS 15/15
 * Source: src/governance/ (council.ts, arbiter.ts, overseer.ts, policy-engine.ts)
 */
const plugin = {
  id: "ari-governance",
  name: "ARI Governance",
  description: "Council of 15 voting + Arbiter constitutional rules + Overseer quality gates",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerGovernanceGate(api);
  },
};

export default plugin;
