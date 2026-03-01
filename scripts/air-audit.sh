#!/bin/bash
# MacBook Air ARI Audit — run this on the Air to find all ARI-related repos and state.
# Usage: bash air-audit.sh
echo "=== MacBook Air ARI Audit $(date) ==="
echo ""

echo "--- Git repos (max depth 4) ---"
find ~ -maxdepth 4 -type d -name ".git" 2>/dev/null | sed 's/\/.git$//' | while read d; do
  echo ""
  echo "REPO: $d"
  git -C "$d" remote -v 2>/dev/null
  git -C "$d" status -sb 2>/dev/null
  git -C "$d" log --oneline -5 2>/dev/null
  UNPUSHED=$(git -C "$d" log --oneline @{u}..HEAD 2>/dev/null | head -5)
  if [ -n "$UNPUSHED" ]; then
    echo "$UNPUSHED" | sed 's/^/  UNPUSHED: /'
  fi
done

echo ""
echo "--- ARI / OpenClaw Processes ---"
ps aux | grep -E "ari|openclaw|gateway" | grep -v grep || echo "(none)"

echo ""
echo "--- Port 3141 ---"
lsof -nP -iTCP:3141 -sTCP:LISTEN 2>/dev/null || echo "(nothing on 3141)"

echo ""
echo "--- Port 18789 ---"
lsof -nP -iTCP:18789 -sTCP:LISTEN 2>/dev/null || echo "(nothing on 18789)"

echo ""
echo "--- LaunchAgents (ari/openclaw) ---"
ls ~/Library/LaunchAgents/ 2>/dev/null | grep -E "ari|openclaw" || echo "(none)"
for plist in ~/Library/LaunchAgents/com.ari.*.plist ~/Library/LaunchAgents/ai.openclaw.*.plist; do
  [ -f "$plist" ] && echo "  $plist" && grep -A2 "<key>ProgramArguments</key>" "$plist" | head -5
done

echo ""
echo "=== DONE ==="
echo "If Air has unique unpushed commits: STOP — ask Pryce for transfer method before proceeding."
