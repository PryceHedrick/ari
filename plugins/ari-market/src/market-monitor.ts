/**
 * ARI Market Monitor — Multi-asset monitoring engine (PULSE 🔮)
 *
 * Assets tracked:
 *   CRYPTO (6): BTC, ETH, SOL, XRP, AVAX, ARB
 *   STOCKS (5): AAPL, MSFT, NVDA, ^GSPC, ^IXIC
 *   SECTOR ETFs: XLK, XLV, XLF
 *   POKEMON TCG: Top-50 graded cards + booster boxes
 *   MACRO: VIX, 10Y yield, DXY, Gold, Oil
 *
 * Alert thresholds (research-calibrated):
 *   BTC/ETH:    5%/day, 15%/week
 *   Altcoins:   10%/day
 *   Large-cap:  2.5%/day, 8%/week
 *   Sector ETF: 4%/day
 *   Pokemon:    15%/week
 *   Flash crash: crypto >15% OR stocks >5% → P0 (ignores quiet hours)
 *   Anomaly:    Z-score > 2σ on 7-day rolling baseline
 *
 * Community sentiment (reliability gate 0.55):
 *   X tracked accounts: 2h polling, 10 accounts
 *   Reddit: r/PokemonTCG, r/pokemontrades, r/CryptoMarkets (3h polling)
 */

export type AssetClass = "crypto" | "stock" | "etf" | "pokemon" | "macro";
export type AlertSeverity = "P0" | "P1" | "P2" | "P3";

export type AssetThreshold = {
  symbol: string;
  assetClass: AssetClass;
  dailyPctAlert: number;
  weeklyPctAlert: number;
  flashCrashPct?: number; // P0 override threshold
};

export type PricePoint = {
  symbol: string;
  price: number;
  changePct24h: number;
  changePct7d: number;
  timestamp: number; // Unix ms
};

export type MarketAlert = {
  id: string;
  severity: AlertSeverity;
  symbol: string;
  message: string;
  changePct: number;
  threshold: number;
  timestamp: number;
  isFlashCrash: boolean;
};

export type ZScoreResult = {
  symbol: string;
  zScore: number;
  anomalyDetected: boolean; // |z| > 2
  direction: "spike" | "crash" | "normal";
};

export type SocialSignal = {
  source: "x" | "reddit";
  account?: string; // X account handle
  subreddit?: string; // Reddit subreddit (no r/ prefix)
  content: string;
  sentiment: "bullish" | "bearish" | "neutral";
  reliabilityWeight: number; // 0-1
  timestamp: number;
};

export type CommunitySnapshot = {
  signals: SocialSignal[];
  consensusSentiment: "bullish" | "bearish" | "neutral" | "mixed";
  reliabilityMet: boolean; // At least one source ≥ 0.55
};

export type MacroPoint = {
  symbol: string;
  label: string; // Human label: 'VIX', '10Y Yield', 'DXY', 'Gold', 'Oil'
  value: number;
  unit: string; // 'index', '%', 'index', '$/oz', '$/bbl'
};

export type MarketSnapshot = {
  prices: PricePoint[];
  alerts: MarketAlert[];
  zScores: ZScoreResult[];
  community: CommunitySnapshot;
  macro?: MacroPoint[]; // VIX, 10Y yield, DXY, Gold, Oil — Section 7 MACRO WATCH
  snapshotAt: number;
};

// === THRESHOLDS ===

