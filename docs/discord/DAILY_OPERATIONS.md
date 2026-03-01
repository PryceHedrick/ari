# ARI Discord — Daily Operations

## Daily Loop (all times ET)

| Time                       | Task                                | Channel          | Agent          |
| -------------------------- | ----------------------------------- | ---------------- | -------------- |
| 05:00                      | Pre-fetch market data               | — (background)   | market-monitor |
| 06:30                      | Morning briefing                    | #ari-main        | main           |
| 07:00                      | Portfolio snapshot                  | #ari-main        | main           |
| 07:15                      | News digest                         | #ari-main        | main           |
| 12:00                      | Midday market check (weekdays)      | #market-alerts   | market-monitor |
| 12:30                      | Pokemon TCG price scan              | #pokemon-market  | market-monitor |
| 14:00                      | Pryceless leads pipeline (weekdays) | #leads           | growth-pod     |
| 16:00                      | Workday wrap (weekdays)             | #ari-main        | main           |
| 19:00                      | Market close summary (weekdays)     | #market-alerts   | market-monitor |
| 20:00                      | X/Twitter likes digest              | #research-digest | market-monitor |
| 21:00                      | Evening briefing                    | #ari-main        | main           |
| 21:30                      | Knowledge base deduplication        | — (background)   | —              |
| 22:00                      | Daily SQLite + workspace backup     | — (background)   | —              |
| Hourly                     | Memory consolidation                | — (background)   | —              |
| Every 30 min (06:00–22:00) | Heartbeat / P0 alerts               | #market-alerts   | —              |
| Every 6h                   | Cost audit vs daily budget          | #system-status   | —              |

**Weekly:**

- Monday 09:00: Pokemon collection valuation
- Monday 10:00: Pryceless CRM sync

## Channel → Agent Map

| Channel         | Agent          | Model                     | When to use                      |
| --------------- | -------------- | ------------------------- | -------------------------------- |
| #ari-main       | main           | claude-sonnet-4-6         | General chat, briefings, default |
| #ari-deep       | deep-analysis  | claude-opus-4-6           | Complex research, big decisions  |
| #market-alerts  | market-monitor | claude-haiku-4-5-20251001 | Price alerts, quick scans        |
| #pokemon-market | market-monitor | claude-haiku-4-5-20251001 | TCG signals                      |
| #leads          | growth-pod     | claude-sonnet-4-6         | Lead qualification, CRM          |
| #battle-plans   | growth-pod     | claude-sonnet-4-6         | Pryceless strategy               |

## Slash Commands

| Command                      | Effect                     | Channel         |
| ---------------------------- | -------------------------- | --------------- |
| `/ari-status`                | ARI system status          | any             |
| `/ari-p1-approve <jobId>`    | Approve video pipeline job | #video-queue    |
| `/ari-p1-reject <jobId>`     | Reject video pipeline job  | #video-queue    |
| `/ari-p1-queue`              | List pending P1 jobs       | #video-queue    |
| `/ari-p2-approve <bundleId>` | Approve outreach bundle    | #outreach-queue |
| `/ari-p2-reject <bundleId>`  | Reject outreach bundle     | #outreach-queue |
| `/ari-p2-queue`              | List pending P2 bundles    | #outreach-queue |
| `/ari-ops-dashboard`         | Ops dashboard summary      | any             |
| `/ari-ops-alert`             | Trigger ops alert          | any             |

## Approval Flow

ARI posts approval prompts to specific channels and waits for Pryce's reply:

- **P1 video pipeline** → #video-queue → `/ari-p1-approve <jobId>` or "skip"
- **P2 outreach bundle** → #outreach-queue → `/ari-p2-approve <bundleId>` or "reject"

Any unapproved items auto-expire after 24 hours.

## Cost Management

- Daily budget: `ARI_DAILY_BUDGET_USD` (default $2.00)
- At 95% usage: non-essential tasks pause; fallback model activates (`claude-haiku-4-5-20251001`)
- Budget resets at midnight ET
- Check spend: look for budget:warning events in #system-status
