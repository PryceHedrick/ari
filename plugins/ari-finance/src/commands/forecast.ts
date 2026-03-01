import { generateForecast } from "../report-generator.js";

export async function handleForecastCommand(args: string): Promise<string> {
  const symbol = args.trim().toUpperCase();
  if (!symbol) {
    return "❌ Usage: /ari-forecast <symbol>";
  }

  try {
    const forecast = generateForecast(symbol);
    const conf = (forecast.confidence * 100).toFixed(0);

    return [
      `📈 **${symbol}** — Forecast`,
      ``,
      `**Base** (${conf}% confidence)`,
      forecast.base.summary,
      forecast.base.target ? `Target: ${forecast.base.target}` : "",
      ``,
      `**Bull Case**`,
      forecast.bull.summary,
      `Trigger: ${forecast.bull.trigger}`,
      ``,
      `**Bear Case**`,
      forecast.bear.summary,
      `Trigger: ${forecast.bear.trigger}`,
      ``,
      `**Invalidation**`,
      forecast.invalidation,
      ``,
      `> ${forecast.disclaimer}`,
      `trace: \`${forecast.trace_id}\``,
    ]
      .filter((l) => l !== "")
      .join("\n");
  } catch (err) {
    return `❌ Forecast error: ${String(err).slice(0, 100)}`;
  }
}
