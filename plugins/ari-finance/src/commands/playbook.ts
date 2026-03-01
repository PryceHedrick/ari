import { getPlaybookContent } from "../finance-playbook.js";
import { DISCLAIMER } from "../report-generator.js";

export async function handlePlaybookCommand(args: string): Promise<string> {
  const symbol = args.trim().toUpperCase();
  if (!symbol) {
    return "❌ Usage: /ari-playbook <symbol>";
  }

  try {
    // getPlaybookContent may return a Promise (async vault read) or a string
    const content = await Promise.resolve(getPlaybookContent(symbol));

    if (content.startsWith("No playbook")) {
      return `📖 ${content}`;
    }

    // Trim frontmatter for Discord display; show body only
    const body = content.replace(/^---[\s\S]*?---\n/, "");
    const preview = body.slice(0, 1200);

    return [
      `📖 **${symbol}** — Playbook`,
      ``,
      preview,
      preview.length < body.length ? `\n_[truncated — full playbook in vault]_` : "",
      ``,
      `> ${DISCLAIMER}`,
    ]
      .filter((l) => l !== "")
      .join("\n");
  } catch (err) {
    return `❌ Playbook error: ${String(err).slice(0, 100)}`;
  }
}
