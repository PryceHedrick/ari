/**
 * ARI Finance Playbook — per-symbol playbook note in vault.
 */

import { randomBytes } from "node:crypto";
import { getSignalForSymbol, getSignalHistory } from "./finance-db.js";
import type { WatchlistEntry } from "./finance-db.js";
import { DISCLAIMER } from "./report-generator.js";

function formatPlaybook(
  symbol: string,
  assetType: string,
  signal: ReturnType<typeof getSignalForSymbol>,
  history: ReturnType<typeof getSignalHistory>,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const traceId = randomBytes(4).toString("hex");

  const historyRows = history
    .map((h) => {
      const delta = JSON.parse(h.delta_json) as Record<string, unknown>;
      return `| ${h.ts.slice(0, 10)} | ${(((delta.confidence as number) ?? 0) * 100).toFixed(0)}% | ${h.event_type} | ${(delta.note as string) ?? ""} | ${h.trace_id ?? ""} |`;
    })
    .join("\n");

  return `---
type: finance-playbook
symbol: ${symbol}
asset_type: ${assetType}
added: ${today}
trace_id: ${traceId}
tags: [finance, playbook, ${assetType}]
---
# ${symbol} — Finance Playbook

> ${DISCLAIMER}

## Thesis
${signal?.thesis ?? "_Fill in: what is the research thesis?_"}

## Triggers (conditions that matter)
- [ ] [Add trigger 1]
- [ ] [Add trigger 2]

## Research Next Steps (no trading actions)
- [ ] [Add research item]

## Invalidation Conditions
> Thesis is invalidated if: [Add condition]

## Confidence History
| Date | Confidence | Intensity | Note | Trace |
|------|-----------|-----------|------|-------|
${historyRows || "| — | 50% | neutral | Initial | — |"}
`;
}

export function createOrUpdatePlaybook(entry: WatchlistEntry): void {
  const signal = getSignalForSymbol(entry.symbol);
  const history = signal ? getSignalHistory(signal.id) : [];
  const content = formatPlaybook(entry.symbol, entry.asset_type, signal, history);

  if (process.env.ARI_OBSIDIAN_ENABLED !== "false") {
    void import("../../ari-obsidian/src/vault-manager.js")
      .then(({ writeVaultFile }) => {
        writeVaultFile(`10-Projects/Finance/${entry.symbol}.md`, content);
      })
      .catch(() => {
        // vault not initialized
      });
  }
}

export function getPlaybookContent(symbol: string): string {
  if (process.env.ARI_OBSIDIAN_ENABLED !== "false") {
    return import("../../ari-obsidian/src/vault-manager.js")
      .then(({ readVaultFile, vaultFileExists }) => {
        const relPath = `10-Projects/Finance/${symbol.toUpperCase()}.md`;
        if (vaultFileExists(relPath)) {
          return readVaultFile(relPath);
        }
        return `No playbook found for ${symbol.toUpperCase()}. Add to watchlist first: /ari-watchlist add ${symbol.toUpperCase()}`;
      })
      .catch(
        () =>
          `No playbook found for ${symbol.toUpperCase()}. Add to watchlist first: /ari-watchlist add ${symbol.toUpperCase()}`,
      ) as unknown as string;
  }
  return `No playbook found for ${symbol.toUpperCase()}. Obsidian not enabled.`;
}
