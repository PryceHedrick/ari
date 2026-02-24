import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";

type PluginConfig = {
  allow?: string[];
  load?: {
    paths?: string[];
  };
  entries?: Record<string, { enabled?: boolean }>;
};

const repoRoot = process.cwd();
const pluginsRoot = path.join(repoRoot, "plugins");
const openclawConfigPath = path.join(repoRoot, "openclaw.config.json5");

const ariPluginIds = [
  "ari-kernel",
  "ari-cognitive",
  "ari-workspace",
  "ari-ai",
  "ari-memory",
  "ari-scheduler",
  "ari-briefings",
  "ari-market",
  "ari-governance",
  "ari-agents",
  "ari-autonomous",
  "ari-notion",
  "ari-voice",
] as const;

const requiredSourceTargets: Record<string, string[]> = {
  "ari-kernel": ["src/sanitizer.ts"],
  "ari-cognitive": ["src/cognitive-prompt.ts"],
  "ari-workspace": ["src/workspace-loader.ts"],
  "ari-governance": ["src/governance-gate.ts"],
  "ari-agents": ["src/coordinator.ts"],
};

const errors: string[] = [];
const warnings: string[] = [];

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

function readJson5ObjectFile(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON5.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} did not parse to an object`);
  }
  return parsed as Record<string, unknown>;
}

function assertFileExists(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label} not found: ${filePath}`);
  }
}

function assertPluginManifests(): void {
  for (const pluginId of ariPluginIds) {
    const pluginDir = path.join(pluginsRoot, pluginId);
    const manifestPath = path.join(pluginDir, "openclaw.plugin.json");
    const packageJsonPath = path.join(pluginDir, "package.json");
    const entryPath = path.join(pluginDir, "index.ts");

    assertFileExists(pluginDir, "Plugin directory");
    assertFileExists(manifestPath, "Plugin manifest");
    assertFileExists(packageJsonPath, "Plugin package.json");
    assertFileExists(entryPath, "Plugin entry module");
    if (!fs.existsSync(manifestPath) || !fs.existsSync(packageJsonPath)) {
      continue;
    }

    const manifest = readJsonFile(manifestPath);
    const packageJson = readJsonFile(packageJsonPath);
    const manifestId = typeof manifest.id === "string" ? manifest.id.trim() : "";
    if (manifestId !== pluginId) {
      errors.push(
        `Manifest id mismatch for ${pluginId}: expected "${pluginId}", got "${manifestId || "<empty>"}"`,
      );
    }

    const openclawMeta = packageJson.openclaw as
      | { extensions?: unknown; hooks?: unknown }
      | undefined;
    const extensions = Array.isArray(openclawMeta?.extensions) ? openclawMeta.extensions : [];
    const hasIndexExtension = extensions.some((entry) => String(entry).trim() === "./index.ts");
    if (!hasIndexExtension) {
      errors.push(`${pluginId} missing openclaw.extensions entry for ./index.ts`);
    }

    if (openclawMeta && "hooks" in openclawMeta) {
      warnings.push(
        `${pluginId} declares package-level openclaw.hooks; prefer runtime registration in plugin code.`,
      );
    }

    const requiredTargets = requiredSourceTargets[pluginId] ?? [];
    for (const relativeTarget of requiredTargets) {
      const targetPath = path.join(pluginDir, relativeTarget);
      if (!fs.existsSync(targetPath)) {
        errors.push(`${pluginId} required source target missing: ${relativeTarget}`);
      }
    }
  }
}

function assertOpenClawConfig(): void {
  assertFileExists(openclawConfigPath, "openclaw.config.json5");
  if (!fs.existsSync(openclawConfigPath)) {
    return;
  }

  const config = readJson5ObjectFile(openclawConfigPath) as {
    plugins?: PluginConfig;
  };
  const pluginConfig = config.plugins;
  if (!pluginConfig || typeof pluginConfig !== "object" || Array.isArray(pluginConfig)) {
    errors.push(
      "openclaw.config.json5 must define plugins as an object (not legacy array format).",
    );
    return;
  }

  const loadPaths = Array.isArray(pluginConfig.load?.paths)
    ? pluginConfig.load.paths.map((entry) => String(entry).trim())
    : [];
  if (!loadPaths.includes("plugins")) {
    errors.push('openclaw.config.json5 plugins.load.paths must include "plugins".');
  }

  const allow = Array.isArray(pluginConfig.allow)
    ? pluginConfig.allow.map((entry) => String(entry).trim())
    : [];
  for (const pluginId of ariPluginIds) {
    if (!allow.includes(pluginId)) {
      errors.push(`plugins.allow is missing ${pluginId}`);
    }
  }

  const entries = pluginConfig.entries ?? {};
  for (const pluginId of ariPluginIds) {
    if (!entries[pluginId]) {
      errors.push(`plugins.entries.${pluginId} is missing`);
      continue;
    }
    if (entries[pluginId]?.enabled !== true) {
      errors.push(`plugins.entries.${pluginId}.enabled must be true`);
    }
  }
}

function printReport(): void {
  for (const warning of warnings) {
    console.warn(`WARN: ${warning}`);
  }
  if (errors.length === 0) {
    console.log(
      `OK: validated ${ariPluginIds.length} ARI plugins and openclaw.config.json5 contract wiring.`,
    );
    return;
  }
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = 1;
}

assertPluginManifests();
assertOpenClawConfig();
printReport();
