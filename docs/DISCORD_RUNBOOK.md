# Discord Ops Runbook

Quick reference for ARI's Discord bot operations.

## Channel Map

| Channel           | ID                    | Agent         | Content                                    |
| ----------------- | --------------------- | ------------- | ------------------------------------------ |
| #ari-main         | `1476796431871377593` | ARI 🧠        | Briefings, ops, general — **primary chat** |
| #ari-deep         | `1476796837729013871` | ARI 🧠 (Deep) | Complex reasoning, threads                 |
| #market-alerts    | `1476797602069614645` | PULSE 📡      | Crypto/stock signals + anomalies           |
| #pokemon-market   | `1476798061547356180` | PULSE 📡      | Pokemon TCG price moves                    |
| #research-digest  | `1476798263331000461` | DEX 🗂️        | Weekly AI paper summaries                  |
| #paytheprice-main | `1476798642609328171` | NOVA 🎬       | P1 content strategy                        |
| #video-queue      | `1476798777464459376` | ARI → NOVA    | Approval queue (48h TTL)                   |
| #thumbnail-lab    | `1476798896704323604` | NOVA 🎬       | 4 thumbnail variants                       |
| #published        | `1476798984428327003` | NOVA 🎬       | Upload records                             |
| #leads            | `1476799631546519646` | CHASE 🎯      | P2 leads + scoring                         |
| #demo-factory     | `1476799768205328518` | CHASE 🎯      | Demo artifacts                             |
| #outreach-queue   | `1476799989094027325` | ARI → CHASE   | Outreach approval (72h TTL)                |
| #wins             | `1476800281391140924` | CHASE 🎯      | Closed deals                               |
| #system-status    | `1476800581493461013` | System        | Heartbeat + P0 alerts only                 |
| #ops-dashboard    | `1476801057727189136` | ARI 🧠        | Autopublished every 3h                     |
| #api-logs         | `1476801758486331403` | System        | Error logs, deployments                    |

## Slash Commands

### Status & Ops

| Command                              | Scope  | Description                              |
| ------------------------------------ | ------ | ---------------------------------------- |
| `/ari-status`                        | status | Pipeline scheduler, budget, audit status |
| `/status`                            | status | Quick alias for /ari-status              |
| `/ari-ops-queues`                    | status | Queue backlog summary P1+P2              |
| `/ari-ops-sla [hours]`               | status | 24h SLA + budget telemetry               |
| `/ari-ops-dashboard [hours]`         | status | Build dashboard artifact                 |
| `/ari-ops-dashboard-publish [hours]` | status | Build + publish via webhook              |
| `/ari-ops-weekly [hours]`            | status | Weekly digest artifact                   |
| `/ari-ops-weekly-publish [hours]`    | status | Export + publish weekly digest           |
| `/ari-ops-weekly-scheduler`          | status | Show/run weekly digest scheduler         |
| `/ari-ops-weekly-override`           | status | Force weekly digest (requires reason)    |
| `/ari-ops-autopublish`               | status | Show/configure autopublish               |
| `/ari-ops-canary`                    | status | Show/configure canary                    |

### Conversational

| Command                                            | Description                          |
| -------------------------------------------------- | ------------------------------------ |
| `/ari <request>`                                   | Send request to ARI (creates thread) |
| `/agent <NOVA\|CHASE\|PULSE\|DEX\|RUNE> <request>` | Route to named agent                 |
| `/summarize`                                       | Summarize current thread             |

### P1 — PayThePryce (NOVA)

| Command                   | Description                      |
| ------------------------- | -------------------------------- |
| `/ari-p1-run`             | Run P1 pipeline manually         |
| `/ari-p1-video [jobId]`   | Show P1 video job status         |
| `/ari-p1-queue`           | Show P1 pending jobs             |
| `/ari-p1-approve <jobId>` | Approve video package for upload |

### P2 — Pryceless Solutions (CHASE)

| Command                           | Description             |
| --------------------------------- | ----------------------- |
| `/ari-p2-scan`                    | Run P2 lead discovery   |
| `/ari-p2-top`                     | Show top scored leads   |
| `/ari-p2-queue`                   | Show outreach queue     |
| `/ari-p2-demo`                    | Show demo factory jobs  |
| `/ari-p2-approve <bundleId>`      | Approve outreach bundle |
| `/ari-p2-reject <bundleId>`       | Reject outreach bundle  |
| `/ari-p2-feedback <id> <outcome>` | Record deal outcome     |

### Vault (DEX)

| Command              | Description          |
| -------------------- | -------------------- |
| `/ari-vault-ideas`   | Show idea vault      |
| `/ari-vault-trace`   | Trace idea lineage   |
| `/ari-vault-connect` | Show connected ideas |
| `/ari-vault-gaps`    | Show knowledge gaps  |

## Approval Flow

### P1 Video (ADR-014: NEVER auto-publish)

1. NOVA completes video package → emits `pipeline:p1_ready_for_review`
2. ARI posts embed to `#video-queue` with ✅/❌ buttons
3. Pryce clicks ✅ → `POST /api/p1/jobs/{id}/approve`
4. Job state: `pending → approved → processing → completed`
5. TTL: 48h — buttons disabled after, ⏱️ react, state = `expired`
6. Slash command fallback: `/ari-p1-approve <jobId>`

### P2 Outreach (OPERATOR-ONLY)

1. CHASE completes Prompt Forge lock → emits `pipeline:p2_ready_for_review`
2. ARI posts embed to `#outreach-queue`
3. Pryce approves → `POST /api/p2/jobs/{bundleId}/approve`
4. TTL: 72h
5. Slash command fallback: `/ari-p2-approve <bundleId>`

## Event Router

ARI services notify Discord by POST-ing to the gateway:

