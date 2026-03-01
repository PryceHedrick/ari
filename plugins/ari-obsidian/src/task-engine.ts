/**
 * ARI Obsidian Task Engine - SQLite tasks + MIT generation.
 */

import { getVaultDb } from "./vault-index.js";

export interface Task {
  id: number;
  text: string;
  project?: string;
  due_date?: string;
  priority: number;
  status: "open" | "done" | "archived";
  source: "auto" | "manual" | "finance";
  source_trace_id?: string;
  created_at: string;
  completed_at?: string;
}

export function getOpenTasks(limit = 20): Task[] {
  const db = getVaultDb();
  return db
    .prepare(
      "SELECT * FROM tasks WHERE status = 'open' ORDER BY priority ASC, due_date ASC NULLS LAST, created_at ASC LIMIT ?",
    )
    .all(limit) as Task[];
}

export function completeTask(id: number): void {
  const db = getVaultDb();
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

export function addTask(
  text: string,
  opts?: {
    project?: string;
    due_date?: string;
    priority?: number;
    source?: string;
    source_trace_id?: string;
  },
): number {
  const db = getVaultDb();
  const result = db
    .prepare(
      "INSERT INTO tasks (text, project, due_date, priority, source, source_trace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      text,
      opts?.project ?? null,
      opts?.due_date ?? null,
      opts?.priority ?? 5,
      opts?.source ?? "manual",
      opts?.source_trace_id ?? null,
      new Date().toISOString(),
    );
  return result.lastInsertRowid as number;
}

export function generateMITs(): string {
  const db = getVaultDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  db.prepare(
    "UPDATE tasks SET priority = MAX(1, priority - 2) WHERE status = 'open' AND created_at < ? AND priority > 1",
  ).run(sevenDaysAgo);
  const top3 = getOpenTasks(3);
  if (top3.length === 0) {
    return "## 3 MITs Today\n\n_No open tasks_\n";
  }
  const lines = top3.map((t, i) => {
    let line = i + 1 + ". " + t.text;
    if (t.project) {
      line += " *(" + t.project + ")*";
    }
    if (t.due_date) {
      line += " - due " + t.due_date;
    }
    if (t.source_trace_id) {
      line += " - trace: " + t.source_trace_id;
    }
    return line;
  });
  return "## 3 MITs Today\n\n" + lines.join("\n") + "\n";
}

export function storeFeedback(traceId: string, rating: "good" | "bad", note?: string): void {
  const db = getVaultDb();
  db.prepare("INSERT INTO feedback (trace_id, rating, note, ts) VALUES (?, ?, ?, ?)").run(
    traceId,
    rating,
    note ?? null,
    new Date().toISOString(),
  );
}

export function getFeedbackStats(days = 7): { good: number; bad: number; ratio: number } {
  const db = getVaultDb();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { good } = db
    .prepare("SELECT COUNT(*) as good FROM feedback WHERE rating = 'good' AND ts > ?")
    .get(since) as { good: number };
  const { bad } = db
    .prepare("SELECT COUNT(*) as bad FROM feedback WHERE rating = 'bad' AND ts > ?")
    .get(since) as { bad: number };
  return { good, bad, ratio: good + bad > 0 ? good / (good + bad) : 1 };
}
