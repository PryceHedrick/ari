/**
 * ARI Ops Doctor — health checks for providers, agents, skills, Discord, kill switch.
 *
 * Runs synchronously (no network calls) to avoid side effects.
 * Gateway HTTP probe is optional and only when explicitly requested.
 */

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { killSwitch } from "./kill-switch.js";

// Resolve better-sqlite3 from the plugin's own node_modules so the native
// binding matches the Node version used by the gateway (Node 22).
const _require = createRequire(
  path.join(fileURLToPath(import.meta.url), "..", "..", "package.json"),
);

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type DoctorReport = {
  timestamp: string;
  checks: CheckResult[];
  summary: { ok: number; warn: number; fail: number };
};

// ── Provider checks ───────────────────────────────────────────────────────────

const PROVIDER_CHECKS: Array<{ label: string; envKey: string; required: boolean }> = [
  { label: "ANTHROPIC_API_KEY", envKey: "ANTHROPIC_API_KEY", required: true },
  { label: "GEMINI_API_KEY", envKey: "GEMINI_API_KEY", required: false },
  { label: "XAI_API_KEY", envKey: "XAI_API_KEY", required: false },
  { label: "PERPLEXITY_API_KEY", envKey: "PERPLEXITY_API_KEY", required: false },
  { label: "OPENAI_API_KEY", envKey: "OPENAI_API_KEY", required: false },
];

function checkProviders(): CheckResult[] {
  return PROVIDER_CHECKS.map(({ label, envKey, required }) => {
    const present = !!process.env[envKey];
    return {
      name: `provider:${label}`,
      ok: present || !required,
      detail: present ? "present" : required ? "MISSING (required)" : "absent (optional)",
    };
  });
}

// ── Agent checks ──────────────────────────────────────────────────────────────

const AGENT_CHECKS: Array<{ name: string; requiredEnv: string[] }> = [
  { name: "ARI", requiredEnv: ["ANTHROPIC_API_KEY"] },
  { name: "NOVA", requiredEnv: ["ANTHROPIC_API_KEY"] },
  { name: "CHASE", requiredEnv: ["ANTHROPIC_API_KEY"] },
  { name: "PULSE", requiredEnv: ["GEMINI_API_KEY"] },
  { name: "DEX", requiredEnv: ["PERPLEXITY_API_KEY"] },
  { name: "RUNE", requiredEnv: [] },
];

function checkAgents(): CheckResult[] {
  return AGENT_CHECKS.map(({ name, requiredEnv }) => {
    const missing = requiredEnv.filter((e) => !process.env[e]);
    const ok = missing.length === 0;
    return {
      name: `agent:${name}`,
      ok,
      detail: ok ? "ready" : `missing env: ${missing.join(", ")}`,
    };
  });
}

// ── Allowlist check ───────────────────────────────────────────────────────────

function checkSkills(): CheckResult[] {
  const allowlistPath = "config/skills/allowlist.yaml";
  try {
    const raw = readFileSync(allowlistPath, "utf8");
    const parsed = parseYaml(raw) as { skills?: unknown[] };
    const count = parsed.skills?.length ?? 0;
    return [
      {
        name: "skills:allowlist",
        ok: true,
        detail: `${count} marketplace skills (policy: block-all by default)`,
      },
    ];
  } catch {
    return [
      {
        name: "skills:allowlist",
        ok: false,
        detail: `allowlist.yaml not found at ${allowlistPath}`,
      },
    ];
  }
}

// ── Kill switch check ─────────────────────────────────────────────────────────

function checkKillSwitch(): CheckResult[] {
  const state = killSwitch.state();
  return [
    {
      name: "kill_switch",
      ok: !state.all && !state.skills && !state.network,
      detail: `skills=${state.skills ? "ACTIVE" : "off"} network=${state.network ? "ACTIVE" : "off"} all=${state.all ? "ACTIVE" : "off"}`,
    },
  ];
}

// ── Config drift check ────────────────────────────────────────────────────────

function checkConfigFiles(): CheckResult[] {
  const required = [
    "config/models.yaml",
    "config/agents.yaml",
    "config/routing.yaml",
    "config/skills/tiers.yaml",
    "config/skills/allowlist.yaml",
  ];
  const results: CheckResult[] = [];
  for (const f of required) {
    results.push({
      name: `config:${path.basename(f)}`,
      ok: existsSync(f),
      detail: existsSync(f) ? "present" : "MISSING",
    });
  }
  return results;
}

// ── Memory DB check ───────────────────────────────────────────────────────────

function checkMemoryDb(): CheckResult[] {
  const dbPath = path.join(homedir(), ".ari", "databases", "memory.db");
  const exists = existsSync(dbPath);
  return [
    {
      name: "storage:memory.db",
      ok: exists,
      detail: exists ? "present" : "not yet initialized",
    },
  ];
}

// ── Obsidian checks ───────────────────────────────────────────────────────────

