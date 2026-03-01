# Prompt: Signal State Machine

Track conviction state transitions for a symbol thesis.

## State Machine

```
neutral ←→ strengthened ←→ weakened → falsified
```

## Event Types

- created: initial signal creation
- strengthened: new evidence supports thesis (confidence +)
- weakened: counter-evidence reduces confidence (confidence -)
- falsified: thesis definitively disproven (confidence → 0)
- unchanged: signal reviewed, no change
- note: informational note added

## Append-Only Log

Every transition appends to signal_events with:

- signal_id, event_type, delta_json, trace_id, ts

## Rules

- History is NEVER deleted
- falsified is terminal — cannot be re-strengthened
- Always include trace_id from current span
- confidence range: 0.0 (falsified) to 1.0 (high conviction)
