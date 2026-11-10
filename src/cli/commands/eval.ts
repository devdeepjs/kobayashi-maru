import chalk from "chalk";
import { logger } from "../../utils/logger.js";
import { runRealTimeEmpiricalBenchmark } from "../../../eval/scripts/run-empirical-benchmark.js";

export async function evalCommand(options: { report?: boolean; dataset?: string }): Promise<void> {
  logger.banner();
  console.log(chalk.cyan("Executing Kobayashi real-time empirical benchmark suite...\n"));

  try {
    const result = await runRealTimeEmpiricalBenchmark();
    console.log(chalk.green("✔ Real-time empirical benchmark completed successfully."));
  } catch (err: any) {
    logger.error(`Evaluation failed: ${err.message}`);
  }
}
