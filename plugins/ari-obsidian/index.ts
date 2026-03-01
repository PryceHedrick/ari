/**
 * ARI Obsidian Plugin - 15th ARI plugin.
 *
 * Provides Obsidian vault integration: capture, index, digest, context packs,
 * auto-capture of high-signal interactions, task engine, feedback loop.
 *
 * Storage:
 *   ~/.ari/obsidian-vault/        - Markdown vault
 *   ~/.ari/databases/vault-index.db - SQLite WAL index
 *
 * Tools (all ari_ prefix; self-enforce vault boundary):
 *   ari_obsidian_init, ari_obsidian_capture, ari_obsidian_search,
 *   ari_obsidian_digest_daily, ari_obsidian_digest_weekly,
 *   ari_obsidian_scan_repo, ari_obsidian_reindex,
 *   ari_obsidian_status, ari_obsidian_context_pack
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { wireAutoCapture } from "./src/auto-capture.js";
import { handleDigestCommand } from "./src/commands/digest.js";
import { handleNextCommand } from "./src/commands/next.js";
import { handleNoteCommand } from "./src/commands/note.js";
import { handleOpenLoopsCommand } from "./src/commands/open-loops.js";
import { handleRateCommand } from "./src/commands/rate.js";
import { handleScanCommand } from "./src/commands/scan.js";
import { handleVaultSearchCommand } from "./src/commands/search.js";
import { handleVaultStatusCommand } from "./src/commands/status.js";
import { handleTodayCommand } from "./src/commands/today.js";
import { runCompaction } from "./src/compactor.js";
import { generateContextPack } from "./src/context-pack.js";
import { generateDailyDigest, generateWeeklyDigest } from "./src/digest.js";
import { scanRepo } from "./src/repo-scanner.js";
import { reindexVaultSync, getVaultStats, getOpenLoops } from "./src/vault-index.js";
import { initVault } from "./src/vault-manager.js";

function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

const plugin = {
  id: "ari-obsidian",
  name: "ARI Obsidian",
  description: "Obsidian second-brain: vault capture, index, digest, context packs, task engine",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi): void {
    // Tool: Init vault
    api.registerTool?.({
      name: "ari_obsidian_init",
      label: "Initialize Obsidian Vault",
      description: "Create vault directory structure, copy templates, write .obsidian config",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        const result = initVault();
        return jsonResult(result);
      },
    });

    // Tool: Capture
    api.registerTool?.({
      name: "ari_obsidian_capture",
      label: "Capture to Obsidian",
      description: "Append text to Obsidian inbox with trace_id; boundary-guarded",
      parameters: Type.Object({
        text: Type.String({ description: "Content to capture" }),
        tags: Type.Optional(Type.Array(Type.String())),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { text: string; tags?: string[] };
        const result = await handleNoteCommand(p.text);
        return jsonResult({ result });
      },
    });

    // Tool: Search
    api.registerTool?.({
      name: "ari_obsidian_search",
      label: "Search Obsidian Vault",
      description: "Full-text search via vault index",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        limit: Type.Optional(Type.Number()),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { query: string; limit?: number };
        const { searchVaultIndex } = await import("./src/vault-index.js");
        const results = searchVaultIndex(p.query, p.limit ?? 20);
        return jsonResult({ results, count: results.length });
      },
    });

    // Tool: Daily digest
    api.registerTool?.({
      name: "ari_obsidian_digest_daily",
      label: "Daily Vault Digest",
      description: "Generate YYYY-MM-DD.md + context packs; return VaultSnapshot",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        reindexVaultSync("incremental");
        const snapshot = generateDailyDigest();
        generateContextPack();
        ariBus.emit(
          "ari:obsidian:digest-ready" as Parameters<typeof ariBus.emit>[0],
          { snapshot } as Parameters<typeof ariBus.emit>[1],
        );
        return jsonResult(snapshot);
      },
    });

    // Tool: Weekly digest
    api.registerTool?.({
      name: "ari_obsidian_digest_weekly",
      label: "Weekly Vault Digest",
      description: "Generate YYYY-Wxx.md weekly scan",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        reindexVaultSync("full");
        const snapshot = generateWeeklyDigest();
        return jsonResult(snapshot);
      },
    });

    // Tool: Scan repo
    api.registerTool?.({
      name: "ari_obsidian_scan_repo",
      label: "Scan ARI Repo",
      description: "Document ARI plugins to 10-Projects/ARI/ (baseline or deep)",
      parameters: Type.Object({
        mode: Type.Optional(Type.String({ description: "baseline or deep" })),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { mode?: string };
        const result = scanRepo(p.mode === "deep" ? "deep" : "baseline");
        return jsonResult(result);
      },
    });

    // Tool: Reindex
    api.registerTool?.({
      name: "ari_obsidian_reindex",
      label: "Reindex Vault",
      description: "Reindex vault (incremental or full); update vault-index.db",
      parameters: Type.Object({
        mode: Type.Optional(Type.String({ description: "incremental or full" })),
      }),
      execute: async (_toolCallId, params) => {
        const p = params as { mode?: string };
        const result = reindexVaultSync(p.mode === "full" ? "full" : "incremental");
        return jsonResult(result);
      },
    });

    // Tool: Status
    api.registerTool?.({
      name: "ari_obsidian_status",
      label: "Vault Status",
      description: "Vault stats: note count, index size, last digest, open loops count",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        const stats = getVaultStats();
        const openLoops = getOpenLoops();
        return jsonResult({ ...stats, openLoopsCount: openLoops.length });
      },
    });

    // Tool: Context pack
    api.registerTool?.({
      name: "ari_obsidian_context_pack",
      label: "Regenerate Context Pack",
      description: "Regenerate CONTEXT_PACK.md + WORKING_SET.md",
      parameters: Type.Object({}),
      execute: async (_toolCallId, _params) => {
        generateContextPack();
        return jsonResult({ generated: ["00-System/CONTEXT_PACK.md", "00-System/WORKING_SET.md"] });
      },
    });

    // Discord commands
    api.registerCommand({
      name: "ari-note",
      description: "Capture text to Obsidian inbox with trace_id",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleNoteCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-vault-status",
      description: "Vault stats: notes, index, last digest, open loops",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleVaultStatusCommand(),
    });

    api.registerCommand({
      name: "ari-vault-search",
      description: "Full-text search across indexed vault notes",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleVaultSearchCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-digest-now",
      description: "Trigger on-demand digest + context pack regen",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleDigestCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-scan-repo",
      description: "Document ARI repo structure into vault",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleScanCommand(ctx.args ?? ""),
    });

    api.registerCommand({
      name: "ari-today",
      description: "Today: vault context + open loops + top tasks",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleTodayCommand(),
    });

    api.registerCommand({
      name: "ari-open-loops",
      description: "List notes tagged #open-loop",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleOpenLoopsCommand(),
    });

    api.registerCommand({
      name: "ari-next",
      description: "Top 5 open tasks sorted by priority + due date",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleNextCommand(),
    });

    api.registerCommand({
      name: "ari-rate",
      description: "Rate ARI response: /ari-rate <trace_id> good|bad [note]",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleRateCommand(ctx.args ?? ""),
    });

    // ariBus: scheduler tasks
    ariBus.on("ari:scheduler:task", (payload) => {
      const { taskId } = payload as { taskId: string };

      if (taskId === "morning-vault-digest") {
        if (process.env.ARI_OBSIDIAN_ENABLED === "false") {
          return;
        }
        reindexVaultSync("incremental");
        const snapshot = generateDailyDigest();
        generateContextPack();
        ariBus.emit(
          "ari:obsidian:digest-ready" as Parameters<typeof ariBus.emit>[0],
          { snapshot } as Parameters<typeof ariBus.emit>[1],
        );
      }

      if (taskId === "weekly-vault-scan") {
        if (process.env.ARI_OBSIDIAN_ENABLED === "false") {
          return;
        }
        reindexVaultSync("full");
        generateWeeklyDigest();
        scanRepo("baseline");
      }

      if (taskId === "vault-compaction") {
        if (process.env.ARI_OBSIDIAN_ENABLED === "false") {
          return;
        }
        runCompaction();
      }
    });

    // Wire auto-capture hooks
    wireAutoCapture(api);
  },
};

export default plugin;
