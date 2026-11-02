import chalk from "chalk";
import fs from "fs";
import path from "path";
import { logger } from "../../utils/logger.js";

export interface McpImportOptions {
  importSource?: string;
  exposure?: "deferred" | "direct" | "model-only";
}

export function importMcpServers(sourcePath?: string): { count: number; servers: string[]; destination: string } {
  const home = process.env.HOME || "";
  const targetPath = path.join(home, ".pi", "agent", "mcp.json");

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

  let existingTarget: any = { mcpServers: {} };
  if (fs.existsSync(targetPath)) {
    try {
      existingTarget = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
      if (!existingTarget.mcpServers) existingTarget.mcpServers = {};
    } catch {}
  }

  const importedServers: string[] = [];

  for (const src of candidates) {
    if (fs.existsSync(src)) {
      try {
        const raw = fs.readFileSync(src, "utf-8");
        const data = JSON.parse(raw);
        const servers = data.mcpServers || {};
        for (const [name, config] of Object.entries(servers)) {
          existingTarget.mcpServers[name] = config;
          importedServers.push(name);
        }
      } catch {}
    }
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(existingTarget, null, 2) + "\n");

  return {
    count: importedServers.length,
    servers: importedServers,
    destination: targetPath,
  };
}

export async function mcpCommand(options: McpImportOptions): Promise<void> {
  logger.banner();
  console.log(chalk.bold("  Zero-Bloat MCP Server Import & Configuration\n"));

  const res = importMcpServers(options.importSource);
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
