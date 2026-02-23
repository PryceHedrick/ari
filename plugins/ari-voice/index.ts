import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Voice Plugin — ElevenLabs TTS + Whisper STT.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3 deferred: full voice pipeline.
 *
 * TTS (ElevenLabs):
 * - Model: eleven_turbo_v2_5 (best quality/latency balance)
 * - Output: MP3 buffer → Discord message attachment
 * - Use case: Morning briefing audio (150 words max, <90 seconds)
 * - API: multipart/form-data POST to ElevenLabs REST API
 *
 * STT (Whisper/WisprFlow):
 * - Input: Voice message from Discord #voice-notes channel
 * - Output: Transcribed text → ARI processes as text query
 * - Response: Text embed + optional voice reply in same channel
 *
 * Source: src/plugins/telegram-bot/voice-handler.ts (migrate to Discord)
 */
const plugin = {
  id: 'ari-voice',
  name: 'ARI Voice',
  description: 'ElevenLabs TTS (eleven_turbo_v2_5) + Whisper STT for Discord',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerService({ id: 'tts', start: initElevenLabs })
    // Phase 3: api.registerService({ id: 'stt', start: initWhisper })
    // Phase 3: Handle voice messages in #voice-notes Discord channel
  },
};

export default plugin;
