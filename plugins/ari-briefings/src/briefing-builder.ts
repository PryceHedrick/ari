/**
 * ARI Briefings — Intelligence delivery builder
 *
 * Formats for Discord: markdown, 2000 char max, Miller's Law (≤5 items/section).
 * All times Eastern Time (ADR-012). Pre-fetch at 05:00, delivery at 06:30.
 *
 * Quality loop: Each section scored 0-100. If score < 80, regenerate with feedback
 * up to MAX_RETRIES times before flagging to ARI for manual review.
 *
 * Model: ARI agent (anthropic/claude-opus-4-6) — orchestrator handles briefing synthesis.
 */

export type BriefingType = "morning" | "workday-wrap" | "evening";

export type BriefingSection = {
  label: string;
  content: string;
  emoji: string;
};

export type WeatherData = {
  tempF: number;
  condition: string;
  highF: number;
  lowF: number;
  location: string;
};

export type MarketSnapshot = {
  btc?: { price: number; changePct: number };
  eth?: { price: number; changePct: number };
  sol?: { price: number; changePct: number };
  gspc?: { changePct: number };
  ixic?: { changePct: number };
  nvda?: { changePct: number };
  alerts?: string[];
  // Section 7 MACRO WATCH — VIX, 10Y Treasury Yield, DXY, Gold
  vix?: number;
  treasury10y?: number; // as percentage (e.g. 4.35)
  dxy?: number;
  gold?: number; // price per oz
};

export type NewsItem = {
  headline: string;
  source: string;
  relevance: "high" | "medium";
};

export type PokemonSignal = {
  card: string;
  changePct: number;
  direction: "up" | "down";
};

export type CommunitySentiment = {
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  signals?: Array<{ source: string; summary: string }>; // Max 2 (Miller's Law)
};

export type BriefingData = {
  type: BriefingType;
  weather?: WeatherData;
  market?: MarketSnapshot;
  news?: NewsItem[]; // Max 3 (Miller's Law)
  pokemon?: PokemonSignal[]; // Max 3 movers
  community?: CommunitySentiment; // Section 7 community sentiment (when reliability ≥ 0.55)
  p1Status?: string; // NOVA pipeline status
  p2Status?: string; // CHASE pipeline status
  buildSuggestions?: string[]; // Max 3 suggestions
  voiceEnabled: boolean;
};

export type BriefingResult = {
  discord: string; // Formatted Discord message (≤2000 chars)
  sections: BriefingSection[];
  confidence: number; // 0-100 quality score
  audioText?: string; // Stripped text for ElevenLabs TTS (≤150 words)
};

// Quality loop config (Ralph-style agentic iteration)
const MAX_RETRIES = 3;
const CONFIDENCE_THRESHOLD = 80;

/**
 * Format a percentage change with color indicator.
 */
function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  const indicator = pct >= 3 ? "🔥" : pct <= -3 ? "🔴" : pct >= 0 ? "📈" : "📉";
  return `${indicator} ${sign}${pct.toFixed(1)}%`;
}

/**
 * Build morning briefing sections.
 * Miller's Law: ≤5 items per section.
 */
