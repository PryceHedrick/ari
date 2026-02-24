import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type ToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

type ToolCallResult = {
  block?: boolean;
  blockReason?: string;
};

type GovernanceThreshold = "auto" | "majority" | "supermajority";

type GovernanceDecision = {
  threshold: GovernanceThreshold;
  approved: boolean;
  requiresManualApproval: boolean;
  reason: string;
};

const MAJORITY_PATTERNS = [/publish/i, /outreach/i, /send/i, /post/i];
const SUPERMAJORITY_PATTERNS = [/delete/i, /drop/i, /wipe/i, /reset/i, /transfer/i];

function resolveThreshold(toolName: string): GovernanceThreshold {
  if (SUPERMAJORITY_PATTERNS.some((pattern) => pattern.test(toolName))) {
    return "supermajority";
  }
  if (MAJORITY_PATTERNS.some((pattern) => pattern.test(toolName))) {
    return "majority";
  }
  return "auto";
}

function isExplicitlyApproved(params: Record<string, unknown>): boolean {
  return params.approved === true || params.manualApproval === true;
}

function hasSupermajorityMarker(params: Record<string, unknown>): boolean {
  const vote = typeof params.governanceVote === "string" ? params.governanceVote.toLowerCase() : "";
  return vote === "supermajority" || vote === "11/15+";
}

export function evaluateToolCallGovernance(event: ToolCallEvent): GovernanceDecision {
  const threshold = resolveThreshold(event.toolName);
  if (threshold === "auto") {
    return {
      threshold,
      approved: true,
      requiresManualApproval: false,
      reason: "Low-risk action auto-permitted by governance policy.",
    };
  }

  if (!isExplicitlyApproved(event.params)) {
    return {
      threshold,
      approved: false,
      requiresManualApproval: true,
      reason: `Action "${event.toolName}" requires explicit approval before execution.`,
    };
  }

  if (threshold === "supermajority" && !hasSupermajorityMarker(event.params)) {
    return {
      threshold,
      approved: false,
      requiresManualApproval: true,
      reason: `Action "${event.toolName}" requires supermajority council vote marker.`,
    };
  }

  return {
    threshold,
    approved: true,
    requiresManualApproval: true,
    reason: `Action "${event.toolName}" approved through ${threshold} governance gate.`,
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
