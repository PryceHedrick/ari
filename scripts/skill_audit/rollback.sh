#!/usr/bin/env bash
# rollback.sh — Snapshot allowlist.yaml to data/allowlist-snapshots/
# Usage: bash scripts/skill_audit/rollback.sh [restore <timestamp>]

set -euo pipefail

SNAP_DIR="data/allowlist-snapshots"
ALLOWLIST="config/skills/allowlist.yaml"

mkdir -p "$SNAP_DIR"

if [[ "${1:-}" == "restore" && -n "${2:-}" ]]; then
  # Restore mode
  SNAP_FILE="$SNAP_DIR/${2}.yaml"
  if [[ ! -f "$SNAP_FILE" ]]; then
    echo "ERROR: Snapshot not found: $SNAP_FILE"
    echo "Available snapshots:"
    ls "$SNAP_DIR"/*.yaml 2>/dev/null || echo "  (none)"
    exit 1
  fi
  cp "$SNAP_FILE" "$ALLOWLIST"
  echo "Restored allowlist from: $SNAP_FILE"
elif [[ "${1:-}" == "list" ]]; then
  echo "Available snapshots in $SNAP_DIR:"
  ls "$SNAP_DIR"/*.yaml 2>/dev/null | sort -r | head -20 || echo "  (none)"
else
  # Snapshot mode (default)
  STAMP=$(date +%Y-%m-%dT%H%M)
  SNAP_FILE="$SNAP_DIR/$STAMP.yaml"
  cp "$ALLOWLIST" "$SNAP_FILE"
  echo "Snapshot saved: $SNAP_FILE"
fi
