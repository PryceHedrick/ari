/**
 * ARI System Handlers — purely mechanical tasks (NO LLM calls).
 *
 * heartbeat:    ledger upsert + trace span. No model call ever.
 * daily-backup: ledger upsert + log. Actual backup logic deferred.
 *
 * Both tasks have llmPolicy: "forbidden" in cron-tasks.ts — any accidental
 * LLM call from within these handlers would throw assertLlmAllowed().
 *
 * Optional: ARI_HEARTBEAT_DISCORD_DEBUG=true posts heartbeat to #system-status (default off)
 */

import { emitSpan } from "../../../ari-ops/src/tracer.js";
import { ariBus } from "../../../ari-shared/src/event-bus.js";
import { upsertLedger } from "../ledger.js";
import { addAutonomyBreadcrumb } from "../sentry.js";

export function registerSystemHandlers(): void {
  // ── heartbeat ─────────────────────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", (payload) => {
    if (payload.taskId !== "heartbeat") {
      return;
    }

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "heartbeat",
      scheduled_at: scheduledAt,
      status: "success",
      lane: "AUTO",
      summary: "heartbeat ok",
    });

    emitSpan({
      event: "sched_task",
      tool: "heartbeat",
      summary: "ok",
    });

    addAutonomyBreadcrumb({ taskId: "heartbeat", lane: "AUTO", status: "success" });

    // Optional Discord debug (disabled by default — heartbeats are noisy)
    if (process.env.ARI_HEARTBEAT_DISCORD_DEBUG === "true") {
      ariBus.emit("ari:trace:event", {
        type: "heartbeat",
        ts: new Date().toISOString(),
        runnerId: process.env.ARI_RUNNER_ID,
      });
    }
  });

  // ── daily-backup ──────────────────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", (payload) => {
    if (payload.taskId !== "daily-backup") {
      return;
    }

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "daily-backup",
      scheduled_at: scheduledAt,
      status: "success",
      lane: "AUTO",
      summary: "daily-backup triggered",
    });

    emitSpan({
      event: "sched_task",
      tool: "daily-backup",
      summary: "triggered",
    });

    addAutonomyBreadcrumb({ taskId: "daily-backup", lane: "AUTO", status: "success" });
    // TODO Phase 4: trigger actual SQLite backup via VACUUM INTO
  });
}
