/**
 * ARI TF-IDF Search — Pure TypeScript inverted index over the memory database.
 *
 * Ported and simplified from src/autonomous/knowledge-index.ts.
 * No external dependencies — pure math.
 *
 * Algorithm: TF-IDF with smooth IDF (no division-by-zero, handles new terms).
 *   TF  = term_count / total_terms
 *   IDF = log((N + 1) / (df + 1)) + 1   (smooth variant)
 *   score = TF × IDF
 *
 * Results are aggregated per memory document and ranked by total score.
 */

import { getDb } from "./memory-db.js";
import type { MemoryRecord } from "./memory-db.js";

// Common English stop words — excluded from index to reduce noise
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "i",
  "we",
  "you",
  "they",
  "he",
  "she",
  "not",
  "no",
  "if",
  "then",
  "so",
  "up",
  "out",
  "all",
  "what",
  "how",
  "when",
  "where",
  "who",
  "which",
  "about",
  "into",
  "than",
]);

/** Normalize text into searchable tokens */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t) && /^[a-z]/.test(t));
}

function computeTF(terms: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of terms) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const total = Math.max(terms.length, 1);
  const tf = new Map<string, number>();
  for (const [term, count] of freq) {
    tf.set(term, count / total);
  }
  return tf;
}

/**
 * Index a memory document — compute TF-IDF scores and write to knowledge_index.
 * Called after every new memory is saved (non-duplicate).
 */
export function indexMemory(memoryId: string, content: string): void {
  const db = getDb();
  const terms = tokenize(content);
  if (terms.length === 0) {
    return;
  }

  const tf = computeTF(terms);

  const { count } = db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number };
  const totalDocs = Math.max(count, 1);

  const getDocFreq = db.prepare(
    "SELECT COUNT(DISTINCT memory_id) as df FROM knowledge_index WHERE term = ?",
  );

  const upsertTerm = db.prepare(`
    INSERT INTO knowledge_index (term, memory_id, tf_idf_score)
    VALUES (?, ?, ?)
    ON CONFLICT(term, memory_id) DO UPDATE SET tf_idf_score = excluded.tf_idf_score
  `);

  const indexTerms = db.transaction(() => {
    for (const [term, tfScore] of tf) {
      const { df } = getDocFreq.get(term) as { df: number };
      const idf = Math.log((totalDocs + 1) / (df + 1)) + 1; // smooth IDF
      upsertTerm.run(term, memoryId, tfScore * idf);
    }
  });

  indexTerms();
}

/** Remove all index entries for a memory (called before deletion) */
export function removeFromIndex(memoryId: string): void {
  getDb().prepare("DELETE FROM knowledge_index WHERE memory_id = ?").run(memoryId);
}

export interface MemorySearchResult extends MemoryRecord {
  searchScore: number;
  matchedTerms: string[];
}

/**
 * Search memories using TF-IDF scoring.
 * Aggregates term scores per document, ranks descending, returns top N.
 */
export function searchMemories(query: string, limit = 10): MemorySearchResult[] {
  const db = getDb();
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return [];
  }

  // Accumulate TF-IDF scores per document
  const scores = new Map<string, { score: number; terms: string[] }>();

  for (const term of queryTerms) {
    const rows = db
      .prepare("SELECT memory_id, tf_idf_score FROM knowledge_index WHERE term = ?")
      .all(term) as Array<{ memory_id: string; tf_idf_score: number }>;

    for (const { memory_id, tf_idf_score } of rows) {
      const prev = scores.get(memory_id) ?? { score: 0, terms: [] };
      scores.set(memory_id, {
        score: prev.score + tf_idf_score,
        terms: [...prev.terms, term],
      });
    }
  }

  if (scores.size === 0) {
    return [];
  }

  const ranked = [...scores.entries()].toSorted((a, b) => b[1].score - a[1].score).slice(0, limit);

  const now = new Date().toISOString();
  const results: MemorySearchResult[] = [];

  for (const [memoryId, { score, terms }] of ranked) {
    const row = db
      .prepare("SELECT * FROM memories WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)")
      .get(memoryId, now) as (MemoryRecord & { tags: string | null }) | undefined;

    if (row) {
      results.push({
        ...row,
        tags: row.tags ? (JSON.parse(row.tags as unknown as string) as string[]) : undefined,
        searchScore: score,
        matchedTerms: terms,
      });
    }
  }

  return results;
}

/** Get index statistics */
export function getIndexStats(): { totalTerms: number; avgTermsPerDoc: number } {
  const db = getDb();
  const { totalTerms } = db
    .prepare("SELECT COUNT(DISTINCT term) as totalTerms FROM knowledge_index")
    .get() as { totalTerms: number };
  const { docCount } = db
    .prepare("SELECT COUNT(DISTINCT memory_id) as docCount FROM knowledge_index")
    .get() as { docCount: number };
  const avgTermsPerDoc = docCount > 0 ? Math.round(totalTerms / docCount) : 0;
  return { totalTerms, avgTermsPerDoc };
}
