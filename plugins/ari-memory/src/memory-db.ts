/**
 * ARI Memory Database — SQLite WAL provenance-tracked knowledge store.
 *
 * Schema:
 *   memories        — core knowledge records with content-hash dedup
 *   knowledge_index — TF-IDF inverted index (term → memory_id)
 *   bookmarks       — URL captures with summaries
 *
 * Section 19.1 PRAGMA config applied on every open.
 * Content-hash SHA-256 ensures no duplicate knowledge accumulates.
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

  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_domain ON memories(domain)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_agent  ON memories(agent)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_knowledge_term  ON knowledge_index(term)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_bookmarks_url   ON bookmarks(url)").run();
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

export interface MemoryRecord {
  id: string;
  content: string;
  content_hash: string;
  title?: string;
  source: string;
  domain?: string;
  tags?: string[];
  agent?: string;
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
       trust_level, confidence, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.content,
    content_hash,
    entry.title ?? null,
    entry.source,
    entry.domain ?? null,
    entry.tags ? JSON.stringify(entry.tags) : null,
    entry.agent ?? null,
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
