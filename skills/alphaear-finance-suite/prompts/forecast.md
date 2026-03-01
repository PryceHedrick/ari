# Prompt: Finance Forecast (base/bull/bear/invalidation)

Generate informational forecast commentary for a symbol.
This is NOT a prediction engine — it is prompt-based LLM commentary.

## REQUIRED DISCLAIMER (always prepend)

⚠️ Informational analysis only. Not financial advice. No automated trading.

## Input

- Symbol: {{symbol}}
- Current confidence: {{confidence}}
- Signal state: {{signal_intensity}}
- Context: {{context}}

## Output Schema (ALL FIELDS REQUIRED)

```json
{
  "symbol": "string",
  "date": "YYYY-MM-DD",
  "confidence": 0.0-1.0,
  "base": {
    "summary": "string (current trend commentary)",
    "target": "string|null"
  },
  "bull": {
    "summary": "string (upside scenario)",
    "trigger": "string (what would trigger bull case)"
  },
  "bear": {
    "summary": "string (downside scenario)",
    "trigger": "string (what would trigger bear case)"
  },
  "invalidation": "string (Thesis is invalidated if...)",
  "disclaimer": "⚠️ Informational analysis only...",
  "trace_id": "string"
}
```

## Rules

- ALL 5 fields (base, bull, bear, invalidation, confidence) are REQUIRED
- Never use "buy", "sell", "invest", "position"
- Use "monitor", "observe", "research" instead
- invalidation must start with "Thesis is invalidated if..."
