import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { processBookmark } from "./src/bookmark-pipeline.js";
import { cleanupExpiredCronState, getCronStateStats } from "./src/cron-state.js";
import { saveMemory, queryMemories, getMemoryStats } from "./src/memory-db.js";
import { searchMemories, indexMemory, getIndexStats } from "./src/tfidf-search.js";
import { loadWorkspaceContext } from "./src/workspace-context.js";

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
      id: "ari_memory_search",
      name: "Search ARI Memory",
      description: "TF-IDF search across ARI knowledge base (memories + bookmarks)",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 10)" },
          domain: {
            type: "string",
            description: "Filter by domain (patterns, decisions, fixes, docs)",
          },
        },
        required: ["query"],
      },
      handler: async (input: Record<string, unknown>) => {
        const { query, limit, domain } = input as {
          query: string;
          limit?: number;
          domain?: string;
        };
        const results = searchMemories(query, limit ?? 10);
        const filtered = domain ? results.filter((r) => r.domain === domain) : results;
        return {
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
        };
      },
    });

    // ── Tool: Save bookmark ──────────────────────────────────────────────────
    api.registerTool?.({
      id: "ari_save_bookmark",
      name: "Save Bookmark",
      description: "Save a URL to ARI knowledge base with optional summary and tags",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "URL to save" },
          title: { type: "string", description: "Page title" },
          summary: { type: "string", description: "Content summary (will be indexed)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags" },
          domain: { type: "string", description: "Knowledge domain" },
        },
        required: ["url"],
      },
      handler: async (input: Record<string, unknown>) => {
        return processBookmark(input as Parameters<typeof processBookmark>[0]);
      },
    });

    // ── Tool: Load workspace context ─────────────────────────────────────────
    api.registerTool?.({
      id: "ari_workspace_load",
      name: "Load Workspace Context",
      description:
        "Load workspace files (SOUL, USER, HEARTBEAT, GOALS, AGENTS, MEMORY, RECOVERY) into context. ZOE plane = all 7 files. CODEX plane (RUNE) = AGENTS.md only.",
      inputSchema: {
        type: "object" as const,
        properties: {
          agentName: {
            type: "string",
            description: "Agent name for SOUL file loading (ZOE plane only)",
          },
          plane: {
            type: "string",
            enum: ["zoe", "codex"],
            description:
              "Context isolation plane: 'zoe' = full business context, 'codex' = engineering only",
          },
        },
      },
      handler: async (input: Record<string, unknown>) => {
        const { agentName, plane } = input as { agentName?: string; plane?: "zoe" | "codex" };

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
        return loadWorkspaceContext(agentName, effectivePlane);
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
