import { getWatchlist, getSignalForSymbol } from "../finance-db.js";
import { DISCLAIMER } from "../report-generator.js";

export async function handleFinanceOpenCommand(): Promise<string> {
  try {
    const watchlist = getWatchlist();
    if (watchlist.length === 0) {
      return `📊 **Finance Open** — No symbols on watchlist\n\nAdd symbols: /ari-watchlist add BTC\n\n> ${DISCLAIMER}`;
    }

    const lines: string[] = [`📊 **Finance Open** — Active Signals + Watchlist`, ``];

    for (const entry of watchlist) {
      const signal = getSignalForSymbol(entry.symbol);
      if (signal) {
        const conf = (signal.confidence * 100).toFixed(0);
        const intensityEmoji =
          signal.intensity === "strengthened"
            ? "🟢"
            : signal.intensity === "weakened"
              ? "🟡"
              : signal.intensity === "falsified"
                ? "🔴"
                : "⚪";
        lines.push(
          `${intensityEmoji} **${entry.symbol}** (${entry.asset_type}) — ${signal.intensity} | ${conf}% conf`,
        );
        lines.push(`  Thesis: ${signal.thesis.slice(0, 120)}`);
      } else {
        lines.push(`⚪ **${entry.symbol}** (${entry.asset_type}) — No signal`);
      }
    }

    lines.push(``);
    lines.push(`> ${DISCLAIMER}`);
    return lines.join("\n");
  } catch (err) {
    return `❌ Finance open error: ${String(err).slice(0, 100)}`;
  }
}
