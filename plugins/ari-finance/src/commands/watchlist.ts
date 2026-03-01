import { addToWatchlist, removeFromWatchlist, getWatchlist } from "../finance-db.js";
import { createOrUpdatePlaybook } from "../finance-playbook.js";

export async function handleWatchlistCommand(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  const [action, symbol] = parts;

  try {
    if (action === "add" && symbol) {
      addToWatchlist(symbol.toUpperCase());
      const entry = getWatchlist().find((e) => e.symbol === symbol.toUpperCase());
      if (entry) {
        createOrUpdatePlaybook(entry);
      }
      return `✅ Added **${symbol.toUpperCase()}** to watchlist — playbook created in vault`;
    }

    if (action === "remove" && symbol) {
      const removed = removeFromWatchlist(symbol.toUpperCase());
      return removed
        ? `✅ Removed **${symbol.toUpperCase()}** from watchlist`
        : `❌ ${symbol.toUpperCase()} not in watchlist`;
    }

    // List
    const watchlist = getWatchlist();
    if (watchlist.length === 0) {
      return "📋 Watchlist is empty — add symbols: /ari-watchlist add BTC";
    }

    const lines = watchlist.map(
      (e) => `- **${e.symbol}** (${e.asset_type}) — added ${e.added_at.slice(0, 10)}`,
    );
    return `📋 **Watchlist** (${watchlist.length})\n\n${lines.join("\n")}`;
  } catch (err) {
    return `❌ Watchlist error: ${String(err).slice(0, 100)}`;
  }
}
