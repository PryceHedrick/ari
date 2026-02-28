import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerDiscordEventRouter } from "../../src/plugins/ari-discord-event-router.js";
import { registerAriPipelinesCommandBridge } from "../../src/plugins/ari-pipelines-command-bridge.js";

/**
 * ARI Autonomous Plugin — Self-healing watchdog + intelligence scanner.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3 deferred: full self-healing pipeline + intelligence scanner.
 *
 * Self-healing pipeline:
 * error.log → confidence scoring → if >0.85: auto-fix → npm test → deploy
 *                                → if <=0.85: P0 alert → Discord #self-healing
 *
 * Intelligence scanner (05:00 ET):
 * PARALLEL A: CoinGecko + Finnhub + ApeWisdom + PokeTrace + CoinGlass + Fear&Greed
 * PARALLEL B: RSS parsing (crypto + stocks + pokemon + ai_tech) → classify Signal/Skip
 * PARALLEL C: Reddit snoowrap (r/PokemonTCG + r/Bitcoin + r/stocks + r/PokeInvesting)
 * → Perplexity sonar synthesis → CronStateEnvelope write (SQLite WAL)
 *
 * Source: src/autonomous/self-healing.ts, src/autonomous/intelligence-scanner.ts
 */
const plugin = {
  id: "ari-autonomous",
  name: "ARI Autonomous",
  description: "Self-healing watchdog + intelligence scanner (confidence threshold 0.85)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerAriPipelinesCommandBridge(api);

    // Wire EventBus events → Discord channel routing via HTTP endpoint.
    // ARI services POST to POST /ari/discord-event to push notifications.
    const channelIds = {
      main: process.env["ARI_DISCORD_CHANNEL_MAIN"] ?? "",
      deep: process.env["ARI_DISCORD_CHANNEL_DEEP"] ?? "",
      marketAlerts: process.env["ARI_DISCORD_CHANNEL_MARKET_ALERTS"] ?? "",
      pokemonMarket: process.env["ARI_DISCORD_CHANNEL_POKEMON"] ?? "",
      researchDigest: process.env["ARI_DISCORD_CHANNEL_RESEARCH"] ?? "",
      systemStatus: process.env["ARI_DISCORD_CHANNEL_SYSTEM_STATUS"] ?? "",
      opsDashboard: process.env["ARI_DISCORD_CHANNEL_OPS_DASHBOARD"] ?? "",
      videoQueue: process.env["ARI_DISCORD_CHANNEL_VIDEO_QUEUE"] ?? "",
      outreachQueue: process.env["ARI_DISCORD_CHANNEL_OUTREACH_QUEUE"] ?? "",
    };

    const anyConfigured = Object.values(channelIds).some((v) => v.length > 0);
    if (anyConfigured) {
      registerDiscordEventRouter(api, { channelIds });
    } else {
      api.logger.warn("[ari-autonomous] no Discord channel IDs configured — event router disabled");
    }

    // Phase 3: api.registerService({ id: 'watchdog', start: initSelfHealing })
    // Phase 3: api.registerService({ id: 'intelligence', start: initIntelligenceScanner })
  },
};

export default plugin;
