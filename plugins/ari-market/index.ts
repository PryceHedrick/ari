import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Market Plugin — Real-time crypto/stock/Pokemon monitoring.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: full market monitor + anomaly detection + Pokemon collection intelligence.
 *
 * Coverage:
 * - Crypto: BTC(8%), ETH(8%), SOL(10%) daily thresholds; flash crash >15% = P0
 * - Stock: AAPL 3%/8%, ETFs 2%/5%; Z-score 7-day rolling window
 * - Pokemon TCG: Z-score 30-day window, threshold |z|>2.5; EU/US divergence leading indicator
 * - Pokemon Sealed: MSRP ratio alerts; reprint risk detection
 *
 * Tools to register (Phase 3):
 * - ari_market_snapshot       — Current prices + P&L
 * - ari_portfolio_overview    — Portfolio breakdown
 * - ari_market_alerts         — Active P0/P1 alerts
 * - ari_pokemon_collection    — Collection value + top movers
 * - ari_pokemon_anomalies     — Active Z-score anomalies
 * - ari_pokemon_rotation      — Rotation calendar (investor framing)
 * - ari_pokemon_import        — CSV collection import
 * - ari_free_audit            — Pryceless Solutions lead audit tool
 *
 * Source: src/autonomous/market-monitor.ts, src/plugins/pokemon-tcg/
 */
const plugin = {
  id: 'ari-market',
  name: 'ARI Market',
  description: 'Crypto/stock/Pokemon monitoring with Z-score anomaly detection',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerService({ id: 'market-monitor', start: initMarketMonitor })
    // Phase 3: register market + pokemon tools
    // Phase 3: wire cron: market-snapshot every 30min (08:00-22:00 ET)
    // Phase 3: wire cron: pokemon-anomaly-detection daily 08:05 ET
  },
};

export default plugin;
