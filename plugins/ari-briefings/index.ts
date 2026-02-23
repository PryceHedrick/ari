import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Briefings Plugin — Scheduled intelligence delivery to Discord channels.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: full morning + workday wrap + evening briefings with Discord embeds.
 *
 * Briefing schedule (Eastern Time):
 * - 06:30 ET daily   — Morning briefing → #morning-briefing (Discord Blurple #5865F2)
 *                      Includes: portfolio, Pokemon collection, news, ElevenLabs MP3
 * - 16:00 ET weekdays — Workday wrap → #workday-wrap (Gold #FFCC00)
 * - 21:00 ET daily   — Evening summary → #evening-summary (Grey #7F8C8D)
 * - 21:15 ET daily   — X likes digest → #x-likes
 * - Sunday 18:00 ET  — Weekly review → #weekly-review (Teal #1ABC9C)
 *
 * Morning briefing pipeline:
 * intelligence-scan (05:00) → CronStateEnvelope → morning-briefing (06:30)
 * Model: anthropic/claude-opus-4.6 (highest quality output)
 * Voice: ElevenLabs eleven_turbo_v2_5 → MP3 attachment
 *
 * Source: src/autonomous/briefings.ts
 */
const plugin = {
  id: 'ari-briefings',
  name: 'ARI Briefings',
  description: 'Morning/workday/evening briefings via Discord with ElevenLabs voice',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerService({ id: 'briefings', start: initBriefings })
    // Phase 3: Wire morning-briefing cron (06:30 ET) → #morning-briefing Discord channel
    // Phase 3: Wire workday-wrap cron (16:00 ET weekdays) → #workday-wrap
    // Phase 3: Wire evening-summary cron (21:00 ET) → #evening-summary
  },
};

export default plugin;
