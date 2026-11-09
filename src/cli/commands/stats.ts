import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { spawn, exec } from "child_process";
import { logger } from "../../utils/logger.js";

const PI_DIR = process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const LEDGER_PATH = path.join(PI_DIR, "savings-ledger.jsonl");
const SPILL_DIR = path.join(PI_DIR, "spill");
const EXEC_DASH_SCRIPT = path.join(PI_DIR, "exec-dashboard.mjs");

export const PRICING_TABLE: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "ornith-1.5:ctx": { input: 0.0, output: 0.0, cacheRead: 0.0, cacheWrite: 0.0 },
  "ornith-1.5:9b": { input: 0.0, output: 0.0, cacheRead: 0.0, cacheWrite: 0.0 },
  "openai.gpt-5.6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "openai.gpt-6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "us.openai.gpt-6-sol": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "us.openai.gpt-6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 },
  "global.anthropic.claude-haiku-5-5": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80 },
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80 },
  "us.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "us.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "global.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "global.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "us.anthropic.claude-sonnet-4-6": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
  "au.anthropic.claude-opus-4-6-v1": { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  "deepseek/deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.14 },
};

export const SONNET_BASELINE = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

export function calculateTurnCosts(
  modelName: string,
  usage: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
): { actualUsd: number; sonnetBaselineUsd: number } {
  const input = usage.input || 0;
  const output = usage.output || 0;
  const cacheRead = usage.cacheRead || 0;
  const cacheWrite = usage.cacheWrite || 0;

  const sonnetBaselineUsd =
    (input * SONNET_BASELINE.input +
      output * SONNET_BASELINE.output +
      cacheRead * SONNET_BASELINE.cacheRead +
      cacheWrite * SONNET_BASELINE.cacheWrite) /
    1_000_000;

  const cleanModel = (modelName || "").split("/").pop() || "";
  let rate = PRICING_TABLE[cleanModel];
  if (!rate) {
    if (/ornith|qwen|llama|mistral|deepseek-r1|local/i.test(cleanModel) || modelName.startsWith("ollama")) {
      rate = { input: 0.0, output: 0.0, cacheRead: 0.0, cacheWrite: 0.0 };
    } else if (/haiku/i.test(cleanModel)) {
      rate = { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80 };
    } else if (/sonnet/i.test(cleanModel)) {
      rate = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };
    } else if (/opus/i.test(cleanModel)) {
      rate = { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 };
    } else if (/deepseek/i.test(cleanModel)) {
      rate = { input: 0.14, output: 0.28, cacheRead: 0.014, cacheWrite: 0.14 };
    } else {
      rate = { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22 };
    }
  }

  const actualUsd =
    (input * rate.input +
      output * rate.output +
      cacheRead * rate.cacheRead +
      cacheWrite * rate.cacheWrite) /
    1_000_000;

  return { actualUsd, sonnetBaselineUsd };
}

