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

export interface VirtualModelsConfig {
  planner: ModelSpec;
  worker: ModelSpec;
  advisor?: ModelSpec;
  escalationThreshold: number;
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

  return { planner, worker, advisor, escalationThreshold };
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

export default function (pi: ExtensionAPI) {
  // --------------------------------------------------------------------------
  // Model 1: auto/planner-worker (Dynamic Planner -> Dynamic Worker -> Planner Escalate)
  // --------------------------------------------------------------------------
  pi.registerVirtualModel<PlannerWorkerState>({
    provider: "auto",
    id: "planner-worker",
    name: "Top-Down Planner-Worker (Configurable Virtual Router)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,

    async route(request: ModelRouteRequest<PlannerWorkerState>, ctx: ExtensionContext): Promise<ModelRoute<PlannerWorkerState>> {
      const config = loadVirtualModelConfig();
      const plannerModel = resolveModel(ctx, config.planner);
      const workerModel = resolveModel(ctx, config.worker);

      if (request.reason === "direct") {
        if (!plannerModel) {
          if (workerModel) return { model: workerModel, thinkingLevel: "off" };
          throw new Error(`Configured planner model ${config.planner.provider}/${config.planner.model} not found in model registry`);
        }
        return { model: plannerModel, thinkingLevel: config.planner.thinking ?? "low" };
      }

      const state: PlannerWorkerState = request.state
        ? { ...request.state }
        : { phase: "planner", turnCount: 0, workerFailures: 0 };

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
      if (state.phase === "worker" && state.workerFailures >= config.escalationThreshold) {
        state.phase = "escalated";
        state.escalationReason = `Escalated to planner (${config.planner.model}) after ${state.workerFailures} worker failures`;
      }

      // Transition from planner to worker only when planner has completed its cycle:
      // i.e., it produced a text/plan output (NOT an intermediate toolCall),
      // or reached the planner turn budget (max 3 planning turns).
      const assistantMsgs = request.messages.filter((m) => m.role === "assistant");
      const lastAssistant = assistantMsgs.at(-1);
      const isToolCalling = lastAssistant && Array.isArray(lastAssistant.content) &&
        lastAssistant.content.some((part: any) => part.type === "toolCall");

      if (state.phase === "planner" && assistantMsgs.length >= 1) {
        // If the planner just emitted a tool call, keep it in planner phase so it receives and interprets the result
        if (!isToolCalling || assistantMsgs.length >= 3) {
          state.phase = "worker";
        }
      }

      // Resolve Planner (Luna / Sonnet / DeepSeek / o3-mini)
      if (state.phase === "planner" || state.phase === "escalated") {
        if (!plannerModel) {
          if (workerModel) return { model: workerModel, thinkingLevel: "off", state };
          throw new Error(`Planner model ${config.planner.provider}/${config.planner.model} not available`);
        }
        return {
          model: plannerModel,
          thinkingLevel: request.thinkingLevel ?? config.planner.thinking ?? "medium",
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
        thinkingLevel: config.worker.thinking ?? "off",
        state,
      };
    },
  });

  // --------------------------------------------------------------------------
  // Model 2: auto/bottom-up (Bottom-Up: Configurable Workhorse First -> Planner on Failure)
  // --------------------------------------------------------------------------
  pi.registerVirtualModel<RouterState>({
    provider: "auto",
    id: "bottom-up",
    name: "Bottom-Up Auto Escalator (Workhorse -> Planner on Failure)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,

    async route(request: ModelRouteRequest<RouterState>, ctx: ExtensionContext): Promise<ModelRoute<RouterState>> {
      const config = loadVirtualModelConfig();
      const plannerModel = resolveModel(ctx, config.planner);
      const workerModel = resolveModel(ctx, config.worker);

      if (request.reason === "direct") {
        if (!plannerModel) {
          if (workerModel) return { model: workerModel, thinkingLevel: "off" };
          throw new Error(`Frontier model ${config.planner.provider}/${config.planner.model} not found`);
        }
        return { model: plannerModel, thinkingLevel: config.planner.thinking ?? "low" };
      }

      const state: RouterState = request.state ? { ...request.state } : { phase: "workhorse", failures: 0 };

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

      if (state.phase === "workhorse" && state.failures >= config.escalationThreshold) {
        state.phase = "frontier";
        state.escalationReason = `Escalated after ${state.failures} consecutive failures`;
      }

      const sticky = request.failed ?? request.previous;
      if (request.reason === "continuation" && sticky && state.phase === "workhorse" && state.failures < config.escalationThreshold) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? config.worker.thinking ?? "off",
          state,
        };
      }

      if (state.phase === "frontier") {
        if (!plannerModel) {
          if (workerModel) return { model: workerModel, thinkingLevel: "off", state };
          throw new Error(`Planner model ${config.planner.provider}/${config.planner.model} not found`);
        }
        return {
          model: plannerModel,
          thinkingLevel: request.thinkingLevel ?? config.planner.thinking ?? "medium",
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
        thinkingLevel: config.worker.thinking ?? "off",
        state,
      };
    },
  });
}
