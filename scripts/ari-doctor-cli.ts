/**
 * ARI Doctor CLI — pnpm ari:doctor
 *
 * Runs a full health check and prints a human-readable report.
 * Optionally probes the gateway HTTP endpoint (pass --gateway flag).
 *
 * Loads ~/.openclaw/.env before checks so API key presence matches the
 * running gateway (which sources the same file via ari-start-wrapper.sh).
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { runDoctor } from "../plugins/ari-ops/src/doctor.js";

// Load .env so provider checks reflect the same env as the running gateway.
const ENV_PATH = path.join(homedir(), ".openclaw", ".env");
if (existsSync(ENV_PATH)) {
  const lines = readFileSync(ENV_PATH, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments, empty lines, and export-only declarations
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = withoutExport.slice(0, eq).trim();
    const val = withoutExport
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    // Only set if not already in environment (shell takes precedence)
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

const probeGw = process.argv.includes("--gateway");

const report = await runDoctor({ probeGw });

console.log("\nARI Doctor Report");
console.log("=".repeat(50));

for (const check of report.checks) {
  const icon = check.ok ? "✅" : "❌";
  console.log(`${icon}  ${check.name.padEnd(30)} ${check.detail}`);
}

console.log("=".repeat(50));
console.log(`${report.summary.ok} ok  |  ${report.summary.fail} fail`);
console.log(`Timestamp: ${report.timestamp}`);

if (report.summary.fail > 0) {
  console.log("\nSome checks failed. Review the ❌ items above.");
  process.exit(1);
} else {
  console.log("\nAll checks passed.");
}
