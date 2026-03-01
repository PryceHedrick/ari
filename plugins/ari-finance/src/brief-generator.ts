/**
 * ARI Finance Brief Generator — market snapshot → markdown brief with disclaimer.
 */

import { randomBytes } from "node:crypto";
import { getWatchlist, getSignalForSymbol, saveBrief } from "./finance-db.js";

export const DISCLAIMER =
  "⚠️ Informational analysis only. Not financial advice. No automated trading.";

export interface MarketBrief {
  date: string;
  content: string;
  disclaimer: string;
  traceId: string;
}

export function generateMarketBrief(snapshot?: Record<string, unknown>): MarketBrief {
  const traceId = randomBytes(4).toString("hex");
  const date = new Date().toISOString().slice(0, 10);
  const watchlist = getWatchlist();

  let content = `# Market Brief — ${date}\n\n`;
  content += `${DISCLAIMER}\n\n`;

  if (snapshot) {
    const prices = snapshot.prices as
      | Array<{ symbol: string; price: number; changePct24h: number }>
      | undefined;
    if (prices && prices.length > 0) {
      content += "## Market Snapshot\n\n";
      content += "| Symbol | Price | 24h Change |\n|--------|-------|------------|\n";
      for (const p of prices.slice(0, 10)) {
        const change =
          p.changePct24h >= 0 ? `+${p.changePct24h.toFixed(2)}%` : `${p.changePct24h.toFixed(2)}%`;
        content += `| ${p.symbol} | $${p.price.toLocaleString()} | ${change} |\n`;
      }
      content += "\n";
    }

    const alerts = snapshot.alerts as Array<{ symbol: string; message: string }> | undefined;
    if (alerts && alerts.length > 0) {
      content += "## Alerts\n\n";
      for (const a of alerts) {
        content += `- **${a.symbol}**: ${a.message}\n`;
      }
      content += "\n";
    }
  }

  if (watchlist.length > 0) {
    content += "## Watchlist Status\n\n";
    for (const entry of watchlist) {
      const signal = getSignalForSymbol(entry.symbol);
      const signalStr = signal
        ? `confidence: ${(signal.confidence * 100).toFixed(0)}%, ${signal.intensity}`
        : "no signal";
      content += `- **${entry.symbol}** (${entry.asset_type}): ${signalStr}\n`;
    }
    content += "\n";
  }

  content += `---\n_Generated at ${new Date().toISOString()} | trace: ${traceId}_`;

  saveBrief({ date, brief_type: "daily", summary: content, trace_id: traceId });

  return { date, content, disclaimer: DISCLAIMER, traceId };
}
