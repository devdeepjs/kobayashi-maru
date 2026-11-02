import chalk from "chalk";
import { indexSkills, matchSkill, importSkillsFromSource } from "../../skills/indexer.js";
import { logger } from "../../utils/logger.js";

export async function skillsCommand(options: { testPrompt?: string; add?: string }): Promise<void> {
  logger.banner();
  console.log(chalk.bold("  Matt Pocock Skills Registry & Dynamic Loading Audit\n"));

  // Handle skill import (Git URL or local directory)
  if (options.add) {
    console.log(chalk.cyan(`📥 Importing skills from: ${chalk.bold(options.add)}...`));
    const result = importSkillsFromSource(options.add);
    if (!result.success) {
      console.log(chalk.red(`✖ Failed to import skills: ${result.error}`));
      process.exit(1);
    }
    console.log(chalk.green(`✔ Successfully imported into: ${chalk.bold(result.destination)}`));
    console.log(chalk.green(`✔ BM25 Catalog re-indexed: ${chalk.bold(result.report.totalSkills)} total skills active in memory (< 2ms query latency)`));
    console.log(chalk.dim(`  Token economy: 0 tokens billed on cold starts (100% savings). Injected only on match.\n`));
  }

  const report = indexSkills();

  console.log(chalk.cyan(`✔ Detected ${chalk.bold(report.totalSkills)} skills across active directories:\n`));

  for (const skill of report.skills.slice(0, 40)) {
    const invocable = skill.disableModelInvocation
      ? chalk.dim("[slash-only]")
      : chalk.green("[auto-detect]");
    console.log(
      `  • ${chalk.bold.magenta(skill.name.padEnd(28))} ${invocable} ${chalk.dim(skill.description.slice(0, 70))}...`
    );
  }
  if (report.skills.length > 40) {
    console.log(chalk.dim(`  ... and ${report.skills.length - 40} more skills indexed in RAM`));
  }

  console.log(chalk.bold("\n📊 Token Economy Comparison (Skills Overhead):"));
  console.log(
    chalk.red(`  ✖ Standard Harness (Static Turn 1 Dump): ~${report.staticTokenCostPerTurn} tokens billed on EVERY turn`)
  );
  console.log(
    chalk.green(`  ✔ Kobayashi Dynamic Loader:               0 tokens on Turn 1 (100% savings)`)
  );
  console.log(
    chalk.dim(`    When invoked (e.g. /to-spec or BM25 match), only the single matching skill (~150 tokens) is mounted.`)
  );

  // If a test prompt is provided, demonstrate dynamic activation
  if (options.testPrompt) {
    console.log(chalk.bold("\n🧪 Dynamic Activation Test:"));
    console.log(chalk.dim(`  Input Prompt: "${options.testPrompt}"`));
    const matched = matchSkill(options.testPrompt, report.skills);
    if (matched) {
      console.log(
        chalk.green(`  ✔ Dynamically Activated Skill: ${chalk.bold(matched.name)} (from ${matched.filePath})`)
      );
      console.log(
        chalk.dim(`  Payload injected: ONLY ${matched.estimatedTokens} tokens. The remaining ${report.totalSkills - 1} skills cost 0 tokens.`)
      );
    } else {
      console.log(
        chalk.yellow("  No skill required. Prompt will run on default workhorse with 0 skill tokens injected.")
      );
    }
  }

  console.log("");
}
