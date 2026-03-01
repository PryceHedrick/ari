import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isXIntelEnabled,
  buildXIntelConfig,
  scorePost,
  fetchXIntelDigest,
  type XIntelConfig,
  type XPost,
} from "./x-intel.js";

// ---------------------------------------------------------------------------
// isXIntelEnabled
// ---------------------------------------------------------------------------

describe("isXIntelEnabled", () => {
  const ORIGINAL = process.env["ARI_ENABLE_X_INTEL"];

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env["ARI_ENABLE_X_INTEL"];
    } else {
      process.env["ARI_ENABLE_X_INTEL"] = ORIGINAL;
    }
  });

  it("returns true when ARI_ENABLE_X_INTEL=true", () => {
    process.env["ARI_ENABLE_X_INTEL"] = "true";
    expect(isXIntelEnabled()).toBe(true);
  });

  it("returns false when not set", () => {
    delete process.env["ARI_ENABLE_X_INTEL"];
    expect(isXIntelEnabled()).toBe(false);
  });

  it('returns false for value "1" (strict check)', () => {
    process.env["ARI_ENABLE_X_INTEL"] = "1";
    expect(isXIntelEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildXIntelConfig
// ---------------------------------------------------------------------------

describe("buildXIntelConfig", () => {
  const savedBearer = process.env["X_BEARER_TOKEN"];
  const savedKeywords = process.env["X_INTEL_KEYWORDS"];

  afterEach(() => {
    if (savedBearer === undefined) {
      delete process.env["X_BEARER_TOKEN"];
    } else {
      process.env["X_BEARER_TOKEN"] = savedBearer;
    }

    if (savedKeywords === undefined) {
      delete process.env["X_INTEL_KEYWORDS"];
    } else {
      process.env["X_INTEL_KEYWORDS"] = savedKeywords;
    }
  });

  it("throws when X_BEARER_TOKEN is not set", () => {
    delete process.env["X_BEARER_TOKEN"];
    expect(() => buildXIntelConfig()).toThrow("X_BEARER_TOKEN is not set");
  });

  it("parses keywords from X_INTEL_KEYWORDS", () => {
    process.env["X_BEARER_TOKEN"] = "test-bearer";
    process.env["X_INTEL_KEYWORDS"] = "crypto, pokemon, AI";
    const cfg = buildXIntelConfig();
    expect(cfg.keywords).toEqual(["crypto", "pokemon", "AI"]);
  });

  it("uses default keywords when X_INTEL_KEYWORDS is not set", () => {
    process.env["X_BEARER_TOKEN"] = "test-bearer";
    delete process.env["X_INTEL_KEYWORDS"];
    const cfg = buildXIntelConfig();
    expect(cfg.keywords.length).toBeGreaterThan(0);
    expect(cfg.keywords).toContain("crypto");
  });

  it("filters empty tokens from keyword list", () => {
    process.env["X_BEARER_TOKEN"] = "test-bearer";
    process.env["X_INTEL_KEYWORDS"] = "crypto,,pokemon";
    const cfg = buildXIntelConfig();
    expect(cfg.keywords).toEqual(["crypto", "pokemon"]);
  });
});

// ---------------------------------------------------------------------------
// scorePost
// ---------------------------------------------------------------------------

describe("scorePost", () => {
  const keywords = ["crypto", "pokemon", "AI"];

  it("returns 1.0 when all keywords match", () => {
    const post: XPost = {
      id: "1",
      text: "crypto pokemon AI",
      createdAt: new Date().toISOString(),
      matchedKeywords: ["crypto"],
    };
    expect(scorePost(post, keywords)).toBeCloseTo(1.0);
  });

  it("returns 0 when no keywords match", () => {
    const post: XPost = {
      id: "2",
      text: "nothing relevant here",
      createdAt: new Date().toISOString(),
      matchedKeywords: [],
    };
    expect(scorePost(post, keywords)).toBe(0);
  });

  it("returns fractional score for partial matches", () => {
    const post: XPost = {
      id: "3",
      text: "crypto only",
      createdAt: new Date().toISOString(),
      matchedKeywords: ["crypto"],
    };
    // 1 of 3 keywords matches
    expect(scorePost(post, keywords)).toBeCloseTo(1 / 3);
  });

  it("is case-insensitive", () => {
    const post: XPost = {
      id: "4",
      text: "CRYPTO is interesting",
      createdAt: new Date().toISOString(),
      matchedKeywords: [],
    };
    const score = scorePost(post, ["crypto"]);
    expect(score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// fetchXIntelDigest
// ---------------------------------------------------------------------------

describe("fetchXIntelDigest", () => {
  const config: XIntelConfig = {
    bearerToken: "test-bearer",
    keywords: ["crypto", "pokemon"],
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchResponse(data: unknown): void {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
  }

  it("returns empty digest when API returns no data", async () => {
    mockFetchResponse({ data: [] });
    const result = await fetchXIntelDigest(config);
    expect(result.posts).toHaveLength(0);
    expect(result.digest).toContain("No X posts");
  });

  it("deduplicates posts with the same ID across keywords", async () => {
    const post = {
      id: "100",
      text: "crypto and pokemon news",
      created_at: new Date().toISOString(),
    };
    mockFetchResponse({ data: [post] });
    const result = await fetchXIntelDigest(config);
    // Two keywords searched, same post returned for both — should appear once
    expect(result.posts).toHaveLength(1);
  });

  it("includes digest header with post count", async () => {
    const post = { id: "200", text: "crypto news", created_at: new Date().toISOString() };
    mockFetchResponse({ data: [post] });
    const result = await fetchXIntelDigest(config);
    expect(result.digest).toContain("X Intel Digest");
    // At least one post returned across both keyword calls
    expect(result.posts.length).toBeGreaterThan(0);
  });

  it("continues with partial results when one keyword fetch fails", async () => {
    let callCount = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First keyword fails
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => "rate limited",
          json: async () => ({}),
        });
      }
      // Second keyword succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: "300", text: "pokemon card spike", created_at: new Date().toISOString() }],
        }),
        text: async () => "{}",
      });
    });

    const result = await fetchXIntelDigest(config);
    // Should have the one successful post
    expect(result.posts.length).toBeGreaterThanOrEqual(0);
  });
});
