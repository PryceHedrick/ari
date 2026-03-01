import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import type { MarketSnapshot } from "../ari-market/src/market-monitor.js";
import { readCronState, MARKET_SNAPSHOT_KEY } from "../ari-memory/src/cron-state.js";
import { ariBus } from "../ari-shared/src/event-bus.js";
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

// Latest Obsidian vault snapshot (populated by ari-obsidian morning-vault-digest)
let latestVaultSnapshot: Record<string, unknown> | undefined;

const plugin = {
  id: "ari-briefings",
  name: "ARI Briefings",
  description: "Morning/workday/evening briefings via Discord with ElevenLabs voice",
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Subscribe to Obsidian digest-ready → store vault snapshot for briefings
    ariBus.on("ari:obsidian:digest-ready", (payload) => {
      const data = payload;
      if (data.snapshot) {
        latestVaultSnapshot = data.snapshot as Record<string, unknown>;
      }
    });

    // Handle briefing tasks from ari-scheduler via shared event bus
    ariBus.on("ari:scheduler:task", (payload) => {
      const ctx = payload as Record<string, unknown>;
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

      // Briefing data: task payload takes priority; fall back to CronStateEnvelope.
      // The pre-fetch-market task (05:00) writes the market snapshot to SQLite so
      // morning-briefing (06:30) can recover it after a potential restart.
      const data = (ctx.briefingData ?? {}) as Partial<BriefingData>;

      // Hydrate market data from CronStateEnvelope if not already in payload
      if (!data.market && type === "morning") {
        const cached = readCronState<MarketSnapshot>(MARKET_SNAPSHOT_KEY);
        if (cached) {
          const priceMap = new Map(cached.prices.map((p) => [p.symbol, p]));
          data.market = {
            btc: priceMap.has("BTC")
              ? { price: priceMap.get("BTC")!.price, changePct: priceMap.get("BTC")!.changePct24h }
              : undefined,
            eth: priceMap.has("ETH")
              ? { price: priceMap.get("ETH")!.price, changePct: priceMap.get("ETH")!.changePct24h }
              : undefined,
            sol: priceMap.has("SOL")
              ? { price: priceMap.get("SOL")!.price, changePct: priceMap.get("SOL")!.changePct24h }
              : undefined,
            gspc: priceMap.has("^GSPC")
              ? { changePct: priceMap.get("^GSPC")!.changePct24h }
              : undefined,
            ixic: priceMap.has("^IXIC")
              ? { changePct: priceMap.get("^IXIC")!.changePct24h }
              : undefined,
            nvda: priceMap.has("NVDA")
              ? { changePct: priceMap.get("NVDA")!.changePct24h }
              : undefined,
            alerts: cached.alerts.map((a) => `${a.symbol}: ${a.message}`),
            vix: cached.macro?.find((m) => m.symbol === "VIX")?.value,
            treasury10y: cached.macro?.find((m) => m.symbol === "10Y")?.value,
            dxy: cached.macro?.find((m) => m.symbol === "DXY")?.value,
            gold: cached.macro?.find((m) => m.symbol === "GOLD")?.value,
          };
        }
      }

      // Attach vault snapshot to morning briefing if available
      if (type === "morning" && latestVaultSnapshot && !data.vault) {
        data.vault = latestVaultSnapshot;
      }

      const result = buildBriefing({
        type,
        voiceEnabled: process.env.ARI_VOICE_ENABLED === "true",
        ...data,
      });

      // Emit the briefing for Discord delivery via shared bus
      ariBus.emit("ari:briefing:ready", {
        type,
        discord: result.discord,
        audioText: result.audioText,
        confidence: result.confidence,
        channel: "ari-main",
        gate: "auto",
      });

      // Flag low-confidence briefings to ARI for review
      if (result.confidence < 80) {
        ariBus.emit("ari:briefing:low-confidence", {
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
