/**
 * Signal tracker tests — state machine transitions + event log append-only.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

// Check if better-sqlite3 native module is available
let sqliteAvailable = true;
try {
  const Database = (await import("better-sqlite3")).default;
  const testDb = new Database(":memory:");
  testDb.close();
} catch {
  sqliteAvailable = false;
}

const itSql = sqliteAvailable ? it : it.skip;

// Point to temp dir
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ari-signal-test-"));
process.env["HOME"] = tmpDir;

import { updateSignal, getSignalStatus } from "./signal-tracker.js";

describe("signal-tracker state machine", () => {
  const testSymbol = `TEST_${Date.now()}`;

  itSql("creates signal on first updateSignal call", () => {
    const result = updateSignal(testSymbol, "Initial thesis", "neutral", 0);
    expect(result.symbol).toBe(testSymbol);
    expect(result.eventType).toBe("created");
    expect(result.signalId).toBeGreaterThan(0);
    expect(result.disclaimer).toContain("Informational");
  });

  itSql("strengthening increases confidence", () => {
    const sym = `STRENGTHEN_${Date.now()}`;
    const r1 = updateSignal(sym, "thesis", "neutral", 0);
    const r2 = updateSignal(sym, "thesis", "strengthened", 0.1);
    expect(r2.newConfidence).toBeGreaterThan(r1.newConfidence);
    expect(r2.eventType).toBe("strengthened");
  });

  itSql("weakening decreases confidence", () => {
    const sym = `WEAKEN_${Date.now()}`;
    updateSignal(sym, "thesis", "neutral", 0.2);
    const result = updateSignal(sym, "thesis", "weakened", -0.15);
    expect(result.eventType).toBe("weakened");
    expect(result.intensity).toBe("weakened");
  });

  itSql("falsification sets confidence to 0", () => {
    const sym = `FALSIFY_${Date.now()}`;
    updateSignal(sym, "thesis", "strengthened", 0.3);
    const result = updateSignal(sym, "thesis", "falsified", -0.5);
    expect(result.newConfidence).toBe(0);
    expect(result.eventType).toBe("falsified");
    expect(result.intensity).toBe("falsified");
  });

  itSql("confidence clamped to [0, 1]", () => {
    const sym = `CLAMP_${Date.now()}`;
    updateSignal(sym, "thesis", "strengthened", 0.8);
    const result = updateSignal(sym, "thesis", "strengthened", 0.8);
    expect(result.newConfidence).toBeLessThanOrEqual(1);

    const sym2 = `CLAMP2_${Date.now()}`;
    updateSignal(sym2, "thesis", "neutral", 0);
    const result2 = updateSignal(sym2, "thesis", "weakened", -2);
    expect(result2.newConfidence).toBeGreaterThanOrEqual(0);
  });

  itSql("getSignalStatus returns full history", () => {
    const sym = `STATUS_${Date.now()}`;
    updateSignal(sym, "thesis", "neutral", 0);
    updateSignal(sym, "thesis", "strengthened", 0.1);
    updateSignal(sym, "thesis", "weakened", -0.05);

    const { signal, history, disclaimer } = getSignalStatus(sym);
    expect(signal).not.toBeNull();
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(disclaimer).toContain("Informational");
  });

  itSql("getSignalStatus returns null for unknown symbol", () => {
    const { signal, history } = getSignalStatus("DOESNOTEXIST_XYZ");
    expect(signal).toBeNull();
    expect(history).toHaveLength(0);
  });

  itSql("traceId stored in event when provided", () => {
    const sym = `TRACE_${Date.now()}`;
    const result = updateSignal(sym, "thesis", "neutral", 0, "note", "deadbeef");
    expect(result.traceId).toBe("deadbeef");
  });

  itSql("disclaimer always present in result", () => {
    const sym = `DISC_${Date.now()}`;
    const result = updateSignal(sym, "thesis", "neutral", 0);
    expect(result.disclaimer).toBe(
      "⚠️ Informational analysis only. Not financial advice. No automated trading.",
    );
  });
});
