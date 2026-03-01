---
name: obsidian-second-brain
description: Obsidian vault integration — capture, index, digest, context packs
version: 1.0.0
tier: internal
publisher: PryceHedrick (first-party)
tools: []
---

# Obsidian Second Brain Skill

Provides prompts and templates for ARI's Obsidian vault integration.
All execution is handled by the `ari-obsidian` first-party plugin (TypeScript).
This SKILL.md serves as spec reference and prompt source only.

## Vault Structure

- `00-System/` — Auto-generated context packs, identity files, templates
- `00-Inbox/` — AI capture queue (auto-populated by ari-obsidian)
- `10-Projects/` — ARI docs, finance playbooks
- `20-Areas/` — Operations, decisions, incidents
- `40-Logs/Daily/` — Daily notes (YYYY-MM-DD.md)
- `50-Logs/Weekly/` — Weekly digests
- `90-Archive/` — Archived fragments

## Auto-Capture Signal Scoring

| Score | Trigger                                 | Action                              |
| ----- | --------------------------------------- | ----------------------------------- |
| 10    | Kill switch / hash mismatch             | Always capture → incident note      |
| 9     | Briefing ready / finance brief          | Always capture → inbox + daily note |
| 8     | Policy deny / tool error                | Always capture → incidents/         |
| 7+    | Long response (>500 chars) / tool calls | Append to daily note                |
| <7    | Normal interaction                      | Skip                                |

## Commands

- `/ari-note <text>` — Manual capture to inbox
- `/ari-vault-status` — Vault stats
- `/ari-vault-search <query>` — Search indexed notes
- `/ari-digest-now [daily|weekly]` — Trigger digest
- `/ari-scan-repo [baseline|deep]` — Document plugins
- `/ari-today` — Today's context briefing
- `/ari-open-loops` — List open loops
- `/ari-next` — Top 5 tasks
- `/ari-rate <trace_id> good|bad [note]` — Feedback
