/**
 * ARI Finance Network Guard — domain allowlist enforcement.
 * Every HTTP call must pass assertNetworkDomain() before fetch.
 */

import { emitSpan } from "../../ari-ops/src/tracer.js";

export type NewsProvider = "none" | "rss" | "jina" | "manual";

const DECLARED_DOMAINS: Record<NewsProvider, string[]> = {
  none: [],
  rss: ["finance.yahoo.com", "feeds.coindesk.com", "query1.finance.yahoo.com"],
  jina: ["s.jina.ai"],
  manual: [],
};

export function resolveNewsProvider(): NewsProvider {
  const env = process.env.ARI_FINANCE_NEWS_PROVIDER as NewsProvider | undefined;
  if (env && ["none", "rss", "jina", "manual"].includes(env)) {
    return env;
  }
  const profile = process.env.ARI_PROFILE ?? "daily";
  if (profile === "minimal") {
    return "none";
  }
  if (process.env.JINA_API_KEY) {
    return "jina";
  }
  return "rss";
}

export function assertNetworkDomain(url: string): void {
  const provider = resolveNewsProvider();
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    emitSpan({
      event: "policy_decision",
      policyAction: "deny",
      policyRule: "invalid_url",
      summary: `Invalid URL: ${url.slice(0, 100)}`,
    } as Parameters<typeof emitSpan>[0]);
    throw new Error(`Network access denied: invalid URL`);
  }

  const allowed = DECLARED_DOMAINS[provider];
  if (!allowed.includes(domain)) {
    emitSpan({
      event: "policy_decision",
      policyAction: "deny",
      policyRule: "undeclared_network_domain",
      summary: `blocked domain: ${domain} (provider: ${provider})`,
    } as Parameters<typeof emitSpan>[0]);
    throw new Error(`Network access denied: undeclared domain ${domain}`);
  }
}

export function getDeclaredDomains(provider?: NewsProvider): string[] {
  return DECLARED_DOMAINS[provider ?? resolveNewsProvider()];
}
