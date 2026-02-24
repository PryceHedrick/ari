import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const DEFAULT_WORKSPACE_FILES = ["SOUL.md", "USER.md", "HEARTBEAT.md", "AGENTS.md", "RECOVERY.md"];
const MAX_FILE_CHARS = 10_000;

type WorkspaceConfigShape = {
  path?: string;
  files?: string[];
};

function expandUserPath(input: string): string {
  if (!input.startsWith("~")) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function coerceWorkspaceConfig(raw: unknown): WorkspaceConfigShape {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const rec = raw as Record<string, unknown>;
  const files = Array.isArray(rec.files)
    ? rec.files.map((entry) => String(entry).trim()).filter(Boolean)
    : undefined;
  return {
    path: typeof rec.path === "string" ? rec.path : undefined,
    files,
  };
}

function readFileSnippet(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  if (!raw.trim()) {
    return null;
  }
  return raw.slice(0, MAX_FILE_CHARS);
}

export function loadWorkspaceContext(workspaceDir: string, files: string[]): string {
  const sections: string[] = [];
  for (const filename of files) {
    const resolved = path.join(workspaceDir, filename);
    const snippet = readFileSnippet(resolved);
    if (!snippet) {
      continue;
    }
    sections.push(`### ${filename}\n${snippet}`);
  }
  return sections.join("\n\n");
}

export function registerWorkspaceHooks(api: OpenClawPluginApi): void {
  api.on("before_prompt_build", () => {
    const workspaceCfg = coerceWorkspaceConfig((api.config as Record<string, unknown>).workspace);
    const workspaceDir = expandUserPath(workspaceCfg.path ?? "~/.openclaw/workspace");
    const files =
      workspaceCfg.files && workspaceCfg.files.length > 0
        ? workspaceCfg.files
        : DEFAULT_WORKSPACE_FILES;
    const context = loadWorkspaceContext(workspaceDir, files);
    if (!context) {
      return undefined;
    }
    return {
      prependContext: ["[ARI-WORKSPACE-CONTEXT]", context].join("\n\n"),
    };
  });
}
