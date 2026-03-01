#!/bin/bash
# Probes ARI gateway for any known health/status endpoint.
# Accepts HTTP 200-399 (2xx = healthy, 3xx = redirect to healthy).
# Usage: ARI_HEALTH_PORT=3141 bash scripts/ari-health-probe.sh
PORT="${ARI_HEALTH_PORT:-3141}"
ENDPOINTS=("/health" "/status" "/api/health" "/api/status" "/")

for ep in "${ENDPOINTS[@]}"; do
  HTTP_CODE=$(curl -s -L --max-redirs 3 -o /dev/null -w "%{http_code}" --max-time 5 \
    "http://127.0.0.1:$PORT$ep" 2>/dev/null || echo "0")
  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
    BODY=$(curl -s -L --max-redirs 3 --max-time 5 "http://127.0.0.1:$PORT$ep" 2>/dev/null | head -1)
    echo "[health-probe] $ep → HTTP $HTTP_CODE ✓  $BODY"
    exit 0
  fi
done
echo "[health-probe] No health endpoint responded on port $PORT (tried: ${ENDPOINTS[*]})" >&2
exit 1
