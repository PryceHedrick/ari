/**
 * /ari-doctor — deep health check with provider/agent/skill/kill-switch report.
 */

import { runDoctor } from "../doctor.js";

export async function handleDoctorCommand(args?: string): Promise<{ text: string }> {
  const probeGw = args?.includes("--gateway") ?? false;
  const report = await runDoctor({ probeGw });

  const lines: string[] = ["**ARI Doctor Report**", "```"];

  for (const check of report.checks) {
    const icon = check.ok ? "✅" : "❌";
    lines.push(`${icon} ${check.name.padEnd(28)} ${check.detail}`);
  }

  lines.push("");
  lines.push(
    `Summary: ${report.summary.ok} ok, ${report.summary.fail} fail — ${new Date(report.timestamp).toLocaleTimeString()}`,
  );
  lines.push("```");

  return { text: lines.join("\n") };
}
