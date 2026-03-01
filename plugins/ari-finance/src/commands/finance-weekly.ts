import { getWatchlist, getSignalForSymbol, getLastBrief } from "../finance-db.js";
import { DISCLAIMER } from "../report-generator.js";

export async function handleFinanceWeeklyCommand(): Promise<string> {
  try {
    const watchlist = getWatchlist();
    const today = new Date().toISOString().slice(0, 10);
    const lastBrief = getLastBrief("daily");

    const lines: string[] = [
      `📅 **Weekly Finance Review** (${today})`,
      ``,
      `**Watchlist** (${watchlist.length} symbols):`,
    ];

    if (watchlist.length === 0) {
      lines.push(`— Empty. Add with: /ari-watchlist add <symbol>`);
    }

    const withSignal: string[] = [];
    const noSignal: string[] = [];

    for (const entry of watchlist) {
      const signal = getSignalForSymbol(entry.symbol);
      if (signal) {
        const conf = (signal.confidence * 100).toFixed(0);
        const age = Math.floor((Date.now() - new Date(signal.updated_at).getTime()) / 86400000);
        withSignal.push(
          `- **${entry.symbol}** | ${signal.intensity} | ${conf}% | updated ${age}d ago`,
        );
      } else {
        noSignal.push(`- **${entry.symbol}** — no signal`);
      }
    }

    if (withSignal.length > 0) {
      lines.push(`\n**Active Signals:**`);
      lines.push(...withSignal);
    }

    if (noSignal.length > 0) {
      lines.push(`\n**No Signal:**`);
      lines.push(...noSignal);
    }

    if (lastBrief) {
      lines.push(`\n**Last Brief**: ${lastBrief.date}`);
    }

    lines.push(`\n**Suggested Actions:**`);
    lines.push(`- Review signals older than 7 days`);
    lines.push(`- Run /ari-forecast <symbol> for updated commentary`);
    lines.push(`- Use /ari-report <symbol> to write full report to vault`);

    lines.push(``);
    lines.push(`> ${DISCLAIMER}`);
    return lines.join("\n");
  } catch (err) {
    return `❌ Weekly finance error: ${String(err).slice(0, 100)}`;
  }
}
