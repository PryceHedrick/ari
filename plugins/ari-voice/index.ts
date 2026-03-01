import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { synthesizeSpeech } from "./src/tts.js";

/**
 * ARI Voice Plugin — ElevenLabs TTS with model routing + Discord delivery.
 *
 * Activation: ARI_VOICE_ENABLED=true
 * Model routing: selectModel() in tts.ts (eleven_turbo_v2_5 | v3 | flash_v2_5)
 * Format: OGG Vorbis → Discord attachment or voice channel
 * Settings: stability(0.5), similarity_boost(0.8), style(0.3)
 * Max: 150 words (enforced — briefing audio only)
 *
 * Delivery gate (Sprint 4):
 *   ARI_VOICE_CHANNEL_ENABLED=true  → emit discord:voice:* events (live channel)
 *   default                         → emit ari:voice:ready (file attachment)
 *
 * New env vars (Sprint 4):
 *   ARI_VOICE_CHANNEL_ENABLED    — 'true' for Discord voice channel delivery
 *   ARI_DISCORD_VOICE_CHANNEL_ID — Voice channel snowflake ID
 *   ARI_ELEVENLABS_V3_ENABLED    — 'true' to enable v3/Flash model routing
 */

const plugin = {
  id: "ari-voice",
  name: "ARI Voice",
  description: "ElevenLabs TTS (eleven_turbo_v2_5) + Discord OGG voice attachments",
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Gate check at registration time
    if (process.env.ARI_VOICE_ENABLED !== "true") {
      return;
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      return;
    }

    // Listen for briefing events that include audioText
    ariBus.on("ari:briefing:ready", (event) => {
      const ctx = event;
      const audioText = typeof ctx.audioText === "string" ? ctx.audioText : "";
      const channel = typeof ctx.channel === "string" ? ctx.channel : "ari-main";
      const audioType = typeof ctx.audioType === "string" ? ctx.audioType : "briefing";

      if (!audioText) {
        return;
      }

      // Async synthesis — don't block the event handler
      synthesizeSpeech({
        text: audioText,
        audioType: audioType as "briefing" | "alert" | "default",
      })
        .then((result) => {
          if (!result.success) {
            ariBus.emit("ari:voice:error", { error: result.error, channel });
            return;
          }

          // Sprint 4 gate: ARI_VOICE_CHANNEL_ENABLED → live Discord voice channel
          if (process.env.ARI_VOICE_CHANNEL_ENABLED === "true") {
            const channelId = process.env.ARI_DISCORD_VOICE_CHANNEL_ID ?? "";
            ariBus.emit("discord:voice:join", { channelId });
            ariBus.emit("discord:voice:speak", { audioBuffer: result.audioBuffer, format: "ogg" });
            ariBus.emit("discord:voice:leave", {});
          } else {
            // Default: emit raw audio buffer for delivery via sendVoiceMessageDiscord
            ariBus.emit("ari:voice:ready", {
              audioBuffer: result.audioBuffer,
              channel,
              wordCount: result.wordCount,
            });
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          ariBus.emit("ari:voice:error", { error: msg, channel });
        });
    });
  },
};

export { synthesizeSpeech };
export default plugin;
