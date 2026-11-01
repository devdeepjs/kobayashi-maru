import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "node:url";
import { KobayashiConfig, TierModel } from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CompiledPiConfigs {
  modelsJson: Record<string, any>;
  settingsJson: Record<string, any>;
  solPiJson: Record<string, any>;
  rawConfig: KobayashiConfig;
  targetDir: string;
}

/**
 * Compiles a KobayashiConfig into Pi's native runtime configurations
 */
export function compileConfig(config: KobayashiConfig): CompiledPiConfigs {
  const piAgentDir = path.join(os.homedir(), ".pi", "agent");

  // 1. Build models.json (registers local Ollama models with camelCase keys for Pi schema)
  const ollamaModels: any[] = [];
  const candidateTiers = [
    config.tiers.local,
    config.tiers.workhorse,
    config.tiers.orchestrator,
    config.tiers.advisor,
  ].filter((t): t is TierModel => Boolean(t));

  for (const tier of candidateTiers) {
    if (tier.provider === "ollama") {
      if (!ollamaModels.some((m) => m.id === tier.model)) {
        ollamaModels.push({
          id: tier.model,
          name: tier.name || tier.model,
          contextWindow: tier.context_window,
          maxTokens: tier.max_tokens,
          reasoning: tier.reasoning,
          cost: {
            input: tier.cost.input,
            output: tier.cost.output,
            cacheRead: tier.cost.cache_read,
            cacheWrite: tier.cost.cache_write,
          },
        });
      }
    }

    // Register fallback models if they are Ollama models
    if (tier.fallback_model && (tier.fallback_model.startsWith("ollama/") || (!tier.fallback_model.includes("/") && tier.provider === "ollama"))) {
      const fbId = tier.fallback_model.replace(/^ollama\//, "");
      if (!ollamaModels.some((m) => m.id === fbId)) {
        ollamaModels.push({
          id: fbId,
          name: `${tier.name || fbId} (Fallback)`,
          contextWindow: tier.context_window,
          maxTokens: tier.max_tokens,
          reasoning: tier.reasoning,
          cost: {
            input: tier.cost.input,
            output: tier.cost.output,
            cacheRead: tier.cost.cache_read,
            cacheWrite: tier.cost.cache_write,
          },
        });
      }
    }
  }

  const modelsJson = {
    $schema: "https://pi.dev/schemas/models.schema.json",
    providers: {
      ollama: {
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        apiKey: "ollama",
        models: ollamaModels,
      },
    },
  };

  // 2. Build settings.json (packages, tools, enabled models with thinking levels, compaction)
  const packages = [
    "git:github.com/NVlabs/SoL-Pi",
    "npm:pi-bedrock-mantle",
    "npm:pi-usage-dashboard",
    "npm:pi-stats-dashboard",
  ];

  const defaultTools = ["read", "bash", "edit", "write"];
  if (config.security.sandbox === "codemode") {
    defaultTools.push("+codemode");
  }

  const VALID_THINKING = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  function withThinking(id: string, thinking?: string): string {
    if (!thinking || id.startsWith("bedrock-mantle/")) return id;
    if (VALID_THINKING.some((lvl) => id.endsWith(`:${lvl}`))) {
      return id;
    }
    return `${id}:${thinking}`;
  }

  const enabledModels: string[] = [];
  const allTiers = [
    config.tiers.advisor,
    config.tiers.orchestrator,
    config.tiers.workhorse,
    config.tiers.local,
  ].filter((t): t is TierModel => Boolean(t));

  for (const t of allTiers) {
    // Primary model with explicit thinking level shorthand (e.g. provider/id:high)
    const primaryRaw = `${t.provider}/${t.model}`;
    const primaryId = withThinking(primaryRaw, t.thinking);
    if (!enabledModels.includes(primaryId)) {
      enabledModels.push(primaryId);
    }

    // Fallback model with thinking level
    if (t.fallback_model) {
      const fbRaw = t.fallback_model.startsWith(`${t.provider}/`) || t.fallback_model.includes("/")
        ? t.fallback_model
        : `${t.provider}/${t.fallback_model}`;
      const fbThinking = t.fallback_thinking || t.thinking || "medium";
      const fbId = withThinking(fbRaw, fbThinking);
      if (!enabledModels.includes(fbId)) {
        enabledModels.push(fbId);
      }
    }
  }

  // Determine starting model based on starting_tier
  let startingTierModel: TierModel = config.tiers.workhorse;
  if (config.starting_tier === "advisor" && config.tiers.advisor) {
    startingTierModel = config.tiers.advisor;
  } else if (config.starting_tier === "orchestrator" && config.tiers.orchestrator) {
    startingTierModel = config.tiers.orchestrator;
  } else if (config.starting_tier === "local" && config.tiers.local) {
    startingTierModel = config.tiers.local;
  }

  const settingsJson = {
    $schema: "https://pi.dev/schemas/settings.schema.json",
    packages: Array.from(new Set(packages)),
    defaultProvider: startingTierModel.provider,
    defaultModel: startingTierModel.model,
    defaultThinkingLevel: startingTierModel.thinking || "medium",
    defaultTools,
    enabledModels,
    cacheWarming: "streaming",
    showCacheMissNotices: true,
    quietStartup: "header",
    doubleEscapeAction: "tree",
    treeFilterMode: "default",
    "codemode.mode": "on",
    "codemode.inlineBudget": 2500,
    "markdown.mermaid": "streaming",
    fullscreenCopyOnSelect: true,
    compaction: {
      enabled: true,
      reserveTokens: config.efficiency.compaction.reserve_tokens || 16384,
      keepRecentTokens: 20000,
    },
    retry: {
      enabled: true,
      maxRetries: 3,
    },
  };

  // 3. Build sol-pi.json (NVIDIA SoL-Pi token compression)
  const solPiJson = {
    version: 1,
    actionFusion: config.efficiency.sol_pi.action_fusion,
    observationPack: config.efficiency.sol_pi.observation_pack,
    evidencePreservingReducer: config.efficiency.sol_pi.evidence_preserving_reducer,
    onlineContextCompact: config.efficiency.sol_pi.online_context_compact,
    cacheWriteReadRatio: config.efficiency.sol_pi.cache_write_read_ratio,
  };

  return {
    modelsJson,
    settingsJson,
    solPiJson,
    rawConfig: config,
    targetDir: piAgentDir,
  };
}

/**
 * Writes compiled configs directly into ~/.pi/agent/
 */
export function writePiConfigs(compiled: CompiledPiConfigs): void {
  fs.mkdirSync(compiled.targetDir, { recursive: true });

  const modelsPath = path.join(compiled.targetDir, "models.json");
  const settingsPath = path.join(compiled.targetDir, "settings.json");
  const solPiPath = path.join(compiled.targetDir, "sol-pi.json");
  const kobayashiConfigPath = path.join(compiled.targetDir, "kobayashi-config.json");

  fs.writeFileSync(modelsPath, JSON.stringify(compiled.modelsJson, null, 2) + "\n");
  fs.writeFileSync(settingsPath, JSON.stringify(compiled.settingsJson, null, 2) + "\n");
  fs.writeFileSync(solPiPath, JSON.stringify(compiled.solPiJson, null, 2) + "\n");
  fs.writeFileSync(kobayashiConfigPath, JSON.stringify(compiled.rawConfig, null, 2) + "\n");

  // Synchronize keybindings.json if not present
  const keybindingsPath = path.join(compiled.targetDir, "keybindings.json");
  if (!fs.existsSync(keybindingsPath)) {
    const defaultKeybindings = {
      $schema: "https://pi.dev/schemas/keybindings.schema.json",
      "app.session.tree": ["ctrl+t", "alt+t"],
      "app.session.new": "ctrl+n",
      "tui.editor.historyPrevious": "alt+up",
      "tui.editor.historyNext": "alt+down",
    };
    fs.writeFileSync(keybindingsPath, JSON.stringify(defaultKeybindings, null, 2) + "\n");
  }

  // Synchronize Kobayashi router extension to ~/.pi/agent/extensions/
  const extDir = path.join(compiled.targetDir, "extensions");
  fs.mkdirSync(extDir, { recursive: true });
  
  // Locate compiled router extension
  const candidatePaths = [
    path.join(__dirname, "../extensions/router/index.js"),
    path.join(__dirname, "extensions/router/index.js"),
    path.resolve(process.cwd(), "dist/src/extensions/router/index.js"),
  ];

  for (const src of candidatePaths) {
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, path.join(extDir, "kobayashi-router.js"));
        break;
      } catch {}
    }
  }

  // Synchronize dashboard server script to ~/.pi/agent/exec-dashboard.mjs
  const candidateDashboardPaths = [
    path.join(__dirname, "../dashboard/exec-dashboard.mjs"),
    path.join(__dirname, "../../src/dashboard/exec-dashboard.mjs"),
    path.resolve(process.cwd(), "src/dashboard/exec-dashboard.mjs"),
  ];
  for (const dashSrc of candidateDashboardPaths) {
    if (fs.existsSync(dashSrc)) {
      try {
        fs.copyFileSync(dashSrc, path.join(compiled.targetDir, "exec-dashboard.mjs"));
        break;
      } catch {}
    }
  }

  // Synchronize global skills only from kobayashi package, avoiding self-collision with consumer repos
  const userSkillsDir = path.join(os.homedir(), ".agents", "skills");
  fs.mkdirSync(userSkillsDir, { recursive: true });

  const candidateSkillsDirs = [
    path.join(__dirname, "../../../.agents/skills"),
    path.join(__dirname, "../../.agents/skills"),
    path.join(__dirname, "../.agents/skills"),
  ];

  for (const sDir of candidateSkillsDirs) {
    if (fs.existsSync(sDir) && path.resolve(sDir) !== path.resolve(userSkillsDir)) {
      try {
        const skills = fs.readdirSync(sDir, { withFileTypes: true });
        for (const skill of skills) {
          if (skill.isDirectory()) {
            const srcPath = path.join(sDir, skill.name);
            const destPath = path.join(userSkillsDir, skill.name);
            if (!fs.existsSync(destPath)) {
              fs.cpSync(srcPath, destPath, { recursive: true });
            }
          }
        }
      } catch {}
      break;
    }
  }
}
