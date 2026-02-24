import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { selectRoute } from "../../plugins/ari-agents/src/coordinator.ts";
import { buildCognitivePromptBlock } from "../../plugins/ari-cognitive/src/cognitive-prompt.ts";
import { loadWorkspaceContext } from "../../plugins/ari-workspace/src/workspace-loader.ts";

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ari-workspace loader", () => {
  it("loads only existing workspace files into combined context", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ari-workspace-test-"));
    cleanupDirs.push(dir);

    fs.writeFileSync(path.join(dir, "SOUL.md"), "# Soul\nSystem identity");
    fs.writeFileSync(path.join(dir, "USER.md"), "# User\nOperator profile");

    const context = loadWorkspaceContext(dir, ["SOUL.md", "USER.md", "MISSING.md"]);
    expect(context).toContain("### SOUL.md");
    expect(context).toContain("System identity");
    expect(context).toContain("### USER.md");
    expect(context).not.toContain("MISSING.md");
  });
});

describe("ari-cognitive prompt block", () => {
  it("contains logos/ethos/pathos guidance", () => {
    const block = buildCognitivePromptBlock();
    expect(block).toContain("LOGOS");
    expect(block).toContain("ETHOS");
    expect(block).toContain("PATHOS");
  });
});

describe("ari-agents route selector", () => {
  it("routes deep strategy prompts to opus lane", () => {
    const route = selectRoute("Need deep analysis and architecture roadmap");
    expect(route?.modelOverride).toBe("anthropic/claude-opus-4-6");
  });

  it("routes market update prompts to sonnet lane", () => {
    const route = selectRoute("Build my pokemon market update and clip script");
    expect(route?.modelOverride).toBe("anthropic/claude-sonnet-4-5");
  });
});
