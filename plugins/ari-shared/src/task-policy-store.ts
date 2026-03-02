/**
 * ARI Task Policy Store — AsyncLocalStorage context for NO-LLM policy enforcement.
 *
 * Propagates llmPolicy across all async continuations within a scheduled task.
 * Used by ari-scheduler to mark mechanical tasks (heartbeat, daily-backup) as
 * "forbidden" — any handler that attempts an LLM call throws immediately.
 *
 * Usage (scheduler side):
 *   taskPolicyStore.run({ taskId: "heartbeat", llmPolicy: "forbidden" }, () => {
 *     ariBus.emit("ari:scheduler:task", { taskId: "heartbeat", ... });
 *   });
 *
 * Usage (handler side — guards agent dispatch):
 *   assertLlmAllowed("nova-p1-handler"); // Throws if llmPolicy === "forbidden"
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type LlmPolicy = "forbidden" | "allowed";

export type TaskPolicyCtx = {
  taskId: string;
  llmPolicy: LlmPolicy;
};

export const taskPolicyStore = new AsyncLocalStorage<TaskPolicyCtx>();

/**
 * Assert that LLM calls are permitted in the current task context.
 * Throws with code "NO_LLM_ALLOWED_FOR_TASK" if llmPolicy === "forbidden".
 * No-ops when called outside a taskPolicyStore context.
 */
export function assertLlmAllowed(callerName: string): void {
  const ctx = taskPolicyStore.getStore();
  if (ctx?.llmPolicy === "forbidden") {
    throw Object.assign(new Error(`NO_LLM_ALLOWED_FOR_TASK: ${callerName} in task ${ctx.taskId}`), {
      code: "NO_LLM_ALLOWED_FOR_TASK",
    });
  }
}
