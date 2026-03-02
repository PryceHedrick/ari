/**
 * Approvals Tests — approval_key uniqueness, dedup, and expiry.
 */

import { describe, it, expect } from "vitest";
import {
  computeApprovalKey,
  buildApprovalCustomId,
  parseApprovalCustomId,
  isQuietHours,
} from "../approvals.js";

describe("computeApprovalKey", () => {
  it("same task + same hour → same key", () => {
    const d1 = new Date("2026-03-02T14:30:00Z");
    const d2 = new Date("2026-03-02T14:59:59Z");
    expect(computeApprovalKey("nova-market-scan", d1)).toBe(
      computeApprovalKey("nova-market-scan", d2),
    );
  });

  it("same task + different hour → different key", () => {
    const d1 = new Date("2026-03-02T14:00:00Z");
    const d2 = new Date("2026-03-02T15:00:00Z");
    expect(computeApprovalKey("nova-market-scan", d1)).not.toBe(
      computeApprovalKey("nova-market-scan", d2),
    );
  });

  it("different tasks + same hour → different key", () => {
    const d = new Date("2026-03-02T14:00:00Z");
    expect(computeApprovalKey("nova-market-scan", d)).not.toBe(
      computeApprovalKey("leads-pipeline", d),
    );
  });

  it("key is 32 hex chars", () => {
    const key = computeApprovalKey("task-x");
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("buildApprovalCustomId / parseApprovalCustomId", () => {
  it("round-trips correctly", () => {
    const customId = buildApprovalCustomId("abc123", "approve");
    const parsed = parseApprovalCustomId(customId);
    expect(parsed).toEqual({ approvalId: "abc123", action: "approve" });
  });

  it("handles all actions", () => {
    const actions = ["approve", "approve-once", "deny", "snooze-24h"] as const;
    for (const action of actions) {
      const customId = buildApprovalCustomId("id-x", action);
      const parsed = parseApprovalCustomId(customId);
      expect(parsed?.action).toBe(action);
    }
  });

  it("returns null for non-approval custom_id", () => {
    expect(parseApprovalCustomId("execapproval:foo")).toBeNull();
    expect(parseApprovalCustomId("invalid")).toBeNull();
  });
});

describe("isQuietHours", () => {
  it("returns a boolean", () => {
    expect(typeof isQuietHours()).toBe("boolean");
  });
});
