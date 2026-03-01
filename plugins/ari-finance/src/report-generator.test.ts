/**
 * Report generator tests — disclaimer present, base/bull/bear/invalidation schema.
 * Tests use itSql guard since report-generator pulls from finance-db (SQLite).
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

// Point to temp dir for DB writes
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ari-report-test-"));
process.env["HOME"] = tmpDir;
// Disable vault writes in tests
process.env["ARI_OBSIDIAN_ENABLED"] = "false";

import {
  generateForecast,
  generateSentiment,
  generateFullReport,
  DISCLAIMER,
} from "./report-generator.js";

const TEST_SYM = `RPT_${Date.now()}`;

describe("report-generator", () => {
  describe("DISCLAIMER constant", () => {
    it("matches expected text", () => {
      expect(DISCLAIMER).toBe(
        "⚠️ Informational analysis only. Not financial advice. No automated trading.",
      );
    });
  });

  describe("generateForecast", () => {
    itSql("returns all required fields", () => {
      const f = generateForecast(TEST_SYM);
      expect(f.symbol).toBe(TEST_SYM.toUpperCase());
      expect(f.base).toBeDefined();
      expect(f.base.summary).toBeTruthy();
      expect(f.bull).toBeDefined();
      expect(f.bull.summary).toBeTruthy();
      expect(f.bull.trigger).toBeTruthy();
      expect(f.bear).toBeDefined();
      expect(f.bear.summary).toBeTruthy();
      expect(f.bear.trigger).toBeTruthy();
      expect(f.invalidation).toBeTruthy();
      expect(typeof f.confidence).toBe("number");
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
      expect(f.trace_id).toBeTruthy();
    });

    itSql("always includes DISCLAIMER", () => {
      const f = generateForecast(TEST_SYM);
      expect(f.disclaimer).toBe(DISCLAIMER);
    });

    itSql("uppercases symbol", () => {
      const f = generateForecast("btc");
      expect(f.symbol).toBe("BTC");
    });

    itSql("date field is YYYY-MM-DD", () => {
      const f = generateForecast(TEST_SYM);
      expect(f.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    itSql("trace_id is 8-char hex", () => {
      const f = generateForecast(TEST_SYM);
      expect(f.trace_id).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe("generateSentiment", () => {
    itSql("returns sentiment in valid range", () => {
      const s = generateSentiment(TEST_SYM);
      expect(["bullish", "bearish", "neutral"]).toContain(s.sentiment);
    });

    itSql("always includes DISCLAIMER", () => {
      const s = generateSentiment(TEST_SYM);
      expect(s.disclaimer).toBe(DISCLAIMER);
    });

    itSql("confidence in [0, 1]", () => {
      const s = generateSentiment(TEST_SYM);
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
    });

    itSql("rationale is non-empty", () => {
      const s = generateSentiment(TEST_SYM);
      expect(s.rationale.length).toBeGreaterThan(0);
    });

    itSql("appends news context to rationale when provided", () => {
      const s = generateSentiment(TEST_SYM, "breaking news about economy");
      expect(s.rationale).toContain("News:");
    });
  });

  describe("generateFullReport", () => {
    itSql("returns all top-level fields", () => {
      const r = generateFullReport(TEST_SYM);
      expect(r.symbol).toBe(TEST_SYM.toUpperCase());
      expect(r.forecast).toBeDefined();
      expect(r.sentiment).toBeDefined();
      expect(r.signalStatus).toBeTruthy();
      expect(r.disclaimer).toBe(DISCLAIMER);
      expect(r.trace_id).toBeTruthy();
    });

    itSql("nested forecast has all required fields", () => {
      const r = generateFullReport(TEST_SYM);
      expect(r.forecast.base).toBeDefined();
      expect(r.forecast.bull).toBeDefined();
      expect(r.forecast.bear).toBeDefined();
      expect(r.forecast.invalidation).toBeTruthy();
    });

    itSql("nested sentiment has disclaimer", () => {
      const r = generateFullReport(TEST_SYM);
      expect(r.sentiment.disclaimer).toBe(DISCLAIMER);
    });

    itSql("signalStatus shows 'No signal' for unknown symbol", () => {
      const r = generateFullReport(`UNKNOWN_${Date.now()}`);
      expect(r.signalStatus).toBe("No signal on record");
    });
  });
});
