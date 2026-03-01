/**
 * ARI Finance Plugin — 16th ARI plugin.
 *
 * Provides financial market tracking: watchlist, signal tracking, forecasts,
 * sentiment analysis, full reports, and per-symbol playbooks.
 *
 * Storage:
 *   ~/.ari/databases/finance.db — SQLite WAL (watchlist, signals, briefs)
 *
 * All tools are ari_ prefix. All outputs include DISCLAIMER.
 * Network guard: assertNetworkDomain() blocks undeclared domains.
 * No automated trading. Informational analysis only.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { generateMarketBrief, DISCLAIMER } from "./src/brief-generator.js";
import { handleFinanceOpenCommand } from "./src/commands/finance-open.js";
import { handleFinanceWeeklyCommand } from "./src/commands/finance-weekly.js";
import { handleForecastCommand } from "./src/commands/forecast.js";
import { handleMarketBriefCommand } from "./src/commands/market-brief.js";
import { handlePlaybookCommand } from "./src/commands/playbook.js";
import { handleReportCommand } from "./src/commands/report.js";
import { handleSentimentCommand } from "./src/commands/sentiment.js";
import { handleTickerCommand } from "./src/commands/ticker.js";
import { handleWatchlistCommand } from "./src/commands/watchlist.js";
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getSignalForSymbol,
  getFinanceStats,
} from "./src/finance-db.js";
import { createOrUpdatePlaybook } from "./src/finance-playbook.js";
import { generateForecast, generateSentiment, generateFullReport } from "./src/report-generator.js";
import { updateSignal, getSignalStatus } from "./src/signal-tracker.js";

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

const plugin = {
  id: "ari-finance",
  name: "ARI Finance",
  description:
    "Finance intelligence: watchlist, signal tracking, forecasts, sentiment, reports, playbooks",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi): void {
    // ── Tools ────────────────────────────────────────────────────────────────

    api.registerTool?.({
      name: "ari_finance_market_brief",
      label: "Market Brief",
      description: "Synthesize market snapshot into brief with disclaimer; write to vault",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        const brief = generateMarketBrief();
        ariBus.emit(
          "ari:finance:brief-ready" as Parameters<typeof ariBus.emit>[0],
          { brief } as Parameters<typeof ariBus.emit>[1],
        );
        return jsonResult({ content: brief.content.slice(0, 2000), disclaimer: DISCLAIMER });
      },
    });

    api.registerTool?.({
      name: "ari_finance_watchlist_add",
      label: "Add to Watchlist",
      description: "Add symbol to watchlist; create playbook",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol e.g. BTC, AAPL" }),
        asset_type: Type.Optional(
          Type.String({ description: "stock|crypto|etf|macro|pokemon (default: stock)" }),
        ),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { symbol: string; asset_type?: string };
        const sym = p.symbol.toUpperCase();
        addToWatchlist(sym, {
          asset_type: p.asset_type as "stock" | "crypto" | "etf" | "macro" | "pokemon",
        });
        const entry = getWatchlist().find((e) => e.symbol === sym);
        if (entry) {
          createOrUpdatePlaybook(entry);
        }
        return jsonResult({ added: sym, disclaimer: DISCLAIMER });
      },
    });

    api.registerTool?.({
      name: "ari_finance_watchlist_remove",
      label: "Remove from Watchlist",
      description: "Remove symbol from watchlist",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol to remove" }),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { symbol: string };
        const removed = removeFromWatchlist(p.symbol.toUpperCase());
        return jsonResult({ removed, symbol: p.symbol.toUpperCase() });
      },
    });

    api.registerTool?.({
      name: "ari_finance_watchlist_list",
      label: "List Watchlist",
      description: "List watchlist symbols with latest signals",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        const watchlist = getWatchlist().map((e) => ({
          ...e,
          signal: getSignalForSymbol(e.symbol),
        }));
        return jsonResult({ watchlist, disclaimer: DISCLAIMER });
      },
    });

    api.registerTool?.({
      name: "ari_finance_ticker_detail",
      label: "Ticker Detail",
      description: "Price trend + signals for one symbol; includes disclaimer",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol" }),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { symbol: string };
        const status = getSignalStatus(p.symbol.toUpperCase());
        return jsonResult({ ...status, disclaimer: DISCLAIMER });
      },
    });

    api.registerTool?.({
      name: "ari_finance_sentiment",
      label: "Sentiment Analysis",
      description: "LLM sentiment analysis for symbol; includes disclaimer",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol" }),
        news_context: Type.Optional(Type.String({ description: "Optional news context string" })),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { symbol: string; news_context?: string };
        const result = generateSentiment(p.symbol.toUpperCase(), p.news_context);
        return jsonResult(result);
      },
    });

    api.registerTool?.({
      name: "ari_finance_forecast",
      label: "Forecast",
      description: "base/bull/bear/invalidation/confidence commentary + disclaimer",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol" }),
        context: Type.Optional(Type.String({ description: "Optional context for forecast" })),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { symbol: string; context?: string };
        const forecast = generateForecast(p.symbol.toUpperCase(), p.context);
        return jsonResult(forecast);
      },
    });

    api.registerTool?.({
      name: "ari_finance_report",
      label: "Full Finance Report",
      description: "Full report all sections + disclaimer; write to Obsidian",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol" }),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { symbol: string };
        const report = generateFullReport(p.symbol.toUpperCase());
        return jsonResult(report);
      },
    });

    api.registerTool?.({
      name: "ari_finance_signal_update",
      label: "Update Signal",
      description: "Update signal state; appends to signal_events with trace_id",
      parameters: Type.Object({
        symbol: Type.String({ description: "Ticker symbol" }),
        thesis: Type.String({ description: "Research thesis for this signal" }),
        intensity: Type.String({
          description: "strengthened|weakened|falsified|unchanged|neutral",
        }),
        confidence_delta: Type.Number({ description: "Confidence delta -1.0 to 1.0" }),
        note: Type.Optional(Type.String({ description: "Optional note for this update" })),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as {
          symbol: string;
          thesis: string;
          intensity: string;
          confidence_delta: number;
          note?: string;
        };
        const result = updateSignal(
          p.symbol.toUpperCase(),
          p.thesis,
          p.intensity as "strengthened" | "weakened" | "falsified" | "unchanged" | "neutral",
          p.confidence_delta,
          p.note,
        );
        // Update playbook when signal changes
        const entry = getWatchlist().find((e) => e.symbol === p.symbol.toUpperCase());
        if (entry) {
          createOrUpdatePlaybook(entry);
        }
        ariBus.emit(
          "ari:finance:signal-updated" as Parameters<typeof ariBus.emit>[0],
          { result } as Parameters<typeof ariBus.emit>[1],
        );
        return jsonResult(result);
      },
    });

    api.registerTool?.({
      name: "ari_finance_news_fetch",
      label: "Fetch Finance News",
      description: "Fetch news via resolved provider; returns sources list",
      parameters: Type.Object({
        query: Type.String({ description: "Search query or symbol" }),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { query: string };
        const { fetchNews } = await import("./src/news-provider.js");
        const result = await fetchNews(p.query);
        return jsonResult(result);
      },
    });

    // ── Discord Commands ─────────────────────────────────────────────────────

    api.registerCommand({
      name: "ari-market-brief",
      description: "Daily market brief from latest snapshot with disclaimer",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleMarketBriefCommand(),
    });

    api.registerCommand({
      name: "ari-watchlist",
      description: "Manage watchlist: add|remove|list [symbol] [asset_type]",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleWatchlistCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-ticker",
      description: "Price, trend, active signals for ticker symbol",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleTickerCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-sentiment",
      description: "LLM-based sentiment analysis (informational only)",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleSentimentCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-forecast",
      description: "base/bull/bear/invalidation commentary for symbol",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleForecastCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-report",
      description: "Full report written to Obsidian vault",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleReportCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-finance-open",
      description: "Active signals and watchlist status",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleFinanceOpenCommand(),
    });

    api.registerCommand({
      name: "ari-finance-weekly",
      description: "Weekly finance review report",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleFinanceWeeklyCommand(),
    });

    api.registerCommand({
      name: "ari-playbook",
      description: "Show finance playbook for symbol from vault",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handlePlaybookCommand(ctx.args ?? ""),
    });

    // ── ariBus: reactive subscriptions ──────────────────────────────────────

    // Market snapshot → auto-generate brief
    ariBus.on("ari:market:snapshot", (payload) => {
      const snap = payload;
      try {
        const brief = generateMarketBrief(snap);
        ariBus.emit(
          "ari:finance:brief-ready" as Parameters<typeof ariBus.emit>[0],
          { brief } as Parameters<typeof ariBus.emit>[1],
        );
      } catch {
        // snapshot format mismatch — skip
      }
    });

    // Market alert → check watchlist, update affected signal
    ariBus.on("ari:market:alert", (payload) => {
      const alert = payload as { symbol?: string; type?: string; message?: string };
      if (!alert.symbol) {
        return;
      }
      const sym = alert.symbol.toUpperCase();
      const onWatchlist = getWatchlist().some((e) => e.symbol === sym);
      if (!onWatchlist) {
        return;
      }

      // Log alert as a signal event without changing intensity
      const existing = getSignalForSymbol(sym);
      if (existing) {
        updateSignal(
          sym,
          existing.thesis,
          "unchanged",
          0,
          `Market alert: ${alert.message?.slice(0, 100) ?? alert.type ?? "alert"}`,
        );
      }
    });

    // Scheduler: portfolio-snapshot → daily brief
    ariBus.on("ari:scheduler:task", (payload) => {
      const { taskId } = payload as { taskId: string };

      if (taskId === "portfolio-snapshot") {
        try {
          const brief = generateMarketBrief();
          ariBus.emit(
            "ari:finance:brief-ready" as Parameters<typeof ariBus.emit>[0],
            { brief } as Parameters<typeof ariBus.emit>[1],
          );
          ariBus.emit(
            "ari:obsidian:capture" as Parameters<typeof ariBus.emit>[0],
            {
              content: `Finance brief generated: ${brief.date}`,
              tags: ["finance", "brief"],
              signalScore: 9,
            } as Parameters<typeof ariBus.emit>[1],
          );
        } catch {
          // db not ready
        }
      }
    });

    // Budget warning listener: emit when token usage high
    ariBus.on("ari:ops:budget_warning", (payload) => {
      const p = payload as { usedTokens: number; budgetTokens: number; pctUsed: number };
      // Finance plugin logs this; ari-ops handles the Discord alert
      void p; // no-op; ari-ops handles alerting
    });

    // Expose stats for doctor checks
    api.registerService?.("finance-stats", {
      getStats: () => getFinanceStats(),
    });
  },
};

export default plugin;
