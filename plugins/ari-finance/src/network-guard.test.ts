/**
 * Network guard tests — domain allowlist, denial + span emission.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock emitSpan before importing network-guard
vi.mock("../../ari-ops/src/tracer.js", () => ({
  emitSpan: vi.fn(),
}));

import { emitSpan } from "../../ari-ops/src/tracer.js";
import { assertNetworkDomain, resolveNewsProvider } from "./network-guard.js";

describe("network-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveNewsProvider", () => {
    it("returns 'none' when ARI_PROFILE=minimal", () => {
      const original = process.env["ARI_PROFILE"];
      process.env["ARI_PROFILE"] = "minimal";
      const provider = resolveNewsProvider();
      expect(provider).toBe("none");
      process.env["ARI_PROFILE"] = original;
    });

    it("returns 'jina' when JINA_API_KEY is set", () => {
      const original = process.env["JINA_API_KEY"];
      const originalProfile = process.env["ARI_PROFILE"];
      process.env["JINA_API_KEY"] = "test-key";
      delete process.env["ARI_PROFILE"];
      // Note: ARI_FINANCE_NEWS_PROVIDER env takes precedence
      const originalProvider = process.env["ARI_FINANCE_NEWS_PROVIDER"];
      delete process.env["ARI_FINANCE_NEWS_PROVIDER"];
      const provider = resolveNewsProvider();
      expect(provider).toBe("jina");
      process.env["JINA_API_KEY"] = original ?? "";
      process.env["ARI_PROFILE"] = originalProfile ?? "";
      if (originalProvider) {
        process.env["ARI_FINANCE_NEWS_PROVIDER"] = originalProvider;
      }
    });

    it("returns explicit provider from ARI_FINANCE_NEWS_PROVIDER", () => {
      const original = process.env["ARI_FINANCE_NEWS_PROVIDER"];
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "rss";
      const provider = resolveNewsProvider();
      expect(provider).toBe("rss");
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = original ?? "";
    });
  });

  describe("assertNetworkDomain", () => {
    it("allows yahoo finance RSS domain", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "rss";
      // Should not throw
      expect(() =>
        assertNetworkDomain("https://finance.yahoo.com/rss/topfinstories"),
      ).not.toThrow();
    });

    it("allows coindesk RSS domain", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "rss";
      expect(() => assertNetworkDomain("https://feeds.coindesk.com/category/news")).not.toThrow();
    });

    it("allows jina domain when provider=jina", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "jina";
      expect(() => assertNetworkDomain("https://s.jina.ai/search")).not.toThrow();
    });

    it("throws for undeclared domain and emits deny span", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "rss";
      expect(() => assertNetworkDomain("https://evil.example.com/data")).toThrow(
        /undeclared domain/i,
      );
      expect(emitSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          policyAction: "deny",
          policyRule: "undeclared_network_domain",
        }),
      );
    });

    it("throws for jina domain when provider=rss", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "rss";
      expect(() => assertNetworkDomain("https://s.jina.ai/anything")).toThrow(/undeclared domain/i);
    });

    it("throws for any domain when provider=none", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "none";
      expect(() => assertNetworkDomain("https://finance.yahoo.com/rss/")).toThrow(
        /undeclared domain/i,
      );
    });

    it("deny span contains domain in summary", () => {
      process.env["ARI_FINANCE_NEWS_PROVIDER"] = "rss";
      try {
        assertNetworkDomain("https://evil.example.com/path");
      } catch {
        // expected
      }
      expect(emitSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.stringContaining("evil.example.com"),
        }),
      );
    });
  });
});
