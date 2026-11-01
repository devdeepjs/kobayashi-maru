import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";

const execFileAsync = promisify(execFile);

function runPiWorker(args: string[], timeoutMs = 60000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr });
    });
  });
}
const PI_DIR = join(homedir(), ".pi", "agent");
const LEDGER_PATH = join(PI_DIR, "savings-ledger.jsonl");
const CONFIG_PATH = join(PI_DIR, "kobayashi-config.json");
const SPILL_DIR = join(PI_DIR, "spill");
try {
  if (!existsSync(SPILL_DIR)) mkdirSync(SPILL_DIR, { recursive: true });
} catch {}

// Hard-block Layer 1 static patterns
const HARD_BLOCK_PATTERNS = [
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s+(\/|~|\$HOME|\.\.)(\s|$)/i,
  /mkfs\.|dd\s+if=.*of=\/dev\//i,
  /git\s+push\s+.*(--force|-f)\s+.*(main|master)/i,
  /DROP\s+(DATABASE|TABLE|SCHEMA)/i,
  /curl\s+.*\|\s*(sh|bash|zsh)/i,
];

// Ambiguous patterns that trigger Layer 2 local LLM inspection
const AMBIGUOUS_PATTERNS = [
  /\b(rm\s+-rf|chmod\s+777|chown\s+-R|kill\s+-9|pkill|aws\s+.*\s+(delete|terminate)|kubectl\s+delete|docker\s+system\s+prune)\b/i,
];

