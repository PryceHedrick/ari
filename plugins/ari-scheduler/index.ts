import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Scheduler Plugin — 18 cron tasks in 3 execution windows.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: full 18-task schedule consolidated from 47 tasks in ARI v10.
 *
 * Three execution windows (all Eastern Time):
 * WINDOW 1 — Morning Build:     05:00-06:30 (silent prep → one briefing)
 * WINDOW 2 — Midday Sync:       12:00 (silent data refresh)
 * WINDOW 3 — Evening Dump:      21:00-21:15 (two Discord messages max)
 *
 * Family protection gates:
 * - Work hours (07:00-16:00 ET weekdays): P0 only
 * - Family time (16:00-21:00 ET): P0 only + 16:00 workday wrap
 * - Quiet hours (21:15-05:00 ET): nothing fires
 *
 * ADR-012: All cron schedules in Eastern Time (America/New_York)
 *
 * 18 tasks (down from 47 in v10 — 35 removed/merged):
 * SYSTEM: agent-health-check, backup-daily, git-sync, platform-health-audit
 * MORNING: intelligence-scan (05:00), morning-briefing (06:30)
 * MIDDAY: knowledge-index (12:00), market-background (12:00)
 * WORK-END: workday-digest (16:00 M-F), portfolio-eod (16:10 M-F)
 * EVENING: evening-summary (21:00), x-likes-digest (21:15),
 *          self-improvement (21:30), ai-council-nightly (21:45)
 * MARKET: market-snapshot (every 30min 08:00-22:00)
 * WEEKLY: weekly-review (Sun 18:00), memory-weekly (Sun 17:00), crm-weekly (Sun 20:00)
 *
 * Source: src/autonomous/scheduler.ts
 */
const plugin = {
  id: 'ari-scheduler',
  name: 'ARI Scheduler',
  description: '18 cron tasks in 3 windows; 35 tasks consolidated from v10',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: Register 18 cron jobs via OpenClaw scheduler API
    // Phase 3: api.registerService({ id: 'scheduler', start: initScheduler })
    // Phase 3: Enforce family protection time gates
  },
};

export default plugin;
