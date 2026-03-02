/**
 * ARI Run Ledger — task execution history.
 *
 * Each (task_id, scheduled_at) pair is a unique row. Status lifecycle:
 *   pending → running → success | failed | dead-letter | stale | skipped
 *
 * Summaries are limited to 240 chars and must NOT contain API keys,
 * prompt content, or raw message data.
 */

import { getSettingsDb, type LedgerStatus } from "./settings-db.js";

export type LedgerRow = {
  task_id: string;
  scheduled_at: number;
  started_at: number | null;
  finished_at: number | null;
  status: LedgerStatus;
  lane: string;
  summary: string | null;
  error_code: string | null;
  retry_count: number;
  artifacts: string | null; // JSON array ["id:...", "url:..."]
  request_id: string | null;
  runner_id: string | null;
};

export type UpsertLedgerInput = {
  task_id: string;
  scheduled_at?: number; // defaults to Date.now()
  status: LedgerStatus;
  lane: string;
  summary?: string;
  error_code?: string;
  retry_count?: number;
  artifacts?: string[];
  request_id?: string;
  runner_id?: string;
};

/** Insert or update a run_ledger row. */
export function upsertLedger(input: UpsertLedgerInput): void {
  const db = getSettingsDb();
  const now = Date.now();
  const scheduledAt = input.scheduled_at ?? now;
  const summary = input.summary ? input.summary.slice(0, 240) : null;
  const artifacts = input.artifacts ? JSON.stringify(input.artifacts) : null;
  db.prepare(`
    INSERT INTO run_ledger
      (task_id, scheduled_at, started_at, finished_at, status, lane,
       summary, error_code, retry_count, artifacts, request_id, runner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id, scheduled_at) DO UPDATE SET
      started_at   = CASE WHEN excluded.status = 'running' THEN ? ELSE started_at END,
      finished_at  = CASE WHEN excluded.status NOT IN ('pending','running') THEN ? ELSE finished_at END,
      status       = excluded.status,
      summary      = COALESCE(excluded.summary, summary),
      error_code   = COALESCE(excluded.error_code, error_code),
      retry_count  = excluded.retry_count,
      artifacts    = COALESCE(excluded.artifacts, artifacts),
      request_id   = COALESCE(excluded.request_id, request_id),
      runner_id    = COALESCE(excluded.runner_id, runner_id)
  `).run(
    input.task_id,
    scheduledAt,
    input.status === "running" ? now : null,
    !["pending", "running"].includes(input.status) ? now : null,
    input.status,
    input.lane,
    summary,
    input.error_code ?? null,
    input.retry_count ?? 0,
    artifacts,
    input.request_id ?? null,
    input.runner_id ?? process.env.ARI_RUNNER_ID ?? null,
    // ON CONFLICT UPDATE params
    now, // started_at
    now, // finished_at
  );
}

/** Update just the status (and optionally summary/error_code) for an existing row. */
export function updateLedgerStatus(
  taskId: string,
  scheduledAt: number,
  status: LedgerStatus,
  opts?: { summary?: string; error_code?: string },
): void {
  const db = getSettingsDb();
  const now = Date.now();
  const summary = opts?.summary ? opts.summary.slice(0, 240) : null;
  db.prepare(`
    UPDATE run_ledger
    SET status      = ?,
        finished_at = CASE WHEN ? NOT IN ('pending','running') THEN ? ELSE finished_at END,
        summary     = COALESCE(?, summary),
        error_code  = COALESCE(?, error_code)
    WHERE task_id = ? AND scheduled_at = ?
  `).run(status, status, now, summary, opts?.error_code ?? null, taskId, scheduledAt);
}

/** Query recent ledger rows, optionally filtered. */
export function queryLedger(opts: {
  status?: LedgerStatus | LedgerStatus[];
  limit?: number;
  sinceMs?: number;
}): LedgerRow[] {
  const db = getSettingsDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    const placeholders = statuses.map(() => "?").join(", ");
    conditions.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }
  if (opts.sinceMs !== undefined) {
    conditions.push("scheduled_at >= ?");
    params.push(opts.sinceMs);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit ?? 50);

  return db
    .prepare(`SELECT * FROM run_ledger ${where} ORDER BY scheduled_at DESC LIMIT ?`)
    .all(...params) as LedgerRow[];
}

/** Get stale "running" rows from a crashed previous instance (started > 5 min ago). */
export function getStaleRunning(): LedgerRow[] {
  const db = getSettingsDb();
  const staleThreshold = Date.now() - 300_000; // 5 minutes
  return db
    .prepare(`
      SELECT * FROM run_ledger
      WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ?
    `)
    .all(staleThreshold) as LedgerRow[];
}

/** Get count of dead-letter rows for /status display. */
export function getDeadLetterCount(): number {
  const db = getSettingsDb();
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM run_ledger WHERE status = 'dead-letter'")
    .get() as { cnt: number };
  return row.cnt;
}
