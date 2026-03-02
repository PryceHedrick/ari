/**
 * ARI Kernel Sanitizer — 63-pattern injection detection across 27 categories.
 *
 * Ported from src/kernel/sanitizer-patterns.ts (legacy ARI codebase).
 *
 * Risk score: sum(severityWeights) × trustMultiplier
 * Auto-block at risk ≥ 0.8 (Security Invariant #2)
 *
 * Severity → base weight:
 *   critical → 0.50
 *   high     → 0.30
 *   medium   → 0.15
 *   low      → 0.05
 *
 * Trust multipliers (Security Invariant #5):
 *   SYSTEM    → 0.5x   (internal ARI operations)
 *   OPERATOR  → 0.6x   (Pryce, Claude Code)
 *   VERIFIED  → 0.75x  (authenticated external)
 *   STANDARD  → 1.0x   (normal requests)
 *   UNTRUSTED → 1.5x   (unknown sources)
 *   HOSTILE   → 2.0x   (detected threats)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export type TrustLevel = "SYSTEM" | "OPERATOR" | "VERIFIED" | "STANDARD" | "UNTRUSTED" | "HOSTILE";
export type Severity = "critical" | "high" | "medium" | "low";

export type InjectionPattern = {
  id: string;
  category: string;
  pattern: RegExp;
  severity: Severity;
  description: string;
};

// Severity → base risk weight
const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 0.5,
  high: 0.3,
  medium: 0.15,
  low: 0.05,
};

// Trust level → risk multiplier
const TRUST_MULTIPLIERS: Record<TrustLevel, number> = {
  SYSTEM: 0.5,
  OPERATOR: 0.6,
  VERIFIED: 0.75,
  STANDARD: 1.0,
  UNTRUSTED: 1.5,
  HOSTILE: 2.0,
};

const AUTO_BLOCK_THRESHOLD = 0.8;

// === 63 INJECTION PATTERNS ACROSS 27 CATEGORIES ===

export const INJECTION_PATTERNS: InjectionPattern[] = [
  // Direct Override (1-3)
  {
    id: "DO-001",
    category: "direct_override",
    severity: "critical",
    pattern: /ignore\s+(all\s+)?(previous|prior|above)/i,
    description: "Attempt to ignore previous instructions",
  },
  {
    id: "DO-002",
    category: "direct_override",
    severity: "critical",
    pattern: /disregard\s+(all\s+)?(previous|prior|above)/i,
    description: "Attempt to disregard previous instructions",
  },
  {
    id: "DO-003",
    category: "direct_override",
    severity: "critical",
    pattern: /forget\s+(all\s+)?(previous|prior|above)/i,
    description: "Attempt to forget previous instructions",
  },

  // Role Manipulation (4-7)
  {
    id: "RM-001",
    category: "role_manipulation",
    severity: "high",
    pattern: /you\s+are\s+now/i,
    description: "Attempt to redefine agent role",
  },
  {
    id: "RM-002",
    category: "role_manipulation",
    severity: "high",
    pattern: /act\s+as\s+(a\s+)?/i,
    description: "Attempt to change agent behavior",
  },
  {
    id: "RM-003",
    category: "role_manipulation",
    severity: "high",
    pattern: /pretend\s+(to\s+be|you'?re)/i,
    description: "Attempt to impersonate another entity",
  },
  {
    id: "RM-004",
    category: "role_manipulation",
    severity: "high",
    pattern: /new\s+identity/i,
    description: "Attempt to assign new identity",
  },

  // Command Injection (8-11)
  {
    id: "CI-001",
    category: "command",
    severity: "critical",
    pattern: /\$\(.*\)/,
    description: "Shell command substitution detected",
  },
  {
    id: "CI-002",
    category: "command",
    severity: "critical",
    pattern: /`[^`]+`/,
    description: "Backtick command execution detected",
  },
  {
    id: "CI-003",
    category: "command",
    severity: "critical",
    pattern: /;\s*(rm|cat|curl|wget|eval|exec)\b/i,
    description: "Chained shell command detected",
  },
  {
    id: "CI-004",
    category: "command",
    severity: "critical",
    pattern: /\|\s*(bash|sh|zsh)\b/i,
    description: "Pipe to shell interpreter detected",
  },

  // Prompt Extraction (12-14)
  {
    id: "PE-001",
    category: "prompt_extraction",
    severity: "medium",
    pattern: /reveal\s+(your|the)\s+(system\s+)?prompt/i,
    description: "Attempt to reveal system prompt",
  },
  {
    id: "PE-002",
    category: "prompt_extraction",
    severity: "medium",
    pattern:
      /(show|print|display|output|dump)\s+(your|the)\s+(system\s+)?(instructions|prompt|rules)/i,
    description: "Attempt to extract system instructions",
  },
  {
    id: "PE-003",
    category: "prompt_extraction",
    severity: "medium",
    pattern: /what\s+are\s+your\s+(instructions|rules)/i,
    description: "Attempt to extract system rules",
  },

  // Authority Claims (15-17)
  {
    id: "AC-001",
    category: "authority_claim",
    severity: "high",
    pattern: /as\s+(your|the)\s+(creator|developer|admin)/i,
    description: "False authority claim detected",
  },
  {
    id: "AC-002",
    category: "authority_claim",
    severity: "high",
    pattern: /i\s+(have|got)\s+(admin|root|sudo)/i,
    description: "Unauthorized privilege claim detected",
  },
  {
    id: "AC-003",
    category: "authority_claim",
    severity: "high",
    pattern: /override\s+(code|authority)/i,
    description: "Attempt to override system authority",
  },

  // Data Exfiltration (18-21)
  {
    id: "DE-001",
    category: "data_exfiltration",
    severity: "high",
    pattern: /send\s+(this|that|it|data|info)\s+to/i,
    description: "Attempt to send data externally",
  },
  {
    id: "DE-002",
    category: "data_exfiltration",
    severity: "high",
    pattern: /forward\s+(all|this|everything)\s+to/i,
    description: "Attempt to forward data externally",
  },
  {
    id: "DE-003",
    category: "data_exfiltration",
    severity: "high",
    pattern: /upload\s+(to|data)/i,
    description: "Attempt to upload data externally",
  },
  {
    id: "DE-004",
    category: "data_exfiltration",
    severity: "critical",
    pattern: /exfiltrate/i,
    description: "Explicit data exfiltration attempt",
  },

  // SSRF (22-23)
  {
    id: "SSRF-001",
    category: "ssrf",
    severity: "critical",
    pattern: /file:\/\//i,
    description: "File protocol SSRF attempt",
  },
  {
    id: "SSRF-002",
    category: "ssrf",
    severity: "critical",
    pattern: /gopher:\/\/|dict:\/\//i,
    description: "Dangerous protocol SSRF attempt",
  },

  // Path Traversal (24-25)
  {
    id: "PT-001",
    category: "path",
    severity: "high",
    pattern: /\.\.%2[fF]|\.\.%5[cC]/i,
    description: "URL-encoded path traversal detected",
  },
  {
    id: "PT-002",
    category: "path",
    severity: "high",
    pattern: /\.\.[/\\]/,
    description: "Directory traversal sequence detected",
  },

  // Null Byte (26)
  {
    id: "NB-001",
    category: "null_byte",
    severity: "high",
    pattern: /%00|\\x00/i,
    description: "Null byte injection detected",
  },

  // XML Injection (27)
  {
    id: "XML-001",
    category: "xml",
    severity: "high",
    pattern: /<!\[CDATA\[|<!ENTITY|<!DOCTYPE\s+\w+\s+SYSTEM/i,
    description: "XML entity/CDATA injection detected",
  },

  // Jailbreak (28-30)
  {
    id: "JB-001",
    category: "jailbreak",
    severity: "critical",
    pattern: /\bDAN\s+mode\b/i,
    description: "DAN jailbreak attempt detected",
  },
  {
    id: "JB-002",
    category: "jailbreak",
    severity: "critical",
    pattern: /\b(developer|god|admin|debug)\s+mode\s+(enabled|activated|on)\b/i,
    description: "Privilege escalation jailbreak detected",
  },
  {
    id: "JB-003",
    category: "jailbreak",
    severity: "critical",
    pattern: /\bjailbreak(ed)?\b/i,
    description: "Explicit jailbreak keyword detected",
  },

  // XSS / Tag Injection (31-32)
  {
    id: "XSS-001",
    category: "xss",
    severity: "high",
    pattern: /<\s*(system|script|iframe|object|embed|form|input|meta|link|base)\b/i,
    description: "Dangerous HTML/XML tag injection detected",
  },
  {
    id: "XSS-002",
    category: "xss",
    severity: "high",
    pattern: /on(load|error|click|mouseover|focus|blur|submit)\s*=/i,
    description: "HTML event handler injection detected",
  },

  // Script Injection (33-35)
  {
    id: "SI-001",
    category: "script",
    severity: "critical",
    pattern: /\beval\s*\(/i,
    description: "JavaScript eval injection detected",
  },
  {
    id: "SI-002",
    category: "script",
    severity: "high",
    pattern: /\b(atob|btoa)\s*\(/i,
    description: "Base64 encoding/decoding function detected",
  },
  {
    id: "SI-003",
    category: "script",
    severity: "critical",
    pattern: /javascript\s*:/i,
    description: "JavaScript protocol injection detected",
  },

  // SQL Injection (36-39)
  {
    id: "SQL-001",
    category: "sql",
    severity: "critical",
    pattern: /'\s*(OR|AND)\s+('|1\s*=\s*1|true)/i,
    description: "SQL boolean injection detected",
  },
  {
    id: "SQL-002",
    category: "sql",
    severity: "critical",
    pattern: /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)\s/i,
    description: "SQL command injection detected",
  },
  {
    id: "SQL-003",
    category: "sql",
    severity: "critical",
    pattern: /UNION\s+(ALL\s+)?SELECT/i,
    description: "SQL UNION injection detected",
  },
  {
    id: "SQL-004",
    category: "sql",
    severity: "medium",
    pattern: /--\s*$/m,
    description: "SQL comment terminator detected",
  },

  // Unicode Homograph (40-41)
  {
    id: "UH-001",
    category: "unicode_homograph",
    severity: "high",
    pattern: /[\u0430\u0435\u043E\u0440\u0441\u0443\u0445]/,
    description: "Cyrillic homograph character detected (visual spoofing)",
  },
  {
    id: "UH-002",
    category: "unicode_homograph",
    severity: "medium",
    pattern: /\u200B|\u200C|\u200D|\u2060|\uFEFF/,
    description: "Zero-width character detected (invisible text injection)",
  },

  // Encoded Payload (42)
  {
    id: "B64-001",
    category: "encoded_payload",
    severity: "high",
    pattern: /Buffer\.from\s*\([^)]*,\s*['"]base64['"]/i,
    description: "Base64 Buffer decode detected (encoded payload)",
  },

  // CRLF Injection (43-44)
  {
    id: "CRLF-001",
    category: "crlf",
    severity: "high",
    pattern: /%0[dD]%0[aA]/,
    description: "URL-encoded CRLF injection detected",
  },
  {
    id: "CRLF-002",
    category: "crlf",
    severity: "high",
    pattern: /\r\n\r\n/,
    description: "Raw CRLF double newline injection (HTTP response splitting)",
  },

  // LDAP Injection (45-46)
  {
    id: "LDAP-001",
    category: "ldap",
    severity: "high",
    pattern: /\)\(cn=\*|\*\(\|?\(&/,
    description: "LDAP filter injection detected",
  },
  {
    id: "LDAP-002",
    category: "ldap",
    severity: "high",
    pattern: /\)\(\|/,
    description: "LDAP OR filter injection detected",
  },

  // XXE (47-48)
  {
    id: "XXE-001",
    category: "xxe",
    severity: "critical",
    pattern: /<!DOCTYPE\s+\w+\s*\[/i,
    description: "DOCTYPE with internal subset (XXE vector)",
  },
  {
    id: "XXE-002",
    category: "xxe",
    severity: "critical",
    pattern: /SYSTEM\s+["']file:\/\//i,
    description: "XXE file:// entity reference detected",
  },

  // Server-Side Template Injection (49-50)
  {
    id: "SSTI-001",
    category: "template",
    severity: "critical",
    pattern: /\{\{constructor\.constructor/,
    description: "Template prototype chain access (SSTI)",
  },
  {
    id: "SSTI-002",
    category: "template",
    severity: "high",
    pattern: /\{%\s*(import|include|extends)\b/i,
    description: "Jinja/Twig template directive injection",
  },

  // NoSQL Injection (51-52)
  {
    id: "NOSQL-001",
    category: "nosql",
    severity: "critical",
    pattern: /\{\s*"\$gt"\s*:/,
    description: "NoSQL $gt operator injection detected",
  },
  {
    id: "NOSQL-002",
    category: "nosql",
    severity: "critical",
    pattern: /\{\s*"\$(ne|regex|where|exists)"\s*:/,
    description: "NoSQL query operator injection detected",
  },

  // Prototype Pollution (53-54)
  {
    id: "PROTO-001",
    category: "proto",
    severity: "critical",
    pattern: /__proto__/,
    description: "Prototype pollution via __proto__ detected",
  },
  {
    id: "PROTO-002",
    category: "proto",
    severity: "critical",
    pattern: /constructor\s*\[\s*['"]prototype['"]\s*\]/,
    description: "Prototype pollution via constructor.prototype detected",
  },

  // Log Injection (55)
  {
    id: "LOG-001",
    category: "log_injection",
    severity: "medium",
    pattern: /\n\s*\[?(INFO|WARN|ERROR|DEBUG|FATAL)\]?\s/i,
    description: "Log injection via embedded log-level prefix",
  },

  // Deserialization (56)
  {
    id: "DESER-001",
    category: "deserialization",
    severity: "critical",
    pattern: /rO0ABX|aced0005/i,
    description: "Java serialized object magic bytes detected",
  },

  // GraphQL Introspection (57-58)
  {
    id: "GQL-001",
    category: "graphql",
    severity: "medium",
    pattern: /__schema\s*\{/,
    description: "GraphQL introspection query detected",
  },
  {
    id: "GQL-002",
    category: "graphql",
    severity: "medium",
    pattern: /__type\s*\(/,
    description: "GraphQL type introspection detected",
  },

  // JWT Manipulation (59-60)
  {
    id: "JWT-001",
    category: "jwt",
    severity: "critical",
    pattern: /["']alg["']\s*:\s*["']none["']/i,
    description: 'JWT algorithm "none" attack detected',
  },
  {
    id: "JWT-002",
    category: "jwt",
    severity: "critical",
    pattern: /eyJhbGciOiJub25lIi/,
    description: "Base64-encoded JWT with alg:none detected",
  },

  // Prompt Injection (61-63)
  {
    id: "PI-001",
    category: "prompt",
    severity: "critical",
    pattern: /system\s+prompt\s*:/i,
    description: "Attempt to inject system prompt directive",
  },
  {
    id: "PI-002",
    category: "prompt",
    severity: "critical",
    pattern: /new\s+instructions?\s*:/i,
    description: "Attempt to inject new instructions",
  },
  {
    id: "PI-003",
    category: "prompt",
    severity: "critical",
    pattern: /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/i,
    description: "Chat template delimiter injection detected",
  },
];

// === RISK ASSESSMENT ===

export type PromptRiskAssessment = {
  score: number; // 0-1, block at ≥ 0.8
  flags: string[]; // Pattern IDs that fired
  blocked: boolean;
};

/**
 * Sanitize prompt text: remove unsafe control characters.
 */
