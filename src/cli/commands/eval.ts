import chalk from "chalk";
import { logger } from "../../utils/logger.js";
import { generateEvaluationReport } from "../../../eval/scripts/generate-report.js";

export async function evalCommand(options: { report?: boolean; dataset?: string }): Promise<void> {
  logger.banner();
  console.log(chalk.cyan("Executing Kobayashi token efficiency benchmark suite...\n"));

  try {
    const result = generateEvaluationReport({ printTerminal: true });
    console.log(chalk.green("✔ Evaluation completed successfully."));
  } catch (err: any) {
    logger.error(`Evaluation failed: ${err.message}`);
  }
}
