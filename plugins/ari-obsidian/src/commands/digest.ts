export async function handleDigestCommand(args: string): Promise<string> {
  const mode = args.trim().toLowerCase() as "daily" | "weekly" | "";

  try {
    const { reindexVaultSync } = await import("../vault-index.js");
    const { generateContextPack } = await import("../context-pack.js");

    if (!mode || mode === "daily") {
      const { generateDailyDigest } = await import("../digest.js");
      reindexVaultSync("incremental");
      const snapshot = generateDailyDigest();
      generateContextPack();
      return [
        "**Daily digest complete**",
        "",
        "Date: " + snapshot.date,
        "Notes: " + snapshot.noteCount,
        "Open loops: " + snapshot.openLoops,
        "Trace: `" + snapshot.traceId + "`",
      ].join("\n");
    }

    if (mode === "weekly") {
      const { generateWeeklyDigest } = await import("../digest.js");
      reindexVaultSync("full");
      const snapshot = generateWeeklyDigest();
      return [
        "**Weekly digest complete**",
        "",
        "Week: " + snapshot.date,
        "Notes: " + snapshot.noteCount,
        "Trace: `" + snapshot.traceId + "`",
      ].join("\n");
    }

    return "Usage: /ari-digest-now [daily|weekly]";
  } catch (err) {
    return "Digest error: " + String(err).slice(0, 100);
  }
}
