#!/bin/bash
# ARI gateway start wrapper — called by com.ari.gateway launchd plist.
# Logs a startup banner, runs preflight, then execs node.
set -euo pipefail
CANONICAL_DIR="/Users/ari/openclaw/ari"
DIST_ENTRY="$CANONICAL_DIR/dist/index.js"
PORT=3141

# Resolve node — require >=22 (openclaw engines.node >=22.12.0)
NODE_BIN="/opt/homebrew/opt/node@22/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node 2>/dev/null || echo "")
fi
[ -z "$NODE_BIN" ] && { echo "[ari-start] FAIL: node not found on PATH" >&2; exit 1; }

NODE_MAJOR=$("$NODE_BIN" -e "process.stdout.write(process.version.slice(1).split('.')[0])" 2>/dev/null || echo "0")
NODE_MIN=22
[ "$NODE_MAJOR" -ge "$NODE_MIN" ] || {
  echo "[ari-start] FAIL: node $NODE_MAJOR < $NODE_MIN required (engines.node >=22.12.0)" >&2
  echo "[ari-start] Hint: /opt/homebrew/opt/node@22/bin/node" >&2
  exit 1
}

# Ensure log dir exists (safe, idempotent)
LOG_DIR="$HOME/.ari/logs"
umask 077
mkdir -p "$LOG_DIR"

# Load env (secrets live outside the repo, not in git)
# Use set +e around source to tolerate any non-bash-compatible lines in the .env file
if [ -f "$HOME/.openclaw/.env" ]; then
  set +e  # Temporarily disable errexit; malformed .env lines must not kill the wrapper
  set -a
  source "$HOME/.openclaw/.env" 2>/dev/null
  set -e
  set +a
fi

# Startup banner
GIT_SHA=$(git -C "$CANONICAL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
VERSION=$("$NODE_BIN" -e "try{const p=require('$CANONICAL_DIR/package.json');process.stdout.write(p.version)}catch(e){process.stdout.write('unknown')}" 2>/dev/null || echo "unknown")
CONFIG_PATH="$HOME/.openclaw/.env"
echo "[ari-start] $(date -u +%Y-%m-%dT%H:%M:%SZ) VERSION=$VERSION SHA=$GIT_SHA CANONICAL=$CANONICAL_DIR PORT=$PORT NODE=$("$NODE_BIN" --version) CONFIG=$CONFIG_PATH"

# Preflight (exits non-zero on failure, which prevents startup and triggers launchd ThrottleInterval)
bash "$CANONICAL_DIR/scripts/ari-preflight.sh"

# Run gateway in foreground — launchd manages the process lifecycle
# gateway run = foreground mode; launchd handles restart via KeepAlive
exec "$NODE_BIN" "$DIST_ENTRY" gateway run --port "$PORT" --bind loopback
