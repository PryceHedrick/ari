#!/usr/bin/env bun
/**
 * ARI Capability Report — shows which integrations are active vs missing.
 *
 * Usage: bun scripts/capabilities-report.ts
 *
 * Exit code: 0 = all core capabilities available, 1 = one or more core capabilities missing.
 * IMPORTANT: never prints env var values — only presence/absence.
 */

import { getCapabilityStatuses } from "../src/plugins/ari-capability-registry.js";
import type { CapabilityStatus } from "../src/plugins/ari-capability-registry.js";

// Core capabilities required for basic ARI function
const CORE_CAPABILITIES = new Set(["anthropic", "discord", "perplexity"]);

// Capabilities with no plugin consumers (defer / not wired)
const DEFERRED_CAPABILITIES = new Set(["tavily", "alphavantage"]);

function formatStatus(s: CapabilityStatus): string {
  const icon = s.available ? "✅" : s.missingVars.length > 0 ? "❌" : "⚠️ ";
  const usedBy = s.usedBy.length > 0 ? s.usedBy.join(", ") : "no plugin (defer)";
  const vars = s.requiredEnvVars.join(", ") + (s.featureFlag ? ` + ${s.featureFlag}=true` : "");

  if (!s.available) {
    if (s.missingVars.length > 0) {
      const missing = s.missingVars.join(", ");
      return `  ${icon} ${s.label.padEnd(18)} missing: ${missing}  → ${usedBy}`;
    }
    // All vars present but feature flag not set
    const flagHint = s.featureFlag ? ` (set ${s.featureFlag}=true to activate)` : "";
    return `  ⚠️  ${s.label.padEnd(18)} vars present, flag not set${flagHint}  → ${usedBy}`;
  }

  return `  ${icon} ${s.label.padEnd(18)} ${vars.padEnd(40)} → ${usedBy}`;
}

function main(): void {
  const statuses = getCapabilityStatuses();
  const now = new Date().toISOString();

  console.log(`\nARI Capability Report  (${now})\n`);

  const core = statuses.filter((s) => CORE_CAPABILITIES.has(s.name));
  const extended = statuses.filter(
    (s) =>
      !CORE_CAPABILITIES.has(s.name) && !DEFERRED_CAPABILITIES.has(s.name) && s.usedBy.length > 0,
  );
  const deferred = statuses.filter(
    (s) => DEFERRED_CAPABILITIES.has(s.name) || s.usedBy.length === 0,
  );

  console.log("Core (required)");
  for (const s of core) {
    console.log(formatStatus(s));
  }

  console.log("\nExtended (keys + plugins)");
  for (const s of extended) {
    console.log(formatStatus(s));
  }

  if (deferred.length > 0) {
    console.log("\nDeferred (no plugin wired yet)");
    for (const s of deferred) {
      console.log(formatStatus(s));
    }
  }

  // Hints for flags that are not set
  const flagHints: string[] = [];
  for (const s of statuses) {
    if (s.featureFlag && !s.available && s.missingVars.length === 0) {
      flagHints.push(`To activate ${s.label}: add ${s.featureFlag}=true to ~/.openclaw/.env`);
    }
  }
  if (flagHints.length > 0) {
    console.log("");
    for (const hint of flagHints) {
      console.log(`  💡 ${hint}`);
    }
  }

  console.log("");

  // Exit 1 if any core capability is missing
  const missingCore = core.filter((s) => !s.available && s.missingVars.length > 0);
  if (missingCore.length > 0) {
    const names = missingCore.map((s) => s.label).join(", ");
    console.error(`ERROR: core capabilities missing: ${names}`);
    process.exit(1);
  }
}

main();
