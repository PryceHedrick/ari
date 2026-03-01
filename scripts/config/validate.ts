/**
 * ARI SSOT Config Validator — pnpm ari:config:check
 *
 * Checks:
 *   1. All agent names in routing.yaml rules exist in agents.yaml
 *   2. All model IDs in routing rules exist in models.yaml
 *   3. All provider names in rules are known providers
 *   4. requiredEnv fields contain valid env var names (uppercase format)
 *   5. Reports process.env presence for each requiredEnv (name only, no values)
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

type ModelEntry = { id: string; provider: string };
type AgentEntry = { name: string; requiredEnv?: string[]; optionalEnv?: string[] };
type RoutingRule = {
  match?: Record<string, unknown>;
  route?: Record<string, unknown>;
  fallback?: Record<string, unknown>;
};

const KNOWN_PROVIDERS = new Set([
  "anthropic",
  "google",
  "openai",
  "openai-codex",
  "xai",
  "perplexity",
]);

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;

let errors = 0;
let warnings = 0;

function ok(msg: string): void {
  console.log(`  ✅ ${msg}`);
}

function warn(msg: string): void {
  console.log(`  ⚠️  ${msg}`);
  warnings++;
}

function fail(msg: string): void {
  console.log(`  ❌ ${msg}`);
  errors++;
}

function loadYaml<T>(path: string): T {
  try {
    return parseYaml(readFileSync(path, "utf8")) as T;
  } catch (err) {
    fail(`Cannot read ${path}: ${String(err)}`);
    process.exit(1);
  }
}

function main(): void {
  console.log("\nARI Config Validator");
  console.log("=".repeat(40));

  const models = loadYaml<{ models: ModelEntry[] }>("config/models.yaml");
  const agents = loadYaml<{ agents: AgentEntry[] }>("config/agents.yaml");
  const routing = loadYaml<{ version: number; rules: RoutingRule[] }>("config/routing.yaml");

  const modelIds = new Set(models.models.map((m) => m.id));
  const agentNames = new Set(agents.agents.map((a) => a.name));

  // ── Check 1: Routing rule agent names exist ─────────────────────────────
  console.log("\n[1] Routing agent names:");
  for (const rule of routing.rules) {
    const agentName = rule.match?.agentName as string | undefined;
    if (agentName) {
      if (agentNames.has(agentName)) {
        ok(`match.agentName="${agentName}" found in agents.yaml`);
      } else {
        fail(`match.agentName="${agentName}" NOT in agents.yaml`);
      }
    }
    // Check route/fallback agent fields
    const routeAgent = rule.route?.agent as string | undefined;
    if (routeAgent && !agentNames.has(routeAgent)) {
      fail(`route.agent="${routeAgent}" NOT in agents.yaml`);
    }
  }
  if (routing.rules.every((r) => !r.match?.agentName)) {
    ok("No agent-specific rules (OK for generic routing)");
  }

  // ── Check 2: Model IDs exist in models.yaml ─────────────────────────────
  console.log("\n[2] Model IDs in routing rules:");
  const routeModels = new Set<string>();
  for (const rule of routing.rules) {
    for (const section of [rule.route, rule.fallback]) {
      const model = section?.model as string | undefined;
      if (model) {
        routeModels.add(model);
      }
    }
  }
  for (const model of routeModels) {
    // Special case: openai-default is a conceptual ID, not in models.yaml
    if (model === "openai-default") {
      ok(`model="${model}" (openai-default is a conceptual fallback ID)`);
    } else if (modelIds.has(model)) {
      ok(`model="${model}" found in models.yaml`);
    } else {
      fail(`model="${model}" NOT in models.yaml`);
    }
  }

  // ── Check 3: Provider names are known ─────────────────────────────────
  console.log("\n[3] Provider names:");
  const routeProviders = new Set<string>();
  for (const rule of routing.rules) {
    for (const section of [rule.route, rule.fallback]) {
      const provider = section?.provider as string | undefined;
      if (provider) {
        routeProviders.add(provider);
      }
    }
  }
  for (const provider of routeProviders) {
    if (KNOWN_PROVIDERS.has(provider)) {
      ok(`provider="${provider}" is known`);
    } else {
      fail(`provider="${provider}" is NOT in known providers list`);
    }
  }

  // ── Check 4: requiredEnv format ─────────────────────────────────────────
  console.log("\n[4] requiredEnv format:");
  for (const agent of agents.agents) {
    for (const envKey of agent.requiredEnv ?? []) {
      if (ENV_VAR_PATTERN.test(envKey)) {
        ok(`${agent.name}.requiredEnv: ${envKey} (valid format)`);
      } else {
        fail(`${agent.name}.requiredEnv: "${envKey}" invalid (must be UPPER_SNAKE_CASE)`);
      }
    }
  }

  // ── Check 5: Report env var presence ────────────────────────────────────
  console.log("\n[5] Environment variable presence:");
  const allRequired = new Map<string, string[]>();
  for (const agent of agents.agents) {
    for (const envKey of agent.requiredEnv ?? []) {
      if (!allRequired.has(envKey)) {
        allRequired.set(envKey, []);
      }
      allRequired.get(envKey)!.push(agent.name);
    }
  }
  for (const [envKey, agentList] of allRequired) {
    const present = !!process.env[envKey];
    const msg = `${envKey} (used by: ${agentList.join(", ")}) → ${present ? "SET" : "NOT SET"}`;
    if (present) {
      ok(msg);
    } else {
      warn(msg);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(40));
  console.log(`Result: ${errors} errors, ${warnings} warnings`);

  if (errors > 0) {
    console.log("FAIL — Fix errors above before deploying.");
    process.exit(1);
  } else {
    console.log("PASS — Config is valid.");
  }
}

main();
