# RECOVERY.md — ARI Disaster Recovery Protocol

## Autonomous Recovery (ARI handles these without Pryce)

| Failure | Detection | Recovery | Success Gate |
|---------|-----------|----------|--------------|
| Single task crash | error.log watch | Self-healing patch (confidence >0.85) | npm test passes |
| API timeout (<3x) | Circuit breaker | Exponential backoff, fallback model | Response received |
| Budget spike | Cost tracker | Downgrade to haiku-3, pause non-essential | Under $2/day |
| SQLite corruption | PRAGMA integrity | Restore from ~/.ari/backup/latest/ | Integrity check pass |
| Gateway restart | launchd keepalive | Auto-restart via plist KeepAlive=true | Health check 200 |

## Human-Required Recovery (ARI sends P0 alert, Pryce must act)

| Failure | Alert Channel | Recovery Steps |
|---------|---------------|----------------|
| 3 self-healing failures on same error | #self-healing | SSH to Mac Mini → git log → manual fix |
| API key expired/banned | #market-alerts | Generate new key at provider console |
| Mac Mini network loss | #market-alerts | Check Tailscale (100.81.73.34) → reboot |
| Database unrecoverable | #self-healing | Restore from latest backup + validate |
| Confidence <0.85 on critical patch | #self-healing | Review patch → approve or revert |

## Mac Mini Access

```bash
ssh -o ConnectTimeout=10 -i ~/.ssh/id_ed25519 ari@100.81.73.34
cd /Users/ari/ari
source ~/.zshrc 2>/dev/null; source ~/.zprofile 2>/dev/null
NODE_ENV=development npm test
```

## Rollback Procedure

```bash
# On Mac Mini
launchctl unload ~/Library/LaunchAgents/ai.openclaw.ari.gateway.plist
git checkout v10-rollback
NODE_ENV=development npm run build
launchctl load ~/Library/LaunchAgents/com.ari.gateway.plist
launchctl start com.ari.gateway
curl http://127.0.0.1:3141/health
```

## Backup Targets

~/.ari/databases/       — All SQLite databases (WAL mode)
~/.ari/workspace/       — All 5 workspace files
~/.ari/knowledge/       — Intelligence scan logs + bookmarks
~/.ari/.env             — All 34+ environment variables (encrypted backup)
