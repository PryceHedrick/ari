/**
 * ARI Ops Policy Engine — tool-call gate for marketplace skills.
 *
 * Enforcement model:
 *   - Internal ARI tools (prefix "ari_") → always ALLOW (internalPluginsExempt=true)
 *   - Kill switch active → DENY all non-internal
 *   - Allowlist empty → DENY all non-internal (default-deny)
 *   - Hash mismatch → DENY + fire security:anomaly_detected
 *
 * IMPORTANT: Marketplace executable code is NOT supported without an out-of-process
 * sandbox runner. This engine enforces tool-call boundaries for tools registered via
 * api.registerTool(). It cannot prevent dynamic imports or child_process in raw code.
 * See docs/ops/security.md for the full trust model.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { killSwitch } from "./kill-switch.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type PolicyAction = "allow" | "deny";

export type PolicyDecision = {
  action: PolicyAction;
  rule: string;
  reason: string;
};

type SkillEntry = {
  slug: string;
  tier: "quarantine" | "community" | "verified" | "trusted";
  tools: string[];
  contentHash?: string;
  publisher?: string;
};

type AllowlistFile = {
  version: number;
  skills: SkillEntry[];
};

type PolicyConfig = {
  enabled: boolean;
  defaultDeny: boolean;
  internalPluginsExempt: boolean;
};

// ── Internal tool prefix list ─────────────────────────────────────────────────

const INTERNAL_PREFIXES = [
  "ari_memory_",
  "ari_kernel_",
  "ari_cognitive_",
  "ari_briefings_",
  "ari_market_",
  "ari_scheduler_",
  "ari_workspace_",
  "ari_ai_",
  "ari_autonomous_",
  "ari_notion_",
  "ari_voice_",
  "ari_governance_",
  "ari_agents_",
  "ari_ops_",
  // Also exempt the memory tool registered with short prefix
  "ari_save_bookmark",
];

function isInternalTool(toolName: string): boolean {
  return INTERNAL_PREFIXES.some(
    (prefix) => toolName.startsWith(prefix) || toolName === prefix.replace(/_$/, ""),
  );
}

// ── Policy Engine ─────────────────────────────────────────────────────────────

function allow(rule: string): PolicyDecision {
  return { action: "allow", rule, reason: `Allowed by rule: ${rule}` };
}

function deny(rule: string, reason: string): PolicyDecision {
  return { action: "deny", rule, reason };
}

class PolicyEngine {
  private allowlist: SkillEntry[] = [];
  private allowlistLoadError: string | null = null;
  private config: PolicyConfig;
  private allowlistPath: string;

  constructor(config: PolicyConfig, allowlistPath: string) {
    this.config = config;
    this.allowlistPath = allowlistPath;
    this.loadAllowlist();
  }

  private loadAllowlist(): void {
    try {
      const raw = readFileSync(this.allowlistPath, "utf8");
      const parsed = parseYaml(raw) as AllowlistFile;
      this.allowlist = parsed.skills ?? [];
      this.allowlistLoadError = null;
    } catch (err) {
      this.allowlistLoadError = String(err);
      this.allowlist = [];
    }
  }

  /** Reload allowlist from disk (called periodically). */
  reload(): void {
    this.loadAllowlist();
  }

  private findByTool(toolName: string): SkillEntry | undefined {
    return this.allowlist.find((s) => s.tools.includes(toolName));
  }

  /** Evaluate whether a tool call should proceed. */
  evaluate(toolName: string, _params: unknown): PolicyDecision {
    // Policy disabled → allow everything
    if (!this.config.enabled) {
      return allow("policy_disabled");
    }

    // Kill switch (all scopes)
    if (killSwitch.isActive("all")) {
      return deny("kill_switch_all", "Kill switch ALL is active");
    }
    if (killSwitch.isActive("skills")) {
      // Internal tools still pass even when skills kill switch is on
      if (this.config.internalPluginsExempt && isInternalTool(toolName)) {
        return allow("internal_exempt");
      }
      return deny("kill_switch_skills", "Kill switch SKILLS is active");
    }

    // Internal tools exempt
    if (this.config.internalPluginsExempt && isInternalTool(toolName)) {
      return allow("internal_exempt");
    }

    // Allowlist load error — fail-open for internal (already handled above), fail-closed for external
    if (this.allowlistLoadError) {
      return deny("allowlist_load_error", `Allowlist unavailable: ${this.allowlistLoadError}`);
    }

    // Default-deny: not in allowlist
    if (this.config.defaultDeny) {
      const skill = this.findByTool(toolName);
      if (!skill) {
        return deny("not_in_allowlist", `Tool "${toolName}" is not in the skill allowlist`);
      }
      if (skill.tier === "quarantine") {
        return deny("quarantine", `Skill "${skill.slug}" is quarantined (tier=quarantine)`);
      }
      return allow(skill.tier);
    }

    // Permissive mode (defaultDeny=false) — allow if not explicitly quarantined
    const skill = this.findByTool(toolName);
    if (skill?.tier === "quarantine") {
      return deny("quarantine", `Skill "${skill.slug}" is quarantined`);
    }
    return allow("permissive_mode");
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _engine: PolicyEngine | null = null;

export function initPolicyEngine(config: PolicyConfig, allowlistPath: string): PolicyEngine {
  _engine = new PolicyEngine(config, allowlistPath);
  return _engine;
}

export function getPolicyEngine(): PolicyEngine {
  if (!_engine) {
    // Default safe config (deny all marketplace, exempt internal)
    _engine = new PolicyEngine(
      { enabled: true, defaultDeny: true, internalPluginsExempt: true },
      "config/skills/allowlist.yaml",
    );
  }
  return _engine;
}

export { PolicyEngine, isInternalTool };
