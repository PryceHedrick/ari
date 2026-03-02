/**
 * ARI Cost Audit Handler — cost-audit task (23:45 ET daily).
 *
 * Queries ari-ops trace DB for daily token spend by provider, then posts
 * a summary to #system-status.
 *
 * This is an informational task — it reads trace data (no LLM call needed
 * for the query itself, but the summary format may use lightweight formatting).
 */

import { ariBus } from "../../../ari-shared/src/event-bus.js";
import { assertLlmAllowed } from "../../../ari-shared/src/task-policy-store.js";
import { upsertLedger } from "../ledger.js";
import { addAutonomyBreadcrumb, captureError } from "../sentry.js";

export function registerCostAuditHandler(): void {
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "cost-audit") {
      return;
    }

    // Cost audit may format output — mark LLM as allowed for this task
    assertLlmAllowed("cost-audit-handler");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "cost-audit",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "cost-audit", lane: "AUTO", status: "running" });

    try {
      // Query trace store for today's token spend
      // TODO: import queryDoraMetrics from ari-memory when available in this context
      // For now, emit an event and let ari-ops handle the query
      ariBus.emit("ari:trace:event", {
        type: "cost_audit_request",
        date: new Date().toISOString().slice(0, 10),
        channel: "systemStatus",
      });

      upsertLedger({
        task_id: "cost-audit",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: "cost-audit event emitted",
      });

      addAutonomyBreadcrumb({ taskId: "cost-audit", lane: "AUTO", status: "success" });
    } catch (err) {
      upsertLedger({
        task_id: "cost-audit",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "cost-audit" });
      addAutonomyBreadcrumb({ taskId: "cost-audit", lane: "AUTO", status: "failed" });
    }
  });
}
