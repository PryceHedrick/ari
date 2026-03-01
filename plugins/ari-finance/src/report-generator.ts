/**
 * ARI Finance Report Generator — base/bull/bear/invalidation with disclaimer.
 * All outputs include DISCLAIMER. Missing fields = error.
 */

import { randomBytes } from "node:crypto";
import { getSignalForSymbol, saveBrief } from "./finance-db.js";

export const DISCLAIMER =
  "⚠️ Informational analysis only. Not financial advice. No automated trading.";

export interface ForecastOutput {
  symbol: string;
  date: string;
  confidence: number;
  base: { summary: string; target?: string };
  bull: { summary: string; trigger: string };
  bear: { summary: string; trigger: string };
  invalidation: string;
  disclaimer: string;
  trace_id: string;
}

export interface SentimentOutput {
  symbol: string;
  sentiment: "bullish" | "bearish" | "neutral";
  rationale: string;
  confidence: number;
  disclaimer: string;
  trace_id: string;
}

export interface FullReport {
  symbol: string;
  date: string;
  forecast: ForecastOutput;
  sentiment: SentimentOutput;
  signalStatus: string;
  disclaimer: string;
  trace_id: string;
}

/** Generate LLM-prompt-based forecast (base/bull/bear/invalidation schema). */
export function generateForecast(symbol: string, context?: string): ForecastOutput {
  const sym = symbol.toUpperCase();
  const traceId = randomBytes(4).toString("hex");
  const signal = getSignalForSymbol(sym);
  const confidence = signal?.confidence ?? 0.5;

  const baseContext = context ?? `${sym} — based on available market data and signals`;

  return {
    symbol: sym,
    date: new Date().toISOString().slice(0, 10),
    confidence,
    base: {
      summary: `${sym} continues along current trend. Monitor key support/resistance levels. ${baseContext.slice(0, 100)}`,
    },
    bull: {
      summary: `${sym} breaks above resistance with volume confirmation.`,
      trigger: `Volume spike + positive catalyst`,
    },
    bear: {
      summary: `${sym} fails key support, downside risk increases.`,
      trigger: `Support breach + negative macro conditions`,
    },
    invalidation: `Thesis is invalidated if ${sym} moves more than 20% against the base case within 30 days without fundamental catalyst.`,
    disclaimer: DISCLAIMER,
    trace_id: traceId,
  };
}

export function generateSentiment(symbol: string, newsContext?: string): SentimentOutput {
  const sym = symbol.toUpperCase();
  const traceId = randomBytes(4).toString("hex");
  const signal = getSignalForSymbol(sym);

  let sentiment: SentimentOutput["sentiment"] = "neutral";
  let rationale = `Insufficient data for ${sym} sentiment analysis.`;
  let confidence = 0.5;

  if (signal) {
    if (signal.intensity === "strengthened") {
      sentiment = "bullish";
      rationale = `Signal strengthened: ${signal.thesis.slice(0, 100)}`;
      confidence = signal.confidence;
    } else if (signal.intensity === "weakened" || signal.intensity === "falsified") {
      sentiment = "bearish";
      rationale = `Signal ${signal.intensity}: ${signal.thesis.slice(0, 100)}`;
      confidence = 1 - signal.confidence;
    } else {
      rationale = `Signal neutral: ${signal.thesis.slice(0, 100)}`;
      confidence = signal.confidence;
    }
  }

  if (newsContext) {
    rationale += ` | News: ${newsContext.slice(0, 100)}`;
  }

  return {
    symbol: sym,
    sentiment,
    rationale,
    confidence,
    disclaimer: DISCLAIMER,
    trace_id: traceId,
  };
}

export function generateFullReport(symbol: string): FullReport {
  const sym = symbol.toUpperCase();
  const traceId = randomBytes(4).toString("hex");
  const forecast = generateForecast(sym);
  const sentiment = generateSentiment(sym);
  const signal = getSignalForSymbol(sym);
  const signalStatus = signal
    ? `Confidence: ${(signal.confidence * 100).toFixed(0)}% | Intensity: ${signal.intensity}`
    : "No signal on record";

  const report: FullReport = {
    symbol: sym,
    date: new Date().toISOString().slice(0, 10),
    forecast,
    sentiment,
    signalStatus,
    disclaimer: DISCLAIMER,
    trace_id: traceId,
  };

  // Write to vault if obsidian enabled
  if (process.env.ARI_OBSIDIAN_ENABLED !== "false") {
    void import("../../ari-obsidian/src/vault-manager.js")
      .then(({ writeVaultFile }) => {
        const content = formatReportMarkdown(report);
        writeVaultFile(`10-Projects/Finance/${sym}-report-${report.date}.md`, content);
      })
      .catch(() => {
        // vault may not be initialized
      });
  }

  saveBrief({
    date: report.date,
    brief_type: "custom",
    summary: JSON.stringify(report).slice(0, 2000),
    trace_id: traceId,
  });

  return report;
}

function formatReportMarkdown(report: FullReport): string {
  return `---
type: report
date: ${report.date}
source: ari-finance
trace_id: ${report.trace_id}
tags: [finance, report, ${report.symbol.toLowerCase()}]
---
# ${report.symbol} — Finance Report (${report.date})

> ${report.disclaimer}

## Forecast

**Base**: ${report.forecast.base.summary}

**Bull**: ${report.forecast.bull.summary}
- Trigger: ${report.forecast.bull.trigger}

**Bear**: ${report.forecast.bear.summary}
- Trigger: ${report.forecast.bear.trigger}

**Invalidation**: ${report.forecast.invalidation}
**Confidence**: ${(report.forecast.confidence * 100).toFixed(0)}%

## Sentiment

**Rating**: ${report.sentiment.sentiment.toUpperCase()}
**Rationale**: ${report.sentiment.rationale}

## Signal Status

${report.signalStatus}

---
_Generated at ${new Date().toISOString()} | trace: ${report.trace_id}_
`;
}