export const ASSET_THRESHOLDS: AssetThreshold[] = [
  // Crypto
  { symbol: "BTC", assetClass: "crypto", dailyPctAlert: 5, weeklyPctAlert: 15, flashCrashPct: 15 },
  { symbol: "ETH", assetClass: "crypto", dailyPctAlert: 5, weeklyPctAlert: 15, flashCrashPct: 15 },
  { symbol: "SOL", assetClass: "crypto", dailyPctAlert: 10, weeklyPctAlert: 25, flashCrashPct: 15 },
  { symbol: "XRP", assetClass: "crypto", dailyPctAlert: 10, weeklyPctAlert: 25, flashCrashPct: 15 },
  {
    symbol: "AVAX",
    assetClass: "crypto",
    dailyPctAlert: 10,
    weeklyPctAlert: 25,
    flashCrashPct: 15,
  },
  { symbol: "ARB", assetClass: "crypto", dailyPctAlert: 10, weeklyPctAlert: 25, flashCrashPct: 15 },
  // Stocks
  { symbol: "AAPL", assetClass: "stock", dailyPctAlert: 2.5, weeklyPctAlert: 8, flashCrashPct: 5 },
  { symbol: "MSFT", assetClass: "stock", dailyPctAlert: 2.5, weeklyPctAlert: 8, flashCrashPct: 5 },
  { symbol: "NVDA", assetClass: "stock", dailyPctAlert: 2.5, weeklyPctAlert: 8, flashCrashPct: 5 },
  { symbol: "^GSPC", assetClass: "stock", dailyPctAlert: 2.5, weeklyPctAlert: 8, flashCrashPct: 5 },
  { symbol: "^IXIC", assetClass: "stock", dailyPctAlert: 2.5, weeklyPctAlert: 8, flashCrashPct: 5 },
  // Sector ETFs
  { symbol: "XLK", assetClass: "etf", dailyPctAlert: 4, weeklyPctAlert: 10 },
  { symbol: "XLV", assetClass: "etf", dailyPctAlert: 4, weeklyPctAlert: 10 },
  { symbol: "XLF", assetClass: "etf", dailyPctAlert: 4, weeklyPctAlert: 10 },
  // Pokemon TCG (weekly only — supply/demand driven, no daily threshold)
  { symbol: "POKEMON_TCG", assetClass: "pokemon", dailyPctAlert: 999, weeklyPctAlert: 15 },
  // Macro indicators — tracked for display, alerted on significant moves
  { symbol: "VIX", assetClass: "macro", dailyPctAlert: 20, weeklyPctAlert: 40 }, // >20% VIX spike = fear event
  { symbol: "10Y", assetClass: "macro", dailyPctAlert: 5, weeklyPctAlert: 15 }, // >5% yield move = significant
  { symbol: "DXY", assetClass: "macro", dailyPctAlert: 2, weeklyPctAlert: 5 }, // >2%/day dollar strength
  { symbol: "GOLD", assetClass: "macro", dailyPctAlert: 2, weeklyPctAlert: 5 }, // >2%/day gold = flight to safety
  { symbol: "OIL", assetClass: "macro", dailyPctAlert: 5, weeklyPctAlert: 10 }, // >5%/day oil = supply shock
];

// Source reliability weights (from Section 26.5 of the plan)
// pokemontcg.io migrated to Scrydex — https://api.scrydex.com/pokemon/v1/
export const SOURCE_RELIABILITY: Record<string, number> = {
  "scrydex.com": 1.0,
  "pokewallet.io": 0.9,
  finnhub: 0.95,
  coingecko: 0.95,
  x_tracked_account: 0.7,
  reddit_post: 0.65,
  x_trending: 0.55,
  perplexity_synthesis: 0.8,
  apify_scrape: 0.65,
  tavily_crawl: 0.6,
};

const COMMUNITY_RELIABILITY_GATE = 0.55;

/**
 * Compute Z-score against a 7-day rolling baseline.
 * Used for anomaly detection: |z| > 2 = anomaly.
 */
export function computeZScore(current: number, history: number[]): ZScoreResult {
  const symbol = "unknown"; // caller provides the full object
  if (history.length < 2) {
    return { symbol, zScore: 0, anomalyDetected: false, direction: "normal" };
  }

  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length;
  const stddev = Math.sqrt(variance);
  const zScore = stddev === 0 ? 0 : (current - mean) / stddev;

  return {
    symbol,
    zScore,
    anomalyDetected: Math.abs(zScore) > 2,
    direction: zScore > 2 ? "spike" : zScore < -2 ? "crash" : "normal",
  };
}

/**
 * Evaluate price points against thresholds and emit alerts.
 */
