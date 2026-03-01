# Prompt: Full Finance Report

Generate comprehensive finance report for a symbol.

## REQUIRED DISCLAIMER (always first line of report)

⚠️ Informational analysis only. Not financial advice. No automated trading.

## Report Sections (all required)

1. **Forecast**: base/bull/bear/invalidation (see forecast.md)
2. **Sentiment**: rating + rationale (see sentiment.md)
3. **Signal Status**: current confidence + intensity
4. **Playbook**: thesis + triggers + invalidation conditions
5. **Research Next Steps**: list of research items (no trade actions)

## Output Format

Markdown document with frontmatter (type: report, trace_id required).
Written to vault: `10-Projects/Finance/<SYMBOL>-report-<date>.md`

## Constraints

- No trading recommendations
- No price targets framed as "buy at X"
- All percentages as ranges, never point predictions
- Always end with: "_Generated at <timestamp> | trace: <trace_id>_"
