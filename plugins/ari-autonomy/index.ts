import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { CRON_TASKS } from "../ari-scheduler/src/cron-tasks.js";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { getPendingApprovalsCount, expireStaleApprovals } from "./src/approvals.js";
import { registerDailyDigestHandler } from "./src/daily-digest.js";
import { acquireLeaderLease } from "./src/dedupe-store.js";
import { registerChaseP2Handler } from "./src/handlers/chase-p2-handler.js";
import { registerCostAuditHandler } from "./src/handlers/cost-audit-handler.js";
import { registerDexHandlers } from "./src/handlers/dex-handlers.js";
import { registerNovaP1Handler } from "./src/handlers/nova-p1-handler.js";
import { registerSystemHandlers } from "./src/handlers/system-handlers.js";
import { upsertLedger, queryLedger, getStaleRunning, getDeadLetterCount } from "./src/ledger.js";
import { initSentry } from "./src/sentry.js";
import {
  getSettingsDb,
  readAutonomyMode,
  writeAutonomyMode,
  type AutonomyMode,
} from "./src/settings-db.js";

/**
 * ARI Autonomy Plugin — supervised autonomy for all 25 scheduled tasks.
 *
 * Features:
 *   AUTO lane   — tasks execute immediately; failures retried then dead-lettered
 *   APPROVAL    — Discord card posted; blocked until Pryce approves
 *   BLOCKED     — operator slash-command only; never autonomous
 *
 * Registered slash commands:
 *   /mode [auto|supervised|paused] — read or set autonomy mode
 *   /status                        — system overview (mode, last/next tasks, pending)
 *   /approvals                     — list pending approval cards
 *
 * Settings DB: ~/.ari/databases/settings.db (WAL, 3 tables)
 * Sentry: opt-in via SENTRY_ENABLED=true + SENTRY_DSN
 */

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/**
 * Startup catch-up: recover stale "running" rows from a crashed previous instance.
 * Only runs if this instance acquires the leader lease (one instance per restart).
 */
function runStartupCatchup(): void {
  const runnerId = process.env.ARI_RUNNER_ID ?? "ari:unknown";
  const isLeader = acquireLeaderLease(runnerId);
  if (!isLeader) {
    return;
  }

  const staleRows = getStaleRunning();
  for (const row of staleRows) {
    const task = CRON_TASKS.find((t) => t.id === row.task_id);
    const maxRetries = (task?.priority ?? 3) <= 1 ? 3 : task?.priority === 2 ? 1 : 0;

    if (row.retry_count < maxRetries) {
      upsertLedger({
        task_id: row.task_id,
        scheduled_at: row.scheduled_at,
        status: "pending",
        lane: row.lane,
        retry_count: row.retry_count + 1,
        error_code: "STALE_RESTART",
      });
      // Re-dispatch the task
      if (task) {
        ariBus.emit("ari:scheduler:task", {
          taskId: task.id,
          agent: task.agent,
          channel: task.channel,
          gate: task.gate,
          priority: task.priority,
        });
      }
    } else {
      upsertLedger({
        task_id: row.task_id,
        scheduled_at: row.scheduled_at,
        status: "dead-letter",
        lane: row.lane,
        error_code: "MAX_RETRIES_CRASH",
      });
    }
  }
}

const plugin = {
  id: "ari-autonomy",
  name: "ARI Autonomy",
  description: "Supervised autonomy: AUTO/APPROVAL/BLOCKED lanes, ledger, dedup, pipeline bridges",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Initialize crash alerting
    initSentry();

    // Ensure DB is ready
    getSettingsDb();

    // Register all task handlers
    registerSystemHandlers();
    registerNovaP1Handler();
    registerChaseP2Handler();
    registerCostAuditHandler();
    registerDexHandlers();
    registerDailyDigestHandler();

    // Expire stale approvals on startup
    expireStaleApprovals();

    // Catch-up on startup (one leader instance only)
    runStartupCatchup();

    // ── /mode command ──────────────────────────────────────────────────────
    api.registerTool?.({
      name: "ari_autonomy_mode",
      label: "Autonomy Mode",
      description: "Get or set ARI autonomy mode (auto / supervised / paused). Max 97 chars desc.",
      parameters: Type.Object({
        mode: Type.Optional(
          Type.String({ description: "New mode: auto | supervised | paused. Omit to read." }),
        ),
      }),
      execute: async (_toolCallId, params) => {
        const { mode } = params as { mode?: string };
        if (mode) {
          if (!["auto", "supervised", "paused"].includes(mode)) {
            return jsonResult({ error: `Invalid mode: ${mode}. Use auto | supervised | paused.` });
          }
          writeAutonomyMode(mode as AutonomyMode, "slash-command");
          ariBus.emit("ari:trace:event", {
            type: "autonomy_mode_changed",
            newMode: mode,
            ts: new Date().toISOString(),
          });
          return jsonResult({ ok: true, mode, message: `Autonomy mode set to: ${mode}` });
        }
        const { mode: current, source } = readAutonomyMode();
        return jsonResult({ mode: current, source });
      },
    });

    // ── /status tool ───────────────────────────────────────────────────────
    api.registerTool?.({
      name: "ari_autonomy_status",
      label: "Autonomy Status",
      description: "ARI system status: mode, last 5 runs, next 5 tasks, pending approvals count.",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        const { mode, source } = readAutonomyMode();
        const runnerId = process.env.ARI_RUNNER_ID ?? "unknown";
        const recent = queryLedger({ limit: 5 });
        const pending = getPendingApprovalsCount();
        const deadLetter = getDeadLetterCount();

        // Next 5 upcoming tasks (static schedule — simplified)
        const nextTasks = CRON_TASKS.slice(0, 5).map((t) => ({
          id: t.id,
          agent: t.agent,
          gate: t.gate,
          priority: t.priority,
        }));

        return jsonResult({
          mode,
          modeSource: source,
          runnerId,
          last5: recent.map((r) => ({
            taskId: r.task_id,
            status: r.status,
            lane: r.lane,
            summary: r.summary,
            finishedAt: r.finished_at,
          })),
          next5: nextTasks,
          pendingApprovals: pending,
          deadLetterCount: deadLetter,
        });
      },
    });

    // ── /approvals tool ────────────────────────────────────────────────────
    api.registerTool?.({
      name: "ari_autonomy_approvals",
      label: "Pending Approvals",
      description: "List pending ARI approval cards requiring Pryce action.",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        expireStaleApprovals();
        const { getPendingApprovals } = await import("./src/approvals.js");
        const pending = getPendingApprovals();
        return jsonResult({
          count: pending.length,
          approvals: pending.map((a) => ({
            approvalId: a.approval_id,
            taskId: a.task_id,
            agent: a.agent,
            laneReason: a.lane_reason,
            riskLevel: a.risk_level,
            requestedAt: a.requested_at,
            expiresAt: a.expires_at,
          })),
        });
      },
    });
  },
};

export default plugin;
