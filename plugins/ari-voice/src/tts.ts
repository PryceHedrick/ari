/**
 * ARI Voice — ElevenLabs TTS via eleven_turbo_v2_5
 *
 * Spec from plan (Section 9):
 * - Model: eleven_turbo_v2_5 (40-50ms latency)
 * - Output: OGG Vorbis → Discord voice attachment via multipart/form-data
 * - Gate: ARI_VOICE_ENABLED=true
 * - Settings: stability(0.5), similarity_boost(0.8), style(0.3)
 * - Max words: 150 (briefing audio only — not full text)
 *
 * ARI's voice ID is stored in ELEVENLABS_VOICE_ID env var.
 * Falls back to a sensible default if not set.
 */

export type TTSRequest = {
  text: string; // ≤150 words (enforced before calling)
  voiceId?: string; // Overrides ELEVENLABS_VOICE_ID
  model?: string; // Defaults to eleven_turbo_v2_5
};

export type TTSResult =
  | {
      success: true;
      audioBuffer: Buffer;
      format: "ogg_vorbis";
      wordCount: number;
    }
  | {
      success: false;
      error: string;
    };

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL = "eleven_turbo_v2_5";
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // ARI's voice (configurable)

const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.8,
  style: 0.3,
  use_speaker_boost: true,
};

/**
 * Enforce ≤150 word limit by trimming at word boundary.
 */
function enforceWordLimit(text: string, maxWords = 150): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }
  return words.slice(0, maxWords).join(" ") + ".";
}

/**
 * Call ElevenLabs API and return OGG Vorbis audio buffer.
 * Returns TTSResult with success/failure.
 */
export async function synthesizeSpeech(request: TTSRequest): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { success: false, error: "ELEVENLABS_API_KEY not set — voice disabled" };
  }

  const voiceEnabled = process.env.ARI_VOICE_ENABLED === "true";
  if (!voiceEnabled) {
    return { success: false, error: "ARI_VOICE_ENABLED not set to true — voice disabled" };
  }

  const voiceId = request.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const modelId = request.model ?? DEFAULT_MODEL;
  const trimmed = enforceWordLimit(request.text);
  const wordCount = trimmed.split(/\s+/).length;

  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/ogg",
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: modelId,
        voice_settings: VOICE_SETTINGS,
        output_format: "ogg_vorbis_48000",
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `ElevenLabs fetch failed: ${msg}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      success: false,
      error: `ElevenLabs API error ${response.status}: ${body.slice(0, 200)}`,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  return { success: true, audioBuffer, format: "ogg_vorbis", wordCount };
}

/**
 * Build multipart/form-data payload for Discord voice attachment.
 * Discord expects: files[0] with filename + content-type.
 */
export function buildDiscordVoicePayload(
  audioBuffer: Buffer,
  embedJson: Record<string, unknown>,
): { boundary: string; body: Buffer } {
  const boundary = `----ARI${Date.now()}`;
  const filename = `ari-briefing-${Date.now()}.ogg`;

  const jsonPart = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      JSON.stringify(embedJson) +
      "\r\n",
  );

  const audioPart = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files[0]"; filename="${filename}"\r\n` +
        `Content-Type: audio/ogg\r\n\r\n`,
    ),
    audioBuffer,
    Buffer.from("\r\n"),
  ]);

  const closing = Buffer.from(`--${boundary}--\r\n`);
  const body = Buffer.concat([jsonPart, audioPart, closing]);

  return { boundary, body };
}
