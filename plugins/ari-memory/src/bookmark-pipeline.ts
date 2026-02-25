/**
 * ARI Bookmark Pipeline — URL → hash → save to knowledge base.
 *
 * Flow:
 *   1. Receive URL + optional summary from agent or #inbox Discord channel
 *   2. Compute content hash from title + summary
 *   3. Save to bookmarks table (URL-unique dedup)
 *   4. Index summary in TF-IDF for searchability
 *
 * Note: Content fetching and summarization are handled by the calling agent
 * (NOVA for Pokemon content, DEX for research papers, ARI for general captures).
 * This pipeline only handles persistence and indexing.
 *
 * Source: adapted from src/autonomous/knowledge-sources.ts pattern
 */

import { createHash } from "node:crypto";
import { saveBookmark, getBookmarkByUrl, saveMemory } from "./memory-db.js";
import { indexMemory } from "./tfidf-search.js";

export interface BookmarkRequest {
  url: string;
  title?: string;
  summary?: string;
  tags?: string[];
  domain?: string;
  agent?: string;
}

export interface BookmarkResult {
  id: string;
  isDuplicate: boolean;
  url: string;
  title?: string;
  summary?: string;
  memoryId?: string;
}

/**
 * Save a URL to the knowledge base.
 * If a summary is provided, also stores it as a searchable memory record.
 */
export async function processBookmark(req: BookmarkRequest): Promise<BookmarkResult> {
  // Check for existing bookmark (URL-dedup)
  const existing = getBookmarkByUrl(req.url);
  if (existing) {
    return {
      id: existing.id,
      isDuplicate: true,
      url: existing.url,
      title: existing.title,
      summary: existing.summary,
    };
  }

  const content = [req.title ?? "", req.summary ?? req.url].filter(Boolean).join("\n");
  const content_hash = createHash("sha256").update(content).digest("hex");

  const { id } = saveBookmark({
    url: req.url,
    title: req.title,
    summary: req.summary ?? `Bookmarked: ${req.url}`,
    content_hash,
    tags: req.tags,
    domain: req.domain,
  });

  // If we have meaningful text, also create a searchable memory record
  let memoryId: string | undefined;
  if (req.summary && req.summary.length > 20) {
    const memContent = `[Bookmark] ${req.title ? req.title + "\n" : ""}${req.summary}\nURL: ${req.url}`;
    const { id: mId, isDuplicate } = saveMemory({
      content: memContent,
      title: req.title,
      source: "web",
      domain: req.domain,
      tags: req.tags,
      agent: req.agent,
      trust_level: "STANDARD",
      confidence: 0.7,
    });
    if (!isDuplicate) {
      indexMemory(mId, memContent);
    }
    memoryId = mId;
  }

  return {
    id,
    isDuplicate: false,
    url: req.url,
    title: req.title,
    summary: req.summary,
    memoryId,
  };
}
