/**
 * ARI → CHASE P2 Handler — leads-pipeline and crm-sync task bridges to ari-pipelines.
 *
 * Feature flag: ARI_CHASE_P2_ENABLED=true (default off)
 *
 * leads-pipeline (Mon/Wed/Fri, gate=auto):
 *   Step 1 (AUTO): POST /api/p2/leads/scan → leads discovered + scored
 *   Step 2 (APPROVAL): batch card to #outreach-queue; on approve: POST per lead
 *
 * crm-sync (Fri 18:00, gate=auto but APPROVAL for external write):
 *   Always requires APPROVAL before CRM write.
 */

import { ariBus } from "../../../ari-shared/src/event-bus.js";
import { assertLlmAllowed } from "../../../ari-shared/src/task-policy-store.js";
import { upsertApproval } from "../approvals.js";
import { upsertLedger } from "../ledger.js";
import { addAutonomyBreadcrumb, captureError } from "../sentry.js";

const PIPELINES_BASE = `http://127.0.0.1:${process.env.ARI_PIPELINES_PORT ?? "8787"}`;

const LEADS_TASK_IDS = new Set(["leads-pipeline", "leads-pipeline-wed", "leads-pipeline-fri"]);

export function registerChaseP2Handler(): void {
  if (process.env.ARI_CHASE_P2_ENABLED !== "true") {
    return;
  }

  // ── leads-pipeline (Mon/Wed/Fri) ──────────────────────────────────────────
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (!LEADS_TASK_IDS.has(payload.taskId)) {
      return;
    }

    assertLlmAllowed("chase-p2-handler:leads");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: payload.taskId,
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: payload.taskId, lane: "AUTO", status: "running" });

    try {
      const resp = await fetch(`${PIPELINES_BASE}/api/p2/leads/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredBy: "ari-scheduler", taskId: payload.taskId }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`P2 scan failed: HTTP ${resp.status} ${body.slice(0, 200)}`);
      }

      const result = (await resp.json()) as { batchId?: string; count?: number };

      upsertLedger({
        task_id: payload.taskId,
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: `P2 scan done: ${result.count ?? 0} leads, batch=${result.batchId}`,
        artifacts: result.batchId ? [`id:${result.batchId}`] : [],
      });

      // Post approval card for outreach step
      const { approvalId, isNew } = upsertApproval({
        task_id: payload.taskId,
        agent: "CHASE",
        lane_reason: "Lead outreach send requires manual approval (external comms)",
        risk_level: "high",
        payload_ref: result.batchId ? `batch:${result.batchId}` : undefined,
      });

      if (isNew) {
        ariBus.emit("ari:trace:event", {
          type: "approval_requested",
          taskId: payload.taskId,
          approvalId,
          channel: "outreachQueue",
        });
      }

      addAutonomyBreadcrumb({
        taskId: payload.taskId,
        lane: "APPROVAL",
        status: "pending-approval",
      });
    } catch (err) {
      upsertLedger({
        task_id: payload.taskId,
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: payload.taskId });
      addAutonomyBreadcrumb({ taskId: payload.taskId, lane: "AUTO", status: "failed" });
    }
  });

  // ── crm-sync ──────────────────────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "crm-sync") {
      return;
    }

    assertLlmAllowed("chase-p2-handler:crm-sync");

    const scheduledAt = Date.now();

    // crm-sync always goes to APPROVAL before executing — external CRM write
    const { approvalId, isNew } = upsertApproval({
      task_id: "crm-sync",
      agent: "CHASE",
      lane_reason: "CRM sync writes to external CRM — always requires approval",
      risk_level: "high",
    });

    upsertLedger({
      task_id: "crm-sync",
      scheduled_at: scheduledAt,
      status: "pending",
      lane: "APPROVAL",
      summary: "Awaiting approval for CRM sync",
    });

    if (isNew) {
      ariBus.emit("ari:trace:event", {
        type: "approval_requested",
        taskId: "crm-sync",
        approvalId,
        channel: "outreachQueue",
      });
    }

    addAutonomyBreadcrumb({ taskId: "crm-sync", lane: "APPROVAL", status: "pending-approval" });
  });
}
