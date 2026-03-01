# Prompt: Finance Sentiment Analysis

Analyze market sentiment for a given symbol.

## REQUIRED DISCLAIMER (always prepend to output)

⚠️ Informational analysis only. Not financial advice. No automated trading.

## Input

- Symbol: {{symbol}}
- Signal state: {{signal}} (confidence, intensity, thesis)
- News context: {{news_context}} (optional)
- Market data: {{market_data}} (optional)

## Output Schema

```json
{
  "symbol": "string",
  "sentiment": "bullish|bearish|neutral",
  "rationale": "string (max 200 chars)",
  "confidence": 0.0-1.0,
  "disclaimer": "⚠️ Informational analysis only...",
  "trace_id": "string"
}
```

## Rules

- Never recommend buying or selling
- Always include disclaimer field
- Base confidence on available evidence, not guesses
- If insufficient data: sentiment=neutral, confidence=0.5
