#!/bin/bash
# ARI gateway preflight — fails fast on misconfiguration.
# Can be run standalone: bash scripts/ari-preflight.sh
set -euo pipefail
CANONICAL_DIR="/Users/ari/openclaw/ari"
DIST_ENTRY="$CANONICAL_DIR/dist/index.js"
PORT=3141
CANONICAL_SLUG="PryceHedrick/ari"

fail() { echo "[ari-preflight] FAIL: $1" >&2; exit 1; }
ok()   { echo "[ari-preflight] OK: $1"; }

# Ensure log dir exists (idempotent)
mkdir -p "$HOME/.ari/logs"

# 1. Canonical path
[ -d "$CANONICAL_DIR" ] || fail "Canonical dir missing: $CANONICAL_DIR"
ok "canonical dir exists"

# 2. Remote — match by substring (accepts SSH + HTTPS + trailing .git or not)
ACTUAL_REMOTE=$(git -C "$CANONICAL_DIR" remote get-url origin 2>/dev/null || echo "none")
echo "$ACTUAL_REMOTE" | grep -qi "$CANONICAL_SLUG" || \
  fail "Remote mismatch: got '$ACTUAL_REMOTE', must contain '$CANONICAL_SLUG'"
ok "remote matches $CANONICAL_SLUG"

# 3. Dist entry
[ -f "$DIST_ENTRY" ] || fail "Dist entry missing: $DIST_ENTRY — run: cd $CANONICAL_DIR && pnpm build"
ok "dist entry exists"

# 4. Port conflict check (only fail if non-canonical process holds the port)
EXISTING_PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $2}' || echo "")
if [ -n "$EXISTING_PID" ]; then
  EXISTING_CMD=$(ps -p "$EXISTING_PID" -o command= 2>/dev/null || echo "unknown")
  if ! echo "$EXISTING_CMD" | grep -q "$CANONICAL_DIR"; then
    fail "Port $PORT bound by non-canonical process (PID $EXISTING_PID): $EXISTING_CMD"
  fi
fi
ok "port $PORT clear or owned by canonical process"

echo "[ari-preflight] All checks passed. SHA=$(git -C "$CANONICAL_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
