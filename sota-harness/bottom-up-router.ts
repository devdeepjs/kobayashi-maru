/**
 * Native Bottom-Up Escalation Router for Pi
 *
 * Starts on the local workhorse (Ollama Ornith 1.5) for $0.00 compute.
 * Automatically escalates to Frontier (GPT-5.6 Luna / Claude Sonnet) when:
 * 1. Two consecutive tool calls or tests fail.
 * 2. An unhandled exception or assertion error occurs.
 * 3. The user explicitly requests frontier reasoning.
 *
 * Implemented via Pi's native Virtual Model API (in-process, 0 subprocess hacks).
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

type RouterRequest = ModelRouteRequest<RouterState>;

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
  pi.registerVirtualModel<RouterState>({
    provider: "auto",
    id: "bottom-up",
    name: "Bottom-Up Auto Escalator (Local -> Luna)",
    thinkingLevels: ["off", "low", "medium", "high"],
    contextWindow: 128_000,
    maxTokens: 16_384,

    async route(request: RouterRequest, ctx: ExtensionContext): Promise<ModelRoute<RouterState>> {
      // 1. Requests outside the agent loop (e.g. compaction) go to frontier
      if (request.reason === "direct") {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error(`Frontier model ${FRONTIER_PROVIDER}/${FRONTIER_MODEL} not found`);
        return { model: frontier, thinkingLevel: "low" };
      }

      const state: RouterState = request.state ? { ...request.state } : { phase: "workhorse", failures: 0 };

      // 2. Check for manual user escalation
      if (request.reason === "user" && userRequestedFrontier(request.messages)) {
        state.phase = "frontier";
        state.escalationReason = "User requested frontier reasoning";
        state.failures = 0;
      }

      // 3. Inspect recent tool outcomes in the agent loop
      const result = lastToolResult(request.messages);
      if (result) {
        if (result.isError) {
          state.failures++;
        } else {
          // Successful test or tool execution resets failure count
          state.failures = 0;
        }
      }

      // 4. Trigger auto-escalation after 2 failures on the workhorse
      if (state.phase === "workhorse" && state.failures >= 2) {
        state.phase = "frontier";
        state.escalationReason = `Escalated after ${state.failures} consecutive failures`;
      }

      // 5. Continuation turns stay sticky to preserve KV cache
      const sticky = request.failed ?? request.previous;
      if (request.reason === "continuation" && sticky && state.phase === "workhorse" && state.failures < 2) {
        return { 
          model: sticky.model, 
          thinkingLevel: sticky.thinkingLevel ?? "off", 
          state 
        };
      }

      // 6. Resolve target model
      if (state.phase === "frontier") {
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error(`Frontier model ${FRONTIER_PROVIDER}/${FRONTIER_MODEL} not found`);
        return { 
          model: frontier, 
          thinkingLevel: request.thinkingLevel ?? "medium", 
          state 
        };
      }

      // Default: run on local workhorse
      const workhorse = ctx.modelRegistry.find(WORKHORSE_PROVIDER, WORKHORSE_MODEL);
      if (!workhorse) {
        // Fallback to frontier if Ollama is offline or model uninstalled
        const frontier = ctx.modelRegistry.find(FRONTIER_PROVIDER, FRONTIER_MODEL);
        if (!frontier) throw new Error("Neither workhorse nor frontier model available");
        return { model: frontier, thinkingLevel: "low", state };
      }

      return { 
        model: workhorse, 
        thinkingLevel: "off", 
        state 
      };
    },
  });
}
