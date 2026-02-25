import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { registerKernelGuards } from "./src/sanitizer.js";

/**
 * ARI Kernel Plugin — Security boundary for all OpenClaw messages.
 *
 * 63-pattern injection detection + SHA-256 audit chain.
 *
 * Security invariants (IMMUTABLE):
 * 1. All input sanitized before reaching agent
 * 2. Auto-block at risk score >= 0.8
 * 3. SHA-256 hash-chained audit log (append-only)
 * 4. Trust multipliers: SYSTEM 0.5x / HOSTILE 2.0x
 * 5. API keys must be sk_or_* (OpenRouter) or sk-ant-* (Anthropic API only)
 *    Subscription OAuth tokens are PROHIBITED per Anthropic ToS Section 3.7
 */

/**
 * Validate API key format per Section 12.1.
 * sk_or_* = OpenRouter (valid), sk-ant-* = Anthropic direct (valid), other = INVALID
 */
export function validateApiKeyFormat(key: string): "openrouter" | "anthropic" | "invalid" {
  if (key.startsWith("sk_or_")) {
    return "openrouter";
  }
  if (key.startsWith("sk-ant-")) {
    return "anthropic";
  }
  return "invalid";
}

const plugin = {
  id: "ari-kernel",
  name: "ARI Kernel",
  description:
    "Security boundary: 63-pattern injection detection (27 categories) + SHA-256 audit chain",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // Section 12.1: Validate API key format at startup
    const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      const keyType = validateApiKeyFormat(apiKey);
      if (keyType === "invalid") {
        const msg =
          "[ARI-KERNEL] STARTUP HALT: API key format invalid. " +
          "Subscription OAuth tokens are PROHIBITED (Anthropic ToS Section 3.7, enforced Feb 2026). " +
          "Use OPENROUTER_API_KEY (sk_or_*) or ANTHROPIC_API_KEY (sk-ant-*) only.";
        api.emit?.("ari:kernel:api-key-invalid", { message: msg });
        throw new Error(msg);
      }
    }

    registerKernelGuards(api);
  },
};

export default plugin;
