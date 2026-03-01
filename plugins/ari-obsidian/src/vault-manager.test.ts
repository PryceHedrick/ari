import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

// Override vault root for tests
const TEST_VAULT = mkdtempSync(path.join(tmpdir(), "ari-obsidian-test-"));
process.env.ARI_OBSIDIAN_VAULT_PATH = TEST_VAULT;

import { assertVaultPath, writeVaultFile, readVaultFile } from "./vault-manager.js";

describe("vault-manager boundary guard", () => {
  it("assertVaultPath passes for valid vault-relative path", () => {
    const valid = path.join(TEST_VAULT, "00-Inbox", "note.md");
    expect(() => assertVaultPath(valid)).not.toThrow();
  });

  it("assertVaultPath throws for path traversal outside vault", () => {
    const evil = path.join(TEST_VAULT, "..", "etc", "passwd");
    expect(() => assertVaultPath(evil)).toThrow("Vault boundary violation");
  });

  it("assertVaultPath throws for absolute path outside vault", () => {
    expect(() => assertVaultPath("/etc/passwd")).toThrow("Vault boundary violation");
  });

  it("writeVaultFile creates file with content", () => {
    writeVaultFile("00-Inbox/test.md", "# Test");
    expect(readVaultFile("00-Inbox/test.md")).toBe("# Test");
  });

  it("writeVaultFile blocks path traversal", () => {
    expect(() => writeVaultFile("../evil.md", "content")).toThrow("Vault boundary violation");
  });
});
