---
name: alphaear-finance-suite
description: Finance intelligence prompts — sentiment, forecast, signal tracking (informational only)
version: 1.0.0
tier: internal
publisher: PryceHedrick (first-party)
tools: []
disclaimer: "⚠️ Informational analysis only. Not financial advice. No automated trading."
---

# AlphaEar Finance Suite Skill

Prompt specifications for ARI's finance intelligence capabilities.
All execution is handled by the `ari-finance` first-party plugin (TypeScript).
This SKILL.md serves as spec reference and prompt source only.

## Core Principle

**DISCLAIMER appears in every output, without exception:**

> ⚠️ Informational analysis only. Not financial advice. No automated trading.

## Modules

### Sentiment Analysis

Rule-based + LLM synthesis of market signals for a symbol.
Output schema: `{ symbol, sentiment, rationale, confidence, disclaimer, trace_id }`

### Forecast (base/bull/bear/invalidation)

Prompt-based LLM commentary. Never black-box prediction.
Output schema: `{ symbol, date, confidence, base, bull, bear, invalidation, disclaimer, trace_id }`

### Signal Tracker

State machine: neutral → strengthened → weakened → falsified
All transitions append to signal_events (append-only log with trace_id).

### News Provider

Abstraction: none | rss | jina | manual
Network access gated by assertNetworkDomain() against declared domain list.

## Commands

- `/ari-market-brief` — Daily market brief
- `/ari-watchlist [add|remove|list] [symbol]` — Manage watchlist
- `/ari-ticker <symbol>` — Ticker detail
- `/ari-sentiment <symbol>` — Sentiment (informational)
- `/ari-forecast <symbol>` — base/bull/bear/invalidation
- `/ari-report <symbol>` — Full report → vault
- `/ari-finance-open` — Active signals status
- `/ari-finance-weekly` — Weekly review
- `/ari-playbook <symbol>` — Per-symbol playbook state
