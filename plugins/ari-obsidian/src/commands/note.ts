export async function handleNoteCommand(args: string): Promise<string> {
  const { writeVaultFile, newTraceHex } = await import("../vault-manager.js");
  const { redact } = await import("../../../ari-ops/src/redactor.js");

  const text = args.trim();
  if (!text) {
    return "Usage: /ari-note <text>";
  }

  const traceId = newTraceHex();
  const today = new Date().toISOString().slice(0, 10);
  const content = [
    "---",
    "type: capture",
    "date: " + today,
    "source: ari-obsidian",
    "trace_id: " + traceId,
    "tags: [capture, manual]",
    "---",
    "# Capture - " + today,
    "",
    redact(text),
    "",
    "---",
    "_Captured via /ari-note at " + new Date().toISOString() + "_",
    "",
  ].join("\n");

  const relPath = "00-Inbox/capture-" + traceId + ".md";
  try {
    writeVaultFile(relPath, content);
    return "Captured to `" + relPath + "` (trace: `" + traceId + "`)";
  } catch (err) {
    return "Vault error: " + String(err).slice(0, 100);
  }
}
