export interface AgentWebhookConfig {
  name: string;
  emoji: string;
  webhookUrl: string | undefined;
}

export const AGENT_WEBHOOKS: Record<string, AgentWebhookConfig> = {
  ARI: {
    name: "ARI",
    emoji: "🧠",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_ARI"],
  },
  NOVA: {
    name: "NOVA",
    emoji: "🎬",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_NOVA"],
  },
  CHASE: {
    name: "CHASE",
    emoji: "🎯",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_CHASE"],
  },
  PULSE: {
    name: "PULSE",
    emoji: "📡",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_PULSE"],
  },
  DEX: {
    name: "DEX",
    emoji: "🗂️",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_DEX"],
  },
  RUNE: {
    name: "RUNE",
    emoji: "🔧",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_RUNE"],
  },
  SYSTEM: {
    name: "SYSTEM",
    emoji: "⚙️",
    webhookUrl: process.env["ARI_DISCORD_WEBHOOK_SYSTEM"],
  },
};

/**
 * Post a message via a per-agent Discord webhook.
 * Returns true if the webhook was configured and the post succeeded.
 * Returns false if the webhook URL is not set (falls back to bot identity).
 */
export async function postViaAgentWebhook(agentKey: string, content: string): Promise<boolean> {
  const agent = AGENT_WEBHOOKS[agentKey];
  if (!agent?.webhookUrl) {
    return false;
  }

  const url = agent.webhookUrl;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `${agent.emoji} ${agent.name}`,
        content,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Returns which agent webhooks are currently configured.
 */
export function resolveConfiguredWebhooks(): string[] {
  return Object.entries(AGENT_WEBHOOKS)
    .filter(([, cfg]) => Boolean(cfg.webhookUrl))
    .map(([key]) => key);
}
