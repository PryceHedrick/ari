/**
 * ARI Obsidian Vault Index — SQLite WAL for incremental/full reindex.
 * DB: ~/.ari/databases/vault-index.db
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database, { type Database as DatabaseInstance } from "better-sqlite3";
import { getVaultRoot, fileHash, listVaultMarkdown } from "./vault-manager.js";

const ARI_DB_DIR = path.join(homedir(), ".ari", "databases");
export const VAULT_INDEX_DB_PATH = path.join(ARI_DB_DIR, "vault-index.db");

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
    CREATE TABLE IF NOT EXISTS notes (
      path TEXT PRIMARY KEY,
      title TEXT,
      frontmatter_json TEXT,
      content_hash TEXT,
      trace_id TEXT,
      note_type TEXT,
      last_indexed TEXT NOT NULL,
      created_at TEXT,
      modified_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS note_tags (
      note_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (note_path, tag)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS note_links (
      from_path TEXT NOT NULL,
      to_path TEXT NOT NULL,
      PRIMARY KEY (from_path, to_path)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      project TEXT,
      due_date TEXT,
      priority INTEGER DEFAULT 5,
      status TEXT DEFAULT 'open',
      source TEXT DEFAULT 'auto',
      source_trace_id TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback (
      trace_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      note TEXT,
      ts TEXT NOT NULL
    )
  `).run();

  db.prepare("CREATE INDEX IF NOT EXISTS idx_notes_note_type ON notes(note_type)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)").run();
}

let _db: DatabaseInstance | null = null;

export function getVaultDb(): DatabaseInstance {
  if (_db) {
    return _db;
  }
  if (!existsSync(ARI_DB_DIR)) {
    mkdirSync(ARI_DB_DIR, { recursive: true });
  }
  _db = new Database(VAULT_INDEX_DB_PATH);
  applyPragmas(_db);
  createSchema(_db);
  return _db;
}

/** Parse YAML frontmatter from markdown content. Returns {} if none. */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) {
    return {};
  }
  try {
    const lines = match[1].split("\n");
    const obj: Record<string, unknown> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx < 0) {
        continue;
      }
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (val.startsWith("[") && val.endsWith("]")) {
        obj[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        obj[key] = val;
      }
    }
    return obj;
  } catch {
    return {};
  }
}

/** Extract title from markdown (first # heading or frontmatter.title). */
function extractTitle(content: string, fm: Record<string, unknown>): string {
  if (typeof fm.title === "string") {
    return fm.title;
  }
  const headingMatch = /^#\s+(.+)$/m.exec(content);
  return headingMatch ? headingMatch[1].trim() : "";
}

/** Extract wikilinks [[target]] from content. */
function extractLinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

export type ReindexMode = "incremental" | "full";

export interface ReindexResult {
  mode: ReindexMode;
  processed: number;
  skipped: number;
  errors: number;
  totalNotes: number;
}

export function reindexVaultSync(mode: ReindexMode = "incremental"): ReindexResult {
  const db = getVaultDb();
  const vaultRoot = getVaultRoot();
  const allNotes = listVaultMarkdown("");
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const note of allNotes) {
    try {
      const fullPath = path.join(vaultRoot, note.relPath);
      const hash = fileHash(fullPath);

      if (mode === "incremental") {
        const existing = db
          .prepare("SELECT content_hash FROM notes WHERE path = ?")
          .get(note.relPath) as { content_hash: string } | undefined;
        if (existing && existing.content_hash === hash) {
          skipped++;
          continue;
        }
      }

      const content = readFileSync(fullPath, "utf8");
      const fm = parseFrontmatter(content);
      const title = extractTitle(content, fm);
      const links = extractLinks(content);
      const now = new Date().toISOString();
      const noteType = typeof fm.type === "string" ? fm.type : "note";
      const traceId = typeof fm.trace_id === "string" ? fm.trace_id : null;
      const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];

      db.prepare(`
        INSERT OR REPLACE INTO notes (path, title, frontmatter_json, content_hash, trace_id, note_type, last_indexed, created_at, modified_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        note.relPath,
        title,
        JSON.stringify(fm),
        hash,
        traceId,
        noteType,
        now,
        typeof fm.date === "string" ? fm.date : null,
        note.mtime.toISOString(),
      );

      // Tags
      db.prepare("DELETE FROM note_tags WHERE note_path = ?").run(note.relPath);
      for (const tag of tags) {
        db.prepare("INSERT OR IGNORE INTO note_tags (note_path, tag) VALUES (?, ?)").run(
          note.relPath,
          tag,
        );
      }

      // Links
      db.prepare("DELETE FROM note_links WHERE from_path = ?").run(note.relPath);
      for (const link of links) {
        db.prepare("INSERT OR IGNORE INTO note_links (from_path, to_path) VALUES (?, ?)").run(
          note.relPath,
          link,
        );
      }

      processed++;
    } catch {
      errors++;
    }
  }

  return { mode, processed, skipped, errors, totalNotes: allNotes.length };
}

export function searchVaultIndex(
  query: string,
  limit = 20,
): Array<{ path: string; title: string; note_type: string }> {
  const db = getVaultDb();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  // Simple LIKE-based search across title and frontmatter
  const rows = db
    .prepare(`
    SELECT path, title, note_type FROM notes
    WHERE ${terms.map(() => "(LOWER(title) LIKE ? OR LOWER(frontmatter_json) LIKE ?)").join(" AND ")}
    ORDER BY last_indexed DESC LIMIT ?
  `)
    .all(...terms.flatMap((t) => [`%${t}%`, `%${t}%`]), limit) as Array<{
    path: string;
    title: string;
    note_type: string;
  }>;

  return rows;
}

export function getVaultStats(): { noteCount: number; indexedCount: number; tagCount: number } {
  const db = getVaultDb();
  const { noteCount } = db.prepare("SELECT COUNT(*) as noteCount FROM notes").get() as {
    noteCount: number;
  };
  const { tagCount } = db
    .prepare("SELECT COUNT(DISTINCT tag) as tagCount FROM note_tags")
    .get() as { tagCount: number };
  return { noteCount, indexedCount: noteCount, tagCount };
}

export function getLastDigestDate(): string | null {
  const db = getVaultDb();
  const row = db
    .prepare(
      "SELECT last_indexed FROM notes WHERE note_type = 'daily' ORDER BY last_indexed DESC LIMIT 1",
    )
    .get() as { last_indexed: string } | undefined;
  return row?.last_indexed ?? null;
}

export function getOpenLoops(): Array<{ path: string; title: string; last_indexed: string }> {
  const db = getVaultDb();
  return db
    .prepare(`
    SELECT n.path, n.title, n.last_indexed
    FROM notes n
    JOIN note_tags nt ON n.path = nt.note_path
    WHERE nt.tag = 'open-loop'
    ORDER BY n.last_indexed ASC
  `)
    .all() as Array<{ path: string; title: string; last_indexed: string }>;
}
