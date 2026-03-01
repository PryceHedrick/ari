/**
 * /ari-agents — agent registry from memory DB.
 */

export async function handleAgentsCommand(): Promise<{ text: string }> {
  try {
    // Lazy import to avoid hard dep on memory-db at plugin load time
    const { getAgentRegistry } = await import("../../ari-memory/src/memory-db.js");
    const agents = getAgentRegistry();

    if (agents.length === 0) {
      return {
        text: "**Agent Registry**\nNo agents registered yet. Agents register on first activation.",
      };
    }

    const lines = [`**Agent Registry** (${agents.length} agents)`, "```"];
    lines.push("NAME    EMOJI PLANE  MODEL                    STATUS   SEEN");
    lines.push("─".repeat(70));

    for (const a of agents) {
      const name = a.name.padEnd(7);
      const emoji = (a.emoji ?? " ").padEnd(5);
      const plane = a.plane.padEnd(6);
      const model = (a.model ?? "-").slice(0, 24).padEnd(24);
      const status = (a.status ?? "-").padEnd(8);
      const seen = a.last_seen ? a.last_seen.slice(0, 10) : "never";
      lines.push(`${name} ${emoji} ${plane} ${model} ${status} ${seen}`);
    }

    lines.push("```");
    return { text: lines.join("\n") };
  } catch {
    return {
      text: "**Agent Registry**\nMemory DB not yet initialized. Agents register on first use.",
    };
  }
}