```bash
# From Mac Mini (after deploy)
curl -X POST http://127.0.0.1:18789/ari/discord-event \
  -H 'Content-Type: application/json' \
  -d '{"event":"briefing:ready","payload":{"content":"Good morning..."}}'
```

### Supported Events

| Event                          | Channel          | Who emits     |
| ------------------------------ | ---------------- | ------------- |
| `briefing:ready`               | #ari-main        | ari-briefings |
| `briefing:evening_ready`       | #ari-main        | ari-briefings |
| `market:price_alert`           | #market-alerts   | ari-market    |
| `market:pokemon_signal`        | #pokemon-market  | ari-market    |
| `market:briefing_ready`        | #market-alerts   | ari-market    |
| `security:anomaly_detected`    | #system-status   | ari-kernel    |
| `budget:warning`               | #system-status   | ari-scheduler |
| `agent:help_request`           | #ari-main        | any agent     |
| `ops:git_synced`               | #ops-dashboard   | ari-scheduler |
| `research:digest_ready`        | #research-digest | DEX           |
| `pipeline:p1_ready_for_review` | #video-queue     | NOVA          |
| `pipeline:p2_ready_for_review` | #outreach-queue  | CHASE         |

## Per-Agent Webhooks (Optional)

Webhooks allow each agent to post with their own name/avatar instead of the bot identity.

Create webhooks in Discord: **Channel Settings → Integrations → Webhooks → New Webhook**

Then add to `~/.openclaw/.env`:

```bash
ARI_DISCORD_WEBHOOK_ARI=https://discord.com/api/webhooks/...    # Create in #ari-main
ARI_DISCORD_WEBHOOK_NOVA=https://discord.com/api/webhooks/...   # Create in #paytheprice-main
ARI_DISCORD_WEBHOOK_CHASE=https://discord.com/api/webhooks/...  # Create in #leads
ARI_DISCORD_WEBHOOK_PULSE=https://discord.com/api/webhooks/...  # Create in #market-alerts
ARI_DISCORD_WEBHOOK_DEX=https://discord.com/api/webhooks/...    # Create in #research-digest
ARI_DISCORD_WEBHOOK_RUNE=https://discord.com/api/webhooks/...   # Create in #system-status
ARI_DISCORD_WEBHOOK_SYSTEM=https://discord.com/api/webhooks/... # Create in #system-status
```

## Restart Procedures

```bash
# Check status
ssh ari@100.81.73.34 "export PATH=/opt/homebrew/Cellar/node@22/22.22.0/bin:/opt/homebrew/bin:\$PATH && openclaw status"

# Restart gateway
ssh ari@100.81.73.34 "export PATH=/opt/homebrew/Cellar/node@22/22.22.0/bin:/opt/homebrew/bin:\$PATH && openclaw gateway restart"

# Follow live logs
ssh ari@100.81.73.34 "tail -f ~/.openclaw/logs/gateway.log"

# Deploy new code from MacBook Air
cd ~/Ari/openclaw/ari
git push origin HEAD
ssh ari@100.81.73.34 "export PATH=/opt/homebrew/Cellar/node@22/22.22.0/bin:/opt/homebrew/bin:\$PATH && cd /Users/ari/openclaw/ari && git pull --ff-only && pnpm install && openclaw gateway restart"
```

## Required Env Vars

All in `~/.openclaw/.env` on Mac Mini:

```bash
# Bot credentials
DISCORD_BOT_TOKEN=<token>
DISCORD_CLIENT_ID=1476775975328022669
DISCORD_GUILD_ID=1476782878028202028

# 16 channel IDs
ARI_DISCORD_CHANNEL_MAIN=1476796431871377593
ARI_DISCORD_CHANNEL_DEEP=1476796837729013871
ARI_DISCORD_CHANNEL_MARKET_ALERTS=1476797602069614645
ARI_DISCORD_CHANNEL_POKEMON=1476798061547356180
ARI_DISCORD_CHANNEL_RESEARCH=1476798263331000461
ARI_DISCORD_CHANNEL_PAYTHEPRICE=1476798642609328171
ARI_DISCORD_CHANNEL_VIDEO_QUEUE=1476798777464459376
ARI_DISCORD_CHANNEL_THUMBNAIL_LAB=1476798896704323604
ARI_DISCORD_CHANNEL_PUBLISHED=1476798984428327003
ARI_DISCORD_CHANNEL_LEADS=1476799631546519646
ARI_DISCORD_CHANNEL_DEMO_FACTORY=1476799768205328518
ARI_DISCORD_CHANNEL_OUTREACH_QUEUE=1476799989094027325
ARI_DISCORD_CHANNEL_WINS=1476800281391140924
ARI_DISCORD_CHANNEL_SYSTEM_STATUS=1476800581493461013
ARI_DISCORD_CHANNEL_OPS_DASHBOARD=1476801057727189136
ARI_DISCORD_CHANNEL_API_LOGS=1476801758486331403
```

## Troubleshooting

**Bot doesn't respond to messages:**

1. Check `groupPolicy` is `open`: `openclaw config get channels.discord.groupPolicy`
2. Check bindings exist: `openclaw config get bindings`
3. Verify gateway running: `openclaw channels status --probe`
4. Check logs: `tail -50 ~/.openclaw/logs/gateway.log`

**Commands not showing in Discord:**

- Commands auto-register on gateway start. Restart gateway and wait ~1min for Discord to sync.

**Message Content Intent limited:**

- For bots in <100 servers, this is expected and works fine.
- For 100+ servers: enable privileged intent at discord.com/developers/applications

**Approval buttons expired:**

- P1: 48h TTL, P2: 72h TTL
- Use slash command fallback: `/ari-p1-approve <jobId>` or `/ari-p2-approve <bundleId>`
