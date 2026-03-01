export async function handleOpenLoopsCommand(): Promise<string> {
  try {
    const { getOpenLoops, getVaultDb } = await import("../vault-index.js");
    const openLoops = getOpenLoops();

    if (openLoops.length === 0) {
      return "No open loops";
    }

    const db = getVaultDb();
    const lines = openLoops.slice(0, 15).map((l) => {
      const ageDays = Math.floor((Date.now() - new Date(l.last_indexed).getTime()) / 86400000);
      const tags = db
        .prepare("SELECT tag FROM note_tags WHERE note_path = ?")
        .all(l.path) as Array<{ tag: string }>;
      const tagStr = tags
        .map((t) => t.tag)
        .filter((t) => ["needs-mit", "archive-candidate", "auto-archived"].includes(t))
        .join(", ");
      return (
        "- [[" +
        l.path +
        "]] - " +
        (l.title || "untitled") +
        " *(" +
        ageDays +
        "d old)" +
        (tagStr ? " [" + tagStr + "]" : "") +
        "*"
      );
    });

    return "**Open Loops** (" + openLoops.length + " total)\n\n" + lines.join("\n");
  } catch (err) {
    return "Error: " + String(err).slice(0, 100);
  }
}
