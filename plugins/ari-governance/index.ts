import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerGovernanceGate } from "./src/governance-gate.js";

/**
 * ARI Governance Plugin — 3-gate model for all consequential operations.
 *
 * Three gates (plan Section 11 / ADR-governance):
 *   auto             — Low-risk ops; ARI permits with audit trace
 *   approval-required — Publish / outreach; embed in Discord approval queue, Pryce decides
 *   operator-only    — Irreversible ops; explicit slash command from Pryce required
 *
 * Every gate decision is written to a JSONL audit log with SHA-256 previousHash chain.
 * No outreach is sent, no video published, without Pryce's explicit Discord approval.
 *
 * Source: src/governance/governance-gate.ts
 */
const plugin = {
  id: "ari-governance",
  name: "ARI Governance",
  description:
    "3-gate approval model (auto / approval-required / operator-only) — Pryce approves all consequential ops",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerGovernanceGate(api);
  },
};

export default plugin;
