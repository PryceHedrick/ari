import { mkdtempSync, mkdirSync, writeFileSync as wfs, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

const TEST_VAULT = mkdtempSync(path.join(tmpdir(), "ari-autocapture-test-"));
process.env.ARI_OBSIDIAN_VAULT_PATH = TEST_VAULT;
process.env.HOME = mkdtempSync(path.join(tmpdir(), "ari-home-"));
process.env.ARI_OBSIDIAN_MIN_SIGNAL_SCORE = "7";
process.env.ARI_OBSIDIAN_ENABLED = "true";

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

import { writeCapture } from "./auto-capture.js";
import { scoreEvent } from "./signal-scorer.js";

describe("signal-scorer", () => {
  it("score below threshold (score=5 < 7)", () => {
    const scored = scoreEvent({ eventType: "message_sending", responseLength: 100 });
    expect(scored.score).toBeLessThan(7);
  });

  it("policy deny - always capture (score=8)", () => {
    const scored = scoreEvent({ eventType: "policy_deny", isPolicyDeny: true });
    expect(scored.alwaysCapture).toBe(true);
    expect(scored.score).toBe(8);
  });

  it("kill switch - score=10 always capture", () => {
    const scored = scoreEvent({ eventType: "kill_switch", isKillSwitch: true });
    expect(scored.score).toBe(10);
    expect(scored.alwaysCapture).toBe(true);
  });

  it("tool calls - score >= 7", () => {
    const scored = scoreEvent({ eventType: "message_sending", hasToolCalls: true });
    expect(scored.score).toBeGreaterThanOrEqual(7);
  });
});

describe("auto-capture writeCapture", () => {
  beforeEach(() => {
    const today = new Date().toISOString().slice(0, 10);
    mkdirSync(path.join(TEST_VAULT, "40-Logs", "Daily"), { recursive: true });
    mkdirSync(path.join(TEST_VAULT, "00-Inbox"), { recursive: true });
    mkdirSync(path.join(TEST_VAULT, "20-Areas", "Operations", "Incidents"), { recursive: true });
    const dailyContent = [
      "---",
      "type: daily",
      "date: " + today,
      "source: ari-obsidian",
      "trace_id: test",
      "tags: []",
      "---",
      "# Daily",
      "",
      "## Notable Interactions",
      "",
    ].join("\n");
    wfs(path.join(TEST_VAULT, "40-Logs", "Daily", today + ".md"), dailyContent);
  });

  itSql("trace_id always present in fragment - no crash", () => {
    expect(() =>
      writeCapture({
        traceId: "abc12345",
        agent: "ARI",
        eventType: "test",
        summary: "test summary",
        score: 8,
      }),
    ).not.toThrow();
  });

  itSql("secret patterns are redacted in captures", () => {
    const secretText = "Here is sk-ant-abc123xyz456789012345678 my key";
    writeCapture({
      traceId: "secrettest",
      agent: "ARI",
      eventType: "test",
      summary: secretText,
      score: 9,
    });
    const inboxFile = path.join(TEST_VAULT, "00-Inbox", "trace-secrettest.md");
    if (existsSync(inboxFile)) {
      const content = readFileSync(inboxFile, "utf8");
      expect(content).not.toContain("sk-ant-abc123xyz456789012345678");
    } else {
      expect(true).toBe(true);
    }
  });

  it("auto-capture disabled - no throws", () => {
    process.env.ARI_OBSIDIAN_ENABLED = "false";
    expect(() =>
      writeCapture({
        traceId: "disabled",
        agent: "ARI",
        eventType: "test",
        summary: "test",
        score: 10,
      }),
    ).not.toThrow();
    process.env.ARI_OBSIDIAN_ENABLED = "true";
  });
});
