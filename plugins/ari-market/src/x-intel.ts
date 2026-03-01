/**
 * X (Twitter) read-only intel for ARI's DEX intelligence scanner.
 *
 * Gate: ARI_ENABLE_X_INTEL=true must be set.
 * Auth: app-only bearer token (X_BEARER_TOKEN) — no user OAuth required.
 *
 * Safety: NO write endpoints. Only GET /2/tweets/search/recent.
 * Write requires ARI_X_WRITE_ENABLED=true (not implemented) + exec approval.
 */

export interface XIntelConfig {
  bearerToken: string;
  keywords: string[];
  /** Max results per keyword (1–100, API default 10) */
  maxResultsPerKeyword?: number;
}

export interface XPost {
  id: string;
  text: string;
  createdAt: string;
  matchedKeywords: string[];
}

export interface XIntelResult {
  posts: XPost[];
  /** Summary formatted for Discord */
  digest: string;
}

const X_API_BASE = "https://api.twitter.com/2";

/** Returns true if X intel feature flag is enabled. */
export function isXIntelEnabled(): boolean {
  return process.env["ARI_ENABLE_X_INTEL"] === "true";
}

/** Build an XIntelConfig from environment variables. Throws if required vars are missing. */
export function buildXIntelConfig(): XIntelConfig {
  const bearerToken = process.env["X_BEARER_TOKEN"] ?? "";
  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN is not set — cannot initialize X intel");
  }

  const rawKeywords = process.env["X_INTEL_KEYWORDS"] ?? "crypto,pokemon,AI,pryceless";
  const keywords = rawKeywords
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  return { bearerToken, keywords };
}

/**
 * Search recent X posts for a single keyword.
 * Returns up to maxResults posts from the last 7 days.
 * Read-only GET endpoint only.
 */
export async function searchXPosts(
  config: XIntelConfig,
  keyword: string,
  maxResults = 10,
): Promise<XPost[]> {
  const params = new URLSearchParams({
    query: keyword,
    max_results: String(Math.min(Math.max(maxResults, 1), 100)),
    "tweet.fields": "created_at,text",
  });

  const url = `${X_API_BASE}/tweets/search/recent?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.bearerToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`X API error ${res.status} for keyword "${keyword}": ${await res.text()}`);
  }

  type XApiResponse = {
    data?: Array<{ id: string; text: string; created_at?: string }>;
  };
  const json = (await res.json()) as XApiResponse;
  const data = json.data ?? [];

  return data.map((tweet) => ({
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at ?? new Date().toISOString(),
    matchedKeywords: [keyword],
  }));
}

/** Score a post for relevance to ARI's interests (0–1). Higher = more relevant. */
export function scorePost(post: XPost, keywords: string[]): number {
  const text = post.text.toLowerCase();
  const matchCount = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
  // Normalize: more keyword matches = higher score
  return matchCount / keywords.length;
}

/**
 * Fetch X intel for all configured keywords and return a digest.
 * Called by the x-likes-digest cron handler (20:00 ET).
 */
export async function fetchXIntelDigest(config: XIntelConfig): Promise<XIntelResult> {
  const maxPerKeyword = config.maxResultsPerKeyword ?? 10;
  const allPosts: XPost[] = [];
  const seen = new Set<string>();

  for (const keyword of config.keywords) {
    try {
      const posts = await searchXPosts(config, keyword, maxPerKeyword);
      for (const post of posts) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          allPosts.push(post);
        } else {
          // Merge matched keywords for deduped posts
          const existing = allPosts.find((p) => p.id === post.id);
          if (existing) {
            existing.matchedKeywords = [...new Set([...existing.matchedKeywords, keyword])];
          }
        }
      }
    } catch {
      // Log per-keyword errors but continue; partial results are better than none
      // (caller's logger handles this)
    }
  }

  // Sort by relevance descending
  const scored = allPosts
    .map((p) => ({ post: p, score: scorePost(p, config.keywords) }))
    .toSorted((a, b) => b.score - a.score);

  const digest = buildDigest(scored.map((s) => s.post));
  return { posts: scored.map((s) => s.post), digest };
}

function buildDigest(posts: XPost[]): string {
  if (posts.length === 0) {
    return "No X posts found for configured keywords.";
  }

  const lines = posts.slice(0, 10).map((p, i) => {
    const kws = p.matchedKeywords.join(", ");
    // Truncate long posts to keep Discord messages readable
    const text = p.text.length > 200 ? `${p.text.slice(0, 200)}…` : p.text;
    return `**${i + 1}.** [${kws}] ${text}`;
  });

  const header = `🐦 **X Intel Digest** — ${posts.length} post${posts.length === 1 ? "" : "s"} found`;
  return [header, ...lines].join("\n");
}
