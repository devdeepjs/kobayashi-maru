#!/usr/bin/env bash
# ==============================================================================
# KOBAYASHI MARU - 1-COMMAND SOTA AGENT HARNESS SETUP
# ==============================================================================
# "I don't believe in the unwinnable scenario." — James T. Kirk
#
# Installs and configures the production-grade SOTA agent harness:
# 1. SRA Skill-RAG (Okapi BM25 Dynamic Capability Retrieval for 500+ skills)
# 2. DeepSeek Minimal Seam (Lean active toolloadout, zero prompt bloat)
# 3. NVIDIA SoL-Pi (Observation Compaction & Online Context Pruning)
# 4. Dual Virtual Model Router (Frontier Planner + $0 Local Workhorse)
# 5. AST-grep Repository Topology Mapper (v0.51 outline)
# 6. Git Checkpoint Engine (Turn-boundary rollback)
# 7. Vetted Extensions: @dietrichgebert/ponytail, @langfuse/pi-observability-plugin, pi-web-access
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
    __ __ obayashi  __  ___                 
   / //_/          /  |/  /___ _ _____ __  __
  / ,<    ____    / /|_/ // __ `// ___// / / /
 / /| |  /___/   / /  / // /_/ // /   / /_/ / 
/_/ |_|         /_/  /_/ \__,_//_/    \__,_/  
     Reprogramming the Token-Maxing Simulation
EOF
echo -e "${RESET}"
echo -e "${BOLD}Starting Kobayashi Maru SOTA Harness Setup...${RESET}\n"

# ------------------------------------------------------------------------------
# 1. Dependency Checks
# ------------------------------------------------------------------------------
echo -e "${CYAN}[1/6] Checking system dependencies...${RESET}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Node.js is required (>= 20.x). Please install Node.js first.${RESET}"
  exit 1
fi
NODE_VERSION=$(node -v)
echo -e "  ✔ Node.js: ${GREEN}${NODE_VERSION}${RESET}"

if ! command -v git >/dev/null 2>&1; then
  echo -e "${RED}[ERROR] Git is required.${RESET}"
  exit 1
fi
echo -e "  ✔ Git: ${GREEN}$(git --version)${RESET}"

# Check or install ast-grep
if ! command -v ast-grep >/dev/null 2>&1; then
  echo -e "  ${YELLOW}ast-grep not found. Attempting install via Homebrew...${RESET}"
  if command -v brew >/dev/null 2>&1; then
    brew install ast-grep
    echo -e "  ✔ ast-grep installed: ${GREEN}$(ast-grep --version)${RESET}"
  else
    echo -e "  ${YELLOW}[WARN] Homebrew not found. Please install ast-grep manually: npm install -g @ast-grep/cli${RESET}"
  fi
else
  echo -e "  ✔ ast-grep: ${GREEN}$(ast-grep --version)${RESET}"
fi

# Check Ollama
if command -v ollama >/dev/null 2>&1; then
  echo -e "  ✔ Ollama: ${GREEN}Detected${RESET}"
  if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo -e "  ✔ Ollama daemon: ${GREEN}Active on localhost:11434${RESET}"
  else
    echo -e "  ${YELLOW}[INFO] Ollama daemon is not currently running. Start it with 'ollama serve' when using local workhorse.${RESET}"
  fi
else
  echo -e "  ${YELLOW}[INFO] Ollama not detected. If using pure frontier models, this can be skipped.${RESET}"
fi

# ------------------------------------------------------------------------------
# 2. Pi Coding Agent Engine
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[2/6] Verifying Pi Coding Agent runtime...${RESET}"

if ! command -v pi >/dev/null 2>&1; then
  echo -e "  Installing @earendil-works/pi-coding-agent globally..."
  npm install -g @earendil-works/pi-coding-agent
fi
PI_VERSION=$(pi --version 2>/dev/null || echo "installed")
echo -e "  ✔ Pi Coding Agent: ${GREEN}${PI_VERSION}${RESET}"

