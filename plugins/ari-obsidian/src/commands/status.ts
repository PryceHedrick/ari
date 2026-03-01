export async function handleVaultStatusCommand(): Promise<string> {
  try {
    const { getVaultStats, getLastDigestDate, getOpenLoops } = await import("../vault-index.js");
    const { existsSync } = await import("node:fs");
    const { getVaultRoot } = await import("../vault-manager.js");

    const vaultRoot = getVaultRoot();
    if (!existsSync(vaultRoot)) {
      return "Vault Status\n\nNot initialized - run `/ari-note` or `/ari-digest-now` to initialize";
    }

    const stats = getVaultStats();
    const lastDigest = getLastDigestDate();
    const openLoops = getOpenLoops();

    return [
      "**Vault Status**",
      "",
      "Notes: " + stats.noteCount + " | Indexed: " + stats.indexedCount,
      "Open loops: " + openLoops.length,
      "Last digest: " + (lastDigest ? lastDigest.slice(0, 10) : "never"),
      "Unique tags: " + stats.tagCount,
      "Vault path: `" + vaultRoot + "`",
    ].join("\n");
  } catch (err) {
    return "Status error: " + String(err).slice(0, 100);
  }
}
