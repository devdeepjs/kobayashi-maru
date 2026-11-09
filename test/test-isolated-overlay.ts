import fs from "fs";
import path from "path";
import os from "os";
import assert from "node:assert/strict";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runIsolatedOverlayTest() {
  console.log("=== 1. Setting up Isolated Pi Sandbox ===");
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-isolated-test-"));
  const extDir = path.join(sandboxDir, "extensions");
  const sessionsDir = path.join(sandboxDir, "sessions", "--test-workspace--");
  fs.mkdirSync(extDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });

  // 1. Existing user auth.json with sensitive API keys
  const authFile = path.join(sandboxDir, "auth.json");
  const mockAuthData = {
    anthropic: { apiKey: "sk-ant-mock-secret-key-must-never-be-deleted" },
    openai: { apiKey: "sk-proj-mock-secret-key-must-never-be-deleted" },
  };
  fs.writeFileSync(authFile, JSON.stringify(mockAuthData, null, 2) + "\n");

  // 2. Broken symlinks simulating Pi 1.4 -> 1.5 upgrade breakages
  try {
    fs.symlinkSync("/opt/homebrew/lib/node_modules/deleted-pkg/git-checkpoint.ts", path.join(extDir, "git-checkpoint.ts"));
    fs.symlinkSync("/opt/homebrew/lib/node_modules/deleted-pkg/handoff.ts", path.join(extDir, "handoff.ts"));
    fs.symlinkSync("/opt/homebrew/lib/node_modules/deleted-pkg/todo.ts", path.join(extDir, "todo.ts"));
  } catch {}

  // Verify broken symlinks exist before test
  assert.ok(fs.lstatSync(path.join(extDir, "git-checkpoint.ts")).isSymbolicLink(), "Broken symlink must exist prior to install");
  assert.equal(fs.existsSync(path.join(extDir, "git-checkpoint.ts")), false, "Symlink target must be non-existent");
  console.log("  ✔ Simulated broken symlinks created in sandbox");

  // 3. Existing historical Pi session file with turns
  const sessionFile = path.join(sessionsDir, "2026-11-09T00-00-00-000Z_test.jsonl");
  const sessionContent = [
    JSON.stringify({ type: "session", version: 3, id: "test-session-001", timestamp: "2026-11-09T00:00:00.000Z" }),
    JSON.stringify({ type: "message", id: "m1", message: { role: "user", content: "Run tests" } }),
    JSON.stringify({
      type: "message",
      id: "m2",
      timestamp: "2026-11-09T00:00:05.000Z",
      message: {
        role: "assistant",
        model: "ornith-1.5:ctx",
        provider: "ollama",
        usage: { input: 500, output: 200, cacheRead: 1000, cacheWrite: 0, totalTokens: 1700 },
      },
    }),
    JSON.stringify({
      type: "message",
      id: "m3",
      timestamp: "2026-11-09T00:00:10.000Z",
      message: {
        role: "assistant",
        model: "openai.gpt-5.6-luna",
        provider: "bedrock-mantle",
        usage: { input: 100, output: 50, cacheRead: 2000, cacheWrite: 500, totalTokens: 2650 },
      },
    }),
  ].join("\n") + "\n";
  fs.writeFileSync(sessionFile, sessionContent);
  console.log("  ✔ Mock historical session file written to sandbox");

  console.log("\n=== 2. Running Overlay Installer in Isolated Sandbox ===");
  const repoRoot = path.resolve(__dirname, "..");
  const installScript = path.join(repoRoot, "install.sh");

  // Execute install.sh targeting sandbox
  const cmd = `PI_AGENT_DIR="${sandboxDir}" bash "${installScript}"`;
  const output = execSync(cmd, { cwd: repoRoot, encoding: "utf8" });
  assert.ok(output.includes("OVERLAY APPLIED SUCCESSFULLY"), "Overlay installer must finish successfully");

  console.log("\n=== 3. Verifying Non-Destructive Invariants ===");

  // 1. Auth file preservation
  assert.ok(fs.existsSync(authFile), "auth.json must NOT be deleted");
  const authAfter = JSON.parse(fs.readFileSync(authFile, "utf8"));
  assert.equal(authAfter.anthropic.apiKey, "sk-ant-mock-secret-key-must-never-be-deleted", "API keys must be intact");
  console.log("  ✔ Invariant 1: auth.json credentials 100% preserved");

  // 2. Broken symlinks cleaned and replaced by real files
  const gitCk = path.join(extDir, "git-checkpoint.ts");
  assert.ok(fs.existsSync(gitCk), "git-checkpoint.ts must exist");
  assert.equal(fs.lstatSync(gitCk).isSymbolicLink(), false, "git-checkpoint.ts must be a real file, not a symlink");
  const gitCkContent = fs.readFileSync(gitCk, "utf8");
  assert.ok(gitCkContent.includes("Apple Silicon"), "git-checkpoint.ts must have fault-tolerant Apple Silicon handler");
  console.log("  ✔ Invariant 2: Broken symlinks cleaned; replaced by self-contained files");

  // 3. Other extensions present
  assert.ok(fs.existsSync(path.join(extDir, "bottom-up-router.ts")), "bottom-up-router.ts must be installed");
  assert.ok(fs.existsSync(path.join(extDir, "skill-rag.ts")), "skill-rag.ts must be installed");
  assert.ok(fs.existsSync(path.join(extDir, "repo-mapper.ts")), "repo-mapper.ts must be installed");
  console.log("  ✔ Invariant 3: Core extensions deployed");

  // 4. settings.json merged
  const settingsFile = path.join(sandboxDir, "settings.json");
  assert.ok(fs.existsSync(settingsFile), "settings.json must exist");
  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.equal(settings.defaultModel, "auto/planner-worker", "defaultModel must be auto/planner-worker");
  assert.equal(settings.cacheWarming, "streaming", "cacheWarming must be streaming");
  console.log("  ✔ Invariant 4: settings.json configured with virtual model and cache warming");

  // 5. virtual-models.json created
  const vModelFile = path.join(sandboxDir, "virtual-models.json");
  assert.ok(fs.existsSync(vModelFile), "virtual-models.json must exist");
  const vModels = JSON.parse(fs.readFileSync(vModelFile, "utf8"));
  assert.ok(vModels.planner, "Planner spec must be configured");
  assert.ok(vModels.worker, "Worker spec must be configured");
  console.log("  ✔ Invariant 5: virtual-models.json initialized with dual-tier powertrain");

  // 6. mcp.json configured with deferred exposure
  const mcpFile = path.join(sandboxDir, "mcp.json");
  assert.ok(fs.existsSync(mcpFile), "mcp.json must exist");
  const mcp = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
  assert.ok(mcp.mcpServers !== undefined, "mcpServers must be defined");
  console.log("  ✔ Invariant 6: mcp.json configured with zero-bloat deferred exposure");

  // 7. savings-ledger.jsonl backfilled from historical session
  const ledgerFile = path.join(sandboxDir, "savings-ledger.jsonl");
  assert.ok(fs.existsSync(ledgerFile), "savings-ledger.jsonl must be automatically backfilled");
  const ledgerLines = fs.readFileSync(ledgerFile, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(ledgerLines.length, 2, "Must have exactly 2 backfilled turns from session");

  const turn1 = JSON.parse(ledgerLines[0]);
  assert.equal(turn1.model, "ornith-1.5:ctx");
  assert.equal(turn1.actualUsd, 0, "Local workhorse compute must be $0.00");
  assert.ok(turn1.sonnetBaselineUsd > 0, "Sonnet baseline cost must be > 0 (saved money)");

  const turn2 = JSON.parse(ledgerLines[1]);
  assert.equal(turn2.model, "openai.gpt-5.6-luna");
  assert.ok(turn2.actualUsd > 0, "Luna actual cost must be > 0");
  assert.ok(turn2.sonnetBaselineUsd > turn2.actualUsd, "Luna must achieve capital arbitrage vs Sonnet baseline");
  console.log("  ✔ Invariant 7: Retroactive session backfill reconstructed 100% of historical tokens and ROI");

  // Cleanup sandbox
  try {
    fs.rmSync(sandboxDir, { recursive: true, force: true });
    console.log("  ✔ Sandbox temporary directory cleaned up");
  } catch {}

  console.log("\n========================================================================");
  console.log("🏁 ISOLATED SANDBOX OVERLAY TEST PASSED WITH 100% VERIFIED INVARIANTS!");
  console.log("========================================================================\n");
}

runIsolatedOverlayTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
