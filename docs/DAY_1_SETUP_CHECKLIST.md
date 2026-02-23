# ARI Day 1 Setup Checklist

Complete these steps in order. Each section has a verification command.

## Prerequisites

- [ ] Node.js 22+ (`node --version`)
- [ ] pnpm (`pnpm --version`)
- [ ] Git
- [ ] Access to Discord (server creation)
- [ ] OpenRouter account (openrouter.ai)
- [ ] Anthropic API key (console.anthropic.com — separate from Claude subscription)

---

## Step 1: Clone and Install

```bash
git clone https://github.com/PryceHedrick/ari ~/Ari/openclaw
cd ~/Ari/openclaw
pnpm install
```

**Verify:** `pnpm build` runs without errors.

---

## Step 2: Discord Server Setup

1. Create a new Discord server named "ARI Control Center"
2. Enable Developer Mode: User Settings → Advanced → Developer Mode
3. Create these channels (copy the IDs — right-click → Copy Channel ID):

| Channel | Purpose | ID Variable |
|---------|---------|-------------|
| #ari-main | General ARI | `ARI_DISCORD_CHANNEL_MAIN` |
| #ari-deep | Deep analysis | `ARI_DISCORD_CHANNEL_DEEP` |
| #portfolio | Market + stocks | `ARI_DISCORD_CHANNEL_PORTFOLIO` |
| #pokemon-collection | Pokemon TCG | `ARI_DISCORD_CHANNEL_POKEMON` |
| #leads | Pryceless leads | `ARI_DISCORD_CHANNEL_LEADS` |
| #battle-plans | Strategy | `ARI_DISCORD_CHANNEL_BATTLE_PLANS` |
| #market-alerts | P0 alerts | `ARI_DISCORD_CHANNEL_MARKET_ALERTS` |
| #evening-summary | P1/P2 queue | `ARI_DISCORD_CHANNEL_EVENING_SUMMARY` |
| #system-status | Webhooks | `ARI_DISCORD_CHANNEL_SYSTEM_STATUS` |

4. Create a Discord Bot:
   - discord.com/developers → New Application → "ARI"
   - Bot section → Reset Token → copy `DISCORD_BOT_TOKEN`
   - Enable: Server Members Intent + Message Content Intent
   - OAuth2 → Bot → permissions: Send Messages, Read Messages, Attach Files, Use Slash Commands
   - Invite to your server

5. Get your user ID: right-click your username → Copy User ID → `PRYCE_USER_ID`
6. Get server ID: right-click server icon → Copy Server ID → `DISCORD_GUILD_ID`

---

## Step 3: API Keys

Get these before proceeding:

| Key | Where | Variable |
|-----|-------|---------|
| OpenRouter | openrouter.ai → API Keys | `OPENROUTER_API_KEY` |
| Anthropic | console.anthropic.com | `ANTHROPIC_API_KEY` |
| Perplexity | perplexity.ai/settings/api | `PERPLEXITY_API_KEY` |
| ElevenLabs | elevenlabs.io → Profile | `ELEVENLABS_API_KEY` |
| Google AI | aistudio.google.com | `GOOGLE_AI_API_KEY` |

---

## Step 4: Configure Environment

```bash
cp .env.example ~/.openclaw/.env
# Edit ~/.openclaw/.env and fill in all required variables
nano ~/.openclaw/.env
```

Required minimum:
- `OPENROUTER_API_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `OPENCLAW_GATEWAY_TOKEN` (generate: `openssl rand -hex 32`)
- All `ARI_DISCORD_CHANNEL_*` IDs from Step 2
- `PRYCE_USER_ID`

---

## Step 5: Workspace Files

```bash
mkdir -p ~/.openclaw/workspace
cp .openclaw-workspace-templates/*.md ~/.openclaw/workspace/
```

**Verify:** `ls ~/.openclaw/workspace/` shows SOUL.md, USER.md, HEARTBEAT.md, AGENTS.md, RECOVERY.md

---

## Step 6: Start the Gateway

```bash
openclaw gateway start
```

**Verify:** `curl 127.0.0.1:3141/health` returns `{"status":"ok"}`

---

## Step 7: Run ARI Tests

```bash
npm test
```

**Verify:** All tests pass (80%+ coverage).

---

## Step 8: Mac Mini Deployment (Optional — Production)

For always-on operation on your Mac Mini:

```bash
# On Mac Mini via SSH
ssh -i ~/.ssh/id_ed25519 ari@100.81.73.34
cd /Users/ari/ARI
NODE_ENV=development npm install --ignore-scripts
NODE_ENV=development npm run build
# Load launchd plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.ari.gateway.plist
launchctl start ai.openclaw.ari.gateway
curl http://127.0.0.1:3141/health
```

See `RECOVERY.md` for rollback and disaster recovery procedures.

---

## Verification Checklist

- [ ] `curl 127.0.0.1:3141/health` → `{"status":"ok"}`
- [ ] ARI responds in #ari-main on Discord
- [ ] Morning briefing test: `POST 127.0.0.1:3141/api/scheduler/tasks/morning-briefing/trigger`
- [ ] Market data: ask ARI "what's BTC at?"
- [ ] All 13 plugins registered: `openclaw plugins list`

---

## Common Issues

**Gateway won't start:** Check port 3141 isn't in use: `lsof -i :3141`

**Discord bot not responding:** Verify Message Content Intent is enabled in developer portal

**Model calls failing:** Check `OPENROUTER_API_KEY` is valid and has credits

**Briefing not firing:** Verify cron timezone — all tasks run in ET (`ARI_TIMEZONE=America/New_York`)

**Mac Mini SSH fails:** Check Tailscale is connected: `tailscale status | grep 100.81.73.34`