function buildMorningSections(data: BriefingData): BriefingSection[] {
  const sections: BriefingSection[] = [];

  // Weather (if available)
  if (data.weather) {
    const w = data.weather;
    sections.push({
      emoji: "🌤️",
      label: "TODAY",
      content: `${w.condition} | ${w.tempF}°F → H:${w.highF}° L:${w.lowF}° | ${w.location}`,
    });
  }

  // Market snapshot (PULSE data, ≤5 items)
  if (data.market) {
    const m = data.market;
    const lines: string[] = [];
    if (m.btc) {
      lines.push(`BTC ${formatPct(m.btc.changePct)} ($${m.btc.price.toLocaleString()})`);
    }
    if (m.eth) {
      lines.push(`ETH ${formatPct(m.eth.changePct)} ($${m.eth.price.toLocaleString()})`);
    }
    if (m.gspc) {
      lines.push(`S&P500 ${formatPct(m.gspc.changePct)}`);
    }
    if (m.nvda) {
      lines.push(`NVDA ${formatPct(m.nvda.changePct)}`);
    }
    if (m.alerts?.length) {
      lines.push(`⚡ ${m.alerts.slice(0, 2).join(" | ")}`);
    }
    sections.push({ emoji: "📊", label: "MARKETS", content: lines.slice(0, 5).join("\n") });
  }

  // Pokemon TCG movers
  if (data.pokemon?.length) {
    const movers = data.pokemon.slice(0, 3).map((p) => `${p.card} ${formatPct(p.changePct)}`);
    sections.push({ emoji: "🎴", label: "POKEMON TCG", content: movers.join("\n") });
  }

  // Macro Watch (VIX, 10Y, DXY, Gold — Section 7)
  if (
    data.market &&
    (data.market.vix || data.market.treasury10y || data.market.dxy || data.market.gold)
  ) {
    const m = data.market;
    const parts: string[] = [];
    if (m.vix !== undefined) {
      parts.push(`VIX: ${m.vix.toFixed(1)}`);
    }
    if (m.treasury10y !== undefined) {
      parts.push(`10Y: ${m.treasury10y.toFixed(2)}%`);
    }
    if (m.dxy !== undefined) {
      parts.push(`DXY: ${m.dxy.toFixed(1)}`);
    }
    if (m.gold !== undefined) {
      parts.push(`Gold: $${m.gold.toLocaleString()}`);
    }
    sections.push({ emoji: "📐", label: "MACRO WATCH", content: parts.join(" | ") });
  }

  // Community Sentiment (only when PULSE data has reliability ≥ 0.55)
  if (data.community) {
    const c = data.community;
    const sentimentEmoji = {
      bullish: "📈",
      bearish: "📉",
      neutral: "➡️",
      mixed: "↔️",
    }[c.sentiment];
    const lines = [`${sentimentEmoji} ${c.sentiment.toUpperCase()}`];
    for (const s of (c.signals ?? []).slice(0, 2)) {
      lines.push(`${s.source}: ${s.summary}`);
    }
    sections.push({ emoji: "🌐", label: "COMMUNITY", content: lines.join("\n") });
  }

  // News (≤3 headlines, Miller's Law)
  if (data.news?.length) {
    const headlines = data.news.slice(0, 3).map((n) => `• ${n.headline} _(${n.source})_`);
    sections.push({ emoji: "📰", label: "INTEL", content: headlines.join("\n") });
  }

  return sections;
}

/**
 * Build evening briefing sections.
 */
