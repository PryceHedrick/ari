/**
 * ARI → NOVA P1 Handler — nova-market-scan task bridge to ari-pipelines P1 API.
 *
 * Feature flag: ARI_NOVA_P1_ENABLED=true (default off)
 *
 * Flow:
 *   Step 1 (AUTO): POST /api/p1/run with draftOnly:true → script outline generated
 *   Step 2 (APPROVAL): approval card posted to #video-queue
 *   Step 3 (on approve): POST /api/p1/video/job/:id/approve → full production
 *
 * Only Step 1 fires here; Step 3 fires from the approval button handler.
 */

import { ariBus } from "../../../ari-shared/src/event-bus.js";
import { assertLlmAllowed } from "../../../ari-shared/src/task-policy-store.js";
import { upsertApproval } from "../approvals.js";
import { upsertLedger } from "../ledger.js";
import { addAutonomyBreadcrumb, captureError } from "../sentry.js";

const PIPELINES_BASE = `http://127.0.0.1:${process.env.ARI_PIPELINES_PORT ?? "8787"}`;

export function registerNovaP1Handler(): void {
  if (process.env.ARI_NOVA_P1_ENABLED !== "true") {
    return;
  }

  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "nova-market-scan") {
      return;
    }

    // assertLlmAllowed — this task is gate=approval-required so llmPolicy is "allowed" by default
    assertLlmAllowed("nova-p1-handler");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "nova-market-scan",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "nova-market-scan", lane: "AUTO", status: "running" });

    try {
      const resp = await fetch(`${PIPELINES_BASE}/api/p1/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftOnly: true, triggeredBy: "ari-scheduler" }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`P1 run failed: HTTP ${resp.status} ${body.slice(0, 200)}`);
      }

      const result = (await resp.json()) as { jobId?: string };
      const jobId = result.jobId;

      upsertLedger({
        task_id: "nova-market-scan",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: `P1 draft queued: job=${jobId}`,
        artifacts: jobId ? [`id:${jobId}`] : [],
      });

      // Post approval card for the publish step
      const { approvalId, isNew } = upsertApproval({
        task_id: "nova-market-scan",
        agent: "NOVA",
        lane_reason: "P1 publish requires manual approval (YouTube/TikTok/LinkedIn)",
        risk_level: "medium",
        payload_ref: jobId ? `job:${jobId}` : undefined,
      });

      if (isNew) {
        ariBus.emit("ari:trace:event", {
          type: "approval_requested",
          taskId: "nova-market-scan",
          approvalId,
          channel: "videoQueue",
        });
      }

      addAutonomyBreadcrumb({
        taskId: "nova-market-scan",
        lane: "APPROVAL",
        status: "pending-approval",
      });
    } catch (err) {
      upsertLedger({
        task_id: "nova-market-scan",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "nova-market-scan" });
      addAutonomyBreadcrumb({ taskId: "nova-market-scan", lane: "AUTO", status: "failed" });
    }
  });
}
