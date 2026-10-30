import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { spawn, exec } from "child_process";
import { logger } from "../../utils/logger.js";

const PI_DIR = path.join(os.homedir(), ".pi", "agent");
const LEDGER_PATH = path.join(PI_DIR, "savings-ledger.jsonl");
const EXEC_DASH_SCRIPT = path.join(PI_DIR, "exec-dashboard.mjs");

interface LedgerEntry {
  ts: string;
  event: string;
  model: string;
  provider?: string;
  exact?: boolean;
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estContextTokens?: number;
  avoidedContextTokens?: number;
  actualUsd: number;
  sonnetBaselineUsd: number;
}

export async function statsCommand(options: { web?: boolean; json?: boolean }): Promise<void> {
  if (options.web) {
    if (fs.existsSync(EXEC_DASH_SCRIPT)) {
      console.log(chalk.cyan("Launching Executive & Telemetry Web Dashboard..."));
      const child = spawn(process.execPath, [EXEC_DASH_SCRIPT], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      exec('open "http://127.0.0.1:4200"');
      console.log(chalk.green("✔ Dashboard opened at http://127.0.0.1:4200"));
      return;
    } else {
      console.log(chalk.yellow(`Web dashboard script not found at ${EXEC_DASH_SCRIPT}`));
    }
  }

  if (!fs.existsSync(LEDGER_PATH)) {
    console.log(chalk.yellow("No telemetry ledger found. Run a few tasks with `kobayashi start` first!"));
    return;
  }

  const lines = fs
    .readFileSync(LEDGER_PATH, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  let totalActualUsd = 0;
  let totalBaselineUsd = 0;
  let totalInputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;

  const tierStats: Record<
    string,
    { turns: number; tokens: number; actualUsd: number; baselineUsd: number }
  > = {
    advisor: { turns: 0, tokens: 0, actualUsd: 0, baselineUsd: 0 },
    orchestrator: { turns: 0, tokens: 0, actualUsd: 0, baselineUsd: 0 },
    workhorse: { turns: 0, tokens: 0, actualUsd: 0, baselineUsd: 0 },
    other: { turns: 0, tokens: 0, actualUsd: 0, baselineUsd: 0 },
  };

  for (const line of lines) {
    try {
      const entry: LedgerEntry = JSON.parse(line);
      totalActualUsd += entry.actualUsd || 0;
      totalBaselineUsd += entry.sonnetBaselineUsd || 0;

      const input = entry.inputTokens || 0;
      const read = entry.cacheReadTokens || 0;
      const write = entry.cacheWriteTokens || 0;
      const out = entry.outputTokens || 0;
      const tok = entry.totalTokens || input + read + write + out;

      totalInputTokens += input;
      totalCacheReadTokens += read;
      totalCacheWriteTokens += write;
      totalOutputTokens += out;
      totalTokens += tok;

      const ev = (entry.event || "").toLowerCase();
      let tierKey = "other";
      if (ev.includes("advisor") || ev.includes("sonnet")) {
        tierKey = "advisor";
      } else if (ev.includes("orchestrator") || ev.includes("luna")) {
        tierKey = "orchestrator";
      } else if (ev.includes("workhorse") || ev.includes("ornith")) {
        tierKey = "workhorse";
      }

      tierStats[tierKey].turns++;
      tierStats[tierKey].tokens += tok;
      tierStats[tierKey].actualUsd += entry.actualUsd || 0;
      tierStats[tierKey].baselineUsd += entry.sonnetBaselineUsd || 0;
    } catch {}
  }

  const netSavingsUsd = Math.max(0, totalBaselineUsd - totalActualUsd);
  const savingsPct =
    totalBaselineUsd > 0 ? ((netSavingsUsd / totalBaselineUsd) * 100).toFixed(1) : "0.0";
  const cacheHitRate =
    totalInputTokens + totalCacheReadTokens > 0
      ? ((totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)) * 100).toFixed(1)
      : "0.0";

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          totalTurns: lines.length,
          tokens: {
            input: totalInputTokens,
            cacheRead: totalCacheReadTokens,
            cacheWrite: totalCacheWriteTokens,
            output: totalOutputTokens,
            total: totalTokens,
          },
          cacheHitRatePct: parseFloat(cacheHitRate),
          costs: {
            actualUsd: totalActualUsd,
            baselineUsd: totalBaselineUsd,
            savedUsd: netSavingsUsd,
            savingsPct: parseFloat(savingsPct),
          },
          tiers: tierStats,
        },
        null,
        2
      )
    );
    return;
  }

  logger.banner();
  console.log(chalk.bold.cyan("================================================================================"));
  console.log(chalk.bold.white("             KOBAYASHI HARNESS TELEMETRY & TOKEN SAVINGS AUDIT                  "));
  console.log(chalk.bold.cyan("================================================================================\n"));

  console.log(
    chalk.bold("  Total Turns Tracked : ") +
      chalk.white(`${lines.length} turns`) +
      chalk.gray(` across active sessions`)
  );
  console.log(
    chalk.bold("  Total Tokens Processed: ") +
      chalk.white(totalTokens.toLocaleString()) +
      chalk.gray(` tokens`)
  );
  console.log(
    chalk.bold("  Cache Read Tokens     : ") +
      chalk.cyan(totalCacheReadTokens.toLocaleString()) +
      chalk.gray(` (${cacheHitRate}% cache hit rate)`)
  );
  console.log(
    chalk.bold("  Output Tokens         : ") +
      chalk.white(totalOutputTokens.toLocaleString())
  );

  console.log(chalk.bold.yellow("\n  ---------------- FINANCIAL EFFICIENCY (ROI) ----------------"));
  console.log(
    chalk.bold("  Kobayashi Actual Cost : ") +
      chalk.green(`$${totalActualUsd.toFixed(4)}`)
  );
  console.log(
    chalk.bold("  Claude Code Baseline  : ") +
      chalk.red(`$${totalBaselineUsd.toFixed(4)}`) +
      chalk.gray(" (100% Claude Sonnet 3.5/3.7 direct pricing)")
  );
  console.log(
    chalk.bold("  Net Capital Saved     : ") +
      chalk.bold.green(`$${netSavingsUsd.toFixed(4)}`) +
      chalk.bold.magenta(` (${savingsPct}% Cost Reduction)`)
  );

  console.log(chalk.bold.cyan("\n  ---------------- TIER CONSUMPTION BREAKDOWN ----------------"));
  console.log(
    chalk.gray(
      "  Tier                | Turns | Total Tokens | Actual ($)  | Baseline ($) | Saved ($)"
    )
  );
  console.log(
    chalk.gray(
      "  --------------------+-------+--------------+-------------+--------------+----------"
    )
  );

  const displayTier = (name: string, key: string) => {
    const s = tierStats[key];
    const saved = Math.max(0, s.baselineUsd - s.actualUsd);
    console.log(
      `  ${name.padEnd(20)}| ${String(s.turns).padStart(5)} | ${s.tokens
        .toLocaleString()
        .padStart(12)} | ${(`$` + s.actualUsd.toFixed(4)).padStart(11)} | ${(`$` + s.baselineUsd.toFixed(4)).padStart(12)} | ${chalk.green((`$` + saved.toFixed(4)).padStart(8))}`
    );
  };

  displayTier("Frontier Advisor", "advisor");
  displayTier("Cached Orchestrator", "orchestrator");
  displayTier("Local Workhorse", "workhorse");

  console.log(chalk.bold.cyan("================================================================================\n"));
  console.log(
    chalk.gray("Tip: Run ") +
      chalk.bold.white("kobayashi stats --web") +
      chalk.gray(" to open the live browser dashboard with charts and logs.\n")
  );
}