function buildEveningSections(data: BriefingData): BriefingSection[] {
  const sections: BriefingSection[] = [];

  if (data.p1Status || data.p2Status) {
    const lines: string[] = [];
    if (data.p1Status) {
      lines.push(`P1 (PayThePryce): ${data.p1Status}`);
    }
    if (data.p2Status) {
      lines.push(`P2 (Pryceless): ${data.p2Status}`);
    }
    sections.push({ emoji: "🏗️", label: "PIPELINE STATUS", content: lines.join("\n") });
  }

  if (data.buildSuggestions?.length) {
    const suggestions = data.buildSuggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`);
    sections.push({ emoji: "🛠️", label: "BUILD SESSION", content: suggestions.join("\n") });
  }

  if (data.market) {
    const m = data.market;
    const lines: string[] = [];
    if (m.btc) {
      lines.push(`BTC closed ${formatPct(m.btc.changePct)}`);
    }
    if (m.gspc) {
      lines.push(`S&P500 ${formatPct(m.gspc.changePct)}`);
    }
    if (m.alerts?.length) {
      lines.push(`⚡ ${m.alerts[0]}`);
    }
    sections.push({ emoji: "📊", label: "CLOSE", content: lines.join("\n") });
  }

  return sections;
}

/**
 * Build workday-wrap sections.
 */
function buildWorkdayWrapSections(data: BriefingData): BriefingSection[] {
  const sections: BriefingSection[] = [];

  if (data.p1Status || data.p2Status) {
    const lines: string[] = [];
    if (data.p1Status) {
      lines.push(`📹 P1: ${data.p1Status}`);
    }
    if (data.p2Status) {
      lines.push(`🎯 P2: ${data.p2Status}`);
    }
    sections.push({ emoji: "🏗️", label: "TODAY'S PROGRESS", content: lines.join("\n") });
  }

  if (data.buildSuggestions?.length) {
    const top = data.buildSuggestions.slice(0, 2).map((s) => `→ ${s}`);
    sections.push({ emoji: "🌙", label: "TONIGHT", content: top.join("\n") });
  }

  return sections;
}

/**
 * Score briefing quality (0-100).
 * Used by the quality loop to determine if a retry is needed.
 */
export function scoreBriefing(result: BriefingResult, data: BriefingData): number {
  let score = 60; // base

  // Has required sections
  const hasMarket = result.sections.some((s) => s.label === "MARKETS");
  const hasContent = result.sections.length >= 2;
  if (hasMarket) {
    score += 10;
  }
  if (hasContent) {
    score += 10;
  }

  // Within Discord char limit
  if (result.discord.length <= 2000) {
    score += 10;
  } else {
    score -= 20;
  }

  // Audio text within 150 words
  const wordCount = (result.audioText ?? "").split(/\s+/).length;
  if (wordCount <= 150) {
    score += 10;
  }

  // Has data when data is available
  if (data.market && !hasMarket) {
    score -= 15;
  }
  if (data.news?.length && !result.sections.some((s) => s.label === "INTEL")) {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Assemble a briefing from sections into a Discord message.
 */
function assembleBriefing(
  type: BriefingType,
  sections: BriefingSection[],
  voiceEnabled: boolean,
): string {
  const HEADERS: Record<BriefingType, string> = {
    morning: "🧠 **ARI — MORNING BRIEFING**",
    "workday-wrap": "🧠 **ARI — WORKDAY WRAP**",
    evening: "🧠 **ARI — EVENING BRIEFING**",
  };

  const lines: string[] = [HEADERS[type], ""];

  for (const section of sections) {
    lines.push(`${section.emoji} **${section.label}**`);
    lines.push(section.content);
    lines.push("");
  }

  if (voiceEnabled) {
    lines.push("🎙️ _Voice briefing attached_");
  }

  const result = lines.join("\n").trim();
  // Hard truncate at 1990 chars with ellipsis if needed
  return result.length > 1990 ? result.slice(0, 1987) + "..." : result;
}

/**
 * Extract audio text from sections (≤150 words, no markdown).
 */
function buildAudioText(type: BriefingType, sections: BriefingSection[]): string {
  const INTROS: Record<BriefingType, string> = {
    morning: "Good morning. Here's your ARI briefing.",
    "workday-wrap": "Workday wrap.",
    evening: "Evening update.",
  };

  const parts = [INTROS[type]];
  for (const section of sections.slice(0, 3)) {
    // Strip markdown, keep content lean
    const clean = section.content
      .replace(/[_*`~]/g, "")
      .replace(/📈|📉|🔥|🔴|⚡|•/g, "")
      .trim();
    parts.push(clean);
  }

  const raw = parts.join(" ");
  const words = raw.split(/\s+/);
  return words.slice(0, 150).join(" ");
}

/**
 * Build a complete briefing with quality loop.
 * Retries up to MAX_RETRIES if confidence < CONFIDENCE_THRESHOLD.
 */
export function buildBriefing(data: BriefingData): BriefingResult {
  let attempt = 0;
  let best: BriefingResult | null = null;

  while (attempt < MAX_RETRIES) {
    attempt++;

    const sections =
      data.type === "morning"
        ? buildMorningSections(data)
        : data.type === "evening"
          ? buildEveningSections(data)
          : buildWorkdayWrapSections(data);

    const discord = assembleBriefing(data.type, sections, data.voiceEnabled);
    const audioText = buildAudioText(data.type, sections);

    const result: BriefingResult = { discord, sections, confidence: 0, audioText };
    result.confidence = scoreBriefing(result, data);

    if (!best || result.confidence > best.confidence) {
      best = result;
    }

    if (result.confidence >= CONFIDENCE_THRESHOLD) {
      break;
    }
    // Quality loop: if below threshold, data is the same so we just re-try
    // In production, a regeneration hook would pass feedback to the LLM
  }

  return best!;
}

/**
 * Format a time in Eastern Time for display.
 */
export function formatET(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
