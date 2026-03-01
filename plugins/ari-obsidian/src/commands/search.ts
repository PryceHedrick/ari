export async function handleVaultSearchCommand(args: string): Promise<string> {
  const query = args.trim();
  if (!query) {
    return "Usage: /ari-vault-search <query>";
  }

  try {
    const { searchVaultIndex } = await import("../vault-index.js");
    const results = searchVaultIndex(query, 10);

    if (results.length === 0) {
      return "No results for `" + query + "`";
    }

    const lines = results.map(
      (r, i) =>
        i + 1 + ". [[" + r.path + "]] - " + (r.title || "untitled") + " *(" + r.note_type + ")*",
    );
    return "**Search: " + query + "** (" + results.length + " results)\n\n" + lines.join("\n");
  } catch (err) {
    return "Search error: " + String(err).slice(0, 100);
  }
}
