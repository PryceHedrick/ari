import { describe, it, expect, beforeEach } from "vitest";
import {
  newTraceId,
  newSpanId,
  emitSpan,
  writeQueue,
  runWithTrace,
  currentCtx,
  elapsedMs,
} from "./tracer.js";

describe("tracer", () => {
  beforeEach(() => {
    // Clear write queue between tests
    writeQueue.splice(0, writeQueue.length);
  });

  describe("ID generators", () => {
    it("newTraceId() returns 8-char hex string", () => {
      const id = newTraceId();
      expect(id).toMatch(/^[0-9a-f]{8}$/);
    });

    it("newSpanId() returns 6-char hex string", () => {
      const id = newSpanId();
      expect(id).toMatch(/^[0-9a-f]{6}$/);
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 100 }, () => newTraceId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("emitSpan()", () => {
    it("writes NDJSON to writeQueue", () => {
      emitSpan({ event: "message_received", agentName: "ARI" });
      expect(writeQueue.length).toBe(1);
      const parsed = JSON.parse(writeQueue[0]);
      expect(parsed.event).toBe("message_received");
      expect(parsed.agentName).toBe("ARI");
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("uses 'unknown' traceId when no ALS context", () => {
      emitSpan({ event: "tracer_error" });
      const parsed = JSON.parse(writeQueue[0]);
      expect(parsed.traceId).toBe("unknown");
    });

    it("uses ALS context traceId when available", () => {
      let traceId = "";
      runWithTrace("NOVA", () => {
        const ctx = currentCtx();
        traceId = ctx?.traceId ?? "";
        emitSpan({ event: "model_resolving", agentName: "NOVA" });
      });
      const parsed = JSON.parse(writeQueue[0]);
      expect(parsed.traceId).toBe(traceId);
      expect(parsed.traceId).not.toBe("unknown");
    });

    it("redacts and truncates summary to 240 chars", () => {
      const longSecret = "sk-ant-api03-abcdefghijklmnopqrstuvwx1234567890 ".repeat(10);
      emitSpan({ event: "llm_input", summary: longSecret });
      const parsed = JSON.parse(writeQueue[0]);
      expect(parsed.summary).not.toContain("sk-ant-");
      expect(parsed.summary.length).toBeLessThanOrEqual(240);
    });

    it("never throws on bad input", () => {
      expect(() => emitSpan({ event: "message_received" })).not.toThrow();
    });
  });

  describe("queue overflow", () => {
    it("drops oldest event and emits tracer_error when queue is full (500)", () => {
      // Fill queue to max
      for (let i = 0; i < 500; i++) {
        writeQueue.push(JSON.stringify({ event: "tool_called", idx: i }) + "\n");
      }
      // Adding one more should drop the first and add an overflow notice
      emitSpan({ event: "message_received", summary: "overflow test" });

      // Queue stays at max (500) — oldest dropped, overflow notice added, new event added
      expect(writeQueue.length).toBe(500);

      // Check overflow notice exists somewhere
      const hasOverflow = writeQueue.some((line) => {
        try {
          const p = JSON.parse(line);
          return p.event === "tracer_error" && p.summary?.includes("overflow");
        } catch {
          return false;
        }
      });
      expect(hasOverflow).toBe(true);
    });
  });

  describe("elapsedMs()", () => {
    it("returns 0 outside ALS context", () => {
      expect(elapsedMs()).toBe(0);
    });

    it("returns elapsed time inside ALS context", async () => {
      let elapsed = -1;
      await new Promise<void>((resolve) => {
        runWithTrace("ARI", () => {
          setTimeout(() => {
            elapsed = elapsedMs();
            resolve();
          }, 5);
        });
      });
      expect(elapsed).toBeGreaterThanOrEqual(5);
      expect(elapsed).toBeLessThan(500);
    });
  });
});