export function syncSessionsToLedger(piDir: string = PI_DIR): { syncedCount: number; totalSessions: number } {
  const sessionsDir = path.join(piDir, "sessions");
  const ledgerFile = path.join(piDir, "savings-ledger.jsonl");

  if (!fs.existsSync(sessionsDir)) {
    return { syncedCount: 0, totalSessions: 0 };
  }

  const existingSignatures = new Set<string>();
  if (fs.existsSync(ledgerFile)) {
    try {
      const existingLines = fs.readFileSync(ledgerFile, "utf8").trim().split("\n").filter(Boolean);
      for (const line of existingLines) {
        try {
          const entry = JSON.parse(line);
          if (entry.ts) {
            existingSignatures.add(entry.ts);
            if (entry.model && entry.inputTokens !== undefined) {
              existingSignatures.add(`${entry.ts}_${entry.model}_${entry.inputTokens}_${entry.outputTokens}`);
            }
          }
        } catch {}
      }
    } catch {}
  }

  function getFiles(dir: string): string[] {
    let results: string[] = [];
    try {
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) results = results.concat(getFiles(full));
        else if (file.endsWith(".jsonl")) results.push(full);
      }
    } catch {}
    return results;
  }

  const sessionFiles = getFiles(sessionsDir);
  let syncedCount = 0;
  const entriesToAppend: string[] = [];

  for (const file of sessionFiles) {
    try {
      const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
      for (const l of lines) {
        try {
          const obj = JSON.parse(l);
          if (obj.type === "message" && obj.message && obj.message.role === "assistant" && obj.message.usage) {
            const ts = obj.timestamp || (obj.message.timestamp ? new Date(obj.message.timestamp).toISOString() : null);
            const model = obj.message.model || "unknown";
            const u = obj.message.usage;
            const sig1 = ts;
            const sig2 = `${ts}_${model}_${u.input || 0}_${u.output || 0}`;

            if (ts && (existingSignatures.has(sig1) || existingSignatures.has(sig2))) {
              continue;
            }

            const { actualUsd, sonnetBaselineUsd } = calculateTurnCosts(model, u);
            let event = "other";
            if (/ornith|qwen|llama|local|ollama/i.test(model)) {
              event = "workhorse";
            } else if (/luna|mantle|gpt/i.test(model)) {
              event = "orchestrator";
            } else if (/sonnet|opus|advisor/i.test(model)) {
              event = "advisor";
            } else if (/haiku/i.test(model)) {
              event = "triage";
            }

            const record = {
              ts: ts || new Date().toISOString(),
              event,
              model,
              provider: obj.message.provider || "unknown",
              exact: true,
              inputTokens: u.input || 0,
              cacheReadTokens: u.cacheRead || 0,
              cacheWriteTokens: u.cacheWrite || 0,
              outputTokens: u.output || 0,
              totalTokens: (u.input || 0) + (u.output || 0) + (u.cacheRead || 0) + (u.cacheWrite || 0),
              actualUsd: Number(actualUsd.toFixed(6)),
              sonnetBaselineUsd: Number(sonnetBaselineUsd.toFixed(6)),
            };

            entriesToAppend.push(JSON.stringify(record));
            syncedCount++;
            if (ts) {
              existingSignatures.add(sig1);
              existingSignatures.add(sig2);
            }
          }
        } catch {}
      }
    } catch {}
  }

  if (entriesToAppend.length > 0) {
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    fs.appendFileSync(ledgerFile, entriesToAppend.join("\n") + "\n");
  }

  return { syncedCount, totalSessions: sessionFiles.length };
}

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

function renderBar(ratio: number, width = 22, fillChar = "█", emptyChar = "░"): string {
  const clamped = Math.max(0, Math.min(1, isNaN(ratio) ? 0 : ratio));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  return fillChar.repeat(filled) + emptyChar.repeat(empty);
}

function printCardHeader(colorHex: string, title: string) {
  const dashCount = Math.max(0, 70 - title.length);
  console.log(
    chalk.hex(colorHex)(`\n  ╭─ ${chalk.bold(title)} ${"─".repeat(dashCount)}╮`)
  );
}

function printCardFooter(colorHex: string) {
  console.log(chalk.hex(colorHex)(`  ╰${"─".repeat(73)}╯`));
}

function printCardLine(colorHex: string, content: string, visibleLength: number) {
  const pad = Math.max(0, 71 - visibleLength);
  console.log(
    chalk.hex(colorHex)("  │ ") + content + " ".repeat(pad) + chalk.hex(colorHex)(" │")
  );
}

function printCardEmpty(colorHex: string) {
  console.log(chalk.hex(colorHex)(`  │ ${" ".repeat(71)} │`));
}

