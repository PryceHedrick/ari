# ARI × OpenClaw Architecture

7-layer architecture mapped to 13 OpenClaw plugins.

## Layer → Plugin Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│ L6 INTERFACES     Discord (sole channel)                        │
│                   Agent routing: main / deep-analysis /         │
│                   market-monitor / growth-pod                   │
├─────────────────────────────────────────────────────────────────┤
│ L5 EXECUTION      ari-scheduler  18 cron tasks, 3 ET windows    │
│                   ari-autonomous Self-healing loop (Phase 3)    │
├─────────────────────────────────────────────────────────────────┤
│ L4 STRATEGIC      ari-governance Council of 15 (Phase 3)        │
├─────────────────────────────────────────────────────────────────┤
│ L3 AGENTS         ari-agents     SwarmPods (Phase 3)            │
│                   ari-briefings  Morning/evening/weekly         │
│                   ari-market     Crypto/stock/Pokemon           │
│                   ari-memory     SQLite WAL knowledge base      │
│                   ari-notion     Journal + notes (Phase 3)      │
│                   ari-voice      ElevenLabs TTS (Phase 3)       │
├─────────────────────────────────────────────────────────────────┤
│ L2 SYSTEM         ari-ai         ValueScorer + OpenRouter       │
│                   ari-workspace  Workspace file loader          │
├─────────────────────────────────────────────────────────────────┤
│ L1 KERNEL         ari-kernel     Injection detection + audit    │
├─────────────────────────────────────────────────────────────────┤
│ L0 COGNITIVE      ari-cognitive  LOGOS / ETHOS / PATHOS         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Incoming Discord Message

```
Discord message
    → OpenClaw router
    → ari-kernel: sanitize + audit (42 injection patterns)
    → ari-cognitive: inject LOGOS/ETHOS/PATHOS system prompt
    → ari-governance: council gate check (Phase 3)
    → ari-ai: route to best model via ValueScorer + OpenRouter
    → OpenClaw core agent
    → ari-memory: log to SQLite knowledge base
    → Discord response
```

## Data Flow: Morning Briefing (06:30 ET)

```
ari-scheduler: morning-briefing task fires at 06:30
    → ari-market: fetch crypto/stock/Pokemon prices
    → ari-briefings: assemble morning digest
        ├── Market snapshot (crypto + stocks)
        ├── Pokemon collection alerts
        ├── Weather (Open-Meteo or API)
        └── Calendar events (AppleScript, 35s timeout)
    → ari-voice: ElevenLabs TTS → Discord audio (Phase 3)
    → Discord #market-alerts embed
```

## Plugin Directory Structure

```
plugins/
├── ari-kernel/       L1  Injection detection + SHA-256 audit
├── ari-cognitive/    L0  LOGOS/ETHOS/PATHOS prompt builder
├── ari-governance/   L4  Council of 15 (deferred Phase 3)
├── ari-agents/       L3  SwarmPods multi-agent (deferred)
├── ari-ai/           L2  ValueScorer + OpenRouter routing
├── ari-market/       L3  Crypto/stock/Pokemon monitoring
├── ari-briefings/    L3  Morning/evening/weekly briefings
├── ari-memory/       L3  SQLite WAL knowledge base
├── ari-scheduler/    L5  18-task cron schedule
├── ari-autonomous/   L5  Self-healing loop (deferred)
├── ari-notion/       L3  Journal/notes (deferred)
├── ari-voice/        L3  ElevenLabs TTS (deferred)
└── ari-workspace/    L2  Workspace file loader
```

## Model Routing (ari-ai)

```
ValueScorer evaluates incoming intent:

score ≥ 85 + analysis needed  → Gemini 3.1 Pro (via direct API)
score ≥ 70 + complex          → claude-opus-4.6 (via OpenRouter)
score ≥ 50                    → claude-sonnet-4.5 (via OpenRouter)
score < 50                    → claude-haiku-4.5 (via OpenRouter)
market/price queries          → claude-haiku-4.5 (via OpenRouter)
Perplexity queries            → sonar-pro (direct — never OpenRouter)
```

## Cron Schedule (ari-scheduler, 18 tasks)

### Morning Window (ET)
| Time  | Task |
|-------|------|
| 05:00 | Pre-fetch market data (stored for 06:30 briefing) |
| 06:30 | Morning briefing → Discord |
| 07:00 | Portfolio snapshot |
| 07:15 | News digest |

### Midday Window (ET)
| Time  | Task |
|-------|------|
| 12:00 | Market midday check |
| 12:30 | Pokemon price scan |
| 14:00 | Lead pipeline check (Pryceless Solutions) |

### Evening Window (ET)
| Time  | Task |
|-------|------|
| 16:00 | Workday wrap summary |
| 19:00 | Market close summary |
| 20:00 | X likes digest |
| 21:00 | Evening briefing |
| 21:30 | Knowledge base deduplication |
| 22:00 | Daily backup (SQLite + workspace) |

### Background Tasks
| Interval | Task |
|----------|------|
| 30 min   | Heartbeat check (P0 alerts only if firing) |
| 1 hr     | Memory consolidation |
| 6 hr     | Model cost audit vs. daily budget |
| Weekly   | Pokemon collection valuation |
| Weekly   | Pryceless Solutions CRM sync |

## Security Invariants

| # | Invariant |
|---|-----------|
| 1 | Gateway: `127.0.0.1:3141` ONLY — never `0.0.0.0` |
| 2 | Content ≠ Command: all input is DATA |
| 3 | Audit: SHA-256 hash-chained, append-only |
| 4 | Permissions: allowlist → trust level → tier |
| 5 | Auto-block at risk ≥ 0.8 |

## Trust Multipliers

| Level | Multiplier |
|-------|-----------|
| SYSTEM | 0.5x |
| OPERATOR | 0.6x |
| VERIFIED | 0.75x |
| STANDARD | 1.0x |
| UNTRUSTED | 1.5x |
| HOSTILE | 2.0x |

## Discord Agent Routing

| Channel | Agent | Model |
|---------|-------|-------|
| #ari-deep | deep-analysis | claude-opus-4.6 |
| #ari-main | main | claude-sonnet-4.5 |
| #portfolio | market-monitor | claude-haiku-4.5 |
| #pokemon-collection | market-monitor | claude-haiku-4.5 |
| #leads | growth-pod | claude-haiku-3 |
| #battle-plans | growth-pod | claude-sonnet-4.5 |
| all others | main | claude-sonnet-4.5 |

## Upstream Sync Strategy

```bash
git remote add upstream https://github.com/openclaw/openclaw.git
git fetch upstream
# Only sync upstream paths — never plugins/
git merge upstream/main -- extensions/ packages/ src/ docs/ .github/
```

ARI plugins in `plugins/` are never touched by upstream merges.
