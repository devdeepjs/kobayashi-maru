import fs from "fs";
import path from "path";
import yaml from "yaml";
import chalk from "chalk";
import { search, select, input, confirm } from "@inquirer/prompts";
import { logger } from "../../utils/logger.js";
import { checkOllama, discoverPiModels, DiscoveredModel } from "../../utils/system.js";
import { applyCommand } from "./apply.js";
import { loadConfig } from "../../config/parser.js";

// ---------------------------------------------------------------------------
// Set user identity name in virtual-models.json (read by before_agent_start)
// Usage: kobayashi config set-name "Deepanshu"
// Also export KOBAYASHI_USER="Deepanshu" for session-only override
// ---------------------------------------------------------------------------
export async function setNameCommand(name?: string): Promise<void> {
  const vcPath = path.join(process.env.HOME || "", ".pi", "agent", "virtual-models.json");
  let resolvedName = name?.trim();

  if (!resolvedName) {
    resolvedName = await input({
      message: "Enter your name (Pi will address you by this in every session):",
      validate: (v) => v.trim().length > 0 || "Name cannot be empty",
    });
    resolvedName = resolvedName.trim();
  }

  let config: Record<string, any> = {};
  if (fs.existsSync(vcPath)) {
    try { config = JSON.parse(fs.readFileSync(vcPath, "utf8")); } catch {}
  }

  config.userName = resolvedName;
  fs.mkdirSync(path.dirname(vcPath), { recursive: true });
  fs.writeFileSync(vcPath, JSON.stringify(config, null, 2));

  logger.success(`Identity set: Pi will now address you as "${resolvedName}" in every session.`);
  console.log(chalk.dim(`  Stored in: ${vcPath}`));
  console.log(chalk.dim(`  One-session override: export KOBAYASHI_USER="${resolvedName}"`));
}

interface SearchChoice {
  name: string;
  value: string;
  description?: string;
}

/**
 * Formats a discovered model for the real-time search list
 */
function formatModelChoice(m: DiscoveredModel): SearchChoice {
  const fullId = `${m.provider}/${m.id}`;
  const is55 = m.id.includes("5-5") || m.id.includes("5.5");
  const isLuna = m.id.includes("luna");
  const isLocal = m.provider === "ollama";

  let tag = "";
  if (is55) tag = chalk.bold.green(" [5.5 Gen]");
  else if (isLuna) tag = chalk.bold.cyan(" [Luna Cached]");
  else if (isLocal) tag = chalk.bold.yellow(" ($0.00 Local RAM)");

  const ctxInfo = m.context ? chalk.dim(` (${m.context} ctx)`) : "";

  return {
    name: `${fullId}${tag}${ctxInfo}`,
    value: fullId,
    description: `Provider: ${m.provider} • Max Output: ${m.maxOut} • Thinking: ${m.thinking ? "Yes" : "No"}`,
  };
}

