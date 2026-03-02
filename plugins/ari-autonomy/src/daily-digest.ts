/**
 * ARI Daily Digest — 20:00 ET daily summary posted to #ari-main.
 *
 * Shows: ran / failed / pending / dead-letter count / budget / next scheduled.
 * Emits as ari:trace:event for routing to Discord by ari-discord-event-router.
 */

import { ariBus } from "../../../ari-shared/src/event-bus.js";
import { assertLlmAllowed } from "../../../ari-shared/src/task-policy-store.js";
import { getPendingApprovalsCount, expireStaleApprovals } from "./approvals.js";
import { queryLedger, getDeadLetterCount } from "./ledger.js";
import { upsertLedger } from "./ledger.js";
import { addAutonomyBreadcrumb, captureError } from "./sentry.js";
import { readAutonomyMode } from "./settings-db.js";

export function registerDailyDigestHandler(): void {
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "daily-digest") {
      return;
    }

    assertLlmAllowed("daily-digest-handler");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "daily-digest",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "daily-digest", lane: "AUTO", status: "running" });

    try {
      // Expire stale approvals before querying
      expireStaleApprovals();

      const sinceMs = Date.now() - 24 * 60 * 60 * 1000; // last 24h
      const recent = queryLedger({ sinceMs, limit: 100 });

      const ran = recent.filter((r) => r.status === "success").length;
      const failed = recent.filter((r) => r.status === "failed").length;
      const pending = getPendingApprovalsCount();
      const deadLetter = getDeadLetterCount();
      const { mode } = readAutonomyMode();

      const lines: string[] = [
        `🤖 **ARI Daily Digest** — ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" })}`,
        `Mode: **${mode.toUpperCase()}** | Runner: \`${process.env.ARI_RUNNER_ID ?? "unknown"}\``,
        `✅ Ran: ${ran} | ❌ Failed: ${failed} | ⏳ Pending approval: ${pending} | 💀 Dead-letter: ${deadLetter}`,
      ];

      if (failed > 0) {
        const failedTasks = recent
          .filter((r) => r.status === "failed")
          .map((r) => `  • ${r.task_id}: ${r.error_code ?? "unknown error"}`)
          .slice(0, 5);
        lines.push("**Failed tasks:**", ...failedTasks);
      }

      ariBus.emit("ari:trace:event", {
        type: "daily_digest",
        channel: "main",
        message: lines.join("\n"),
        ts: new Date().toISOString(),
      });

      upsertLedger({
        task_id: "daily-digest",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: `digest: ran=${ran} failed=${failed} pending=${pending} dead=${deadLetter}`,
      });
      addAutonomyBreadcrumb({ taskId: "daily-digest", lane: "AUTO", status: "success" });
    } catch (err) {
      upsertLedger({
        task_id: "daily-digest",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "daily-digest" });
    }
  });
}
