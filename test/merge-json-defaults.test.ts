import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergeJsonDefaults } from "../bin/merge-json-defaults.cjs";

test("existing planner, worker, advisor, custom, and userName stay; a missing key is filled", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "km-merge-"));
  const dest = path.join(dir, "virtual-models.json");
  fs.writeFileSync(
    dest,
    JSON.stringify({
      planner: { provider: "bedrock-mantle", model: "keep-me", thinking: "medium" },
      worker: { provider: "ollama", model: "ornith-1.5:ctx", thinking: "off" },
      custom: { sniper: { id: "sniper" } },
      userName: "Devdeep",
    })
  );
  const merged = mergeJsonDefaults(dest, {
    planner: { provider: "other", model: "replaced", thinking: "low" },
    worker: { provider: "ollama", model: "other", thinking: "off" },
    advisor: { provider: "amazon-bedrock", model: "us.anthropic.claude-sonnet-5-5", thinking: "high" },
    escalationThreshold: 2,
    custom: {},
    userName: "somebody-else",
  });
  assert.equal(merged.planner.model, "keep-me");
  assert.equal(merged.worker.model, "ornith-1.5:ctx");
  assert.equal(merged.userName, "Devdeep");
  assert.equal(merged.custom.sniper.id, "sniper");
  assert.equal(merged.advisor.model, "us.anthropic.claude-sonnet-5-5");
  assert.equal(merged.escalationThreshold, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
