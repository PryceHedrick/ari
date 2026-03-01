/**
 * /ari-trace <id> — drilldown timeline for a specific trace ID.
 */

import { queryByTraceId } from "../trace-store.js";

export async function handleTraceCommand(args?: string): Promise<{ text: string }> {
  const traceId = args?.trim();
  if (!traceId) {
    return { text: "Usage: /ari-trace <trace-id>" };
  }

  try {
    const spans = queryByTraceId(traceId);
    if (spans.length === 0) {
      return { text: `No spans found for trace \`${traceId}\`` };
    }

    const lines = [`**Trace ${traceId}** (${spans.length} spans)`, "```"];
    lines.push("SPAN   TIME           EVENT            DETAIL");
    lines.push("─".repeat(60));

    for (const s of spans) {
      const spanShort = s.spanId.slice(0, 6);
      const time = s.ts.slice(11, 19); // HH:MM:SS
      const event = s.event.padEnd(16);
      const detail = [
        s.agentName ? `agent=${s.agentName}` : "",
        s.tool ? `tool=${s.tool}` : "",
        s.model ? `model=${s.model}` : "",
        s.policyAction ? `policy=${s.policyAction}` : "",
        s.durationMs !== undefined && s.durationMs !== null ? `${s.durationMs}ms` : "",
        s.summary ? s.summary.slice(0, 30) : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`${spanShort} ${time}  ${event} ${detail}`);
    }

    lines.push("```");
    return { text: lines.join("\n") };
  } catch {
    return { text: "Trace store not yet initialized." };
  }
}
