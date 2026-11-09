import chalk from "chalk";
import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger.js";

export interface McpImportOptions {
  importSource?: string;
  exposure?: "deferred" | "direct" | "model-only";
  action?: "list" | "add" | "remove" | "import";
  name?: string;
  command?: string;
  args?: string[];
}

export function getMcpConfigPath(): string {
  const home = process.env.HOME || "";
  return path.join(home, ".pi", "agent", "mcp.json");
}

export function loadMcpConfig(): { mcpServers: Record<string, any> } {
  const targetPath = getMcpConfigPath();
  if (fs.existsSync(targetPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      if (!data.mcpServers || typeof data.mcpServers !== "object") data.mcpServers = {};
      return data;
    } catch {}
  }
  return { mcpServers: {} };
}

export function saveMcpConfig(data: { mcpServers: Record<string, any> }): void {
  const targetPath = getMcpConfigPath();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + "\n");
}

export function addMcpServer(
  name: string,
  command: string,
  args: string[] = [],
  options: { exposure?: "deferred" | "direct" | "model-only"; env?: Record<string, string> } = {}
): void {
  const data = loadMcpConfig();
  data.mcpServers[name] = {
    command,
    args,
    exposure: options.exposure || "deferred",
    ...(options.env && Object.keys(options.env).length > 0 ? { env: options.env } : {}),
  };
  saveMcpConfig(data);
}

export function removeMcpServer(name: string): boolean {
  const data = loadMcpConfig();
  if (data.mcpServers && data.mcpServers[name]) {
    delete data.mcpServers[name];
    saveMcpConfig(data);
    return true;
  }
  return false;
}

export function importMcpServers(
  sourcePath?: string,
  exposure: "deferred" | "direct" | "model-only" = "deferred"
): { count: number; servers: string[]; destination: string } {
  const home = process.env.HOME || "";
  const targetPath = getMcpConfigPath();

  // Candidate sources if not specified
  const candidates: string[] = [];
  if (sourcePath) {
    candidates.push(path.resolve(process.cwd(), sourcePath));
  } else {
    // Claude Desktop (macOS)
    candidates.push(path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"));
    // Cursor (macOS/Linux)
    candidates.push(path.join(home, ".cursor", "mcp.json"));
    // Claude Desktop (Linux)
    candidates.push(path.join(home, ".config", "Claude", "claude_desktop_config.json"));
  }

  const existingTarget = loadMcpConfig();
  const importedServers: string[] = [];

  for (const src of candidates) {
    if (fs.existsSync(src)) {
      try {
        const raw = fs.readFileSync(src, "utf-8");
        const data = JSON.parse(raw);
        const servers = data.mcpServers || {};
        for (const [name, config] of Object.entries(servers)) {
          const cfg = typeof config === "object" && config !== null ? { ...(config as any) } : {};
          // Default to deferred exposure to prevent cold-start prompt schema bloat
          if (!cfg.exposure) {
            cfg.exposure = exposure;
          }
          existingTarget.mcpServers[name] = cfg;
          importedServers.push(name);
        }
      } catch {}
    }
  }

  saveMcpConfig(existingTarget);

  return {
    count: importedServers.length,
    servers: importedServers,
    destination: targetPath,
  };
}

export async function mcpCommand(options: McpImportOptions): Promise<void> {
  logger.banner();

  if (options.action === "list") {
    console.log(chalk.bold("  Configured MCP Servers (~/.pi/agent/mcp.json)\n"));
    const data = loadMcpConfig();
    const names = Object.keys(data.mcpServers);
    if (names.length === 0) {
      console.log(chalk.yellow("  No MCP servers configured yet."));
      console.log(chalk.dim("  Import from Claude/Cursor: kobayashi mcp --import\n"));
      return;
    }
    for (const name of names) {
      const s = data.mcpServers[name];
      const cmdStr = s.command ? `${s.command} ${(s.args || []).join(" ")}` : s.url || "(custom)";
      const exp = s.exposure || "deferred";
      console.log(`  • ${chalk.bold.cyan(name)} [exposure: ${chalk.green(exp)}]`);
      console.log(`    ${chalk.dim(cmdStr)}`);
    }
    console.log("");
    return;
  }

  if (options.action === "remove" && options.name) {
    const removed = removeMcpServer(options.name);
    if (removed) {
      console.log(chalk.green(`✔ Removed MCP server '${options.name}' from ~/.pi/agent/mcp.json\n`));
    } else {
      console.log(chalk.yellow(`MCP server '${options.name}' not found.\n`));
    }
    return;
  }

  if (options.action === "add" && options.name && options.command) {
    addMcpServer(options.name, options.command, options.args || [], { exposure: options.exposure || "deferred" });
    console.log(chalk.green(`✔ Added MCP server '${options.name}' with deferred exposure (0 prompt bloat).\n`));
    return;
  }

  // Default: Import
  console.log(chalk.bold("  Zero-Bloat MCP Server Import & Configuration\n"));
  const res = importMcpServers(options.importSource, options.exposure || "deferred");
  if (res.count === 0) {
    console.log(chalk.yellow("  No MCP servers detected in Claude Desktop or Cursor configuration."));
    console.log(chalk.dim("  You can specify a custom config file: kobayashi mcp --import <path/to/mcp.json>\n"));
    return;
  }

  console.log(chalk.green(`✔ Imported ${chalk.bold(res.count)} MCP server(s) into: ${res.destination}`));
  for (const s of res.servers) {
    console.log(`  • ${chalk.cyan(s)} (Configured with deferred exposure to eliminate schema bloat)`);
  }
  console.log(chalk.dim("\n  Pi Agent can now connect to these MCP servers seamlessly.\n"));
}
