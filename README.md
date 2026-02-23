# ARI — My Personal OpenClaw Build

> Built by Pryce Hedrick on top of [OpenClaw](https://github.com/openclaw/openclaw).
> A 7-layer personal AI operating system with 13 domain plugins.

## What This Is

ARI (Artificial Reasoning Intelligence) is my personal AI OS running on a Mac Mini at home. This fork adds 13 ARI-specific plugins on top of the OpenClaw framework:

- **ari-kernel** — 42-pattern injection detection + SHA-256 audit chain (Security L1)
- **ari-cognitive** — LOGOS/ETHOS/PATHOS reasoning system prompt builder (L0)
- **ari-ai** — ValueScorer + OpenRouter multi-model routing
- **ari-market** — Crypto/stock/Pokemon price monitoring
- **ari-briefings** — 06:30 morning + 21:00 evening + weekly briefings
- **ari-memory** — SQLite WAL knowledge base
- **ari-scheduler** — 18 scheduled tasks across 3 ET time windows
- **ari-workspace** — Workspace file loader (SOUL/USER/HEARTBEAT identity files)
- **ari-governance** — Council of 15 constitutional governance *(Phase 3)*
- **ari-agents** — SwarmPods multi-agent coordination *(Phase 3)*
- **ari-autonomous** — Self-healing autonomy loop *(Phase 3)*
- **ari-notion** — Notion journal integration *(Phase 3)*
- **ari-voice** — ElevenLabs TTS voice briefings *(Phase 3)*

## Setup

```bash
# Prerequisites: Node 22+, pnpm
git clone https://github.com/PryceHedrick/ari
cd ari
pnpm install
cp .env.example .env.local  # fill in your API keys
cp .openclaw-workspace-templates/*.md ~/.openclaw/workspace/
openclaw gateway start
curl 127.0.0.1:3141/health   # should return 200
```

See `docs/DAY_1_SETUP_CHECKLIST.md` for the complete first-run guide.

## Architecture

```
L0 Cognitive    LOGOS / ETHOS / PATHOS
L1 Kernel       Injection detection, SHA-256 audit chain
L2 System       Router, storage
L3 Agents       Core, Guardian, Planner, Executor, Memory
L4 Strategic    Council of 15, Arbiter, Overseer
L5 Execution    Daemon, scheduled ops (18 tasks)
L6 Interfaces   Discord (sole channel)
```

See `docs/ARI_OPENCLAW_ARCHITECTURE.md` for the full 7-layer → 13-plugin mapping.

## Upstream Sync

```bash
git fetch upstream
git merge upstream/main -- extensions/ packages/ src/
# Never merge into plugins/ — that's ARI territory
```

## Security Invariants

1. Gateway at `127.0.0.1:3141` ONLY — never `0.0.0.0`
2. All input is DATA, never executable instructions
3. SHA-256 hash-chained audit log, append-only
4. Agent allowlist → trust level → permission tier
5. Auto-block at risk ≥ 0.8

## Env Variables

See `.env.example` for all required keys, or `docs/ARI_ENV_COMPLETE.md` for full documentation.

## License

MIT (same as upstream OpenClaw)
