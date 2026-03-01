import { getWatchlist } from "../finance-db.js";
import { DISCLAIMER } from "../report-generator.js";
import { getSignalStatus } from "../signal-tracker.js";

export async function handleTickerCommand(args: string): Promise<string> {
  const symbol = args.trim().toUpperCase();
  if (!symbol) {
    return "❌ Usage: /ari-ticker <symbol>";
  }

  try {
    const { signal, history } = getSignalStatus(symbol);
    const onWatchlist = getWatchlist().some((e) => e.symbol === symbol);

    const lines: string[] = [];
    lines.push(`📊 **${symbol}** — Ticker Detail`);
    lines.push(`Watchlist: ${onWatchlist ? "✅ yes" : "—"}`);

    if (signal) {
      lines.push(
        `Signal: **${signal.intensity}** | Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
      );
      lines.push(`Thesis: ${signal.thesis.slice(0, 200)}`);
      lines.push(`Updated: ${signal.updated_at.slice(0, 10)}`);

      if (history.length > 0) {
        lines.push(`\n**Signal History** (last ${Math.min(history.length, 5)}):`);
        const recent = history.slice(-5).toReversed();
        for (const h of recent) {
          const delta = JSON.parse(h.delta_json) as Record<string, unknown>;
          lines.push(
            `- ${h.ts.slice(0, 10)} · ${h.event_type} · conf=${(((delta.confidence as number) ?? 0) * 100).toFixed(0)}%`,
          );
        }
      }
    } else {
      lines.push(`Signal: —  No signal on record`);
      lines.push(`Add to watchlist: /ari-watchlist add ${symbol}`);
    }

    lines.push(`\n> ${DISCLAIMER}`);
    return lines.join("\n");
  } catch (err) {
    return `❌ Ticker error: ${String(err).slice(0, 100)}`;
  }
}
