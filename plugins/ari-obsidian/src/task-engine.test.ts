import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

process.env.HOME = mkdtempSync(path.join(tmpdir(), "ari-task-test-"));

// Check if better-sqlite3 native module is available
let sqliteAvailable = true;
try {
  const Database = (await import("better-sqlite3")).default;
  const testDb = new Database(":memory:");
  testDb.close();
} catch {
  sqliteAvailable = false;
}

const itSql = sqliteAvailable ? it : it.skip;

import { extractMarkdownTasks } from "./signal-scorer.js";
import { addTask, getOpenTasks, completeTask, generateMITs } from "./task-engine.js";

describe("task-engine", () => {
  itSql("addTask creates open task", () => {
    const id = addTask("Fix auth bug");
    expect(id).toBeGreaterThan(0);
    const tasks = getOpenTasks(10);
    expect(tasks.some((t) => t.text === "Fix auth bug")).toBe(true);
  });

  itSql("getOpenTasks excludes completed tasks", () => {
    const id = addTask("Complete me");
    completeTask(id);
    const open = getOpenTasks(100);
    expect(open.every((t) => t.status === "open")).toBe(true);
  });

  itSql("generateMITs returns top 3 tasks string", () => {
    addTask("MIT Task 1", { priority: 1 });
    addTask("MIT Task 2", { priority: 2 });
    addTask("MIT Task 3", { priority: 3 });
    const mits = generateMITs();
    expect(mits).toContain("MITs Today");
    expect(mits).toContain("MIT Task 1");
  });

  it("extractMarkdownTasks finds unchecked checkboxes", () => {
    const content = "- [ ] Fix the bug\n- [x] Done already\n- [ ] Another task";
    const tasks = extractMarkdownTasks(content);
    expect(tasks).toContain("Fix the bug");
    expect(tasks).toContain("Another task");
    expect(tasks).not.toContain("Done already");
  });

  itSql("completed tasks excluded from getOpenTasks results", () => {
    const id = addTask("Next task exclusion test");
    completeTask(id);
    const open = getOpenTasks(50);
    expect(open.find((t) => t.text === "Next task exclusion test")).toBeUndefined();
  });
});
