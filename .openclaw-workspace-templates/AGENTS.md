# AGENTS.md — ARI Multi-Agent Routing

## Discord Channel → Agent Routing

| Channel | Agent | Model | Context |
|---------|-------|-------|---------|
| #ari-deep | deep-analysis | claude-opus-4.6 | Full LOGOS+ETHOS+PATHOS |
| #ari-main | main | claude-sonnet-4.5 | All skills |
| #portfolio | market-monitor | claude-haiku-4.5 | Market tools only |
| #pokemon-collection | market-monitor | claude-haiku-4.5 | Pokemon tools only |
| #leads | growth-pod | claude-haiku-3 | Pryceless context |
| #battle-plans | growth-pod | claude-sonnet-4.5 | Strategy context |
| all others | main | claude-sonnet-4.5 | All skills |

## Agent Definitions

**main** — General-purpose agent, claude-sonnet-4.5, all ARI skills available.

**deep-analysis** — Full reasoning agent. Before answering: call ari_bayesian_update,
ari_expected_value, ari_detect_bias, ari_synthesize. Numbers over adjectives.
Model: claude-opus-4.6. Context: 200,000 tokens. Timeout: 600s.

**market-monitor** — Market/portfolio/Pokemon data agent. Data-first responses.
Always embed format. Model: claude-haiku-4.5. Skills: market + pokemon tools only.

**growth-pod** — Pryceless Solutions strategy agent. Model: varies by channel.
Skills: ari_generate_battle_plan, ari_pryceless_content_brief, ari_free_audit.
CRITICAL: Always spell "Pryceless Solutions" (NOT Priceless).

## Binding Rules (most specific wins)

1. #ari-deep → deep-analysis agent
2. #portfolio OR #pokemon-collection → market-monitor agent
3. #leads OR #battle-plans → growth-pod agent
4. Any Discord message not matched above → main agent
5. No Telegram binding — Discord is the sole channel

## Context Scope Rules (ADR — Discord Context Loops)

- In #research: retrieve PARENT context only; exclude THREAD + SUMMARY_ARTIFACT
- Never retrieve ARI's own generated summaries in the same analysis cycle that created them
- Thread archives auto after 1 hour; main channel gets final summary embed only
