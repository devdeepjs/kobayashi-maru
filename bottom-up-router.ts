/**
 * Native Dual Virtual Model Routing System for Pi (Omnichannel Dynamic Configuration)
 *
 * 1. auto/planner-worker:
 *    - Turn 1 (Architect/Planner): Routes to Planner Model (e.g. Bedrock Luna, Claude 3.7, OpenAI o3, DeepSeek R1).
 *    - Turns 2..N (Worker/Execution): Routes to Workhorse Model (e.g. Local Ollama, Qwen, Cursor Fast).
 *    - Escalation: Automatically escalates back to Planner on consecutive worker failures or test breaks.
 *
 * 2. auto/bottom-up:
 *    - Starts on Workhorse Model at $0.00 compute.
 *    - Auto-escalates to Planner Model when consecutive failures occur.
 *
 * Models can be dynamically customized via ~/.pi/agent/virtual-models.json or environment variables
 * (KOBAYASHI_PLANNER, KOBAYASHI_WORKER, KOBAYASHI_ADVISOR, KOBAYASHI_ESCALATION_THRESHOLD).
 * Fully native in-process virtual models (0 subprocess hacks, 0 latency overhead).
 */

import fs from "fs";
import path from "path";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";

export interface ModelSpec {
  provider: string;
  model: string;
  thinking?: "off" | "low" | "medium" | "high" | "max";
}

export interface CustomVirtualModelSpec {
  id: string;
  name?: string;
  provider?: string;
  planner: ModelSpec;
  worker: ModelSpec;
  policy?: "planner-worker" | "bottom-up";
  escalationThreshold?: number;
  thinkingLevels?: ("off" | "low" | "medium" | "high" | "max")[];
  contextWindow?: number;
  maxTokens?: number;
}

export interface VirtualModelsConfig {
  planner: ModelSpec;
  worker: ModelSpec;
  advisor?: ModelSpec;
  escalationThreshold: number;
  custom?: Record<string, CustomVirtualModelSpec>;
}

const DEFAULT_PLANNER: ModelSpec = {
  provider: "bedrock-mantle",
  model: "openai.gpt-5.6-luna",
  thinking: "medium",
};

const DEFAULT_WORKER: ModelSpec = {
  provider: "ollama",
  model: "ornith-1.5:ctx",
  thinking: "off",
};

const DEFAULT_ADVISOR: ModelSpec = {
  provider: "amazon-bedrock",
  model: "us.anthropic.claude-sonnet-5-5",
  thinking: "high",
};

export function parseModelSpec(
  raw: unknown,
  defaultProvider: string,
  defaultModel: string,
  defaultThinking: "off" | "low" | "medium" | "high" | "max" = "off"
): ModelSpec {
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, any>;
    let provider = String(obj.provider || "").trim();
    let model = String(obj.model || "").trim();

    if (!provider && model.includes("/")) {
      const idx = model.indexOf("/");
      provider = model.slice(0, idx);
      model = model.slice(idx + 1);
    }

    return {
      provider: provider || defaultProvider,
      model: model || defaultModel,
      thinking: obj.thinking || defaultThinking,
    };
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    const trimmed = raw.trim();
    if (trimmed.includes("/")) {
      const idx = trimmed.indexOf("/");
      return {
        provider: trimmed.slice(0, idx),
        model: trimmed.slice(idx + 1),
        thinking: defaultThinking,
      };
    }
    return {
      provider: defaultProvider,
      model: trimmed,
      thinking: defaultThinking,
    };
  }

  return {
    provider: defaultProvider,
    model: defaultModel,
    thinking: defaultThinking,
  };
}

