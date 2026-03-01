/**
 * ARI Finance News Provider — abstraction for none/rss/jina/manual.
 * All HTTP calls gated by assertNetworkDomain().
 */

import { assertNetworkDomain, resolveNewsProvider } from "./network-guard.js";

export const DISCLAIMER =
  "⚠️ Informational analysis only. Not financial advice. No automated trading.";

export interface NewsItem {
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt?: string;
}

export async function fetchNews(
  query: string,
): Promise<{ items: NewsItem[]; provider: string; disclaimer: string }> {
  const provider = resolveNewsProvider();

  if (provider === "none" || provider === "manual") {
    return { items: [], provider, disclaimer: DISCLAIMER };
  }

  if (provider === "rss") {
    return fetchRssNews(query);
  }

  if (provider === "jina") {
    return fetchJinaNews(query);
  }

  return { items: [], provider, disclaimer: DISCLAIMER };
}

async function fetchRssNews(
  query: string,
): Promise<{ items: NewsItem[]; provider: string; disclaimer: string }> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=5`;
  assertNetworkDomain(url);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { items: [], provider: "rss", disclaimer: DISCLAIMER };
    }
    const data = (await res.json()) as {
      news?: Array<{
        title: string;
        link: string;
        publisher: string;
        providerPublishTime?: number;
      }>;
    };

    const items: NewsItem[] = (data.news ?? []).slice(0, 5).map((n) => ({
      title: n.title,
      url: n.link,
      summary: n.title, // RSS doesn't provide full text
      source: n.publisher,
      publishedAt: n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toISOString()
        : undefined,
    }));

    return { items, provider: "rss", disclaimer: DISCLAIMER };
  } catch {
    return { items: [], provider: "rss", disclaimer: DISCLAIMER };
  }
}

async function fetchJinaNews(
  query: string,
): Promise<{ items: NewsItem[]; provider: string; disclaimer: string }> {
  const jinaKey = process.env.JINA_API_KEY;
  if (!jinaKey) {
    return { items: [], provider: "jina", disclaimer: DISCLAIMER };
  }

  const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
  assertNetworkDomain(url);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jinaKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { items: [], provider: "jina", disclaimer: DISCLAIMER };
    }
    const text = await res.text();
    return {
      items: [{ title: query, url, summary: text.slice(0, 500), source: "jina" }],
      provider: "jina",
      disclaimer: DISCLAIMER,
    };
  } catch {
    return { items: [], provider: "jina", disclaimer: DISCLAIMER };
  }
}
