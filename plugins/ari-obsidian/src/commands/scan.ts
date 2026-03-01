export async function handleScanCommand(args: string): Promise<string> {
  const mode = args.trim().toLowerCase() as "baseline" | "deep" | "";

  try {
    const { scanRepo } = await import("../repo-scanner.js");
    const result = scanRepo(mode === "deep" ? "deep" : "baseline");

    return [
      "**Repo scan complete** (" + result.mode + " mode)",
      "",
      "Plugins documented: " + result.pluginsDocumented,
      "Output: `" + result.outputFile + "`",
      "Trace: `" + result.traceId + "`",
    ].join("\n");
  } catch (err) {
    return "Scan error: " + String(err).slice(0, 100);
  }
}