function checkObsidian(): CheckResult[] {
  const vaultPath =
    process.env.ARI_OBSIDIAN_VAULT_PATH ?? path.join(homedir(), ".ari", "obsidian-vault");
  const vaultExists = existsSync(vaultPath);
  const dbPath = path.join(homedir(), ".ari", "databases", "vault-index.db");
  const dbExists = existsSync(dbPath);

  const checks: CheckResult[] = [
    {
      name: "vault:path",
      ok: true,
      detail: vaultPath,
    },
    {
      name: "vault:exists",
      ok: vaultExists,
      detail: vaultExists ? "initialized" : "not yet initialized (run /ari-vault-status)",
    },
    {
      name: "vault:index",
      ok: dbExists,
      detail: dbExists ? "vault-index.db present" : "not yet indexed",
    },
    {
      name: "vault:enabled",
      ok: process.env.ARI_OBSIDIAN_ENABLED !== "false",
      detail:
        process.env.ARI_OBSIDIAN_ENABLED === "false"
          ? "disabled (ARI_OBSIDIAN_ENABLED=false)"
          : "enabled",
    },
  ];

  if (vaultExists) {
    if (dbExists) {
      try {
        const Database = _require("better-sqlite3") as typeof import("better-sqlite3").default;
        const db = new Database(dbPath, { readonly: true });
        const { noteCount } = db.prepare("SELECT COUNT(*) as noteCount FROM notes").get() as {
          noteCount: number;
        };
        const { openLoopCount } = db
          .prepare("SELECT COUNT(*) as openLoopCount FROM note_tags WHERE tag = 'open-loop'")
          .get() as { openLoopCount: number };
        db.close();
        checks.push({
          name: "vault:notes",
          ok: true,
          detail: `${noteCount} indexed, ${openLoopCount} open loops`,
        });
      } catch {
        checks.push({ name: "vault:notes", ok: false, detail: "index read error" });
      }
    }
  }

  return checks;
}

// ── Finance checks ────────────────────────────────────────────────────────────

function checkFinance(): CheckResult[] {
  const dbPath = path.join(homedir(), ".ari", "databases", "finance.db");
  const dbExists = existsSync(dbPath);
  const newsProvider =
    process.env.ARI_FINANCE_NEWS_PROVIDER ?? (process.env.JINA_API_KEY ? "jina" : "rss");

  const checks: CheckResult[] = [
    {
      name: "finance:db",
      ok: dbExists,
      detail: dbExists ? "finance.db present" : "not yet initialized",
    },
    {
      name: "finance:news_provider",
      ok: true,
      detail: `${newsProvider}${newsProvider === "jina" ? " (JINA_API_KEY present)" : ""}`,
    },
    {
      name: "finance:JINA_API_KEY",
      ok: true,
      detail: process.env.JINA_API_KEY ? "present (jina provider active)" : "absent (rss fallback)",
    },
  ];

  if (dbExists) {
    try {
      const Database = _require("better-sqlite3") as typeof import("better-sqlite3").default;
      const db = new Database(dbPath, { readonly: true });
      const { watchlistCount } = db
        .prepare("SELECT COUNT(*) as watchlistCount FROM watchlist")
        .get() as { watchlistCount: number };
      const { signalCount } = db.prepare("SELECT COUNT(*) as signalCount FROM signals").get() as {
        signalCount: number;
      };
      const lastBrief = db
        .prepare("SELECT date FROM briefs ORDER BY written_at DESC LIMIT 1")
        .get() as { date: string } | undefined;
      db.close();
      checks.push({
        name: "finance:watchlist",
        ok: true,
        detail: `${watchlistCount} symbols, ${signalCount} signals`,
      });
      checks.push({
        name: "finance:last_brief",
        ok: true,
        detail: lastBrief ? `last: ${lastBrief.date}` : "no briefs yet",
      });
    } catch {
      checks.push({ name: "finance:watchlist", ok: false, detail: "DB read error" });
    }
  }

  return checks;
}

// ── Feedback check ────────────────────────────────────────────────────────────

function checkFeedback(): CheckResult[] {
  const dbPath = path.join(homedir(), ".ari", "databases", "vault-index.db");
  if (!existsSync(dbPath)) {
    return [{ name: "feedback:recent", ok: true, detail: "vault not initialized" }];
  }
  try {
    const Database = _require("better-sqlite3") as typeof import("better-sqlite3").default;
    const db = new Database(dbPath, { readonly: true });
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { good } = db
      .prepare("SELECT COUNT(*) as good FROM feedback WHERE rating = 'good' AND ts > ?")
      .get(since) as { good: number };
    const { bad } = db
      .prepare("SELECT COUNT(*) as bad FROM feedback WHERE rating = 'bad' AND ts > ?")
      .get(since) as { bad: number };
    db.close();
    const total = good + bad;
    const ratio = total > 0 ? `${((good / total) * 100).toFixed(0)}% positive` : "no feedback";
    return [
      {
        name: "feedback:recent",
        ok: true,
        detail: `7d: ${good} good / ${bad} bad (${ratio})`,
      },
    ];
  } catch {
    return [{ name: "feedback:recent", ok: false, detail: "feedback read error" }];
  }
}

// ── Gateway probe (optional, async) ──────────────────────────────────────────

export async function probeGateway(port = 3141): Promise<CheckResult> {
  try {
    const url = `http://127.0.0.1:${port}/health`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return {
      name: "gateway:health",
      ok: res.ok,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      name: "gateway:health",
      ok: false,
      detail: `unreachable: ${String(err).slice(0, 80)}`,
    };
  }
}

// ── Main report ───────────────────────────────────────────────────────────────

export async function runDoctor(opts?: { probeGw?: boolean }): Promise<DoctorReport> {
  const checks: CheckResult[] = [
    ...checkProviders(),
    ...checkAgents(),
    ...checkSkills(),
    ...checkKillSwitch(),
    ...checkConfigFiles(),
    ...checkMemoryDb(),
    ...checkObsidian(),
    ...checkFinance(),
    ...checkFeedback(),
  ];

  if (opts?.probeGw) {
    checks.unshift(await probeGateway());
  }

  const ok = checks.filter((c) => c.ok).length;
  const fail = checks.filter((c) => !c.ok).length;

  return {
    timestamp: new Date().toISOString(),
    checks,
    summary: { ok, warn: 0, fail },
  };
}
