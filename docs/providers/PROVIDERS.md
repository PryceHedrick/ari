# ARI Provider Strategy

ARI uses direct provider APIs — no OpenRouter proxy required.

## Primary: Anthropic

All main agents (`main`, `deep-analysis`, `market-monitor`, `growth-pod`) use Anthropic directly.

**Setup:**

```bash
# Add to ~/.openclaw/.env on Mac Mini
ANTHROPIC_API_KEY=sk-ant-...
```

**Models in use:**

| Agent          | Model                     | Notes                           |
| -------------- | ------------------------- | ------------------------------- |
| main           | claude-sonnet-4-6         | General chat + briefings        |
| deep-analysis  | claude-opus-4-6           | Complex research, big decisions |
| market-monitor | claude-haiku-4-5-20251001 | Fast price scans                |
| growth-pod     | claude-sonnet-4-6         | Sales + strategy                |

**Verify:**

```bash
openclaw models auth list
# Should show anthropic: active
```

## Secondary: OpenAI / Codex

The `code-pod` agent handles code-heavy tasks.

### Option A — Codex OAuth (subscription, no API key)

Codex is available via your OpenAI subscription without an API key via OAuth.

```bash
openclaw models auth login --provider openai-codex
# Follow browser OAuth flow
```

**Verify:**

```bash
openclaw models auth list
# Should show openai-codex: active
```

### Option B — OpenAI API key

If Codex OAuth is not active, `code-pod` falls back to `openai` provider.

```bash
# Add to ~/.openclaw/.env
OPENAI_API_KEY=sk-...
```

**When to use each:**

- Codex OAuth: you have an OpenAI subscription and want zero-cost code completions
- API key: you prefer predictable billing or Codex OAuth is unavailable

## Optional: xAI / Grok

Only wired if `XAI_API_KEY` is present. Not assigned to any agent by default.

```bash
# Add to ~/.openclaw/.env
XAI_API_KEY=...
```

## Optional: X (Twitter) API — Read-Only Intel

Requires explicit opt-in.

```bash
# Add to ~/.openclaw/.env
ARI_ENABLE_X_INTEL=true
X_BEARER_TOKEN=...                            # App-only bearer (read-only)
X_INTEL_KEYWORDS=crypto,pokemon,AI,pryceless  # Comma-separated search terms
```

ARI uses **app-only bearer token** — no user OAuth required for read access.
Write endpoints are disabled by default; enabling requires `ARI_X_WRITE_ENABLED=true`
plus exec approval from Pryce.

## Optional: Perplexity

Used by DEX research synthesis in the intelligence scanner (PARALLEL A).

```bash
# Add to ~/.openclaw/.env
PERPLEXITY_API_KEY=pplx-...
```

## Removed: OpenRouter

OpenRouter is no longer the primary provider gateway for ARI.
The `OPENROUTER_API_KEY` env var can be left unset.
If you have an OpenRouter key and want to use it for specific models, you can still set it,
but no ARI agent definitions reference OpenRouter by default.

## Checking Active Providers

```bash
# List all authenticated providers
openclaw models auth list

# Run full diagnostics (includes provider check)
bun scripts/discord-check.ts
```

## Budget

Daily cost limit: `ARI_DAILY_BUDGET_USD` (default `$2.00`).
Fallback model at 95% budget: `claude-haiku-4-5-20251001`.
Budget resets at midnight ET.
