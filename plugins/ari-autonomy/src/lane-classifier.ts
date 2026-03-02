/**
 * ARI Lane Classifier — maps a cron task (gate + mode) to execution lane.
 *
 * Lanes:
 *   AUTO     — executes immediately when mode is "auto"
 *   APPROVAL — posts Discord card; blocked until Pryce approves
 *   BLOCKED  — never autonomous; operator slash-command only
 *
 * Mode × Gate matrix:
 *   gate=auto          + mode=auto       → AUTO
 *   gate=auto          + mode=supervised → APPROVAL
 *   gate=auto          + mode=paused     → skipped (log only)
 *   gate=approval-req  + any mode        → APPROVAL
 *   gate=operator-only + any mode        → BLOCKED
 */

import type { AutonomyMode } from "./settings-db.js";

export type Lane = "AUTO" | "APPROVAL" | "BLOCKED";

export type GateType = "auto" | "approval-required" | "operator-only";

/**
 * Classify a task into its execution lane based on its gate and the current mode.
 */
export function classifyLane(gate: GateType, mode: AutonomyMode): Lane {
  if (gate === "operator-only") {
    return "BLOCKED";
  }
  if (gate === "approval-required") {
    return "APPROVAL";
  }
  // gate === "auto"
  if (mode === "auto") {
    return "AUTO";
  }
  if (mode === "supervised") {
    return "APPROVAL";
  }
  // mode === "paused" → caller handles skip
  return "AUTO"; // will be gated by mode check in handler
}

/**
 * Returns true if the task should be skipped entirely (paused mode + non-critical task).
 * P0 tasks are never skipped.
 */
export function shouldSkip(mode: AutonomyMode, priority: 0 | 1 | 2 | 3): boolean {
  return mode === "paused" && priority > 0;
}
