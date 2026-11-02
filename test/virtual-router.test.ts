import test from "node:test";
import assert from "node:assert/strict";
import { parseModelSpec, loadVirtualModelConfig } from "../bottom-up-router.js";

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
