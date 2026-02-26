import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { CRON_TASKS, getTasksByAgent, getCriticalTasks } from "./src/cron-tasks.js";

/**
 * ARI Scheduler Plugin — 21 cron tasks across all named agents
 *
 * All tasks run in Eastern Time (America/New_York — ADR-012).
 *
 * Task distribution:
 *   SYSTEM: heartbeat (every 15 min), daily-backup (03:00)
 *   PULSE:  pre-fetch-market, portfolio-snapshot, pokemon-price-scan,
 *           market-midday, market-close
 *   DEX:    news-digest, ai-research-scan, x-likes-digest, weekly-feedback-synthesis,
 *           morning-vault-digest (daily 05:00), weekly-vault-scan (Mon 09:00)
 *   ARI:    morning-briefing (06:30), workday-wrap (16:00 M-F), evening-briefing (21:00),
 *           memory-dedup (22:00), cost-audit (23:45), weekly-wisdom (Sun 18:00)
 *   CHASE:  leads-pipeline (Mon 14:00), crm-sync (Fri 18:00)
 */
const plugin = {
  id: "ari-scheduler",
  name: "ARI Scheduler",
  description: "19 cron tasks — all named agents, Eastern Time (ADR-012)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Register all 21 tasks when OpenClaw scheduler API is available
    // The scheduler is wired to the named agent coordinator for dispatch
    if (typeof (api as Record<string, unknown>).registerCron === "function") {
      const registerCron = (api as Record<string, unknown>).registerCron as (task: {
        id: string;
        cron: string;
        handler: () => void;
      }) => void;

      for (const task of CRON_TASKS) {
        registerCron({
          id: task.id,
          cron: task.cron,
          handler: () => {
            api.emit?.("ari:scheduler:task", {
              taskId: task.id,
              agent: task.agent,
              channel: task.channel,
              gate: task.gate,
              priority: task.priority,
            });
          },
        });
      }
    } else {
      // OpenClaw host does not implement registerCron — all 21 tasks are skipped.
      // This is a P0 failure for the morning-briefing task.
      api.emit?.("ari:scheduler:warn", {
        message:
          "registerCron not available on OpenClaw API — all 19 scheduled tasks are disabled.",
        taskCount: CRON_TASKS.length,
      });
    }
  },
};

export { CRON_TASKS, getTasksByAgent, getCriticalTasks };
export default plugin;
