import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import bottomUpRouterInit, {
  parseModelSpec,
  loadVirtualModelConfig,
  createPlannerWorkerRoute,
  createBottomUpRoute,
} from "../bottom-up-router.js";

test("parseModelSpec: parses string with provider/model", () => {
  const spec = parseModelSpec("anthropic/claude-3-7-sonnet-20250219", "bedrock-mantle", "openai.gpt-5.6-luna", "high");
  assert.equal(spec.provider, "anthropic");
  assert.equal(spec.model, "claude-3-7-sonnet-20250219");
  assert.equal(spec.thinking, "high");
});

test("parseModelSpec: parses object spec with thinking", () => {
  const spec = parseModelSpec(
    { provider: "openrouter", model: "deepseek/deepseek-r1", thinking: "medium" },
    "ollama",
    "ornith-1.5:ctx"
  );
  assert.equal(spec.provider, "openrouter");
  assert.equal(spec.model, "deepseek/deepseek-r1");
  assert.equal(spec.thinking, "medium");
});

test("parseModelSpec: handles missing provider with default", () => {
  const spec = parseModelSpec("custom-local-model", "ollama", "ornith-1.5:ctx");
  assert.equal(spec.provider, "ollama");
  assert.equal(spec.model, "custom-local-model");
});

test("loadVirtualModelConfig: respects environment variable overrides", () => {
  process.env.KOBAYASHI_PLANNER = "openai/o3-mini";
  process.env.KOBAYASHI_WORKER = "ollama/qwen2.5-coder:7b";
  process.env.KOBAYASHI_ESCALATION_THRESHOLD = "3";

  try {
    const config = loadVirtualModelConfig();
    assert.equal(config.planner.provider, "openai");
    assert.equal(config.planner.model, "o3-mini");
    assert.equal(config.worker.provider, "ollama");
    assert.equal(config.worker.model, "qwen2.5-coder:7b");
    assert.equal(config.escalationThreshold, 3);
  } finally {
    delete process.env.KOBAYASHI_PLANNER;
    delete process.env.KOBAYASHI_WORKER;
    delete process.env.KOBAYASHI_ESCALATION_THRESHOLD;
  }
});

test("custom virtual models: dynamically registered and routes correctly", async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-custom-vm-test-"));
  const origHome = process.env.HOME;
  process.env.HOME = tmpHome;

  try {
    const configDir = path.join(tmpHome, ".pi", "agent");
    fs.mkdirSync(configDir, { recursive: true });

    const virtualModelsJson = {
      planner: { provider: "bedrock-mantle", model: "openai.gpt-5.6-luna", thinking: "medium" },
      worker: { provider: "ollama", model: "ornith-1.5:ctx", thinking: "off" },
      custom: {
        "speed-coder": {
          name: "Speed Coder Custom",
          planner: "anthropic/claude-3-5-haiku-20241022",
          worker: "ollama/qwen2.5-coder:7b",
          policy: "bottom-up",
          escalationThreshold: 2,
        },
        "deep-pair": {
          name: "Deep Pair Custom",
          planner: "openrouter/deepseek/deepseek-r1",
          worker: "bedrock-mantle/openai.gpt-5.6-luna",
          policy: "planner-worker",
          escalationThreshold: 1,
        },
      },
    };
    fs.writeFileSync(path.join(configDir, "virtual-models.json"), JSON.stringify(virtualModelsJson, null, 2));

    const config = loadVirtualModelConfig();
    assert.ok(config.custom);
    assert.ok(config.custom["speed-coder"]);
    assert.equal(config.custom["speed-coder"].planner.provider, "anthropic");
    assert.equal(config.custom["speed-coder"].planner.model, "claude-3-5-haiku-20241022");
    assert.equal(config.custom["speed-coder"].policy, "bottom-up");

    assert.ok(config.custom["deep-pair"]);
    assert.equal(config.custom["deep-pair"].planner.provider, "openrouter");
    assert.equal(config.custom["deep-pair"].planner.model, "deepseek/deepseek-r1");
    assert.equal(config.custom["deep-pair"].policy, "planner-worker");

    // Test Pi extension registration
    const registered: Record<string, any> = {};
    const mockPi: any = {
      registerVirtualModel: (def: any) => {
        registered[`${def.provider}/${def.id}`] = def;
      },
    };
    bottomUpRouterInit(mockPi);

    // Both built-in and custom virtual models must be registered
    assert.ok(registered["auto/planner-worker"], "auto/planner-worker must be registered");
    assert.ok(registered["auto/bottom-up"], "auto/bottom-up must be registered");
    assert.ok(registered["auto/speed-coder"], "custom auto/speed-coder must be registered");
    assert.ok(registered["auto/deep-pair"], "custom auto/deep-pair must be registered");

    // Test routing on custom auto/speed-coder (bottom-up: starts on worker qwen2.5-coder:7b)
    const mockRegistry = {
      find: (p: string, m: string) => ({ id: `${p}/${m}`, provider: p, name: m }),
      getAll: () => [
        { id: "claude-3-5-haiku-20241022", provider: "anthropic", name: "Haiku" },
        { id: "qwen2.5-coder:7b", provider: "ollama", name: "Qwen" },
      ],
    };

    const speedCoderRoute = await registered["auto/speed-coder"].route(
      { messages: [{ role: "user", content: "Write quick test" }], reason: "turn" },
      { modelRegistry: mockRegistry }
    );
    assert.equal(speedCoderRoute.model.id, "ollama/qwen2.5-coder:7b", "Bottom-up custom router must start on worker");

    // Test routing on custom auto/deep-pair (top-down: starts on planner deepseek-r1)
    const mockRegistry2 = {
      find: (p: string, m: string) => ({ id: `${p}/${m}`, provider: p, name: m }),
      getAll: [
        { id: "deepseek/deepseek-r1", provider: "openrouter", name: "R1" },
        { id: "openai.gpt-5.6-luna", provider: "bedrock-mantle", name: "Luna" },
      ],
    };

    const deepPairRoute = await registered["auto/deep-pair"].route(
      { messages: [{ role: "user", content: "Architect new system" }], reason: "turn" },
      { modelRegistry: mockRegistry2 }
    );
    assert.equal(deepPairRoute.model.id, "openrouter/deepseek/deepseek-r1", "Top-down custom router must start on planner");
  } finally {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
