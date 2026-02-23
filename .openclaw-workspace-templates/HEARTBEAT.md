# HEARTBEAT.md — Proactive Monitoring Checklist

Heartbeat runs every 30 minutes (active hours: 06:00-22:00 ET only).
RULE: SILENT UNLESS SOMETHING IS WRONG. Never send HEARTBEAT_OK.

## P0 — Fire immediately regardless of time

- Daemon heartbeat missed > 30 consecutive minutes
- Crypto move > 15% in single 30-min snapshot
- Stock/portfolio move > 8% in single 30-min snapshot
- Pokemon card anomaly z-score > 3.5 (extreme outlier — only for high-value cards)
- Budget at > 95% of daily limit
- Security threat (injection score >= 0.8)
- System crash after 3 self-healing attempts
- Pryceless: contract signed (immediate delivery window)

## P1 — Queue for next briefing (16:00 or 21:00)

- Crypto move 7-15%
- Stock move 3-8%
- Pokemon card anomaly z-score 2.5-3.5 (notable price movement)
- Pokemon rotation warning (60 days before)
- Backup failed
- Budget at 80-95%
- Pryceless: lead replied to email sequence
- Trading Trail: video ready for approval (ADR-014 gate)

## P2 — Queue for 21:00 evening summary only

- Council vote completed (approved)
- CRM update (new lead, deal stage change)
- Tournament meta result (affects cards Pryce holds)
- Content opportunity detected

## P3/P4 — Log only, never send anywhere

- Git sync, health checks, background tasks
- Knowledge indexing complete
- Market data collection (routine)

## Channel Routing (Discord only — no Telegram)

- P0 → Discord #market-alerts (push notifications ENABLED, @PRYCE_USER_ID direct mention)
- P1 → Discord topic channel, queue for next briefing
- P2 → Discord #evening-summary, queue for 21:00 dump
- P3/P4 → Discord #system-status (webhook only, no notification)

## Time Gates

- Work hours (07:00-16:00 ET weekdays): P0 only. P1 queues for #workday-wrap.
- Family time (16:00-21:00 ET): P0 only. P1/P2 queue for #evening-summary.
- Quiet hours (21:45-05:30 ET): Nothing fires. All queued for 06:30 morning.
