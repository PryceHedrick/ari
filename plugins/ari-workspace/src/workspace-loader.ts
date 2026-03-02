import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * ARI Workspace Loader — MISSION/BUILD Plane Enforcement
 *
 * MISSION Plane (ARI, NOVA, CHASE, PULSE, DEX — full business context):
 *   Receives: agent SOUL.md + full workspace files
 *             (SOUL / USER / HEARTBEAT / GOALS / AGENTS / MEMORY / RECOVERY)
 *
 * BUILD Plane (RUNE — engineering only, NO business context):
 *   Receives: AGENTS.md (repo conventions) ONLY
 *   PROHIBITED: SOUL files, USER.md, HEARTBEAT.md, GOALS.md, MEMORY.md, personal data
 *
 * Note: "BUILD plane" = context isolation concept. Unrelated to the openai-codex model.
 *
 * Workspace path: ~/.ari/workspace/
 * Agent SOUL files: ~/.ari/workspace/agents/{agentName}/SOUL.md
 */

const ARI_WORKSPACE_DIR = path.join(os.homedir(), ".ari", "workspace");
const AGENTS_DIR = path.join(ARI_WORKSPACE_DIR, "agents");

// MISSION plane: full business context (all 7 workspace files)
// IMPORTANT: Stable files must precede HEARTBEAT.md (dynamic timestamps) for prompt cache hits.
// Cache order: stable → semi-stable → dynamic. HEARTBEAT.md MUST be last.
const MISSION_WORKSPACE_FILES = [
  "SOUL.md", // Stable — rarely changes
  "USER.md", // Stable — weekly update at most
  "GOALS.md", // Stable — monthly updates
  "AGENTS.md", // Stable — updated per sprint
  "RECOVERY.md", // Stable — infrequent updates
  "MEMORY.md", // Semi-stable — daily appends, mostly stable content
  "HEARTBEAT.md", // DYNAMIC — contains timestamps → MUST BE LAST
];

// BUILD plane: repo conventions only (NO personal/business context)
const BUILD_WORKSPACE_FILES = ["AGENTS.md"];

// BUILD plane agents — engineering only, never receive business context
const BUILD_AGENTS = new Set(["rune", "RUNE"]);

// Named MISSION agents with their own SOUL files
const NAMED_MISSION_AGENTS = new Set([
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
 * BUILD plane agents get only repo conventions (AGENTS.md).
 */
function detectPlane(agentName: string | undefined): "mission" | "build" {
  if (!agentName) {
    return "mission";
  }
  if (BUILD_AGENTS.has(agentName)) {
    return "build";
  }
  return "mission";
}

// SOUL files are prohibited for CODEX plane agents — business/personal data boundary
const SOUL_FILES = new Set([
  "SOUL.md",
  "USER.md",
  "HEARTBEAT.md",
  "GOALS.md",
  "MEMORY.md",
  "RECOVERY.md",
]);

/**
 * Enforce MISSION/BUILD plane boundaries.
 * Throws if BUILD agent would receive prohibited SOUL/business context.
 * Allows .ts/.md task-spec files (engineering context for RUNE).
 */
export function validateContextBundlePlane(agentName: string | undefined, files: string[]): void {
  if (!agentName || detectPlane(agentName) !== "build") {
    return;
  }
  const hasSoulFiles = files.some((f) => SOUL_FILES.has(f));
  if (hasSoulFiles) {
    const violations = files.filter((f) => SOUL_FILES.has(f)).join(", ");
    throw new Error(
      `[ARI-GOVERNANCE] BUILD plane violation: RUNE cannot receive ${violations}. ` +
        "BUILD agents receive AGENTS.md only. Business context, SOUL files, and personal data are PROHIBITED.",
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
    if (plane === "build") {
      files = BUILD_WORKSPACE_FILES;
    } else if (workspaceCfg.files && workspaceCfg.files.length > 0) {
      files = workspaceCfg.files;
    } else {
      files = MISSION_WORKSPACE_FILES;
    }

    // Enforce plane boundaries — throw on violation (emit security event before re-throwing)
    try {
      validateContextBundlePlane(agentName, files);
    } catch (err) {
      api.emit?.("security:codex-violation-attempt", {
        agentName,
        files,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      throw err;
    }

    const sections: string[] = [];

    // MISSION plane: inject named agent's SOUL.md first (if available)
    if (plane === "mission" && agentName && NAMED_MISSION_AGENTS.has(agentName)) {
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

    const planeLabel = plane === "build" ? "[ARI-BUILD-CONTEXT]" : "[ARI-MISSION-CONTEXT]";
    return {
      prependContext: [planeLabel, sections.join("\n\n")].join("\n\n"),
    };
  });
}
