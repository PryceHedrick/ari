export async function handleTodayCommand(): Promise<string> {
  try {
    const { generateContextPack } = await import("../context-pack.js");
    const { getOpenLoops, getVaultStats } = await import("../vault-index.js");
    const { getOpenTasks } = await import("../task-engine.js");

    generateContextPack();
    const stats = getVaultStats();
    const openLoops = getOpenLoops();
    const tasks = getOpenTasks(5);

    const taskLines =
      tasks.length > 0 ? tasks.map((t, i) => i + 1 + ". " + t.text).join("\n") : "_No open tasks_";

    const loopLines =
      openLoops.slice(0, 5).length > 0
        ? openLoops
            .slice(0, 5)
            .map((l) => "- " + (l.title || l.path))
            .join("\n")
        : "_No open loops_";

    return [
      "**Today" + apostrophe + "s Context**",
      "",
      "Vault: " + stats.noteCount + " notes | " + openLoops.length + " open loops",
      "Date: " + new Date().toISOString().slice(0, 10),
      "",
      "**Top Tasks:**",
      taskLines,
      "",
      "**Open Loops:**",
      loopLines,
      "",
      "_Context packs regenerated - see [[00-System/CONTEXT_PACK]] in vault_",
    ].join("\n");
  } catch (err) {
    return "Error: " + String(err).slice(0, 100);
  }
}
