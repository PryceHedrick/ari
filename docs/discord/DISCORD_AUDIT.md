# ARI Discord Audit — Root Causes & Architecture

## Architecture

```
Discord Guild (ARI server)
  └── Channels
        ├── #ari-main          → agent: main     (claude-sonnet-4-6)
        ├── #ari-deep          → agent: deep-analysis (claude-opus-4-6)
        ├── #market-alerts     → agent: market-monitor (claude-haiku-4-5-20251001)
        ├── #pokemon-market    → agent: market-monitor
        ├── #leads             → agent: growth-pod (claude-sonnet-4-6)
        ├── #battle-plans      → agent: growth-pod
        ├── #system-status     ← event router: budget warnings, security anomalies
        ├── #ops-dashboard     ← event router: git sync
        ├── #research-digest   ← event router: weekly research
        ├── #video-queue       ← event router: p1 pipeline
        └── #outreach-queue    ← event router: p2 pipeline

OpenClaw Gateway (127.0.0.1:3141)
  ├── Discord channel handler → routes to agent by channel ID
  └── POST /ari/discord-event → event router → target Discord channel
```

## Root Causes Found (2026-03-01)

| #   | Severity    | Bug                                                                                                    | Fix Applied                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1   | 🔴 CRITICAL | No `requireMention:false` → bot ignores all messages unless @mentioned                                 | Added `guilds[].requireMention:false` + `groupPolicy:open`    |
| 2   | 🔴 CRITICAL | `PAYTHEPRYCE_CONTENT` in config vs `PAYTHEPRICE` in .env → p1 routing broken                           | Renamed to `PAYTHEPRICE` throughout                           |
| 3   | 🔴 CRITICAL | `OPS_DASHBOARD`, `BATTLE_PLANS`, `DEMO_FACTORY` env vars missing → event router silently drops         | Added loud warn log per unconfigured key                      |
| 4   | 🔴 CRITICAL | All agents used `provider:"openrouter"` + stale model IDs → no model calls work without OpenRouter key | Switched all to `provider:"anthropic"`, correct model IDs     |
| 5   | 🟡 MEDIUM   | `GOALS.md` missing from workspace files list AND templates                                             | Added to both                                                 |
| 6   | 🟡 MEDIUM   | `.env.example` had stale/wrong var names (`PORTFOLIO`, `EVENING_SUMMARY`)                              | Full rewrite                                                  |
| 7   | 🟡 MEDIUM   | Dual cron schedule definitions (config + code) created confusion                                       | Removed from config; canonical source is ari-scheduler plugin |
| 8   | 🟢 LOW      | No diagnostics script                                                                                  | Created `scripts/discord-check.ts`                            |

## Key Env Var Mapping

| Config key                    | Env var                             | Channel              |
| ----------------------------- | ----------------------------------- | -------------------- |
| `p1ChannelIds[4]`             | `ARI_DISCORD_CHANNEL_PAYTHEPRICE`   | #paytheprice-content |
| `p2ChannelIds[3]`             | `ARI_DISCORD_CHANNEL_BATTLE_PLANS`  | #battle-plans        |
| `p2ChannelIds[4]`             | `ARI_DISCORD_CHANNEL_DEMO_FACTORY`  | #demo-factory        |
| `alerts.p1Channel`            | `ARI_DISCORD_CHANNEL_PAYTHEPRICE`   | P1 alert target      |
| `opsDashboard` (event router) | `ARI_DISCORD_CHANNEL_OPS_DASHBOARD` | ops:git_synced       |

## Provider Strategy

- **Primary:** `anthropic` → `ANTHROPIC_API_KEY` (all main agents)
- **Code tasks:** `openai-codex` (OAuth subscription, no key) → `code-pod` agent
- **Fallback:** `openai` with `OPENAI_API_KEY` if Codex OAuth not active
- **Optional:** `XAI_API_KEY` (xAI/Grok), `PERPLEXITY_API_KEY` (DEX research)
- **Removed:** OpenRouter is no longer the primary gateway

## Verification Commands

```bash
bun scripts/discord-check.ts
curl -s 127.0.0.1:3141/health
openclaw channels status --probe
openclaw doctor
```
