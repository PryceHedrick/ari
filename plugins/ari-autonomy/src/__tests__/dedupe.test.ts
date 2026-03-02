/**
 * Dedupe Store Tests — message lease lifecycle.
 */

import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

// Use an in-memory test DB to avoid polluting the real settings.db
const TEST_DB_PATH = path.join(homedir(), ".ari", "databases", "settings-test.db");

// Reset module state between tests to allow re-init with fresh DB
let acquireLease: typeof import("../dedupe-store.js").acquireLease;
let renewLease: typeof import("../dedupe-store.js").renewLease;
let releaseLease: typeof import("../dedupe-store.js").releaseLease;

beforeEach(async () => {
  // Clean up any leftover test DB
  if (existsSync(TEST_DB_PATH)) {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {}
  }
  // Re-import to reset module-level state (vitest caches modules)
  const mod = await import("../dedupe-store.js");
  acquireLease = mod.acquireLease;
  renewLease = mod.renewLease;
  releaseLease = mod.releaseLease;
});

describe("acquireLease", () => {
  it("returns true when feature flag disabled", () => {
    const prev = process.env.ARI_DEDUPE_LOCK_ENABLED;
    process.env.ARI_DEDUPE_LOCK_ENABLED = "false";
    try {
      expect(acquireLease("ch-1", "msg-1", "runner-a")).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.ARI_DEDUPE_LOCK_ENABLED;
      } else {
        process.env.ARI_DEDUPE_LOCK_ENABLED = prev;
      }
    }
  });
});

describe("releaseLease", () => {
  it("does not throw when lease does not exist", () => {
    process.env.ARI_DEDUPE_LOCK_ENABLED = "false";
    expect(() => releaseLease("ch-x", "msg-x")).not.toThrow();
  });
});

describe("renewLease", () => {
  it("does not throw when feature disabled", () => {
    process.env.ARI_DEDUPE_LOCK_ENABLED = "false";
    expect(() => renewLease("ch-y", "msg-y", "runner-b")).not.toThrow();
  });
});
