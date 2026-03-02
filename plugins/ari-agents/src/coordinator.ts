import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * ARI Named Agent Coordinator
 *
 * MISSION plane (full business context — SOUL files + workspace + goals):
 *   ARI   🧠  claude-opus-4-6    CFO / Meta-Orchestrator
 *   NOVA  🎬  claude-sonnet-4-6  P1 Content Creator (PayThePryce)
 *   CHASE 🎯  claude-sonnet-4-6  P2 Lead Connector (Pryceless Solutions)
 *   PULSE 📡  claude-haiku-4-5   Market Analyst
 *   DEX   🗂️  claude-haiku-4-5   Research Scout
 *
 * BUILD plane (engineering only — task spec + AGENTS.md, NO SOUL files, NO business context):
 *   RUNE  🔧  claude-sonnet-4-6  Engineering Builder
 *
 * Model routing is handled exclusively by ari-ai (ValueScorer + AGENT_PROFILES).
 * This module owns: registry, capability cards, plane enforcement.
 *
 * Note: "build" plane name ≠ "openai-codex" model or RUNE_CODEX_AVAILABLE env var.
 * The plane isolates context; the model is selected separately by value-scorer.ts.
 */

// Context plane for each agent:
//   "mission" = full business context (MISSION plane): ARI, NOVA, CHASE, PULSE, DEX
//   "build"   = engineering context only (BUILD plane): RUNE only
type AgentProfile = {
  name: string;
  emoji: string;
  role: string;
  plane: "mission" | "build";
};

// Named agent registry — the six members of Pryce's empire
export const NAMED_AGENTS: Record<string, AgentProfile> = {
  ARI: { name: "ARI", emoji: "🧠", role: "CFO / Meta-Orchestrator", plane: "mission" },
  NOVA: { name: "NOVA", emoji: "🎬", role: "P1 Content Creator", plane: "mission" },
  CHASE: { name: "CHASE", emoji: "🎯", role: "P2 Lead Connector", plane: "mission" },
  PULSE: { name: "PULSE", emoji: "📡", role: "Market Analyst", plane: "mission" },
  DEX: { name: "DEX", emoji: "🗂️", role: "Research Scout", plane: "mission" },
  RUNE: { name: "RUNE", emoji: "🔧", role: "Engineering Builder", plane: "build" },
};

/**
 * Validate MISSION/BUILD plane context enforcement.
 * Called at agent spawn time — throws on violation.
 */
export function validateContextBundlePlane(
  agentName: string | undefined,
  contextFiles: string[],
): void {
  if (!agentName) {
    return;
  }
  const name = agentName.toUpperCase();
  const profile = NAMED_AGENTS[name];
  if (!profile || profile.plane !== "build") {
    return;
  }

  const prohibited = contextFiles.filter(
    (f) =>
      f !== "AGENTS.md" && !f.startsWith("task-spec") && !f.endsWith(".ts") && !f.endsWith(".md"),
  );

  // SOUL files are prohibited for CODEX plane
  const SOUL_FILES = new Set([
    "SOUL.md",
    "USER.md",
    "HEARTBEAT.md",
    "GOALS.md",
    "MEMORY.md",
    "RECOVERY.md",
  ]);
  const hasSoulFiles = contextFiles.some(
    (f) =>
      f === "SOUL.md" ||
      f === "USER.md" ||
      f === "HEARTBEAT.md" ||
      f === "GOALS.md" ||
      f === "MEMORY.md" ||
      f === "RECOVERY.md",
  );

  if (hasSoulFiles || prohibited.length > 0) {
    const violations = contextFiles.filter((f) => SOUL_FILES.has(f)).join(", ");
    // Emit security audit signal before throwing — interceptable by OpenClaw error boundary
    console.error(
      JSON.stringify({
        event: "security:build-plane-violation-attempt",
        agent: name,
        prohibitedFiles: violations,
        timestamp: new Date().toISOString(),
      }),
    );
    throw new Error(
      `[ARI-GOVERNANCE] BUILD plane violation for ${name}: PROHIBITED files detected: ${violations}. ` +
        "RUNE/BUILD agents NEVER receive SOUL files, workspace files, or business context.",
    );
  }
}

// ─── Context Bundle ────────────────────────────────────────────────────────────

/**
 * ContextBundle — formalized context transfer contract (Section 29.8).
 * Enforces MISSION/BUILD plane isolation at agent spawn time.
 *
 * MISSION agents: SOUL file + workspace context + task spec (20-30K token budget)
 * BUILD agents:   task spec + AGENTS.md only (5K token budget — NO SOUL files)
 */