export function evaluateAlerts(prices: PricePoint[]): MarketAlert[] {
  const alerts: MarketAlert[] = [];
  const now = Date.now();

  for (const price of prices) {
    const threshold = ASSET_THRESHOLDS.find((t) => t.symbol === price.symbol);
    if (!threshold) {
      continue;
    }

    const absPct24h = Math.abs(price.changePct24h);
    const absPct7d = Math.abs(price.changePct7d);

    // Flash crash check (P0 — ignores quiet hours)
    if (threshold.flashCrashPct && absPct24h >= threshold.flashCrashPct) {
      alerts.push({
        id: `${price.symbol}-flash-${now}`,
        severity: "P0",
        symbol: price.symbol,
        message: `⚡ FLASH CRASH: ${price.symbol} moved ${price.changePct24h > 0 ? "+" : ""}${price.changePct24h.toFixed(1)}% — CRITICAL`,
        changePct: price.changePct24h,
        threshold: threshold.flashCrashPct,
        timestamp: now,
        isFlashCrash: true,
      });
      continue; // flash crash subsumes other alerts
    }

    // Daily threshold
    if (absPct24h >= threshold.dailyPctAlert) {
      alerts.push({
        id: `${price.symbol}-daily-${now}`,
        severity: absPct24h >= threshold.dailyPctAlert * 1.5 ? "P1" : "P2",
        symbol: price.symbol,
        message: `${price.symbol} ${price.changePct24h > 0 ? "+" : ""}${price.changePct24h.toFixed(1)}% (threshold ±${threshold.dailyPctAlert}%)`,
        changePct: price.changePct24h,
        threshold: threshold.dailyPctAlert,
        timestamp: now,
        isFlashCrash: false,
      });
    }

    // Weekly threshold
    if (absPct7d >= threshold.weeklyPctAlert) {
      alerts.push({
        id: `${price.symbol}-weekly-${now}`,
        severity: "P2",
        symbol: price.symbol,
        message: `${price.symbol} weekly ${price.changePct7d > 0 ? "+" : ""}${price.changePct7d.toFixed(1)}% (threshold ±${threshold.weeklyPctAlert}%)`,
        changePct: price.changePct7d,
        threshold: threshold.weeklyPctAlert,
        timestamp: now,
        isFlashCrash: false,
      });
    }
  }

  return alerts;
}

/**
 * Evaluate community signals and build a consensus snapshot.
 * Only includes signals above the reliability gate (0.55).
 */
export function buildCommunitySnapshot(signals: SocialSignal[]): CommunitySnapshot {
  const qualified = signals.filter((s) => s.reliabilityWeight >= COMMUNITY_RELIABILITY_GATE);

  if (qualified.length === 0) {
    return { signals: [], consensusSentiment: "neutral", reliabilityMet: false };
  }

  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const s of qualified) {
    counts[s.sentiment]++;
  }

  let consensusSentiment: CommunitySnapshot["consensusSentiment"] = "mixed";
  const total = qualified.length;
  if (counts.bullish / total >= 0.6) {
    consensusSentiment = "bullish";
  } else if (counts.bearish / total >= 0.6) {
    consensusSentiment = "bearish";
  } else if (counts.neutral / total >= 0.6) {
    consensusSentiment = "neutral";
  }

  return {
    signals: qualified,
    consensusSentiment,
    reliabilityMet: true,
  };
}

/**
 * Format PULSE's morning market snapshot (Discord format).
 * Matches the exact format from the plan's Section 7.
 */
