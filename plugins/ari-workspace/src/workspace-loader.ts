import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * ARI Workspace Loader — APEX/CODEX Plane Enforcement
 *
 * APEX Plane (ARI, NOVA, CHASE, PULSE, DEX):
 *   Receives: agent SOUL.md + full workspace files (SOUL/USER/HEARTBEAT/GOALS/AGENTS/MEMORY)
 *
 * CODEX Plane (RUNE — engineering only):
 *   Receives: AGENTS.md (repo conventions) ONLY
 *   PROHIBITED: SOUL files, USER.md, HEARTBEAT.md, GOALS.md, MEMORY.md, personal data
 *
 * Workspace path: ~/.ari/workspace (NOT ~/.openclaw/workspace)
 * Agent SOUL files: ~/.ari/workspace/agents/{agentName}/SOUL.md
 */

const ARI_WORKSPACE_DIR = path.join(os.homedir(), ".ari", "workspace");
const AGENTS_DIR = path.join(ARI_WORKSPACE_DIR, "agents");

// APEX plane: full business context
const APEX_WORKSPACE_FILES = [
  "SOUL.md",
  "USER.md",
  "HEARTBEAT.md",
  "GOALS.md",
  "AGENTS.md",
  "MEMORY.md",
  "RECOVERY.md",
];

// CODEX plane: repo conventions only (NO personal/business context)
const CODEX_WORKSPACE_FILES = ["AGENTS.md"];

// CODEX plane agents — engineering only, never receive business context
const CODEX_AGENTS = new Set(["rune", "RUNE"]);

// Named APEX agents with their own SOUL files
const NAMED_APEX_AGENTS = new Set([
  "ari",
  "ARI",
  "nova",
  "NOVA",
  "chase",
  "CHASE",
  "pulse",
  "PULSE",
  "dex",
  "DEX",
]);

const MAX_FILE_CHARS = 10_000;

type WorkspaceConfigShape = {
  path?: string;
  files?: string[];
  agentName?: string;
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
    agentName: typeof rec.agentName === "string" ? rec.agentName : undefined,
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

/**
 * Detect which context plane applies based on agent name.
 * CODEX plane agents get only repo conventions (AGENTS.md).
 */
function detectPlane(agentName: string | undefined): "apex" | "codex" {
  if (!agentName) {
    return "apex";
  }
  if (CODEX_AGENTS.has(agentName)) {
    return "codex";
  }
  return "apex";
}

/**
 * Enforce APEX/CODEX plane boundaries.
 * Throws if CODEX agent would receive prohibited context.
 */
export function validateContextBundlePlane(agentName: string | undefined, files: string[]): void {
  if (!agentName || detectPlane(agentName) !== "codex") {
    return;
  }
  const prohibited = files.filter((f) => f !== "AGENTS.md");
  if (prohibited.length > 0) {
    throw new Error(
      `[ARI-GOVERNANCE] CODEX plane violation: RUNE cannot receive ${prohibited.join(", ")}. ` +
        "CODEX agents receive AGENTS.md only. Business context, SOUL files, and personal data are PROHIBITED.",
    );
  }
}

function buildWorkspaceString(workspaceDir: string, files: string[]): string {
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

/**
 * Load the named agent's SOUL.md from ~/.ari/workspace/agents/{name}/SOUL.md
 * Returns null if not found (e.g., ARI's SOUL.md is at the workspace root).
 */
function loadAgentSoulFile(agentName: string): string | null {
  const normalName = agentName.toLowerCase();
  const soulPath = path.join(AGENTS_DIR, normalName, "SOUL.md");
  return readFileSnippet(soulPath);
}

export function registerWorkspaceHooks(api: OpenClawPluginApi): void {
  api.on("before_prompt_build", (event) => {
    const workspaceCfg = coerceWorkspaceConfig((api.config as Record<string, unknown>).workspace);
    const workspaceDir = expandUserPath(workspaceCfg.path ?? ARI_WORKSPACE_DIR);

    // Detect agent name from event or config
    const agentName =
      workspaceCfg.agentName ??
      ((event as Record<string, unknown>).agentName as string | undefined);
    const plane = detectPlane(agentName);

    // Select workspace files based on plane
    let files: string[];
    if (plane === "codex") {
      files = CODEX_WORKSPACE_FILES;
    } else if (workspaceCfg.files && workspaceCfg.files.length > 0) {
      files = workspaceCfg.files;
    } else {
      files = APEX_WORKSPACE_FILES;
    }

    // Enforce plane boundaries — throw on violation
    validateContextBundlePlane(agentName, files);

    const sections: string[] = [];

    // APEX plane: inject named agent's SOUL.md first (if available)
    if (plane === "apex" && agentName && NAMED_APEX_AGENTS.has(agentName)) {
      const soulFile = loadAgentSoulFile(agentName);
      if (soulFile) {
        sections.push(`### AGENT-SOUL: ${agentName.toUpperCase()}\n${soulFile}`);
      }
    }

    // Load workspace files
    const context = buildWorkspaceString(workspaceDir, files);
    if (context) {
      sections.push(context);
    }

    if (sections.length === 0) {
      return undefined;
    }

    const planeLabel = plane === "codex" ? "[ARI-CODEX-CONTEXT]" : "[ARI-APEX-CONTEXT]";
    return {
      prependContext: [planeLabel, sections.join("\n\n")].join("\n\n"),
    };
  });
}
