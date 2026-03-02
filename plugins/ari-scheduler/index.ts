import { Cron } from "croner";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { taskPolicyStore } from "../ari-shared/src/task-policy-store.js";
import { CRON_TASKS, getTasksByAgent, getCriticalTasks } from "./src/cron-tasks.js";

/**
 * ARI Scheduler Plugin — 24 cron tasks across all named agents
 *
 * Uses croner (available in openclaw workspace) for timezone-aware scheduling.
 * All tasks run in Eastern Time (America/New_York — ADR-012).
 * Dispatches tasks via the shared ariBus (plugin-to-plugin event bus).
 *
 * Task distribution:
 *   SYSTEM: heartbeat (every 15 min), daily-backup (03:00)
 *   PULSE:  pre-fetch-market, portfolio-snapshot, pokemon-price-scan,
 *           market-midday, market-close
 *   DEX:    news-digest, ai-research-scan, x-likes-digest, weekly-feedback-synthesis,
 *           morning-vault-digest (daily 05:00), weekly-vault-scan (Mon 09:00)
 *   ARI:    morning-briefing (06:30), workday-wrap (16:00 M-F), evening-briefing (21:00),
 *           memory-dedup (22:00), cost-audit (23:45), weekly-wisdom (Sun 18:00)
 *   NOVA:   nova-market-scan (10:00 daily)
 *   CHASE:  leads-pipeline (Mon/Wed/Fri 14:00 or 10:00), crm-sync (Fri 18:00)
 */
const plugin = {
  id: "ari-scheduler",
  name: "ARI Scheduler",
  description: "24 cron tasks — all named agents, Eastern Time (ADR-012)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Register the scheduler as a service so it starts with the gateway
    // and stops cleanly on shutdown.
    api.registerService({
      id: "ari-scheduler-cron",
      start(ctx) {
        const log = ctx.logger;
        const jobs: Cron[] = [];

        for (const task of CRON_TASKS) {
          try {
            const job = new Cron(
              task.cron,
              { timezone: "America/New_York", protect: true, catch: true },
              () => {
                log.info(`[ari-scheduler] firing task: ${task.id} (agent=${task.agent})`);
                // Wrap in ALS context so handlers can call assertLlmAllowed()
                const policyCtx = {
                  taskId: task.id,
                  llmPolicy: task.llmPolicy ?? "allowed",
                } as const;
                taskPolicyStore.run(policyCtx, () => {
                  ariBus.emit("ari:scheduler:task", {
                    taskId: task.id,
                    agent: task.agent,
                    channel: task.channel,
                    gate: task.gate,
                    priority: task.priority,
                  });
                });
              },
            );
            jobs.push(job);
          } catch (err) {
            log.error(
              `[ari-scheduler] failed to register task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        log.info(`[ari-scheduler] ${jobs.length}/${CRON_TASKS.length} tasks scheduled (ET)`);
      },
      stop(ctx) {
        // croner jobs are garbage-collected automatically; log the stop
        ctx.logger.info("[ari-scheduler] scheduler service stopped");
      },
    });
  },
};

export { CRON_TASKS, getTasksByAgent, getCriticalTasks };
export default plugin;
