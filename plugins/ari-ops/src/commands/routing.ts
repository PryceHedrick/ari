/**
 * /ari-routing — routing rules snapshot from config/routing.yaml.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

type RoutingRule = {
  match: Record<string, unknown>;
  route: Record<string, unknown>;
  fallback?: Record<string, unknown>;
};

export async function handleRoutingCommand(): Promise<{ text: string }> {
  try {
    const raw = readFileSync("config/routing.yaml", "utf8");
    const parsed = parseYaml(raw) as { version: number; rules: RoutingRule[] };

    const lines = [
      `**Routing Rules** (v${parsed.version ?? 1}, ${parsed.rules.length} rules)`,
      "```",
    ];

    const fmtEntries = (obj: Record<string, unknown>): string =>
      Object.entries(obj)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");

    for (let i = 0; i < parsed.rules.length; i++) {
      const rule = parsed.rules[i];
      const match = fmtEntries(rule.match);
      const route = fmtEntries(rule.route);
      const fb = rule.fallback ? ` | fallback: ${fmtEntries(rule.fallback)}` : "";
      lines.push(`${String(i + 1).padStart(2)}. match: ${match}`);
      lines.push(`    route: ${route}${fb}`);
    }

    lines.push("```");
    return { text: lines.join("\n") };
  } catch {
    return {
      text: "config/routing.yaml not found. Run `pnpm ari:config:check` to validate.",
    };
  }
}
