/**
 * ARI Execution Mode Policy
 *
 * Determines whether RUNE operates in shared-branch or isolated-worktree mode
 * based on task risk characteristics. Used by ARI orchestrator when spawning RUNE.
 *
 * Section 29.8: First-class contracts for context-bundle + execution-mode.
 */

export type ExecutionMode = "shared-branch" | "isolated-worktree";

export interface ExecutionModePolicy {
  mode: ExecutionMode;
  reason: string;
  riskLevel: "low" | "medium" | "high";
}

export function resolveExecutionMode(task: {
  hasSchemaChanges: boolean;
  hasSecurityChanges: boolean;
  multipleAgentsSameFiles: boolean;
  estimatedComplexity: number;
}): ExecutionModePolicy {
  if (task.hasSchemaChanges || task.hasSecurityChanges || task.multipleAgentsSameFiles) {
    return {
      mode: "isolated-worktree",
      riskLevel: "high",
      reason: task.hasSchemaChanges
        ? "schema changes"
        : task.hasSecurityChanges
          ? "security changes"
          : "multi-agent file overlap",
    };
  }
  if (task.estimatedComplexity > 0.7) {
    return { mode: "isolated-worktree", reason: "high complexity", riskLevel: "medium" };
  }
  return { mode: "shared-branch", reason: "low risk", riskLevel: "low" };
}
