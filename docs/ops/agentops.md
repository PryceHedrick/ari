# ARI AgentOps Command Center

Daily commands and workflows for operating ARI via Discord.

## Daily Checks

```
/ari-system          → Quick green-board check (gateway, plugins, traces)
/ari-doctor          → Full health report (providers, env, kill switch)
/ari-recent 10       → Last 10 spans across all agents
/ari-recent 20 ARI   → Last 20 spans for ARI specifically
```

## Investigation Workflow

When something looks off:

1. `/ari-recent 20` — find the suspicious span
2. Copy the trace ID from the output
3. `/ari-trace <trace-id>` — get full timeline for that interaction
4. Check for `policy_decision` spans with `policyAction=deny`
5. `/ari-doctor` to confirm provider/env state

## Routing Verification

```
/ari-routing         → Show all 14 routing rules from config/routing.yaml
```

## Debug Mode

Enable detailed span output temporarily:

```
/ari-obs-debug on
... reproduce the issue ...
/ari-obs-debug off
```

## Kill Switch

Via environment variables (requires process restart or env reload):

```bash
ARI_KILL_SKILLS=true    # Block all marketplace tool calls
ARI_KILL_NETWORK=true   # Block outbound network tool calls
ARI_KILL_ALL=true       # Block everything
```

Via CLI when gateway is running: use `/ari-doctor` to confirm kill switch state.

## CLI Tools

```bash
# Validate SSOT configs (run before deploy)
pnpm ari:config:check

# Full doctor report with gateway probe
pnpm ari:doctor --gateway

# Recent traces
pnpm ari:traces
pnpm ari:traces --n 50 --agent ARI
pnpm ari:traces --trace <trace-id>

# Rollback allowlist snapshot
pnpm ari:rollback              # save snapshot
pnpm ari:rollback list         # list snapshots
pnpm ari:rollback restore <ts> # restore a snapshot
```

## Skill Audit Pipeline

Run sequentially when evaluating a new marketplace skill:

```bash
node --import tsx scripts/skill_audit/01-inventory.ts      # what's installed
node --import tsx scripts/skill_audit/02-hash-check.ts     # verify hashes
node --import tsx scripts/skill_audit/03-risk-score.ts     # static analysis
node --import tsx scripts/skill_audit/04-value-score.ts    # value/cost model
```

Results: `data/clawshub_risk_report.json`, `data/skill_roadmap.json`
