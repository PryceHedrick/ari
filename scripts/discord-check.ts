#!/usr/bin/env bun
/**
 * ARI Discord diagnostics script.
 *
 * Checks:
 *   1. Required env vars are present and non-empty
 *   2. All channel ID env vars are numeric Discord snowflake strings
 *   3. Gateway health: GET 127.0.0.1:3141/health → 200
 *   4. Primary provider key (ANTHROPIC_API_KEY) is set
 *
 * Usage:
 *   bun scripts/discord-check.ts
 *   bun scripts/discord-check.ts --send-test   # POST one test message to #system-status
 *
 * Exit code: 0 = all required checks pass, 1 = one or more required checks fail.
 */

import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Check definitions
// ---------------------------------------------------------------------------

const REQUIRED_ENV: Array<{ key: string; desc: string }> = [
  { key: "ANTHROPIC_API_KEY", desc: "Primary model provider" },
  { key: "DISCORD_BOT_TOKEN", desc: "Discord bot authentication" },
  { key: "DISCORD_CLIENT_ID", desc: "Discord application ID" },
  { key: "DISCORD_GUILD_ID", desc: "ARI Discord server ID" },
  { key: "PRYCE_USER_ID", desc: "Pryce Discord user ID (P0 @mentions)" },
  { key: "OPENCLAW_GATEWAY_TOKEN", desc: "Gateway auth token" },
];

const CHANNEL_ENV: Array<{ key: string; desc: string; required: boolean }> = [
  { key: "ARI_DISCORD_CHANNEL_MAIN", desc: "#ari-main (primary)", required: true },
  { key: "ARI_DISCORD_CHANNEL_DEEP", desc: "#ari-deep (Opus)", required: true },
  { key: "ARI_DISCORD_CHANNEL_MARKET_ALERTS", desc: "#market-alerts", required: true },
  { key: "ARI_DISCORD_CHANNEL_POKEMON", desc: "#pokemon-market", required: true },
  {
    key: "ARI_DISCORD_CHANNEL_PAYTHEPRICE",
    desc: "#paytheprice-content (p1 routing)",
    required: true,
  },
  { key: "ARI_DISCORD_CHANNEL_THUMBNAIL_LAB", desc: "#thumbnail-lab", required: false },
  { key: "ARI_DISCORD_CHANNEL_LEADS", desc: "#leads (growth-pod)", required: false },
  {
    key: "ARI_DISCORD_CHANNEL_BATTLE_PLANS",
    desc: "#battle-plans (growth-pod routing)",
    required: true,
  },
  { key: "ARI_DISCORD_CHANNEL_DEMO_FACTORY", desc: "#demo-factory (p2 routing)", required: false },
  { key: "ARI_DISCORD_CHANNEL_OUTREACH_QUEUE", desc: "#outreach-queue", required: false },
  { key: "ARI_DISCORD_CHANNEL_RESEARCH", desc: "#research-digest", required: false },
  { key: "ARI_DISCORD_CHANNEL_SYSTEM_STATUS", desc: "#system-status", required: true },
  { key: "ARI_DISCORD_CHANNEL_OPS_DASHBOARD", desc: "#ops-dashboard", required: false },
  { key: "ARI_DISCORD_CHANNEL_VIDEO_QUEUE", desc: "#video-queue", required: false },
  { key: "ARI_DISCORD_CHANNEL_SELF_HEALING", desc: "#self-healing", required: false },
  { key: "ARI_DISCORD_CHANNEL_RESEARCH_DIGEST", desc: "#research-digest (alt)", required: false },
];

const GATEWAY_URL = "http://127.0.0.1:3141/health";
const SEND_TEST_FLAG = process.argv.includes("--send-test");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function ok(label: string, detail = ""): void {
  console.log(`  ${GREEN}✅${RESET} ${label}${detail ? `  ${detail}` : ""}`);
}

function fail(label: string, fix: string): void {
  console.log(`  ${RED}❌${RESET} ${label}`);
  console.log(`     ${YELLOW}Fix:${RESET} ${fix}`);
}

function warn(label: string, fix: string): void {
  console.log(`  ${YELLOW}⚠️ ${RESET} ${label}`);
  console.log(`     ${YELLOW}Fix:${RESET} ${fix}`);
}

/** Returns true if the value looks like a Discord snowflake (numeric string, 15-20 digits). */
export function isNumericSnowflake(value: string): boolean {
  return /^\d{15,20}$/.test(value);
}

/** Checks if an env var is set and non-empty. */
export function checkEnvVar(key: string): boolean {
  const val = process.env[key];
  return typeof val === "string" && val.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Check functions (exported for tests)
// ---------------------------------------------------------------------------

export function checkRequiredEnv(): { failures: string[] } {
  const failures: string[] = [];
  for (const { key } of REQUIRED_ENV) {
    if (!checkEnvVar(key)) {
      failures.push(key);
    }
  }
  return { failures };
}

export function checkChannelIds(): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const { key, required } of CHANNEL_ENV) {
    const val = process.env[key]?.trim() ?? "";
    if (!val) {
      if (required) {
        failures.push(key);
      } else {
        warnings.push(key);
      }
    } else if (!isNumericSnowflake(val)) {
      // Value is set but not a valid snowflake
      failures.push(`${key} (value "${val}" is not a numeric snowflake)`);
    }
  }

  return { failures, warnings };
}

