/**
 * /ari-recent [n] [agent] — show recent trace spans.
 */

import { queryRecent } from "../trace-store.js";

function ago(isoTs: string): string {
  const ms = Date.now() - new Date(isoTs).getTime();
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < 3600000) {
    return `${Math.round(ms / 60000)}m`;
  }
  return `${Math.round(ms / 3600000)}h`;
}

export async function handleRecentCommand(args?: string): Promise<{ text: string }> {
  const parts = (args ?? "").trim().split(/\s+/).filter(Boolean);
  let limit = 10;
  let agentFilter: string | undefined;

  for (const part of parts) {
    const n = parseInt(part, 10);
    if (!isNaN(n) && n > 0 && n <= 50) {
      limit = n;
    } else if (/^[A-Z]+$/.test(part)) {
      agentFilter = part;
    }
  }

  try {
    const spans = queryRecent(limit, agentFilter);
    if (spans.length === 0) {
      return {
        text: `**Recent Traces** (${agentFilter ?? "all agents"})\nNo traces recorded yet.`,
      };
    }

    const lines = [`**Recent Traces** (${agentFilter ?? "all"}, n=${limit})`, "```"];
    lines.push("TRACE    SPAN   AGO    AGENT   EVENT            TOOL/MODEL");
    lines.push("─".repeat(65));

    for (const s of spans) {
      const traceShort = s.traceId.slice(0, 8);
      const spanShort = s.spanId.slice(0, 6);
      const ageStr = ago(s.ts).padEnd(5);
      const agent = (s.agentName ?? "-").padEnd(7);
      const event = s.event.padEnd(16);
      const extra = s.tool ?? s.model ?? s.policyRule ?? "";
      lines.push(`${traceShort} ${spanShort} ${ageStr}  ${agent} ${event} ${extra.slice(0, 20)}`);
    }

    lines.push("```");
    return { text: lines.join("\n") };
  } catch {
    return { text: "Trace store not yet initialized. Run some commands first." };
  }
}
