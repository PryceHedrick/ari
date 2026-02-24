import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerKernelGuards } from "./src/sanitizer.js";

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
  id: "ari-kernel",
  name: "ARI Kernel",
  description: "Security boundary: 42-pattern injection detection + SHA-256 audit chain",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    registerKernelGuards(api);
  },
};

export default plugin;
