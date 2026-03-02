/**
 * ARI Scheduler — 24 Cron Tasks (All Eastern Time, ADR-012)
 *
 * The 24 tasks replace the legacy 47 tasks from ARI v10 through consolidation:
 * - SYSTEM tier: health, backup (background, no Discord)
 * - PULSE tier: market scans and pre-fetch (background data collection)
 * - NOVA tier: autonomous content trigger (daily market scan → script queue if ≥15% card move)
 * - ARI tier: intelligence delivery to Discord (visible to Pryce)
 * - AGENT tier: named agent tasks (CHASE 3x/week, DEX weekly, PULSE daily)
 */

export type CronTask = {
  id: string;
  cron: string; // cron expression (America/New_York timezone)
  description: string;
  agent: string; // which named agent handles this
  channel?: string; // Discord channel if posting output
  gate: "auto" | "approval-required" | "operator-only";
  priority: 0 | 1 | 2 | 3; // P0=critical, P3=background
  // LLM policy: "forbidden" = purely mechanical (no model call allowed),
  // "allowed" (default) = agent dispatch permitted.
  // Only mark "forbidden" for tasks confirmed to be mechanical (no summarization/generation).
  llmPolicy?: "forbidden" | "allowed";
};

/**
 * All 21 scheduled tasks — Eastern Time (America/New_York)
 *
 * ADR-012: ALL cron schedules use Eastern Time
 */
