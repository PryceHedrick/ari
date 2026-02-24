import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type RouteRule = {
  match: RegExp;
  modelOverride: string;
  providerOverride?: string;
};

const DEFAULT_ROUTE_RULES: RouteRule[] = [
  {
    match: /(long-form|strategy|deep analysis|roadmap|architecture)/i,
    modelOverride: "anthropic/claude-opus-4-6",
    providerOverride: "openrouter",
  },
  {
    match: /(market update|pokemon|daily script|thumbnail|clip)/i,
    modelOverride: "anthropic/claude-sonnet-4-5",
    providerOverride: "openrouter",
  },
  {
    match: /(scan|heartbeat|status|health check|monitor)/i,
    modelOverride: "anthropic/claude-haiku-4-5",
    providerOverride: "openrouter",
  },
];

export function selectRoute(prompt: string): RouteRule | undefined {
  return DEFAULT_ROUTE_RULES.find((rule) => rule.match.test(prompt));
}

export function registerAgentCoordinator(api: OpenClawPluginApi): void {
  api.on("before_model_resolve", (event) => {
    const selected = selectRoute(event.prompt);
    if (!selected) {
      return undefined;
    }
    return {
      modelOverride: selected.modelOverride,
      providerOverride: selected.providerOverride,
    };
  });
}
