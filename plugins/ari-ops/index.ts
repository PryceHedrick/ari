/**
 * ARI Ops Plugin — 14th ARI plugin delivering observability, trust, and policy.
 *
 * Milestones:
 *   M2  Structured tracing: AsyncLocalStorage + bounded queue + SQLite drain
 *   M3  Discord command center: /ari-system /ari-doctor /ari-recent /ari-trace
 *          /ari-agents /ari-routing /ari-obs-debug
 *   M5  Policy engine: before_tool_call gate (internal tools exempt)
 *   M6  Kill switch: env flags + runtime toggle + ariBus broadcast
 *
 * Design invariants:
 *   - No marketplace skills enabled without out-of-process sandbox (see docs/ops/security.md)
 *   - Internal ARI tools (ari_* prefix) always exempt from policy checks
 *   - Tracer never throws; bounded queue drops oldest on overflow
 *   - Gateway on port 3141 is never disrupted; all hooks are additive
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ariBus } from "../ari-shared/src/event-bus.js";
import { handleAgentsCommand } from "./src/commands/agents.js";
import { handleCostCommand } from "./src/commands/cost.js";
import { handleDebugCommand } from "./src/commands/debug.js";
import { handleDoctorCommand } from "./src/commands/doctor.js";
import { handleRecentCommand } from "./src/commands/recent.js";
import { handleRoutingCommand } from "./src/commands/routing.js";
import { handleStatusCommand } from "./src/commands/status.js";
import { handleTraceCommand } from "./src/commands/trace.js";
import { initPolicyEngine, getPolicyEngine } from "./src/policy-engine.js";
import { persistSpans, pruneOldSpans } from "./src/trace-store.js";
import { emitSpan, writeQueue } from "./src/tracer.js";
import type { SpanEvent } from "./src/tracer.js";

// ── Drain loop ────────────────────────────────────────────────────────────────

function flushQueue(): void {
  if (writeQueue.length === 0) {
    return;
  }
  const lines = writeQueue.splice(0, writeQueue.length);
  const events: SpanEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as SpanEvent);
    } catch {
      // Skip malformed lines
    }
  }
  if (events.length > 0) {
    try {
      persistSpans(events);
    } catch {
      // Never crash the drain loop
    }
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const plugin = {
  id: "ari-ops",
  name: "ARI Ops",
  description: "Observability, tracing, policy engine, kill switch, Discord AgentOps commands",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi): void {
    // Resolve allowlist relative to CWD (repo root when launched via deploy-local.sh)
    const allowlistPath = resolve("config/skills/allowlist.yaml");

    // Init policy engine with safe defaults
    const policyConfig = {
      enabled: true,
      defaultDeny: true,
      internalPluginsExempt: true,
    };
    initPolicyEngine(
      policyConfig,
      existsSync(allowlistPath) ? allowlistPath : "config/skills/allowlist.yaml",
    );

    // ── M2: Tracer drain service ────────────────────────────────────────────
    api.registerService({
      id: "ari-ops-tracer-drain",
      start() {
        const interval = setInterval(flushQueue, 200);
        // unref() so the drain loop doesn't prevent process exit
        if (typeof interval.unref === "function") {
          interval.unref();
        }

        // Daily retention prune at startup
        try {
          const pruned = pruneOldSpans(30);
          if (pruned > 0) {
            emitSpan({ event: "tracer_error", summary: `pruned ${pruned} old spans` });
          }
        } catch {
          // non-fatal
        }
      },
      stop() {
        flushQueue(); // final flush
      },
    });

    // ── M2: Hook — message_received ─────────────────────────────────────────
    api.on("message_received", (event) => {
      const ctx = event as Record<string, unknown>;
      const agentName = typeof ctx.agentName === "string" ? ctx.agentName : undefined;
      emitSpan({
        event: "message_received",
        agentName,
        summary: `channel=${typeof ctx.channelId === "string" ? ctx.channelId : typeof ctx.channel === "string" ? ctx.channel : "?"}`,
      });
    });

    // ── M2: Hook — before_model_resolve (priority -10, runs after value-scorer) ──
    api.on(
      "before_model_resolve",
      (event) => {
        const ctx = event as Record<string, unknown>;
        const agentName = typeof ctx.agentName === "string" ? ctx.agentName : undefined;
        emitSpan({ event: "model_resolving", agentName });
        return {}; // modifying hook must return object
      },
      { priority: -10 },
    );

    // ── M2: Hook — llm_input ────────────────────────────────────────────────
    api.on("llm_input", (event) => {
      const ctx = event as Record<string, unknown>;
      emitSpan({
        event: "llm_input",
        model: typeof ctx.model === "string" ? ctx.model : undefined,
        tokenCount: typeof ctx.tokenCount === "number" ? ctx.tokenCount : undefined,
      });
    });

    // ── M5: Hook — before_tool_call (policy engine gate) ───────────────────
    api.on("before_tool_call", (event) => {
      const engine = getPolicyEngine();
      const decision = engine.evaluate(event.toolName, event.params);

      emitSpan({
        event: "policy_decision",
        tool: event.toolName,
        policyAction: decision.action,
        policyRule: decision.rule,
      });

      if (decision.action === "deny") {
        // Fire hash mismatch security alert if applicable
        if (decision.rule === "hash_mismatch") {
          ariBus.emit("ari:security:skill_hash_mismatch", {
            slug: "unknown",
            toolName: event.toolName,
            ts: new Date().toISOString(),
          });
          // Also notify Discord systemStatus channel via gateway HTTP
          void fetch("http://127.0.0.1:3141/ari/discord-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "security:anomaly_detected",
              payload: { description: `Hash mismatch for skill tool: ${event.toolName}` },
            }),
          }).catch(() => {});
        }
        return { block: true, blockReason: decision.reason };
      }
      return {};
    });

    // ── M2: Hook — after_tool_call ──────────────────────────────────────────
    api.on("after_tool_call", (event) => {
      const ctx = event as Record<string, unknown>;
      emitSpan({
        event: "tool_result",
        tool: event.toolName,
        durationMs: typeof ctx.durationMs === "number" ? ctx.durationMs : undefined,
        summary: "completed",
      });
    });

    // ── M2: Hook — message_sending ──────────────────────────────────────────
    api.on("message_sending", () => {
      emitSpan({ event: "response_sent" });
      return {}; // modifying hook must return object
    });

    // ── M2: ariBus — scheduler task trace ───────────────────────────────────
    ariBus.on("ari:scheduler:task", (payload) => {
      emitSpan({
        event: "sched_task",
        agentName: payload.agent,
        summary: `task=${payload.taskId} gate=${payload.gate}`,
      });
    });

    // ── M3: Discord commands ─────────────────────────────────────────────────
    // Note: "ari-status" is taken by ari-pipelines; using "ari-system" here.

    api.registerCommand({
      name: "ari-system",
      description: "ARI system health: gateway, plugins, agents, traces",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleStatusCommand(),
    });

    api.registerCommand({
      name: "ari-doctor",
      description: "Deep check: providers, agents, skills, Discord, kill switch",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleDoctorCommand(ctx.args),
    });

    api.registerCommand({
      name: "ari-recent",
      description: "Recent traces: /ari-recent [n] [AGENT]",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleRecentCommand(ctx.args),
    });

    api.registerCommand({
      name: "ari-trace",
      description: "Trace drilldown by ID: /ari-trace <id>",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleTraceCommand(ctx.args),
    });

    api.registerCommand({
      name: "ari-agents",
      description: "Agent registry from memory DB",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleAgentsCommand(),
    });

    api.registerCommand({
      name: "ari-routing",
      description: "Routing rules snapshot from config/routing.yaml",
      acceptsArgs: false,
      requireAuth: true,
      handler: async () => handleRoutingCommand(),
    });

    api.registerCommand({
      name: "ari-obs-debug",
      description: "Toggle observability debug tracing on|off",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleDebugCommand(ctx.args),
    });

    api.registerCommand({
      name: "ari-cost",
      description: "Token usage + latency: /ari-cost [7d|budget]",
      acceptsArgs: true,
      requireAuth: true,
      handler: async (ctx) => handleCostCommand(ctx.args ?? ""),
    });

    // ── ariBus: budget warning broadcast ────────────────────────────────────
    ariBus.on("ari:ops:budget_warning", (payload) => {
      emitSpan({
        event: "tracer_error",
        summary: `budget warning: ${payload.pctUsed.toFixed(1)}% of daily token budget used`,
      });
    });
  },
};

export default plugin;
