import fs from "fs";
import path from "path";
import chalk from "chalk";
import { input, select, confirm } from "@inquirer/prompts";
import { logger } from "../../utils/logger.js";
import { loadVirtualModelConfig, CustomVirtualModelSpec } from "../../../bottom-up-router.js";
import { checkOllama, discoverPiModels, DiscoveredModel } from "../../utils/system.js";

const HOME = process.env.HOME || "";
const CONFIG_PATH = path.join(HOME, ".pi", "agent", "virtual-models.json");
const SETTINGS_PATH = path.join(HOME, ".pi", "agent", "settings.json");

/**
 * Lists all active built-in and user-defined virtual models
 */
export async function listVirtualModels(): Promise<void> {
  const config = loadVirtualModelConfig();

  console.log(chalk.bold("\n⚔️ Kobayashi Maru Active Virtual Models Catalog\n"));

  console.log(chalk.cyan("── Built-in Standard Virtual Models ────────────────────────────────────"));
  console.log(
    `  • ${chalk.bold.green("auto/planner-worker")} ${chalk.dim("(Default)")}\n` +
    `    Policy:  ${chalk.yellow("Top-Down")} (Planner reasons Turn 1 -> Worker executes Turn 2+ -> Planner escalates)\n` +
    `    Planner: ${chalk.bold(config.planner.provider + "/" + config.planner.model)} [${config.planner.thinking || "medium"}]\n` +
    `    Worker:  ${chalk.bold(config.worker.provider + "/" + config.worker.model)} [${config.worker.thinking || "off"}] ($0.00 compute)\n`
  );

  console.log(
    `  • ${chalk.bold.green("auto/bottom-up")}\n` +
    `    Policy:  ${chalk.yellow("Bottom-Up")} (Local Worker executes at $0 compute -> Planner escalates on error)\n` +
    `    Worker:  ${chalk.bold(config.worker.provider + "/" + config.worker.model)} [${config.worker.thinking || "off"}] ($0.00 compute)\n` +
    `    Planner: ${chalk.bold(config.planner.provider + "/" + config.planner.model)} [${config.planner.thinking || "medium"}]\n`
  );

  const customEntries = Object.entries(config.custom || {});
  if (customEntries.length > 0) {
    console.log(chalk.cyan(`── User Custom Virtual Models (${customEntries.length}) ───────────────────────────────────────`));
    for (const [id, spec] of customEntries) {
      const fullId = `${spec.provider || "auto"}/${id}`;
      const policyLabel = spec.policy === "bottom-up" ? "Bottom-Up (Worker first)" : "Top-Down (Planner first)";
      console.log(
        `  • ${chalk.bold.magenta(fullId)} — ${chalk.bold(spec.name || id)}\n` +
        `    Policy:    ${chalk.yellow(policyLabel)}\n` +
        `    Planner:   ${chalk.bold(spec.planner.provider + "/" + spec.planner.model)} [${spec.planner.thinking || "medium"}]\n` +
        `    Worker:    ${chalk.bold(spec.worker.provider + "/" + spec.worker.model)} [${spec.worker.thinking || "off"}]\n` +
        `    Threshold: ${spec.escalationThreshold || config.escalationThreshold} consecutive failures\n`
      );
    }
  } else {
    console.log(chalk.dim("  No custom virtual models defined yet. Run 'kobayashi virtual add' to create one.\n"));
  }
}

/**
 * Interactive creation of user custom virtual model
 */
