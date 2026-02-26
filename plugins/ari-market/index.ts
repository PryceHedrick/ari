import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { writeCronState, MARKET_SNAPSHOT_KEY } from "../ari-memory/src/cron-state.js";
import {
  evaluateAlerts,
  buildCommunitySnapshot,
  formatPulseSnapshot,
  shouldSendAlert,
  ASSET_THRESHOLDS,
  SOURCE_RELIABILITY,
} from "./src/market-monitor.js";
import type { PricePoint, SocialSignal, MarketSnapshot } from "./src/market-monitor.js";

/**
 * ARI Market Plugin — Real-time multi-asset monitoring (PULSE 📡).
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
 *
 * Canonical social EventBus events (Section 10 / Section 26):
 *   social:x-signal        → reliability gate → social:signal-ingested
 *   social:reddit-signal   → reliability gate → social:signal-ingested
 *   market:flash-crash     → emitted on P0 price events
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

    // Handle social signal ingestion — X/Twitter signals (Section 26)
    // Reliability gate: weight ≥ 0.55 required to emit social:signal-ingested
    api.on("social:x-signal", (event) => {
      const ctx = event as Record<string, unknown>;
      const reliabilityWeight =
        typeof ctx.reliabilityWeight === "number"
          ? ctx.reliabilityWeight
          : (SOURCE_RELIABILITY["x_tracked_account"] ?? 0.7);

      if (reliabilityWeight < 0.55) {
        return; // Below reliability gate — discard
      }

      api.emit?.("social:signal-ingested", {
        envelope: {
          source: "x",
          account: ctx.account,
          content: ctx.content,
          sentiment: ctx.sentiment ?? "neutral",
          reliabilityWeight,
          timestamp: Date.now(),
        },
      });
    });

    // Handle social signal ingestion — Reddit signals (Section 26)
    api.on("social:reddit-signal", (event) => {
      const ctx = event as Record<string, unknown>;
      const reliabilityWeight =
        typeof ctx.reliabilityWeight === "number"
          ? ctx.reliabilityWeight
          : (SOURCE_RELIABILITY["reddit_post"] ?? 0.65);

      if (reliabilityWeight < 0.55) {
        return; // Below reliability gate — discard
      }

      api.emit?.("social:signal-ingested", {
        envelope: {
          source: "reddit",
          subreddit: ctx.subreddit,
          postId: ctx.postId,
          content: ctx.content,
          upvotes: ctx.upvotes,
          sentiment: ctx.sentiment ?? "neutral",
          reliabilityWeight,
          timestamp: Date.now(),
        },
      });
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
