import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { sendVoiceMessageDiscord } from "../../src/discord/send.outbound.js";
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
      apiLogs: process.env["ARI_DISCORD_CHANNEL_API_LOGS"] ?? "",
      wins: process.env["ARI_DISCORD_CHANNEL_WINS"] ?? "",
      published: process.env["ARI_DISCORD_CHANNEL_PUBLISHED"] ?? "",
    };

    // Warn loudly for every key that has no value — silent drops are hard to debug
    const unconfigured = Object.entries(channelIds).filter(([, v]) => !v);
    if (unconfigured.length > 0) {
      api.logger.warn(
        `[ari-autonomous] unconfigured channel IDs (events for these will be dropped): ${unconfigured.map(([k]) => k).join(", ")}`,
      );
    }

    const anyConfigured = Object.values(channelIds).some((v) => v.length > 0);
    if (anyConfigured) {
      registerDiscordEventRouter(api, { channelIds });
    } else {
      api.logger.warn("[ari-autonomous] no Discord channel IDs configured — event router disabled");
    }

    // Wire ElevenLabs voice delivery: ari:voice:ready → sendVoiceMessageDiscord.
    // The ari-voice plugin emits audioBuffer (raw OGG bytes) when ARI_VOICE_ENABLED=true.
    // We write a temp file and use sendVoiceMessageDiscord which handles CDN upload +
    // waveform generation + Discord voice message flag automatically.
    const MAX_VOICE_BYTES = 7 * 1024 * 1024; // 7 MB guard (Discord standard limit is 8 MB)

    api.on("ari:voice:ready", (event) => {
      const ctx = event as Record<string, unknown>;
      const audioBuffer = ctx.audioBuffer instanceof Buffer ? ctx.audioBuffer : null;
      const channelName = typeof ctx.channel === "string" ? ctx.channel : "main";

      // Map logical channel name → channel snowflake ID
      const channelId = channelName === "market-alerts" ? channelIds.marketAlerts : channelIds.main;

      if (!channelId) {
        api.logger.warn(
          "[ari-autonomous] voice:ready — channelId not configured, skipping delivery",
        );
        return;
      }
      if (!audioBuffer) {
        api.logger.warn("[ari-autonomous] voice:ready — missing audioBuffer, skipping delivery");
        return;
      }
      if (audioBuffer.byteLength > MAX_VOICE_BYTES) {
        api.logger.warn(
          `[ari-autonomous] voice audio ${audioBuffer.byteLength} bytes exceeds ${MAX_VOICE_BYTES} byte limit — skipping`,
        );
        return;
      }

      // Unique temp filename: timestamp + 4-char random hex → no collision risk
      const uid = Math.random().toString(16).slice(2, 6);
      const tempPath = join(tmpdir(), `ari-briefing-${Date.now()}-${uid}.ogg`);

      void (async () => {
        try {
          await writeFile(tempPath, audioBuffer);
          await sendVoiceMessageDiscord(`channel:${channelId}`, tempPath, { silent: true });
        } catch (err: unknown) {
          api.logger.warn(`[ari-autonomous] voice delivery failed: ${String(err)}`);
        } finally {
          // Always clean up temp file regardless of success/failure
          await unlink(tempPath).catch(() => undefined);
        }
      })();
    });

    // Phase 3: api.registerService({ id: 'watchdog', start: initSelfHealing })
    // Phase 3: api.registerService({ id: 'intelligence', start: initIntelligenceScanner })
  },
};

export default plugin;
