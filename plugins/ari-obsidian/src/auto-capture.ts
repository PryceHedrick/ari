/**
 * ARI Obsidian Auto-Capture — hook wiring + signal scoring + vault write.
 *
 * Captures high-signal interactions to vault without requiring user action.
 * All content is redacted before writing. trace_id always present.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { redact } from "../../ari-ops/src/redactor.js";
import { ariBus } from "../../ari-shared/src/event-bus.js";
import { scoreEvent, hasDecisionKeyword, extractMarkdownTasks } from "./signal-scorer.js";
import { getVaultDb } from "./vault-index.js";
import {
  newTraceHex,
  writeVaultFile,
  appendVaultFile,
  vaultFileExists,
  readVaultFile,
} from "./vault-manager.js";

const NEVER_STORE = ["sk-", "Bearer ", "api_key=", "password=", "token=", "secret="];

function deepRedact(text: string): string {
  let result = redact(text);
  for (const pattern of NEVER_STORE) {
    if (result.includes(pattern)) {
      const lines = result.split("\n");
      result = lines
        .map((line) => (NEVER_STORE.some((p) => line.includes(p)) ? "[REDACTED LINE]" : line))
        .join("\n");
    }
  }
  return result;
}

function getMinSignalScore(): number {
  return parseInt(process.env.ARI_OBSIDIAN_MIN_SIGNAL_SCORE ?? "7", 10);
}

function isEnabled(): boolean {
  return process.env.ARI_OBSIDIAN_ENABLED !== "false";
}

function todayPath(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `40-Logs/Daily/${today}.md`;
}

function inboxPath(traceId: string): string {
  return `00-Inbox/trace-${traceId}.md`;
}

function incidentPath(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `20-Areas/Operations/Incidents/${today}-incidents.md`;
}

function formatFragment(opts: {
  traceId: string;
  agent: string;
  eventType: string;
  summary: string;
  score: number;
  tags: string[];
}): string {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const date = now.toISOString().slice(0, 10);
  return `---
type: interaction-fragment
date: ${date}
source: ari-obsidian-autocapture
trace_id: ${opts.traceId}
tags: [auto, ${opts.agent}, ${opts.eventType}]
signal_score: ${opts.score}
---
## [${time}] ${opts.agent} — ${opts.eventType}

**Agent**: ${opts.agent}
**Summary**: ${opts.summary}
**Signal score**: ${opts.score}/10
`;
}

function appendToDaily(fragment: string): void {
  const dp = todayPath();
  const header = "\n## Notable Interactions\n";
  if (!vaultFileExists(dp)) {
    return;
  }
  const existing = readVaultFile(dp);
  if (!existing.includes("## Notable Interactions")) {
    appendVaultFile(dp, header + "\n" + fragment + "\n");
  } else {
    appendVaultFile(dp, "\n" + fragment + "\n");
  }
}

export function writeCapture(opts: {
  traceId: string;
  agent: string;
  eventType: string;
  summary: string;
  score: number;
  isIncident?: boolean;
}): void {
  if (!isEnabled()) {
    return;
  }
  const tags = [opts.eventType];
  const fragment = formatFragment({ ...opts, tags });

  // Score ≥ threshold → append to daily note
  if (opts.score >= getMinSignalScore()) {
    appendToDaily(fragment);
  }

  // Score ≥ 9 → also create inbox fragment
  if (opts.score >= 9) {
    writeVaultFile(inboxPath(opts.traceId), fragment);
  }

  // Incident → write to incidents file
  if (opts.isIncident) {
    appendVaultFile(incidentPath(), "\n" + fragment + "\n");
  }

  // Decision detection
  if (hasDecisionKeyword(opts.summary)) {
    appendDecisionLog(opts.traceId, opts.agent, opts.summary);
  }

  // Task extraction
  const tasks = extractMarkdownTasks(opts.summary);
  if (tasks.length > 0) {
    const db = getVaultDb();
    for (const task of tasks) {
      db.prepare(`
        INSERT INTO tasks (text, source, source_trace_id, created_at)
        VALUES (?, 'auto', ?, ?)
      `).run(task, opts.traceId, new Date().toISOString());
    }
  }
}

function appendDecisionLog(traceId: string, agent: string, summary: string): void {
  const decPath = "20-Areas/Operations/Decisions.md";
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace("T", " ");
  const brief = summary.slice(0, 100);
  const entry = `\n---\n## [${dateStr}] Decision detected\n\n**Agent**: ${agent} | **Trace**: [[00-Inbox/trace-${traceId}]]\n**Decision**: ${brief}\n`;
  appendVaultFile(decPath, entry);
}

/** Wire auto-capture hooks into the OpenClaw plugin API + ariBus. */
export function wireAutoCapture(api: OpenClawPluginApi): void {
  if (!isEnabled()) {
    return;
  }

  // Hook: message_sending — capture long responses / tool-using responses
  api.on("message_sending", (event) => {
    const ctx = event as Record<string, unknown>;
    const text = typeof ctx.text === "string" ? ctx.text : "";
    const channel = typeof ctx.channelId === "string" ? ctx.channelId : "";
    const hasTools = typeof ctx.toolCallCount === "number" && ctx.toolCallCount > 0;

    const scored = scoreEvent({
      eventType: "message_sending",
      channel,
      responseLength: text.length,
      hasToolCalls: hasTools,
    });

    if (scored.score >= getMinSignalScore() || scored.alwaysCapture) {
      const traceId = newTraceHex();
      const summary = deepRedact(text.slice(0, 500));
      writeCapture({
        traceId,
        agent: "ARI",
        eventType: "response",
        summary,
        score: scored.score,
      });
    }

    return {};
  });

  // Hook: after_tool_call with error
  api.on("after_tool_call", (event) => {
    const ctx = event as Record<string, unknown>;
    const hasError = typeof ctx.error === "string" && ctx.error.length > 0;
    if (!hasError) {
      return;
    }

    const scored = scoreEvent({ eventType: "tool_error", hasError: true });
    const traceId = newTraceHex();
    writeCapture({
      traceId,
      agent: "ARI",
      eventType: "tool_error",
      summary: deepRedact(
        `Tool: ${String((event as Record<string, unknown>).toolName)} — Error: ${String(ctx.error).slice(0, 300)}`,
      ),
      score: scored.score,
      isIncident: true,
    });
  });

  // ariBus: policy deny / kill switch
  ariBus.on("ari:ops:kill_switch", (payload) => {
    const traceId = newTraceHex();
    writeCapture({
      traceId,
      agent: "ARI",
      eventType: "kill_switch",
      summary: `Kill switch activated: scope=${payload.scope} reason=${deepRedact(payload.reason)}`,
      score: 10,
      isIncident: true,
    });
  });

  // ariBus: briefing ready
  ariBus.on("ari:briefing:ready", (payload) => {
    const traceId = newTraceHex();
    const type = typeof payload.type === "string" ? payload.type : "unknown";
    writeCapture({
      traceId,
      agent: "ARI",
      eventType: "briefing_ready",
      summary: `Briefing ready: ${type}`,
      score: 9,
    });
  });

  // ariBus: hash mismatch
  ariBus.on("ari:security:skill_hash_mismatch", (payload) => {
    const traceId = newTraceHex();
    writeCapture({
      traceId,
      agent: "ARI",
      eventType: "security_incident",
      summary: `Hash mismatch: tool=${payload.toolName} slug=${payload.slug}`,
      score: 10,
      isIncident: true,
    });
  });

  // ariBus: finance brief ready (not in typed interface — use type cast)
  (
    ariBus as unknown as {
      on(event: string, listener: (payload: Record<string, unknown>) => void): void;
    }
  ).on("ari:finance:brief-ready", (_payload: Record<string, unknown>) => {
    const traceId = newTraceHex();
    writeCapture({
      traceId,
      agent: "ARI",
      eventType: "finance_brief_ready",
      summary: `Finance brief ready`,
      score: 9,
    });
  });
}