export interface ContextBundle {
  plane: "mission" | "build";
  soulFile?: string; // ZOE only — agent SOUL.md content
  taskSpec: string; // What to build + success criteria
  workingMemory: {
    relevantDecisions: string[]; // Compressed prior decisions
    evidenceIds: string[]; // SQLite references (not full content)
    sharedStateRefs: string[]; // Keys in pheromone shared state
  };
  tokenBudget: number; // 5K (task-agent), 20-30K (named), 100K (max)
  timeLimit?: string; // '30m', '2h' for ephemeral sub-agents
}

/**
 * Validate a ContextBundle against the receiving agent's plane.
 * Throws on CODEX plane violation (soulFile present, budget exceeded).
 */
export function validateContextBundle(bundle: ContextBundle, agentName: string): void {
  const profile = NAMED_AGENTS[agentName.toUpperCase()];
  if (!profile) {
    throw new Error(`[ARI] Unknown agent: ${agentName}`);
  }
  if (profile.plane === "build" && bundle.soulFile) {
    throw new Error(`[ARI-GOVERNANCE] BUILD plane: soulFile prohibited for ${agentName}`);
  }
  if (bundle.tokenBudget > 100_000) {
    throw new Error(`[ARI] Token budget ${bundle.tokenBudget} exceeds 100K max`);
  }
}

// ─── Capability Cards ──────────────────────────────────────────────────────────

/** Section 22.3: Agent Capability Card — live JSON descriptor published by each agent */
export interface AgentCapabilityCard {
  name: string; // 'NOVA', 'CHASE', etc.
  emoji: string;
  capabilities: Record<string, number>; // task_type → confidence (0-1)
  currentLoad: { queued: number; maxCapacity: number };
  plane: "mission" | "build";
  tools: string[];
  estimatedLatency: { [taskType: string]: string }; // '2-5min', '<1min', etc.
}

/** Default capability cards per agent — static bootstrap, refreshed at runtime via self-reports */
const DEFAULT_CAPABILITY_CARDS: Record<string, AgentCapabilityCard> = {
  ARI: {
    name: "ARI",
    emoji: "🧠",
    capabilities: {
      orchestration: 0.99,
      governance: 0.99,
      agent_coordination: 0.97,
      financial_reasoning: 0.95,
      briefing_synthesis: 0.93,
    },
    currentLoad: { queued: 0, maxCapacity: 5 },
    plane: "mission",
    tools: ["all"],
    estimatedLatency: { orchestration: "<30s", governance: "<1min" },
  },
  NOVA: {
    name: "NOVA",
    emoji: "🎬",
    capabilities: {
      video_script_generation: 0.95,
      hook_writing: 0.97,
      seo_metadata: 0.9,
      market_narrative: 0.88,
      thumbnail_generation: 0.85,
      trend_analysis: 0.65,
      lead_qualification: 0.3,
    },
    currentLoad: { queued: 0, maxCapacity: 10 },
    plane: "mission",
    tools: ["pokemontcg.io", "SerpAPI", "ElevenLabs", "Whisper", "Ideogram", "DALL-E-3"],
    estimatedLatency: { video_script_generation: "3-5min", hook_writing: "<1min" },
  },
  CHASE: {
    name: "CHASE",
    emoji: "🎯",
    capabilities: {
      lead_qualification: 0.97,
      prompt_forge: 0.95,
      demo_building: 0.92,
      outreach_drafting: 0.9,
      vertical_research: 0.75,
      content_creation: 0.3,
    },
    currentLoad: { queued: 0, maxCapacity: 10 },
    plane: "mission",
    tools: ["SerpAPI", "Apollo.io", "GoogleBusinessProfile", "GoogleMaps", "Playwright"],
    estimatedLatency: { lead_qualification: "2-5min", outreach_drafting: "<2min" },
  },
  PULSE: {
    name: "PULSE",
    emoji: "📡",
    capabilities: {
      market_monitoring: 0.98,
      price_analysis: 0.97,
      anomaly_detection: 0.93,
      sentiment_analysis: 0.88,
      market_narrative: 0.85,
      script_generation: 0.2,
    },
    currentLoad: { queued: 0, maxCapacity: 20 },
    plane: "mission",
    tools: ["CoinGecko", "Finnhub", "pokemontcg.io", "X-API", "Reddit"],
    estimatedLatency: { market_monitoring: "<30s", price_analysis: "<1min" },
  },
  DEX: {
    name: "DEX",
    emoji: "🗂️",
    capabilities: {
      research_synthesis: 0.97,
      weekly_digest: 0.95,
      arxiv_monitoring: 0.93,
      social_signal_detection: 0.88,
      breakthrough_analysis: 0.9,
      lead_qualification: 0.2,
    },
    currentLoad: { queued: 0, maxCapacity: 15 },
    plane: "mission",
    tools: ["Perplexity", "arXiv", "X-API", "Reddit", "Tavily"],
    estimatedLatency: { research_synthesis: "2-5min", weekly_digest: "5-10min" },
  },
  RUNE: {
    name: "RUNE",
    emoji: "🔧",
    capabilities: {
      code_generation: 0.97,
      plugin_development: 0.95,
      test_writing: 0.93,
      refactoring: 0.92,
      debugging: 0.9,
      architecture: 0.85,
    },
    currentLoad: { queued: 0, maxCapacity: 5 },
    plane: "build",
    tools: ["TypeScript", "Vitest", "ESLint", "Git", "npm"],
    estimatedLatency: { code_generation: "1-3min", test_writing: "<2min" },
  },
};

