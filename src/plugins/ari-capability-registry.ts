/**
 * ARI Capability Registry — tracks all external integrations and their env requirements.
 *
 * Used by:
 *   - scripts/capabilities-report.ts (CLI report)
 *   - /ari-capabilities Discord command
 *
 * Safety: NEVER reads env var values — only checks presence (trimmed length > 0).
 */

export type CapabilityName =
  | "anthropic"
  | "openai"
  | "googleAI"
  | "xai"
  | "perplexity"
  | "elevenlabs"
  | "xIntel"
  | "discord"
  | "weather"
  | "notion"
  | "tavily"
  | "alphavantage"
  | "firecrawl";

export type CapabilityEntry = {
  name: CapabilityName;
  label: string;
  /** All vars must be non-empty for capability to be available. */
  requiredEnvVars: string[];
  /** If set, this env var must equal "true" for capability to be fully active. */
  featureFlag?: string;
  usedBy: string[]; // plugin IDs
  costRisk: "none" | "low" | "medium" | "high";
  dailyUtility: 1 | 2 | 3 | 4 | 5;
};

export const CAPABILITY_REGISTRY: CapabilityEntry[] = [
  {
    name: "anthropic",
    label: "Anthropic API",
    requiredEnvVars: ["ANTHROPIC_API_KEY"],
    usedBy: ["ari-kernel", "ari-ai"],
    costRisk: "low",
    dailyUtility: 5,
  },
  {
    name: "discord",
    label: "Discord",
    requiredEnvVars: ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"],
    usedBy: ["gateway"],
    costRisk: "none",
    dailyUtility: 5,
  },
  {
    name: "perplexity",
    label: "Perplexity",
    requiredEnvVars: ["PERPLEXITY_API_KEY"],
    usedBy: ["ari-ai"],
    costRisk: "low",
    dailyUtility: 5,
  },
  {
    name: "googleAI",
    label: "Google AI (Gemini)",
    requiredEnvVars: ["GEMINI_API_KEY"],
    usedBy: ["ari-ai"],
    costRisk: "low",
    dailyUtility: 4,
  },
  {
    name: "openai",
    label: "OpenAI API",
    requiredEnvVars: ["OPENAI_API_KEY"],
    usedBy: ["ari-ai"],
    costRisk: "low",
    dailyUtility: 4,
  },
  {
    name: "xai",
    label: "xAI / Grok",
    requiredEnvVars: ["XAI_API_KEY"],
    usedBy: ["ari-ai"],
    costRisk: "low",
    dailyUtility: 3,
  },
  {
    name: "elevenlabs",
    label: "ElevenLabs TTS",
    requiredEnvVars: ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"],
    featureFlag: "ARI_VOICE_ENABLED",
    usedBy: ["ari-voice"],
    costRisk: "medium",
    dailyUtility: 4,
  },
  {
    name: "xIntel",
    label: "X / Twitter Intel",
    requiredEnvVars: ["X_BEARER_TOKEN"],
    featureFlag: "ARI_ENABLE_X_INTEL",
    usedBy: ["ari-market"],
    costRisk: "none",
    dailyUtility: 4,
  },
  {
    name: "weather",
    label: "Weather API",
    requiredEnvVars: ["WEATHER_API_KEY"],
    usedBy: ["ari-briefings"],
    costRisk: "none",
    dailyUtility: 3,
  },
  {
    name: "firecrawl",
    label: "Firecrawl",
    requiredEnvVars: ["FIRECRAWL_API_KEY"],
    usedBy: ["ari-ai"],
    costRisk: "low",
    dailyUtility: 3,
  },
  {
    name: "notion",
    label: "Notion",
    requiredEnvVars: ["NOTION_API_KEY"],
    usedBy: ["ari-notion"],
    costRisk: "low",
    dailyUtility: 2,
  },
  {
    name: "tavily",
    label: "Tavily",
    requiredEnvVars: ["TAVILY_API_KEY"],
    usedBy: [],
    costRisk: "low",
    dailyUtility: 1,
  },
  {
    name: "alphavantage",
    label: "Alpha Vantage",
    requiredEnvVars: ["ALPHA_VANTAGE_API_KEY"],
    usedBy: [],
    costRisk: "low",
    dailyUtility: 2,
  },
];

/**
 * Returns true if all required env vars are non-empty AND
 * feature flag (if any) equals "true".
 * Never reads the values of env vars — only checks presence.
 */
export function isCapabilityAvailable(name: CapabilityName): boolean {
  const entry = CAPABILITY_REGISTRY.find((c) => c.name === name);
  if (!entry) {
    return false;
  }
  const allVarsPresent = entry.requiredEnvVars.every(
    (v) => (process.env[v] ?? "").trim().length > 0,
  );
  if (!allVarsPresent) {
    return false;
  }
  if (entry.featureFlag) {
    return process.env[entry.featureFlag] === "true";
  }
  return true;
}

export type CapabilityStatus = CapabilityEntry & {
  available: boolean;
  missingVars: string[];
};

/**
 * Returns status for every registered capability.
 * Never reads env var values — only checks names for presence.
 */
export function getCapabilityStatuses(): CapabilityStatus[] {
  return CAPABILITY_REGISTRY.map((entry) => {
    const missingVars = entry.requiredEnvVars.filter(
      (v) => (process.env[v] ?? "").trim().length === 0,
    );
    const flagMissing =
      entry.featureFlag !== undefined && process.env[entry.featureFlag] !== "true";
    const available = missingVars.length === 0 && !flagMissing;
    return { ...entry, available, missingVars };
  });
}
