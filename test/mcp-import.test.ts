import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { importMcpServers } from "../src/cli/commands/mcp.js";

test("importMcpServers: imports mcp servers from custom source config into target", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kobayashi-mcp-test-"));
  const sourcePath = path.join(tmpDir, "source_mcp.json");

  fs.writeFileSync(
    sourcePath,
    JSON.stringify({
      mcpServers: {
        "jira-mcp": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-jira"],
          env: { JIRA_URL: "https://example.atlassian.net" },
        },
      },
    })
  );

  const origHome = process.env.HOME;
  process.env.HOME = tmpDir;

  try {
    const result = importMcpServers(sourcePath);
    assert.equal(result.count, 1);
    assert.ok(result.servers.includes("jira-mcp"));

    const targetPath = path.join(tmpDir, ".pi", "agent", "mcp.json");
    assert.ok(fs.existsSync(targetPath));

    const written = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
    assert.ok(written.mcpServers["jira-mcp"]);
    assert.equal(written.mcpServers["jira-mcp"].command, "npx");
  } finally {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
