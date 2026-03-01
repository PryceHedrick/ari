import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "./types.js";

export interface DiscordEventRouterConfig {
  channelIds: {
    main: string;
    deep: string;
    marketAlerts: string;
    pokemonMarket: string;
    researchDigest: string;
    systemStatus: string;
    opsDashboard: string;
    videoQueue: string;
    outreachQueue: string;
    apiLogs: string;
    wins: string;
    published: string;
  };
}

type EventPayload = Record<string, unknown>;

type EventRoute = {
  channelKey: keyof DiscordEventRouterConfig["channelIds"];
  format: (payload: EventPayload) => string;
};

/** Safely extract a string from an unknown payload field. */
function str(val: unknown): string {
  if (typeof val === "string") {
    return val;
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  return "";
}

const EVENT_ROUTES: Record<string, EventRoute> = {
  "briefing:ready": {
    channelKey: "main",
    format: (p) => `📋 **Morning Briefing**\n${str(p["content"])}`,
  },
  "briefing:evening_ready": {
    channelKey: "main",
    format: (p) => `🌙 **Evening Briefing**\n${str(p["content"])}`,
  },
  "market:price_alert": {
    channelKey: "marketAlerts",
    format: (p) => `📡 **Price Alert** — ${str(p["symbol"])}: ${str(p["message"])}`,
  },
  "market:pokemon_signal": {
    channelKey: "pokemonMarket",
    format: (p) =>
      `🎴 **${str(p["cardName"])}** — ${str(p["priceDirection"])} ${str(p["pctChange"])}%\n${str(p["message"])}`,
  },
  "market:briefing_ready": {
    channelKey: "marketAlerts",
    format: (p) => `📊 **Market Briefing**\n${str(p["content"])}`,
  },
  "security:anomaly_detected": {
    channelKey: "systemStatus",
    format: (p) =>
      `🚨 **SECURITY ANOMALY** [P0]\nScore: ${str(p["riskScore"])}\nDetails: ${str(p["summary"])}`,
  },
  "budget:warning": {
    channelKey: "systemStatus",
    format: (p) =>
      `⚠️ **Budget Warning** — ${str(p["percentUsed"])}% of $${str(p["limitUsd"])} used\nSpend: $${str(p["spentUsd"])}`,
  },
  "agent:help_request": {
    channelKey: "main",
    format: (p) =>
      `🤝 **Agent Handoff** — ${str(p["fromAgent"])} → ${str(p["toAgent"])}\n${str(p["reason"])}`,
  },
  "ops:git_synced": {
    channelKey: "opsDashboard",
    format: (p) => `🔄 Git sync — ${str(p["repo"])} pulled ${str(p["commits"])} commit(s)`,
  },
  "research:digest_ready": {
    channelKey: "researchDigest",
    format: (p) => `🗂️ **Weekly Research Digest**\n${str(p["content"])}`,
  },
  "pipeline:p1_ready_for_review": {
    channelKey: "videoQueue",
    format: (p) =>
      `🎬 **New Video Package Ready** — Job ${str(p["jobId"])}\nCard: ${str(p["cardName"])} | Confidence: ${str(p["confidence"])}%\nUse \`/ari-p1-approve ${str(p["jobId"])}\` to approve.`,
  },
  "pipeline:p2_ready_for_review": {
    channelKey: "outreachQueue",
    format: (p) =>
      `🎯 **Outreach Ready** — ${str(p["businessName"])}\nScore: ${str(p["score"])}/100 | Bundle: ${str(p["bundleId"])}\nUse \`/ari-p2-approve ${str(p["bundleId"])}\` to approve.`,
  },
  "ops:win_logged": {
    channelKey: "wins",
    format: (p) => `🏆 **Win** — ${str(p["title"])}\n${str(p["summary"])}`,
  },
  "pipeline:published": {
    channelKey: "published",
    format: (p) => `📢 **Published** — ${str(p["title"])}`,
  },
  "ops:trace_log": {
    channelKey: "apiLogs",
    format: (p) => `🔍 **Trace** [${str(p["level"] ?? "info")}] ${str(p["message"])}`,
  },
};

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

export function registerDiscordEventRouter(
  api: OpenClawPluginApi,
  cfg: DiscordEventRouterConfig,
): void {
  const { sendMessageDiscord } = api.runtime.channel.discord;

  api.registerHttpRoute({
    path: "/ari/discord-event",
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }

      let body: { event?: unknown; payload?: unknown };
      try {
        const raw = await readRequestBody(req);
        body = JSON.parse(raw) as { event?: unknown; payload?: unknown };
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }

      const eventName = typeof body.event === "string" ? body.event : "";
      const payload: EventPayload =
        body.payload !== null && typeof body.payload === "object"
          ? (body.payload as EventPayload)
          : {};

      if (!eventName) {
        sendJson(res, 400, { error: "Missing event name" });
        return;
      }

      const route = EVENT_ROUTES[eventName];
      if (!route) {
        api.logger.warn(`[ari-discord-event-router] unknown event: ${eventName}`);
        sendJson(res, 404, { error: `Unknown event: ${eventName}` });
        return;
      }

      const channelId = cfg.channelIds[route.channelKey];
      if (!channelId) {
        api.logger.warn(
          `[ari-discord-event-router] channel not configured for key: ${route.channelKey}`,
        );
        sendJson(res, 200, { ok: false, reason: "channel_not_configured" });
        return;
      }

      try {
        const text = route.format(payload);
        await sendMessageDiscord(`channel:${channelId}`, text);
        api.logger.info(
          `[ari-discord-event-router] dispatched ${eventName} → channel ${channelId}`,
        );
        sendJson(res, 200, { ok: true, event: eventName, channelId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        api.logger.error(`[ari-discord-event-router] failed to send ${eventName}: ${msg}`);
        sendJson(res, 500, { error: msg });
      }
    },
  });

  api.logger.info("[ari-discord-event-router] HTTP route registered: POST /ari/discord-event");
}
