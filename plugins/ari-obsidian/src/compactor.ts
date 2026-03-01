/**
 * ARI Obsidian Compactor - fragment grouping, retention, open-loop aging.
 * Runs at 22:30 ET via scheduler.
 */

import { existsSync, readdirSync, readFileSync, renameSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getVaultDb } from "./vault-index.js";
import { getVaultRoot, appendVaultFile } from "./vault-manager.js";

function getRetentionDays(): number {
  return parseInt(process.env.ARI_OBSIDIAN_RETENTION_DAYS ?? "7", 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function archiveFragment(relPath: string): void {
  const vault = getVaultRoot();
  const src = path.join(vault, relPath);
  const now = new Date();
  const monthDir = path.join(
    vault,
    "90-Archive",
    String(now.getFullYear()) + "-" + String(now.getMonth() + 1).padStart(2, "0"),
  );
  mkdirSync(monthDir, { recursive: true });
  const dst = path.join(monthDir, path.basename(relPath));
  try {
    renameSync(src, dst);
  } catch {
    /* ignore */
  }
}

export interface CompactionResult {
  fragmentsProcessed: number;
  fragmentsArchived: number;
  openLoopsAged: number;
}

export function runCompaction(): CompactionResult {
  const vault = getVaultRoot();
  const inboxDir = path.join(vault, "00-Inbox");
  let fragmentsProcessed = 0;
  let fragmentsArchived = 0;
  let openLoopsAged = 0;

  if (!existsSync(inboxDir)) {
    return { fragmentsProcessed, fragmentsArchived, openLoopsAged };
  }

  const today = todayStr();
  const retentionMs = getRetentionDays() * 24 * 60 * 60 * 1000;
  const fragments = readdirSync(inboxDir).filter((f) => f.endsWith(".md"));
  const todayFragments: string[] = [];
  const oldFragments: string[] = [];

  for (const f of fragments) {
    const fp = path.join(inboxDir, f);
    const fragContent = readFileSync(fp, "utf8");
    const dateMatch = /^date: (\d{4}-\d{2}-\d{2})/m.exec(fragContent);
    const noteDate = dateMatch ? dateMatch[1] : null;
    if (noteDate === today) {
      todayFragments.push(f);
    } else if (noteDate) {
      const noteMs = new Date(noteDate).getTime();
      if (Date.now() - noteMs > retentionMs) {
        oldFragments.push(f);
      }
    }
  }

  for (const f of oldFragments) {
    archiveFragment("00-Inbox/" + f);
    fragmentsArchived++;
  }

  if (todayFragments.length > 0) {
    const grouped = { decisions: [] as string[], openLoops: [] as string[], tasks: [] as string[] };
    for (const f of todayFragments) {
      const fragContent = readFileSync(path.join(inboxDir, f), "utf8");
      if (fragContent.includes("Decision") || fragContent.includes("decided")) {
        grouped.decisions.push(fragContent.slice(0, 300));
      } else if (fragContent.includes("open-loop") || fragContent.includes("#open-loop")) {
        grouped.openLoops.push(fragContent.slice(0, 300));
      } else if (fragContent.includes("task") || fragContent.includes("TODO")) {
        grouped.tasks.push(fragContent.slice(0, 300));
      }
      fragmentsProcessed++;
    }
    const dailyPath = "40-Logs/Daily/" + today + ".md";
    if (grouped.decisions.length > 0) {
      appendVaultFile(
        dailyPath,
        "\n## Decisions (compacted)\n" + grouped.decisions.join("\n---\n") + "\n",
      );
    }
    if (grouped.tasks.length > 0) {
      appendVaultFile(
        dailyPath,
        "\n## Tasks Extracted (compacted)\n" + grouped.tasks.join("\n---\n") + "\n",
      );
    }
  }

  const db = getVaultDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const oldLoops = db
    .prepare(
      "SELECT path FROM notes JOIN note_tags ON notes.path = note_tags.note_path WHERE note_tags.tag = 'open-loop' AND notes.last_indexed < ?",
    )
    .all(sevenDaysAgo) as Array<{ path: string }>;
  for (const loop of oldLoops) {
    db.prepare("INSERT OR IGNORE INTO note_tags (note_path, tag) VALUES (?, ?)").run(
      loop.path,
      "needs-mit",
    );
    openLoopsAged++;
  }

  return { fragmentsProcessed, fragmentsArchived, openLoopsAged };
}
