/**
 * ARI Approvals — approval card lifecycle for Discord.
 *
 * Approval cards are posted to Discord when a task requires human sign-off.
 * The approval_key = SHA-256(task_id + YYYY-MM-DD + HH) ensures at most one
 * card per task per hour (handles Mon/Wed/Fri repeated tasks + same-day retries).
 *
 * Button custom_id format: "ariApproval:id=<approval_id>;action=<action>"
 * Actions: approve | approve-once | deny | snooze-24h
 *
 * Quiet hours (22:00–06:00 ET): cards posted but no @mention ping.
 */

import { createHash, randomUUID } from "node:crypto";
import { getSettingsDb, type ApprovalStatus, type RiskLevel } from "./settings-db.js";

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ApprovalRow = {
  approval_id: string;
  approval_key: string;
  requested_at: number;
  expires_at: number;
  task_id: string;
  agent: string | null;
  lane_reason: string;
  cost_estimate: string | null;
  risk_level: RiskLevel;
  payload_ref: string | null;
  status: ApprovalStatus;
  discord_msg_id: string | null;
  discord_channel: string | null;
  resolved_at: number | null;
  resolved_by: string | null;
};

/**
 * Compute the dedup key for an approval card.
 * SHA-256(task_id + YYYY-MM-DD + HH) — one card per task per hour.
 */
export function computeApprovalKey(taskId: string, now = new Date()): string {
  // Use ET offset approximation (UTC-5 standard, UTC-4 daylight)
  // For simplicity use UTC date+hour — sufficient for hourly dedup
  const dateStr = now.toISOString().slice(0, 13); // "2026-03-02T14"
  return createHash("sha256").update(`${taskId}:${dateStr}`).digest("hex").slice(0, 32);
}

export type CreateApprovalInput = {
  task_id: string;
  agent?: string;
  lane_reason: string;
  cost_estimate?: string;
  risk_level?: RiskLevel;
  payload_ref?: string;
};

/**
 * Create or find an existing approval card for a task.
 * Returns { approvalId, isNew } — isNew=false means a card already exists.
 */
export function upsertApproval(input: CreateApprovalInput): {
  approvalId: string;
  isNew: boolean;
} {
  const db = getSettingsDb();
  const approval_key = computeApprovalKey(input.task_id);

  // Check for existing pending/approved card with this key
  const existing = db
    .prepare("SELECT approval_id FROM approvals_queue WHERE approval_key = ?")
    .get(approval_key) as { approval_id: string } | undefined;
  if (existing) {
    return { approvalId: existing.approval_id, isNew: false };
  }

  const approval_id = randomUUID().replace(/-/g, "").slice(0, 16);
  const now = Date.now();

  db.prepare(`
    INSERT INTO approvals_queue
      (approval_id, approval_key, requested_at, expires_at, task_id, agent,
       lane_reason, cost_estimate, risk_level, payload_ref, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    approval_id,
    approval_key,
    now,
    now + APPROVAL_TTL_MS,
    input.task_id,
    input.agent ?? null,
    input.lane_reason,
    input.cost_estimate ?? null,
    input.risk_level ?? "low",
    input.payload_ref ?? null,
  );

  return { approvalId: approval_id, isNew: true };
}

/** Record Discord message ID after posting the card. */
export function setApprovalDiscordMsg(
  approvalId: string,
  discordMsgId: string,
  discordChannel: string,
): void {
  const db = getSettingsDb();
  db.prepare(`
    UPDATE approvals_queue
    SET discord_msg_id = ?, discord_channel = ?
    WHERE approval_id = ?
  `).run(discordMsgId, discordChannel, approvalId);
}

/** Resolve an approval (approve/deny/snooze). */
export function resolveApproval(
  approvalId: string,
  status: ApprovalStatus,
  resolvedBy: string,
): void {
  const db = getSettingsDb();
  db.prepare(`
    UPDATE approvals_queue
    SET status = ?, resolved_at = ?, resolved_by = ?
    WHERE approval_id = ?
  `).run(status, Date.now(), resolvedBy, approvalId);
}

/**
 * Assert that an approval exists and is in "approved" status.
 * Throws APPROVAL_REQUIRED if not found or not approved.
 */
export function requireApproval(approvalId: string): void {
  const db = getSettingsDb();
  const row = db
    .prepare("SELECT status FROM approvals_queue WHERE approval_id = ?")
    .get(approvalId) as { status: ApprovalStatus } | undefined;
  if (!row || row.status !== "approved") {
    throw Object.assign(
      new Error(`APPROVAL_REQUIRED: approval ${approvalId} not found or not approved`),
      { code: "APPROVAL_REQUIRED" },
    );
  }
}

/** Get pending approvals count for /status display. */
export function getPendingApprovalsCount(): number {
  const db = getSettingsDb();
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM approvals_queue WHERE status = 'pending'")
    .get() as { cnt: number };
  return row.cnt;
}

/** Get pending approvals list (for /approvals command). */
export function getPendingApprovals(): ApprovalRow[] {
  const db = getSettingsDb();
  const now = Date.now();
  return db
    .prepare(`
      SELECT * FROM approvals_queue
      WHERE status = 'pending' AND expires_at > ?
      ORDER BY requested_at ASC
    `)
    .all(now) as ApprovalRow[];
}

/** Expire stale pending approvals (past TTL). */
export function expireStaleApprovals(): number {
  const db = getSettingsDb();
  const result = db
    .prepare(
      "UPDATE approvals_queue SET status = 'expired' WHERE status = 'pending' AND expires_at < ?",
    )
    .run(Date.now());
  return result.changes;
}

/** Build Discord button custom_id for an approval action. */
export function buildApprovalCustomId(
  approvalId: string,
  action: "approve" | "approve-once" | "deny" | "snooze-24h",
): string {
  return `ariApproval:id=${approvalId};action=${action}`;
}

/** Parse an approval custom_id string. Returns null if format invalid. */
export function parseApprovalCustomId(
  customId: string,
): { approvalId: string; action: string } | null {
  if (!customId.startsWith("ariApproval:")) {
    return null;
  }
  const parts = customId.slice("ariApproval:".length);
  const idMatch = parts.match(/id=([^;]+)/);
  const actionMatch = parts.match(/action=([^;]+)/);
  if (!idMatch || !actionMatch) {
    return null;
  }
  return { approvalId: idMatch[1], action: actionMatch[1] };
}

/**
 * Determine if we are in quiet hours (22:00–06:00 ET).
 * Posts card but suppresses @mention ping.
 */
export function isQuietHours(): boolean {
  // Approximate ET by using UTC-5 (standard time)
  const utcHour = new Date().getUTCHours();
  const etHour = (utcHour - 5 + 24) % 24;
  return etHour >= 22 || etHour < 6;
}
