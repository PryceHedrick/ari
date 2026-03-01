/**
 * ARI Doctor CLI — pnpm ari:doctor
 *
 * Runs a full health check and prints a human-readable report.
 * Optionally probes the gateway HTTP endpoint (pass --gateway flag).
 */

import { runDoctor } from "../plugins/ari-ops/src/doctor.js";

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