export function sanitizePromptText(input: string): string {
  const chars: string[] = [];
  for (const char of input) {
    const code = char.charCodeAt(0);
    const isUnsafeControl =
      code === 0 ||
      (code >= 1 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31);
    chars.push(isUnsafeControl ? " " : char);
  }
  return chars.join("").replace(/\s+/g, " ").trim();
}

/**
 * Assess risk score: sum of matched severity weights × trust multiplier.
 * Capped at 1.0.
 */
export function assessPromptRisk(
  input: string,
  trustLevel: TrustLevel = "STANDARD",
): PromptRiskAssessment {
  let rawScore = 0;
  const flags: string[] = [];

  for (const candidate of INJECTION_PATTERNS) {
    if (candidate.pattern.test(input)) {
      rawScore += SEVERITY_WEIGHTS[candidate.severity];
      flags.push(candidate.id);
    }
  }

  const multiplier = TRUST_MULTIPLIERS[trustLevel];
  const score = Math.min(1, Number((rawScore * multiplier).toFixed(3)));

  return { score, flags, blocked: score >= AUTO_BLOCK_THRESHOLD };
}

// === BUILD-PLANE (RUNE) TOOL RESTRICTION ===
// RUNE operates in the engineering isolation plane and must not access
// business/financial tools. Enforced here as a defense-in-depth layer.

