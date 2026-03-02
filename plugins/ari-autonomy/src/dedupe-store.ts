/**
 * ARI Dedupe Store — cross-instance message deduplication via SQLite leases.
 *
 * Prevents two ARI gateway instances from processing the same Discord message
 * concurrently. The first instance to acquire a lease "owns" that message.
 *
 * Feature flag: ARI_DEDUPE_LOCK_ENABLED (default true)
 *
 * Message lease TTL: 5 minutes (long enough for complex agent responses)
 * Leader lease TTL: 10 minutes (for catch-up ownership on restart)
 * Cleanup: only runs if last_cleanup > 60s ago (avoids high-frequency churn)
 */

import { getSettingsDb } from "./settings-db.js";

const DEFAULT_LEASE_TTL_MS = 300_000; // 5 minutes
const DEFAULT_LEADER_TTL_MS = 600_000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60_000; // only clean expired rows once per minute

let lastCleanup = 0;

function maybeCleanExpired(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;
  const db = getSettingsDb();
  db.prepare("DELETE FROM message_leases WHERE expires_at < ?").run(now);
}

function isEnabled(): boolean {
  return process.env.ARI_DEDUPE_LOCK_ENABLED !== "false";
}

/**
 * Attempt to acquire a lease for (channelId, messageId).
 * Returns true if this instance now owns the message; false if another instance does.
 * Always returns true when ARI_DEDUPE_LOCK_ENABLED=false.
 */
export function acquireLease(
  channelId: string,
  messageId: string,
  runnerId: string,
  ttlMs = DEFAULT_LEASE_TTL_MS,
): boolean {
  if (!isEnabled()) {
    return true;
  }
  maybeCleanExpired();
  const db = getSettingsDb();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  // INSERT OR IGNORE — silently no-ops if lease already exists (another instance owns it)
  const result = db
    .prepare(`
      INSERT OR IGNORE INTO message_leases
        (channel_id, message_id, runner_id, leased_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(channelId, messageId, runnerId, now, expiresAt);
  return result.changes > 0;
}

/** Extend an existing lease's TTL. No-op if lease no longer exists or belongs to another instance. */
export function renewLease(
  channelId: string,
  messageId: string,
  runnerId: string,
  ttlMs = DEFAULT_LEASE_TTL_MS,
): void {
  if (!isEnabled()) {
    return;
  }
  const db = getSettingsDb();
  const expiresAt = Date.now() + ttlMs;
  db.prepare(`
    UPDATE message_leases
    SET expires_at = ?
    WHERE channel_id = ? AND message_id = ? AND runner_id = ?
  `).run(expiresAt, channelId, messageId, runnerId);
}

/** Release a lease explicitly (called after processing completes or fails). */
export function releaseLease(channelId: string, messageId: string): void {
  if (!isEnabled()) {
    return;
  }
  const db = getSettingsDb();
  db.prepare("DELETE FROM message_leases WHERE channel_id = ? AND message_id = ?").run(
    channelId,
    messageId,
  );
}

// ─── Leader Lease (catch-up ownership) ────────────────────────────────────────

const LEADER_KEY = "ari-startup-catchup";

/**
 * Attempt to acquire the leader lease for startup catch-up.
 * Only one instance performs stale-row cleanup + retry on restart.
 */
export function acquireLeaderLease(runnerId: string, ttlMs = DEFAULT_LEADER_TTL_MS): boolean {
  const db = getSettingsDb();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  // Remove expired leader lease first (INSERT OR REPLACE would overwrite even valid leases)
  db.prepare("DELETE FROM leader_leases WHERE lease_key = ? AND expires_at < ?").run(
    LEADER_KEY,
    now,
  );
  const result = db
    .prepare(`
      INSERT OR IGNORE INTO leader_leases
        (lease_key, runner_id, leased_at, expires_at)
      VALUES (?, ?, ?, ?)
    `)
    .run(LEADER_KEY, runnerId, now, expiresAt);
  return result.changes > 0;
}

/** Renew the leader lease (call every 3 minutes during catch-up). */
export function renewLeaderLease(runnerId: string): void {
  const db = getSettingsDb();
  const expiresAt = Date.now() + DEFAULT_LEADER_TTL_MS;
  db.prepare(`
    UPDATE leader_leases SET expires_at = ?
    WHERE lease_key = ? AND runner_id = ?
  `).run(expiresAt, LEADER_KEY, runnerId);
}
