/**
 * ARI Finance Signal Tracker — state machine with append-only event log.
 */

import { randomBytes } from "node:crypto";
import {
  upsertSignal,
  appendSignalEvent,
  getSignalForSymbol,
  getSignalHistory,
} from "./finance-db.js";
import type { SignalIntensity, Signal } from "./finance-db.js";

export const DISCLAIMER =
  "⚠️ Informational analysis only. Not financial advice. No automated trading.";

export interface SignalUpdateResult {
  signalId: number;
  symbol: string;
  newConfidence: number;
  intensity: SignalIntensity;
  eventType: string;
  traceId: string;
  disclaimer: string;
}

export function updateSignal(
  symbol: string,
  thesis: string,
  intensity: SignalIntensity,
  confidenceDelta: number,
  note?: string,
  traceId?: string,
): SignalUpdateResult {
  const sym = symbol.toUpperCase();
  const tid = traceId ?? randomBytes(4).toString("hex");
  const existing = getSignalForSymbol(sym);

  let newConfidence: number;
  let eventType: string;

  if (!existing) {
    newConfidence = Math.max(0, Math.min(1, 0.5 + confidenceDelta));
    eventType = "created";
  } else {
    if (intensity === "falsified") {
      newConfidence = 0;
      eventType = "falsified";
    } else {
      newConfidence = Math.max(0, Math.min(1, existing.confidence + confidenceDelta));
      eventType =
        intensity === "strengthened"
          ? "strengthened"
          : intensity === "weakened"
            ? "weakened"
            : "unchanged";
    }
  }

  const signalId = upsertSignal(sym, thesis, newConfidence, intensity);

  appendSignalEvent(
    signalId,
    eventType as Parameters<typeof appendSignalEvent>[1],
    {
      intensity,
      confidence: newConfidence,
      delta: confidenceDelta,
      note: note ?? null,
    },
    tid,
  );

  return {
    signalId,
    symbol: sym,
    newConfidence,
    intensity,
    eventType,
    traceId: tid,
    disclaimer: DISCLAIMER,
  };
}

export function getSignalStatus(symbol: string): {
  signal: Signal | null;
  history: ReturnType<typeof getSignalHistory>;
  disclaimer: string;
} {
  const signal = getSignalForSymbol(symbol.toUpperCase());
  const history = signal ? getSignalHistory(signal.id) : [];
  return { signal, history, disclaimer: DISCLAIMER };
}
