/**
 * ARI Ops Trace Store — SQLite WAL index for span events.
 *
 * DB:    ~/.ari/databases/traces.db
 * Table: traces — indexed by trace_id, ts DESC, agent
 * Retention: configurable (default 30 days), pruned on startup + daily
 *
 * Follows the same PRAGMA pattern as ari-memory/src/memory-db.ts (Section 19.1).
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseInstance } from "better-sqlite3";
import type { SpanEvent } from "./tracer.js";

const ARI_DB_DIR = path.join(homedir(), ".ari", "databases");
export const TRACES_DB_PATH = path.join(ARI_DB_DIR, "traces.db");

function applyPragmas(db: DatabaseInstance): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -8000"); // 8MB
  db.pragma("temp_store = MEMORY");
  db.pragma("wal_autocheckpoint = 1000");
  db.pragma("foreign_keys = ON");
  db.pragma("analysis_limit = 10000");
  db.pragma("optimize");
}

function createSchema(db: DatabaseInstance): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS traces (
      span_id        TEXT PRIMARY KEY,
      trace_id       TEXT NOT NULL,
      parent_span_id TEXT,
      ts             TEXT NOT NULL,
      event          TEXT NOT NULL,
      agent          TEXT,
      provider       TEXT,
      model          TEXT,
      tool           TEXT,
      policy_action  TEXT,
      policy_rule    TEXT,
      duration_ms    INTEGER,
      token_count    INTEGER,
      summary        TEXT
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(trace_id)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_traces_ts ON traces(ts DESC)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_traces_agent ON traces(agent)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_traces_event ON traces(event)").run();
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let _db: DatabaseInstance | null = null;

function getDb(): DatabaseInstance {
  if (_db) {
    return _db;
  }
  if (!existsSync(ARI_DB_DIR)) {
    mkdirSync(ARI_DB_DIR, { recursive: true });
  }
  _db = new Database(TRACES_DB_PATH);
  applyPragmas(_db);
  createSchema(_db);
  return _db;
}

/** Persist a batch of span events to SQLite. Called by drain loop. */
export function persistSpans(events: SpanEvent[]): void {
  if (events.length === 0) {
    return;
  }
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO traces
      (span_id, trace_id, parent_span_id, ts, event, agent, provider, model,
       tool, policy_action, policy_rule, duration_ms, token_count, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: SpanEvent[]) => {
    for (const e of rows) {
      insert.run(
        e.spanId,
        e.traceId,
        e.parentSpanId ?? null,
        e.ts,
        e.event,
        e.agentName ?? null,
        e.provider ?? null,
        e.model ?? null,
        e.tool ?? null,
        e.policyAction ?? null,
        e.policyRule ?? null,
        e.durationMs ?? null,
        e.tokenCount ?? null,
        e.summary ?? null,
      );
    }
  });
  insertMany(events);
}

/** Prune spans older than retentionDays. */
export function pruneOldSpans(retentionDays: number): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const result = db.prepare("DELETE FROM traces WHERE ts < ?").run(cutoff);
  return result.changes;
}

/** Query most recent N spans, optionally filtered by agent. */
export function queryRecent(
  limit: number,
  agentFilter?: string,
): Array<SpanEvent & { span_id: string }> {
  const db = getDb();
  if (agentFilter) {
    return db
      .prepare("SELECT * FROM traces WHERE agent = ? ORDER BY ts DESC LIMIT ?")
      .all(agentFilter, limit) as Array<SpanEvent & { span_id: string }>;
  }
  return db.prepare("SELECT * FROM traces ORDER BY ts DESC LIMIT ?").all(limit) as Array<
    SpanEvent & { span_id: string }
  >;
}

/** Query all spans for a given traceId. */
export function queryByTraceId(traceId: string): Array<SpanEvent & { span_id: string }> {
  const db = getDb();
  return db
    .prepare("SELECT * FROM traces WHERE trace_id = ? ORDER BY ts ASC")
    .all(traceId) as Array<SpanEvent & { span_id: string }>;
}

/** Count total stored spans. */
export function countSpans(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as n FROM traces").get() as { n: number };
  return row.n;
}

/** Get the most recent span entry. */
export function getLatestSpan(): (SpanEvent & { span_id: string }) | null {
  const db = getDb();
  return (
    (db.prepare("SELECT * FROM traces ORDER BY ts DESC LIMIT 1").get() as
      | (SpanEvent & { span_id: string })
      | undefined) ?? null
  );
}
