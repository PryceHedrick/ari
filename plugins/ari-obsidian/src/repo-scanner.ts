/**
 * ARI Obsidian Repo Scanner — documents ARI plugins → 10-Projects/ARI/
 */

import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeVaultFile, newTraceHex } from "./vault-manager.js";

export type ScanMode = "baseline" | "deep";

export interface ScanResult {
  mode: ScanMode;
  pluginsDocumented: number;
  outputFile: string;
  traceId: string;
}

export function scanRepo(mode: ScanMode = "baseline"): ScanResult {
  const traceId = newTraceHex();
  const pluginsDir = path.join(process.cwd(), "plugins");
  if (!existsSync(pluginsDir)) {
    return { mode, pluginsDocumented: 0, outputFile: "", traceId };
  }

  const plugins = readdirSync(pluginsDir).filter((d) => {
    const fp = path.join(pluginsDir, d);
    return statSync(fp).isDirectory() && d.startsWith("ari-");
  });

  const today = new Date().toISOString().slice(0, 10);
  let doc = `---
type: report
date: ${today}
source: ari-obsidian
trace_id: ${traceId}
tags: [repo-scan, ari-plugins]
---
# ARI Plugin Registry — ${today} (${mode} scan)

| Plugin | Description | Status |
|--------|-------------|--------|
`;

  for (const plugin of plugins) {
    const manifestPath = path.join(pluginsDir, plugin, "openclaw.plugin.json");
    const pkgPath = path.join(pluginsDir, plugin, "package.json");
    let description = "";
    try {
      if (existsSync(manifestPath)) {
        const m = JSON.parse(readFileSync(manifestPath, "utf8")) as { description?: string };
        description = m.description ?? "";
      } else if (existsSync(pkgPath)) {
        const p = JSON.parse(readFileSync(pkgPath, "utf8")) as { description?: string };
        description = p.description ?? "";
      }
    } catch {
      /* skip */
    }
    doc += `| ${plugin} | ${description.slice(0, 80)} | active |\n`;
  }

  if (mode === "deep") {
    doc += `\n## Deep Scan Details\n\n`;
    for (const plugin of plugins) {
      const indexPath = path.join(pluginsDir, plugin, "index.ts");
      doc += `### ${plugin}\n\n`;
      if (existsSync(indexPath)) {
        const pluginContent = readFileSync(indexPath, "utf8");
        // Extract JSDoc comment from top
        const jsdocMatch = /\/\*\*([\s\S]*?)\*\//.exec(pluginContent);
        if (jsdocMatch) {
          doc += "```\n" + jsdocMatch[1].replace(/^\s*\* ?/gm, "").trim() + "\n```\n\n";
        }
      }
    }
  }

  const outputFile = `10-Projects/ARI/repo-overview.md`;
  writeVaultFile(outputFile, doc);

  return { mode, pluginsDocumented: plugins.length, outputFile, traceId };
}
