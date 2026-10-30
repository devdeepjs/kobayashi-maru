import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { appendFileSync, readFileSync, existsSync } from "node:fs";

const execFileAsync = promisify(execFile);
const PI_DIR = join(homedir(), ".pi", "agent");
const LEDGER_PATH = join(PI_DIR, "savings-ledger.jsonl");
const CONFIG_PATH = join(PI_DIR, "kobayashi-config.json");

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
    provider: "bedrock-mantle",
    model: "openai.gpt-5.6-luna",
    cost: { input: 0.22, output: 1.32, cache_read: 0.02, cache_write: 0.22 },
  };

  const workhorseTier = config?.tiers?.workhorse || {
    provider: "ollama",
    model: "ornith-1.5:ctx",
    cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  };

  const localTier = config?.tiers?.local || workhorseTier;

  let activeTier: "advisor" | "orchestrator" | "workhorse" | "local" =
    config?.starting_tier || "orchestrator";
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

  // --- 2. SECURITY FIREWALL HOOK (Layer 1 + Layer 2) ---

  pi.on("tool_call", async (event: any, _ctx: PiContext) => {
    if (event.toolName === "bash") {
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

  // --- 3. TEST / BASH FAILURE ESCALATION CIRCUIT BREAKER ---

  pi.on("tool_result", async (event: any, ctx: PiContext) => {
    if (event.toolName === "bash") {
      if (event.isError) {
        consecutiveBashFailures++;
      } else {
        consecutiveBashFailures = 0;
      }
      setStatusBadge(ctx, ctx.model?.id || "unknown");
    }
  });

  // --- 4. TURN ORCHESTRATION & DYNAMIC TIER SWITCHING ---

  pi.on("before_agent_start", async (event: any, ctx: PiContext) => {
    const text = (event.prompt || "").toLowerCase();

    // Check explicit tier overrides in user prompt
    if (text.includes("[advisor]") || text.includes("/to-spec") || text.includes("/grill-me")) {
      activeTier = "advisor";
    } else if (text.includes("[orchestrator]") || text.includes("/implement") || text.includes("/to-tickets")) {
      activeTier = "orchestrator";
    } else if (text.includes("[workhorse]") || text.includes("[local]") || text.includes("/tdd")) {
      activeTier = "workhorse";
    }

    const tierCfg = getTierConfig(activeTier);
    if (tierCfg && ctx.hasUI) {
      const model = ctx.modelRegistry.find(tierCfg.provider, tierCfg.model);
      if (model && ctx.model?.id !== model.id) {
        await pi.setModel(model);
      }
    }

    pendingTurn = {
      tier: activeTier,
      model: tierCfg?.model || ctx.model?.id || "unknown",
      provider: tierCfg?.provider || ctx.model?.provider || "unknown",
    };
    turnsRecordedThisRun = 0;
    setStatusBadge(ctx, pendingTurn.model);

    // If consecutive failures reached threshold, alert agent to escalate to Frontier Advisor
    const threshold = config?.router?.escalation_threshold || 2;
    if (consecutiveBashFailures >= threshold) {
      return {
        systemPrompt:
          event.systemPrompt +
          `\n\n[CIRCUIT BREAKER TRIGGERED: ${consecutiveBashFailures} Consecutive Failures]\n` +
          `Do NOT continue brute-force trial and error. Immediately call the \`call_advisor\` tool with the exact error output and minimal code snippet (<50 lines) to receive a root-cause fix from Claude Sonnet 5.5 without inflating token cost.`,
      };
    }
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
      (input * (cost.input ?? 0.22) +
        cacheRead * (cost.cache_read ?? 0.02) +
        cacheWrite * (cost.cache_write ?? 0.22) +
        output * (cost.output ?? 1.32)) /
      1_000_000;

    // Claude Code baseline rate (Claude Sonnet 3.5/3.7 direct pricing: $3/$15, no prompt caching or 1.25x write)
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

  // --- 6. REGISTER STATELESS ADVISOR ESCALATION TOOL ---

  pi.registerTool({
    name: "call_advisor",
    label: "Consult Frontier Advisor (Claude Sonnet 5.5)",
    description:
      "Stateless escalation to Frontier Advisor (Claude Sonnet 5.5 via AWS Bedrock). Use when encountering hard architectural choices, concurrency bugs, or repeated test failures. Transmits an isolated ~500-token problem summary rather than the full session context, saving 95%+ on token costs.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Clear 1-2 sentence summary of what the agent is attempting to solve.",
        },
        question: {
          type: "string",
          description: "The specific architectural or root-cause question.",
        },
        code_snippet: {
          type: "string",
          description: "Minimal relevant code snippet (under 50 lines).",
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
      const prompt = `You are the Principal Staff Architect Advisor (Stateless Consultation). Provide a surgical diagnosis and exact code solution for the implementation agent.\n\nSummary:\n${params.summary}\n\nQuestion:\n${params.question}${params.code_snippet ? `\n\nCode Snippet:\n\`\`\`\n${params.code_snippet}\n\`\`\`` : ""}`;
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
}