export const CRON_TASKS: CronTask[] = [
  // === SYSTEM TASKS (background, no Discord output) ===
  {
    id: "heartbeat",
    cron: "*/15 * * * *", // every 15 minutes
    description: "Agent health check and system heartbeat",
    agent: "system",
    gate: "auto",
    priority: 0,
    llmPolicy: "forbidden", // Confirmed mechanical: DB write + trace log only
  },
  {
    id: "daily-backup",
    cron: "0 3 * * *", // 03:00 daily
    description: "Daily backup of SQLite databases and workspace files",
    agent: "system",
    gate: "auto",
    priority: 2,
    llmPolicy: "forbidden", // Confirmed mechanical: log + backup trigger only
  },

  // === PULSE MARKET TASKS (PULSE 📡) ===
  {
    id: "pre-fetch-market",
    cron: "0 5 * * *", // 05:00 daily
    description:
      "Pre-fetch all market data for morning briefing (CoinGecko + Finnhub + pokemontcg.io)",
    agent: "PULSE",
    gate: "auto",
    priority: 1,
  },
  {
    id: "portfolio-snapshot",
    cron: "45 6 * * *", // 06:45 daily
    description: "Portfolio snapshot for morning briefing → #market-alerts",
    agent: "PULSE",
    channel: "market-alerts",
    gate: "auto",
    priority: 1,
  },
  {
    id: "pokemon-price-scan",
    cron: "0 10 * * *", // 10:00 daily
    description: "Pokemon TCG price scan — detect threshold moves and Z-score anomalies",
    agent: "PULSE",
    channel: "pokemon-market",
    gate: "auto",
    priority: 2,
  },
  {
    id: "market-midday",
    cron: "0 12 * * *", // 12:00 daily
    description: "Midday market snapshot — crypto + stocks + macro → #market-alerts",
    agent: "PULSE",
    channel: "market-alerts",
    gate: "auto",
    priority: 2,
  },
  {
    id: "market-close",
    cron: "15 16 * * 1-5", // 16:15 weekdays
    description: "Market close summary — daily P&L + notable moves → #market-alerts",
    agent: "PULSE",
    channel: "market-alerts",
    gate: "auto",
    priority: 1,
  },

  // === DEX RESEARCH TASKS (DEX 🗂️) ===
  {
    id: "news-digest",
    cron: "0 7 * * *", // 07:00 daily
    description: "Morning news digest — top AI/market/Pokemon news via Perplexity Sonar",
    agent: "DEX",
    gate: "auto",
    priority: 2,
  },
  {
    id: "ai-research-scan",
    cron: "0 8 * * *", // 08:00 daily
    description: "arXiv + Anthropic blog scan for AI breakthroughs via Perplexity Sonar Deep",
    agent: "DEX",
    gate: "auto",
    priority: 3,
  },
  {
    id: "x-likes-digest",
    cron: "0 20 * * *", // 20:00 daily
    description: "X/Twitter likes digest — synthesize community signals via X API",
    agent: "DEX",
    channel: "research-digest",
    gate: "auto",
    priority: 3,
  },
  {
    id: "weekly-feedback-synthesis",
    cron: "0 9 * * 1", // Monday 09:00
    description: "Weekly P1/P2 feedback synthesis → prompt improvement → #research-digest",
    agent: "DEX",
    channel: "research-digest",
    gate: "auto",
    priority: 2,
  },

  // === ARI BRIEFING TASKS (ARI 🧠) ===
  {
    id: "morning-briefing",
    cron: "30 6 * * *", // 06:30 daily
    description: "Morning briefing → #ari-main (weather + portfolio + news + PULSE snapshot)",
    agent: "ARI",
    channel: "ari-main",
    gate: "auto",
    priority: 0,
  },
  {
    id: "workday-wrap",
    cron: "0 16 * * 1-5", // 16:00 weekdays
    description: "Workday wrap → #ari-main (P1/P2 status + session suggestions)",
    agent: "ARI",
    channel: "ari-main",
    gate: "auto",
    priority: 1,
  },
  {
    id: "evening-briefing",
    cron: "0 21 * * *", // 21:00 daily
    description: "Evening briefing → #ari-main (day summary + build session prep)",
    agent: "ARI",
    channel: "ari-main",
    gate: "auto",
    priority: 1,
  },
  {
    id: "memory-dedup",
    cron: "0 22 * * *", // 22:00 daily
    description: "Memory deduplication — prune stale/duplicate MEMORY.md entries",
    agent: "ARI",
    gate: "auto",
    priority: 3,
  },
  {
    id: "cost-audit",
    cron: "45 23 * * *", // 23:45 daily
    description: "Daily cost audit via OpenRouter API — spend visibility report",
    agent: "ARI",
    gate: "auto",
    priority: 3,
  },

  // === NOVA CONTENT TASKS (NOVA 🎬) ===
  {
    id: "nova-market-scan",
    cron: "0 10 * * *", // 10:00 daily (after PULSE pokemon-price-scan)
    description:
      "NOVA autonomous scan — read PULSE market data; if any card moved ≥15%/7d, auto-generate script outline → #video-queue for approval",
    agent: "NOVA",
    channel: "video-queue",
    gate: "approval-required", // Script outline queued; Pryce approves before full production
    priority: 2,
  },

  // === CHASE BUSINESS TASKS (CHASE 🎯) ===
  {
    id: "leads-pipeline",
    cron: "0 14 * * 1", // Monday 14:00
    description:
      "P2 lead discovery (Monday) — SerpAPI + Apollo + GBP scan for Indiana B2B leads → #leads",
    agent: "CHASE",
    channel: "leads",
    gate: "auto", // Discovery is auto; outreach requires approval-required
    priority: 2,
  },
  {
    id: "leads-pipeline-wed",
    cron: "0 14 * * 3", // Wednesday 14:00
    description: "P2 lead discovery (Wednesday) — mid-week Indiana B2B pipeline run → #leads",
    agent: "CHASE",
    channel: "leads",
    gate: "auto",
    priority: 2,
  },
  {
    id: "leads-pipeline-fri",
    cron: "0 10 * * 5", // Friday 10:00
    description: "P2 lead discovery (Friday) — end-of-week Indiana B2B pipeline run → #leads",
    agent: "CHASE",
    channel: "leads",
    gate: "auto",
    priority: 2,
  },
  {
    id: "crm-sync",
    cron: "0 18 * * 5", // Friday 18:00
    description: "Weekly CRM sync — update lead statuses, log outcomes, archive cold leads",
    agent: "CHASE",
    gate: "auto",
    priority: 3,
  },

  // === ARI WEEKLY TASKS (ARI 🧠) ===
  {
    id: "weekly-wisdom",
    cron: "0 18 * * 0", // Sunday 18:00
    description: "Weekly wisdom digest + soul review → #ari-main",
    agent: "ARI",
    channel: "ari-main",
    gate: "auto",
    priority: 2,
  },

  // === DEX OBSIDIAN VAULT TASKS (ARI_OBSIDIAN_ENABLED guard in handler) ===
  {
    id: "morning-vault-digest",
    cron: "0 5 * * *", // daily 05:00 ET (before 06:30 briefing pre-fetch)
    description: "Obsidian incremental reindex + daily digest + context packs",
    agent: "DEX",
    gate: "auto",
    priority: 3,
  },
  {
    id: "weekly-vault-scan",
    cron: "0 9 * * 1", // Monday 09:00 ET
    description: "Obsidian weekly digest + repo scanner (baseline) + full reindex",
    agent: "DEX",
    gate: "auto",
    priority: 3,
  },
  {
    id: "vault-compaction",
    cron: "30 22 * * *", // 22:30 daily ET — fragment grouping + retention + open-loop aging
    description: "Vault compaction: group inbox fragments, archive old, age open loops",
    agent: "ARI",
    gate: "auto",
    priority: 3,
  },
];

/**
 * Get all tasks for a specific agent.
 */
export function getTasksByAgent(agentName: string): CronTask[] {
  return CRON_TASKS.filter((t) => t.agent === agentName || t.agent === agentName.toUpperCase());
}

/**
 * Get all tasks for a specific priority level.
 */
export function getTasksByPriority(priority: 0 | 1 | 2 | 3): CronTask[] {
  return CRON_TASKS.filter((t) => t.priority === priority);
}

/**
 * Get critical (P0) tasks — always fire, ignore quiet hours.
 */
export function getCriticalTasks(): CronTask[] {
  return getTasksByPriority(0);
}
