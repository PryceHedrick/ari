# ARI Security & Trust Model

## Trust Tiers (config/skills/tiers.yaml)

| Tier         | Description                      | Executable        |
| ------------ | -------------------------------- | ----------------- |
| `quarantine` | Default. Not reviewed.           | No                |
| `community`  | Known publisher, no shell exec.  | Yes (with policy) |
| `verified`   | Hash pinned + static analysis.   | Yes (with policy) |
| `trusted`    | Verified + 7d soak + sign-off.   | Yes (with policy) |
| `internal`   | Core ARI plugins. Always exempt. | Yes               |

## Marketplace Executable Code — NOT SUPPORTED

**Executable marketplace code requires an out-of-process sandboxed runner that is not yet
implemented.** Any `require("child_process")`, dynamic import, or `eval()` in a skill
would execute before `before_tool_call` fires.

**Current stance**: Allowlist is empty (`config/skills/allowlist.yaml`). No marketplace
skills are enabled in production. Do not add skills to the allowlist without:

1. Running the full 4-stage skill audit (`scripts/skill_audit/`)
2. Receiving explicit operator approval
3. Implementing an out-of-process sandbox runner

## Policy Engine

The policy engine enforces tool-call gates for tools registered via `api.registerTool()`.

Internal ARI tools (prefix `ari_`) are always exempt. This covers all 14 registered
internal plugins.

The `before_tool_call` hook returns `{ block: true, blockReason }` to abort denied calls.

Hash mismatches trigger:

1. `ari:security:skill_hash_mismatch` event on ariBus
2. HTTP POST to `/ari/discord-event` → `security:anomaly_detected` → #systemStatus

## Kill Switch

```
ARI_KILL_ALL=true      Block everything
ARI_KILL_SKILLS=true   Block marketplace tools (internal tools still pass)
ARI_KILL_NETWORK=true  Block outbound network tools
```

These environment variables are checked at call-time (not cached). Setting them and
restarting the gateway activates the kill switch immediately.

## Hash Pinning

For future `verified` and `trusted` tier skills:

- `contentHash` in allowlist entry = SHA-256 of listed source files
- `02-hash-check.ts` verifies on demand
- Mismatch → deny + security alert

## Audit Log

Span events (traces) are stored in `~/.ari/databases/traces.db` (SQLite WAL).
Retention: 30 days by default (configurable in `config/profiles/`).
The redactor scrubs credentials from all summaries before storage.
