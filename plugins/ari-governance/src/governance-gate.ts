import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type ToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

type ToolCallResult = {
  block?: boolean;
  blockReason?: string;
};

/**
 * ARI 3-Gate Governance Model
 *
 * Gate 1 — auto:             Low-risk, internal, reversible. ARI approves with trace record.
 * Gate 2 — approval-required: Public-facing, external comms, content. Pryce approves via Discord ✅/❌.
 * Gate 3 — operator-only:    Irreversible, high-stakes. Pryce must issue explicit slash command.
 *
 * ZERO bypass permitted. No exceptions. Pryce = CEO. All gates report to him.
 */
type GovernanceGate = "auto" | "approval-required" | "operator-only";

type GovernanceDecision = {
  gate: GovernanceGate;
  approved: boolean;
  requiresHumanAction: boolean;
  reason: string;
};

// Gate 2: requires Pryce's Discord approval button
const APPROVAL_REQUIRED_PATTERNS = [
  /publish/i,
  /outreach/i,
  /send/i,
  /post/i,
  /upload/i,
  /schedule/i,
  /queue.*video/i,
  /queue.*content/i,
];

// Gate 3: requires explicit slash command from Pryce
const OPERATOR_ONLY_PATTERNS = [
  /delete/i,
  /drop/i,
  /wipe/i,
  /reset/i,
  /transfer/i,
  /force/i,
  /irreversible/i,
  /purge/i,
  /remove.*all/i,
];

function resolveGate(toolName: string): GovernanceGate {
  if (OPERATOR_ONLY_PATTERNS.some((pattern) => pattern.test(toolName))) {
    return "operator-only";
  }
  if (APPROVAL_REQUIRED_PATTERNS.some((pattern) => pattern.test(toolName))) {
    return "approval-required";
  }
  return "auto";
}

/**
 * Check if action carries explicit Pryce approval from Discord.
 * approval-required gate: params.approved=true OR params.discordApproval=true
 * ZERO bypass permitted — only these two fields are accepted.
 */
function hasPryceApproval(params: Record<string, unknown>): boolean {
  return params.approved === true || params.discordApproval === true;
}

/**
 * Check if action carries operator-only authorization.
 * operator-only gate: must have params.operatorCommand=true (set by slash command handler)
 */
function hasOperatorAuthorization(params: Record<string, unknown>): boolean {
  return params.operatorCommand === true || params.slash_command === true;
}

export function evaluateToolCallGovernance(event: ToolCallEvent): GovernanceDecision {
  const gate = resolveGate(event.toolName);

  if (gate === "auto") {
    return {
      gate,
      approved: true,
      requiresHumanAction: false,
      reason: "Low-risk action auto-approved. ARI logs with trace record.",
    };
  }

  if (gate === "approval-required") {
    if (!hasPryceApproval(event.params)) {
      return {
        gate,
        approved: false,
        requiresHumanAction: true,
        reason: `"${event.toolName}" requires Pryce's approval. Post to Discord approval queue — await ✅/❌ button response.`,
      };
    }
    return {
      gate,
      approved: true,
      requiresHumanAction: true,
      reason: `"${event.toolName}" approved by Pryce via Discord.`,
    };
  }

  // operator-only gate
  if (!hasOperatorAuthorization(event.params)) {
    return {
      gate,
      approved: false,
      requiresHumanAction: true,
      reason: `"${event.toolName}" is an operator-only action. Pryce must issue explicit slash command. No automatic approval path exists.`,
    };
  }

  if (!hasPryceApproval(event.params)) {
    return {
      gate,
      approved: false,
      requiresHumanAction: true,
      reason: `"${event.toolName}" requires both operator authorization AND Pryce's explicit approval.`,
    };
  }

  return {
    gate,
    approved: true,
    requiresHumanAction: true,
    reason: `"${event.toolName}" operator-only action authorized by Pryce.`,
  };
}

export function registerGovernanceGate(api: OpenClawPluginApi): void {
  api.on("before_tool_call", (event): ToolCallResult | undefined => {
    const decision = evaluateToolCallGovernance(event as ToolCallEvent);
    if (decision.approved) {
      return undefined;
    }
    return {
      block: true,
      blockReason: decision.reason,
    };
  });
}