export function loadVirtualModelConfig(): VirtualModelsConfig {
  let planner = { ...DEFAULT_PLANNER };
  let worker = { ...DEFAULT_WORKER };
  let advisor = { ...DEFAULT_ADVISOR };
  let escalationThreshold = 2;
  const custom: Record<string, CustomVirtualModelSpec> = {};

  // 1. Load from ~/.pi/agent/virtual-models.json
  try {
    const home = process.env.HOME || "";
    const configPath = path.join(home, ".pi", "agent", "virtual-models.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      const data = JSON.parse(raw);

      if (data.planner) {
        planner = parseModelSpec(data.planner, DEFAULT_PLANNER.provider, DEFAULT_PLANNER.model, "medium");
      }
      if (data.worker) {
        worker = parseModelSpec(data.worker, DEFAULT_WORKER.provider, DEFAULT_WORKER.model, "off");
      }
      if (data.advisor) {
        advisor = parseModelSpec(data.advisor, DEFAULT_ADVISOR.provider, DEFAULT_ADVISOR.model, "high");
      }
      if (typeof data.escalationThreshold === "number" && data.escalationThreshold > 0) {
        escalationThreshold = data.escalationThreshold;
      }

      // Parse custom user virtual models from data.custom or data.virtualModels
      const rawCustom = data.custom || data.virtualModels || {};
      if (typeof rawCustom === "object" && rawCustom !== null) {
        for (const [id, spec] of Object.entries(rawCustom)) {
          if (typeof spec === "object" && spec !== null) {
            const customObj = spec as any;
            const plannerSpec = parseModelSpec(customObj.planner, planner.provider, planner.model, "medium");
            const workerSpec = parseModelSpec(customObj.worker, worker.provider, worker.model, "off");
            custom[id] = {
              id,
              name: customObj.name || `Custom Virtual Model (${id})`,
              provider: customObj.provider || "auto",
              planner: plannerSpec,
              worker: workerSpec,
              policy: customObj.policy === "bottom-up" ? "bottom-up" : "planner-worker",
              escalationThreshold: typeof customObj.escalationThreshold === "number" && customObj.escalationThreshold > 0
                ? customObj.escalationThreshold
                : escalationThreshold,
              thinkingLevels: Array.isArray(customObj.thinkingLevels)
                ? customObj.thinkingLevels
                : ["off", "low", "medium", "high"],
              contextWindow: typeof customObj.contextWindow === "number" ? customObj.contextWindow : 128_000,
              maxTokens: typeof customObj.maxTokens === "number" ? customObj.maxTokens : 16_384,
            };
          }
        }
      }
    }
  } catch {
    // Graceful fallback to default configuration
  }

  // 2. Environment variable overrides
  if (process.env.KOBAYASHI_PLANNER) {
    planner = parseModelSpec(process.env.KOBAYASHI_PLANNER, DEFAULT_PLANNER.provider, DEFAULT_PLANNER.model, "medium");
  }
  if (process.env.KOBAYASHI_WORKER) {
    worker = parseModelSpec(process.env.KOBAYASHI_WORKER, DEFAULT_WORKER.provider, DEFAULT_WORKER.model, "off");
  }
  if (process.env.KOBAYASHI_ADVISOR) {
    advisor = parseModelSpec(process.env.KOBAYASHI_ADVISOR, DEFAULT_ADVISOR.provider, DEFAULT_ADVISOR.model, "high");
  }
  if (process.env.KOBAYASHI_ESCALATION_THRESHOLD) {
    const parsed = parseInt(process.env.KOBAYASHI_ESCALATION_THRESHOLD, 10);
    if (!isNaN(parsed) && parsed > 0) escalationThreshold = parsed;
  }

  return { planner, worker, advisor, escalationThreshold, custom };
}

export function resolveModel(ctx: ExtensionContext, target: ModelSpec) {
  // 1. Direct registry find
  const exact = ctx.modelRegistry.find(target.provider, target.model);
  if (exact) return exact;

  // 2. Search all models in registry loosely
  try {
    const all = typeof ctx.modelRegistry.getAll === "function" ? ctx.modelRegistry.getAll() : [];
    const lowerModel = target.model.toLowerCase();
    const lowerProvider = target.provider.toLowerCase();

    // Match provider + model loosely
    const providerMatch = all.find((m: any) =>
      m.provider?.toLowerCase() === lowerProvider &&
      (m.id?.toLowerCase() === lowerModel || m.name?.toLowerCase() === lowerModel)
    );
    if (providerMatch) return providerMatch;

    // Match model ID directly regardless of provider
    const idMatch = all.find((m: any) =>
      m.id?.toLowerCase() === lowerModel ||
      m.id?.toLowerCase().endsWith(`/${lowerModel}`) ||
      m.name?.toLowerCase() === lowerModel
    );
    if (idMatch) return idMatch;
  } catch {}

  return null;
}