export async function createVirtualModel(options: {
  id?: string;
  name?: string;
  planner?: string;
  worker?: string;
  policy?: "planner-worker" | "bottom-up";
  threshold?: number;
  makeDefault?: boolean;
}): Promise<void> {
  logger.banner();
  console.log(chalk.bold("  Kobayashi Custom Virtual Model Creator\n"));
  console.log(chalk.dim("  Pair ANY frontier planner with ANY local workhorse model under your own model ID.\n"));

  let id = options.id;
  if (!id) {
    id = await input({
      message: "Virtual Model ID (e.g. speed-coder, deep-pair, haiku-qwen):",
      validate: (val) => {
        const cleaned = val.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
        if (!cleaned) return "ID cannot be empty";
        if (cleaned === "planner-worker" || cleaned === "bottom-up") return "ID cannot overwrite built-in standard models";
        return true;
      },
    });
  }
  id = id.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");

  let name = options.name;
  if (!name) {
    name = await input({
      message: "Friendly Display Name:",
      default: `Custom Router (${id})`,
    });
  }

  let planner = options.planner;
  if (!planner) {
    planner = await input({
      message: "Planner Model (provider/model, e.g. bedrock-mantle/openai.gpt-5.6-luna or anthropic/claude-3-7-sonnet-20250219):",
      default: "bedrock-mantle/openai.gpt-5.6-luna",
    });
  }

  let worker = options.worker;
  if (!worker) {
    worker = await input({
      message: "Worker Model (provider/model, e.g. ollama/ornith-1.5:ctx or ollama/qwen2.5-coder:14b-16k):",
      default: "ollama/ornith-1.5:ctx",
    });
  }

  let policy = options.policy;
  if (!policy) {
    policy = await select({
      message: "Routing Policy:",
      choices: [
        {
          name: "Top-Down (Planner reasons Turn 1 -> Worker executes Turn 2+ -> Planner escalates on error)",
          value: "planner-worker" as const,
        },
        {
          name: "Bottom-Up (Local Worker executes first at $0 compute -> Auto-escalate to Planner on error)",
          value: "bottom-up" as const,
        },
      ],
    });
  }

  let threshold = options.threshold;
  if (!threshold) {
    threshold = 2;
  }

  // Load existing virtual-models.json or create initial
  let rawData: any = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      rawData = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    }
  } catch {}

  if (!rawData.custom) rawData.custom = {};

  rawData.custom[id] = {
    name,
    provider: "auto",
    planner,
    worker,
    policy,
    escalationThreshold: threshold,
  };

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(rawData, null, 2) + "\n");

  const fullModelId = `auto/${id}`;
  console.log(chalk.green(`\n✔ Custom Virtual Model registered successfully: ${chalk.bold(fullModelId)}`));
  console.log(chalk.dim(`  Saved to: ${CONFIG_PATH}`));

  // Offer to set as default in settings.json
  let setAsDefault = options.makeDefault;
  if (setAsDefault === undefined && process.stdout.isTTY) {
    setAsDefault = await confirm({
      message: `Set ${fullModelId} as your default Pi model in settings.json?`,
      default: false,
    });
  }

  if (setAsDefault) {
    try {
      let settings: any = {};
      if (fs.existsSync(SETTINGS_PATH)) {
        settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
      }
      settings.defaultProvider = "auto";
      settings.defaultModel = id;
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
      console.log(chalk.green(`✔ Updated default model to ${chalk.bold(fullModelId)} in ${SETTINGS_PATH}`));
    } catch (err: any) {
      console.log(chalk.yellow(`Could not update settings.json: ${err.message}`));
    }
  }

  console.log(chalk.bold("\n🚀 How to use your new virtual model:"));
  console.log(`  ${chalk.cyan(`pi --model ${fullModelId}`)}`);
  console.log(`  ${chalk.dim(`or inside Pi interactive mode, type /model and select ${fullModelId}\n`)}`);
}

/**
 * Main command dispatcher for 'kobayashi virtual'
 */
export async function virtualCommand(
  action?: string,
  extraId?: string,
  options: {
    id?: string;
    name?: string;
    planner?: string;
    worker?: string;
    policy?: "planner-worker" | "bottom-up";
    threshold?: string;
    default?: boolean;
  } = {}
): Promise<void> {
  const sub = (action || "list").toLowerCase();

  if (sub === "list" || sub === "ls") {
    await listVirtualModels();
    return;
  }

  const targetId = extraId || options.id || (sub !== "add" && sub !== "create" && sub !== "new" ? action : undefined);
  const thresholdNum = options.threshold ? parseInt(options.threshold, 10) : undefined;

  await createVirtualModel({
    id: targetId,
    name: options.name,
    planner: options.planner,
    worker: options.worker,
    policy: options.policy,
    threshold: thresholdNum,
    makeDefault: options.default,
  });
}

/**
 * Interactive / dynamic model switcher (discovers live available models with zero hardcoding)
 */
export async function switchCommand(
  target?: string,
  _options: { direct?: boolean } = {}
): Promise<void> {
  const discovered = discoverPiModels();
  const allChoices: { name: string; value: string }[] = [];

  // 1. Virtual models from virtual-models.json
  allChoices.push({ name: "auto/planner-worker [Hybrid] (Planner -> Local RAM Workhorse)", value: "auto/planner-worker" });
  allChoices.push({ name: "auto/bottom-up [Hybrid] ($0 Local RAM first -> Planner Escalator)", value: "auto/bottom-up" });

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const c = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      if (c.custom && typeof c.custom === "object") {
        for (const [id, spec] of Object.entries(c.custom)) {
          allChoices.push({ name: `auto/${id} [Custom Virtual] (${(spec as any).name || id})`, value: `auto/${id}` });
        }
      }
    }
  } catch {}

  // 2. Dynamically discovered live models from active providers
  for (const m of discovered) {
    const fullId = `${m.provider}/${m.id}`;
    if (!allChoices.some(c => c.value === fullId)) {
      allChoices.push({
        name: `${fullId} [${m.provider}] (${m.context || ""} ctx)`,
        value: fullId,
      });
    }
  }

  let selected = target?.trim();
  if (selected) {
    const q = selected.toLowerCase();
    const match = allChoices.find(c =>
      c.value.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      (q === "virtual" && c.value.startsWith("auto/"))
    );
    if (match) {
      selected = match.value;
    } else {
      logger.error(`No available model found matching "${target}". Run 'kobayashi switch' without args to browse.`);
      return;
    }
  } else {
    selected = await select({
      message: "Select Active Model / Virtual Powertrain:",
      choices: allChoices,
    });
  }

  try {
    const parts = selected.split("/");
    const provider = parts[0];
    const id = parts.slice(1).join("/");

    let settings: any = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      try { settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")); } catch {}
    }
    settings.defaultProvider = provider;
    settings.defaultModel = id;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    logger.success(`Default model set to ${chalk.bold.green(selected)} in ~/.pi/agent/settings.json`);
    console.log(chalk.dim(`  Run: pi`));
  } catch (err: any) {
    logger.error(`Failed to update settings: ${err.message}`);
  }
}
