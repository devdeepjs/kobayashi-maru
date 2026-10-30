import { spawn } from "child_process";
import chalk from "chalk";
import { logger } from "../../utils/logger.js";
import { loadConfig } from "../../config/parser.js";
import { applyCommand } from "./apply.js";

export async function startCommand(options: {
  config?: string;
  model?: string;
  provider?: string;
  prompt?: string;
}): Promise<void> {
  logger.banner();

  // 1. Synchronize configs first
  console.log(chalk.bold("Synchronizing Kobayashi runtime configuration..."));
  await applyCommand({ config: options.config });

  const config = loadConfig(options.config);

  // 2. Prepare Pi arguments
  const args: string[] = [];

  if (config.security.firewall === "pi-jev-auto-mode") {
    args.push("--jev-auto-mode");
  }

  if (options.provider) {
    args.push("--provider", options.provider);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.prompt) {
    args.push("-p", options.prompt);
  }

  if (options.prompt) {
    console.log(
      chalk.cyan(`\n⚡ Executing one-off prompt via Kobayashi runtime...\n`)
    );
  } else {
    console.log(
      chalk.cyan("\n🚀 Launching interactive Pi session with Kobayashi optimizations...\n")
    );
  }

  // 3. Spawn Pi and attach directly to terminal stdio
  const piProcess = spawn("pi", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      AWS_PROFILE: process.env.AWS_PROFILE || "default",
      AWS_REGION: process.env.AWS_REGION || "us-east-1",
    },
  });

  piProcess.on("error", (err) => {
    logger.error(`Failed to launch Pi: ${err.message}`);
    console.log(chalk.yellow("Ensure Pi is installed: npm install -g @earendil-works/pi-coding-agent"));
  });

  piProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.log(chalk.yellow(`\nPi process exited with code ${code}`));
    }
  });
}
