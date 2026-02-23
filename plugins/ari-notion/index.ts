import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { emptyPluginConfigSchema } from 'openclaw/plugin-sdk';

/**
 * ARI Notion Plugin — Journal + notes integration.
 *
 * Phase 2 stub: registers plugin identity.
 * Phase 3 deferred: full Notion client with retry + cache.
 *
 * Correct Notion usage pattern:
 * - ARI WRITES: daily journal entries, market analysis reports, session learnings
 * - ARI READS: reference docs, meeting notes, personal projects
 * - NOT task management (that's ARI Scheduler)
 *
 * Tools to register (Phase 3):
 * - ari_notion_journal  — Write daily journal entry (from evening summary cron)
 * - ari_notion_note     — Save quick note from Discord /note command
 * - ari_notion_search   — Search workspace for reference material
 *
 * Client features: retry(3, exponential backoff) + TTL cache(60s)
 * Workspace name: "Pryce"
 *
 * Source: src/integrations/notion/client.ts
 */
const plugin = {
  id: 'ari-notion',
  name: 'ARI Notion',
  description: 'Notion journal + notes: retry(3) + TTL cache(60s)',
  configSchema: emptyPluginConfigSchema(),
  register(_api: OpenClawPluginApi): void {
    // Phase 3: api.registerTool({ id: 'ari_notion_journal', handler: writeJournal })
    // Phase 3: api.registerTool({ id: 'ari_notion_note', handler: saveNote })
    // Phase 3: api.registerTool({ id: 'ari_notion_search', handler: searchNotion })
  },
};

export default plugin;
