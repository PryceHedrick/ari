import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Workspace Plugin — Loads workspace context files into every agent.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: inject 5 workspace files into agent context on bootstrap.
 *
 * Workspace files (at ~/.openclaw/workspace/ — OUTSIDE the repo):
 * - SOUL.md       — ARI identity, voice, values, security invariants
 * - USER.md       — Pryce's full context (schedule, businesses, investments)
 * - HEARTBEAT.md  — Proactive monitoring checklist + P-level routing
 * - AGENTS.md     — Multi-agent routing rules
 * - RECOVERY.md   — Disaster recovery protocol
 *
 * Templates in: .openclaw-workspace-templates/ (copy to ~/.openclaw/workspace/)
 *
 * Loading order: SOUL → USER → HEARTBEAT → AGENTS → RECOVERY
 * Each file injected as system context before agent processes any message.
 *
 * Source: src/autonomous/workspace-loader.ts (adapted from ARI v10)
 */
const plugin = {
  id: 'ari-workspace',
  name: 'ARI Workspace',
  description: 'Workspace context loader: SOUL/USER/HEARTBEAT/AGENTS/RECOVERY → agent context',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerHook('agent:bootstrap', loadWorkspaceFiles)
    // Phase 3: api.registerService({ id: 'workspace', start: initWorkspaceLoader })
  },
};

export default plugin;
