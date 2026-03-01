/**
 * ARI Traces CLI — pnpm ari:traces
 *
 * Query recent traces from the SQLite store.
 * Usage:
 *   pnpm ari:traces                  — show last 20 spans
 *   pnpm ari:traces --n 50           — show last 50 spans
 *   pnpm ari:traces --agent ARI      — filter by agent
 *   pnpm ari:traces --trace <id>     — show full trace by ID
 */

import { queryRecent, queryByTraceId, countSpans } from "../plugins/ari-ops/src/trace-store.js";

const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const n = parseInt(getArg("--n") ?? "20", 10);
const agentFilter = getArg("--agent");
const traceId = getArg("--trace");

if (traceId) {
  // Drilldown mode
  const spans = queryByTraceId(traceId);
  console.log(`\nTrace ${traceId} (${spans.length} spans)`);
  console.log("─".repeat(70));
  for (const s of spans) {
    const time = s.ts.slice(11, 19);
    const detail = [
      s.agentName ? `agent=${s.agentName}` : "",
      s.tool ? `tool=${s.tool}` : "",
      s.model ? `model=${s.model}` : "",
      s.policyAction ? `policy=${s.policyAction}` : "",
      s.durationMs !== undefined ? `${s.durationMs}ms` : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`${s.spanId.slice(0, 6)} ${time}  ${s.event.padEnd(18)} ${detail}`);
  }
} else {
  // List mode
  const total = countSpans();
  const spans = queryRecent(n, agentFilter);
  console.log(`\nRecent Traces (${agentFilter ?? "all agents"}, n=${n}, total stored=${total})`);
  console.log("─".repeat(70));
  console.log("TRACE    SPAN   TIME       AGENT   EVENT            DETAIL");
  console.log("─".repeat(70));
  for (const s of spans) {
    const traceShort = s.traceId.slice(0, 8);
    const spanShort = s.spanId.slice(0, 6);
    const time = s.ts.slice(11, 19);
    const agent = (s.agentName ?? "-").padEnd(7);
    const event = s.event.padEnd(16);
    const detail = s.tool ?? s.model ?? s.policyRule ?? s.summary?.slice(0, 30) ?? "";
    console.log(`${traceShort} ${spanShort} ${time}  ${agent} ${event} ${detail}`);
  }
}