# ------------------------------------------------------------------------------
# 3. Create Target Directories
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[3/6] Initializing agent environment...${RESET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_AGENT_DIR="${HOME}/.pi/agent"
EXTENSIONS_DIR="${PI_AGENT_DIR}/extensions"

mkdir -p "${PI_AGENT_DIR}"
mkdir -p "${EXTENSIONS_DIR}"
mkdir -p "${HOME}/.agents/skills"

echo -e "  ✔ Extension target: ${GREEN}${EXTENSIONS_DIR}${RESET}"

# ------------------------------------------------------------------------------
# 4. Deploy Kobayashi Extensions
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[4/6] Deploying Kobayashi SOTA Extensions...${RESET}"

deploy_extension() {
  local file="$1"
  local src=""
  if [ -f "${SCRIPT_DIR}/sota-harness/${file}" ]; then
    src="${SCRIPT_DIR}/sota-harness/${file}"
  elif [ -f "${SCRIPT_DIR}/${file}" ]; then
    src="${SCRIPT_DIR}/${file}"
  else
    echo -e "  ${RED}[ERROR] Source file missing: ${file}${RESET}"
    exit 1
  fi
  cp -f "${src}" "${EXTENSIONS_DIR}/${file}"
  echo -e "  ✔ Deployed: ${GREEN}${file}${RESET}"
}

deploy_extension "skill-rag.ts"
deploy_extension "bottom-up-router.ts"
deploy_extension "repo-mapper.ts"
deploy_extension "git-checkpoint.ts"

# ------------------------------------------------------------------------------
# 5. Configure Packages & Settings
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[5/6] Installing SOTA packages & writing configurations...${RESET}"

# Install vetted F1 packages
echo -e "  Installing @dietrichgebert/ponytail (Lazy Senior Dev Mode)..."
pi install npm:@dietrichgebert/ponytail >/dev/null 2>&1 || true

echo -e "  Installing @langfuse/pi-observability-plugin (Telemetry)..."
pi install npm:@langfuse/pi-observability-plugin >/dev/null 2>&1 || true

echo -e "  Installing pi-web-access (Web Search & Content Extraction)..."
pi install npm:pi-web-access >/dev/null 2>&1 || true

# 1. SoL-Pi Configuration
SOL_PI_CONF="${PI_AGENT_DIR}/sol-pi.json"
cat > "${SOL_PI_CONF}" << 'EOF'
{
  "version": 1,
  "actionFusion": true,
  "observationPack": true,
  "evidencePreservingReducer": true,
  "evidencePreservingReducerProvider": "bedrock-mantle",
  "evidencePreservingReducerModel": "openai.gpt-5.6-luna",
  "onlineContextCompact": true,
  "cacheWriteReadRatio": 12.5
}
EOF
echo -e "  ✔ Configured NVIDIA SoL-Pi: ${GREEN}${SOL_PI_CONF}${RESET}"

# 2. Agent Settings
SETTINGS_CONF="${PI_AGENT_DIR}/settings.json"
cat > "${SETTINGS_CONF}" << 'EOF'
{
  "$schema": "https://pi.dev/schemas/settings.schema.json",
  "packages": [
    "git:github.com/NVlabs/SoL-Pi",
    "npm:pi-bedrock-mantle",
    "npm:@dietrichgebert/ponytail",
    "npm:@langfuse/pi-observability-plugin",
    "npm:pi-web-access"
  ],
  "defaultProvider": "auto",
  "defaultModel": "planner-worker",
  "defaultThinkingLevel": "medium",
  "defaultTools": [
    "read",
    "bash",
    "edit",
    "write",
    "+codemode"
  ],
  "cacheWarming": "streaming",
  "codemode.mode": "on",
  "compaction": {
    "enabled": true,
    "reserveTokens": 6144,
    "keepRecentTokens": 20000
  }
}
EOF
echo -e "  ✔ Configured Settings: ${GREEN}${SETTINGS_CONF}${RESET}"

# 3. Models configuration (Ollama)
MODELS_CONF="${PI_AGENT_DIR}/models.json"
if [ ! -f "${MODELS_CONF}" ]; then
  cat > "${MODELS_CONF}" << 'EOF'
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        {
          "id": "ornith-1.5:ctx",
          "name": "Ornith 1.5 (Local Custom 32K)",
          "contextWindow": 32768,
          "maxTokens": 8192,
          "reasoning": true,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
EOF
  echo -e "  ✔ Configured Local Model Registry: ${GREEN}${MODELS_CONF}${RESET}"
fi

# ------------------------------------------------------------------------------
# 6. Pre-flight Smoke Test
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[6/6] Running pre-flight harness verification...${RESET}"

if pi --help >/dev/null 2>&1; then
  echo -e "  ✔ Pi runtime responded successfully"
else
  echo -e "  ${RED}[WARN] Pi smoke test had non-zero exit code. Please check your node installation.${RESET}"
fi

echo -e "\n${BOLD}${GREEN}========================================================================${RESET}"
echo -e "${BOLD}${GREEN}✔ KOBAYASHI MARU HARNESS IS READY!${RESET}"
echo -e "${BOLD}${GREEN}========================================================================${RESET}\n"

echo -e "Architecture Overview:"
echo -e "  • ${BOLD}Skill RAG (SRA)${RESET}: 500+ skills in memory; 0 tokens on cold-start; auto-injected on match."
echo -e "  • ${BOLD}DeepSeek Minimal Seam${RESET}: Core engineering tools active; passive bloat hidden."
echo -e "  • ${BOLD}NVIDIA SoL-Pi${RESET}: Automatic log pruning, tool observation eviction & compaction."
echo -e "  • ${BOLD}Virtual Router${RESET}: Run with ${CYAN}--model auto/planner-worker${RESET} or ${CYAN}--model auto/bottom-up${RESET}."
echo -e "  • ${BOLD}AST-grep Topology${RESET}: Run ${CYAN}repo_map({ query: '...' })${RESET} to outline codebases in < 800 tokens."
echo -e "  • ${BOLD}Git Checkpoint${RESET}: Automatic stashes before turns for instant code rollback.\n"

echo -e "Try it now:"
echo -e "  ${BOLD}pi --model auto/planner-worker -p \"Review the repo structure and explain main entrypoints\"${RESET}\n"
