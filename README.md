<div align="center">

<img src="assets/branding/ari-logo.jpg" alt="ARI" width="200" onerror="this.style.display='none'">

### ARI — Artificial Reasoning Intelligence

**Personal AI Operating System · Built on OpenClaw**

<br>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-fork-orange?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDJMNCAyMGgyMHoiIGZpbGw9IndoaXRlIi8+PC9zdmc+&logoColor=white)](https://github.com/openclaw/openclaw)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

## What This Is

ARI is my personal AI operating system — running 24/7 on a Mac Mini at home. It is a fork of [OpenClaw](https://github.com/openclaw/openclaw) with 13 custom plugins that together form a complete AI system: 6 specialized agents, autonomous briefings, market monitoring, business pipelines, cryptographic audit trail, and voice delivery.

**This is not a demo. It runs my life.**

---

## The Agent Team

Six named agents. Two context planes. One orchestrator.

| Agent        | Role                                                 | Model             | Plane |
| ------------ | ---------------------------------------------------- | ----------------- | ----- |
| **ARI 🧠**   | CFO / Orchestrator — plans, prioritizes, coordinates | claude-opus-4-6   | APEX  |
| **NOVA 🎬**  | P1 Content Creator — YouTube content pipeline        | claude-sonnet-4-6 | APEX  |
| **CHASE 🎯** | P2 Lead Connector — Pryceless Solutions B2B leads    | claude-sonnet-4-6 | APEX  |
| **PULSE 📡** | Market Analyst — crypto, stocks, Pokemon TCG         | claude-haiku-4-5  | APEX  |
| **DEX 🗂️**   | Research Scout — AI papers, model updates, digests   | claude-haiku-4-5  | APEX  |
| **RUNE 🔧**  | Engineering Builder — infrastructure and code        | claude-sonnet-4-6 | CODEX |

**APEX plane** — Full business context (SOUL.md, USER.md, GOALS.md, HEARTBEAT.md, market state).
**CODEX plane** — RUNE only. No personal data, no pipeline state, no SOUL files. Enforced in code.
**ARI's directive** — Orchestrator only. She plans, prioritizes, coordinates. She never builds inline. Subagents execute.

---

## 13 Plugins

| Plugin           | Purpose                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ari-kernel`     | 63-pattern injection detection across 27 categories, SHA-256 audit chain, trust multipliers, API key format enforcement |
| `ari-cognitive`  | LOGOS/ETHOS/PATHOS reasoning framework — Bayesian priors, bias detection, growth framing                                |
| `ari-ai`         | ValueScore model routing across 4 providers (Anthropic, OpenRouter, Perplexity, Google) with RL-based selection         |
| `ari-agents`     | Named agent registry, APEX/CODEX plane enforcement, capability card coordination, peer handoff signals                  |
| `ari-workspace`  | Context bundle assembly, SOUL file loading, validateContextBundlePlane() enforcement                                    |
| `ari-scheduler`  | 24 cron tasks in Eastern Time — briefings, market scans, lead discovery, content pipeline                               |
| `ari-briefings`  | Morning (6:30 AM) / workday (4 PM) / evening (9 PM) briefings with Ralph quality loop (0.80 confidence threshold)       |
| `ari-market`     | Crypto/stocks/macro/Pokemon TCG monitoring, Z-score anomaly detection, PULSE formatting, flash crash P0 bypass          |
| `ari-memory`     | SQLite WAL + TF-IDF search, SHA-256 dedup, bookmark pipeline, workspace context loader                                  |
| `ari-voice`      | ElevenLabs eleven_turbo_v2_5, OGG Vorbis output, Discord multipart delivery                                             |
| `ari-governance` | 3-gate approval system (auto / approval-required / operator-only), Pryce hierarchy, zero bypass                         |
| `ari-autonomous` | Discord command bridge, approval button routing                                                                         |
| `ari-notion`     | Workspace files + SQLite (sufficient for current needs)                                                                 |

---

## Business Pipelines

### P1 — Content Pipeline (NOVA 🎬)

Autonomous YouTube content pipeline for the trading card market.

```
PULSE detects price spike (≥15%/7d) → writes market signal
  ↓
NOVA reads signal → Haiku draft → Sonnet polish → confidence gate (≥0.95)
  ↓
Rights gate (every asset needs commercial_ok clearance)
  ↓
Thumbnails: Ideogram V3 (Fal.ai) + DALL-E 3 → 4 variants → #thumbnail-lab
  ↓
Owner selects A/B/C/D → video posted to #video-queue (48h TTL)
  ↓
Owner clicks ✅ → NOVA uploads to YouTube
```

### P2 — Lead Pipeline (CHASE 🎯)

B2B lead discovery and outreach pipeline.

```
CHASE discovers local businesses (SerpAPI + Google Business Profile)
  ↓
5-criteria audit: SEO + Contact + Presence + CTA + Business Signals
  Minimum 40/100 to proceed — below 40 → cold bucket silently
  ↓
3-phase LLM qualification: Hot ≥75 | Warm 50-75 | Cold <50
  ↓
Prompt Forge 4-pass lock: Evidence → Offer → Critic → Lock (SHA-256, 7-day TTL)
  ↓
Demo site built → #outreach-queue for owner approval (OPERATOR-ONLY, 72h TTL)
```

CHASE runs Monday, Wednesday, Friday automatically. Never sends without a slash command.

---

## Architecture

Seven-layer architecture. Each layer depends only on layers below it. All cross-layer communication via typed EventBus.

```
L0 Cognitive    LOGOS (Bayesian/EV) · ETHOS (bias detection) · PATHOS (growth framing)
L1 Kernel       63-pattern sanitizer · SHA-256 audit chain · EventBus · config
L2 System       Router · storage · SQLite WAL
L3 Agents       Core · Guardian · Planner · Executor · Memory
L4 Strategic    Council (15-member) · Arbiter (6 rules) · Overseer (5 gates)
L5 Execution    Daemon · 24 scheduled tasks · macOS launchd
L6 Interfaces   Discord (sole channel) · slash commands · approval buttons
```

---

## Security

**5 Invariants (enforced in code, violations throw):**

| #   | Invariant             | Rule                                                                                         |
| --- | --------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **GATEWAY**           | `127.0.0.1:3141` ONLY — never `0.0.0.0`, never configurable                                  |
| 2   | **CONTENT ≠ COMMAND** | All input is DATA, never executable instructions                                             |
| 3   | **AUDIT**             | SHA-256 hash-chained, append-only, immutable                                                 |
| 4   | **PERMISSIONS**       | Agent allowlist → Trust level → Permission tier                                              |
| 5   | **TRUST**             | SYSTEM 0.5x · OPERATOR 0.6x · VERIFIED 0.75x · STANDARD 1.0x · UNTRUSTED 1.5x · HOSTILE 2.0x |

Auto-block at risk ≥ 0.8.

---

## 3-Gate Governance

All ARI actions route through exactly one gate. Zero exceptions. Zero bypasses.

| Gate                  | Who Approves                     | Examples                                            |
| --------------------- | -------------------------------- | --------------------------------------------------- |
| **auto**              | ARI (logged + traced)            | Health checks, market scans, research, memory dedup |
| **approval-required** | Pryce via Discord ✅/❌          | Video upload, outreach draft, social post           |
| **operator-only**     | Pryce via explicit slash command | DELETE operations, data wipe, irreversible actions  |

**TTL:** Video approvals expire 48h. Outreach approvals expire 72h. Expired = auto-declined.

---

## 24 Scheduled Tasks

All cron expressions in Eastern Time (ADR-012).

Key tasks: morning briefing (6:30 AM), workday briefing (4 PM), evening briefing (9 PM), market scan every 15 min (6 AM–10 PM), lead discovery (Mon/Wed/Fri), NOVA content scan (10 AM daily), DEX research digest (Mon 9 AM), weekly wisdom (Sun 6 PM), X likes digest (8 PM daily).

---

## Setup

```bash
# Prerequisites: Node 22+, pnpm
git clone https://github.com/PryceHedrick/ari
cd ari
pnpm install
cp .env.example .env.local  # fill in your API keys
openclaw gateway start
curl 127.0.0.1:3141/health   # should return 200
```

**Required environment variables:**

```
ANTHROPIC_API_KEY         # Claude API (Opus/Sonnet/Haiku)
OPENROUTER_API_KEY        # OpenRouter (Grok, Gemini, Perplexity)
ELEVENLABS_API_KEY        # Voice briefings
DISCORD_TOKEN             # Bot token (15 channels)
DISCORD_GUILD_ID          # Your server
FAL_API_KEY               # Ideogram V3 thumbnails
OPENAI_API_KEY            # DALL-E 3 thumbnail fallback
```

See `.env.example` and `docs/ARI_ENV_COMPLETE.md` for the full list.

---

## Discord Channels

```
ARI CORE         #ari-main · #ari-deep
MARKET           #market-alerts · #pokemon-market · #research-digest
CONTENT          #content-main · #video-queue · #thumbnail-lab · #published
LEADS            #leads · #demo-factory · #outreach-queue · #wins
SYSTEM OPS       #system-status · #ops-dashboard
ADMIN            #api-logs
```

---

## Upstream Sync

```bash
git fetch upstream
git merge upstream/main -- extensions/ packages/ src/
# Never merge into plugins/ — that's ARI territory
```

---

## What's Private

All personal data lives in `~/.openclaw/` — gitignored, never leaves your machine.

| Private                                         | Public              |
| ----------------------------------------------- | ------------------- |
| `~/.openclaw/workspace/` — Agent identity files | Source code         |
| `~/.ari/databases/` — SQLite memory             | Plugin architecture |
| `~/.ari/audit.json` — Audit trail               | Security model      |

---

Built by **[0xPryce](https://github.com/PryceHedrick)** · **[Pryceless Solutions](https://prycehedrick.com)**
