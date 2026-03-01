import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { PolicyEngine, isInternalTool } from "./policy-engine.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TMP_DIR = join(tmpdir(), "ari-ops-policy-test");
const ALLOWLIST_PATH = join(TMP_DIR, "allowlist.yaml");

function writeAllowlist(yaml: string): void {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(ALLOWLIST_PATH, yaml, "utf8");
}

function makeEngine(opts?: {
  enabled?: boolean;
  defaultDeny?: boolean;
  internalExempt?: boolean;
  yaml?: string;
}): PolicyEngine {
  const yaml =
    opts?.yaml ??
    `version: 1
skills: []
`;
  writeAllowlist(yaml);
  return new PolicyEngine(
    {
      enabled: opts?.enabled ?? true,
      defaultDeny: opts?.defaultDeny ?? true,
      internalPluginsExempt: opts?.internalExempt ?? true,
    },
    ALLOWLIST_PATH,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isInternalTool()", () => {
  it("identifies internal ARI tools", () => {
    expect(isInternalTool("ari_memory_search")).toBe(true);
    expect(isInternalTool("ari_kernel_audit")).toBe(true);
    expect(isInternalTool("ari_briefings_send")).toBe(true);
    expect(isInternalTool("ari_ops_status")).toBe(true);
    expect(isInternalTool("ari_save_bookmark")).toBe(true);
  });

  it("does not identify external tools as internal", () => {
    expect(isInternalTool("some_random_tool")).toBe(false);
    expect(isInternalTool("marketplace_skill_run")).toBe(false);
    expect(isInternalTool("web_search")).toBe(false);
  });
});

describe("PolicyEngine", () => {
  afterEach(() => {
    // Clean up env vars set during tests
    delete process.env.ARI_KILL_ALL;
    delete process.env.ARI_KILL_SKILLS;
  });

  it("allows internal tools with internal_exempt rule", () => {
    const engine = makeEngine({ internalExempt: true });
    const result = engine.evaluate("ari_memory_search", {});
    expect(result.action).toBe("allow");
    expect(result.rule).toBe("internal_exempt");
  });

  it("denies unknown tools with not_in_allowlist", () => {
    const engine = makeEngine({ defaultDeny: true });
    const result = engine.evaluate("some_external_tool", {});
    expect(result.action).toBe("deny");
    expect(result.rule).toBe("not_in_allowlist");
  });

  it("allows when policy is disabled", () => {
    const engine = makeEngine({ enabled: false });
    const result = engine.evaluate("some_external_tool", {});
    expect(result.action).toBe("allow");
    expect(result.rule).toBe("policy_disabled");
  });

  it("denies quarantined skills", () => {
    const engine = makeEngine({
      yaml: `version: 1
skills:
  - slug: bad-skill
    tier: quarantine
    tools: [bad_skill_run]
`,
    });
    const result = engine.evaluate("bad_skill_run", {});
    expect(result.action).toBe("deny");
    expect(result.rule).toBe("quarantine");
  });

  it("allows community-tier skills", () => {
    const engine = makeEngine({
      yaml: `version: 1
skills:
  - slug: good-skill
    tier: community
    tools: [good_skill_run]
`,
    });
    const result = engine.evaluate("good_skill_run", {});
    expect(result.action).toBe("allow");
    expect(result.rule).toBe("community");
  });

  it("denies all (including internal) when ARI_KILL_ALL=true", () => {
    process.env.ARI_KILL_ALL = "true";
    const engine = makeEngine({ internalExempt: true });
    const result = engine.evaluate("ari_memory_search", {});
    expect(result.action).toBe("deny");
    expect(result.rule).toBe("kill_switch_all");
  });

  it("allows internal tools through skills kill switch (internalExempt=true)", () => {
    process.env.ARI_KILL_SKILLS = "true";
    const engine = makeEngine({ internalExempt: true });
    const result = engine.evaluate("ari_memory_search", {});
    expect(result.action).toBe("allow");
    expect(result.rule).toBe("internal_exempt");
  });

  it("denies external tools when ARI_KILL_SKILLS=true", () => {
    process.env.ARI_KILL_SKILLS = "true";
    const engine = makeEngine({ internalExempt: true });
    const result = engine.evaluate("some_external_tool", {});
    expect(result.action).toBe("deny");
    expect(result.rule).toBe("kill_switch_skills");
  });

  it("denies with allowlist_load_error when file is missing", () => {
    const engine = new PolicyEngine(
      { enabled: true, defaultDeny: true, internalPluginsExempt: false },
      "/nonexistent/path/allowlist.yaml",
    );
    const result = engine.evaluate("some_tool", {});
    expect(result.action).toBe("deny");
    expect(result.rule).toBe("allowlist_load_error");
  });
});