export function formatPulseSnapshot(snapshot: MarketSnapshot): string {
  const lines: string[] = [];

  const date = new Date(snapshot.snapshotAt).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  lines.push(`📊 **MARKET SNAPSHOT — ${date}**`);
  lines.push("");

  // Crypto section — all 6: BTC, ETH, SOL, XRP, AVAX, ARB
  const cryptoSymbols = new Set(["BTC", "ETH", "SOL", "XRP", "AVAX", "ARB"]);
  const cryptoPrices = snapshot.prices.filter((p) => cryptoSymbols.has(p.symbol));
  if (cryptoPrices.length > 0) {
    lines.push("🪙 **CRYPTO (24h)**");
    for (const p of cryptoPrices) {
      const sign = p.changePct24h >= 0 ? "+" : "";
      const indicator = Math.abs(p.changePct24h) >= 5 ? "🔴" : "";
      lines.push(
        `${p.symbol}: $${p.price.toLocaleString()} [${sign}${p.changePct24h.toFixed(1)}%] ${indicator}`.trimEnd(),
      );
    }
    lines.push("");
  }

  // Stocks section
  const stockPrices = snapshot.prices.filter((p) =>
    ["^GSPC", "^IXIC", "NVDA", "MSFT", "AAPL"].includes(p.symbol),
  );
  if (stockPrices.length > 0) {
    lines.push("📈 **STOCKS**");
    const gspc = stockPrices.find((p) => p.symbol === "^GSPC");
    const ixic = stockPrices.find((p) => p.symbol === "^IXIC");
    if (gspc) {
      const sign = gspc.changePct24h >= 0 ? "+" : "";
      lines.push(
        `^GSPC: [${sign}${gspc.changePct24h.toFixed(1)}%] | ^IXIC: [${ixic ? (ixic.changePct24h >= 0 ? "+" : "") + ixic.changePct24h.toFixed(1) + "%" : "N/A"}]`,
      );
    }
    const movers = stockPrices.filter((p) => !p.symbol.startsWith("^"));
    if (movers.length > 0) {
      const moverStr = movers
        .slice(0, 3)
        .map((p) => {
          const sign = p.changePct24h >= 0 ? "+" : "";
          return `${p.symbol} [${sign}${p.changePct24h.toFixed(1)}%]`;
        })
        .join(" | ");
      lines.push(`Movers: ${moverStr}`);
    }
    lines.push("");
  }

  // Pokemon TCG section (weekly movers — supply/demand driven)
  const pokemonPrices = snapshot.prices.filter((p) => p.symbol.startsWith("POKEMON"));
  if (pokemonPrices.length > 0) {
    lines.push("🎴 **POKEMON TCG**");
    for (const p of pokemonPrices.slice(0, 3)) {
      const sign = p.changePct7d >= 0 ? "+" : "";
      const label = p.symbol.replace("POKEMON_", "").replace(/_/g, " ");
      const indicator = Math.abs(p.changePct7d) >= 15 ? "🔥" : "";
      lines.push(`${label}: ${sign}${p.changePct7d.toFixed(1)}% (7d) ${indicator}`.trimEnd());
    }
    lines.push("");
  }

  // Macro Watch section — VIX, 10Y, DXY, Gold
  if (snapshot.macro && snapshot.macro.length > 0) {
    lines.push("📐 **MACRO WATCH**");
    const macroStr = snapshot.macro
      .slice(0, 4)
      .map(
        (m) => `${m.label}: ${m.value.toFixed(m.unit === "%" ? 2 : 0)}${m.unit === "%" ? "%" : ""}`,
      )
      .join(" | ");
    lines.push(macroStr);
    lines.push("");
  }

  // Alerts section
  const p0p1 = snapshot.alerts.filter((a) => a.severity === "P0" || a.severity === "P1");
  if (p0p1.length > 0) {
    lines.push("⚡ **ALERTS**");
    for (const alert of p0p1.slice(0, 3)) {
      lines.push(`${alert.severity === "P0" ? "🚨" : "⚠️"} ${alert.message}`);
    }
    lines.push("");
  }

  // Community sentiment (only when reliability gate met)
  if (snapshot.community.reliabilityMet) {
    lines.push("🌐 **COMMUNITY SENTIMENT**");
    const sentimentEmoji = {
      bullish: "📈",
      bearish: "📉",
      neutral: "➡️",
      mixed: "↔️",
    }[snapshot.community.consensusSentiment];
    lines.push(`Overall: ${sentimentEmoji} ${snapshot.community.consensusSentiment.toUpperCase()}`);
    // Show up to 2 top signals
    const top = snapshot.community.signals.slice(0, 2);
    for (const s of top) {
      const source =
        s.source === "x" ? `X/${s.account ?? "feed"}` : `r/${s.subreddit ?? "unknown"}`;
      lines.push(`${source}: ${s.content.slice(0, 80)}${s.content.length > 80 ? "..." : ""}`);
    }
  }

  const result = lines.join("\n").trim();
  return result.length > 1990 ? result.slice(0, 1987) + "..." : result;
}

/**
 * Determine if an alert should be sent based on quiet hours.
 * Flash crashes (P0) bypass quiet hours entirely.
 */
export function shouldSendAlert(
  alert: MarketAlert,
  quietHoursStart = 22,
  quietHoursEnd = 6,
): boolean {
  if (alert.isFlashCrash) {
    return true;
  } // P0: always send
  if (alert.severity === "P0") {
    return true;
  }

  const now = new Date();
  const hourET = parseInt(
    now.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }),
    10,
  );

  // Quiet hours: don't send P2/P3 alerts
  if (hourET >= quietHoursStart || hourET < quietHoursEnd) {
    return alert.severity === "P1"; // P1 still sends in quiet hours
  }
  return true;
}
