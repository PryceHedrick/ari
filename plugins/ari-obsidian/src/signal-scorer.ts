/**
 * ARI Obsidian Signal Scorer — rule-based 0-10 scoring for auto-capture.
 */

const DECISION_KEYWORDS = [
  "decided",
  "will use",
  "choosing",
  "selected",
  "going with",
  "plan to",
  "action item",
  "next step",
  "follow up",
];
const TASK_KEYWORDS = [
  "todo",
  "TODO",
  "action item",
  "next step",
  "follow up",
  "i should",
  "we need",
  "need to",
  "must",
  "have to",
];

export interface ScoredEvent {
  score: number;
  alwaysCapture: boolean;
  reason: string;
  signalType: string;
}

export interface ScoreInput {
  eventType: string;
  channel?: string;
  responseLength?: number;
  hasToolCalls?: boolean;
  hasError?: boolean;
  isPolicyDeny?: boolean;
  isBriefingReady?: boolean;
  isMarketAlert?: boolean;
  isKillSwitch?: boolean;
  isHashMismatch?: boolean;
  priority?: number;
}

// Low-signal channels — reduce score
const LOW_SIGNAL_CHANNELS = new Set(["apiLogs", "systemStatus"]);

export function scoreEvent(input: ScoreInput): ScoredEvent {
  let score = 0;
  let alwaysCapture = false;
  let reason = "default";
  let signalType = input.eventType;

  // Always-capture events
  if (input.isPolicyDeny) {
    return { score: 8, alwaysCapture: true, reason: "policy_deny", signalType: "incident" };
  }
  if (input.hasError) {
    return { score: 8, alwaysCapture: true, reason: "tool_error", signalType: "incident" };
  }
  if (input.isKillSwitch) {
    return { score: 10, alwaysCapture: true, reason: "kill_switch", signalType: "incident" };
  }
  if (input.isHashMismatch) {
    return { score: 10, alwaysCapture: true, reason: "hash_mismatch", signalType: "incident" };
  }
  if (input.isBriefingReady) {
    return { score: 9, alwaysCapture: true, reason: "briefing_ready", signalType: "briefing" };
  }
  if (input.isMarketAlert && (input.priority === 0 || input.priority === 1)) {
    return {
      score: 10,
      alwaysCapture: true,
      reason: "market_alert_p0p1",
      signalType: "market-alert",
    };
  }

  // Response length scoring
  if (input.responseLength && input.responseLength > 500) {
    score = 6;
    reason = "long_response";
  }
  if (input.hasToolCalls) {
    score = Math.max(score, 7);
    reason = "tool_calls";
    signalType = "tool-interaction";
  }

  // Channel reduction
  if (input.channel && LOW_SIGNAL_CHANNELS.has(input.channel)) {
    score = Math.max(0, score - 3);
    reason += "+low_signal_channel";
  }

  return { score, alwaysCapture, reason, signalType };
}

export function hasDecisionKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return DECISION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export function hasTaskKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return TASK_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export function extractMarkdownTasks(content: string): string[] {
  const tasks: string[] = [];
  const re = /^- \[ \] (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    tasks.push(m[1].trim());
  }
  return tasks;
}
