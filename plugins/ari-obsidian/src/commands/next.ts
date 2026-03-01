export async function handleNextCommand(): Promise<string> {
  try {
    const { getOpenTasks } = await import("../task-engine.js");
    const tasks = getOpenTasks(5);

    if (tasks.length === 0) {
      return "No open tasks";
    }

    const lines = tasks.map((t, i) => {
      let line = "`" + (i + 1) + "` " + t.text;
      if (t.project) {
        line += " *(" + t.project + ")*";
      }
      if (t.due_date) {
        line += " - due " + t.due_date;
      }
      if (t.source_trace_id) {
        line += " - trace: `" + t.source_trace_id + "`";
      }
      return line;
    });

    return "**Next Tasks**\n\n" + lines.join("\n");
  } catch (err) {
    return "Error: " + String(err).slice(0, 100);
  }
}
