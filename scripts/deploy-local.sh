#!/bin/bash
# ARI local deploy — pull latest, build, restart launchd job.
# Usage: bash scripts/deploy-local.sh
set -euo pipefail
CANONICAL_DIR="/Users/ari/openclaw/ari"
LABEL="com.ari.gateway"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo "[deploy-local] Starting deploy at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Ensure log dir exists
mkdir -p "$HOME/.ari/logs"

echo "[deploy-local] Pulling latest (ff-only — stops if diverged)..."
# --ff-only prevents silent merge/rebase; if diverged, stop and resolve manually
git -C "$CANONICAL_DIR" pull --ff-only origin "$(git -C "$CANONICAL_DIR" branch --show-current)" || {
  echo "[deploy-local] STOP: branch has diverged from origin. Resolve manually:"
  echo "  git -C $CANONICAL_DIR log --oneline @{u}..HEAD  # your unpushed"
  echo "  git -C $CANONICAL_DIR log --oneline HEAD..@{u}  # theirs"
  exit 1
}

echo "[deploy-local] Installing deps..."
pnpm --dir "$CANONICAL_DIR" install --frozen-lockfile

echo "[deploy-local] Building..."
pnpm --dir "$CANONICAL_DIR" build

echo "[deploy-local] Running preflight..."
bash "$CANONICAL_DIR/scripts/ari-preflight.sh"

echo "[deploy-local] Restarting launchd job ($LABEL)..."
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
sleep 2
launchctl bootstrap "gui/$(id -u)" "$PLIST" || { echo "[deploy-local] bootstrap failed — check plist: $PLIST"; exit 1; }
# kickstart -k forces immediate start regardless of RunAtLoad/ThrottleInterval
launchctl kickstart -k "gui/$(id -u)/$LABEL" || true
sleep 5

# Verify: correlate PID to launchd label (proves launchd owns the process)
echo "[deploy-local] Verifying PID <-> launchd label..."
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E "pid|state|program|path" | head -6

echo "[deploy-local] Probing health endpoint..."
ARI_HEALTH_PORT=3141 bash "$CANONICAL_DIR/scripts/ari-health-probe.sh" || {
  echo "[deploy-local] Health probe failed — check logs:"
  echo "  tail -50 $HOME/.ari/logs/gateway-stdout.log"
  exit 1
}

SHA=$(git -C "$CANONICAL_DIR" rev-parse --short HEAD)
echo "[deploy-local] Deploy complete. SHA=$SHA"
