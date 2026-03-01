/**
 * Skill Hash Check — 02-hash-check.ts
 *
 * For each entry in config/skills/allowlist.yaml:
 *   - Computes SHA-256 of listed files
 *   - Compares against stored contentHash
 *   - Reports: MATCH / MISMATCH / NOT_IN_ALLOWLIST
 *
 * Usage: node --import tsx scripts/skill_audit/02-hash-check.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";

type SkillEntry = {
  slug: string;
  tier: string;
  tools?: string[];
  contentHash?: string;
  files?: string[];
  publisher?: string;
};

type AllowlistFile = {
  version: number;
  skills: SkillEntry[];
};

export type HashCheckResult = {
  slug: string;
  status: "MATCH" | "MISMATCH" | "NO_HASH" | "FILE_MISSING";
  stored?: string;
  computed?: string;
  detail: string;
};

export function computeSkillHash(files: string[]): string {
  const hash = createHash("sha256");
  for (const file of files.toSorted()) {
    if (!existsSync(file)) {
      hash.update(`MISSING:${file}`);
      continue;
    }
    hash.update(`FILE:${file}:`);
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

export function checkSkillHash(skill: SkillEntry): HashCheckResult {
  if (!skill.contentHash) {
    return {
      slug: skill.slug,
      status: "NO_HASH",
      detail: "No contentHash in allowlist — hash pinning not configured",
    };
  }

  const filesToHash = skill.files ?? [];
  if (filesToHash.length === 0) {
    return {
      slug: skill.slug,
      status: "NO_HASH",
      detail: "No files listed in allowlist entry for hashing",
    };
  }

  const missingFiles = filesToHash.filter((f) => !existsSync(f));
  if (missingFiles.length > 0) {
    return {
      slug: skill.slug,
      status: "FILE_MISSING",
      detail: `Files not found: ${missingFiles.join(", ")}`,
    };
  }

  const computed = computeSkillHash(filesToHash);
  if (computed === skill.contentHash) {
    return {
      slug: skill.slug,
      status: "MATCH",
      stored: skill.contentHash,
      computed,
      detail: "Hash verified",
    };
  }

  return {
    slug: skill.slug,
    status: "MISMATCH",
    stored: skill.contentHash,
    computed,
    detail: "HASH MISMATCH — skill files may have been tampered with",
  };
}

function main(): void {
  const allowlistPath = "config/skills/allowlist.yaml";
  if (!existsSync(allowlistPath)) {
    console.error(`Allowlist not found: ${allowlistPath}`);
    process.exit(1);
  }

  const allowlist = parseYaml(readFileSync(allowlistPath, "utf8")) as AllowlistFile;
  const skills = allowlist.skills ?? [];

  if (skills.length === 0) {
    console.log("No skills in allowlist. Nothing to check.");
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), results: [], allOk: true }));
    return;
  }

  const results = skills.map(checkSkillHash);
  const allOk = results.every((r) => r.status === "MATCH" || r.status === "NO_HASH");

  const report = { timestamp: new Date().toISOString(), results, allOk };
  console.log(JSON.stringify(report, null, 2));

  if (!allOk) {
    const mismatches = results.filter((r) => r.status === "MISMATCH");
    console.error(`\nFAIL: ${mismatches.length} hash mismatch(es) detected.`);
    process.exit(1);
  }
}

main();
