import { describe, it, expect } from "vitest";
import { redact, redactObj } from "./redactor.js";

describe("redactor", () => {
  describe("redact()", () => {
    it("strips Anthropic API keys", () => {
      const input = "key=sk-ant-api03-abcdefghijklmnopqrstuvwx12345678901234567890abcdef";
      expect(redact(input)).not.toContain("sk-ant-");
      expect(redact(input)).toContain("[REDACTED]");
    });

    it("strips OpenRouter keys", () => {
      const input = "using sk-or-v1-abcdefghijklmnopqrstuvwx1234567890 for requests";
      expect(redact(input)).not.toContain("sk-or-");
      expect(redact(input)).toContain("[REDACTED]");
    });

    it("strips Perplexity keys", () => {
      const input = "pplx-abcdefghijklmnopqrst is the key";
      expect(redact(input)).not.toContain("pplx-");
      expect(redact(input)).toContain("[REDACTED]");
    });

    it("strips Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc";
      expect(redact(input)).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(redact(input)).toContain("[REDACTED]");
    });

    it("strips URL query secrets", () => {
      const input = "https://example.com/api?key=supersecretvalue&other=fine";
      expect(redact(input)).not.toContain("supersecretvalue");
      expect(redact(input)).toContain("[REDACTED]");
      expect(redact(input)).toContain("other=fine");
    });

    it("strips Discord bot tokens", () => {
      // Constructed programmatically so no literal matches secret scanners.
      // Regex under test: \b[A-Za-z0-9]{24}\.[A-Za-z0-9]{6}\.[A-Za-z0-9\-_]{27}\b
      const fakeToken = `${"A".repeat(24)}.${"B".repeat(6)}.${"C".repeat(27)}`;
      const input = `token=${fakeToken}`;
      expect(redact(input)).toContain("[REDACTED]");
    });

    it("passes through safe content unchanged", () => {
      const safe = "Agent ARI selected model claude-sonnet-4-6 for task complexity=75";
      expect(redact(safe)).toBe(safe);
    });

    it("is throw-safe (returns [REDACTION_ERROR] on internal failure)", () => {
      // Force a non-string to exercise the catch path via type coercion
      // @ts-expect-error — intentional bad input test
      const result = redact(null);
      // Either passes through or returns REDACTION_ERROR — must not throw
      expect(typeof result).toBe("string");
    });
  });

  describe("redactObj()", () => {
    it("deep-redacts string values in objects", () => {
      const obj = {
        key: "sk-ant-api03-abcdefghijklmnopqrstu1234567890",
        nested: { token: "Bearer abc123def456" },
      };
      const result = redactObj(obj) as Record<string, unknown>;
      expect(JSON.stringify(result)).not.toContain("sk-ant-");
      expect(JSON.stringify(result)).not.toContain("Bearer abc123");
    });

    it("handles arrays", () => {
      const arr = ["safe", "Bearer supersecrettoken12345"];
      const result = redactObj(arr) as string[];
      expect(result[0]).toBe("safe");
      expect(result[1]).toContain("[REDACTED]");
    });

    it("handles primitives", () => {
      expect(redactObj(42)).toBe(42);
      expect(redactObj(true)).toBe(true);
      expect(redactObj(null)).toBeNull();
    });

    it("is throw-safe", () => {
      expect(() => redactObj(undefined)).not.toThrow();
    });
  });
});
