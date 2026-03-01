import { generateSentiment } from "../report-generator.js";

export async function handleSentimentCommand(args: string): Promise<string> {
  const symbol = args.trim().toUpperCase();
  if (!symbol) {
    return "❌ Usage: /ari-sentiment <symbol>";
  }

  try {
    const result = generateSentiment(symbol);

    const emoji =
      result.sentiment === "bullish" ? "🟢" : result.sentiment === "bearish" ? "🔴" : "⚪";

    return [
      `${emoji} **${symbol}** — Sentiment`,
      ``,
      `**Rating**: ${result.sentiment.toUpperCase()}`,
      `**Confidence**: ${(result.confidence * 100).toFixed(0)}%`,
      `**Rationale**: ${result.rationale}`,
      ``,
      `> ${result.disclaimer}`,
      `trace: \`${result.trace_id}\``,
    ].join("\n");
  } catch (err) {
    return `❌ Sentiment error: ${String(err).slice(0, 100)}`;
  }
}
