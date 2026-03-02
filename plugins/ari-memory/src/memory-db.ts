/**
 * ARI Memory Database — SQLite WAL provenance-tracked knowledge store.
 *
 * Schema:
 *   memories         — core knowledge records with content-hash dedup
 *   knowledge_index  — TF-IDF inverted index (term → memory_id)
 *   bookmarks        — URL captures with summaries
 *   ari_dora_metrics — DORA operational KPIs (Section 29.10)
 *
 * Section 19.1 PRAGMA config applied on every open.
 * Content-hash SHA-256 ensures no duplicate knowledge accumulates.
 *
 * Memory types (A-Mem/Synapse research, arXiv 2502.12110/2601.02744):
 *   episodic  — specific experiences with time/place/event context
 *   semantic  — general patterns and extracted knowledge
 *   procedural — how-to knowledge and process templates
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseInstance } from "better-sqlite3";

const ARI_DB_DIR = path.join(homedir(), ".ari", "databases");
export const MEMORY_DB_PATH = path.join(ARI_DB_DIR, "memory.db");

/** Section 19.1: Required PRAGMA config for all ARI SQLite databases */
function applyPragmas(db: DatabaseInstance): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -10000"); // 10MB in-memory cache
  db.pragma("temp_store = MEMORY");
  db.pragma("wal_autocheckpoint = 1000");
  db.pragma("foreign_keys = ON");
  db.pragma("analysis_limit = 10000");
  db.pragma("optimize");
}

