/**
 * ARI Autonomy Settings DB — SQLite WAL store for:
 *   autonomy_settings  — mode (auto/supervised/paused) + other runtime settings
 *   run_ledger         — task execution history with status, lane, error, artifacts
 *   approvals_queue    — pending/resolved Discord approval cards with dedup key
 *
 * Section 19.1 PRAGMA config applied on every open.
 * Path: ~/.ari/databases/settings.db
 */

import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseInstance } from "better-sqlite3";

const ARI_DB_DIR = path.join(homedir(), ".ari", "databases");
export const SETTINGS_DB_PATH = path.join(ARI_DB_DIR, "settings.db");

export type AutonomyMode = "auto" | "supervised" | "paused";
export type LedgerStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "stale"
  | "dead-letter"
  | "skipped";
export type ApprovalStatus = "pending" | "approved" | "denied" | "snoozed" | "expired";
export type RiskLevel = "low" | "medium" | "high";

function applyPragmas(db: DatabaseInstance): void {
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
}

function createSchema(db: DatabaseInstance): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS autonomy_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS run_ledger (
      task_id       TEXT NOT NULL,
      scheduled_at  INTEGER NOT NULL,
      started_at    INTEGER,
      finished_at   INTEGER,
      status        TEXT NOT NULL,
      lane          TEXT NOT NULL,
      summary       TEXT,
      error_code    TEXT,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      artifacts     TEXT,
      request_id    TEXT,
      runner_id     TEXT,
      PRIMARY KEY (task_id, scheduled_at)
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_ledger_status ON run_ledger (status)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_ledger_task_id ON run_ledger (task_id)").run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS approvals_queue (
      approval_id     TEXT PRIMARY KEY,
      approval_key    TEXT NOT NULL UNIQUE,
      requested_at    INTEGER NOT NULL,
      expires_at      INTEGER NOT NULL,
      task_id         TEXT NOT NULL,
      agent           TEXT,
      lane_reason     TEXT NOT NULL,
      cost_estimate   TEXT,
      risk_level      TEXT NOT NULL DEFAULT 'low',
      payload_ref     TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',
      discord_msg_id  TEXT,
      discord_channel TEXT,
      resolved_at     INTEGER,
      resolved_by     TEXT
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_approvals_status  ON approvals_queue (status)").run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_approvals_expires ON approvals_queue (expires_at)",
  ).run();

  // Cross-instance deduplication tables (Phase 1)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS message_leases (
      channel_id  TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      runner_id   TEXT NOT NULL,
      leased_at   INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      PRIMARY KEY (channel_id, message_id)
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_leases_exp ON message_leases (expires_at)").run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS leader_leases (
      lease_key   TEXT PRIMARY KEY,
      runner_id   TEXT NOT NULL,
      leased_at   INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    )
  `).run();
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let _db: DatabaseInstance | null = null;

export function getSettingsDb(): DatabaseInstance {
  if (_db) {
    return _db;
  }
  if (!existsSync(ARI_DB_DIR)) {
    mkdirSync(ARI_DB_DIR, { recursive: true });
  }
  _db = new Database(SETTINGS_DB_PATH);
  applyPragmas(_db);
  createSchema(_db);
  return _db;
}

// ─── Autonomy Mode ────────────────────────────────────────────────────────────

/**
 * Read current autonomy mode.
 * Precedence: ARI_AUTONOMY_MODE env var > settings DB > default "auto"
 */
export function readAutonomyMode(): { mode: AutonomyMode; source: "env" | "db" | "default" } {
  const envMode = process.env.ARI_AUTONOMY_MODE as AutonomyMode | undefined;
  if (envMode && ["auto", "supervised", "paused"].includes(envMode)) {
    return { mode: envMode, source: "env" };
  }
  const db = getSettingsDb();
  const row = db.prepare("SELECT value FROM autonomy_settings WHERE key = 'autonomy_mode'").get() as
    | { value: string }
    | undefined;
  if (row?.value && ["auto", "supervised", "paused"].includes(row.value)) {
    return { mode: row.value as AutonomyMode, source: "db" };
  }
  return { mode: "auto", source: "default" };
}

/** Persist autonomy mode to settings DB. */
export function writeAutonomyMode(mode: AutonomyMode, updatedBy: string): void {
  const db = getSettingsDb();
  db.prepare(`
    INSERT INTO autonomy_settings (key, value, updated_at, updated_by)
    VALUES ('autonomy_mode', ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(mode, Date.now(), updatedBy);
}
