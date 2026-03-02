/**
 * NO-LLM Policy Tests — assertLlmAllowed() enforcement.
 *
 * Verifies that:
 *   1. assertLlmAllowed() throws when llmPolicy === "forbidden"
 *   2. assertLlmAllowed() is a no-op when llmPolicy === "allowed"
 *   3. assertLlmAllowed() is a no-op when called outside ALS context
 *   4. taskPolicyStore.run() correctly propagates through async continuations
 */

import { describe, it, expect } from "vitest";
import { taskPolicyStore, assertLlmAllowed } from "../../../ari-shared/src/task-policy-store.js";

describe("assertLlmAllowed", () => {
  it("no-ops when called outside ALS context", () => {
    expect(() => assertLlmAllowed("test-caller")).not.toThrow();
  });

  it("no-ops when llmPolicy is 'allowed'", () => {
    taskPolicyStore.run({ taskId: "daily-briefing", llmPolicy: "allowed" }, () => {
      expect(() => assertLlmAllowed("briefing-handler")).not.toThrow();
    });
  });

  it("throws when llmPolicy is 'forbidden'", () => {
    taskPolicyStore.run({ taskId: "heartbeat", llmPolicy: "forbidden" }, () => {
      expect(() => assertLlmAllowed("heartbeat-caller")).toThrow("NO_LLM_ALLOWED_FOR_TASK");
    });
  });

  it("thrown error has code property 'NO_LLM_ALLOWED_FOR_TASK'", () => {
    taskPolicyStore.run({ taskId: "daily-backup", llmPolicy: "forbidden" }, () => {
      let caught: (Error & { code?: string }) | undefined;
      try {
        assertLlmAllowed("backup-caller");
      } catch (err) {
        caught = err as Error & { code?: string };
      }
      expect(caught).toBeDefined();
      expect(caught?.code).toBe("NO_LLM_ALLOWED_FOR_TASK");
    });
  });

  it("propagates through async continuations (Promise.resolve)", async () => {
    await new Promise<void>((resolve, reject) => {
      taskPolicyStore.run({ taskId: "heartbeat", llmPolicy: "forbidden" }, () => {
        void Promise.resolve().then(() => {
          try {
            assertLlmAllowed("async-caller");
            reject(new Error("Expected assertLlmAllowed to throw"));
          } catch (err) {
            expect((err as Error).message).toContain("NO_LLM_ALLOWED_FOR_TASK");
            resolve();
          }
        });
      });
    });
  });

  it("error message includes task ID and caller name", () => {
    taskPolicyStore.run({ taskId: "heartbeat", llmPolicy: "forbidden" }, () => {
      expect(() => assertLlmAllowed("my-handler")).toThrow(/my-handler.*heartbeat/);
    });
  });
});
