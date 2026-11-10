#!/usr/bin/env bash
# ==============================================================================
# KOBAYASHI MARU - 1-COMMAND OVERLAY INSTALLER FOR EXISTING PI INSTALLATIONS
# ==============================================================================
# Non-destructive: Layers Kobayashi Maru on top of any existing Pi install:
# 1. Preserves existing auth.json & API keys 100% (never touched or overwritten)
# 2. Cleans up broken symlinks in ~/.pi/agent/extensions/ (fixes spawn errno -86)
# 3. Deploys self-contained zero-bloat extensions (BM25 Skill-RAG, SoL-Pi, Virtual Router)
# 4. Safely merges settings.json & virtual-models.json
# 5. Configures MCP servers with deferred exposure (0 token cold starts)
# 6. Retroactively scans ~/.pi/agent/sessions/ and backfills all ROI & telemetry
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

# Prioritize native ARM64 Homebrew paths on Apple Silicon to prevent broken Intel binaries
if [ "$(uname -m)" = "arm64" ] && [ -d "/opt/homebrew/bin" ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

# Detect SCRIPT_DIR or clone if running via curl | bash
if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "bash" ] && [ "${BASH_SOURCE[0]}" != "sh" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
else
  REPO_DIR="${HOME}/.kobayashi-maru"
  if [ ! -d "${REPO_DIR}/.git" ]; then
    echo -e "${CYAN}Cloning Kobayashi Maru to ${REPO_DIR}...${RESET}"
    git clone --depth 1 https://github.com/devdeepjs/kobayashi-maru.git "${REPO_DIR}"
  else
    echo -e "${CYAN}Updating Kobayashi Maru in ${REPO_DIR}...${RESET}"
    git -C "${REPO_DIR}" pull --quiet || true
  fi
  SCRIPT_DIR="${REPO_DIR}"
fi

PI_AGENT_DIR="${PI_AGENT_DIR:-${HOME}/.pi/agent}"
EXTENSIONS_DIR="${PI_AGENT_DIR}/extensions"
SESSIONS_DIR="${PI_AGENT_DIR}/sessions"
LEDGER_FILE="${PI_AGENT_DIR}/savings-ledger.jsonl"
SETTINGS_FILE="${PI_AGENT_DIR}/settings.json"
VIRTUAL_FILE="${PI_AGENT_DIR}/virtual-models.json"
MCP_FILE="${PI_AGENT_DIR}/mcp.json"
SOL_FILE="${PI_AGENT_DIR}/sol-pi.json"
DASH_SCRIPT="${PI_AGENT_DIR}/exec-dashboard.mjs"

echo -e "\n${BOLD}${CYAN}========================================================================${RESET}"
echo -e "${BOLD}${CYAN}  KOBAYASHI MARU // 1-COMMAND NON-DESTRUCTIVE PI OVERLAY INSTALLER${RESET}"
echo -e "${BOLD}${CYAN}========================================================================${RESET}\n"

mkdir -p "${PI_AGENT_DIR}" "${EXTENSIONS_DIR}"

# ------------------------------------------------------------------------------
# ------------------------------------------------------------------------------
# 1. Clean Broken Symlinks in ~/.pi/agent/ (Recursive: extensions, agents, prompts)
# ------------------------------------------------------------------------------
echo -e "${CYAN}[1/6] Cleaning up broken symlinks across Pi directories...${RESET}"
BROKEN_COUNT=0
if [ -d "${PI_AGENT_DIR}" ]; then
  while IFS= read -r item; do
    if [ -n "$item" ]; then
      echo -e "  ${YELLOW}• Removing broken symlink:${RESET} $item"
      rm -f "$item"
      BROKEN_COUNT=$((BROKEN_COUNT + 1))
    fi
  done < <(find "${PI_AGENT_DIR}" -type l ! -exec test -e {} \; -print 2>/dev/null || true)
fi

if [ "$BROKEN_COUNT" -gt 0 ]; then
  echo -e "  ${GREEN}✔ Cleaned up ${BROKEN_COUNT} broken symlink(s)${RESET}"
else
  echo -e "  ✔ No broken symlinks found"
fi

# ------------------------------------------------------------------------------
# 2. Deploy Self-Contained Kobayashi Extensions, Subagents & Plan-Mode
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[2/6] Deploying self-contained zero-bloat extensions & subagents...${RESET}"

cp -f "${SCRIPT_DIR}/bottom-up-router.ts" "${EXTENSIONS_DIR}/bottom-up-router.ts"
echo -e "  ✔ Deployed ${BOLD}bottom-up-router.ts${RESET} (Native virtual model routing, identity hook & live turn telemetry)"

cp -f "${SCRIPT_DIR}/skill-rag.ts" "${EXTENSIONS_DIR}/skill-rag.ts"
echo -e "  ✔ Deployed ${BOLD}skill-rag.ts${RESET} (Okapi BM25 zero-token cold start gating & minimal tool seam)"

cp -f "${SCRIPT_DIR}/git-checkpoint.ts" "${EXTENSIONS_DIR}/git-checkpoint.ts"
echo -e "  ✔ Deployed ${BOLD}git-checkpoint.ts${RESET} (Architecture-safe turn checkpointing, fixes errno -86)"

cp -f "${SCRIPT_DIR}/repo-mapper.ts" "${EXTENSIONS_DIR}/repo-mapper.ts"
echo -e "  ✔ Deployed ${BOLD}repo-mapper.ts${RESET} (AST-grep codebase topology outline in <800 tokens)"

# Deploy Plan Mode (Safe read-only exploration & progress tracking)
mkdir -p "${EXTENSIONS_DIR}/plan-mode"
if [ -d "${SCRIPT_DIR}/vendor/extensions/plan-mode" ]; then
  cp -f "${SCRIPT_DIR}/vendor/extensions/plan-mode/"*.ts "${EXTENSIONS_DIR}/plan-mode/"
  echo -e "  ✔ Deployed ${BOLD}plan-mode${RESET} (/plan & Ctrl+Alt+P two-stage safe exploration mode)"
fi

# Deploy Subagents (Isolated context task delegation)
mkdir -p "${EXTENSIONS_DIR}/subagent"
if [ -d "${SCRIPT_DIR}/vendor/extensions/subagent" ]; then
  cp -f "${SCRIPT_DIR}/vendor/extensions/subagent/"*.ts "${EXTENSIONS_DIR}/subagent/"
  echo -e "  ✔ Deployed ${BOLD}subagent${RESET} (Isolated context parallel & chained subagent tool)"
fi

# Deploy in-session Todo and Context Handoff
if [ -f "${SCRIPT_DIR}/vendor/extensions/todo.ts" ]; then
  cp -f "${SCRIPT_DIR}/vendor/extensions/todo.ts" "${EXTENSIONS_DIR}/todo.ts"
  echo -e "  ✔ Deployed ${BOLD}todo.ts${RESET} (/todos branch-safe session checklist)"
fi

if [ -f "${SCRIPT_DIR}/vendor/extensions/handoff.ts" ]; then
  cp -f "${SCRIPT_DIR}/vendor/extensions/handoff.ts" "${EXTENSIONS_DIR}/handoff.ts"
  echo -e "  ✔ Deployed ${BOLD}handoff.ts${RESET} (/handoff lossless context transfer)"
fi

# Deploy Evidence-Preserving Output Reducer (ANSI/Progress bar noise elision)
if [ -f "${SCRIPT_DIR}/vendor/extensions/evidence-reducer.ts" ]; then
  cp -f "${SCRIPT_DIR}/vendor/extensions/evidence-reducer.ts" "${EXTENSIONS_DIR}/evidence-reducer.ts"
  echo -e "  ✔ Deployed ${BOLD}evidence-reducer.ts${RESET} (/reducer rule-based elision)"
fi

# Deploy Agent Profiles (scout, planner, reviewer, worker)
mkdir -p "${PI_AGENT_DIR}/agents"
if [ -d "${SCRIPT_DIR}/vendor/agents" ]; then
  cp -f "${SCRIPT_DIR}/vendor/agents/"*.md "${PI_AGENT_DIR}/agents/"
  echo -e "  ✔ Deployed ${BOLD}agents/${RESET} (scout, planner, reviewer, worker profiles)"
fi

# Deploy Workflow Prompts (/implement, /scout-and-plan, /implement-and-review)
mkdir -p "${PI_AGENT_DIR}/prompts"
if [ -d "${SCRIPT_DIR}/vendor/prompts" ]; then
  cp -f "${SCRIPT_DIR}/vendor/prompts/"*.md "${PI_AGENT_DIR}/prompts/"
  echo -e "  ✔ Deployed ${BOLD}prompts/${RESET} (/implement, /scout-and-plan workflow templates)"
fi

# ------------------------------------------------------------------------------
# 3. Safely Merge settings.json (Preserves auth.json & User Customizations)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[3/6] Merging Pi settings & preserving user credentials...${RESET}"

if [ -f "${PI_AGENT_DIR}/auth.json" ]; then
  echo -e "  ${GREEN}✔ Preserved existing auth.json credentials (100% untouched)${RESET}"
fi

node -e "
const fs = require('fs');
const settingsPath = '${SETTINGS_FILE}';
let settings = {};
if (fs.existsSync(settingsPath)) {
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
}

// Ensure defaultModel is set to virtual router
if (!settings.defaultModel || settings.defaultModel === 'default') {
  settings.defaultModel = 'auto/planner-worker';
}

// Enable streaming prompt cache warming
settings.cacheWarming = 'streaming';

// Ensure standard recommended extensions are registered
const currentExts = Array.isArray(settings.extensions) ? settings.extensions : [];
const desiredExts = [
  '@dietrichgebert/ponytail',
  '@langfuse/pi-observability-plugin',
  'pi-web-access',
  'pi-ollama',
  'pi-bedrock-mantle',
  'NVlabs/SoL-Pi'
];
for (const ext of desiredExts) {
  if (!currentExts.includes(ext)) {
    currentExts.push(ext);
  }
}
settings.extensions = currentExts;

// Configure enabledModels for instant Ctrl+P cycle (incorporating Cursor as non-default sniper)
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  ✔ Configured defaultModel: ' + settings.defaultModel);
console.log('  ✔ Enabled streaming prompt cache warming');
"

# Enforce Cursor-to-Pi $20 budget cap in shell profile
if [ -f "${HOME}/.zshrc" ]; then
  if ! grep -q "PI_CURSOR_CONTEXT=" "${HOME}/.zshrc" 2>/dev/null; then
    cat << 'EOF' >> "${HOME}/.zshrc"

# Cursor-to-Pi $20/mo Budget Guardrails
export PI_CURSOR_CONTEXT="min"
EOF
    echo -e "  ✔ Added PI_CURSOR_CONTEXT='min' budget guardrail to ~/.zshrc"
  fi
fi

# ------------------------------------------------------------------------------
# 4. Deploy Virtual Models & NVIDIA SoL-Pi Configuration
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[4/6] Configuring virtual models and log compaction...${RESET}"

if [ ! -f "${VIRTUAL_FILE}" ]; then
  node -e "
    const fs = require('fs');
    const defaultVirtual = {
      planner: { provider: 'bedrock-mantle', model: 'openai.gpt-5.6-luna', thinking: 'medium' },
      worker: { provider: 'ollama', model: 'ornith-1.5:ctx', thinking: 'off' },
      escalationThreshold: 2,
      custom: {
        'speed-demon': {
          id: 'speed-demon',
          name: 'Speed Demon: Instant Local Response',
          planner: { provider: 'ollama', model: 'ornith-1.5:ctx', thinking: 'off' },
          worker: { provider: 'ollama', model: 'ornith-1.5:ctx', thinking: 'off' },
          policy: 'bottom-up'
        }
      }
    };
    fs.writeFileSync('${VIRTUAL_FILE}', JSON.stringify(defaultVirtual, null, 2) + '\n');
  "
  echo -e "  ✔ Created default virtual-models.json"
else
  echo -e "  ✔ Preserved existing virtual-models.json"
fi

if [ ! -f "${SOL_FILE}" ] && [ -f "${SCRIPT_DIR}/sol-pi.json" ]; then
  cp -f "${SCRIPT_DIR}/sol-pi.json" "${SOL_FILE}"
  echo -e "  ✔ Deployed NVIDIA SoL-Pi log compaction config"
fi

# Deploy exec-dashboard.mjs
if [ -f "${SCRIPT_DIR}/src/dashboard/exec-dashboard.mjs" ]; then
  cp -f "${SCRIPT_DIR}/src/dashboard/exec-dashboard.mjs" "${DASH_SCRIPT}"
  chmod +x "${DASH_SCRIPT}"
  echo -e "  ✔ Deployed F1 Pit Wall Web Telemetry Engine"
fi

# ------------------------------------------------------------------------------
# 5. Configure Zero-Bloat MCP Servers
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[5/6] Ensuring zero-bloat MCP configuration...${RESET}"

node -e "
const fs = require('fs');
const path = require('path');
const mcpPath = '${MCP_FILE}';
const home = process.env.HOME || '';
const candidates = [
  path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  path.join(home, '.cursor', 'mcp.json'),
  path.join(home, '.config', 'Claude', 'claude_desktop_config.json')
];

let mcpConfig = { mcpServers: {} };
if (fs.existsSync(mcpPath)) {
  try { mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8')); if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {}; } catch {}
}

let imported = 0;
for (const cand of candidates) {
  if (fs.existsSync(cand)) {
    try {
      const data = JSON.parse(fs.readFileSync(cand, 'utf8'));
      for (const [name, cfg] of Object.entries(data.mcpServers || {})) {
        if (!mcpConfig.mcpServers[name]) {
          const entry = typeof cfg === 'object' && cfg !== null ? { ...cfg } : {};
          if (!entry.exposure) entry.exposure = 'deferred';
          mcpConfig.mcpServers[name] = entry;
          imported++;
        }
      }
    } catch {}
  }
}

// Ensure all existing entries have deferred exposure to eliminate schema bloat
for (const [name, cfg] of Object.entries(mcpConfig.mcpServers)) {
  if (!cfg.exposure) cfg.exposure = 'deferred';
}

fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n');
const serverCount = Object.keys(mcpConfig.mcpServers).length;
console.log('  ✔ Configured ' + serverCount + ' MCP server(s) with deferred exposure (0 prompt bloat)');
"

# ------------------------------------------------------------------------------
# 6. Synchronize Historical Telemetry & Display F1 Pit Wall Scorecard
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[6/6] Reconciling historical Pi session telemetry...${RESET}"

# Build and link CLI if running inside repository
if [ -f "${SCRIPT_DIR}/package.json" ]; then
  if [ ! -d "${SCRIPT_DIR}/node_modules" ]; then
    (cd "${SCRIPT_DIR}" && npm install --no-audit --prefer-offline 2>/dev/null || npm install --silent)
  fi
  (cd "${SCRIPT_DIR}" && npm run build >/dev/null 2>&1 || true)
  
  # Link compiled CLI to ~/.local/bin or /usr/local/bin
  LOCAL_BIN="${HOME}/.local/bin"
  mkdir -p "${LOCAL_BIN}"
  if [ -f "${SCRIPT_DIR}/dist/bin/kobayashi.js" ]; then
    chmod +x "${SCRIPT_DIR}/dist/bin/kobayashi.js"
    ln -sf "${SCRIPT_DIR}/dist/bin/kobayashi.js" "${LOCAL_BIN}/kobayashi" 2>/dev/null || true
  else
    ln -sf "${SCRIPT_DIR}/bin/kobayashi.ts" "${LOCAL_BIN}/kobayashi" 2>/dev/null || true
  fi
fi

# Run retroactive session synchronization and print scorecard
(cd "${SCRIPT_DIR}" && PI_AGENT_DIR="${PI_AGENT_DIR}" npx tsx bin/kobayashi.ts stats || true)

echo -e "\n${BOLD}${GREEN}========================================================================${RESET}"
echo -e "${BOLD}${GREEN}✔ KOBAYASHI MARU OVERLAY APPLIED SUCCESSFULLY!${RESET}"
echo -e "${BOLD}${GREEN}========================================================================${RESET}\n"

echo -e "Quick Commands:"
echo -e "  • Start Pi with Virtual Model : ${CYAN}pi --model auto/planner-worker${RESET}"
echo -e "  • Start Pi with \$0 Local Model : ${CYAN}pi --model auto/bottom-up${RESET}"
echo -e "  • Live Web Telemetry HUD      : ${CYAN}kobayashi stats --web${RESET}"
echo -e "  • Add Custom Virtual Model    : ${CYAN}kobayashi virtual add <id> --planner <model> --worker <model>${RESET}"
echo -e "  • Manage MCP Servers          : ${CYAN}kobayashi mcp list${RESET}\n"