/** Create all tables and indexes using individual prepare().run() calls (no db.exec). */
function createSchema(db: DatabaseInstance): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS memories (
      id           TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      content_hash TEXT NOT NULL UNIQUE,
      title        TEXT,
      source       TEXT NOT NULL,
      domain       TEXT,
      tags         TEXT,
      agent        TEXT,
      memory_type  TEXT NOT NULL DEFAULT 'semantic',
      trust_level  TEXT NOT NULL DEFAULT 'STANDARD',
      confidence   REAL NOT NULL DEFAULT 0.5,
      created_at   TEXT NOT NULL,
      expires_at   TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS knowledge_index (
      term          TEXT NOT NULL,
      memory_id     TEXT NOT NULL,
      tf_idf_score  REAL NOT NULL,
      PRIMARY KEY (term, memory_id),
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id           TEXT PRIMARY KEY,
      url          TEXT NOT NULL UNIQUE,
      title        TEXT,
      summary      TEXT,
      content_hash TEXT NOT NULL,
      saved_at     TEXT NOT NULL,
      tags         TEXT,
      domain       TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ari_dora_metrics (
      id          TEXT PRIMARY KEY,
      metric      TEXT NOT NULL,
      value       REAL NOT NULL,
      period      TEXT NOT NULL,
      agent       TEXT,
      measured_at TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_source      ON memories(source)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_domain      ON memories(domain)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_agent       ON memories(agent)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_type        ON memories(memory_type)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_knowledge_term       ON knowledge_index(term)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_bookmarks_url        ON bookmarks(url)").run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_dora_metric_period   ON ari_dora_metrics(metric, period)",
  ).run();

  // ─── Section 7: Learning Loop Tables ───────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS p1_feedback (
      job_id       TEXT PRIMARY KEY,
      approved     INTEGER NOT NULL DEFAULT 0,
      approval_note TEXT,
      views_7d     INTEGER,
      retention_pct REAL,
      timestamp    TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS p2_feedback (
      lead_id       TEXT PRIMARY KEY,
      outcome       TEXT NOT NULL,
      outcome_note  TEXT,
      vertical      TEXT,
      score_at_send REAL,
      timestamp     TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id             TEXT PRIMARY KEY,
      pipeline       TEXT NOT NULL,
      version        INTEGER NOT NULL,
      prompt         TEXT NOT NULL,
      rationale      TEXT,
      effective_date TEXT NOT NULL,
      created_at     TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS research_items (
      id         TEXT PRIMARY KEY,
      source     TEXT NOT NULL,
      title      TEXT NOT NULL,
      summary    TEXT NOT NULL,
      relevance  TEXT,
      adopted    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  // ─── Section 22 / Section 3.4: Agent Registry ──────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      name        TEXT PRIMARY KEY,
      emoji       TEXT NOT NULL,
      role        TEXT NOT NULL,
      plane       TEXT NOT NULL DEFAULT 'mission',
      model       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      last_seen   TEXT,
      spawn_count INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    )
  `).run();

  // Migrate legacy plane values to canonical names (idempotent — runs on every open)
  db.prepare("UPDATE agent_registry SET plane = 'mission' WHERE plane IN ('zoe', 'apex')").run();
  db.prepare("UPDATE agent_registry SET plane = 'build' WHERE plane = 'codex'").run();

  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_p1_feedback_timestamp    ON p1_feedback(timestamp)",
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_p2_feedback_outcome      ON p2_feedback(outcome)",
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_p2_feedback_vertical     ON p2_feedback(vertical)",
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_prompt_versions_pipeline ON prompt_versions(pipeline, version)",
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_research_items_source    ON research_items(source)",
  ).run();
  db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_research_items_adopted   ON research_items(adopted)",
  ).run();
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
let _db: DatabaseInstance | null = null;

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function getDb(): DatabaseInstance {
  if (_db) {
    return _db;
  }
  if (!existsSync(ARI_DB_DIR)) {
    mkdirSync(ARI_DB_DIR, { recursive: true });
  }
  _db = new Database(MEMORY_DB_PATH);
  applyPragmas(_db);
  createSchema(_db);
  return _db;
}

// ─── Memory records ───────────────────────────────────────────────────────────

export type MemoryType = "episodic" | "semantic" | "procedural";

export interface MemoryRecord {
  id: string;
  content: string;
  content_hash: string;
  title?: string;
  source: string;
  domain?: string;
  tags?: string[];
  agent?: string;
  memory_type: MemoryType;
  trust_level: string;
  confidence: number;
  created_at: string;
  expires_at?: string;
}

type MemoryRow = Omit<MemoryRecord, "tags"> & { tags: string | null };

export interface SaveMemoryInput {
  content: string;
  title?: string;
  source: string;
  domain?: string;
  tags?: string[];
  agent?: string;
  memory_type?: MemoryType;
  trust_level?: string;
  confidence?: number;
  expires_at?: string;
}

/** Store a memory. Returns the id and whether it was a duplicate (content-hash match). */
export function saveMemory(entry: SaveMemoryInput): { id: string; isDuplicate: boolean } {
  const db = getDb();
  const content_hash = createHash("sha256").update(entry.content).digest("hex");

  const existing = db.prepare("SELECT id FROM memories WHERE content_hash = ?").get(content_hash) as
    | { id: string }
    | undefined;
  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  const id = randomUUID().replace(/-/g, "").slice(0, 16);

  db.prepare(`
    INSERT INTO memories
      (id, content, content_hash, title, source, domain, tags, agent,
       memory_type, trust_level, confidence, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.content,
    content_hash,
    entry.title ?? null,
    entry.source,
    entry.domain ?? null,
    entry.tags ? JSON.stringify(entry.tags) : null,
    entry.agent ?? null,
    entry.memory_type ?? "semantic",
    entry.trust_level ?? "STANDARD",
    entry.confidence ?? 0.5,
    new Date().toISOString(),
    entry.expires_at ?? null,
  );

  return { id, isDuplicate: false };
}

export interface QueryMemoriesOptions {
  domain?: string;
  source?: string;
  agent?: string;
  minConfidence?: number;
  limit?: number;
}

/** Query memories with optional filters. Excludes expired records. */
export function queryMemories(opts: QueryMemoriesOptions): MemoryRecord[] {
  const db = getDb();
  const conditions: string[] = ["(expires_at IS NULL OR expires_at > ?)"];
  const params: unknown[] = [new Date().toISOString()];

  if (opts.domain) {
    conditions.push("domain = ?");
    params.push(opts.domain);
  }
  if (opts.source) {
    conditions.push("source = ?");
    params.push(opts.source);
  }
  if (opts.agent) {
    conditions.push("agent = ?");
    params.push(opts.agent);
  }
  if (opts.minConfidence !== undefined) {
    conditions.push("confidence >= ?");
    params.push(opts.minConfidence);
  }

  params.push(opts.limit ?? 50);

  const rows = db
    .prepare(
      `SELECT * FROM memories WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
    )
    .all(...params) as MemoryRow[];

  return rows.map((r) => ({
    ...r,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : undefined,
  }));
}

// ─── Bookmark records ─────────────────────────────────────────────────────────

export interface BookmarkRecord {
  id: string;
  url: string;
  title?: string;
  summary?: string;
  content_hash: string;
  saved_at: string;
  tags?: string[];
  domain?: string;
}

type BookmarkRow = Omit<BookmarkRecord, "tags"> & { tags: string | null };

/** Save a URL bookmark. Returns the id and whether the URL already existed. */
export function saveBookmark(entry: Omit<BookmarkRecord, "id" | "saved_at">): {
  id: string;
  isDuplicate: boolean;
} {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM bookmarks WHERE url = ?").get(entry.url) as
    | { id: string }
    | undefined;
  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  const id = randomUUID().replace(/-/g, "").slice(0, 16);

  db.prepare(`
    INSERT INTO bookmarks (id, url, title, summary, content_hash, saved_at, tags, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.url,
    entry.title ?? null,
    entry.summary ?? null,
    entry.content_hash,
    new Date().toISOString(),
    entry.tags ? JSON.stringify(entry.tags) : null,
    entry.domain ?? null,
  );

  return { id, isDuplicate: false };
}

export function getBookmarkByUrl(url: string): BookmarkRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bookmarks WHERE url = ?").get(url) as
    | BookmarkRow
    | undefined;
  if (!row) {
    return null;
  }
  return { ...row, tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined };
}

// ─── DORA Metrics ─────────────────────────────────────────────────────────────

/**
 * DORA operational KPIs for ARI system health (Section 29.10).
 *
 * Tracked metrics:
 *   briefing_sla        — Morning briefing delivered before 06:30 ET (target ≥95%)
 *   approval_bypass     — Jobs approved without Pryce (target 0.00%)
 *   change_failure_rate — Failed deploys / total deploys (target <5%)
 *   mttr_p0             — Mean time to restore P0 incidents in minutes (target <30)
 *   agent_error_rate    — Agent errors / total calls per agent (target <2%)
 *   context_saturation  — Avg context_tokens / context_budget (target <70%)
 *
 * DEX reports DORA weekly in #research-digest alongside AI research findings.
 */
export interface DoraMetricRecord {
  id: string;
  metric: string;
  value: number;
  period: string; // ISO date or 'YYYY-WW' for weekly
  agent?: string;
  measured_at: string;
  created_at?: string;
}

export interface SaveDoraMetricInput {
  metric: string;
  value: number;
  period: string;
  agent?: string;
}

/** Record a DORA metric measurement. */
export function saveDoraMetric(entry: SaveDoraMetricInput): { id: string } {
  const db = getDb();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  db.prepare(`
    INSERT INTO ari_dora_metrics (id, metric, value, period, agent, measured_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.metric,
    entry.value,
    entry.period,
    entry.agent ?? null,
    new Date().toISOString(),
  );
  return { id };
}

/** Query DORA metrics with optional filters. */
export function queryDoraMetrics(opts: {
  metric?: string;
  agent?: string;
  limit?: number;
}): DoraMetricRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.metric) {
    conditions.push("metric = ?");
    params.push(opts.metric);
  }
  if (opts.agent) {
    conditions.push("agent = ?");
    params.push(opts.agent);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit ?? 100);

  return db
    .prepare(`SELECT * FROM ari_dora_metrics ${where} ORDER BY measured_at DESC LIMIT ?`)
    .all(...params) as DoraMetricRecord[];
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/** Stats for health monitoring */
export function getMemoryStats(): { memories: number; bookmarks: number; indexedTerms: number } {
  const db = getDb();
  const { memories } = db.prepare("SELECT COUNT(*) as memories FROM memories").get() as {
    memories: number;
  };
  const { bookmarks } = db.prepare("SELECT COUNT(*) as bookmarks FROM bookmarks").get() as {
    bookmarks: number;
  };
  const { indexedTerms } = db
    .prepare("SELECT COUNT(DISTINCT term) as indexedTerms FROM knowledge_index")
    .get() as { indexedTerms: number };
  return { memories, bookmarks, indexedTerms };
}

// ─── P1 Feedback ──────────────────────────────────────────────────────────────

export interface P1FeedbackRecord {
  job_id: string;
  approved: boolean;
  approval_note?: string;
  views_7d?: number;
  retention_pct?: number;
  timestamp: string;
}

export function saveP1Feedback(entry: Omit<P1FeedbackRecord, "timestamp">): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO p1_feedback
      (job_id, approved, approval_note, views_7d, retention_pct, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.job_id,
    entry.approved ? 1 : 0,
    entry.approval_note ?? null,
    entry.views_7d ?? null,
    entry.retention_pct ?? null,
    new Date().toISOString(),
  );
}

export function getP1FeedbackStats(): {
  totalApproved: number;
  totalRejected: number;
  avgRetention: number | null;
} {
  const db = getDb();
  const { totalApproved } = db
    .prepare("SELECT COUNT(*) as totalApproved FROM p1_feedback WHERE approved = 1")
    .get() as { totalApproved: number };
  const { totalRejected } = db
    .prepare("SELECT COUNT(*) as totalRejected FROM p1_feedback WHERE approved = 0")
    .get() as { totalRejected: number };
  const { avgRetention } = db
    .prepare(
      "SELECT AVG(retention_pct) as avgRetention FROM p1_feedback WHERE retention_pct IS NOT NULL",
    )
    .get() as { avgRetention: number | null };
  return { totalApproved, totalRejected, avgRetention };
}

// ─── P2 Feedback ──────────────────────────────────────────────────────────────

export interface P2FeedbackRecord {
  lead_id: string;
  outcome: "won" | "meeting_booked" | "lost" | "no_response";
  outcome_note?: string;
  vertical?: string;
  score_at_send?: number;
  timestamp: string;
}

export function saveP2Feedback(entry: Omit<P2FeedbackRecord, "timestamp">): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO p2_feedback
      (lead_id, outcome, outcome_note, vertical, score_at_send, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    entry.lead_id,
    entry.outcome,
    entry.outcome_note ?? null,
    entry.vertical ?? null,
    entry.score_at_send ?? null,
    new Date().toISOString(),
  );
}

export function getP2FeedbackByVertical(): Array<{
  vertical: string;
  won: number;
  total: number;
  conversionRate: number;
}> {
  const db = getDb();
  const rows = db
    .prepare(`
    SELECT vertical,
           SUM(CASE WHEN outcome IN ('won','meeting_booked') THEN 1 ELSE 0 END) as won,
           COUNT(*) as total
    FROM p2_feedback
    WHERE vertical IS NOT NULL
    GROUP BY vertical
    ORDER BY total DESC
  `)
    .all() as Array<{ vertical: string; won: number; total: number }>;
  return rows.map((r) => ({ ...r, conversionRate: r.total > 0 ? r.won / r.total : 0 }));
}

// ─── Prompt Versions ──────────────────────────────────────────────────────────

export interface PromptVersionRecord {
  id: string;
  pipeline: "p1" | "p2";
  version: number;
  prompt: string;
  rationale?: string;
  effective_date: string;
  created_at: string;
}

export function savePromptVersion(entry: Omit<PromptVersionRecord, "id" | "created_at">): {
  id: string;
} {
  const db = getDb();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  db.prepare(`
    INSERT INTO prompt_versions (id, pipeline, version, prompt, rationale, effective_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.pipeline,
    entry.version,
    entry.prompt,
    entry.rationale ?? null,
    entry.effective_date,
    new Date().toISOString(),
  );
  return { id };
}

export function getLatestPromptVersion(pipeline: "p1" | "p2"): PromptVersionRecord | null {
  const db = getDb();
  return db
    .prepare("SELECT * FROM prompt_versions WHERE pipeline = ? ORDER BY version DESC LIMIT 1")
    .get(pipeline) as PromptVersionRecord | null;
}

// ─── Research Items ───────────────────────────────────────────────────────────

export interface ResearchItemRecord {
  id: string;
  source: string;
  title: string;
  summary: string;
  relevance?: string;
  adopted: boolean;
  created_at: string;
}

type ResearchItemRow = Omit<ResearchItemRecord, "adopted"> & { adopted: number };

export function saveResearchItem(entry: Omit<ResearchItemRecord, "id" | "created_at">): {
  id: string;
} {
  const db = getDb();
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  db.prepare(`
    INSERT INTO research_items (id, source, title, summary, relevance, adopted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.source,
    entry.title,
    entry.summary,
    entry.relevance ?? null,
    entry.adopted ? 1 : 0,
    new Date().toISOString(),
  );
  return { id };
}

export function queryResearchItems(opts: {
  adopted?: boolean;
  limit?: number;
}): ResearchItemRecord[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.adopted !== undefined) {
    conditions.push("adopted = ?");
    params.push(opts.adopted ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit ?? 50);

  const rows = db
    .prepare(`SELECT * FROM research_items ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params) as ResearchItemRow[];

  return rows.map((r) => ({ ...r, adopted: r.adopted === 1 }));
}

export function markResearchItemAdopted(id: string): void {
  const db = getDb();
  db.prepare("UPDATE research_items SET adopted = 1 WHERE id = ?").run(id);
}

// ─── Agent Registry ───────────────────────────────────────────────────────────

export interface AgentRegistryRecord {
  name: string;
  emoji: string;
  role: string;
  plane: "mission" | "build";
  model: string;
  status: "active" | "idle" | "error";
  last_seen?: string;
  spawn_count: number;
  created_at: string;
}

export function upsertAgentRegistry(
  entry: Omit<AgentRegistryRecord, "spawn_count" | "created_at">,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agent_registry (name, emoji, role, plane, model, status, last_seen, spawn_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(name) DO UPDATE SET
      status = excluded.status,
      last_seen = excluded.last_seen,
      spawn_count = spawn_count + 1
  `).run(
    entry.name,
    entry.emoji,
    entry.role,
    entry.plane,
    entry.model,
    entry.status,
    entry.last_seen ?? new Date().toISOString(),
    new Date().toISOString(),
  );
}

export function getAgentRegistry(): AgentRegistryRecord[] {
  const db = getDb();
  return db.prepare("SELECT * FROM agent_registry ORDER BY name").all() as AgentRegistryRecord[];
}