/**
 * Get agent capability card from the registry.
 * Returns default static card — runtime self-reports update currentLoad dynamically.
 */
export function getAgentCapabilityCard(agentName: string): AgentCapabilityCard | undefined {
  return DEFAULT_CAPABILITY_CARDS[agentName.toUpperCase()];
}

/**
 * Route a task to the best available agent using capability scoring.
 * score = capability_confidence × (1 - load_factor) × priority_multiplier
 * If max score < 0.7: escalate to ARI for manual dispatch.
 */
export function routeTaskToAgent(
  taskType: string,
  priority: 1 | 2 | 3 | 4 | 5 = 3,
): { agentName: string; score: number } | { escalate: true; reason: string } {
  let bestAgent = "";
  let bestScore = 0;

  for (const [name, card] of Object.entries(DEFAULT_CAPABILITY_CARDS)) {
    const confidence = card.capabilities[taskType] ?? 0;
    const loadFactor = card.currentLoad.queued / card.currentLoad.maxCapacity;
    const priorityMultiplier = priority <= 2 ? 1.2 : priority >= 4 ? 0.8 : 1.0;
    const score = confidence * (1 - loadFactor) * priorityMultiplier;

    if (score > bestScore) {
      bestScore = score;
      bestAgent = name;
    }
  }

  if (bestScore < 0.7) {
    return {
      escalate: true,
      reason: `No agent with score ≥0.7 for task type '${taskType}' (best: ${Math.round(bestScore * 100)}%)`,
    };
  }

  return { agentName: bestAgent, score: bestScore };
}

export function registerAgentCoordinator(_api: OpenClawPluginApi): void {
  // Model routing is handled exclusively by ari-ai (before_model_resolve).
  // This function registers the agent registry — do NOT re-register the routing
  // hook here as it would shadow ari-ai's comprehensive Perplexity/Gemini routing.
  // NAMED_AGENTS, resolveAgentModel, and getAgentCapabilityCard are exported
  // for direct consumption by other plugins.
}

// ─── Section 22: Agent Coordination Types ─────────────────────────────────────

/** Section 22.4: Peer-to-Peer Handoff — zero synchronous blocking */
export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface Decision {
  id: string;
  description: string;
  rationale: string;
  madeBy: string;
  timestamp: string;
}

export interface AgentHandoff {
  sourceAgent: string;
  targetAgent: string;
  task: {
    type: string;
    description: string;
    inputs: Record<string, unknown>;
    deadline: string;
    priority: 1 | 2 | 3 | 4 | 5;
    evidenceIds?: string[];
  };
  context: {
    conversationHistory: ConversationTurn[];
    previousDecisions: Decision[];
    sharedMemoryRefs: string[]; // References to shared state, not full dumps
  };
  escalateBackConditions: string[]; // "if budget_exceeds $5, return to ARI"
}

/** Section 22.5: Pheromone signal — lightweight async event marker */
export interface AgentSignal {
  type: "help_request" | "escalation" | "task_complete" | "alert";
  source: string;
  target?: string; // undefined = broadcast to all
  strength: number; // 0-1 urgency
  payload: Record<string, unknown>;
  expiresAt: string; // TTL on pheromone
}

/** Section 22.5: Async shared state store with pheromone signals */
export interface AgentTask {
  id: string;
  type: string;
  description: string;
  inputs: Record<string, unknown>;
  priority: 1 | 2 | 3 | 4 | 5;
  deadline?: string;
  createdAt: string;
}

export interface MarketAnalysis {
  asset: string;
  signal: string;
  confidence: number;
  timestamp: string;
}

export interface Finding {
  id: string;
  source: string;
  title: string;
  summary: string;
  relevance: string;
  timestamp: string;
}

