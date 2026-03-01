/**
 * ARI Ops Tracer — AsyncLocalStorage span context + bounded NDJSON write queue.
 *
 * Design:
 *   - AsyncLocalStorage propagates traceId/spanId across async continuations
 *   - Bounded queue (max 500) drops oldest on overflow; never throws
 *   - Drain loop (200ms interval) flushes to trace-store (SQLite)
 *   - All summaries are redacted and truncated to 240 chars before queuing
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { redact } from "./redactor.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type TraceEventName =
  | "message_received"
  | "model_resolving"
  | "model_selected"
  | "llm_input"
  | "tool_called"
  | "policy_decision"
  | "tool_result"
  | "response_sent"
  | "sched_task"
  | "kill_switch"
  | "tracer_error";

export type SpanEvent = {
  ts: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  event: TraceEventName;
  agentName?: string;
  provider?: string;
  model?: string;
  tool?: string;
  policyAction?: "allow" | "deny";
  policyRule?: string;
  durationMs?: number;
  tokenCount?: number;
  summary?: string;
};

type TraceContext = {
  traceId: string;
  spanId: string;
  startMs: number;
  agentName?: string;
};

// ── State ────────────────────────────────────────────────────────────────────

const store = new AsyncLocalStorage<TraceContext>();
const QUEUE_MAX = 500;

/** Raw NDJSON lines waiting to be flushed to SQLite. */
export const writeQueue: string[] = [];

// ── ID generators ─────────────────────────────────────────────────────────────

export function newTraceId(): string {
  return randomBytes(4).toString("hex");
}

export function newSpanId(): string {
  return randomBytes(3).toString("hex");
}

// ── Context management ───────────────────────────────────────────────────────

/** Start a new trace context. Returns the context (useful for testing). */
export function beginTrace(agentName?: string): TraceContext {
  const ctx: TraceContext = {
    traceId: newTraceId(),
    spanId: newSpanId(),
    startMs: Date.now(),
    agentName,
  };
  // Note: callers must use store.run(ctx, callback) for ALS propagation.
  // This function provides the context object; plugin hooks use it directly.
  return ctx;
}

/** Get current ALS context. Returns undefined if called outside a trace. */
export function currentCtx(): TraceContext | undefined {
  return store.getStore();
}

/** Run a callback within a new trace context. */
export function runWithTrace<T>(agentName: string | undefined, fn: () => T): T {
  const ctx = beginTrace(agentName);
  return store.run(ctx, fn);
}

/** Elapsed ms since trace start. Returns 0 if no context. */
export function elapsedMs(): number {
  const ctx = store.getStore();
  if (!ctx) {
    return 0;
  }
  return Date.now() - ctx.startMs;
}

// ── Span emission ─────────────────────────────────────────────────────────────

export function emitSpan(partial: Omit<SpanEvent, "ts" | "traceId" | "spanId">): void {
  try {
    const ctx = store.getStore();
    const event: SpanEvent = {
      ts: new Date().toISOString(),
      traceId: ctx?.traceId ?? "unknown",
      spanId: newSpanId(),
      ...partial,
      summary: partial.summary ? redact(partial.summary).slice(0, 240) : undefined,
    };
    const line = JSON.stringify(event) + "\n";

    if (writeQueue.length >= QUEUE_MAX) {
      // Drop oldest; replace with overflow notice (new event is sacrificed)
      writeQueue.shift();
      const overflow: SpanEvent = {
        ts: new Date().toISOString(),
        traceId: ctx?.traceId ?? "unknown",
        spanId: newSpanId(),
        event: "tracer_error",
        summary: "queue overflow, dropped 1 event",
      };
      writeQueue.push(JSON.stringify(overflow) + "\n");
      return; // sacrifice the incoming event to keep queue at QUEUE_MAX
    }

    writeQueue.push(line);
  } catch {
    // Silently discard — tracer must never throw
  }
}

// ── Re-export store for drain loop ───────────────────────────────────────────
export { store };
