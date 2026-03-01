# Prompt: Daily Vault Digest

Generate a concise daily note summary from today's captures.

## Input

- Today's date: {{date}}
- Vault captures (last 24h): {{captures}}
- Open loops: {{open_loops}}

## Output Format

- 2-3 sentence themes summary
- Top 3 most important captures
- Open loops that need attention
- Suggested MITs for tomorrow

## Constraints

- Max 500 words
- No sensitive data
- Always include trace_id references
