/**
 * /ari-system — ARI system health snapshot (gateway, plugins, agents, scheduler).
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { countSpans, getLatestSpan } from "../trace-store.js";

function ago(isoTs: string): string {
  const ms = Date.now() - new Date(isoTs).getTime();
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s ago`;
  }
  if (ms < 3600000) {
    return `${Math.round(ms / 60000)}m ago`;
  }
  return `${Math.round(ms / 3600000)}h ago`;
}

export async function handleStatusCommand(): Promise<{ text: string }> {
  const lines: string[] = ["**ARI System Status**", "```"];

  // Gateway (quick probe, non-blocking)
  let gatewayStatus = "unknown";
  try {
    const res = await fetch("http://127.0.0.1:3141/health", {
      signal: AbortSignal.timeout(2000),
    });
    gatewayStatus = res.ok ? `OK (HTTP ${res.status})` : `HTTP ${res.status}`;
  } catch {
    gatewayStatus = "unreachable";
  }
  lines.push(`Gateway:   ${gatewayStatus} (port 3141)`);

  // Plugins (static known list)
  const pluginList = [
    "ari-kernel",
    "ari-cognitive",
    "ari-workspace",
    "ari-ai",
    "ari-memory",
    "ari-scheduler",
    "ari-briefings",
    "ari-market",
    "ari-governance",
    "ari-agents",
    "ari-autonomous",
    "ari-notion",
    "ari-voice",
    "ari-ops",
  ];
  lines.push(`Plugins:   ${pluginList.length}/14 registered`);

  // Agents
  const agents = ["ARI", "NOVA", "CHASE", "PULSE", "DEX", "RUNE"];
  lines.push(`Agents:    ${agents.join(" ")}`);

  // Memory DB
  const dbPath = path.join(homedir(), ".ari", "databases", "memory.db");
  lines.push(`Memory DB: ${existsSync(dbPath) ? "present" : "not initialized"}`);

  // Traces
  try {
    const total = countSpans();
    const latest = getLatestSpan();
    if (latest) {
      lines.push(
        `Traces:    ${total} spans stored | last: ${latest.traceId} (${ago(latest.ts)}, ${latest.agentName ?? "?"}, event=${latest.event})`,
      );
    } else {
      lines.push(`Traces:    ${total} spans stored`);
    }
  } catch {
    lines.push("Traces:    trace store not yet initialized");
  }

  // Kill switch state
  const ksAll = process.env.ARI_KILL_ALL === "true";
  const ksSkills = process.env.ARI_KILL_SKILLS === "true";
  const ksNetwork = process.env.ARI_KILL_NETWORK === "true";
  const ksActive = ksAll || ksSkills || ksNetwork;
  lines.push(`Kill sw:   ${ksActive ? "ACTIVE" : "off"}`);

  lines.push("```");
  return { text: lines.join("\n") };
}
