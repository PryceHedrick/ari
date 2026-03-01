# Phase 42-E: Full Stack Safety & Visibility

## Overview

Phase 42-E delivers ARI's observability, trust, policy, and alignment system.
It adds a 14th plugin (`ari-ops`) plus SSOT config, skill audit tooling, and docs.

## Milestones

| #   | Name                                            | Status |
| --- | ----------------------------------------------- | ------ |
| M1  | SSOT config YAML + validator                    | ✅     |
| M2  | Structured tracing + redaction + SQLite storage | ✅     |
| M3  | Discord AgentOps command center                 | ✅     |
| M4  | Trust tiers + hash pinning scaffolding          | ✅     |
| M5  | Runtime policy engine (tool-call gate)          | ✅     |
| M6  | Kill switch + rollback snapshots                | ✅     |
| M7  | Value scoring + skill roadmap generator         | ✅     |

## New Files

```
plugins/ari-ops/              14th ARI plugin
config/                       SSOT config YAML files
config/models.yaml            All 9 model entries
config/agents.yaml            All 6 agents (ARI/NOVA/CHASE/PULSE/DEX/RUNE)
config/routing.yaml           14 declarative routing rules
config/profiles/              4 operational profiles
config/skills/tiers.yaml      5 trust tiers
config/skills/allowlist.yaml  Starts empty (no marketplace skills)
scripts/config/validate.ts    Config validator (pnpm ari:config:check)
scripts/skill_audit/          4-stage skill audit pipeline
scripts/ari-doctor-cli.ts     Doctor CLI (pnpm ari:doctor)
scripts/ari-traces-cli.ts     Traces CLI (pnpm ari:traces)
docs/ops/                     This directory
```

## Discord Commands

All commands require authorized sender (`requireAuth: true`).

| Command                   | Description                                |
| ------------------------- | ------------------------------------------ |
| `/ari-system`             | Gateway + plugin + agent health snapshot   |
| `/ari-doctor`             | Deep check: providers, skills, kill switch |
| `/ari-recent [n] [AGENT]` | Recent trace spans                         |
| `/ari-trace <id>`         | Full trace timeline by ID                  |
| `/ari-agents`             | Agent registry from memory DB              |
| `/ari-routing`            | Routing rules from config/routing.yaml     |
| `/ari-obs-debug on\|off`  | Toggle debug tracing flag                  |

Note: `/ari-status` name is taken by ari-pipelines; use `/ari-system` for ari-ops status.

## Scripts

```bash
pnpm ari:config:check   # Validate SSOT YAML configs
pnpm ari:doctor         # Full health check (CLI)
pnpm ari:traces         # Query recent trace spans
pnpm ari:rollback       # Snapshot allowlist.yaml
```

## Safety Invariants

1. Port 3141 gateway is never disrupted — all hooks are additive
2. Internal ARI tools (`ari_*` prefix) are always exempt from policy checks
3. Marketplace executable code requires out-of-process sandbox (not yet available)
4. `forensicMode: true` requires explicit operator approval
5. Tracer is bounded (500-event queue, drop-oldest) — cannot OOM the process
