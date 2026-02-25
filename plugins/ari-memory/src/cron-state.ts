/**
 * CronStateEnvelope — Cross-task state persistence for OpenClaw plugins.
 *
 * Solves "cron amnesia": when `pre-fetch-market` (05:00) computes a snapshot
 * and the process context changes before `morning-briefing` (06:30) fires,
 * all in-memory state is lost. This persists the payload to SQLite WAL so
 * the briefing can recover it even after restarts.
 *
 * Usage:
 *   // Producer (pre-fetch-market):
 *   writeCronState('market-snapshot', snapshot, 4 * 60 * 60 * 1000);
 *
 *   // Consumer (morning-briefing):
 *   const snapshot = readCronState('market-snapshot');
 *
 * TTL: entries expire after the specified ms. Default: 4 hours.
 * Cleanup: `cleanupExpiredCronState()` called by ari-scheduler at 03:30 daily.
 *
 * Section 19.1 PRAGMA config applied on open.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const ARI_DB_DIR = path.join(homedir(), ".ari", "databases");
const CRON_STATE_DB_PATH = path.join(ARI_DB_DIR, "cron-state.db");
const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) {
    return _db;
  }
  if (!existsSync(ARI_DB_DIR)) {
    mkdirSync(ARI_DB_DIR, { recursive: true });
  }
  _db = new Database(CRON_STATE_DB_PATH);
  // Section 19.1 PRAGMAs
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("cache_size = -4000");
  _db.pragma("temp_store = MEMORY");
  _db.pragma("foreign_keys = ON");
  _db
    .prepare(`
    CREATE TABLE IF NOT EXISTS cron_state (
      key          TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      written_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL
    )
  `)
    .run();
  _db.prepare("CREATE INDEX IF NOT EXISTS idx_cron_state_expires ON cron_state(expires_at)").run();
  return _db;
}

/**
 * Write a cron state payload. Overwrites any existing value for the key.
 * @param key     Logical window key (e.g. 'market-snapshot')
 * @param payload Any JSON-serializable value
 * @param ttlMs   Time-to-live in milliseconds (default: 4 hours)
 */
export function writeCronState(key: string, payload: unknown, ttlMs = DEFAULT_TTL_MS): void {
  const db = getDb();
  const payloadJson = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(payloadJson).digest("hex");
  const now = Date.now();
  const expiresAt = now + ttlMs;

  db.prepare(`
    INSERT INTO cron_state (key, payload_json, payload_hash, written_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      payload_json = excluded.payload_json,
      payload_hash = excluded.payload_hash,
      written_at   = excluded.written_at,
      expires_at   = excluded.expires_at
  `).run(key, payloadJson, payloadHash, now, expiresAt);
}

/**
 * Read a cron state payload. Returns null if key does not exist or has expired.
 * @param key Logical window key
 */
export function readCronState<T = unknown>(key: string): T | null {
  const db = getDb();
  const now = Date.now();

  const row = db
    .prepare("SELECT payload_json, expires_at FROM cron_state WHERE key = ?")
    .get(key) as { payload_json: string; expires_at: number } | undefined;

  if (!row) {
    return null;
  }
  if (row.expires_at < now) {
    // Expired — remove it
    db.prepare("DELETE FROM cron_state WHERE key = ?").run(key);
    return null;
  }

  return JSON.parse(row.payload_json) as T;
}

/**
 * Remove a specific cron state key immediately.
 */
export function deleteCronState(key: string): void {
  getDb().prepare("DELETE FROM cron_state WHERE key = ?").run(key);
}

/**
 * Remove all expired entries. Called daily at 03:30 by ari-scheduler.
 * Returns the number of rows deleted.
 */
export function cleanupExpiredCronState(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM cron_state WHERE expires_at < ?").run(Date.now());
  return result.changes;
}

/** Diagnostic stats for health monitoring */
export function getCronStateStats(): { total: number; expired: number } {
  const db = getDb();
  const now = Date.now();
  const { total } = db.prepare("SELECT COUNT(*) as total FROM cron_state").get() as {
    total: number;
  };
  const { expired } = db
    .prepare("SELECT COUNT(*) as expired FROM cron_state WHERE expires_at < ?")
    .get(now) as { expired: number };
  return { total, expired };
}

// Export a stable key constant for the market snapshot handoff
export const MARKET_SNAPSHOT_KEY = "market-snapshot";

// Export unique ID generator for use by producers
export { randomUUID };
