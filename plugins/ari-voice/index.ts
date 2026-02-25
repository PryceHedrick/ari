import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { synthesizeSpeech, buildDiscordVoicePayload } from "./src/tts.js";

/**
 * ARI Voice Plugin — ElevenLabs TTS (eleven_turbo_v2_5) for Discord.
 *
 * Activation: ARI_VOICE_ENABLED=true
 * Model: eleven_turbo_v2_5 — 40-50ms latency
 * Format: OGG Vorbis → Discord attachment via multipart/form-data
 * Settings: stability(0.5), similarity_boost(0.8), style(0.3)
 * Max: 150 words (enforced — briefing audio only)
 *
 * Listens for 'ari:briefing:ready' events with audioText.
 * If voice enabled and text provided, synthesizes and emits voice payload.
 */

const plugin = {
  id: "ari-voice",
  name: "ARI Voice",
  description: "ElevenLabs TTS (eleven_turbo_v2_5) + Discord OGG voice attachments",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Gate check at registration time
    if (process.env.ARI_VOICE_ENABLED !== "true") {
      return;
    }
    if (!process.env.ELEVENLABS_API_KEY) {
      return;
    }

    // Listen for briefing events that include audioText
    api.on("ari:briefing:ready", (event) => {
      const ctx = event as Record<string, unknown>;
      const audioText = typeof ctx.audioText === "string" ? ctx.audioText : "";
      const channel = typeof ctx.channel === "string" ? ctx.channel : "ari-main";

      if (!audioText) {
        return;
      }

      // Async synthesis — don't block the event handler
      synthesizeSpeech({ text: audioText })
        .then((result) => {
          if (!result.success) {
            api.emit?.("ari:voice:error", { error: result.error, channel });
            return;
          }

          const embedJson = {
            content: "🎙️ _ARI morning briefing — voice_",
          };
          const payload = buildDiscordVoicePayload(result.audioBuffer, embedJson);

          api.emit?.("ari:voice:ready", {
            boundary: payload.boundary,
            body: payload.body,
            channel,
            wordCount: result.wordCount,
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          api.emit?.("ari:voice:error", { error: msg, channel });
          // Fallback: guarantee error is observable even if api.emit is unavailable
          if (!api.emit) {
            console.error("[ari-voice] synthesis error:", msg);
          }
        });
    });
  },
};

export { synthesizeSpeech };
export default plugin;
