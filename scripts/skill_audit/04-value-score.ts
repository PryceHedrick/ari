/**
 * Skill Value Scorer — 04-value-score.ts
 *
 * Scoring formula:
 *   benefit  = dailyUtility(0-10) × automationLeverage(0-10) / 10
 *   risk     = from 03-risk-score output (0-10)
 *   effort   = (integrationComplexity + configComplexity) / 2
 *   score    = (benefit×0.4) + ((10-risk)×0.3) + ((10-effort)×0.2) + (confidence×0.1)
 *
 * Output: data/skill_roadmap.json with Now/Next/Later/Skip buckets
 * Usage: node --import tsx scripts/skill_audit/04-value-score.ts
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

type SkillAssessment = {
  slug: string;
  dailyUtility: number; // 0-10
  automationLeverage: number; // 0-10
  integrationComplexity: number; // 0-10
  configComplexity: number; // 0-10
  confidence: number; // 0-10
  riskScore?: number; // from 03-risk-score.json
  firstPartyAlternative?: string;
};

type RoadmapBucket = "Now" | "Next" | "Later" | "Skip";

type ScoredSkill = SkillAssessment & {
  valueScore: number;
  bucket: RoadmapBucket;
};

export function computeValueScore(assessment: SkillAssessment): number {
  const benefit = (assessment.dailyUtility * assessment.automationLeverage) / 10;
  const risk = assessment.riskScore ?? 0;
  const effort = (assessment.integrationComplexity + assessment.configComplexity) / 2;
  return benefit * 0.4 + (10 - risk) * 0.3 + (10 - effort) * 0.2 + assessment.confidence * 0.1;
}

function assignBucket(score: number): RoadmapBucket {
  if (score >= 7) {
    return "Now";
  }
  if (score >= 5) {
    return "Next";
  }
  if (score >= 3) {
    return "Later";
  }
  return "Skip";
}

// Sample assessments (no marketplace skills currently; these are hypothetical examples)
const SAMPLE_ASSESSMENTS: SkillAssessment[] = [
  {
    slug: "example-web-scraper",
    dailyUtility: 6,
    automationLeverage: 7,
    integrationComplexity: 5,
    configComplexity: 3,
    confidence: 7,
    riskScore: 4,
    firstPartyAlternative: "DEX via Perplexity (already available)",
  },
  {
    slug: "example-calendar-sync",
    dailyUtility: 5,
    automationLeverage: 5,
    integrationComplexity: 7,
    configComplexity: 6,
    confidence: 5,
    riskScore: 2,
  },
];

function main(): void {
  // Load risk report if available
  const riskReportPath = "data/clawshub_risk_report.json";
  const riskMap = new Map<string, number>();
  if (existsSync(riskReportPath)) {
    try {
      const riskReport = JSON.parse(readFileSync(riskReportPath, "utf8")) as {
        results?: Array<{ slug: string; riskScore: number }>;
      };
      for (const r of riskReport.results ?? []) {
        riskMap.set(r.slug, r.riskScore);
      }
    } catch {
      // Non-fatal — proceed without risk data
    }
  }

  const scored: ScoredSkill[] = SAMPLE_ASSESSMENTS.map((a) => {
    const riskScore = riskMap.get(a.slug) ?? a.riskScore ?? 0;
    const score = computeValueScore({ ...a, riskScore });
    return {
      ...a,
      riskScore,
      valueScore: Math.round(score * 10) / 10,
      bucket: assignBucket(score),
    };
  });

  scored.sort((a, b) => b.valueScore - a.valueScore);

  const roadmap = {
    timestamp: new Date().toISOString(),
    note: "No marketplace skills currently installed. Roadmap based on sample assessments.",
    buckets: {
      Now: scored.filter((s) => s.bucket === "Now"),
      Next: scored.filter((s) => s.bucket === "Next"),
      Later: scored.filter((s) => s.bucket === "Later"),
      Skip: scored.filter((s) => s.bucket === "Skip"),
    },
    allSkills: scored,
  };

  writeFileSync("data/skill_roadmap.json", JSON.stringify(roadmap, null, 2));
  console.log(JSON.stringify(roadmap, null, 2));
  console.log("\nRoadmap written to data/skill_roadmap.json");
}

main();
