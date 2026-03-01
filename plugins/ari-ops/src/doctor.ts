/**
 * ARI Ops Doctor — health checks for providers, agents, skills, Discord, kill switch.
 *
 * Runs synchronously (no network calls) to avoid side effects.
 * Gateway HTTP probe is optional and only when explicitly requested.
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { killSwitch } from "./kill-switch.js";

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
