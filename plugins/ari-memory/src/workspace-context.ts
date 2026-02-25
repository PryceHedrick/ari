/**
 * ARI Workspace Context Loader — reads workspace files from ~/.ari/workspace/
 *
 * APEX plane (ARI, NOVA, CHASE, PULSE, DEX):
 *   Loads: SOUL.md + USER.md + HEARTBEAT.md + GOALS.md + AGENTS.md + MEMORY.md + RECOVERY.md
 *   Also loads: ~/.ari/workspace/agents/{agentName}/SOUL.md if agentName is specified
 *
 * CODEX plane (RUNE — engineering only):
 *   Loads: AGENTS.md ONLY
 *   PROHIBITED: SOUL files, USER.md, HEARTBEAT.md, GOALS.md, MEMORY.md, personal data
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const ARI_WORKSPACE = path.join(homedir(), ".ari", "workspace");

const APEX_FILES = [
  "SOUL.md",
  "USER.md",
  "HEARTBEAT.md",
  "GOALS.md",
  "AGENTS.md",
  "MEMORY.md",
  "RECOVERY.md",
];

const CODEX_FILES = ["AGENTS.md"];

const MAX_FILE_CHARS = 10_000;

function readWorkspaceFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf8");
    return content.slice(0, MAX_FILE_CHARS);
  } catch {
    return null;
  }
}

export interface WorkspaceContextResult {
  files: Record<string, string>;
  agentSoul?: string;
  plane: "apex" | "codex";
  totalChars: number;
  missingFiles: string[];
}

/**
 * Load workspace files for the given plane and agent.
 * Returns structured context ready for injection into agent system prompts.
 */
export function loadWorkspaceContext(
  agentName?: string,
  plane: "apex" | "codex" = "apex",
): WorkspaceContextResult {
  const fileList = plane === "codex" ? CODEX_FILES : APEX_FILES;
  const files: Record<string, string> = {};
  const missingFiles: string[] = [];

  for (const filename of fileList) {
    const content = readWorkspaceFile(path.join(ARI_WORKSPACE, filename));
    if (content) {
      files[filename] = content;
    } else {
      missingFiles.push(filename);
    }
  }

  // Load agent SOUL file for APEX plane (never for CODEX)
  let agentSoul: string | undefined;
  if (plane === "apex" && agentName) {
    const soulPath = path.join(ARI_WORKSPACE, "agents", agentName.toLowerCase(), "SOUL.md");
    const soul = readWorkspaceFile(soulPath);
    if (soul) {
      agentSoul = soul;
    }
  }

  const totalChars =
    Object.values(files).reduce((s, v) => s + v.length, 0) + (agentSoul?.length ?? 0);

  return { files, agentSoul, plane, totalChars, missingFiles };
}
