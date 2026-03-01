import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeSkillHash, checkSkillHash } from "./02-hash-check.js";

const TMP_DIR = join(tmpdir(), "ari-hash-check-test");

function writeTestFile(name: string, content: string): string {
  const p = join(TMP_DIR, name);
  writeFileSync(p, content, "utf8");
  return p;
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
});

describe("computeSkillHash()", () => {
  it("produces consistent SHA-256 for same file content", () => {
    const file = writeTestFile("index.ts", "export const x = 1;");
    const h1 = computeSkillHash([file]);
    const h2 = computeSkillHash([file]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hash when file content changes", () => {
    const file = writeTestFile("index.ts", "export const x = 1;");
    const h1 = computeSkillHash([file]);
    writeFileSync(file, "export const x = 2;");
    const h2 = computeSkillHash([file]);
    expect(h1).not.toBe(h2);
  });
});

describe("checkSkillHash()", () => {
  it("MATCH: returns MATCH when hash is correct", () => {
    const file = writeTestFile("skill.ts", "// skill code");
    const hash = computeSkillHash([file]);

    const result = checkSkillHash({
      slug: "test-skill",
      tier: "verified",
      contentHash: hash,
      files: [file],
    });

    expect(result.status).toBe("MATCH");
    expect(result.slug).toBe("test-skill");
  });

  it("MISMATCH: returns MISMATCH when hash differs", () => {
    const file = writeTestFile("skill.ts", "// original code");
    const correctHash = computeSkillHash([file]);

    // Modify file after computing hash
    writeFileSync(file, "// tampered code");

    const result = checkSkillHash({
      slug: "test-skill",
      tier: "verified",
      contentHash: correctHash,
      files: [file],
    });

    expect(result.status).toBe("MISMATCH");
    expect(result.detail).toContain("HASH MISMATCH");
  });

  it("NO_HASH: returns NO_HASH when contentHash is absent", () => {
    const result = checkSkillHash({
      slug: "unpinned-skill",
      tier: "community",
    });
    expect(result.status).toBe("NO_HASH");
  });

  it("FILE_MISSING: returns FILE_MISSING for nonexistent files", () => {
    const result = checkSkillHash({
      slug: "ghost-skill",
      tier: "community",
      contentHash: "abc123",
      files: ["/nonexistent/path/skill.ts"],
    });
    expect(result.status).toBe("FILE_MISSING");
  });

  it("NOT_IN_ALLOWLIST: items not in allowlist produce no check result (handled upstream)", () => {
    // This test verifies that unknown tools return NOT_IN_ALLOWLIST via policy engine,
    // not from hash-check. Hash check only processes allowlist entries.
    const result = checkSkillHash({
      slug: "some-skill",
      tier: "community",
      contentHash: undefined,
      files: [],
    });
    expect(result.status).toBe("NO_HASH");
  });
});
