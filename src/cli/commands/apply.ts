import ora from "ora";
import chalk from "chalk";
import { execSync } from "child_process";
import { logger } from "../../utils/logger.js";
import { loadConfig } from "../../config/parser.js";
import { compileConfig, writePiConfigs } from "../../config/compiler.js";

export async function applyCommand(options: { config?: string }): Promise<void> {
  const spinner = ora("Loading and validating harness.yaml...").start();

  try {
    const config = loadConfig(options.config);
    spinner.succeed(`Loaded configuration: ${chalk.bold(config.name)}`);

    const compileSpinner = ora("Compiling Pi agent configuration files...").start();
    const compiled = compileConfig(config);
    writePiConfigs(compiled);
    compileSpinner.succeed(
      `Synchronized runtime configs to ${chalk.dim(compiled.targetDir)}`
    );

    // List compiled files
    console.log(chalk.dim("  ├── models.json   (Ollama & Local models)"));
    console.log(chalk.dim("  ├── settings.json (Tools, enabled models, compaction)"));
    console.log(chalk.dim("  └── sol-pi.json   (NVIDIA SoL-Pi action-fusion & obs-pack)"));

    logger.success("Kobayashi configuration successfully applied to Pi runtime!");
  } catch (err: any) {
    spinner.fail(`Failed to apply configuration: ${err.message}`);
    process.exit(1);
  }
}
