/**
 * ARI DEX Research Handlers — 4 DEX tasks, all gate=auto, lane=AUTO.
 *
 * news-digest (07:00):           perplexity/sonar-pro → #research-digest + ari-memory
 * ai-research-scan (08:00):      perplexity/sonar-reasoning-pro → vault via ari:obsidian:capture
 * x-likes-digest (20:00):        xai/grok-3-mini (gate: ARI_ENABLE_X_INTEL) → #research-digest
 * weekly-feedback-synthesis (Mon 09:00): anthropic/claude-sonnet → ari-memory domain=decisions
 *
 * All tasks emit trace events — actual LLM dispatch is handled by OpenClaw's
 * agent runner (DEX is a named agent with its own session).
 */

import { ariBus } from "../../../ari-shared/src/event-bus.js";
import { assertLlmAllowed } from "../../../ari-shared/src/task-policy-store.js";
import { upsertLedger } from "../ledger.js";
import { addAutonomyBreadcrumb, captureError } from "../sentry.js";

/** Emit a DEX agent task dispatch signal. */
function dispatchDexTask(taskId: string, taskType: string, extra?: Record<string, unknown>): void {
  ariBus.emit("ari:trace:event", {
    type: "dex_task_dispatch",
    taskId,
    taskType,
    agent: "DEX",
    ts: new Date().toISOString(),
    ...extra,
  });
}

export function registerDexHandlers(): void {
  // ── news-digest ───────────────────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "news-digest") {
      return;
    }
    assertLlmAllowed("dex-handler:news-digest");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "news-digest",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "news-digest", lane: "AUTO", status: "running" });

    try {
      dispatchDexTask("news-digest", "web-research", { provider: "perplexity", depth: "pro" });

      upsertLedger({
        task_id: "news-digest",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: "DEX news-digest dispatched",
      });
      addAutonomyBreadcrumb({ taskId: "news-digest", lane: "AUTO", status: "success" });
    } catch (err) {
      upsertLedger({
        task_id: "news-digest",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "news-digest" });
    }
  });

  // ── ai-research-scan ──────────────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "ai-research-scan") {
      return;
    }
    assertLlmAllowed("dex-handler:ai-research-scan");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "ai-research-scan",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "ai-research-scan", lane: "AUTO", status: "running" });

    try {
      dispatchDexTask("ai-research-scan", "breakthrough-analysis", {
        provider: "perplexity",
        depth: "reasoning",
        vaultCapture: true,
      });

      upsertLedger({
        task_id: "ai-research-scan",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: "DEX ai-research-scan dispatched",
      });
      addAutonomyBreadcrumb({ taskId: "ai-research-scan", lane: "AUTO", status: "success" });
    } catch (err) {
      upsertLedger({
        task_id: "ai-research-scan",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "ai-research-scan" });
    }
  });

  // ── x-likes-digest ────────────────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "x-likes-digest") {
      return;
    }

    // Gate: ARI_ENABLE_X_INTEL=true required
    if (process.env.ARI_ENABLE_X_INTEL !== "true") {
      upsertLedger({
        task_id: "x-likes-digest",
        scheduled_at: Date.now(),
        status: "skipped",
        lane: "AUTO",
        summary: "ARI_ENABLE_X_INTEL not set — skipped",
      });
      return;
    }

    assertLlmAllowed("dex-handler:x-likes-digest");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "x-likes-digest",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "x-likes-digest", lane: "AUTO", status: "running" });

    try {
      dispatchDexTask("x-likes-digest", "x-sentiment", { provider: "xai", model: "grok-3-mini" });

      upsertLedger({
        task_id: "x-likes-digest",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: "DEX x-likes-digest dispatched",
      });
      addAutonomyBreadcrumb({ taskId: "x-likes-digest", lane: "AUTO", status: "success" });
    } catch (err) {
      upsertLedger({
        task_id: "x-likes-digest",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "x-likes-digest" });
    }
  });

  // ── weekly-feedback-synthesis ─────────────────────────────────────────────
  ariBus.on("ari:scheduler:task", async (payload) => {
    if (payload.taskId !== "weekly-feedback-synthesis") {
      return;
    }
    assertLlmAllowed("dex-handler:weekly-feedback-synthesis");

    const scheduledAt = Date.now();
    upsertLedger({
      task_id: "weekly-feedback-synthesis",
      scheduled_at: scheduledAt,
      status: "running",
      lane: "AUTO",
    });
    addAutonomyBreadcrumb({ taskId: "weekly-feedback-synthesis", lane: "AUTO", status: "running" });

    try {
      dispatchDexTask("weekly-feedback-synthesis", "weekly-digest-synthesis", {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        memoryDomain: "decisions",
      });

      upsertLedger({
        task_id: "weekly-feedback-synthesis",
        scheduled_at: scheduledAt,
        status: "success",
        lane: "AUTO",
        summary: "DEX weekly-feedback-synthesis dispatched",
      });
      addAutonomyBreadcrumb({
        taskId: "weekly-feedback-synthesis",
        lane: "AUTO",
        status: "success",
      });
    } catch (err) {
      upsertLedger({
        task_id: "weekly-feedback-synthesis",
        scheduled_at: scheduledAt,
        status: "failed",
        lane: "AUTO",
        error_code: err instanceof Error ? err.message.slice(0, 80) : "UNKNOWN",
      });
      captureError(err, { taskId: "weekly-feedback-synthesis" });
    }
  });
}