const FAILURE_PATTERNS = [
  /FAIL|FAILED|AssertionError|panic:|fatal error|TypeError:|SyntaxError:/i,
  /npm ERR!|pytest.*failed|cargo.*error\[E/i,
];

interface RouterState {
  phase: "workhorse" | "frontier";
  failures: number;
  escalationReason?: string;
}

interface PlannerWorkerState {
  phase: "planner" | "worker" | "escalated";
  turnCount: number;
  workerFailures: number;
  escalationReason?: string;
}

function lastToolResult(messages: readonly Message[]): { isError: boolean; text: string } | undefined {
  const toolMsg = messages.filter((m) => m.role === "toolResult").at(-1);
  if (!toolMsg) return undefined;

  let text = "";
  if (typeof toolMsg.content === "string") {
    text = toolMsg.content;
  } else if (Array.isArray(toolMsg.content)) {
    text = toolMsg.content.map((b: any) => b.text || "").join("\n");
  }

  const isError = Boolean(toolMsg.isError) || FAILURE_PATTERNS.some((pat) => pat.test(text));
  return { isError, text };
}

function userRequestedFrontier(messages: readonly Message[]): boolean {
  const lastUser = messages.filter((m) => m.role === "user").at(-1);
  if (!lastUser) return false;
  const content = typeof lastUser.content === "string"
    ? lastUser.content
    : JSON.stringify(lastUser.content);
  return /\b(escalate|frontier|planner|think hard|complex design|architect)\b/i.test(content);
}

export function createPlannerWorkerRoute(
  plannerSpec: ModelSpec,
  workerSpec: ModelSpec,
  escalationThreshold = 2
) {
  return async function route(
    request: ModelRouteRequest<PlannerWorkerState>,
    ctx: ExtensionContext
  ): Promise<ModelRoute<PlannerWorkerState>> {
    const plannerModel = resolveModel(ctx, plannerSpec);
    const workerModel = resolveModel(ctx, workerSpec);

    if (request.reason === "direct") {
      if (!plannerModel) {
        if (workerModel) return { model: workerModel, thinkingLevel: "off" };
        throw new Error(`Configured planner model ${plannerSpec.provider}/${plannerSpec.model} not found in model registry`);
      }
      return { model: plannerModel, thinkingLevel: plannerSpec.thinking ?? "low" };
    }

    const state: PlannerWorkerState = request.state
      ? { ...request.state }
      : { phase: "planner", turnCount: 0, workerFailures: 0 };

    // 1. Retry failover: If the worker failed (e.g. Ollama daemon offline or error), failover to planner immediately
    if (request.reason === "retry" && request.failed && workerModel && request.failed.model.id === workerModel.id) {
      state.phase = "escalated";
      state.escalationReason = `Worker failed: ${request.failed.message?.errorMessage || "Service offline"}. Failover to planner.`;
      if (plannerModel) {
        return { model: plannerModel, thinkingLevel: plannerSpec.thinking ?? "low", state };
      }
    }

    state.turnCount++;

    // Check tool results
    const result = lastToolResult(request.messages);
    if (result) {
      if (result.isError) {
        state.workerFailures++;
      } else {
        state.workerFailures = 0;
        if (state.phase === "escalated") {
          // Once blocker resolved, transition back to worker
          state.phase = "worker";
        }
      }
    }

    // Check manual escalation
    if (request.reason === "user" && userRequestedFrontier(request.messages)) {
      state.phase = "escalated";
      state.escalationReason = "User requested planner reasoning";
      state.workerFailures = 0;
    }

    // Worker failed repeatedly -> escalate to Planner
    if (state.phase === "worker" && state.workerFailures >= escalationThreshold) {
      state.phase = "escalated";
      state.escalationReason = `Escalated to planner (${plannerSpec.model}) after ${state.workerFailures} worker failures`;
    }

    // Transition from planner to worker only when planner has completed its cycle:
    // i.e., it produced a text/plan output (NOT an intermediate toolCall),
    // or reached the planner turn budget (max 3 planning turns).
    const assistantMsgs = request.messages.filter((m: any) => m.role === "assistant");
    const lastAssistant = assistantMsgs.at(-1);
    const isToolCalling = lastAssistant && Array.isArray(lastAssistant.content) &&
      lastAssistant.content.some((part: any) => part.type === "toolCall");

    if (state.phase === "planner" && assistantMsgs.length >= 1) {
      if (!isToolCalling || assistantMsgs.length >= 3) {
        state.phase = "worker";
      }
    }

    // Resolve Planner (Luna / Sonnet / DeepSeek / o3-mini)
    if (state.phase === "planner" || state.phase === "escalated") {
      if (!plannerModel) {
        if (workerModel) return { model: workerModel, thinkingLevel: "off", state };
        throw new Error(`Planner model ${plannerSpec.provider}/${plannerSpec.model} not available`);
      }
      return {
        model: plannerModel,
        thinkingLevel: request.thinkingLevel ?? plannerSpec.thinking ?? "medium",
        state,
      };
    }

    // Resolve Worker (Local Ollama / Qwen / Cursor Fast)
    if (!workerModel) {
      if (plannerModel) {
        return { model: plannerModel, thinkingLevel: "low", state };
      }
      throw new Error("Neither worker nor planner model available in registry");
    }

    return {
      model: workerModel,
      thinkingLevel: workerSpec.thinking ?? "off",
      state,
    };
  };
}

export function createBottomUpRoute(
  plannerSpec: ModelSpec,
  workerSpec: ModelSpec,
  escalationThreshold = 2
) {
  return async function route(
    request: ModelRouteRequest<RouterState>,
    ctx: ExtensionContext
  ): Promise<ModelRoute<RouterState>> {
    const plannerModel = resolveModel(ctx, plannerSpec);
    const workerModel = resolveModel(ctx, workerSpec);

    if (request.reason === "direct") {
      if (!plannerModel) {
        if (workerModel) return { model: workerModel, thinkingLevel: "off" };
        throw new Error(`Frontier model ${plannerSpec.provider}/${plannerSpec.model} not found`);
      }
      return { model: plannerModel, thinkingLevel: plannerSpec.thinking ?? "low" };
    }

    const state: RouterState = request.state ? { ...request.state } : { phase: "workhorse", failures: 0 };

    // 1. Retry failover: If the worker failed on retry, failover to planner immediately
    if (request.reason === "retry" && request.failed && workerModel && request.failed.model.id === workerModel.id) {
      state.phase = "frontier";
      state.escalationReason = `Worker failed: ${request.failed.message?.errorMessage || "Service offline"}. Failover to planner.`;
      if (plannerModel) {
        return { model: plannerModel, thinkingLevel: plannerSpec.thinking ?? "medium", state };
      }
    }

    if (request.reason === "user" && userRequestedFrontier(request.messages)) {
      state.phase = "frontier";
      state.escalationReason = "User requested planner reasoning";
      state.failures = 0;
    }

    const result = lastToolResult(request.messages);
    if (result) {
      if (result.isError) {
        state.failures++;
      } else {
        state.failures = 0;
      }
    }

    if (state.phase === "workhorse" && state.failures >= escalationThreshold) {
      state.phase = "frontier";
      state.escalationReason = `Escalated after ${state.failures} consecutive failures`;
    }

    const sticky = request.failed ?? request.previous;
    if (request.reason === "continuation" && sticky && state.phase === "workhorse" && state.failures < escalationThreshold) {
      return {
        model: sticky.model,
        thinkingLevel: sticky.thinkingLevel ?? workerSpec.thinking ?? "off",
        state,
      };
    }

    if (state.phase === "frontier") {
      if (!plannerModel) {
        if (workerModel) return { model: workerModel, thinkingLevel: "off", state };
        throw new Error(`Planner model ${plannerSpec.provider}/${plannerSpec.model} not found`);
      }
      return {
        model: plannerModel,
        thinkingLevel: request.thinkingLevel ?? plannerSpec.thinking ?? "medium",
        state,
      };
    }

    if (!workerModel) {
      if (plannerModel) {
        return { model: plannerModel, thinkingLevel: "low", state };
      }
      throw new Error("Neither workhorse nor planner model available");
    }

    return {
      model: workerModel,
      thinkingLevel: workerSpec.thinking ?? "off",
      state,
    };
  };
}

export default function (pi: ExtensionAPI) {
  const config = loadVirtualModelConfig();

  // --------------------------------------------------------------------------
  // Model 1: auto/planner-worker (Built-in Dynamic Planner -> Dynamic Worker)
  // --------------------------------------------------------------------------
  pi.registerVirtualModel<PlannerWorkerState>({
    provider: "auto",
    id: "planner-worker",
    name: "Top-Down Planner-Worker (Configurable Virtual Router)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,
    route: createPlannerWorkerRoute(config.planner, config.worker, config.escalationThreshold),
  });

  // --------------------------------------------------------------------------
  // Model 2: auto/bottom-up (Built-in Bottom-Up: $0 Workhorse First -> Planner)
  // --------------------------------------------------------------------------
  pi.registerVirtualModel<RouterState>({
    provider: "auto",
    id: "bottom-up",
    name: "Bottom-Up Auto Escalator (Workhorse -> Planner on Failure)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,
    route: createBottomUpRoute(config.planner, config.worker, config.escalationThreshold),
  });

  // --------------------------------------------------------------------------
  // User Custom Virtual Models (Configured via ~/.pi/agent/virtual-models.json)
  // --------------------------------------------------------------------------
  if (config.custom) {
    for (const [id, customSpec] of Object.entries(config.custom)) {
      const provider = customSpec.provider || "auto";
      const name = customSpec.name || `Custom Router: ${id}`;
      const thinkingLevels = (customSpec.thinkingLevels as any) || ["off", "low", "medium", "high"];
      const contextWindow = customSpec.contextWindow || 128_000;
      const maxTokens = customSpec.maxTokens || 16_384;
      const threshold = customSpec.escalationThreshold || config.escalationThreshold;

      if (customSpec.policy === "bottom-up") {
        pi.registerVirtualModel<RouterState>({
          provider,
          id,
          name,
          thinkingLevels,
          contextWindow,
          maxTokens,
          route: createBottomUpRoute(customSpec.planner, customSpec.worker, threshold),
        });
      } else {
        pi.registerVirtualModel<PlannerWorkerState>({
          provider,
          id,
          name,
          thinkingLevels,
          contextWindow,
          maxTokens,
          route: createPlannerWorkerRoute(customSpec.planner, customSpec.worker, threshold),
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Session UI Hook & Status Indicator
  // --------------------------------------------------------------------------
  if (typeof pi.on === "function") {
    pi.on("session_start", async (_event: any, ctx: any) => {
      try {
        if (ctx?.hasUI && ctx?.ui?.setStatus) {
          ctx.ui.setStatus(
            "kobayashi",
            "🏎️  Kobayashi Powertrain: Active | BM25 RAG: 0-Token Cold Starts | /roi"
          );
        }
      } catch {}
    });

    // --------------------------------------------------------------------------
    // Live Telemetry Hook: Real-time turn recording into savings-ledger.jsonl
    // --------------------------------------------------------------------------
    pi.on("turn_end", async (event: any, ctx: any) => {
      try {
        const msg = event?.message;
        if (!msg || msg.role !== "assistant" || !msg.usage) return;

        const ts = event.timestamp || msg.timestamp
          ? new Date(msg.timestamp || event.timestamp).toISOString()
          : new Date().toISOString();
        const model = msg.model || (ctx?.model?.id) || "unknown";
        const provider = msg.provider || (ctx?.model?.provider) || "unknown";
        const u = msg.usage;

        const { actualUsd, sonnetBaselineUsd } = calculateTurnCosts(model, u);
        let eventName = "other";
        if (/ornith|qwen|llama|local|ollama/i.test(model)) {
          eventName = "workhorse";
        } else if (/luna|mantle|gpt/i.test(model)) {
          eventName = "orchestrator";
        } else if (/sonnet|opus|advisor/i.test(model)) {
          eventName = "advisor";
        } else if (/haiku/i.test(model)) {
          eventName = "triage";
        }

        const entry = {
          ts,
          event: eventName,
          model,
          provider,
          exact: true,
          inputTokens: u.input || 0,
          cacheReadTokens: u.cacheRead || 0,
          cacheWriteTokens: u.cacheWrite || 0,
          outputTokens: u.output || 0,
          totalTokens: (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0),
          actualUsd: Number(actualUsd.toFixed(6)),
          sonnetBaselineUsd: Number(sonnetBaselineUsd.toFixed(6)),
        };

        const ledgerPath = path.join(process.env.HOME || "", ".pi", "agent", "savings-ledger.jsonl");
        fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
        fs.appendFileSync(ledgerPath, JSON.stringify(entry) + "\n");
      } catch {
        // Telemetry logging is completely isolated and never interrupts agent turns
      }
    });
  }

  // --------------------------------------------------------------------------
  // Slash Commands: /roi, /stats, /dash, /virtual inside interactive Pi
  // --------------------------------------------------------------------------
  if (typeof pi.registerCommand === "function") {
    const showRoi = async (_args: string, ctx: any) => {
      try {
        const ledgerPath = path.join(process.env.HOME || "", ".pi", "agent", "savings-ledger.jsonl");
        let turns = 0;
        let actual = 0;
        let baseline = 0;
        let tokens = 0;
        let cached = 0;
        let workhorseTurns = 0;

        if (fs.existsSync(ledgerPath)) {
          const lines = fs.readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean);
          for (const l of lines) {
            try {
              const e = JSON.parse(l);
              turns++;
              actual += e.actualUsd || 0;
              baseline += e.sonnetBaselineUsd || 0;
              tokens += e.totalTokens || 0;
              cached += e.cacheReadTokens || 0;
              if (e.event === "workhorse" || (e.model && /ornith|qwen|ollama/i.test(e.model))) {
                workhorseTurns++;
              }
            } catch {}
          }
        }

        const saved = Math.max(0, baseline - actual);
        const pct = baseline > 0 ? ((saved / baseline) * 100).toFixed(1) : "0.0";
        const cachePct = tokens > 0 ? ((cached / tokens) * 100).toFixed(1) : "0.0";
        const tokM = (tokens / 1_000_000).toFixed(2);

        const summaryMsg =
          `🏁 Kobayashi Scorecard: $${saved.toFixed(2)} Capital Saved (${pct}% Cost Reduction vs Claude Code) | ` +
          `${tokM}M tokens (${cachePct}% cache reuse) across ${turns} turns (${workhorseTurns} turns on local RAM @ $0.00).`;

        if (ctx?.ui?.notify) {
          ctx.ui.notify(summaryMsg, "info");
        }
      } catch (err: any) {
        if (ctx?.ui?.notify) ctx.ui.notify("Could not read telemetry: " + err.message, "error");
      }
    };

    pi.registerCommand("roi", {
      description: "Display Kobayashi Maru cumulative capital saved & token efficiency scorecard",
      handler: showRoi,
    });

    pi.registerCommand("stats", {
      description: "Display cumulative telemetry audit, token usage by tier, and capital saved",
      handler: showRoi,
    });

    pi.registerCommand("dash", {
      description: "Launch live executive telemetry web dashboard at http://127.0.0.1:4200",
      handler: async (_args: string, ctx: any) => {
        try {
          const dashScript = path.join(process.env.HOME || "", ".pi", "agent", "exec-dashboard.mjs");
          if (fs.existsSync(dashScript)) {
            const { spawn, exec } = await import("child_process");
            const child = spawn(process.execPath, [dashScript], { detached: true, stdio: "ignore" });
            child.unref();
            exec('open "http://127.0.0.1:4200"');
            if (ctx?.ui?.notify) ctx.ui.notify("Executive dashboard opened at http://127.0.0.1:4200", "info");
          } else {
            if (ctx?.ui?.notify) ctx.ui.notify("Dashboard script not found at " + dashScript, "warning");
          }
        } catch (e: any) {
          if (ctx?.ui?.notify) ctx.ui.notify("Failed to launch dashboard: " + e.message, "error");
        }
      },
    });

    pi.registerCommand("virtual", {
      description: "List available native virtual models (e.g. auto/planner-worker, auto/bottom-up)",
      handler: async (_args: string, ctx: any) => {
        try {
          const vConfigPath = path.join(process.env.HOME || "", ".pi", "agent", "virtual-models.json");
          let models = ["auto/planner-worker (Planner -> Local Workhorse)", "auto/bottom-up ($0 Local Workhorse -> Planner)"];
          if (fs.existsSync(vConfigPath)) {
            const c = JSON.parse(fs.readFileSync(vConfigPath, "utf8"));
            if (c.custom) {
              for (const [id, m] of Object.entries(c.custom)) {
                models.push(`auto/${id} (${(m as any).planner?.model} + ${(m as any).worker?.model})`);
              }
            }
          }
          if (ctx?.ui?.select) {
            const picked = await ctx.ui.select("Active Virtual Models:", models);
            if (picked) {
              const modelId = picked.split(" ")[0];
              if (ctx?.setModel) {
                await ctx.setModel({ provider: "auto", id: modelId.replace("auto/", "") });
                ctx.ui.notify(`Switched model to ${modelId}`, "info");
              }
            }
          } else if (ctx?.ui?.notify) {
            ctx.ui.notify("Virtual models: " + models.join(", "), "info");
          }
        } catch (e: any) {
          if (ctx?.ui?.notify) ctx.ui.notify("Error: " + e.message, "error");
        }
      },
    });
  }
}

const PRICING_TABLE: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "ornith-1.5:ctx": { input: 0.0, output: 0.0, cacheRead: 0.0, cacheWrite: 0.0 },
  "ornith-1.5:9b": { input: 0.0, output: 0.0, cacheRead: 0.0, cacheWrite: 0.0 },
  "openai.gpt-5.6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "openai.gpt-6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "us.openai.gpt-6-sol": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "us.openai.gpt-6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "global.anthropic.claude-haiku-5-5": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80 },
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80 },
  "us.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "us.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "global.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "global.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "us.anthropic.claude-sonnet-4-6": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "au.anthropic.claude-opus-4-6-v1": { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  "deepseek/deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.14 },
};

const SONNET_BASELINE = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

export function calculateTurnCosts(
  modelName: string,
  usage: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
): { actualUsd: number; sonnetBaselineUsd: number } {
  const input = usage.input || 0;
  const output = usage.output || 0;
  const cacheRead = usage.cacheRead || 0;
  const cacheWrite = usage.cacheWrite || 0;

  const sonnetBaselineUsd =
    (input * SONNET_BASELINE.input +
      output * SONNET_BASELINE.output +
      cacheRead * SONNET_BASELINE.cacheRead +
      cacheWrite * SONNET_BASELINE.cacheWrite) /
    1_000_000;

  const cleanModel = (modelName || "").split("/").pop() || "";
  let rate = PRICING_TABLE[cleanModel];
  if (!rate) {
    if (/ornith|qwen|llama|mistral|deepseek-r1|local/i.test(cleanModel) || modelName.startsWith("ollama")) {
      rate = { input: 0.0, output: 0.0, cacheRead: 0.0, cacheWrite: 0.0 };
    } else if (/haiku/i.test(cleanModel)) {
      rate = { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80 };
    } else if (/sonnet/i.test(cleanModel)) {
      rate = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };
    } else if (/opus/i.test(cleanModel)) {
      rate = { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };
    } else if (/deepseek/i.test(cleanModel)) {
      rate = { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.14 };
    } else {
      rate = { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 };
    }
  }

  const actualUsd =
    (input * rate.input +
      output * rate.output +
      cacheRead * rate.cacheRead +
      cacheWrite * rate.cacheWrite) /
    1_000_000;

  return { actualUsd, sonnetBaselineUsd };
}
