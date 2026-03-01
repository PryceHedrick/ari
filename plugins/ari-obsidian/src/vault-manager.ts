/**
 * ARI Obsidian Vault Manager — FS operations with boundary guard.
 *
 * ALL file operations must call assertVaultPath() before executing.
 * Path traversal outside vault root → log deny span + throw.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { emitSpan } from "../../ari-ops/src/tracer.js";

export function getVaultRoot(): string {
  const env = process.env.ARI_OBSIDIAN_VAULT_PATH;
  if (env) {
    return env.replace(/^~/, homedir());
  }
  return path.join(homedir(), ".ari", "obsidian-vault");
}

/** Boundary guard — throws + emits deny span if path escapes vault root. */
export function assertVaultPath(targetPath: string): void {
  const vaultRoot = getVaultRoot();
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(vaultRoot) + path.sep;
  if (!resolved.startsWith(resolvedRoot) && resolved !== path.resolve(vaultRoot)) {
    emitSpan({
      event: "policy_decision",
      policyAction: "deny",
      policyRule: "vault_boundary_violation",
      tool: "ari_obsidian_*",
      summary: `blocked: ${path.relative(vaultRoot, resolved)}`,
    } as Parameters<typeof emitSpan>[0]);
    throw new Error(`Vault boundary violation: path outside vault root`);
  }
}

export function ensureVaultDir(relPath: string): void {
  const full = path.join(getVaultRoot(), relPath);
  assertVaultPath(full);
  mkdirSync(full, { recursive: true });
}

export function writeVaultFile(relPath: string, content: string): void {
  const full = path.join(getVaultRoot(), relPath);
  assertVaultPath(full);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
}

export function appendVaultFile(relPath: string, content: string): void {
  const full = path.join(getVaultRoot(), relPath);
  assertVaultPath(full);
  mkdirSync(path.dirname(full), { recursive: true });
  appendFileSync(full, content, "utf8");
}

export function readVaultFile(relPath: string): string {
  const full = path.join(getVaultRoot(), relPath);
  assertVaultPath(full);
  return readFileSync(full, "utf8");
}

export function vaultFileExists(relPath: string): boolean {
  const full = path.join(getVaultRoot(), relPath);
  assertVaultPath(full);
  return existsSync(full);
}

export function fileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath, "utf8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "";
  }
}

export function newTraceHex(): string {
  return randomBytes(4).toString("hex");
}

/** List all .md files under a vault-relative directory (recursive). */
export function listVaultMarkdown(
  relDir: string,
): Array<{ relPath: string; mtime: Date; size: number }> {
  const vault = getVaultRoot();
  const full = relDir ? path.join(vault, relDir) : vault;
  if (full !== vault) {
    assertVaultPath(full);
  }
  if (!existsSync(full)) {
    return [];
  }
  const results: Array<{ relPath: string; mtime: Date; size: number }> = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const fp = path.join(dir, entry);
      const stat = statSync(fp);
      if (stat.isDirectory()) {
        walk(fp);
      } else if (entry.endsWith(".md")) {
        results.push({
          relPath: path.relative(vault, fp),
          mtime: stat.mtime,
          size: stat.size,
        });
      }
    }
  }
  walk(full);
  return results;
}

/** Vault init — create dirs, copy templates from skills/, write .obsidian config. */
export function initVault(): { created: string[] } {
  const vault = getVaultRoot();
  const dirs = [
    "00-System/Templates",
    "00-Inbox",
    "10-Projects/ARI",
    "10-Projects/Finance",
    "20-Areas/Operations/Incidents",
    "20-Areas/Operations",
    "30-Resources/Reference",
    "40-Logs/Daily",
    "40-Logs/Finance",
    "50-Logs/Weekly",
    "90-Archive",
    ".obsidian",
  ];
  const created: string[] = [];
  for (const d of dirs) {
    const full = path.join(vault, d);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      created.push(d);
    }
  }

  // Copy templates from skills/obsidian-second-brain/templates/ → 00-System/Templates/
  const skillsTemplateDir = path.join(
    process.cwd(),
    "skills",
    "obsidian-second-brain",
    "templates",
  );
  if (existsSync(skillsTemplateDir)) {
    for (const f of readdirSync(skillsTemplateDir)) {
      const src = path.join(skillsTemplateDir, f);
      const dst = path.join(vault, "00-System", "Templates", f);
      if (!existsSync(dst)) {
        const tmplContent = readFileSync(src, "utf8");
        writeFileSync(dst, tmplContent, "utf8");
        created.push(`00-System/Templates/${f}`);
      }
    }
  }

  // Write .obsidian config files
  const appJson = path.join(vault, ".obsidian", "app.json");
  if (!existsSync(appJson)) {
    writeFileSync(appJson, JSON.stringify({ alwaysUpdateLinks: true }, null, 2), "utf8");
  }
  const dailyNotesJson = path.join(vault, ".obsidian", "daily-notes.json");
  if (!existsSync(dailyNotesJson)) {
    writeFileSync(
      dailyNotesJson,
      JSON.stringify({ folder: "40-Logs/Daily", format: "YYYY-MM-DD" }, null, 2),
      "utf8",
    );
  }
  const templatesJson = path.join(vault, ".obsidian", "templates.json");
  if (!existsSync(templatesJson)) {
    writeFileSync(
      templatesJson,
      JSON.stringify({ folder: "00-System/Templates" }, null, 2),
      "utf8",
    );
  }

  // Write stub identity files
  const today = new Date().toISOString().slice(0, 10);
  const identityFiles = [
    {
      path: "00-System/Identity.md",
      content: `---\ntype: context-os\ndate: ${today}\nsource: ari-obsidian\ntrace_id: manual\ntags: [context-os]\n---\n# Identity\n\n> Fill in: who I am, values, operating principles\n`,
    },
    {
      path: "00-System/Ruts.md",
      content: `---\ntype: context-os\ndate: ${today}\nsource: ari-obsidian\ntrace_id: manual\ntags: [context-os]\n---\n# Ruts\n\n> Fill in: recurring patterns/traps to be aware of\n`,
    },
    {
      path: "00-System/Calendar-Intent.md",
      content: `---\ntype: context-os\ndate: ${today}\nsource: ari-obsidian\ntrace_id: manual\ntags: [context-os]\n---\n# Calendar Intent\n\n> Fill in: this week/month intentions, focus areas\n`,
    },
    {
      path: "00-System/Recommended-Plugins.md",
      content: `---\ntype: context-os\ndate: ${today}\nsource: ari-obsidian\ntrace_id: manual\ntags: []\n---\n# Recommended Obsidian Plugins\n\n- **Dataview** — query notes as a database\n- **Templater** — advanced templating\n- **Calendar** — visual daily note calendar\n- **Tasks** — task management with due dates\n- **Periodic Notes** — weekly/monthly note automation\n`,
    },
  ];
  for (const f of identityFiles) {
    const fullPath = path.join(vault, f.path);
    if (!existsSync(fullPath)) {
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, f.content, "utf8");
      created.push(f.path);
    }
  }

  return { created };
}