const BUILD_PLANE_BLOCKED_TOOLS = new Set([
  "ari_finance_market_brief",
  "ari_finance_watchlist_add",
  "ari_finance_watchlist_remove",
  "ari_finance_watchlist_list",
  "ari_finance_ticker_detail",
  "ari_finance_sentiment",
  "ari_finance_forecast",
  "ari_finance_report",
  "ari_finance_signal_update",
  "ari_finance_news_fetch",
  "ari_obsidian_capture",
  "ari_obsidian_digest_daily",
  "ari_obsidian_digest_weekly",
  "ari_autonomy_mode",
  "ari_autonomy_approvals",
]);

// === HIGH-RISK TOOL GATE ===

const HIGH_RISK_TOOLS = new Set([
  "exec",
  "execute_command",
  "run_terminal_cmd",
  "shell",
  "git_push",
  "webhook_send",
  "email_send",
  "discord_send",
]);

const HIGH_RISK_MARKERS = ["rm -rf", "curl ", "wget ", "chmod 777", "DROP TABLE", "sudo "];

type ToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

type ToolCallResult = { block?: boolean; blockReason?: string };

export function shouldBlockToolCall(event: ToolCallEvent): { block: boolean; reason?: string } {
  const toolName = event.toolName.trim().toLowerCase();
  if (!HIGH_RISK_TOOLS.has(toolName)) {
    return { block: false };
  }

  let params: string;
  try {
    params = JSON.stringify(event.params).toLowerCase();
  } catch {
    params = "";
  }

  const marker = HIGH_RISK_MARKERS.find((m) => params.includes(m.toLowerCase()));
  if (marker) {
    return {
      block: true,
      reason: `ARI Kernel blocked high-risk tool call (${toolName}) containing marker "${marker}"`,
    };
  }
  return { block: false };
}

