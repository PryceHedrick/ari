/**
 * ARI Finance Database — SQLite WAL with signal event log.
 * DB: ~/.ari/databases/finance.db
 * Follows Section 19.1 PRAGMA pattern from memory-db.ts.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseInstance } from "better-sqlite3";

const ARI_DB_DIR = path.join(homedir(), ".ari", "databases");
export const FINANCE_DB_PATH = path.join(ARI_DB_DIR, "finance.db");

function applyPragmas(db: DatabaseInstance): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -8000");
  db.pragma("temp_store = MEMORY");
  db.pragma("wal_autocheckpoint = 1000");
  db.pragma("foreign_keys = ON");
  db.pragma("analysis_limit = 10000");
  db.pragma("optimize");
}

function createSchema(db: DatabaseInstance): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS watchlist (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      asset_type TEXT NOT NULL DEFAULT 'stock',
      added_at TEXT NOT NULL,
      notes TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      thesis TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      intensity TEXT DEFAULT 'neutral',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS signal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_id INTEGER NOT NULL REFERENCES signals(id),
      event_type TEXT NOT NULL,
      delta_json TEXT DEFAULT '{}',
      trace_id TEXT,
      ts TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      brief_type TEXT NOT NULL,
      content_hash TEXT,
      summary TEXT,
      written_at TEXT NOT NULL,
      trace_id TEXT
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol)").run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_signal_events_signal_id ON signal_events(signal_id)",
  ).run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_briefs_date ON briefs(date)").run();
}

let _db: DatabaseInstance | null = null;

export function getFinanceDb(): DatabaseInstance {
  if (_db) {
    return _db;
  }
  if (!existsSync(ARI_DB_DIR)) {
    mkdirSync(ARI_DB_DIR, { recursive: true });
  }
  _db = new Database(FINANCE_DB_PATH);
  applyPragmas(_db);
  createSchema(_db);
  return _db;
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  symbol: string;
  name?: string;
  asset_type: "stock" | "crypto" | "etf" | "macro";
  added_at: string;
  notes?: string;
}

export function addToWatchlist(
  symbol: string,
  opts?: { name?: string; asset_type?: WatchlistEntry["asset_type"]; notes?: string },
): void {
  const db = getFinanceDb();
  db.prepare(
    "INSERT OR IGNORE INTO watchlist (symbol, name, asset_type, added_at, notes) VALUES (?, ?, ?, ?, ?)",
  ).run(
    symbol.toUpperCase(),
    opts?.name ?? null,
    opts?.asset_type ?? "stock",
    new Date().toISOString(),
    opts?.notes ?? null,
  );
}

export function removeFromWatchlist(symbol: string): boolean {
  const db = getFinanceDb();
  const result = db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol.toUpperCase());
  return result.changes > 0;
}

export function getWatchlist(): WatchlistEntry[] {
  const db = getFinanceDb();
  return db.prepare("SELECT * FROM watchlist ORDER BY added_at DESC").all() as WatchlistEntry[];
}

// ── Signals ───────────────────────────────────────────────────────────────────

export type SignalIntensity = "strengthened" | "weakened" | "falsified" | "unchanged" | "neutral";
export type SignalEventType =
  | "created"
  | "strengthened"
  | "weakened"
  | "falsified"
  | "unchanged"
  | "note";

export interface Signal {
  id: number;
  symbol: string;
  thesis: string;
  confidence: number;
  intensity: SignalIntensity;
  created_at: string;
  updated_at: string;
}

export function upsertSignal(
  symbol: string,
  thesis: string,
  confidence = 0.5,
  intensity: SignalIntensity = "neutral",
): number {
  const db = getFinanceDb();
  const existing = db
    .prepare("SELECT id FROM signals WHERE symbol = ?")
    .get(symbol.toUpperCase()) as { id: number } | undefined;
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(
      "UPDATE signals SET thesis = ?, confidence = ?, intensity = ?, updated_at = ? WHERE id = ?",
    ).run(thesis, confidence, intensity, now, existing.id);
    return existing.id;
  }

  const result = db
    .prepare(
      "INSERT INTO signals (symbol, thesis, confidence, intensity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(symbol.toUpperCase(), thesis, confidence, intensity, now, now);
  return result.lastInsertRowid as number;
}

export function appendSignalEvent(
  signalId: number,
  eventType: SignalEventType,
  delta: Record<string, unknown>,
  traceId?: string,
): void {
  const db = getFinanceDb();
  db.prepare(
    "INSERT INTO signal_events (signal_id, event_type, delta_json, trace_id, ts) VALUES (?, ?, ?, ?, ?)",
  ).run(signalId, eventType, JSON.stringify(delta), traceId ?? null, new Date().toISOString());
}

export function getSignalForSymbol(symbol: string): Signal | null {
  const db = getFinanceDb();
  return db
    .prepare("SELECT * FROM signals WHERE symbol = ? ORDER BY updated_at DESC LIMIT 1")
    .get(symbol.toUpperCase()) as Signal | null;
}

export function getSignalHistory(
  signalId: number,
): Array<{ event_type: string; delta_json: string; trace_id: string | null; ts: string }> {
  const db = getFinanceDb();
  return db
    .prepare(
      "SELECT event_type, delta_json, trace_id, ts FROM signal_events WHERE signal_id = ? ORDER BY ts ASC",
    )
    .all(signalId) as Array<{
    event_type: string;
    delta_json: string;
    trace_id: string | null;
    ts: string;
  }>;
}

// ── Briefs ────────────────────────────────────────────────────────────────────

export function saveBrief(opts: {
  date: string;
  brief_type: string;
  summary: string;
  trace_id?: string;
}): void {
  const db = getFinanceDb();
  const hash = createHash("sha256").update(opts.summary).digest("hex").slice(0, 16);
  db.prepare(
    "INSERT INTO briefs (date, brief_type, content_hash, summary, written_at, trace_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    opts.date,
    opts.brief_type,
    hash,
    opts.summary.slice(0, 2000),
    new Date().toISOString(),
    opts.trace_id ?? null,
  );
}

export function getLastBrief(brief_type = "daily"): { date: string; summary: string } | null {
  const db = getFinanceDb();
  return db
    .prepare(
      "SELECT date, summary FROM briefs WHERE brief_type = ? ORDER BY written_at DESC LIMIT 1",
    )
    .get(brief_type) as { date: string; summary: string } | null;
}

export function getFinanceStats(): {
  watchlistCount: number;
  signalCount: number;
  briefCount: number;
} {
  const db = getFinanceDb();
  const { watchlistCount } = db
    .prepare("SELECT COUNT(*) as watchlistCount FROM watchlist")
    .get() as { watchlistCount: number };
  const { signalCount } = db.prepare("SELECT COUNT(*) as signalCount FROM signals").get() as {
    signalCount: number;
  };
  const { briefCount } = db.prepare("SELECT COUNT(*) as briefCount FROM briefs").get() as {
    briefCount: number;
  };
  return { watchlistCount, signalCount, briefCount };
}
