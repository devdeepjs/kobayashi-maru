import ora from "ora";
import chalk from "chalk";
import { logger } from "../../utils/logger.js";
import {
  checkOllama,
  checkNode,
  checkPiInstalled,
  checkAwsCredentials,
} from "../../utils/system.js";
import { loadConfig } from "../../config/parser.js";

export async function doctorCommand(): Promise<void> {
  logger.banner();
  console.log(chalk.bold("  Diagnostic Health Check (Pre-flight Inspection)\n"));

  const spinner = ora("Checking environment prerequisites...").start();

  // 1. Node.js Check
  const nodeRes = checkNode();
  if (nodeRes.ok) {
    spinner.succeed(nodeRes.message);
  } else {
    spinner.fail(nodeRes.message);
  }

  // 2. Pi Coding Agent Check
  const piRes = checkPiInstalled();
  if (piRes.ok) {
    spinner.succeed(piRes.message);
  } else {
    spinner.fail(piRes.message);
  }

  // 3. Ollama & Local Models Check
  const ollamaSpinner = ora("Testing Ollama API connection...").start();
  const ollamaRes = await checkOllama();
  if (ollamaRes.ok) {
    ollamaSpinner.succeed(ollamaRes.message);
    const models = ollamaRes.details?.models || [];
    if (models.includes("ornith-1.5:ctx")) {
      logger.success("Target local workhorse found: ornith-1.5:ctx");
    } else {
      logger.warn(
        "Model 'ornith-1.5:ctx' not found in Ollama. Pull with: ollama pull robit/ornith-1.5:9b"
      );
    }
  } else {
    ollamaSpinner.fail(ollamaRes.message);
  }

  // 4. AWS Credentials Check
  const awsSpinner = ora("Checking AWS Bedrock credentials...").start();
  const awsRes = checkAwsCredentials();
  if (awsRes.ok) {
    awsSpinner.succeed(awsRes.message);
  } else {
    awsSpinner.warn(awsRes.message);
  }

  // 5. Config Validation Check
  const configSpinner = ora("Validating harness.yaml...").start();
  try {
    const config = loadConfig();
    configSpinner.succeed(
      `harness.yaml loaded cleanly (${config.name} v${config.version})`
    );
    console.log(
      chalk.dim(`\n  Starting Tier:    ${config.starting_tier.toUpperCase()}`)
    );
    if (config.tiers.advisor) {
      console.log(
        chalk.dim(`  Advisor:          ${config.tiers.advisor.provider}/${config.tiers.advisor.model}`)
      );
    }
    if (config.tiers.orchestrator) {
      console.log(
        chalk.dim(`  Orchestrator:     ${config.tiers.orchestrator.provider}/${config.tiers.orchestrator.model}`)
      );
    }
    console.log(
      chalk.dim(`  Workhorse:        ${config.tiers.workhorse.provider}/${config.tiers.workhorse.model}`)
    );
  } catch (err: any) {
    configSpinner.fail(`harness.yaml validation error: ${err.message}`);
  }

  console.log(chalk.bold("\nDiagnostic complete.\n"));
}
