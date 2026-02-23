import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Kernel Plugin — Security boundary for all OpenClaw messages.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3 implementation: 42-pattern injection detection + SHA-256 audit chain.
 *
 * Security invariants (IMMUTABLE):
 * 1. All input sanitized before reaching agent
 * 2. Auto-block at risk score >= 0.8
 * 3. SHA-256 hash-chained audit log (append-only)
 * 4. Trust multipliers: SYSTEM 0.5x / HOSTILE 2.0x
 */
const plugin = {
  id: 'ari-kernel',
  name: 'ARI Kernel',
  description: 'Security boundary: 42-pattern injection detection + SHA-256 audit chain',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerHook('before_message', sanitizeAndAudit)
    // Phase 3: api.registerTool({ id: 'ari_sanitize', handler: sanitizeInput })
    // Phase 3: api.registerTool({ id: 'ari_audit_log', handler: logAuditEvent })
    // Phase 3: api.registerService({ id: 'audit-chain', start: initAuditChain })
  },
};

export default plugin;
