import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const execFileAsync = promisify(execFile);
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
    // Caps output at ~1500 tokens (6,000 chars) to prevent context window bloat and runaway token bills.
    const MAX_TOOL_CHARS = config?.compaction?.max_tool_chars || 6000;
    newContent = newContent.map((part) => {
      if (part.type === "text" && typeof part.text === "string" && part.text.length > MAX_TOOL_CHARS) {
        contentModified = true;
        const fullLen = part.text.length;
        const spillFile = join(SPILL_DIR, `spill_${Date.now()}_${event.toolName}.log`);
        try {
          writeFileSync(spillFile, part.text, "utf8");
        } catch {}
        const head = part.text.slice(0, 1500);
        const tail = part.text.slice(-2500);
        return {
          ...part,
          text: `${head}\n\n... [TRUNCATED ${fullLen - 4000} CHARACTERS BY KOBAYASHI TO PREVENT CONTEXT BLOAT. Full output saved to: ${spillFile}] ...\n\n${tail}`,
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

  // --- 4. TURN ORCHESTRATION & DYNAMIC TIER ROUTING ---

  pi.on("before_agent_start", async (event: any, ctx: PiContext) => {
    const text = (event.prompt || "").toLowerCase();

    // 1. Check explicit bracket overrides
    if (text.includes("[advisor]") || text.includes("/to-spec") || text.includes("/grill-me") || text.includes("[spec]")) {
      activeTier = "advisor";
    } else if (text.includes("[orchestrator]") || text.includes("/implement") || text.includes("/to-tickets")) {
      activeTier = "orchestrator";
    } else if (text.includes("[workhorse]") || text.includes("[local]") || text.includes("/tdd") || text.includes("[code]")) {
      activeTier = "workhorse";
    } else {
      // 2. System-1 Micro-Router: Fast (~40ms) stateless classification via local Ornith
      let routedBySystem1 = false;
      const rawPrompt = String(event.prompt || "").trim();
      if (rawPrompt.length > 5) {
        try {
          const modelName = workhorseTier?.model || "ornith-1.5:ctx";
          const classifyPrompt =
            `<|im_start|>system\nYou are a task classifier. Output ONLY the word ADVISOR or WORKHORSE.\n\n` +
            `Rules:\n` +
            `- ADVISOR: Any question asking "how to", "tell me", "explain", "guide", "what is", or designing a system/architecture/algorithm/new project from scratch.\n` +
            `- WORKHORSE: Editing existing code in the repository, fixing bugs in files, running tests, bash commands, git.\n<|im_end|>\n` +
            `<|im_start|>user\nTask: git status and run tests<|im_end|>\n` +
            `<|im_start|>assistant\n<think>\n</think>\nWORKHORSE<|im_end|>\n` +
            `<|im_start|>user\nTask: fix the null pointer exception in auth.ts<|im_end|>\n` +
            `<|im_start|>assistant\n<think>\n</think>\nWORKHORSE<|im_end|>\n` +
            `<|im_start|>user\nTask: How do we architect ClickHouse for 50M geo logs and what are the trade-offs?<|im_end|>\n` +
            `<|im_start|>assistant\n<think>\n</think>\nADVISOR<|im_end|>\n` +
            `<|im_start|>user\nTask: ${rawPrompt.slice(0, 300)}<|im_end|>\n` +
            `<|im_start|>assistant\n<think>\n</think>\n`;

          const res = await fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelName,
              prompt: classifyPrompt,
              raw: true,
              stream: false,
              options: {
                num_predict: 4,
                temperature: 0,
                stop: ["<|im_end|>", "\n", " "],
              },
            }),
            signal: AbortSignal.timeout(600),
          });

          if (res.ok) {
            const data: any = await res.json();
            const decision = String(data.response || "").trim().toUpperCase();
            if (decision.includes("ADVISOR")) {
              activeTier = "advisor";
              routedBySystem1 = true;
            } else if (decision.includes("WORKHORSE")) {
              activeTier = "workhorse";
              routedBySystem1 = true;
            }
            if (ctx?.hasUI) {
              ctx.ui.notify(`[System-1 Router]: Evaluated "${decision}" -> Tier: ${activeTier.toUpperCase()}`, "info");
            }
          }
        } catch (err: any) {
          if (ctx?.hasUI) {
            ctx.ui.notify(`[System-1 Router]: Ollama error (${err.message}), using fallback heuristic`, "warning");
          }
        }
      }

      // 3. Fallback heuristic if local Ollama is offline or timed out
      if (!routedBySystem1) {
        const isArchitecturePrompt =
          text.includes("how to") ||
          text.includes("tell me") ||
          text.includes("explain") ||
          text.includes("guide") ||
          text.includes("from scratch") ||
          text.includes("architecture") ||
          text.includes("clickhouse") ||
          text.includes("geo risk") ||
          text.includes("tradeoff") ||
          text.includes("dashboard") ||
          text.includes("pipeline") ||
          (text.includes("what is") && (text.includes("how to") || text.includes("using it")));

        if (isArchitecturePrompt) {
          activeTier = "advisor";
          if (ctx?.hasUI) {
            ctx.ui.notify(`[System-1 Fallback]: Promoted to ADVISOR (architecture keyword matched)`, "info");
          }
        }
      }
    }

    const tierCfg = getTierConfig(activeTier);
    if (tierCfg) {
      const model = ctx.modelRegistry.find(tierCfg.provider, tierCfg.model);
      if (model && ctx.model?.id !== model.id) {
        await pi.setModel(model);
        if (ctx?.hasUI) {
          ctx.ui.notify(`[Kobayashi]: Switched session model to ${tierCfg.provider}/${tierCfg.model}`, "info");
        }
      }
    }

    pendingTurn = {
      tier: activeTier,
      model: tierCfg?.model || ctx.model?.id || "unknown",
      provider: tierCfg?.provider || ctx.model?.provider || "unknown",
    };
    turnsRecordedThisRun = 0;
    setStatusBadge(ctx, pendingTurn.model);

    // Inject explicit guidance for local models about call_advisor & switch_tier
    const guidance =
      `\n\n[KOBAYASHI HARNESS GUIDELINES]:` +
      `\n- Active Model: ${pendingTurn.model} (Tier: ${activeTier.toUpperCase()})` +
      `\n- Frontier Advisor Tool (\`call_advisor\`): If you need architectural guidance, technology explanations, or encounter hard errors, call \`call_advisor\` to consult Claude Sonnet 5.5 statelessly.` +
      `\n- Tier Switcher Tool (\`switch_tier\`): If this task requires full frontier reasoning across many files, call \`switch_tier\` to promote to 'advisor' or 'orchestrator'.`;

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
      const fullPrompt = `${params.task}\n\nContext:\n${params.context || "None"}\n\nProvide the code or solution concisely:`;
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
          signal: AbortSignal.timeout(60000),
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
}
