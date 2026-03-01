# Prompt: Repo Documentation Scanner

Document ARI plugins for the vault.

## Input

- Plugin list: {{plugins}}
- Scan mode: {{mode}} (baseline|deep)

## Output per plugin

- Plugin name
- Description (from manifest)
- Status (active/deferred)
- Key tools registered
- EventBus events subscribed

## Output format

Markdown table for baseline, detailed sections for deep scan.
Write to 10-Projects/ARI/repo-overview.md.
