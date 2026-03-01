/**
 * Policy Engine integration test: verify "blocked attempt" emits trace event.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine } from "./policy-engine.js";
import { emitSpan, writeQueue } from "./tracer.js";

const TMP_DIR = join(tmpdir(), "ari-ops-integration-test");
const ALLOWLIST_PATH = join(TMP_DIR, "allowlist.yaml");

function writeAllowlist(yaml: string): void {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(ALLOWLIST_PATH, yaml, "utf8");
}

describe("policy engine integration", () => {
  beforeEach(() => {
    writeQueue.splice(0, writeQueue.length);
    writeAllowlist("version: 1\nskills: []\n");
  });

  it("blocked attempt: unknown tool → deny → trace event emitted", () => {
    const engine = new PolicyEngine(
      { enabled: true, defaultDeny: true, internalPluginsExempt: true },
      ALLOWLIST_PATH,
    );

    const toolName = "marketplace_unknown_tool";
    const decision = engine.evaluate(toolName, {});
    expect(decision.action).toBe("deny");

    // Emit the policy_decision span (as the plugin hook would)
    emitSpan({
      event: "policy_decision",
      tool: toolName,
      policyAction: decision.action,
      policyRule: decision.rule,
    });

    expect(writeQueue.length).toBe(1);
    const span = JSON.parse(writeQueue[0]);
    expect(span.event).toBe("policy_decision");
    expect(span.tool).toBe(toolName);
    expect(span.policyAction).toBe("deny");
    expect(span.policyRule).toBe("not_in_allowlist");
  });

  it("allowed internal tool → allow → trace event shows internal_exempt", () => {
    const engine = new PolicyEngine(
      { enabled: true, defaultDeny: true, internalPluginsExempt: true },
      ALLOWLIST_PATH,
    );

    const toolName = "ari_memory_search";
    const decision = engine.evaluate(toolName, {});
    expect(decision.action).toBe("allow");
    expect(decision.rule).toBe("internal_exempt");

    emitSpan({
      event: "policy_decision",
      tool: toolName,
      policyAction: decision.action,
      policyRule: decision.rule,
    });

    const span = JSON.parse(writeQueue[0]);
    expect(span.policyAction).toBe("allow");
    expect(span.policyRule).toBe("internal_exempt");
  });
});