export interface ContentEvent {
  id: string;
  type: string;
  scheduledAt: string;
  description: string;
  status: "planned" | "in-progress" | "completed";
}

export interface Lead {
  leadId: string;
  businessName: string;
  score: number;
  vertical: string;
  status: "discovered" | "audited" | "qualified" | "outreach-ready";
}

export interface ScriptSummary {
  jobId: string;
  title: string;
  topic: string;
  confidence: number;
  approvalStatus: "auto-approved" | "pending-review" | "rejected";
  createdAt: string;
}

export interface MarketSnapshot {
  timestamp: string;
  assets: Record<string, { price: number; change24h: number; signal?: string }>;
}

export interface ResearchDigest {
  weekOf: string;
  papers: Array<{ title: string; summary: string; relevance: string }>;
  improvements: string[];
  postedAt?: string;
}

export interface LeadSummary {
  weekOf: string;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  outreachSent: number;
  conversions: number;
}

export interface SharedAgentState {
  // Task queues (each agent reads its own)
  queues: { [agentName: string]: AgentTask[] };

  // Pheromone signals — lightweight event markers (checked every 15-20s)
  signals: AgentSignal[];

  // Shared knowledge cache
  marketCache: { [key: string]: MarketAnalysis };
  recentFindings: Finding[];
  contentCalendar: ContentEvent[];
  leadPipeline: Lead[];

  // Cross-agent knowledge from completed work
  novaLastScripts: ScriptSummary[]; // NOVA publishes for DEX/PULSE to reference
  pulseLastAnalysis: MarketSnapshot; // PULSE publishes for NOVA to use in scripts
  dexLatestDigest: ResearchDigest; // DEX publishes for all agents
  chaseLeadSummary: LeadSummary; // CHASE publishes for ARI review
}

// ─── Section 22.7: Dynamic Sub-Agent Spawning ─────────────────────────────────

/**
 * SpawnPackage — selective context passed to ephemeral child agents.
 * 42% memory overhead reduction vs full context clone (AgentSpawn arXiv:2602.07072).
 * YAGNI tool set + minimum required context — never full conversation dump.
 */
export interface SpawnPackage {
  parent: string; // Parent agent name ('NOVA', 'CHASE', etc.)
  specialization: string; // Task type the child specializes in
  context: string; // Selective context (not full history)
  subtask: AgentTask; // The specific task to execute
  tools: string[]; // Minimum tools required (YAGNI)
  plane: "mission" | "build"; // Inherits parent's plane — never escalate
  timeLimit: string; // '30m', '2h' — ephemeral children only
  tokenBudget: number; // 5K (task-agent) — tight budget
}

/**
 * ResumePackage — result returned by ephemeral child agent.
 * Parent integrates childResult via parent.memory.integrateChildResult().
 * Child is destroyed after returning — registry logs spawn event to SQLite.
 */
export interface ResumePackage {
  childId: string; // Child agent ID (UUID)
  parentAgent: string; // Back-reference to parent
  completedOutput: unknown; // Task-specific result payload
  methodsUsed: string[]; // Tools/approaches used
  tokenCost: number; // Total tokens consumed
  errors: string[]; // Any errors encountered (non-fatal)
  suggestedNextSteps: string[]; // Child's recommendations for parent
  completedAt: string; // ISO timestamp
}

/**
 * Compute dynamic spawning complexity score (Section 22.7).
 * If complexity > 0.7, spawn a specialized child agent.
 */
export function computeSpawnComplexity(task: {
  numTools: number;
  contextLength: number;
  decisionDepth: number;
  coordinationOverhead: number;
}): number {
  return (
    task.numTools * 0.2 +
    (task.contextLength / 128_000) * 0.3 +
    task.decisionDepth * 0.3 +
    task.coordinationOverhead * 0.2
  );
}

// ─── Section 22.8: Structured Debate Protocol ─────────────────────────────────

/**
 * DebateResult — outcome of structured 2-round agent debate.
 * Use for: budget allocation, strategy pivots, campaign go/no-go decisions.
 * Do NOT use for: real-time tasks, monitoring, routine operations.
 *
 * Expected confidence: 89-92% when 3+ agents reach consensus (vs 73% single-agent).
 * Source: Microsoft AutoGen Group Chat patterns (2025).
 */
export interface DebateResult {
  recommendation: string; // Final decision recommendation
  confidence: number; // 0-1 (≥0.9 = all 3 agents agree)
  dissent: string[]; // Minority views from non-consensus agents
  reasoning: string; // Synthesized logic from all positions
  agentsParticipated: string[]; // e.g. ['NOVA', 'CHASE', 'PULSE']
  rounds: 2; // Always 2-round debate
  concludedAt: string;
}
