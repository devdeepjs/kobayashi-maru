import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import skillRagInit from "../skill-rag.js";
import gitCheckpointInit from "../git-checkpoint.js";
import bottomUpRouterInit from "../bottom-up-router.js";

async function runLiveRuntimeSimulation() {
  console.log("=== 1. Testing Skill-RAG & find_skill Execution ===");
  const registeredTools: Record<string, any> = {};
  const registeredEvents: Record<string, Function[]> = {};

  const mockPi: any = {
    on: (event: string, handler: Function) => {
      if (!registeredEvents[event]) registeredEvents[event] = [];
      registeredEvents[event].push(handler);
    },
    registerTool: (tool: any) => {
      registeredTools[tool.name] = tool;
    },
    registerVirtualModel: (model: any) => {},
    exec: async (cmd: string, args: string[]) => {
      return { stdout: "mock-stash-ref\n", exitCode: 0 };
    },
  };

  skillRagInit(mockPi);
  assert.ok(registeredTools["find_skill"], "find_skill tool must be registered");
  assert.equal(typeof registeredTools["find_skill"].execute, "function", "find_skill must have execute function");
  assert.equal(typeof registeredTools["find_skill"].handler, "function", "find_skill must have handler function");

  // Mimic Pi 1.4.0 calling tool.execute(callId, params, signal, onUpdate)
  const tddCall = await registeredTools["find_skill"].execute("call-101", { query: "unit tests tdd vitest" });
  assert.ok(tddCall.content, "Result must have content array");
  assert.ok(tddCall.content[0].text.includes("tdd"), "Result must contain tdd skill runbook");
  console.log("  ✔ find_skill('tdd') returned runbook:", tddCall.content[0].text.split("\n")[0]);

  // Mimic tool.execute(params)
  const specCall = await registeredTools["find_skill"].execute({ query: "to-spec requirements architecture" });
  assert.ok(specCall.content[0].text.includes("to-spec"), "Result must contain to-spec skill");
  console.log("  ✔ find_skill('to-spec') returned runbook:", specCall.content[0].text.split("\n")[0]);

  // Test turn start with 0 query (generic greeting 'hi')
  const beforeStartHandlers = registeredEvents["before_agent_start"] || [];
  assert.ok(beforeStartHandlers.length > 0, "Must have before_agent_start handler");

  const turnZeroEvent = {
    prompt: "hi",
    systemPromptOptions: {
      skills: [{ name: "tdd" }, { name: "code-review" }],
      selectedTools: ["read", "bash", "edit", "write", "fetch_budget_from_portkey", "web_search"],
    },
  };
  await beforeStartHandlers[0](turnZeroEvent, {});
  assert.equal(turnZeroEvent.systemPromptOptions.skills.length, 0, "Greetings must inject 0 skills (0 tokens)");
  assert.ok(!turnZeroEvent.systemPromptOptions.selectedTools.includes("fetch_budget_from_portkey"), "Passive tools must be filtered");
  assert.ok(!turnZeroEvent.systemPromptOptions.selectedTools.includes("web_search"), "Web search must be context-gated on greetings");
  console.log("  ✔ Cold start 'hi': 0 skills injected (Zero token waste verified)");

  // Test prompt with Jira keyword
  const jiraEvent = {
    prompt: "using jira skill read this ticket https://ontichelp.atlassian.net/browse/ONT-51883",
    systemPromptOptions: {
      skills: [{ name: "tdd" }],
      selectedTools: ["read", "bash", "edit", "write", "web_search", "fetch_content"],
    },
  };
  await beforeStartHandlers[0](jiraEvent, {});
  assert.ok(jiraEvent.systemPromptOptions.selectedTools.includes("web_search"), "web_search must be kept when jira is requested");
  assert.ok(jiraEvent.systemPromptOptions.selectedTools.includes("fetch_content"), "fetch_content must be kept when jira is requested");
  console.log("  ✔ Jira prompt: web tools dynamically enabled for ticket extraction");

  console.log("\n=== 2. Testing Architecture-Safe Git-Checkpoint ===");
  const mockGitPi: any = {
    on: (event: string, handler: Function) => {
      if (!registeredEvents[event]) registeredEvents[event] = [];
      registeredEvents[event].push(handler);
    },
    exec: async (cmd: string, args: string[]) => {
      // Simulate broken Intel binary throwing -86 on /usr/local/bin/git
      if (cmd === "/usr/local/bin/git") {
        const err: any = new Error("spawn Unknown system error -86");
        err.code = "EBADARCH";
        throw err;
      }
      if (cmd === "/opt/homebrew/bin/git" || cmd === "/usr/bin/git" || cmd === "git") {
        if (args[0] === "--version") return { stdout: "git version 2.50.1 (Apple Git-155)\n", exitCode: 0 };
        if (args[0] === "rev-parse") return { stdout: "true\n", exitCode: 0 };
        if (args[0] === "stash") return { stdout: "refs/stash@{0}\n", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    },
  };

  gitCheckpointInit(mockGitPi);
  const turnStartHandlers = registeredEvents["turn_start"] || [];
  assert.ok(turnStartHandlers.length > 0, "turn_start handler must be registered");

  // Trigger turn_start. Should gracefully find working git and not throw -86!
  await turnStartHandlers[0]();
  console.log("  ✔ turn_start checkpoint executed with 0 errors (EBADARCH -86 successfully bypassed)");

  console.log("\n=== 3. Testing Dual Virtual Model Routing ===");
  const registeredVirtualModels: Record<string, any> = {};
  const mockRouterPi: any = {
    registerVirtualModel: (model: any) => {
      registeredVirtualModels[model.id] = model;
    },
  };
  bottomUpRouterInit(mockRouterPi);
  assert.ok(registeredVirtualModels["planner-worker"], "auto/planner-worker must be registered");
  assert.ok(registeredVirtualModels["bottom-up"], "auto/bottom-up must be registered");

  const mockModelRegistry = {
    find: (provider: string, model: string) => ({ id: `${provider}/${model}`, provider, name: model }),
    getAll: () => [
      { id: "openai.gpt-5.6-luna", provider: "bedrock-mantle", name: "Luna" },
      { id: "ornith-1.5:ctx", provider: "ollama", name: "Ornith" },
    ],
  };

  // Turn 1 should route to Planner (Luna)
  const turn1Route = await registeredVirtualModels["planner-worker"].route(
    { messages: [{ role: "user", content: "Plan authentication architecture" }], reason: "turn" },
    { modelRegistry: mockModelRegistry }
  );
  assert.equal(turn1Route.model.id, "bedrock-mantle/openai.gpt-5.6-luna", "Turn 1 must route to Planner");
  console.log("  ✔ Turn 1 routed to Planner:", turn1Route.model.id);

  // Turn 2 should route to Worker (Local Ornith at $0.00)
  const turn2Route = await registeredVirtualModels["planner-worker"].route(
    {
      messages: [
        { role: "user", content: "Plan authentication architecture" },
        { role: "assistant", content: [{ type: "text", text: "Here is the architectural plan..." }] },
      ],
      state: turn1Route.state,
      reason: "turn",
    },
    { modelRegistry: mockModelRegistry }
  );
  assert.equal(turn2Route.model.id, "ollama/ornith-1.5:ctx", "Turn 2 must route to Local Workhorse ($0.00)");
  console.log("  ✔ Turn 2 routed to Local Workhorse ($0.00):", turn2Route.model.id);

  console.log("\n=== 4. Testing Telemetry Dashboard Headers ===");
  const dashboardPath = path.resolve(process.cwd(), "src/dashboard/exec-dashboard.mjs");
  const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
  assert.ok(!dashboardHtml.includes("<title>Kobayashi // DeepSeek Harness"), "Title must not contain DeepSeek Harness");
  assert.ok(dashboardHtml.includes("<title>Kobayashi Maru // OpenTelemetry Observability</title>"), "Title must be Kobayashi Maru");
  console.log("  ✔ Dashboard title verified: Kobayashi Maru // OpenTelemetry Observability");

  console.log("\n=======================================================");
  console.log("🏁 ALL LIVE SIMULATION TESTS PASSED WITH ZERO ERRORS!");
  console.log("=======================================================\n");
}

runLiveRuntimeSimulation().catch((err) => {
  console.error("SIMULATION FAILED:", err);
  process.exit(1);
});
