---
name: humanizer
description: Transform AI-generated text into natural, human-sounding writing across 5 modes
version: 1.0.0
tier: community
publisher: ClawHub
tools: []
riskLevel: low
note: >
  Declarative-only skill (SKILL.md + prompt templates).
  No executable scripts, no tools registered, no network access.
  Safe to load as data; no out-of-process sandbox required.
  Audit: 01-inventory ✓ | 02-hash pending | 03-risk: low | 04-value: high
---

# Humanizer Skill

Transforms AI-generated or overly formal text into natural, human-sounding
writing. Five modes for different contexts.

## Modes

| Mode           | Use Case                           | Agent      |
| -------------- | ---------------------------------- | ---------- |
| `casual`       | Discord messages, quick replies    | ARI        |
| `professional` | Business communications, proposals | CHASE      |
| `outreach`     | Cold email sequences               | CHASE      |
| `social`       | Twitter/X content, captions        | NOVA       |
| `persuasive`   | Proposals, pitches, copy           | CHASE/NOVA |

## Usage

Invoke via Discord: pass text + mode to the active agent.

Example: "humanize this in outreach mode: [text]"

## Principles

- Sound like a real person wrote it
- Match the voice and tone of the target mode
- Remove AI tells: hedging, over-explaining, "certainly", "I'd be happy to"
- Keep core message intact — don't change facts or promises
- Respect character limits for the target platform
