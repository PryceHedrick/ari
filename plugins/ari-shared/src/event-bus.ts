/**
 * ARI Internal Event Bus
 *
 * Single-process EventEmitter singleton shared by all ARI plugins.
 * Used for plugin-to-plugin communication (e.g. scheduler → briefings/market).
 *
 * Usage:
 *   import { ariBus } from "../ari-shared/src/event-bus.js";
 *   ariBus.emit("ari:scheduler:task", { taskId: "morning-briefing", ... });
 *   ariBus.on("ari:scheduler:task", (payload) => { ... });
 */
import { EventEmitter } from "node:events";

export type SchedulerTaskPayload = {
  taskId: string;
  agent: string;
  channel?: string;
  gate: "auto" | "approval-required" | "operator-only";
  priority: 0 | 1 | 2 | 3;
};

// Typed event map for ARI bus events
export interface AriBusEvents {
  // Scheduler
  "ari:scheduler:task": [payload: SchedulerTaskPayload];
  "ari:scheduler:warn": [payload: { message: string; taskCount?: number }];
  // Briefings
  "ari:briefing:ready": [payload: Record<string, unknown>];
  "ari:briefing:low-confidence": [payload: Record<string, unknown>];
  // Memory
  "ari:memory:store": [payload: Record<string, unknown>];
  "ari:memory:search_request": [payload: Record<string, unknown>];
  "ari:memory:search_result": [payload: Record<string, unknown>];
  "ari:memory:dedup_complete": [payload: Record<string, unknown>];
  // Market
  "ari:market:snapshot": [payload: Record<string, unknown>];
  "ari:market:alert": [payload: Record<string, unknown>];
  "ari:market:formatted-snapshot": [payload: Record<string, unknown>];
  "ari:market:price-update": [payload: Record<string, unknown>];
  "market:flash-crash": [payload: Record<string, unknown>];
  // Social signals
  "social:x-signal": [payload: Record<string, unknown>];
  "social:reddit-signal": [payload: Record<string, unknown>];
  "social:signal-ingested": [payload: Record<string, unknown>];
  // Kernel
  "ari:kernel:api-key-invalid": [payload: Record<string, unknown>];
  // Voice
  "ari:voice:ready": [payload: Record<string, unknown>];
  "ari:voice:error": [payload: Record<string, unknown>];
  "discord:voice:join": [payload: Record<string, unknown>];
  "discord:voice:speak": [payload: Record<string, unknown>];
  "discord:voice:leave": [payload: Record<string, unknown>];
}

class AriBus extends EventEmitter {
  emit<K extends keyof AriBusEvents>(event: K, ...args: AriBusEvents[K]): boolean {
    return super.emit(event as string, ...args);
  }

  on<K extends keyof AriBusEvents>(event: K, listener: (...args: AriBusEvents[K]) => void): this {
    return super.on(event as string, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof AriBusEvents>(event: K, listener: (...args: AriBusEvents[K]) => void): this {
    return super.once(event as string, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof AriBusEvents>(event: K, listener: (...args: AriBusEvents[K]) => void): this {
    return super.off(event as string, listener as (...args: unknown[]) => void);
  }
}

// Singleton — all ARI plugins share this instance within the same Node.js process
export const ariBus = new AriBus();
ariBus.setMaxListeners(50); // 13 plugins × multiple events
