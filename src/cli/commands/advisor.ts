import chalk from "chalk";
import ora from "ora";
import { askAdvisor } from "../../extensions/advisor/client.js";
import { logger } from "../../utils/logger.js";

export async function advisorCommand(
  question: string,
  options: { summary?: string; snippet?: string }
): Promise<void> {
  logger.banner();
  console.log(chalk.bold("  Frontier Advisor Stateless Consultation (Bedrock Sonnet)\n"));

  const summary = options.summary || "General architectural consultation via Kobayashi CLI";
  const spinner = ora("Transmitting 500-token stateless payload to Claude Sonnet 4.5 on Bedrock...").start();

  try {
    const res = await askAdvisor({
      summary,
      question,
      codeSnippet: options.snippet,
    });

    spinner.succeed(
      `Advisor response received (${res.latencyMs}ms) • Tokens: ${res.inputTokens}in/${res.outputTokens}out • Cost: ${chalk.green(`$${res.costUsd.toFixed(4)}`)}`
    );

    console.log(chalk.bold.cyan("\n--- ARCHITECTURAL GUIDANCE ---"));
    console.log(res.advice);
    console.log(chalk.bold.cyan("--------------------------------\n"));
  } catch (err: any) {
    spinner.fail(`Failed to consult Advisor: ${err.message}`);
    console.log(chalk.yellow("\nEnsure AWS credentials in ~/.aws/credentials have bedrock:InvokeModel permission."));
  }
}