async function checkGateway(): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(GATEWAY_URL, { signal: AbortSignal.timeout(5000) });
    return { ok: res.status === 200, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function checkProvider(): { primary: boolean; openaiCodex: boolean } {
  const primary = checkEnvVar("ANTHROPIC_API_KEY");

  // Check if openai-codex auth is active via CLI (best-effort)
  let openaiCodex = false;
  try {
    const out = execSync("openclaw models auth list 2>/dev/null", { timeout: 5000 }).toString();
    openaiCodex = out.includes("openai-codex") && out.includes("active");
  } catch {
    // CLI not available or not installed — skip
  }

  return { primary, openaiCodex };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n${BOLD}ARI Discord Diagnostics${RESET}  (${new Date().toISOString()})\n`);

  let exitCode = 0;

  // 1. Required env vars
  console.log(`${BOLD}1. Required env vars${RESET}`);
  const { failures: envFailures } = checkRequiredEnv();
  for (const { key, desc } of REQUIRED_ENV) {
    if (envFailures.includes(key)) {
      exitCode = 1;
      fail(`${key}  (${desc})`, `Add ${key}=<value> to ~/.openclaw/.env`);
    } else {
      ok(`${key}  (${desc})`);
    }
  }

  // 2. Channel IDs
  console.log(`\n${BOLD}2. Discord channel IDs${RESET}`);
  const { failures: chanFailures, warnings: chanWarnings } = checkChannelIds();

  for (const { key, desc, required } of CHANNEL_ENV) {
    const isFail = chanFailures.some((f) => f.startsWith(key));
    const isWarn = chanWarnings.includes(key);

    if (isFail) {
      if (required) {
        exitCode = 1;
      }
      fail(
        `${key}  (${desc})`,
        `Add ${key}=<snowflake_id> to ~/.openclaw/.env — get IDs from Discord (right-click channel → Copy ID)`,
      );
    } else if (isWarn) {
      warn(
        `${key}  (${desc}) — not set (optional)`,
        `Add ${key}=<snowflake_id> when channel is created`,
      );
    } else {
      ok(`${key}  (${desc})`);
    }
  }

  // 3. Gateway health
  console.log(`\n${BOLD}3. Gateway health  (${GATEWAY_URL})${RESET}`);
  const gw = await checkGateway();
  if (gw.ok) {
    ok("Gateway responded 200");
  } else {
    exitCode = 1;
    const detail = gw.error ?? `HTTP ${gw.status ?? "unreachable"}`;
    fail(
      `Gateway not responding  (${detail})`,
      "Restart via the OpenClaw Mac app or scripts/restart-mac.sh",
    );
  }

  // 4. Provider
  console.log(`\n${BOLD}4. Provider config${RESET}`);
  const prov = checkProvider();
  if (prov.primary) {
    ok("ANTHROPIC_API_KEY set  (primary provider)");
  } else {
    exitCode = 1;
    fail("ANTHROPIC_API_KEY not set", "Add ANTHROPIC_API_KEY=sk-ant-... to ~/.openclaw/.env");
  }
  if (prov.openaiCodex) {
    ok("openai-codex OAuth active  (code-pod agent)");
  } else {
    warn(
      "openai-codex OAuth not detected  (code-pod agent will degrade to openai API key path)",
      "Run: openclaw models auth login --provider openai-codex",
    );
  }

  // 5. Optional: send test message
  if (SEND_TEST_FLAG) {
    console.log(`\n${BOLD}5. Send test message  (--send-test)${RESET}`);
    const systemChan = process.env["ARI_DISCORD_CHANNEL_SYSTEM_STATUS"];
    if (!systemChan || !isNumericSnowflake(systemChan)) {
      fail(
        "ARI_DISCORD_CHANNEL_SYSTEM_STATUS not configured — cannot send test",
        "Set ARI_DISCORD_CHANNEL_SYSTEM_STATUS to a valid snowflake ID first",
      );
    } else {
      try {
        const res = await fetch("http://127.0.0.1:3141/ari/discord-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "budget:warning",
            payload: {
              percentUsed: "0",
              limitUsd: "2.00",
              spentUsd: "0.00",
            },
          }),
          signal: AbortSignal.timeout(8000),
        });
        const body = (await res.json()) as { ok?: boolean };
        if (res.ok && body.ok) {
          ok(`Test message sent to #system-status (channel ${systemChan})`);
        } else {
          fail(
            `Gateway returned non-OK: ${JSON.stringify(body)}`,
            "Check gateway logs: scripts/clawlog.sh",
          );
        }
      } catch (e) {
        fail(
          `Failed to send test: ${e instanceof Error ? e.message : String(e)}`,
          "Ensure gateway is running first",
        );
      }
    }
  }

  console.log(
    `\n${exitCode === 0 ? GREEN + "All required checks passed." : RED + "One or more required checks failed."}${RESET}\n`,
  );
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
