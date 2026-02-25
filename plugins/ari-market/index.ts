import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { writeCronState, MARKET_SNAPSHOT_KEY } from "../ari-memory/src/cron-state.js";
import {
  evaluateAlerts,
  buildCommunitySnapshot,
  formatPulseSnapshot,
  shouldSendAlert,
  ASSET_THRESHOLDS,
} from "./src/market-monitor.js";
import type { PricePoint, SocialSignal, MarketSnapshot } from "./src/market-monitor.js";

/**
 * ARI Market Plugin — Real-time multi-asset monitoring (PULSE 🔮).
 *
 * Handles scheduler events:
 *   pre-fetch-market     05:00 — Prefetch all market data
 *   portfolio-snapshot   06:45 — Snapshot for morning briefing
 *   market-midday        12:00 — Midday check
 *   market-close         16:15 weekdays — EOD summary
 *   pokemon-price-scan   10:00 — TCG anomaly detection
 *
 * Data flows:
 *   External APIs → price data → evaluateAlerts() → shouldSendAlert() → Discord
 *   Social signals → buildCommunitySnapshot() → reliability gate → #market-alerts
 *
 * Flash crashes (crypto >15% OR stocks >5%) emit P0 regardless of quiet hours.
 */

const MARKET_TASK_IDS = new Set([
  "pre-fetch-market",
  "portfolio-snapshot",
  "market-midday",
  "market-close",
  "pokemon-price-scan",
]);

const plugin = {
  id: "ari-market",
  name: "ARI Market",
  description: "Crypto/stock/Pokemon monitoring with Z-score anomaly detection",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Handle market monitoring tasks from ari-scheduler
    api.on("ari:scheduler:task", (event) => {
      const ctx = event as Record<string, unknown>;
      const taskId = typeof ctx.taskId === "string" ? ctx.taskId : "";
      if (!MARKET_TASK_IDS.has(taskId)) {
        return;
      }

      // Price data and social signals are passed via task payload or shared state
      const prices = (ctx.prices ?? []) as PricePoint[];
      const signals = (ctx.signals ?? []) as SocialSignal[];

      const alerts = evaluateAlerts(prices);
      const community = buildCommunitySnapshot(signals);

      const snapshot: MarketSnapshot = {
        prices,
        alerts,
        zScores: [], // Populated by anomaly detection (pokemon-price-scan task)
        community,
        snapshotAt: Date.now(),
      };

      // Emit snapshot for briefing integration
      api.emit?.("ari:market:snapshot", {
        snapshot,
        taskId,
        channel: ctx.channel ?? "market-alerts",
      });

      // Pre-fetch handoff: persist snapshot so morning-briefing can read it
      // even if the process restarts between 05:00 and 06:30 (Section 6, plan)
      if (taskId === "pre-fetch-market") {
        writeCronState(MARKET_SNAPSHOT_KEY, snapshot);
      }

      // Send alerts that pass quiet hours gate
      const sendableAlerts = alerts.filter((a) => shouldSendAlert(a));
      for (const alert of sendableAlerts) {
        api.emit?.("ari:market:alert", {
          alert,
          channel: alert.isFlashCrash ? "system-status" : "market-alerts",
        });
      }

      // Format and post full snapshot for portfolio/midday/close tasks
      if (["portfolio-snapshot", "market-midday", "market-close"].includes(taskId)) {
        const formatted = formatPulseSnapshot(snapshot);
        api.emit?.("ari:market:formatted-snapshot", {
          content: formatted,
          channel: "market-alerts",
          taskId,
        });
      }
    });

    // Handle direct price ingestion events (from external API pollers)
    api.on("ari:market:price-update", (event) => {
      const ctx = event as Record<string, unknown>;
      const prices = (ctx.prices ?? []) as PricePoint[];
      const alerts = evaluateAlerts(prices).filter((a) => shouldSendAlert(a));

      // P0 flash crashes go to #system-status immediately
      const p0 = alerts.filter((a) => a.severity === "P0");
      for (const alert of p0) {
        api.emit?.("ari:market:alert", { alert, channel: "system-status" });
        // Canonical flash-crash event (Section 10 — consumed by ari-autonomous + governance)
        api.emit?.("market:flash-crash", {
          asset: alert.symbol,
          pctChange: alert.changePct,
          direction: alert.changePct > 0 ? "up" : "down",
        });
      }
    });
  },
};

export { evaluateAlerts, buildCommunitySnapshot, formatPulseSnapshot, ASSET_THRESHOLDS };
export type {
  PricePoint,
  SocialSignal,
  MarketSnapshot,
  MarketAlert,
  MacroPoint,
} from "./src/market-monitor.js";
export default plugin;
