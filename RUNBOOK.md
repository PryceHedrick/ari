# ARI Gateway — Production Runbook

## Canonical Setup

| Item              | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| **Repo**          | `/Users/ari/openclaw/ari`                                        |
| **GitHub**        | `PryceHedrick/ari`                                               |
| **Port**          | `3141` (loopback only — `127.0.0.1`)                             |
| **launchd label** | `com.ari.gateway`                                                |
| **Plist**         | `~/Library/LaunchAgents/com.ari.gateway.plist`                   |
| **Node**          | `/opt/homebrew/opt/node@22/bin/node` (>=22.12.0)                 |
| **Entry**         | `dist/index.js` (via `ari-start-wrapper.sh`)                     |
| **Gateway cmd**   | `gateway run --port 3141 --bind loopback`                        |
| **Health**        | `curl http://127.0.0.1:3141/health` → `{"status":"healthy",...}` |

> **Port 18789** is the upstream OpenClaw global install (`ai.openclaw.gateway`). Separate service. Do not touch.

---

## Routine Deploy (after pulling new code)

```bash
bash /Users/ari/openclaw/ari/scripts/deploy-local.sh
```

This: pulls ff-only → `pnpm install` → `pnpm build` → preflight → bootout → bootstrap → health probe.

---

## Check Status

```bash
# launchd job state
launchctl list com.ari.gateway

# What's on port 3141
lsof -nP -iTCP:3141 -sTCP:LISTEN

# Health check
curl http://127.0.0.1:3141/health

# Startup banner in logs
tail -20 ~/.ari/logs/gateway-stdout.log | grep '\[ari-start\]'
```

---

## Tail Logs

```bash
tail -f ~/.ari/logs/gateway-stdout.log
tail -f ~/.ari/logs/gateway-stderr.log
```

---

## Restart

```bash
LABEL="com.ari.gateway"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
sleep 2
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 5
curl http://127.0.0.1:3141/health
```

---

## Emergency Stop

```bash
launchctl bootout "gui/$(id -u)/com.ari.gateway"
```

Port 3141 will drop immediately. Briefings and Discord will stop. To restart, use bootstrap + kickstart above.

---

## Run Preflight Standalone

```bash
bash /Users/ari/openclaw/ari/scripts/ari-preflight.sh
```

Checks: canonical dir exists, remote = PryceHedrick/ari, dist/index.js built, port clear or owned by canonical process.

---

## Manual Build

```bash
cd /Users/ari/openclaw/ari
pnpm install --frozen-lockfile
pnpm build
# then restart via launchctl above
```

---

## What Each Service Is

| Port  | Label                 | Purpose                                       |
| ----- | --------------------- | --------------------------------------------- |
| 3141  | `com.ari.gateway`     | **ARI** — Discord, briefings, autonomous loop |
| 18789 | `ai.openclaw.gateway` | Upstream OpenClaw global install (separate)   |
