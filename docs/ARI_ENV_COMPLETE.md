# ARI Environment Variables — Complete Reference

Every variable ARI uses, where to get it, and which plugin needs it.

## Required (ARI won't start without these)

| Variable | Plugin | Where to Get |
|----------|--------|-------------|
| `OPENROUTER_API_KEY` | ari-ai | openrouter.ai — primary AI gateway |
| `DISCORD_BOT_TOKEN` | L6 interface | discord.com/developers → bot token |
| `DISCORD_GUILD_ID` | L6 interface | Discord server Settings → copy Server ID |
| `OPENCLAW_GATEWAY_TOKEN` | OpenClaw core | Generate: `openssl rand -hex 32` |

## ARI Channels

| Variable | Purpose |
|----------|---------|
| `ARI_DISCORD_CHANNEL_MAIN` | #ari-main channel ID |
| `ARI_DISCORD_CHANNEL_DEEP` | #ari-deep channel ID |
| `ARI_DISCORD_CHANNEL_PORTFOLIO` | #portfolio channel ID |
| `ARI_DISCORD_CHANNEL_POKEMON` | #pokemon-collection channel ID |
| `ARI_DISCORD_CHANNEL_LEADS` | #leads channel ID |
| `ARI_DISCORD_CHANNEL_BATTLE_PLANS` | #battle-plans channel ID |
| `ARI_DISCORD_CHANNEL_MARKET_ALERTS` | #market-alerts (P0 alerts) |
| `ARI_DISCORD_CHANNEL_EVENING_SUMMARY` | #evening-summary |
| `ARI_DISCORD_CHANNEL_SYSTEM_STATUS` | #system-status (webhooks) |
| `PRYCE_USER_ID` | Your Discord user ID for @mentions |

## AI Providers

| Variable | Required | Notes |
|----------|----------|-------|
| `OPENROUTER_API_KEY` | Yes | Primary gateway for all Anthropic + xAI models |
| `ANTHROPIC_API_KEY` | Optional | Direct fallback if OpenRouter is down |
| `GOOGLE_AI_API_KEY` | Optional | Gemini 3.1 Pro direct (not on OpenRouter) |
| `PERPLEXITY_API_KEY` | Optional | Direct only — never routed through OpenRouter |

## Market Data (ari-market)

| Variable | Required | Notes |
|----------|----------|-------|
| `COINGECKO_API_KEY` | Optional | Free tier works; Pro for higher rate limits |
| `ALPHA_VANTAGE_API_KEY` | Optional | Stock quotes + fundamentals |
| `POKEMON_TCG_API_KEY` | Optional | pokemontcg.io — card price data |

## Voice (ari-voice, Phase 3)

| Variable | Required | Notes |
|----------|----------|-------|
| `ELEVENLABS_API_KEY` | For voice | elevenlabs.io |
| `ELEVENLABS_VOICE_ID` | For voice | ARI's assigned voice ID |

## Integrations

| Variable | Plugin | Notes |
|----------|--------|-------|
| `NOTION_API_KEY` | ari-notion | notion.so/my-integrations |
| `TAVILY_API_KEY` | web search | tavily.com — web search |
| `WEATHER_API_KEY` | ari-briefings | Optional — Open-Meteo fallback if missing |

## ARI System Settings

| Variable | Default | Notes |
|----------|---------|-------|
| `ARI_GATEWAY_PORT` | `3141` | Loopback only — never change to external |
| `ARI_DAILY_BUDGET_USD` | `2.00` | ModelExecutionPolicy circuit breaker |
| `ARI_TIMEZONE` | `America/New_York` | All cron in ET |
| `ARI_DB_PATH` | `~/.ari/databases` | SQLite WAL databases |
| `ARI_WORKSPACE_PATH` | `~/.openclaw/workspace` | Identity workspace files |

## OpenClaw Core (inherited)

| Variable | Notes |
|----------|-------|
| `OPENCLAW_GATEWAY_TOKEN` | Auth token for gateway API calls |
| `OPENCLAW_STATE_DIR` | Default: `~/.openclaw` |
| `OPENCLAW_CONFIG_PATH` | Default: `~/.openclaw/openclaw.json` |

## Setup Order

1. Copy `.env.example` → `~/.openclaw/.env`
2. Fill in `OPENROUTER_API_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `OPENCLAW_GATEWAY_TOKEN`
3. Add channel IDs (Developer Mode in Discord → right-click channel → Copy ID)
4. Add optional keys as needed
5. `openclaw gateway start`
6. `curl 127.0.0.1:3141/health` → should return `{"status":"ok"}`

See `docs/DAY_1_SETUP_CHECKLIST.md` for the full first-run walkthrough.
