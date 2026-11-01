/**
 * Native Dual Virtual Model Routing System for Pi
 *
 * 1. auto/planner-worker:
 *    - Turn 1 (Architect/Planner): Routes to Frontier (GPT-5.6 Luna) to reason, plan, and outline solution.
 *    - Turns 2..N (Worker/Execution): Routes to Local Workhorse (Ollama Ornith 1.5) at $0.00 compute.
 *    - Escalation: Automatically escalates back to Luna on 2 consecutive worker failures or test breaks.
 *
 * 2. auto/bottom-up:
 *    - Starts on Local Workhorse (Ornith 1.5) at $0.00.
 *    - Auto-escalates to Luna when 2 consecutive failures occur.
 *
 * Fully native in-process virtual models (0 subprocess hacks, 0 latency overhead).
 */

import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ModelRoute, ModelRouteRequest } from "@earendil-works/pi-coding-agent";

const WORKHORSE_PROVIDER = "ollama";
const WORKHORSE_MODEL = "ornith-1.5:ctx";

const FRONTIER_PROVIDER = "bedrock-mantle";
const FRONTIER_MODEL = "openai.gpt-5.6-luna";

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
  return /\b(escalate|frontier|think hard|complex design|architect)\b/i.test(content);
}

export default function (pi: ExtensionAPI) {
  // --------------------------------------------------------------------------
  // Model 1: auto/planner-worker (Top-Down: Luna Plans -> Ornith Executes -> Luna Fixes)
  // --------------------------------------------------------------------------
  pi.registerVirtualModel<PlannerWorkerState>({
    provider: "auto",
    id: "planner-worker",
    name: "Top-Down Planner-Worker (Luna Plans -> Local Executes)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,

    async route(request: ModelRouteRequest<PlannerWorkerState>, ctx: ExtensionContext): Promise<ModelRoute<PlannerWorkerState>> {
      if (request.reason === "direct") {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error(`Frontier model ${FRONTIER_PROVIDER}/${FRONTIER_MODEL} not found`);
        return { model: frontier, thinkingLevel: "low" };
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
        state.escalationReason = "User requested frontier reasoning";
        state.workerFailures = 0;
      }

      // Worker failed twice -> escalate to Luna
      if (state.phase === "worker" && state.workerFailures >= 2) {
        state.phase = "escalated";
        state.escalationReason = `Escalated to Luna after ${state.workerFailures} worker failures`;
      }

      // Transition from planner to worker after first assistant response
      const assistantMsgs = request.messages.filter((m) => m.role === "assistant");
      if (state.phase === "planner" && assistantMsgs.length >= 1) {
        state.phase = "worker";
      }

      // Resolve Frontier (Luna)
      if (state.phase === "planner" || state.phase === "escalated") {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error(`Frontier model ${FRONTIER_PROVIDER}/${FRONTIER_MODEL} not found`);
        return {
          model: frontier,
          thinkingLevel: request.thinkingLevel ?? "medium",
          state,
        };
      }

      // Resolve Worker (Local Ornith 1.5)
      const workhorse = ctx.modelRegistry.find(WORKHORSE_PROVIDER, WORKHORSE_MODEL);
      if (!workhorse) {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error("Neither workhorse nor frontier model available");
        return { model: frontier, thinkingLevel: "low", state };
      }

      return {
        model: workhorse,
        thinkingLevel: "off",
        state,
      };
    },
  });

  // --------------------------------------------------------------------------
  // Model 2: auto/bottom-up (Bottom-Up: Local Workhorse First -> Luna on Failure)
  // --------------------------------------------------------------------------
  pi.registerVirtualModel<RouterState>({
    provider: "auto",
    id: "bottom-up",
    name: "Bottom-Up Auto Escalator (Local -> Luna)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,

    async route(request: ModelRouteRequest<RouterState>, ctx: ExtensionContext): Promise<ModelRoute<RouterState>> {
      if (request.reason === "direct") {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error(`Frontier model ${FRONTIER_PROVIDER}/${FRONTIER_MODEL} not found`);
        return { model: frontier, thinkingLevel: "low" };
      }

      const state: RouterState = request.state ? { ...request.state } : { phase: "workhorse", failures: 0 };

      if (request.reason === "user" && userRequestedFrontier(request.messages)) {
        state.phase = "frontier";
        state.escalationReason = "User requested frontier reasoning";
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

      if (state.phase === "workhorse" && state.failures >= 2) {
        state.phase = "frontier";
        state.escalationReason = `Escalated after ${state.failures} consecutive failures`;
      }

      const sticky = request.failed ?? request.previous;
      if (request.reason === "continuation" && sticky && state.phase === "workhorse" && state.failures < 2) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? "off",
          state,
        };
      }

      if (state.phase === "frontier") {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error(`Frontier model ${FRONTIER_PROVIDER}/${FRONTIER_MODEL} not found`);
        return {
          model: frontier,
          thinkingLevel: request.thinkingLevel ?? "medium",
          state,
        };
      }

      const workhorse = ctx.modelRegistry.find(WORKHORSE_PROVIDER, WORKHORSE_MODEL);
      if (!workhorse) {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error("Neither workhorse nor frontier model available");
        return { model: frontier, thinkingLevel: "low", state };
      }

      return {
        model: workhorse,
        thinkingLevel: "off",
        state,
      };
    },
  });
}