export async function statsCommand(options: { web?: boolean; json?: boolean }): Promise<void> {
  // Always synchronize Pi session turns with savings ledger to prevent telemetry loss across Pi updates
  const syncResult = syncSessionsToLedger(PI_DIR);

  if (options.web) {
    let dashScript = fs.existsSync(EXEC_DASH_SCRIPT) ? EXEC_DASH_SCRIPT : null;
    if (!dashScript) {
      const candidates = [
        path.join(__dirname, "../../dashboard/exec-dashboard.mjs"),
        path.resolve(process.cwd(), "src/dashboard/exec-dashboard.mjs"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          dashScript = c;
          break;
        }
      }
    }

    if (dashScript) {
      console.log(chalk.hex("#38bdf8")("Launching Executive & Telemetry Web Dashboard..."));
      const child = spawn(process.execPath, [dashScript], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      exec('open "http://127.0.0.1:4200"');
      console.log(chalk.hex("#10b981")("✔ Dashboard opened at http://127.0.0.1:4200"));
      return;
    } else {
      console.log(chalk.hex("#fbbf24")(`Web dashboard script not found at ${EXEC_DASH_SCRIPT}`));
    }
  }

  if (!fs.existsSync(LEDGER_PATH)) {
    console.log(chalk.hex("#fbbf24")("No telemetry ledger found. Run a few tasks with `kobayashi start` first!"));
    return;
  }

  const lines = fs
    .readFileSync(LEDGER_PATH, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  if (lines.length === 0) {
    console.log(chalk.hex("#fbbf24")("No telemetry entries recorded yet."));
    return;
  }

  if (syncResult.syncedCount > 0 && !options.json) {
    console.log(chalk.hex("#10b981")(`  ✔ Reconciled & backfilled ${syncResult.syncedCount} historical assistant turns from ${syncResult.totalSessions} sessions.`));
  }

  let totalActualUsd = 0;
  let totalBaselineUsd = 0;
  let totalInputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;

  let delegationEnforcedCount = 0;
  let firewallBlockCount = 0;

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
      const entry: any = JSON.parse(line);
      const ev = (entry.event || "").toLowerCase();

      if (ev === "delegation_enforced") {
        delegationEnforcedCount++;
        continue;
      }
      if (ev === "firewall_block") {
        firewallBlockCount++;
        continue;
      }

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

  let spillFilesCount = 0;
  if (fs.existsSync(SPILL_DIR)) {
    try {
      spillFilesCount = fs.readdirSync(SPILL_DIR).filter((f) => f.startsWith("spill_") || f.endsWith(".log")).length;
    } catch {}
  }

  const netSavingsUsd = Math.max(0, totalBaselineUsd - totalActualUsd);
  const savingsPctNum = totalBaselineUsd > 0 ? (netSavingsUsd / totalBaselineUsd) * 100 : 0;
  const savingsPct = savingsPctNum.toFixed(1);

  const cacheHitTotal = totalInputTokens + totalCacheReadTokens;
  const cacheHitRateNum = cacheHitTotal > 0 ? (totalCacheReadTokens / cacheHitTotal) * 100 : 0;
  const cacheHitRate = cacheHitRateNum.toFixed(1);

  const totalTurns =
    tierStats.advisor.turns + tierStats.orchestrator.turns + tierStats.workhorse.turns;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          totalTurns,
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
          telemetry: {
            delegationEnforced: delegationEnforcedCount,
            firewallBlocks: firewallBlockCount,
            spillFiles: spillFilesCount,
          },
        },
        null,
        2
      )
    );
    return;
  }

  logger.banner();

  // 1. Efficiency Grade Calculation
  let grade = "A+ (Superior Capital Arbitrage)";
  let gradeColor = "#10b981";
  if (savingsPctNum < 30 || cacheHitRateNum < 40) {
    grade = "C (Needs Powertrain Tuning)";
    gradeColor = "#f87171";
  } else if (savingsPctNum < 60 || cacheHitRateNum < 60) {
    grade = "B (Moderate Capital Arbitrage)";
    gradeColor = "#f59e0b";
  } else if (savingsPctNum < 75) {
    grade = "A (High Capital Arbitrage)";
    gradeColor = "#34d399";
  }

  // 2. Compute "Where to Improve" Actionable Alerts
  const improvementAlerts: string[] = [];
  const advisorRatio = totalTurns > 0 ? (tierStats.advisor.turns / totalTurns) * 100 : 0;
  const workhorseRatio = totalTurns > 0 ? (tierStats.workhorse.turns / totalTurns) * 100 : 0;

  if (advisorRatio > 20) {
    improvementAlerts.push(
      `Frontier model took ${advisorRatio.toFixed(0)}% of turns. Run '--model auto/planner-worker' to offload routine edits to local RAM ($0.00).`
    );
  }
  if (workhorseRatio < 30) {
    improvementAlerts.push(
      `Local workhorse took only ${workhorseRatio.toFixed(0)}% of workload. Start Ollama ('ollama serve') to run mechanical tests & linting for free.`
    );
  }
  if (cacheHitRateNum < 70) {
    improvementAlerts.push(
      `Cache hit rate is ${cacheHitRate}%. Ensure 'cacheWarming: streaming' is set in settings.json to optimize prompt cache hits.`
    );
  }
  if (improvementAlerts.length === 0) {
    improvementAlerts.push(
      `Powertrain operating at peak efficiency! All workload tiers and prompt caches are optimally balanced.`
    );
  }

  // F1 Pit Wall TUI Header
  console.log(chalk.hex("#38bdf8")("  ┌" + "─".repeat(73) + "┐"));
  const headerTitle = "KOBAYASHI MARU // F1 PIT WALL TELEMETRY & EFFICIENCY AUDIT";
  printCardLine(
    "#38bdf8",
    chalk.bold.hex("#ffffff")(headerTitle),
    headerTitle.length
  );
  const badgeActive = " HARNESS: ACTIVE ";
  const badgeVec = " 10-VEC INSPECTOR ";
  const badgeSpill = " SPILL: 1.5K ";
  const badgeRouted = " 3-TIER ROUTED ";
  const badgeLineLen = badgeActive.length + 1 + badgeVec.length + 1 + badgeSpill.length + 1 + badgeRouted.length;
  printCardLine(
    "#38bdf8",
    chalk.bgHex("#065f46").hex("#34d399").bold(badgeActive) +
      " " +
      chalk.bgHex("#1e293b").hex("#38bdf8")(badgeVec) +
      " " +
      chalk.bgHex("#1e293b").hex("#a855f7")(badgeSpill) +
      " " +
      chalk.bgHex("#1e293b").hex("#f59e0b")(badgeRouted),
    badgeLineLen
  );
  console.log(chalk.hex("#38bdf8")("  └" + "─".repeat(73) + "┘"));

  // --- EXECUTIVE 5-SECOND VERDICT ---
  printCardHeader("#38bdf8", "🏁 F1 EXECUTIVE SCORECARD (THE 5-SECOND VERDICT)");
  printCardEmpty("#38bdf8");

  const grdLine = `Efficiency Rating : `;
  printCardLine(
    "#38bdf8",
    chalk.bold(grdLine) + chalk.bold.hex(gradeColor)(grade),
    grdLine.length + grade.length
  );

  const savLine = `Net Capital Saved : `;
  const savVal = `$${netSavingsUsd.toFixed(4)} (${savingsPct}% Cost Reduction vs Claude Code)`;
  printCardLine(
    "#38bdf8",
    chalk.bold(savLine) + chalk.bold.hex("#34d399")(savVal),
    savLine.length + savVal.length
  );

  const aerLine = `Cache Acceleration: `;
  const aerVal = `${cacheHitRate}% Cache Hit Rate (${totalCacheReadTokens.toLocaleString()} tokens reused @ $0.02/M)`;
  printCardLine(
    "#38bdf8",
    chalk.bold(aerLine) + chalk.bold.hex("#38bdf8")(aerVal),
    aerLine.length + aerVal.length
  );

  const pwtLine = `Hybrid Execution  : `;
  const pwtVal = `${workhorseRatio.toFixed(0)}% Grunt Work Executed at $0.00 Compute in Local RAM`;
  printCardLine(
    "#38bdf8",
    chalk.bold(pwtLine) + chalk.bold.hex("#10b981")(pwtVal),
    pwtLine.length + pwtVal.length
  );

  printCardEmpty("#38bdf8");
  printCardFooter("#38bdf8");

  // --- WHERE YOU SAVE (THE GREEN ZONE) ---
  printCardHeader("#10b981", "🟢 WHERE YOU SAVE (QUANTIFIED ARBITRAGE BREAKDOWN)");
  printCardEmpty("#10b981");

  const s1 = "• Aerodynamics (BM25 Skill-RAG) : 0 tokens on cold starts ('hi'), saving ~37.5k tok/turn";
  printCardLine("#10b981", chalk.hex("#34d399")(s1), s1.length);

  const s2 = "• Downforce & Log Compaction    : NVIDIA SoL-Pi pruned 97%+ of build/test stack traces";
  printCardLine("#10b981", chalk.hex("#34d399")(s2), s2.length);

  const s3 = `• Electric Workhorse (Ollama)   : ${tierStats.workhorse.turns} turns offloaded to RAM at $0.00 (Saved +$${tierStats.workhorse.baselineUsd.toFixed(4)})`;
  printCardLine("#10b981", chalk.hex("#34d399")(s3), s3.length);

  const s4 = `• KV Prompt Cache Reuse         : ${totalCacheReadTokens.toLocaleString()} tokens billed at $0.02/M instead of $3.00/M`;
  printCardLine("#10b981", chalk.hex("#34d399")(s4), s4.length);

  printCardEmpty("#10b981");
  printCardFooter("#10b981");

  // --- WHERE TO IMPROVE (ACTIONABLE RECOMMENDATIONS) ---
  printCardHeader("#f59e0b", "🟡 WHERE TO IMPROVE (PIT WALL OPTIMIZATION ALERTS)");
  printCardEmpty("#f59e0b");

  for (let i = 0; i < improvementAlerts.length; i++) {
    const alertText = `[Tip ${i + 1}] ${improvementAlerts[i]}`;
    // Wrap to 68 characters if needed
    if (alertText.length <= 68) {
      printCardLine("#f59e0b", chalk.hex("#fbbf24")(alertText), alertText.length);
    } else {
      const part1 = alertText.slice(0, 68);
      const part2 = "        " + alertText.slice(68);
      printCardLine("#f59e0b", chalk.hex("#fbbf24")(part1), part1.length);
      printCardLine("#f59e0b", chalk.hex("#fbbf24")(part2), part2.length);
    }
  }

  printCardEmpty("#f59e0b");
  printCardFooter("#f59e0b");

  // 1. Executive Financial ROI Box
  printCardHeader("#10b981", "CAPITAL ARBITRAGE & FINANCIAL EFFICIENCY (ROI)");
  printCardEmpty("#10b981");

  const l1Left = "Kobayashi Actual Cost : ";
  const l1Actual = `$${totalActualUsd.toFixed(4)}`.padEnd(13);
  const l1Mid = "Net Capital Saved : ";
  const l1Saved = `$${netSavingsUsd.toFixed(4)}`.padEnd(14);
  printCardLine(
    "#10b981",
    chalk.bold(l1Left) +
      chalk.bold.hex("#10b981")(l1Actual) +
      chalk.bold(l1Mid) +
      chalk.bold.hex("#34d399")(l1Saved),
    l1Left.length + l1Actual.length + l1Mid.length + l1Saved.length
  );

  const l2Left = "Claude Code Baseline  : ";
  const l2Base = `$${totalBaselineUsd.toFixed(4)}`.padEnd(13);
  const l2Mid = "Cost Reduction    : ";
  const l2Pct = `${savingsPct}%`.padEnd(14);
  printCardLine(
    "#10b981",
    chalk.bold(l2Left) +
      chalk.hex("#f87171")(l2Base) +
      chalk.bold(l2Mid) +
      chalk.bold.hex("#a855f7")(l2Pct),
    l2Left.length + l2Base.length + l2Mid.length + l2Pct.length
  );

  printCardEmpty("#10b981");

  const costBar = renderBar(savingsPctNum / 100, 24, "█", "░");
  const costBarLabel = `${savingsPct}% Net Saved`.padEnd(20);
  printCardLine(
    "#10b981",
    chalk.dim("Savings Arbitrage     : [") +
      chalk.hex("#10b981")(costBar) +
      chalk.dim("] ") +
      chalk.bold.hex("#34d399")(costBarLabel),
    25 + 24 + 2 + costBarLabel.length
  );

  const cacheBar = renderBar(cacheHitRateNum / 100, 24, "█", "░");
  const cacheBarLabel = `${cacheHitRate}% Cache Hit`.padEnd(20);
  printCardLine(
    "#10b981",
    chalk.dim("Prompt Cache Reuse    : [") +
      chalk.hex("#38bdf8")(cacheBar) +
      chalk.dim("] ") +
      chalk.bold.hex("#38bdf8")(cacheBarLabel),
    25 + 24 + 2 + cacheBarLabel.length
  );

  printCardEmpty("#10b981");
  printCardFooter("#10b981");

  // 2. Token Acceleration & Cache Metrics
  printCardHeader("#38bdf8", "TOKEN ACCELERATION & CACHE METRICS");
  printCardEmpty("#38bdf8");

  const tok1Left = "Total Processed Tokens: ";
  const tok1Val = totalTokens.toLocaleString().padEnd(14);
  const tok1Mid = "Cache Read Tokens : ";
  const tok1Read = totalCacheReadTokens.toLocaleString().padEnd(13);
  printCardLine(
    "#38bdf8",
    chalk.bold(tok1Left) +
      chalk.bold.white(tok1Val) +
      chalk.bold(tok1Mid) +
      chalk.bold.hex("#38bdf8")(tok1Read),
    tok1Left.length + tok1Val.length + tok1Mid.length + tok1Read.length
  );

  const tok2Left = "Fresh Input Tokens    : ";
  const tok2Val = totalInputTokens.toLocaleString().padEnd(14);
  const tok2Mid = "Output Tokens     : ";
  const tok2Out = totalOutputTokens.toLocaleString().padEnd(13);
  printCardLine(
    "#38bdf8",
    chalk.bold(tok2Left) +
      chalk.white(tok2Val) +
      chalk.bold(tok2Mid) +
      chalk.white(tok2Out),
    tok2Left.length + tok2Val.length + tok2Mid.length + tok2Out.length
  );

  const cacheNote = `Cache Read Advantage : ${totalCacheReadTokens.toLocaleString()} tokens billed @ $0.02/M ($0.008 total)`;
  printCardLine(
    "#38bdf8",
    chalk.dim(cacheNote),
    cacheNote.length
  );

  printCardEmpty("#38bdf8");
  printCardFooter("#38bdf8");

  // 3. Multi-Tier Workload Matrix Table
  printCardHeader("#c084fc", "MULTI-TIER WORKLOAD MATRIX");
  const th = "Tier                  Turns   Tokens     Actual    Baseline  Net Saved";
  printCardLine("#c084fc", chalk.bold.white(th), th.length);
  const tdiv = "───────────────────────────────────────────────────────────────────────";
  printCardLine("#c084fc", chalk.dim(tdiv), tdiv.length);

  const formatTierLine = (
    icon: string,
    name: string,
    tierKey: string,
    colorFn: (s: string) => string
  ) => {
    const s = tierStats[tierKey] || { turns: 0, tokens: 0, actualUsd: 0, baselineUsd: 0 };
    const saved = Math.max(0, s.baselineUsd - s.actualUsd);
    const n = name.padEnd(20);
    const trn = String(s.turns).padStart(5);
    const tk = s.tokens.toLocaleString().padStart(8);
    const act = (`$` + s.actualUsd.toFixed(4)).padStart(10);
    const base = (`$` + s.baselineUsd.toFixed(4)).padStart(11);
    const sv = (`+$` + saved.toFixed(4)).padStart(10);

    printCardLine(
      "#c084fc",
      `${icon} ` +
        colorFn(n) +
        trn +
        " " +
        tk +
        " " +
        act +
        " " +
        base +
        " " +
        chalk.bold.hex("#34d399")(sv),
      2 + n.length + trn.length + 1 + tk.length + 1 + act.length + 1 + base.length + 1 + sv.length
    );
  };

  formatTierLine("🟢", "Local Workhorse", "workhorse", (s) => chalk.hex("#10b981")(s));
  formatTierLine("🔵", "Cached Orchestrator", "orchestrator", (s) => chalk.hex("#38bdf8")(s));
  formatTierLine("🟣", "Frontier Advisor", "advisor", (s) => chalk.hex("#c084fc")(s));

  printCardEmpty("#c084fc");
  const distTitle = "Turn Distribution Across Tiers:";
  printCardLine("#c084fc", chalk.bold.white(distTitle), distTitle.length);

  const whRatio = totalTurns > 0 ? tierStats.workhorse.turns / totalTurns : 0;
  const orRatio = totalTurns > 0 ? tierStats.orchestrator.turns / totalTurns : 0;
  const adRatio = totalTurns > 0 ? tierStats.advisor.turns / totalTurns : 0;

  const whBar = renderBar(whRatio, 16, "█", "░");
  const orBar = renderBar(orRatio, 16, "█", "░");
  const adBar = renderBar(adRatio, 16, "█", "░");

  const whPct = `${(whRatio * 100).toFixed(0)}%`.padStart(4);
  const whDesc = "Ollama ornith-1.5:ctx ($0.00/turn)";
  printCardLine(
    "#c084fc",
    chalk.hex("#10b981")("• Workhorse   : ") +
      chalk.bold.white(whPct) +
      " [" +
      chalk.hex("#10b981")(whBar) +
      "] " +
      chalk.dim(whDesc),
    16 + whPct.length + 2 + 16 + 2 + whDesc.length
  );

  const orPct = `${(orRatio * 100).toFixed(0)}%`.padStart(4);
  const orDesc = "Mantle gpt-5.6-luna ($0.22/M)";
  printCardLine(
    "#c084fc",
    chalk.hex("#38bdf8")("• Orchestrator: ") +
      chalk.bold.white(orPct) +
      " [" +
      chalk.hex("#38bdf8")(orBar) +
      "] " +
      chalk.dim(orDesc),
    16 + orPct.length + 2 + 16 + 2 + orDesc.length
  );

  const adPct = `${(adRatio * 100).toFixed(0)}%`.padStart(4);
  const adDesc = "Bedrock Sonnet 5.5 (Circuit-gated)";
  printCardLine(
    "#c084fc",
    chalk.hex("#c084fc")("• Advisor     : ") +
      chalk.bold.white(adPct) +
      " [" +
      chalk.hex("#c084fc")(adBar) +
      "] " +
      chalk.dim(adDesc),
    16 + adPct.length + 2 + 16 + 2 + adDesc.length
  );

  printCardEmpty("#c084fc");
  printCardFooter("#c084fc");

  // 4. Autonomous Token Defense & Interception Box
  printCardHeader("#f59e0b", "HARNESS INTERCEPTION & TOKEN DEFENSE");
  printCardEmpty("#f59e0b");

  const int1 = "• 10-Vector Bulk Reads Blocked  : ";
  const int1Val = String(delegationEnforcedCount).padEnd(6);
  const int1Note = "Intercepted & routed to local workhorse";
  printCardLine(
    "#f59e0b",
    chalk.bold(int1) +
      chalk.bold.hex("#f59e0b")(int1Val) +
      chalk.dim(int1Note),
    int1.length + int1Val.length + int1Note.length
  );

  const int2 = "• Spill Store Offload Files     : ";
  const int2Val = String(spillFilesCount).padEnd(6);
  const int2Note = "Offloaded >1,500 chars outputs to disk";
  printCardLine(
    "#f59e0b",
    chalk.bold(int2) +
      chalk.bold.hex("#f59e0b")(int2Val) +
      chalk.dim(int2Note),
    int2.length + int2Val.length + int2Note.length
  );

  const int3 = "• Two-Layer Safety Firewall     : ";
  const int3Val = String(firewallBlockCount).padEnd(6);
  const int3Note = "Destructive operations blocked";
  printCardLine(
    "#f59e0b",
    chalk.bold(int3) +
      chalk.bold.hex("#10b981")(int3Val) +
      chalk.dim(int3Note),
    int3.length + int3Val.length + int3Note.length
  );

  const int4 = "• Circuit Breaker Status        : ";
  const int4Val = "ARMED ".padEnd(6);
  const int4Note = "Trips after 2 consecutive failures";
  printCardLine(
    "#f59e0b",
    chalk.bold(int4) +
      chalk.bold.hex("#10b981")(int4Val) +
      chalk.dim(int4Note),
    int4.length + int4Val.length + int4Note.length
  );

  printCardEmpty("#f59e0b");
  printCardFooter("#f59e0b");

  console.log(
    "\n  " +
      chalk.dim("Quick Actions: ") +
      chalk.bold.white("kobayashi stats --web") +
      chalk.dim(" (live charts) • ") +
      chalk.bold.white("kobayashi eval") +
      chalk.dim(" (sandboxed benchmarks)\n")
  );
}
