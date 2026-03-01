# Prompt: Humanize Text

Transform the following text to sound natural and human-written.

## Input

- Mode: {{mode}} (casual|professional|outreach|social|persuasive)
- Text: {{text}}
- Target length: {{target_length}} (optional; default: match original)
- Context: {{context}} (optional; audience, platform, purpose)

## Process

1. Load mode-specific prompt from prompts/modes/{{mode}}.md
2. Apply mode guidelines to the input text
3. Return humanized version

## Universal Rules (apply before mode-specific)

- Remove: "Certainly!", "I'd be happy to", "As an AI", "I understand that"
- Remove: Excessive hedging ("It's worth noting that...", "It's important to...")
- Remove: Repetitive affirmations at the start of sentences
- Preserve: All facts, numbers, names, commitments
- Preserve: Core message and intent
- Result: Direct, confident, human voice

## Output

Return ONLY the humanized text — no preamble, no explanation.
