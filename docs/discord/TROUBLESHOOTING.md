# ARI Discord — Troubleshooting

## Bot Not Responding Decision Tree

```
Bot not responding in a channel?
│
├── 1. Is the gateway running?
│      curl 127.0.0.1:3141/health
│      → not 200? → Restart via OpenClaw Mac app  (or scripts/restart-mac.sh)
│
├── 2. Is the channel ID configured?
│      bun scripts/discord-check.ts
│      → ❌ on a channel? → Add the missing env var to ~/.openclaw/.env, restart gateway
│
├── 3. Is requireMention still accidentally true?
│      grep -A5 "guilds:" openclaw.config.json5
│      → should see requireMention: false
│      → if missing: add guild block per docs/discord/DISCORD_AUDIT.md, restart gateway
│
├── 4. Is MessageContent intent disabled in Dev Portal?
│      openclaw channels status --probe
│      → "intent: message_content disabled" → enable at discord.com/developers/applications
│
├── 5. Is daily budget exhausted?
│      Check #system-status for budget:warning events
│      → Budget resets at midnight ET; or increase ARI_DAILY_BUDGET_USD in .env
│
└── 6. Is the bot in the right guild?
       DISCORD_GUILD_ID must match your ARI server
       → bun scripts/discord-check.ts checks this
```

## Common Issues and Fixes

### "unknown channel" in event router logs

```
[ari-discord-event-router] channel not configured for key: opsDashboard
```

**Cause:** `ARI_DISCORD_CHANNEL_OPS_DASHBOARD` not set in `~/.openclaw/.env`.

**Fix:**

1. Get channel ID from Discord (right-click channel → Copy ID)
2. Add `ARI_DISCORD_CHANNEL_OPS_DASHBOARD=<snowflake>` to `~/.openclaw/.env`
3. Restart gateway

### Bot responds in #ari-main but not #ari-deep

**Cause:** `ARI_DISCORD_CHANNEL_DEEP` env var not set or wrong value.

**Fix:** Check with `bun scripts/discord-check.ts`, correct the ID.

### Model calls failing / no AI response

**Cause:** Wrong provider or API key missing.

**Verify:**

```bash
echo $ANTHROPIC_API_KEY        # should be set (sk-ant-...)
openclaw models auth list      # should show anthropic active
```

**Fix:** Add `ANTHROPIC_API_KEY=sk-ant-...` to `~/.openclaw/.env`.

### p1 routing sends to wrong channel

**Cause:** `ARI_DISCORD_CHANNEL_PAYTHEPRYCE_CONTENT` (old) vs `ARI_DISCORD_CHANNEL_PAYTHEPRICE` (correct).

**Fix:** Rename the env var in `~/.openclaw/.env` to `ARI_DISCORD_CHANNEL_PAYTHEPRICE`.

### Gateway starts but Discord events are silently dropped

**Cause:** Empty channel IDs passed to event router.

**Symptom:** No error in logs, POST /ari/discord-event returns `{"ok":false,"reason":"channel_not_configured"}`.

**Fix:** Set all required channel IDs in `.env`. Run `bun scripts/discord-check.ts` to find which are missing.

## Diagnostic Commands (run in order)

```bash
# 1. Full diagnostic scan
bun scripts/discord-check.ts

# 2. Gateway alive?
curl -s 127.0.0.1:3141/health

# 3. Channel + intent status
openclaw channels status --probe

# 4. System doctor
openclaw doctor

# 5. Gateway logs (last 50 lines)
scripts/clawlog.sh | tail -50

# 6. Test event delivery (sends a synthetic budget:warning to #system-status)
bun scripts/discord-check.ts --send-test
```

## Restart Procedure

1. Stop: use the OpenClaw Mac app (menu bar → Quit Gateway) — do NOT use kill/tmux
2. Verify stopped: `launchctl print gui/$UID | grep openclaw`
3. Start: OpenClaw Mac app → Start Gateway
4. Verify: `curl 127.0.0.1:3141/health` → 200

## Env File Location

Runtime secrets live at `~/.openclaw/.env` on the Mac Mini only. Never commit real values.

Template: `.env.example` in this repo.
