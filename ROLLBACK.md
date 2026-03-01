# ARI Gateway — Rollback Guide

## Quick Rollback to Previous SHA

```bash
CANONICAL_DIR="/Users/ari/openclaw/ari"
PREV_SHA="<previous-sha>"   # from git log or STATE_REPORT.md

# 1. Check out previous SHA
git -C "$CANONICAL_DIR" checkout "$PREV_SHA" -- .

# 2. Rebuild
pnpm --dir "$CANONICAL_DIR" install --frozen-lockfile
pnpm --dir "$CANONICAL_DIR" build

# 3. Restart
LABEL="com.ari.gateway"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
sleep 2
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 5
curl http://127.0.0.1:3141/health
```

## Restore Plist from Backup

Backups live at: `~/ari_migration_backups/<timestamp>/`

```bash
# List backups
ls ~/ari_migration_backups/

# Restore a plist
cp ~/ari_migration_backups/<timestamp>/com.ari.gateway.plist.bak \
   ~/Library/LaunchAgents/com.ari.gateway.plist

# Reload
launchctl bootout gui/$(id -u)/com.ari.gateway 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ari.gateway.plist
launchctl kickstart -k gui/$(id -u)/com.ari.gateway
```

## git revert vs git reset

| Scenario                                                        | Command                           |
| --------------------------------------------------------------- | --------------------------------- |
| Undo last commit, keep it in history (safe for shared branches) | `git revert HEAD`                 |
| Undo last commit, drop from history (only if not pushed)        | `git reset --hard HEAD~1`         |
| Go back to specific SHA without losing current work             | `git stash && git checkout <sha>` |

## SHA Log

Find canonical SHA in: `~/ari_migration_backups/<timestamp>/STATE_REPORT.md`

```
GIT_SHA_CANONICAL=31102b67c108122d79ed08c2cc1ff576a7e070de
```

## Contact

Pryce Hedrick — `@Pryce` in Discord. All critical decisions require explicit confirmation before destructive actions.
