/**
 * Skill Inventory Scanner — 01-inventory.ts
 *
 * Scans for installed marketplace extensions/skills:
 *   - ~/.openclaw/extensions/
 *   - ~/.openclaw/workspace/extensions/
 *   - openclaw.config.json5 non-ARI plugin entries
 *
 * Outputs: JSON inventory report (stdout)
 * Usage:   node --import tsx scripts/skill_audit/01-inventory.ts
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type InventoryItem = {
  type: "extension" | "config-entry";
  location: string;
  name: string;
  isAriInternal: boolean;
};

function scanDir(dir: string, type: "extension"): InventoryItem[] {
  if (!existsSync(dir)) {
    return [];
  }
  const items: InventoryItem[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const isAri = entry.name.startsWith("ari-");
    items.push({
      type,
      location: path.join(dir, entry.name),
      name: entry.name,
      isAriInternal: isAri,
    });
  }
  return items;
}

async function scanConfig(): Promise<InventoryItem[]> {
  const configPath = "openclaw.config.json5";
  if (!existsSync(configPath)) {
    return [];
  }
  try {
    const { parse } = (await import("json5")) as { parse: (s: string) => unknown };
    const raw = readFileSync(configPath, "utf8");
    const config = parse(raw) as { plugins?: { allow?: string[] } };
    const allowList = config.plugins?.allow ?? [];
    return allowList.map((name) => ({
      type: "config-entry" as const,
      location: configPath,
      name,
      isAriInternal: name.startsWith("ari-"),
    }));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const extensions1 = scanDir(path.join(homedir(), ".openclaw", "extensions"), "extension");
  const extensions2 = scanDir(
    path.join(homedir(), ".openclaw", "workspace", "extensions"),
    "extension",
  );
  const configEntries = await scanConfig();

  const all = [...extensions1, ...extensions2, ...configEntries];
  const marketplaceItems = all.filter((i) => !i.isAriInternal);

  const report = {
    timestamp: new Date().toISOString(),
    total: all.length,
    marketplace: marketplaceItems.length,
    internal: all.length - marketplaceItems.length,
    items: all,
    marketplaceItems,
    assessment:
      marketplaceItems.length === 0
        ? "No marketplace skills installed. Clean slate."
        : `WARNING: ${marketplaceItems.length} marketplace items found. Review required.`,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