function recordLedger(entry: Record<string, any>) {
  try {
    appendFileSync(LEDGER_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch {}
}

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export interface PiContext {
  hasUI: boolean;
  model?: { id: string; provider: string };
  modelRegistry: {
    find: (provider: string, id: string) => any;
    streamSimple?: (model: any, context: any, options: any) => AsyncIterable<any>;
  };
  ui: {
    setStatus: (key: string, text: string) => void;
    notify: (message: string, type?: "info" | "warning" | "error") => void;
  };
}

export interface PiAgent {
  registerCommand: (name: string, def: { description: string; handler: (args: string, ctx: PiContext) => Promise<void> }) => void;
  registerTool: (def: any) => void;
  setModel: (model: any) => Promise<void>;
  on: (event: string, handler: (event: any, ctx: PiContext) => Promise<any> | any) => void;
}

/**
 * Microsecond Lexical Inspector for Shell Commands.
 * Identifies bulk repository reads, multi-file sweeps, and recursive dumps
 * that should be delegated to the local Workhorse ($0.00 in RAM) instead of
 * polluting paid cloud LLM context.
 * Benchmarked execution latency: ~0.002ms - 0.005ms (2 to 5 microseconds).
 */
export function checkBulkExploration(cmd: string): { isBulk: boolean; reason?: string } {
  const norm = cmd.trim();

  // 1. Multi-file cat (e.g. cat file1.md file2.md file3.sql)
  if (/\bcat\s+([^\s;&|]+\s+){2,}/i.test(norm)) {
    return { isBulk: true, reason: "multi_file_cat" };
  }

  // 2. Chained inspection commands (e.g. cat f1 && cat f2, or grep ... | head ... ; cat f3)
  const inspectCount = (norm.match(/\b(cat|head|tail|sed|awk)\b/gi) || []).length;
  if (inspectCount >= 2) {
    return { isBulk: true, reason: "chained_file_reads" };
  }

  // 3. Recursive search across entire codebase (grep -r, rg, ag)
  if (/\b(grep|rg|ag)\s+.*-[a-zA-Z]*r/i.test(norm)) {
    return { isBulk: true, reason: "recursive_code_search" };
  }

  // 4. Find with execution or piping to xargs
  if (/\bfind\s+.*(-exec|\bexec\b|\|\s*xargs)/i.test(norm)) {
    return { isBulk: true, reason: "find_exec_pipe" };
  }

  // 5. Deep find output piped to dumpers (e.g. find ... | head -150)
  if (/\bfind\s+.*-print/i.test(norm) && /\b(head|tail|cat|wc)\b/i.test(norm)) {
    return { isBulk: true, reason: "find_dump" };
  }

  // 6. Broad line count expansions (e.g. wc -l $(find ...))
  if (/\bwc\s+.*-[a-zA-Z]*l\s+\$\(/i.test(norm)) {
    return { isBulk: true, reason: "bulk_wc_expansion" };
  }

  // 7. Shell loops reading files (for f in *.md; do cat $f; done)
  if (/\b(for|while)\s+.*\b(do|done)\b/i.test(norm) && /\b(cat|read|head|grep)\b/i.test(norm)) {
    return { isBulk: true, reason: "shell_loop_reader" };
  }

  // 8. Bulk documentation reading (docs/ + md files across compound commands)
  if (/\b(cat|head|tail|sed)\s+.*(\bdocs\/|\.md\b)/i.test(norm) && (norm.includes("&&") || norm.includes(";") || norm.includes("|"))) {
    return { isBulk: true, reason: "doc_tree_sweep" };
  }

  // 9. Massive range slices on files (>50 lines)
  if (/\b(head|tail)\s+-[n]?([5-9]\d|\d{3,})/i.test(norm)) {
    return { isBulk: true, reason: "large_head_tail_slice" };
  }
  if (/\bsed\s+.*([5-9]\d|\d{3,})p/i.test(norm)) {
    return { isBulk: true, reason: "large_sed_slice" };
  }

  // 10. Scripting one-liners reading files
  if (/\bpython[3]?\s+-c\s+.*open\(.*read\(/i.test(norm) || /\bnode\s+-e\s+.*readFileSync/i.test(norm)) {
    return { isBulk: true, reason: "script_file_dumper" };
  }

  return { isBulk: false };
}

// --- PROGRESSIVE SKILL DISCLOSURE & DYNAMIC WORKFLOW RETRIEVAL ---

export interface SkillCatalogItem {
  name: string;
  description: string;
  filePath: string;
  body: string;
  triggers: string[];
}

let cachedSkills: SkillCatalogItem[] | null = null;

export function getSkillCatalog(): SkillCatalogItem[] {
  if (cachedSkills) return cachedSkills;

  const catalog: SkillCatalogItem[] = [];
  const searchDirs = [
    resolve(process.cwd(), ".agents", "skills"),
    join(homedir(), ".agents", "skills"),
  ];

  const seen = new Set<string>();

  for (const sDir of searchDirs) {
    if (!existsSync(sDir)) continue;
    try {
      const entries = readdirSync(sDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory() || seen.has(ent.name)) continue;
        const skillFile = join(sDir, ent.name, "SKILL.md");
        if (!existsSync(skillFile)) continue;

        try {
          const raw = readFileSync(skillFile, "utf8");
          let description = "";
          let name = ent.name;
          let body = raw;

          const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
          if (fmMatch) {
            body = fmMatch[2].trim();
            const descMatch = fmMatch[1].match(/description:\s*(.+)/);
            if (descMatch) description = descMatch[1].replace(/^["']|["']$/g, "").trim();
            const nameMatch = fmMatch[1].match(/name:\s*(.+)/);
            if (nameMatch) name = nameMatch[1].replace(/^["']|["']$/g, "").trim();
          }

          const triggers = new Set<string>([
            name.toLowerCase(),
            name.replace(/-/g, " ").toLowerCase(),
            `/${name.toLowerCase()}`,
          ]);

          // Add intelligent semantic trigger words for standard engineering workflows
          if (name === "code-review") {
            ["review", "code review", "pr review", "pull request", "review changes", "standards"].forEach((t) => triggers.add(t));
          } else if (name === "tdd") {
            ["tdd", "test-driven", "test driven", "write tests first", "red green refactor", "unit test"].forEach((t) => triggers.add(t));
          } else if (name === "to-spec") {
            ["to-spec", "spec", "prd", "specification", "requirements doc"].forEach((t) => triggers.add(t));
          } else if (name === "to-tickets") {
            ["to-tickets", "break into tickets", "tracer bullets", "decompose tasks", "tickets", "jira", "linear", "issue tracker", "backlog"].forEach((t) => triggers.add(t));
          } else if (name === "triage") {
            ["triage", "categorise issue", "bug report", "label issue", "backlog grooming"].forEach((t) => triggers.add(t));
          } else if (name === "grill-me" || name === "grilling") {
            ["grill me", "grill-me", "interview me", "sharpen plan", "challenge design"].forEach((t) => triggers.add(t));
          } else if (name === "diagnosing-bugs") {
            ["diagnose bug", "reproduce bug", "hard bug", "troubleshoot", "root cause", "stack trace", "traceback", "assertionerror"].forEach((t) => triggers.add(t));
          } else if (name === "domain-modeling") {
            ["domain model", "glossary", "ubiquitous language", "adr"].forEach((t) => triggers.add(t));
          } else if (name === "codebase-design") {
            ["codebase design", "deep module", "information hiding"].forEach((t) => triggers.add(t));
          } else if (name === "archify") {
            ["archify", "architecture diagram", "mermaid diagram", "sequence diagram"].forEach((t) => triggers.add(t));
          } else if (name === "pr") {
            ["pr body", "write a pr", "pull request description"].forEach((t) => triggers.add(t));
          } else if (name === "chief-of-staff") {
            ["chief of staff", "coordinate subagents"].forEach((t) => triggers.add(t));
          }

          catalog.push({
            name,
            description,
            filePath: skillFile,
            body,
            triggers: Array.from(triggers),
          });
          seen.add(name);
        } catch {}
      }
    } catch {}
  }

  cachedSkills = catalog;
  return catalog;
}

export interface SkillMatchResult {
  skills: SkillCatalogItem[];
  detectedEntity?: {
    type: "jira_issue" | "url_issue" | "git_diff" | "stack_trace";
    value: string;
  };
}

export function matchSkillsForPrompt(promptText: string): SkillMatchResult {
  const catalog = getSkillCatalog();
  const lower = promptText.toLowerCase();
  const matched: SkillCatalogItem[] = [];
  let detectedEntity: SkillMatchResult["detectedEntity"];

  // 1. Entity Recognition Layer (Jira, Linear, GitHub Issues, Stack Traces, Diffs)
  // Jira / Linear issue key pattern (e.g. GEO-104, PROJ-9921, ENG-42)
  const issueKeyMatch = promptText.match(/\b([A-Z]{2,10}-\d+)\b/);
  // Atlassian / GitHub / Linear URLs
  const issueUrlMatch = promptText.match(/https?:\/\/[^\s/$.?#].[^\s]*(?:\/browse\/|\/issues\/|\/pull\/|\/workspaces\/[^\s/]+\/issues\/)([A-Z0-9_-]+)/i);
  // GitHub short issue #123
  const shortIssueMatch = promptText.match(/(?:^|\s)#(\d{1,6})\b/);

  if (issueKeyMatch || issueUrlMatch || shortIssueMatch) {
    const ticketVal = issueKeyMatch ? issueKeyMatch[1] : (issueUrlMatch ? issueUrlMatch[1] : `#${shortIssueMatch![1]}`);
    detectedEntity = {
      type: issueKeyMatch ? "jira_issue" : (issueUrlMatch ? "url_issue" : "jira_issue"),
      value: ticketVal,
    };
    // Find ticket or triage skill
    const ticketSkill = catalog.find((s) => s.name === "to-tickets" || s.name === "triage" || s.name.includes("jira"));
    if (ticketSkill && !matched.some((s) => s.name === ticketSkill.name)) {
      matched.push(ticketSkill);
    }
  }

  // Git Diff patch detection -> activates code-review
  if (/(?:diff --git|@@ -\d+,\d+ \+\d+,\d+ @@)/.test(promptText)) {
    detectedEntity = detectedEntity || { type: "git_diff", value: "git_patch" };
    const reviewSkill = catalog.find((s) => s.name === "code-review" || s.name === "pr");
    if (reviewSkill && !matched.some((s) => s.name === reviewSkill.name)) {
      matched.push(reviewSkill);
    }
  }

  // Stack Trace / Error detection -> activates diagnosing-bugs
  if (/\b(?:TypeError|ReferenceError|AssertionError|SyntaxError|UnhandledPromiseRejection|Traceback \(most recent call last\)):/i.test(promptText)) {
    detectedEntity = detectedEntity || { type: "stack_trace", value: "runtime_error" };
    const bugSkill = catalog.find((s) => s.name === "diagnosing-bugs");
    if (bugSkill && !matched.some((s) => s.name === bugSkill.name)) {
      matched.push(bugSkill);
    }
  }

  // 2. Lexical & Semantic Keyword Pattern Matching
  for (const skill of catalog) {
    if (matched.some((s) => s.name === skill.name)) continue;

    for (const trigger of skill.triggers) {
      if (trigger.startsWith("/")) {
        if (lower.includes(trigger)) {
          matched.push(skill);
          break;
        }
      } else {
        const regex = new RegExp(`\\b${trigger.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
        if (regex.test(lower)) {
          matched.push(skill);
          break;
        }
      }
    }
    if (matched.length >= 2) break; // Maximum 2 skills to prevent token bloat
  }

  return { skills: matched, detectedEntity };
}

export default function kobayashiRouterExtension(pi: PiAgent) {
  let config: any = null;
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch {}
  }

  const advisorTier = config?.tiers?.advisor || {
    provider: "amazon-bedrock",
    model: "us.anthropic.claude-sonnet-5-5",
    cost: { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 },
  };

  const orchTier = config?.tiers?.orchestrator || {
    provider: "amazon-bedrock",
    model: "us.anthropic.claude-sonnet-5-5",
    cost: { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 },
  };

  const workhorseTier = config?.tiers?.workhorse || {
    provider: "ollama",
    model: "ornith-1.5:ctx",
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  };

  const localTier = config?.tiers?.local || workhorseTier;

  let activeTier: "advisor" | "orchestrator" | "workhorse" | "local" =
    config?.starting_tier || "workhorse";
  let consecutiveBashFailures = 0;
  let sessionSavedUsd = 0;
  let sessionActualUsd = 0;
  let advisorCallsCount = 0;
  let pendingTurn: { tier: string; model: string; provider: string } | null = null;
  let turnsRecordedThisRun = 0;
  let lastTurnTokens = 0;
  const filesReadInRun = new Set<string>();
  let directReadCountInRun = 0;

  function getTierConfig(tierName: "advisor" | "orchestrator" | "workhorse" | "local") {
    switch (tierName) {
      case "advisor":
        return advisorTier;
      case "orchestrator":
        return orchTier;
      case "local":
        return localTier;
      case "workhorse":
      default:
        return workhorseTier;
    }
  }

  function setStatusBadge(ctx: PiContext, activeModelId: string) {
    if (ctx?.hasUI) {
      const failTag = consecutiveBashFailures > 0 ? ` | Fails:${consecutiveBashFailures}` : "";
      const roiTag = sessionSavedUsd > 0 ? ` | Saved:$${sessionSavedUsd.toFixed(3)}` : "";
      const tokTag = lastTurnTokens > 0 ? ` | Tok:${fmtTokens(lastTurnTokens)}` : "";
      ctx.ui.setStatus(
        "kobayashi-tier",
        `[TIER:${activeTier.toUpperCase()} | Model:${activeModelId}${failTag}${roiTag}${tokTag}]`
      );
    }
  }

  // --- 1. REGISTER CLI / TUI COMMANDS ---

  pi.registerCommand("spec", {
    description: "Phase 1: Switch to Claude Sonnet 5.5 for high-level architecture, design & specs",
    handler: async (_args: string, ctx: PiContext) => {
      activeTier = "advisor";
      const targetConfig = getTierConfig("advisor");
      if (targetConfig) {
        const target = ctx.modelRegistry.find(targetConfig.provider, targetConfig.model);
        if (target) await pi.setModel(target);
        ctx.ui.notify(`Phase 1 Active: Claude Sonnet 5.5 (Architecture & Specs)`, "info");
        setStatusBadge(ctx, targetConfig.model);
      }
    },
  });

  pi.registerCommand("code", {
    description: "Phase 2: Switch to Ornith ($0.00 local) for code edits, bash & test execution",
    handler: async (_args: string, ctx: PiContext) => {
      activeTier = "workhorse";
      const targetConfig = getTierConfig("workhorse");
      if (targetConfig) {
        const target = ctx.modelRegistry.find(targetConfig.provider, targetConfig.model);
        if (target) await pi.setModel(target);
        ctx.ui.notify(`Phase 2 Active: Ornith ($0.00 Local Workhorse)`, "info");
        setStatusBadge(ctx, targetConfig.model);
      }
    },
  });

  pi.registerCommand("tier", {
    description: "Switch Kobayashi model tier: /tier [orchestrator | workhorse | advisor | local]",
    handler: async (args: string, ctx: PiContext) => {
      const choice = (args || "").trim().toLowerCase();
      if (["orchestrator", "workhorse", "advisor", "local"].includes(choice)) {
        activeTier = choice as any;
        const targetConfig = getTierConfig(activeTier);
        if (targetConfig) {
          const target = ctx.modelRegistry.find(targetConfig.provider, targetConfig.model);
          if (target) {
            await pi.setModel(target);
          }
          ctx.ui.notify(
            `Kobayashi Tier switched to: ${activeTier.toUpperCase()} (${targetConfig.model})`,
            "info"
          );
          setStatusBadge(ctx, targetConfig.model);
        }
      } else {
        ctx.ui.notify("Usage: /tier orchestrator | workhorse | advisor | local", "warning");
      }
    },
  });

  pi.registerCommand("roi", {
    description: "Display cumulative Kobayashi token savings and dollar ROI vs Claude Code",
    handler: async (_args: string, ctx: PiContext) => {
      if (!existsSync(LEDGER_PATH)) {
        ctx.ui.notify("No savings ledger entries yet. Run a few turns first!", "info");
        return;
      }
      const lines = readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean);
      let totalActual = 0;
      let totalSonnetBaseline = 0;
      let totalTokens = 0;
      let exactRows = 0;

      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          totalActual += row.actualUsd || 0;
          totalSonnetBaseline += row.sonnetBaselineUsd || 0;
          if (row.exact) {
            exactRows++;
            totalTokens += Number(row.totalTokens || 0);
          }
        } catch {}
      }
      const saved = Math.max(0, totalSonnetBaseline - totalActual);
      const pct = totalSonnetBaseline > 0 ? ((saved / totalSonnetBaseline) * 100).toFixed(1) : "0.0";
      ctx.ui.notify(
        `KOBAYASHI ROI: Total ${fmtTokens(totalTokens)} tok | Actual: $${totalActual.toFixed(4)} vs Claude Code: $${totalSonnetBaseline.toFixed(4)} | NET SAVED: $${saved.toFixed(4)} (${pct}%)`,
        "info"
      );
    },
  });

  // --- 2. CIRCUIT BREAKER & SECURITY FIREWALL (TOOL_CALL) ---

  pi.on("tool_call", async (event: any, _ctx: PiContext) => {
    if (event.toolName === "read") {
      const rawPath = String(event.input?.path || "").trim();
      const normPath = rawPath.replace(/:\d+(-\d+)?$/, "");

      // 1. Prevent duplicate reads of the exact same file in a single turn
      if (filesReadInRun.has(normPath)) {
        recordLedger({ event: "duplicate_read_blocked", file: normPath });
        return {
          block: true,
          reason: `[KOBAYASHI CONTEXT SHIELD]: You have ALREADY read "${normPath}" earlier in this turn. Its contents are already present in your conversation context above. Do NOT re-read it. Use the content already provided in your history.`,
        };
      }

      // 2. Prevent directory reads that trigger EISDIR errors
      if (normPath === "docs" || normPath === "platform" || normPath === "src" || normPath === "." || normPath === "./") {
        return {
          block: true,
          reason: `[KOBAYASHI ERROR PREVENTED]: "${normPath}" is a directory, not a file. Direct reads on directories fail with EISDIR. Delegate directory surveys to \`delegate_workhorse\`.`,
        };
      }

      // 3. For cloud orchestrator/advisor: cap sequential direct file reads
      if (activeTier === "orchestrator" || activeTier === "advisor") {
        directReadCountInRun++;
        if (directReadCountInRun > 3) {
          recordLedger({ event: "delegation_enforced", rule: "excessive_direct_reads", file: normPath });
          return {
            block: true,
            reason: `[KOBAYASHI DELEGATION ENFORCED (excessive_direct_reads)]: You have directly read ${directReadCountInRun - 1} files in this turn. Reading multiple files sequentially directly on cloud LLM balloons your context tokens. You MUST delegate the remaining file inspections to the local worker via \`delegate_workhorse(task: "Inspect ${normPath} and summarize...")\`. The local worker runs in local RAM at $0.00.`,
          };
        }
      }

      filesReadInRun.add(normPath);
    }

    if (event.toolName === "bash") {
      const threshold = config?.router?.escalation_threshold || 2;

      // ENFORCE CIRCUIT BREAKER: Block 3rd failing bash command and force advisor call
      if (consecutiveBashFailures >= threshold) {
        return {
          block: true,
          reason: `[CIRCUIT BREAKER ENFORCED]: ${consecutiveBashFailures} consecutive bash executions have failed. Bash execution is locked to prevent token doom loops. You MUST call the \`call_advisor\` tool now with your question and error details to consult Claude Sonnet 5.5 for a working solution.`,
        };
      }

      const cmd = String(event.input?.command || "");

      // ENFORCE DELEGATION ON CLOUD MODELS:
      // Microsecond inspection (~0.002ms) to block bulk file/doc reading and force delegation to local Workhorse ($0.00)
      if (activeTier === "orchestrator" || activeTier === "advisor") {
        const check = checkBulkExploration(cmd);
        if (check.isBulk) {
          recordLedger({ event: "delegation_enforced", rule: check.reason, command: cmd.slice(0, 120) });
          return {
            block: true,
            reason: `[KOBAYASHI DELEGATION ENFORCED (${check.reason})]: Direct multi-file reading via bash wastes paid cloud context. You MUST delegate this repository exploration task to the local worker by calling \`delegate_workhorse(task: "Inspect and summarize the contents/findings of: ${cmd.slice(0, 80)}")\`. The local worker runs in RAM at $0.00 and returns a concise synthesis.`,
          };
        }
      }
      for (const pat of HARD_BLOCK_PATTERNS) {
        if (pat.test(cmd)) {
          recordLedger({ event: "firewall_block", layer: "L1_Deterministic", command: cmd.slice(0, 120) });
          return {
            block: true,
            reason: `[Kobayashi Firewall L1]: Blocked dangerous command execution: "${cmd}"`,
          };
        }
      }

      for (const amb of AMBIGUOUS_PATTERNS) {
        if (amb.test(cmd)) {
          try {
            const res = await fetch("http://localhost:11434/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: config?.router?.model || "kev:4b",
                prompt: `Evaluate if this bash command is safe inside a project repository or destructive: "${cmd}". Reply with SAFE or BLOCK followed by 4 words.`,
                stream: false,
                options: { num_predict: 12, temperature: 0 },
              }),
              signal: AbortSignal.timeout(2000),
            });
            if (res.ok) {
              const data: any = await res.json();
              const reply = String(data.response || "").trim();
              if (reply.toUpperCase().startsWith("BLOCK")) {
                recordLedger({ event: "firewall_block", layer: "L2_Local_Kev", command: cmd.slice(0, 120) });
                return {
                  block: true,
                  reason: `[Kobayashi Firewall L2 - Kev]: Command denied: ${reply}`,
                };
              }
            }
          } catch {}
        }
      }
    }
  });

  // --- 3. TEST / BASH FAILURE TRACKING, IN-LOOP INJECTION & TOOL SPILL STORE (TOOL_RESULT) ---

  pi.on("tool_result", async (event: any, ctx: PiContext) => {
    let contentModified = false;
    let newContent = Array.isArray(event.content) ? [...event.content] : [];

    // Feature A: Hard Tool Output Truncation (Spill Store)
    // Caps output at ~350 tokens (1,500 chars) to prevent multi-call context bloat and runaway token bills.
    const MAX_TOOL_CHARS = config?.compaction?.max_tool_chars || 1500;
    newContent = newContent.map((part) => {
      if (part.type === "text" && typeof part.text === "string" && part.text.length > MAX_TOOL_CHARS) {
        contentModified = true;
        const fullLen = part.text.length;
        const spillFile = join(SPILL_DIR, `spill_${Date.now()}_${event.toolName}.log`);
        try {
          writeFileSync(spillFile, part.text, "utf8");
        } catch {}
        const head = part.text.slice(0, 400);
        const tail = part.text.slice(-900);
        return {
          ...part,
          text: `${head}\n\n... [TRUNCATED ${fullLen - 1300} CHARACTERS BY KOBAYASHI TO PREVENT CONTEXT BLOAT. Full output saved to: ${spillFile}] ...\n\n${tail}`,
        };
      }
      return part;
    });

    if (event.toolName === "bash") {
      let hasError = Boolean(event.isError);

      // Also check content for fatal/error keywords
      if (!hasError) {
        for (const part of newContent) {
          const str = String(part.text || "").toLowerCase();
          if (
            str.includes("command not found") ||
            str.includes("permission denied") ||
            str.includes("fatal:") ||
            str.includes("cannot find module") ||
            str.includes("blocked") ||
            str.includes("syntax error")
          ) {
            hasError = true;
            break;
          }
        }
      }

      if (hasError) {
        consecutiveBashFailures++;
        const threshold = config?.router?.escalation_threshold || 2;
        if (consecutiveBashFailures >= threshold) {
          contentModified = true;
          newContent.push({
            type: "text",
            text: `\n\n⚠️ [CIRCUIT BREAKER TRIGGERED: ${consecutiveBashFailures} Consecutive Failures]\nDo NOT try any more bash commands. Immediately invoke the \`call_advisor\` tool with the error details and your question to receive an architectural fix from Claude Sonnet 5.5.`,
          });
        }
      } else {
        consecutiveBashFailures = 0;
      }
      setStatusBadge(ctx, ctx.model?.id || "unknown");
    }

    if (contentModified) {
      return { content: newContent };
    }
  });

  // --- 5. TURN ORCHESTRATION & DYNAMIC TIER ROUTING ---

  pi.on("before_agent_start", async (event: any, ctx: PiContext) => {
    filesReadInRun.clear();
    directReadCountInRun = 0;
    const rawPrompt = String(event.prompt || "");
    const text = rawPrompt.toLowerCase();

    // 1. Detect explicit prompt bracket/command overrides
    let explicitSwitch = false;
    if (text.includes("[advisor]") || text.includes("/to-spec") || text.includes("/spec")) {
      activeTier = "advisor";
      explicitSwitch = true;
    } else if (text.includes("[orchestrator]") || text.includes("/implement") || text.includes("/to-tickets")) {
      activeTier = "orchestrator";
      explicitSwitch = true;
    } else if (text.includes("[workhorse]") || text.includes("[local]") || text.includes("/tdd") || text.includes("/code")) {
      activeTier = "workhorse";
      explicitSwitch = true;
    }

    if (explicitSwitch) {
      // User explicitly requested a tier in this prompt: switch model
      const tierCfg = getTierConfig(activeTier);
      if (tierCfg) {
        const model = ctx.modelRegistry.find(tierCfg.provider, tierCfg.model);
        if (model && ctx.model?.id !== model.id) {
          await pi.setModel(model);
          if (ctx?.hasUI) {
            ctx.ui.notify(`[Kobayashi]: Switched tier to ${activeTier.toUpperCase()} (${tierCfg.provider}/${tierCfg.model})`, "info");
          }
        }
      }
    } else {
      // User did NOT specify a tier override: RESPECT the user's active model selection!
      // If the user changed model via Pi UI (/model, ctrl+p), sync activeTier to match.
      const curModelId = ctx.model?.id || "";
      const curProvider = ctx.model?.provider || "";
      if (
        curModelId === advisorTier.model ||
        /sonnet|claude-3-5|claude-sonnet/i.test(curModelId)
      ) {
        activeTier = "advisor";
      } else if (
        curModelId === workhorseTier.model ||
        /ornith|qwen|llama/i.test(curModelId) ||
        curProvider === "ollama"
      ) {
        activeTier = "workhorse";
      } else if (
        curModelId === orchTier.model ||
        /luna|gpt-5|gpt-4/i.test(curModelId)
      ) {
        activeTier = "orchestrator";
      }
    }

    const tierCfg = getTierConfig(activeTier);
    const currentModelId = ctx.model?.id || tierCfg?.model || "unknown";
    const currentProvider = ctx.model?.provider || tierCfg?.provider || "unknown";

    pendingTurn = {
      tier: activeTier,
      model: currentModelId,
      provider: currentProvider,
    };
    turnsRecordedThisRun = 0;
    setStatusBadge(ctx, pendingTurn.model);

    // Dynamic guidance based on whether the active model is Orchestrator or Workhorse
    let guidance = `\n\n[KOBAYASHI HARNESS GUIDELINES]: Active Tier: ${activeTier.toUpperCase()} (${pendingTurn.model})`;
    if (activeTier === "orchestrator" || activeTier === "advisor") {
      guidance +=
        `\n- Role: You are the Principal Staff Engineer Orchestrator. You reason, design system architectures, conduct technical Q&A, and align project specifications.` +
        `\n- Token-Efficient Worker Delegation (\`delegate_workhorse\`): For broad repo exploration, reading multiple documentation/markdown files, grepping, or running tests: DELEGATE the exploration task to \`delegate_workhorse\`. It runs locally on the free Ornith model in RAM at $0.00 and returns a synthesized summary so you do not burn paid tokens dumping raw file dumps into context.` +
        `\n- Only read or edit specific files directly when you need to make surgical changes.`;
    } else {
      guidance +=
        `\n- Frontier Advisor Tool (\`call_advisor\`): If you encounter hard architectural choices or repeated test failures, call \`call_advisor\` to consult Claude Sonnet 5.5 statelessly.` +
        `\n- Tier Switcher Tool (\`switch_tier\`): If this task requires full frontier reasoning, call \`switch_tier\` to promote to 'orchestrator'.`;
    }

    // Dynamic On-Demand Skills disclosure
    const catalog = getSkillCatalog();
    const availableSkillsSummary = catalog.map((s) => s.name).slice(0, 25).join(", ");
    guidance += `\n- On-Demand Skills (\`load_skill\`): Specialized domain skills are available via \`load_skill\`: [${availableSkillsSummary}]. If a task involves Jira/tickets, deep bug diagnosis, PR review, TDD, or ADRs, autonomously invoke \`load_skill(skill_name)\` to retrieve instructions.`;

    // Progressive Skill Disclosure: inject matched workflow instructions for this turn only
    const matchResult = matchSkillsForPrompt(rawPrompt);
    if (matchResult.detectedEntity) {
      guidance += `\n\n[KOBAYASHI ENTITY RECOGNITION]: Detected ${matchResult.detectedEntity.type}: "${matchResult.detectedEntity.value}". Ensure you check this issue/entity reference before proceeding.`;
    }

    if (matchResult.skills.length > 0) {
      for (const s of matchResult.skills) {
        guidance += `\n\n[DYNAMIC WORKFLOW INSTRUCTIONS ACTIVATED: ${s.name.toUpperCase()}]\n${s.body}\n[END DYNAMIC WORKFLOW: ${s.name.toUpperCase()}]`;
      }
      if (ctx?.hasUI) {
        ctx.ui.notify(`[Kobayashi]: Auto-loaded workflow: ${matchResult.skills.map((s) => s.name).join(", ")}`, "info");
      }
    }

    return {
      systemPrompt: (event.systemPrompt || "") + guidance,
    };
  });

  // --- 5. EXACT POST-TURN BILLING & SAVINGS ACCOUNTING ---

  pi.on("turn_end", async (event: any, ctx: PiContext) => {
    const msg = event?.message;
    if (!pendingTurn || !msg || msg.role !== "assistant" || !msg.usage) return;

    const u = msg.usage;
    const input = Number(u.input || 0);
    const cacheRead = Number(u.cacheRead || 0);
    const cacheWrite = Number(u.cacheWrite || 0);
    const output = Number(u.output || 0);
    const turnTokens = input + cacheRead + cacheWrite + output;
    if (turnTokens === 0) return;

    const tierCfg = getTierConfig(pendingTurn.tier as any);
    const cost = tierCfg?.cost || { input: 0.22, output: 1.32, cache_read: 0.02, cache_write: 0.22 };

    const actualUsd =
      (input * (cost.input ?? 0) +
        cacheRead * (cost.cache_read ?? 0) +
        cacheWrite * (cost.cache_write ?? 0) +
        output * (cost.output ?? 0)) /
      1_000_000;

    const claudeCodeBaselineUsd =
      (input * 3.0 + cacheRead * 0.3 + cacheWrite * 3.75 + output * 15.0) / 1_000_000;

    const savedUsd = Math.max(0, claudeCodeBaselineUsd - actualUsd);
    sessionActualUsd += actualUsd;
    sessionSavedUsd += savedUsd;
    lastTurnTokens = turnTokens;
    turnsRecordedThisRun++;

    recordLedger({
      event: pendingTurn.tier,
      model: pendingTurn.model,
      provider: pendingTurn.provider,
      exact: true,
      inputTokens: input,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      outputTokens: output,
      totalTokens: Number(u.totalTokens || turnTokens),
      actualUsd: Number(actualUsd.toFixed(6)),
      sonnetBaselineUsd: Number(claudeCodeBaselineUsd.toFixed(6)),
    });

    setStatusBadge(ctx, pendingTurn.model);
  });

  // --- 6. REGISTER TIER SWITCHING TOOL ---

  pi.registerTool({
    name: "switch_tier",
    label: "Switch Kobayashi Agent Tier",
    description:
      "Promote or change the active model tier to 'advisor' (Claude Sonnet 5.5), 'orchestrator', or 'workhorse'. Call this when a task is too complex for the local model or when you need frontier cloud reasoning.",
    parameters: {
      type: "object",
      properties: {
        tier: {
          type: "string",
          enum: ["advisor", "orchestrator", "workhorse"],
          description: "Target tier: 'advisor' (Claude Sonnet 5.5), 'orchestrator', or 'workhorse'.",
        },
        reason: {
          type: "string",
          description: "1-sentence reason why tier switch is needed.",
        },
      },
      required: ["tier", "reason"],
    },
    execute: async (
      _callId: string,
      params: { tier: "advisor" | "orchestrator" | "workhorse"; reason: string },
      _signal: any,
      _onUpdate: any,
      ctx: PiContext
    ) => {
      activeTier = params.tier;
      const cfg = getTierConfig(activeTier);
      if (cfg && ctx?.hasUI) {
        const m = ctx.modelRegistry.find(cfg.provider, cfg.model);
        if (m) {
          await pi.setModel(m);
          ctx.ui.notify(`Kobayashi: Promoted session to ${activeTier.toUpperCase()} (${cfg.model})`, "info");
        }
      }
      consecutiveBashFailures = 0;
      setStatusBadge(ctx, cfg?.model || activeTier);
      return {
        content: [
          {
            type: "text",
            text: `[Kobayashi]: Successfully switched active tier to ${activeTier.toUpperCase()} (${cfg?.model}). Reason: ${params.reason}`,
          },
        ],
      };
    },
  });

  // --- 7. REGISTER STATELESS ADVISOR ESCALATION TOOL ---

  pi.registerTool({
    name: "call_advisor",
    label: "Consult Frontier Advisor (Claude Sonnet 5.5)",
    description:
      "Stateless escalation to Frontier Advisor (Claude Sonnet 5.5 via AWS Bedrock). Use when encountering hard architectural choices, technology setup questions, concurrency bugs, or repeated test failures. Transmits an isolated ~500-token problem summary rather than the full session context, saving 95%+ on token costs.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Clear 1-2 sentence summary of what is being solved or asked.",
        },
        question: {
          type: "string",
          description: "The specific architectural or root-cause question.",
        },
        code_snippet: {
          type: "string",
          description: "Minimal relevant code snippet or error trace (under 50 lines).",
        },
      },
      required: ["summary", "question"],
    },
    execute: async (
      _callId: string,
      params: { summary: string; question: string; code_snippet?: string },
      signal: any,
      _onUpdate: any,
      ctx: PiContext
    ) => {
      const prompt = `You are the Principal Staff Architect Advisor (Stateless Consultation). Provide a surgical diagnosis and exact code solution for the implementation agent.\n\nSummary:\n${params.summary}\n\nQuestion:\n${params.question}${params.code_snippet ? `\n\nCode Snippet / Trace:\n\`\`\`\n${params.code_snippet}\n\`\`\`` : ""}`;
      const snippetTokens = Math.ceil(prompt.length / 4);

      const recordAdvisor = (replyText: string) => {
        const outTokens = Math.ceil(replyText.length / 4);
        const actualCost = (snippetTokens * 3.0 + outTokens * 15.0) / 1_000_000;
        const avoidedTokens = lastTurnTokens > 0 ? lastTurnTokens : 6000;
        const baselineCost = (avoidedTokens * 3.0 + outTokens * 15.0) / 1_000_000;

        advisorCallsCount++;
        consecutiveBashFailures = 0;
        sessionActualUsd += actualCost;
        sessionSavedUsd += Math.max(0, baselineCost - actualCost);

        recordLedger({
          event: "advisor_escalation",
          model: advisorTier.model,
          inputTokens: snippetTokens,
          outputTokens: outTokens,
          totalTokens: snippetTokens + outTokens,
          avoidedContextTokens: avoidedTokens,
          actualUsd: Number(actualCost.toFixed(6)),
          sonnetBaselineUsd: Number(baselineCost.toFixed(6)),
        });

        setStatusBadge(ctx, ctx?.model?.id || advisorTier.model);
      };

      // 1. Try ctx.modelRegistry.streamSimple directly inside Pi
      try {
        const sonnetModel = ctx?.modelRegistry?.find(advisorTier.provider, advisorTier.model);
        if (sonnetModel && typeof ctx.modelRegistry.streamSimple === "function") {
          const stream = ctx.modelRegistry.streamSimple(
            sonnetModel,
            { messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
            { maxTokens: 4096, signal }
          );
          let text = "";
          for await (const ev of stream) {
            if (ev.type === "text_delta" && ev.delta) text += ev.delta;
            else if (ev.type === "message_end" && !text && ev.message?.content) {
              for (const part of ev.message.content) {
                if (part.type === "text") text += part.text;
              }
            }
          }
          if (text.trim()) {
            recordAdvisor(text.trim());
            return {
              content: [
                {
                  type: "text",
                  text: `### [Frontier Advisor Claude Sonnet 5.5 Diagnosis]:\n${text.trim()}`,
                },
              ],
            };
          }
        }
      } catch {}

      // 2. Fallback to isolated pi CLI process
      try {
        const isolatedEnv = {
          ...process.env,
          PI_CODING_AGENT_DIR: join(homedir(), ".pi", "advisor-isolated"),
          AWS_PROFILE: process.env.AWS_PROFILE || "default",
          AWS_REGION: process.env.AWS_REGION || "us-east-1",
        };
        const { stdout, stderr } = await execFileAsync(
          "pi",
          ["--no-session", "--no-tools", "--model", `${advisorTier.provider}/${advisorTier.model}`, "-p", prompt],
          { env: isolatedEnv, timeout: 45000, maxBuffer: 2 * 1024 * 1024 }
        );
        const reply = (stdout || stderr || "No diagnosis returned").trim();
        recordAdvisor(reply);
        return {
          content: [
            {
              type: "text",
              text: `### [Frontier Advisor Claude Sonnet 5.5 Diagnosis]:\n${reply}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `[Frontier Advisor Error]: Failed to consult advisor: ${err.message}`,
            },
          ],
        };
      }
    },
  });

  // --- 8. REGISTER LOCAL WORKHORSE DELEGATION TOOL (TOP-DOWN) ---

  pi.registerTool({
    name: "delegate_workhorse",
    label: "Delegate Task to Free Local Workhorse (Ornith 9B)",
    description:
      "Statelessly offload local code generation, boilerplate writing, syntax checks, or test execution to the local Ornith 1.5 model running in RAM at $0.00. Use this to perform heavy grunt work without incurring cloud token costs or bloating the main conversation history.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Clear instructions for the local worker (e.g. 'Generate a ClickHouse SQL migration script for geo risk events' or 'Run pytest and return failing assertions').",
        },
        context: {
          type: "string",
          description: "Optional code snippet, file path, or schema details needed to complete the task.",
        },
      },
      required: ["task"],
    },
    execute: async (
      _callId: string,
      params: { task: string; context?: string },
      _signal: any,
      _onUpdate: any,
      ctx: PiContext
    ) => {
      const workerModel = workhorseTier.model || "ornith-1.5:ctx";
      const fullPrompt = `You are the local repository worker with direct read and bash access in this repository. Task: ${params.task}${params.context ? `\n\nContext / Files:\n${params.context}` : ""}\n\nInspect the files directly using your tools and provide a concise synthesis:`;

      // 1. Try running an isolated Pi sub-worker with local Ornith (has read/bash tools in current repo at $0.00)
      try {
        const { stdout, stderr } = await runPiWorker(
          [
            "--no-extensions",
            "--no-session",
            "--model", `ollama/${workerModel}`,
            "--tools", "read,bash",
            "-p", fullPrompt,
          ],
          60000
        );
        const raw = (stdout || stderr || "").trim();
        const reply = raw
          .split("\n")
          .filter(
            (line) =>
              !line.startsWith("[bedrock-mantle]") &&
              !line.startsWith("Warning:")
          )
          .join("\n")
          .trim();
        if (reply) {
          recordLedger({
            event: "workhorse_delegation",
            model: workerModel,
            provider: "ollama",
            actualUsd: 0,
            sonnetBaselineUsd: Number(((fullPrompt.length / 4 * 3.0 + reply.length / 4 * 15.0) / 1_000_000).toFixed(6)),
          });
          return {
            content: [
              {
                type: "text",
                text: `[Local Workhorse (${workerModel}) Synthesis ($0.00)]:\n${reply}`,
              },
            ],
          };
        }
      } catch {}

      // 2. Fallback to direct Ollama HTTP generation if sub-process fails
      try {
        const res = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: workerModel,
            prompt: fullPrompt,
            stream: false,
            options: {
              temperature: 0.2,
              num_predict: 2048,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
          const data: any = await res.json();
          const reply = String(data.response || "").trim();
          recordLedger({
            event: "workhorse_delegation",
            model: workerModel,
            provider: "ollama",
            actualUsd: 0,
            sonnetBaselineUsd: Number(((fullPrompt.length / 4 * 3.0 + reply.length / 4 * 15.0) / 1_000_000).toFixed(6)),
          });
          return {
            content: [
              {
                type: "text",
                text: `[Local Workhorse (${workerModel}) Result ($0.00)]:\n${reply}`,
              },
            ],
          };
        }
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `[Local Workhorse Error]: ${err.message}. Orchestrator should complete the task directly.`,
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: `[Local Workhorse]: No response returned.` }],
      };
    },
  });

  // --- 9. REGISTER DYNAMIC SKILL LOADER TOOL (AUTONOMOUS DISCOVERY) ---

  pi.registerTool({
    name: "load_skill",
    label: "Load Skill Workflow Instructions",
    description:
      "Dynamically load specialized workflow instructions for an installed skill (e.g., 'code-review', 'tdd', 'to-spec', 'to-tickets', 'diagnosing-bugs', 'domain-modeling', 'jira'). Call this when you need detailed domain instructions without polluting the default system prompt.",
    parameters: {
      type: "object",
      properties: {
        skill_name: {
          type: "string",
          description: "Name of the skill to load (e.g. 'tdd', 'code-review', 'to-spec', 'domain-modeling', 'diagnosing-bugs')",
        },
      },
      required: ["skill_name"],
    },
    execute: async (
      _callId: string,
      params: { skill_name: string },
      _signal: any,
      _onUpdate: any,
      ctx: PiContext
    ) => {
      const catalog = getSkillCatalog();
      const q = (params.skill_name || "").toLowerCase().trim();
      const found = catalog.find(
        (s) =>
          s.name.toLowerCase() === q ||
          s.triggers.includes(q) ||
          s.name.toLowerCase().includes(q)
      );
      if (!found) {
        const available = catalog.map((s) => s.name).slice(0, 20).join(", ");
        return {
          content: [
            {
              type: "text",
              text: `Skill "${params.skill_name}" not found. Available skills include: ${available}...`,
            },
          ],
        };
      }
      if (ctx?.hasUI) {
        ctx.ui.notify(`[Kobayashi]: Dynamically loaded skill: ${found.name}`, "info");
      }
      return {
        content: [
          {
            type: "text",
            text: `[SKILL: ${found.name.toUpperCase()}]\nDescription: ${found.description}\n\n${found.body}`,
          },
        ],
      };
    },
  });
}
