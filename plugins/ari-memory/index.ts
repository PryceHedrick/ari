import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Memory Plugin — Provenance-tracked knowledge base.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3: SQLite WAL memory + TF-IDF knowledge index + bookmark pipeline.
 *
 * Storage layout (~/.ari/):
 * - databases/wal_tiered_memory.db — Primary SQLite WAL database
 * - databases/cron-state.db         — CronStateEnvelope (Phase 1, already live)
 * - knowledge/intelligence/         — Intelligence scan outputs
 * - knowledge/bookmarks/            — URL → summary captures from #inbox
 * - workspace/                      — SOUL.md, USER.md, HEARTBEAT.md, etc.
 *
 * Tools to register (Phase 3):
 * - ari_save_bookmark    — URL → summarize → save to knowledge/bookmarks/
 * - ari_memory_search    — TF-IDF search across knowledge base
 * - ari_workspace_load   — Load active workspace files into context
 *
 * #inbox flow: Drop URL → agent summarizes → ari_save_bookmark → nightly index
 *
 * Source: src/agents/memory-manager.ts, src/autonomous/knowledge-index.ts
 */
const plugin = {
  id: 'ari-memory',
  name: 'ARI Memory',
  description: 'Provenance memory: SQLite WAL + TF-IDF index + bookmark pipeline',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerTool({ id: 'ari_save_bookmark', handler: saveBookmark })
    // Phase 3: api.registerTool({ id: 'ari_memory_search', handler: searchMemory })
    // Phase 3: api.registerService({ id: 'memory', start: initMemoryManager })
  },
};

export default plugin;
