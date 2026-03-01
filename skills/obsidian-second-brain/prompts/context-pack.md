# Prompt: Context Pack Generation

Generate CONTEXT_PACK.md from vault state and identity files.

## Input

- Identity: {{identity}}
- Ruts: {{ruts}}
- Calendar Intent: {{calendar_intent}}
- Active projects: {{active_projects}}
- Open loops: {{open_loops}}
- Recent captures: {{recent_captures}}

## Output

Concise context pack for agent consumption:

1. Today's focus (from calendar intent)
2. Active projects (name + status)
3. Open loops (title + age)
4. Known ruts to avoid
5. Recent high-signal captures

## Constraints

- Max 800 chars total
- Plain language, no jargon
- Always include date stamp
