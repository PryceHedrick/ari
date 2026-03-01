import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { processBookmark } from "./src/bookmark-pipeline.js";
import { cleanupExpiredCronState, getCronStateStats } from "./src/cron-state.js";
import { saveMemory, queryMemories, getMemoryStats } from "./src/memory-db.js";
import { searchMemories, indexMemory, getIndexStats } from "./src/tfidf-search.js";
import { loadWorkspaceContext } from "./src/workspace-context.js";

// Wraps plain payload into AgentToolResult format required by AnyAgentTool
function jsonResult(payload: unknown): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/**
 * ARI Memory Plugin — Provenance-tracked knowledge persistence.
 *
 * Storage (~/.ari/):
 *   databases/memory.db — SQLite WAL (Section 19.1 PRAGMAs)
 *
 * Registered tools:
 *   ari_memory_search   — TF-IDF search across knowledge base
 *   ari_save_bookmark   — URL → summarize → save to bookmarks
 *   ari_workspace_load  — Load workspace files into context
 *
 * EventBus listeners:
 *   ari:memory:store           — agents save new knowledge
 *   ari:memory:search_request  — async search (returns ari:memory:search_result)
 *   ari:scheduler:task         — handles 'memory-dedup' task (22:00 daily)
 */
const plugin = {
  id: "ari-memory",
  name: "ARI Memory",
  description: "Provenance memory: SQLite WAL + TF-IDF index + bookmark pipeline",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi): void {
    // ── Tool: Search memory ──────────────────────────────────────────────────
    api.registerTool?.({
      name: "ari_memory_search",
      label: "Search ARI Memory",
      description: "TF-IDF search across ARI knowledge base (memories + bookmarks)",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
        domain: Type.Optional(
          Type.String({ description: "Filter by domain (patterns, decisions, fixes, docs)" }),
        ),
      }),
      execute: async (_toolCallId, params) => {
        const { query, limit, domain } = params as {
          query: string;
          limit?: number;
          domain?: string;
        };
        const results = searchMemories(query, limit ?? 10);
        const filtered = domain ? results.filter((r) => r.domain === domain) : results;
        return jsonResult({
          results: filtered.map((r) => ({
            id: r.id,
            title: r.title,
            snippet: r.content.slice(0, 200),
            score: r.searchScore,
            matchedTerms: r.matchedTerms,
            source: r.source,
            domain: r.domain,
            confidence: r.confidence,
          })),
          count: filtered.length,
        });
      },
    });

    // ── Tool: Save bookmark ──────────────────────────────────────────────────
    api.registerTool?.({
      name: "ari_save_bookmark",
      label: "Save Bookmark",
      description: "Save a URL to ARI knowledge base with optional summary and tags",
      parameters: Type.Object({
        url: Type.String({ description: "URL to save" }),
        title: Type.Optional(Type.String({ description: "Page title" })),
        summary: Type.Optional(Type.String({ description: "Content summary (will be indexed)" })),
        tags: Type.Optional(Type.Array(Type.String(), { description: "Tags" })),
        domain: Type.Optional(Type.String({ description: "Knowledge domain" })),
      }),
      execute: async (_toolCallId, params) => {
        const result = await processBookmark(params as Parameters<typeof processBookmark>[0]);
        return jsonResult(result);
      },
    });

    // ── Tool: Load workspace context ─────────────────────────────────────────
    api.registerTool?.({
      name: "ari_workspace_load",
      label: "Load Workspace Context",
      description:
        "Load workspace files (SOUL, USER, HEARTBEAT, GOALS, AGENTS, MEMORY, RECOVERY) into context. ZOE plane = all 7 files. CODEX plane (RUNE) = AGENTS.md only.",
      parameters: Type.Object({
        agentName: Type.Optional(
          Type.String({ description: "Agent name for SOUL file loading (ZOE plane only)" }),
        ),
        plane: Type.Optional(
          Type.String({
            description:
              "Context isolation plane: 'zoe' = full business context, 'codex' = engineering only",
          }),
        ),
      }),
      execute: async (_toolCallId, params) => {
        const { agentName, plane } = params as { agentName?: string; plane?: "zoe" | "codex" };

        // CODEX enforcement: RUNE always gets codex plane regardless of request
        const CODEX_AGENTS = ["rune", "RUNE"];
        const isCodexAgent = agentName !== undefined && CODEX_AGENTS.includes(agentName);

        // Reject explicit ZOE request from CODEX agent — security gate
        if (isCodexAgent && plane === "zoe") {
          throw new Error(
            `[ARI-GOVERNANCE] CODEX plane violation: ${agentName} requested ZOE context. ` +
              "RUNE/CODEX agents NEVER receive ZOE context — request rejected.",
          );
        }

        const effectivePlane: "zoe" | "codex" = isCodexAgent ? "codex" : (plane ?? "zoe");
        const result = loadWorkspaceContext(agentName, effectivePlane);
        return jsonResult(result);
      },
    });

    // ── EventBus: Store memory ───────────────────────────────────────────────
    ariBus.on("ari:memory:store", (payload) => {
      const data = payload as {
        content?: string;
        source?: string;
        domain?: string;
        agent?: string;
        confidence?: number;
        title?: string;
      };
      if (!data?.content || !data?.source) {
        return;
      }
      const { id, isDuplicate } = saveMemory(data as Parameters<typeof saveMemory>[0]);
      if (!isDuplicate) {
        indexMemory(id, data.content);
      }
    });

    // ── EventBus: Search request ─────────────────────────────────────────────
    ariBus.on("ari:memory:search_request", (payload) => {
      const data = payload as { query?: string; limit?: number; requestId?: string };
      if (!data?.query) {
        return;
      }
      const results = searchMemories(data.query, data.limit ?? 10);
      ariBus.emit("ari:memory:search_result", { requestId: data.requestId, results });
    });

    // ── EventBus: Scheduler — memory dedup (22:00 daily) ────────────────────
    ariBus.on("ari:scheduler:task", (payload) => {
      const data = payload as { taskId?: string };
      if (data?.taskId !== "memory-dedup") {
        return;
      }

      const stats = getMemoryStats();
      const indexStats = getIndexStats();

      // Query memories to check and emit expired count (pruning is handled by
      // future maintenance tasks; for now we surface the health snapshot)
      const recent = queryMemories({ limit: 1 });
      const hasRecent = recent.length > 0;

      // Also clean up expired CronStateEnvelope entries
      const cronDeleted = cleanupExpiredCronState();
      const cronStats = getCronStateStats();

      ariBus.emit("ari:memory:dedup_complete", {
        memories: stats.memories,
        bookmarks: stats.bookmarks,
        indexedTerms: stats.indexedTerms,
        avgTermsPerDoc: indexStats.avgTermsPerDoc,
        hasRecentMemory: hasRecent,
        cronStateExpiredDeleted: cronDeleted,
        cronStateRemaining: cronStats.total,
        completedAt: new Date().toISOString(),
      });
    });
  },
};

export default plugin;