export async function configCommand(options: {
  advisor?: string;
  advisorThinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  advisorFallback?: string;
  orchestrator?: string;
  orchestratorThinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  orchestratorFallback?: string;
  workhorse?: string;
  workhorseThinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  workhorseFallback?: string;
  startingTier?: "advisor" | "orchestrator" | "workhorse";
}): Promise<void> {
  logger.banner();
  console.log(chalk.bold("  Kobayashi Complete Multi-Tier & Fallback Configurator\n"));

  const configPath = path.resolve(process.cwd(), "harness.yaml");
  const currentConfig = loadConfig(configPath);

  // 1. Live discovery of all active models registered on the machine
  const discovered = discoverPiModels();

  // Also query Ollama local models directly
  const ollamaStatus = await checkOllama();
  const localModelNames = ollamaStatus.details?.models || ["ornith-1.5:ctx"];
  for (const lm of localModelNames) {
    if (!discovered.some((m) => m.provider === "ollama" && m.id === lm)) {
      discovered.unshift({
        provider: "ollama",
        id: lm,
        context: "32K",
        maxOut: "8.2K",
        thinking: true,
      });
    }
  }

  console.log(
    chalk.cyan(
      `✔ Discovered ${chalk.bold(discovered.length)} active models across Ollama, Bedrock, and Mantle.\n` +
      `  ${chalk.dim("(Type any keyword like '5.5', 'luna', 'sonnet', 'deepseek', 'ornith' to filter in real time)")}\n`
    )
  );

  const allChoices: SearchChoice[] = discovered.map(formatModelChoice);

  // Top curated defaults for quick display before typing
  const priorityAdvisorIds = [
    "amazon-bedrock/us.anthropic.claude-sonnet-5-5",
    "amazon-bedrock/anthropic.claude-sonnet-5-5",
    "amazon-bedrock/us.anthropic.claude-opus-5-5",
    "amazon-bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "bedrock-mantle/anthropic.claude-opus-5-5",
  ];

  const priorityOrchestratorIds = [
    "bedrock-mantle/openai.gpt-5.6-luna",
    "amazon-bedrock/us.openai.gpt-6-luna",
    "amazon-bedrock/us.anthropic.claude-haiku-5-5",
    "amazon-bedrock/anthropic.claude-haiku-5-5",
    "bedrock-mantle/openai.gpt-5.6-sol",
    "amazon-bedrock/deepseek.v3.2",
  ];

  const priorityWorkhorseIds = [
    "ollama/ornith-1.5:ctx",
    ...localModelNames.map((m: string) => `ollama/${m}`),
  ];

  // Helper function for real-time searchable model prompt
  const promptSearchModel = async (
    roleTitle: string,
    priorityIds: string[],
    fallbackDefault: string
  ): Promise<string> => {
    const initialChoices = [
      ...priorityIds
        .map((pid) => allChoices.find((c) => c.value === pid))
        .filter((c): c is SearchChoice => Boolean(c)),
      ...allChoices.filter((c) => !priorityIds.includes(c.value)).slice(0, 10),
    ];

    return await search({
      message: `Search and select ${roleTitle}:`,
      source: async (term?: string) => {
        if (!term || term.trim() === "") {
          return initialChoices;
        }

        const q = term.toLowerCase().trim();
        const matches = allChoices.filter(
          (c) =>
            c.value.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        );

        if (matches.length === 0) {
          return [
            {
              name: chalk.yellow(`Use custom: "${term}"`),
              value: term,
              description: "Manually specify this exact provider/model string",
            },
          ];
        }

        return matches.slice(0, 20);
      },
    });
  };

  type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

  const promptThinkingLevel = async (
    roleTitle: string,
    defaultLevel: ThinkingLevel
  ): Promise<ThinkingLevel> => {
    return await select<ThinkingLevel>({
      message: `Default thinking / reasoning level for ${roleTitle}:`,
      default: defaultLevel,
      choices: [
        { name: "high    (16k-32k tokens: Deep architectural reasoning & tricky debugging)", value: "high" },
        { name: "medium  (2k-4k tokens: Balanced planning & multi-file synthesis)", value: "medium" },
        { name: "low     (500-1k tokens: Fast execution, minimal reasoning tokens)", value: "low" },
        { name: "off     (0 tokens: Direct instant response, zero reasoning tokens)", value: "off" },
        { name: "minimal (100-250 tokens: Ultra-brief reasoning)", value: "minimal" },
        { name: "xhigh   (32k-64k tokens: Extended reasoning budget)", value: "xhigh" },
        { name: "max     (Maximum reasoning budget supported by model)", value: "max" },
      ],
    });
  };

  let selectedAdvisor = options.advisor;
  let selectedAdvisorThinking = options.advisorThinking;
  let selectedAdvisorFallback = options.advisorFallback;
  let selectedOrchestrator = options.orchestrator;
  let selectedOrchestratorThinking = options.orchestratorThinking;
  let selectedOrchestratorFallback = options.orchestratorFallback;
  let selectedWorkhorse = options.workhorse;
  let selectedWorkhorseThinking = options.workhorseThinking;
  let selectedWorkhorseFallback = options.workhorseFallback;
  let selectedStartingTier = options.startingTier;

  // --- ADVISOR SELECTION ---
  if (!selectedAdvisor) {
    selectedAdvisor = await promptSearchModel(
      "Primary Frontier Advisor (Turn 1 specs & tough blockers)",
      priorityAdvisorIds,
      "amazon-bedrock/us.anthropic.claude-sonnet-5-5"
    );
  }
  if (!selectedAdvisorThinking) {
    selectedAdvisorThinking = await promptThinkingLevel(
      `Advisor (${selectedAdvisor})`,
      currentConfig.tiers.advisor?.thinking || "high"
    );
  }
  if (!selectedAdvisorFallback) {
    selectedAdvisorFallback = await promptSearchModel(
      "Fallback Advisor (Used if primary throttles / 429)",
      ["amazon-bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0", ...priorityAdvisorIds],
      "amazon-bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    );
  }

  // --- ORCHESTRATOR SELECTION ---
  if (!selectedOrchestrator) {
    selectedOrchestrator = await promptSearchModel(
      "Primary Orchestrator (Multi-file tickets, 1M context, planning)",
      priorityOrchestratorIds,
      "bedrock-mantle/openai.gpt-5.6-luna"
    );
  }
  if (!selectedOrchestratorThinking) {
    selectedOrchestratorThinking = await promptThinkingLevel(
      `Orchestrator (${selectedOrchestrator})`,
      currentConfig.tiers.orchestrator?.thinking || "medium"
    );
  }
  if (!selectedOrchestratorFallback) {
    selectedOrchestratorFallback = await promptSearchModel(
      "Fallback Orchestrator (Used if primary throttles / 429)",
      ["amazon-bedrock/us.anthropic.claude-haiku-5-5", ...priorityOrchestratorIds],
      "amazon-bedrock/us.anthropic.claude-haiku-5-5"
    );
  }

  // --- WORKHORSE SELECTION ---
  if (!selectedWorkhorse) {
    selectedWorkhorse = await promptSearchModel(
      "Primary Workhorse (Routine tests, grep, local edits)",
      priorityWorkhorseIds,
      "ollama/ornith-1.5:ctx"
    );
  }
  if (!selectedWorkhorseThinking) {
    selectedWorkhorseThinking = await promptThinkingLevel(
      `Workhorse (${selectedWorkhorse})`,
      currentConfig.tiers.workhorse?.thinking || "low"
    );
  }
  if (!selectedWorkhorseFallback) {
    selectedWorkhorseFallback = await promptSearchModel(
      "Fallback Workhorse (Secondary local model)",
      ["ollama/ornith-1.5:9b", ...priorityWorkhorseIds],
      "ollama/ornith-1.5:9b"
    );
  }

  // --- STARTING TIER SELECTION ---
  if (!selectedStartingTier) {
    selectedStartingTier = await select({
      message: "Which tier should handle Turn 1 by default (when session starts)?",
      choices: [
        {
          name: "Orchestrator (Recommended - plans with 1M context before workhorse runs)",
          value: "orchestrator",
        },
        {
          name: "Advisor (Frontier reasoning - best for specs and tough requirements)",
          value: "advisor",
        },
        {
          name: "Workhorse (Instant $0.00 local model in RAM)",
          value: "workhorse",
        },
      ],
    });
  }

  // Helper to split "provider/model"
  const parseModelStr = (full: string) => {
    const slashIdx = full.indexOf("/");
    if (slashIdx === -1) return { provider: "custom" as const, model: full };
    return {
      provider: full.slice(0, slashIdx) as any,
      model: full.slice(slashIdx + 1),
    };
  };

  const advParsed = parseModelStr(selectedAdvisor);
  const orchParsed = parseModelStr(selectedOrchestrator);
  const wrkParsed = parseModelStr(selectedWorkhorse);

  // Update configuration object with primary AND fallback models
  const updatedYaml = {
    ...currentConfig,
    starting_tier: selectedStartingTier,
    tiers: {
      advisor: {
        provider: advParsed.provider,
        model: advParsed.model,
        fallback_model: selectedAdvisorFallback,
        thinking: selectedAdvisorThinking || "high",
        fallback_thinking: selectedAdvisorThinking || "high",
        name: `Advisor (${advParsed.model})`,
        context_window: 1000000,
        max_tokens: 128000,
        reasoning: true,
        temperature: 0.2,
        mode: "stateless",
        max_turns_per_task: 2,
      },
      orchestrator: {
        provider: orchParsed.provider,
        model: orchParsed.model,
        fallback_model: selectedOrchestratorFallback,
        thinking: selectedOrchestratorThinking || "medium",
        fallback_thinking: "low",
        name: `Orchestrator (${orchParsed.model})`,
        context_window: 1050000,
        max_tokens: 65536,
        reasoning: true,
        temperature: 0.2,
        cost: { input: 0.22, output: 1.32, cache_read: 0.02, cache_write: 0.22 },
      },
      workhorse: {
        provider: wrkParsed.provider,
        model: wrkParsed.model,
        fallback_model: selectedWorkhorseFallback,
        thinking: selectedWorkhorseThinking || "low",
        fallback_thinking: "off",
        name: `Workhorse (${wrkParsed.model})`,
        context_window: 32768,
        temperature: 0.1,
        cost: { input: 0.0, output: 0.0, cache_read: 0.0, cache_write: 0.0 },
      },
    },
  };

  fs.writeFileSync(configPath, yaml.stringify(updatedYaml));
  logger.success("Updated harness.yaml successfully!");

  // Compile and synchronize Pi runtime
  console.log(chalk.bold("\nRe-synchronizing Pi runtime configurations..."));
  await applyCommand({ config: configPath });

  console.log(chalk.bold.green("\n✔ Multi-Tier Hierarchy with Resilient Fallbacks Active!"));
  console.log(`  • Starting Tier: ${chalk.bold.magenta(selectedStartingTier.toUpperCase())}`);
  console.log(
    `  • Advisor:       ${chalk.cyan(selectedAdvisor)} [thinking: ${chalk.yellow(selectedAdvisorThinking)}] ${chalk.dim(`(Fallback: ${selectedAdvisorFallback})`)}`
  );
  console.log(
    `  • Orchestrator:  ${chalk.cyan(selectedOrchestrator)} [thinking: ${chalk.yellow(selectedOrchestratorThinking)}] ${chalk.dim(`(Fallback: ${selectedOrchestratorFallback})`)}`
  );
  console.log(
    `  • Workhorse:     ${chalk.cyan(selectedWorkhorse)} [thinking: ${chalk.yellow(selectedWorkhorseThinking)}] ${chalk.dim(`(Fallback: ${selectedWorkhorseFallback})`)}`
  );
  console.log(chalk.dim("\nTip: Press Ctrl+P inside Pi anytime to switch seamlessly between these models."));
}
