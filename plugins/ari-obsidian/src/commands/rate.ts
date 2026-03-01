export async function handleRateCommand(args: string): Promise<string> {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return "Usage: /ari-rate <trace_id> good|bad [note]";
  }

  const [traceId, rating, ...noteParts] = parts;
  if (rating !== "good" && rating !== "bad") {
    return "Rating must be good or bad";
  }

  try {
    const { storeFeedback } = await import("../task-engine.js");
    const note = noteParts.join(" ") || undefined;
    storeFeedback(traceId, rating, note);
    return "Feedback stored" + (note ? ' with note: "' + note + '"' : "");
  } catch (err) {
    return "Error: " + String(err).slice(0, 100);
  }
}