// === OPENCLAW PLUGIN REGISTRATION ===

export function registerKernelGuards(api: OpenClawPluginApi): void {
  api.on("before_prompt_build", (event) => {
    const raw =
      typeof (event as Record<string, unknown>).prompt === "string"
        ? ((event as Record<string, unknown>).prompt as string)
        : "";
    const trust = (
      typeof (event as Record<string, unknown>).trustLevel === "string"
        ? (event as Record<string, unknown>).trustLevel
        : "STANDARD"
    ) as TrustLevel;

    const prompt = sanitizePromptText(raw);
    const risk = assessPromptRisk(prompt, trust);

    if (!risk.blocked) {
      return undefined;
    }

    // Security invariant: auto-block at risk >= 0.8 — refuse entirely, do NOT prepend warning
    return {
      block: true,
      blockReason: [
        "[ARI-KERNEL-SECURITY] Prompt blocked.",
        `Risk score: ${risk.score} (threshold ${AUTO_BLOCK_THRESHOLD})`,
        `Patterns: ${risk.flags.join(", ")}`,
        "Refusing policy bypass and irreversible actions without explicit governance approval.",
      ].join(" "),
    };
  });

  api.on("before_tool_call", (event): ToolCallResult | undefined => {
    // BUILD-plane isolation: RUNE must not call business/financial tools
    const agentName =
      typeof (event as Record<string, unknown>).agentName === "string"
        ? ((event as Record<string, unknown>).agentName as string)
        : undefined;
    if (agentName === "RUNE") {
      const toolName = (event as ToolCallEvent).toolName.trim().toLowerCase();
      if (BUILD_PLANE_BLOCKED_TOOLS.has(toolName)) {
        return {
          block: true,
          blockReason: `[ARI-KERNEL-SECURITY] BUILD-plane agent RUNE blocked from business tool: ${toolName}`,
        };
      }
    }

    const verdict = shouldBlockToolCall(event as ToolCallEvent);
    if (!verdict.block) {
      return undefined;
    }
    return { block: true, blockReason: verdict.reason };
  });
}
