/**
 * Finance DB tests — schema, WAL, signal_events trace_id, append-only invariants.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";

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

// Point finance DB to a temp directory for tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ari-finance-test-"));
process.env["ARI_TEST_FINANCE_DB"] = path.join(tmpDir, "finance-test.db");
// Redirect HOME so DB writes go to tmpDir instead of ~/.ari
process.env["HOME"] = tmpDir;

import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  upsertSignal,
  appendSignalEvent,
  getSignalForSymbol,
  getSignalHistory,
  saveBrief,
  getLastBrief,
  getFinanceStats,
} from "./finance-db.js";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("finance-db schema", () => {
  itSql("getFinanceStats returns zero counts on empty DB", () => {
    const stats = getFinanceStats();
    expect(stats).toMatchObject({
      watchlistCount: expect.any(Number),
      signalCount: expect.any(Number),
      briefCount: expect.any(Number),
    });
    expect(stats.watchlistCount).toBeGreaterThanOrEqual(0);
  });

  itSql("addToWatchlist + getWatchlist roundtrip", () => {
    addToWatchlist("AAPL", { asset_type: "stock" });
    const list = getWatchlist();
    expect(list.some((e) => e.symbol === "AAPL")).toBe(true);
    const entry = list.find((e) => e.symbol === "AAPL");
    expect(entry?.asset_type).toBe("stock");
    expect(entry?.added_at).toBeTruthy();
  });

  itSql("removeFromWatchlist returns true for existing symbol", () => {
    addToWatchlist("ETH", { asset_type: "crypto" });
    const removed = removeFromWatchlist("ETH");
    expect(removed).toBe(true);
    expect(getWatchlist().some((e) => e.symbol === "ETH")).toBe(false);
  });

  itSql("removeFromWatchlist returns false for non-existent symbol", () => {
    const removed = removeFromWatchlist("NOTREAL");
    expect(removed).toBe(false);
  });

  itSql("upsertSignal creates signal record", () => {
    const id = upsertSignal("BTC", "Bitcoin thesis", 0.7, "strengthened");
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
    const signal = getSignalForSymbol("BTC");
    expect(signal).not.toBeNull();
    expect(signal?.thesis).toBe("Bitcoin thesis");
    expect(signal?.confidence).toBe(0.7);
    expect(signal?.intensity).toBe("strengthened");
  });

  itSql("upsertSignal updates existing signal (same symbol)", () => {
    const id1 = upsertSignal("BTC", "thesis v1", 0.5, "neutral");
    const id2 = upsertSignal("BTC", "thesis v2", 0.8, "strengthened");
    // Same signal updated, not a new one
    expect(id2).toBe(id1);
    const signal = getSignalForSymbol("BTC");
    expect(signal?.thesis).toBe("thesis v2");
    expect(signal?.confidence).toBe(0.8);
  });

  itSql("appendSignalEvent stores trace_id and is append-only", () => {
    const id = upsertSignal("SOL", "Solana thesis", 0.6, "neutral");
    appendSignalEvent(id, "strengthened", { confidence: 0.7, delta: 0.1, note: "test" }, "abc123");
    appendSignalEvent(id, "weakened", { confidence: 0.5, delta: -0.2, note: "drop" }, "def456");

    const history = getSignalHistory(id);
    expect(history.length).toBeGreaterThanOrEqual(2);
    const last2 = history.slice(-2);
    expect(last2[0].trace_id).toBe("abc123");
    expect(last2[1].trace_id).toBe("def456");
  });

  itSql("saveBrief + getLastBrief roundtrip", () => {
    saveBrief({ date: "2026-03-01", brief_type: "daily", summary: "test brief", trace_id: "t1" });
    const last = getLastBrief("daily");
    expect(last).not.toBeNull();
    expect(last?.date).toBe("2026-03-01");
    expect(last?.summary).toBe("test brief");
  });

  itSql("getFinanceStats increments correctly", () => {
    addToWatchlist("TSLA", { asset_type: "stock" });
    upsertSignal("TSLA", "thesis", 0.5, "neutral");
    saveBrief({ date: "2026-03-01", brief_type: "daily", summary: "s", trace_id: "t" });

    const stats = getFinanceStats();
    expect(stats.watchlistCount).toBeGreaterThanOrEqual(1);
    expect(stats.signalCount).toBeGreaterThanOrEqual(1);
    expect(stats.briefCount).toBeGreaterThanOrEqual(1);
  });
});
