import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { buildBriefing } from "./src/briefing-builder.js";
import type { BriefingData } from "./src/briefing-builder.js";

/**
 * ARI Briefings Plugin — Intelligence delivery to Discord channels.
 *
 * Briefing schedule (Eastern Time — ADR-012):
 *   06:30 ET daily      — Morning briefing → #ari-main
 *   16:00 ET weekdays   — Workday wrap    → #ari-main
 *   21:00 ET daily      — Evening briefing → #ari-main
 *
 * Pipeline: ari-scheduler emits 'ari:scheduler:task' → this plugin handles
 * morning-briefing, workday-wrap, evening-briefing taskIds.
 *
 * Quality loop (Ralph-style): buildBriefing() retries up to 3× until
 * confidence ≥ 80. Below threshold routes to ARI for manual review.
 *
 * Voice: ElevenLabs eleven_turbo_v2_5 → OGG → Discord attachment.
 * Gate: ARI_VOICE_ENABLED=true.
 */

const BRIEFING_TASK_IDS = new Set(["morning-briefing", "workday-wrap", "evening-briefing"]);

const plugin = {
  id: "ari-briefings",
  name: "ARI Briefings",
  description: "Morning/workday/evening briefings via Discord with ElevenLabs voice",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Handle briefing tasks from ari-scheduler
    api.on("ari:scheduler:task", (event) => {
      const ctx = event as Record<string, unknown>;
      const taskId = typeof ctx.taskId === "string" ? ctx.taskId : "";
      if (!BRIEFING_TASK_IDS.has(taskId)) {
        return;
      }

      const type =
        taskId === "morning-briefing"
          ? "morning"
          : taskId === "workday-wrap"
            ? "workday-wrap"
            : "evening";

      // Briefing data is assembled from ari-market and ari-workspace context
      // The actual data is passed via the task payload or fetched from shared state
      const data = (ctx.briefingData ?? {}) as Partial<BriefingData>;

      const result = buildBriefing({
        type,
        voiceEnabled: process.env.ARI_VOICE_ENABLED === "true",
        ...data,
      });

      // Emit the briefing for Discord delivery
      api.emit?.("ari:briefing:ready", {
        type,
        discord: result.discord,
        audioText: result.audioText,
        confidence: result.confidence,
        channel: "ari-main",
        gate: "auto",
      });

      // Flag low-confidence briefings to ARI for review
      if (result.confidence < 80) {
        api.emit?.("ari:briefing:low-confidence", {
          type,
          confidence: result.confidence,
          message: `Briefing confidence ${result.confidence}/100 — ARI review recommended`,
        });
      }
    });
  },
};

export { buildBriefing };
export type { BriefingData, BriefingResult } from "./src/briefing-builder.js";
export default plugin;
