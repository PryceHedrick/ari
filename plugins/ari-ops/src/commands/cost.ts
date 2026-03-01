/**
 * ARI Ops Cost Command — token usage + latency from traces.db.
 *
 * /ari-cost           → today's token usage + avg latency
 * /ari-cost 7d        → last 7 days breakdown by agent
 * /ari-cost budget    → budget cap + % used (ARI_DAILY_TOKEN_BUDGET)
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const TRACES_DB_PATH = path.join(homedir(), ".ari", "databases", "traces.db");

interface TokenRow {
  agent: string | null;
  total_tokens: number;
  event_count: number;
  avg_duration_ms: number | null;
}

function getDb() {
  if (!existsSync(TRACES_DB_PATH)) {
    return null;
  }
  try {
    const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;
    return new Database(TRACES_DB_PATH, { readonly: true });
  } catch {
    return null;
  }
}

export async function handleCostCommand(args: string): Promise<string> {
  const arg = args.trim().toLowerCase();

  if (arg === "budget") {
    return handleBudgetReport();
  }

  const daysMatch = /^(\d+)d$/.exec(arg);
  if (daysMatch) {
    return handleDaysReport(parseInt(daysMatch[1], 10));
  }

  // Default: today
  return handleTodayReport();
}

function handleTodayReport(): string {
  const db = getDb();
  if (!db) {
    return "📊 **Cost: Today**\n\n_No traces.db found — no usage recorded yet_";
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db
      .prepare(`
      SELECT agent, SUM(token_count) as total_tokens, COUNT(*) as event_count,
             AVG(duration_ms) as avg_duration_ms
      FROM traces
      WHERE ts >= ? AND token_count IS NOT NULL
      GROUP BY agent
      ORDER BY total_tokens DESC
    `)
      .all(`${today}T00:00:00.000Z`) as TokenRow[];

    const totalTokens = db
      .prepare("SELECT SUM(token_count) as t FROM traces WHERE ts >= ? AND token_count IS NOT NULL")
      .get(`${today}T00:00:00.000Z`) as { t: number | null };

    const avgLatency = db
      .prepare(
        "SELECT AVG(duration_ms) as avg FROM traces WHERE ts >= ? AND duration_ms IS NOT NULL",
      )
      .get(`${today}T00:00:00.000Z`) as { avg: number | null };

    db.close();

    if (rows.length === 0) {
      return `📊 **Cost: Today (${today})**\n\n_No token usage recorded today_`;
    }

    const agentLines = rows.map((r) => {
      const agent = r.agent ?? "unknown";
      const latency = r.avg_duration_ms ? `${r.avg_duration_ms.toFixed(0)}ms avg` : "n/a";
      return `- **${agent}**: ${(r.total_tokens ?? 0).toLocaleString()} tokens (${r.event_count} events, ${latency})`;
    });

    const total = totalTokens.t ?? 0;
    const avg = avgLatency.avg ? `${avgLatency.avg.toFixed(0)}ms` : "n/a";

    // Budget check
    const budget = process.env.ARI_DAILY_TOKEN_BUDGET;
    let budgetLine = "";
    if (budget) {
      const budgetNum = parseInt(budget, 10);
      const pct = budgetNum > 0 ? ((total / budgetNum) * 100).toFixed(1) : "?";
      budgetLine = `\n💰 Budget: ${total.toLocaleString()} / ${budgetNum.toLocaleString()} tokens (${pct}%)`;
    }

    return `📊 **Cost: Today (${today})**

Total: **${total.toLocaleString()} tokens** | Avg latency: ${avg}${budgetLine}

${agentLines.join("\n")}`;
  } catch (err) {
    return `❌ Cost error: ${String(err).slice(0, 100)}`;
  }
}

function handleDaysReport(days: number): string {
  const db = getDb();
  if (!db) {
    return `📊 **Cost: Last ${days}d**\n\n_No traces.db found_`;
  }

  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = db
      .prepare(`
      SELECT agent, SUM(token_count) as total_tokens, COUNT(*) as event_count,
             AVG(duration_ms) as avg_duration_ms
      FROM traces
      WHERE ts >= ? AND token_count IS NOT NULL
      GROUP BY agent
      ORDER BY total_tokens DESC
    `)
      .all(since) as TokenRow[];

    const totalTokens = db
      .prepare("SELECT SUM(token_count) as t FROM traces WHERE ts >= ? AND token_count IS NOT NULL")
      .get(since) as { t: number | null };

    db.close();

    if (rows.length === 0) {
      return `📊 **Cost: Last ${days}d**\n\n_No token usage recorded_`;
    }

    const agentLines = rows.map((r) => {
      const agent = r.agent ?? "unknown";
      const latency = r.avg_duration_ms ? `${r.avg_duration_ms.toFixed(0)}ms avg` : "n/a";
      return `- **${agent}**: ${(r.total_tokens ?? 0).toLocaleString()} tokens (${r.event_count} events, ${latency})`;
    });

    return `📊 **Cost: Last ${days}d**

Total: **${(totalTokens.t ?? 0).toLocaleString()} tokens**

${agentLines.join("\n")}`;
  } catch (err) {
    return `❌ Cost error: ${String(err).slice(0, 100)}`;
  }
}

function handleBudgetReport(): string {
  const budget = process.env.ARI_DAILY_TOKEN_BUDGET;
  if (!budget) {
    return "💰 **Budget**\n\n_ARI_DAILY_TOKEN_BUDGET not set — no cap active_";
  }

  const db = getDb();
  if (!db) {
    return `💰 **Budget**: ${parseInt(budget).toLocaleString()} tokens/day\n\n_No usage data yet_`;
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { t } = db
      .prepare("SELECT SUM(token_count) as t FROM traces WHERE ts >= ? AND token_count IS NOT NULL")
      .get(`${today}T00:00:00.000Z`) as { t: number | null };
    db.close();

    const used = t ?? 0;
    const budgetNum = parseInt(budget, 10);
    const pct = budgetNum > 0 ? ((used / budgetNum) * 100).toFixed(1) : "?";
    const warn = used / budgetNum >= 0.8 ? " ⚠️ >80%" : "";

    return `💰 **Budget: Today**

Used: **${used.toLocaleString()}** / **${budgetNum.toLocaleString()}** tokens (${pct}%${warn})
${used / budgetNum >= 0.8 ? "\n⚠️ _Warning threshold reached — consider pausing non-essential tasks_" : ""}`;
  } catch (err) {
    return `❌ Budget error: ${String(err).slice(0, 100)}`;
  }
}
