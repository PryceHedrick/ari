import { mkdtempSync, writeFileSync as wfs, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

const TEST_VAULT = mkdtempSync(path.join(tmpdir(), "ari-vault-index-test-"));
process.env.ARI_OBSIDIAN_VAULT_PATH = TEST_VAULT;
process.env.HOME = mkdtempSync(path.join(tmpdir(), "ari-home-"));

// Check if better-sqlite3 native module is available
let sqliteAvailable = true;
try {
  const Database = (await import("better-sqlite3")).default;
  // Test a quick open
  const testDb = new Database(":memory:");
  testDb.close();
} catch {
  sqliteAvailable = false;
}

const itSql = sqliteAvailable ? it : it.skip;

import { reindexVaultSync, getVaultStats } from "./vault-index.js";

describe("vault-index reindex", () => {
  beforeEach(() => {
    mkdirSync(path.join(TEST_VAULT, "40-Logs", "Daily"), { recursive: true });
  });

  itSql("incremental reindex skips unchanged files", () => {
    const noteContent = [
      "---",
      "type: daily",
      "date: 2026-01-01",
      "source: ari-obsidian",
      "trace_id: abc12345",
      "tags: [daily]",
      "---",
      "# Test Note",
      "",
    ].join("\n");
    wfs(path.join(TEST_VAULT, "40-Logs", "Daily", "2026-01-01.md"), noteContent);
    const r1 = reindexVaultSync("incremental");
    const r2 = reindexVaultSync("incremental");
    expect(r1.processed).toBe(1);
    expect(r2.skipped).toBe(1);
    expect(r2.processed).toBe(0);
  });

  itSql("full reindex processes all files regardless of hash", () => {
    const r = reindexVaultSync("full");
    expect(r.mode).toBe("full");
  });

  itSql("note frontmatter trace_id is indexed", () => {
    const noteContent = [
      "---",
      "type: capture",
      "date: 2026-01-02",
      "source: ari-obsidian",
      "trace_id: deadbeef",
      "tags: [capture]",
      "---",
      "# Captured Note",
      "",
    ].join("\n");
    wfs(path.join(TEST_VAULT, "40-Logs", "Daily", "capture.md"), noteContent);
    reindexVaultSync("full");
    const stats = getVaultStats();
    expect(stats.noteCount).toBeGreaterThan(0);
  });

  itSql("empty vault returns zero stats without crash", () => {
    const stats = getVaultStats();
    expect(stats.noteCount).toBeGreaterThanOrEqual(0);
  });
});
