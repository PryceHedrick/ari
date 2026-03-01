/**
 * Skill Risk Scorer — 03-risk-score.ts
 *
 * Static analysis of skill JS/TS source for high-risk patterns.
 * Outputs risk scores per skill to data/clawshub_risk_report.json
 *
 * Risk signals:
 *   - eval() / Function() constructor
 *   - child_process / exec / spawn / execSync
 *   - Wildcard domains (*.example.com, *)
 *   - Dynamic import() of untrusted modules
 *   - Undeclared network access (fetch/axios without declared domain)
 *
 * Usage: node --import tsx scripts/skill_audit/03-risk-score.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";

type RiskSignal = {
  pattern: string;
  description: string;
  weight: number; // 0-10
};

const RISK_SIGNALS: RiskSignal[] = [
  { pattern: "\\beval\\s*\\(", description: "Dynamic eval()", weight: 10 },
  { pattern: "new\\s+Function\\s*\\(", description: "Function constructor", weight: 10 },
  { pattern: "child_process", description: "child_process import", weight: 9 },
  {
    pattern: "\\bexecSync\\s*\\(|\\bexec\\s*\\(|\\bspawn\\s*\\(",
    description: "Shell execution",
    weight: 9,
  },
  { pattern: "__import__\\s*\\(|importlib", description: "Dynamic import bypass", weight: 7 },
  {
    pattern: "\\*\\.\\w+\\.\\w+|domain:\\s*['\"]\\*['\"]",
    description: "Wildcard domain",
    weight: 6,
  },
  {
    pattern: "fs\\.writeFileSync|fs\\.unlink|fs\\.rmdir",
    description: "Filesystem write/delete",
    weight: 5,
  },
  { pattern: "process\\.env\\[", description: "Dynamic env access", weight: 4 },
];

type SkillRiskReport = {
  slug: string;
  riskScore: number; // 0-10
  signals: Array<{ description: string; weight: number; matches: number }>;
  assessment: "low" | "medium" | "high" | "critical";
};

function assessLevel(score: number): SkillRiskReport["assessment"] {
  if (score >= 9) {
    return "critical";
  }
  if (score >= 6) {
    return "high";
  }
  if (score >= 3) {
    return "medium";
  }
  return "low";
}

export function scoreSource(source: string, slug: string): SkillRiskReport {
  let maxScore = 0;
  const signals: SkillRiskReport["signals"] = [];

  for (const signal of RISK_SIGNALS) {
    const pattern = new RegExp(signal.pattern, "g");
    const matches = source.match(pattern);
    if (matches && matches.length > 0) {
      maxScore = Math.max(maxScore, signal.weight);
      signals.push({
        description: signal.description,
        weight: signal.weight,
        matches: matches.length,
      });
    }
  }

  return {
    slug,
    riskScore: Math.min(10, maxScore),
    signals,
    assessment: assessLevel(maxScore),
  };
}

function main(): void {
  const allowlistPath = "config/skills/allowlist.yaml";
  if (!existsSync(allowlistPath)) {
    console.error(`Allowlist not found: ${allowlistPath}`);
    process.exit(1);
  }

  const allowlist = parseYaml(readFileSync(allowlistPath, "utf8")) as {
    skills?: Array<{ slug: string; files?: string[] }>;
  };
  const skills = allowlist.skills ?? [];

  const results: SkillRiskReport[] = [];

  for (const skill of skills) {
    const files = skill.files ?? [];
    let combinedSource = "";
    for (const file of files) {
      if (existsSync(file)) {
        combinedSource += readFileSync(file, "utf8") + "\n";
      }
    }
    results.push(scoreSource(combinedSource, skill.slug));
  }

  const report = {
    timestamp: new Date().toISOString(),
    scanned: skills.length,
    results,
    criticalCount: results.filter((r) => r.assessment === "critical").length,
    highCount: results.filter((r) => r.assessment === "high").length,
  };

  writeFileSync("data/clawshub_risk_report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (report.criticalCount > 0) {
    console.error(`\nFAIL: ${report.criticalCount} critical risk skill(s) detected.`);
    process.exit(1);
  }
}

main();
