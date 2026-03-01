import { generateFullReport } from "../report-generator.js";

export async function handleReportCommand(args: string): Promise<string> {
  const symbol = args.trim().toUpperCase();
  if (!symbol) {
    return "❌ Usage: /ari-report <symbol>";
  }

  try {
    const report = generateFullReport(symbol);
    const conf = (report.forecast.confidence * 100).toFixed(0);

    const lines = [
      `📋 **${symbol}** — Full Report (${report.date})`,
      ``,
      `**Forecast** (${conf}% confidence)`,
      `Base: ${report.forecast.base.summary.slice(0, 150)}`,
      `Bull: ${report.forecast.bull.summary}`,
      `Bear: ${report.forecast.bear.summary}`,
      `Invalidation: ${report.forecast.invalidation.slice(0, 150)}`,
      ``,
      `**Sentiment**: ${report.sentiment.sentiment.toUpperCase()} — ${report.sentiment.rationale.slice(0, 120)}`,
      ``,
      `**Signal Status**: ${report.signalStatus}`,
      ``,
      `> ${report.disclaimer}`,
      `trace: \`${report.trace_id}\` | Written to vault`,
    ];

    return lines.join("\n");
  } catch (err) {
    return `❌ Report error: ${String(err).slice(0, 100)}`;
  }
}
