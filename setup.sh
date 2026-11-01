#!/usr/bin/env bash
# ==============================================================================
# KOBAYASHI MARU - 1-COMMAND SOTA AGENT HARNESS SETUP
# ==============================================================================
# "I don't believe in the unwinnable scenario." — James T. Kirk
#
# Installs and configures the production-grade SOTA agent harness:
# 1. System & Runtime Dependencies (Node.js, Git, ast-grep, Ollama, Pi)
# 2. Bundled Matt Pocock 38-Skill Suite & Custom Skills Synchronization
# 3. SRA Skill-RAG (Okapi BM25 Dynamic Capability Retrieval for 500+ skills)
# 4. DeepSeek Minimal Seam (Lean active toolloadout, zero prompt bloat)
# 5. NVIDIA SoL-Pi (Observation Compaction & Online Context Pruning)
# 6. Dual Virtual Model Router (Frontier Planner + $0 Local Workhorse)
# 7. AST-grep Repository Topology Mapper (v0.51 outline)
# 8. Git Checkpoint Engine (Turn-boundary rollback)
# 9. Vetted Extensions: @dietrichgebert/ponytail, @langfuse/pi-observability-plugin, pi-web-access
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_AGENT_DIR="${HOME}/.pi/agent"
EXTENSIONS_DIR="${PI_AGENT_DIR}/extensions"
SKILLS_DIR="${HOME}/.agents/skills"

# ------------------------------------------------------------------------------
# Help & Argument Parsing
# ------------------------------------------------------------------------------
show_help() {
  cat << EOF
Kobayashi Maru (小林丸) Setup CLI

USAGE:
  ./setup.sh [OPTIONS]

OPTIONS:
  -h, --help            Show this help guide and exit
  --skills-only         Synchronize bundled Matt Pocock & custom skills only
  --extensions-only     Deploy SOTA Pi harness extensions only
  --config-only         Write NVIDIA SoL-Pi & Pi settings.json only
  --check               Run environment diagnostic check without modifications

EXAMPLES:
  ./setup.sh            # Complete end-to-end setup (recommended)
  ./setup.sh --skills   # Sync skills to ~/.agents/skills without touching extensions
  ./setup.sh --check    # Check current system readiness

DOCUMENTATION:
  https://github.com/devdeepjs/kobayashi-maru
EOF
  exit 0
}

SKILLS_ONLY=false
EXTENSIONS_ONLY=false
CONFIG_ONLY=false
CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      show_help
      ;;
    --skills|--skills-only)
      SKILLS_ONLY=true
      ;;
    --extensions|--extensions-only)
      EXTENSIONS_ONLY=true
      ;;
    --config|--config-only)
      CONFIG_ONLY=true
      ;;
    --check)
      CHECK_ONLY=true
      ;;
    *)
      echo -e "${RED}[ERROR] Unknown option: ${arg}${RESET}"
      echo "Run './setup.sh --help' for usage instructions."
      exit 1
      ;;
  esac
done

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
    __ __                    
   / //_/          /  |/  /___ _ _____ __  __
  / ,<    ____    / /|_/ // __ `// ___// / / /
 / /| |  /___/   / /  / // /_/ // /   / /_/ / 
/_/ |_|         /_/  /_/ \__,_//_/    \__,_/  
     Reprogramming the Token-Maxing Simulation
EOF
echo -e "${RESET}"

# ------------------------------------------------------------------------------
# Diagnostic / Pre-flight Check
# ------------------------------------------------------------------------------
if [ "$CHECK_ONLY" = true ]; then
  echo -e "${BOLD}Running Kobayashi Maru Diagnostic Check...${RESET}\n"
  
  echo -n "  Node.js: "
  if command -v node >/dev/null 2>&1; then
    echo -e "${GREEN}$(node -v)${RESET}"
  else
    echo -e "${RED}NOT FOUND${RESET}"
  fi

  echo -n "  Git: "
  if command -v git >/dev/null 2>&1; then
    echo -e "${GREEN}$(git --version)${RESET}"
  else
    echo -e "${RED}NOT FOUND${RESET}"
  fi

  echo -n "  ast-grep: "
  if command -v ast-grep >/dev/null 2>&1; then
    echo -e "${GREEN}$(ast-grep --version)${RESET}"
  else
    echo -e "${YELLOW}NOT FOUND (Install via: brew install ast-grep)${RESET}"
  fi

  echo -n "  Pi Agent: "
  if command -v pi >/dev/null 2>&1; then
    echo -e "${GREEN}$(pi --version 2>/dev/null || echo 'installed')${RESET}"
  else
    echo -e "${RED}NOT FOUND (Run ./setup.sh to install)${RESET}"
  fi

  echo -n "  Ollama: "
  if command -v ollama >/dev/null 2>&1; then
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
      echo -e "${GREEN}Active on localhost:11434${RESET}"
    else
      echo -e "${YELLOW}Installed but daemon not running${RESET}"
    fi
  else
    echo -e "${YELLOW}Not detected (Optional for local workhorse)${RESET}"
  fi

  echo -n "  Skills in ~/.agents/skills: "
  if [ -d "$SKILLS_DIR" ]; then
    COUNT=$(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
    echo -e "${GREEN}${COUNT} skills installed${RESET}"
  else
    echo -e "${YELLOW}0 installed${RESET}"
  fi

  echo -n "  SOTA Extensions: "
  if [ -f "${EXTENSIONS_DIR}/skill-rag.ts" ] && [ -f "${EXTENSIONS_DIR}/bottom-up-router.ts" ]; then
    echo -e "${GREEN}Active in ~/.pi/agent/extensions/${RESET}"
  else
    echo -e "${YELLOW}Not fully deployed (Run ./setup.sh)${RESET}"
  fi

  echo -e "\n${BOLD}${GREEN}Diagnostic check complete.${RESET}"
  exit 0
fi

echo -e "${BOLD}Starting Kobayashi Maru SOTA Harness Setup...${RESET}\n"

# ------------------------------------------------------------------------------
# 1. Dependency Checks
# ------------------------------------------------------------------------------
if [ "$SKILLS_ONLY" = false ] && [ "$CONFIG_ONLY" = false ]; then
  echo -e "${CYAN}[1/7] Checking system dependencies...${RESET}"

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
    echo -e "  ${YELLOW}[INFO] Ollama not detected. If using pure cloud models, this can be skipped.${RESET}"
  fi
fi

# ------------------------------------------------------------------------------
# 2. Pi Coding Agent Engine
# ------------------------------------------------------------------------------
if [ "$SKILLS_ONLY" = false ] && [ "$CONFIG_ONLY" = false ]; then
  echo -e "\n${CYAN}[2/7] Verifying Pi Coding Agent runtime...${RESET}"

  if ! command -v pi >/dev/null 2>&1; then
    echo -e "  Installing @earendil-works/pi-coding-agent globally..."
    npm install -g @earendil-works/pi-coding-agent
  fi
  PI_VERSION=$(pi --version 2>/dev/null || echo "installed")
  echo -e "  ✔ Pi Coding Agent: ${GREEN}${PI_VERSION}${RESET}"
fi

# ------------------------------------------------------------------------------
# 3. Create Target Directories
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[3/7] Initializing agent environment directories...${RESET}"

mkdir -p "${PI_AGENT_DIR}"
mkdir -p "${EXTENSIONS_DIR}"
mkdir -p "${SKILLS_DIR}"

echo -e "  ✔ Extension target: ${GREEN}${EXTENSIONS_DIR}${RESET}"
echo -e "  ✔ Global skills target: ${GREEN}${SKILLS_DIR}${RESET}"

# ------------------------------------------------------------------------------
# 4. Synchronize Bundled Skills (Matt Pocock 38-Skill Suite + Custom Skills)
# ------------------------------------------------------------------------------
if [ "$EXTENSIONS_ONLY" = false ] && [ "$CONFIG_ONLY" = false ]; then
  echo -e "\n${CYAN}[4/7] Synchronizing bundled skills suite into ~/.agents/skills...${RESET}"

  SKILLS_SRC=""
  if [ -d "${SCRIPT_DIR}/.agents/skills" ]; then
    SKILLS_SRC="${SCRIPT_DIR}/.agents/skills"
  elif [ -d "${SCRIPT_DIR}/../.agents/skills" ]; then
    SKILLS_SRC="${SCRIPT_DIR}/../.agents/skills"
  fi

  if [ -n "${SKILLS_SRC}" ] && [ -d "${SKILLS_SRC}" ]; then
    cp -R "${SKILLS_SRC}/"* "${SKILLS_DIR}/" 2>/dev/null || true
    SKILL_COUNT=$(find "${SKILLS_DIR}" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
    echo -e "  ✔ Synchronized: ${GREEN}${SKILL_COUNT} skills${RESET} globally ready in ${SKILLS_DIR}"
    echo -e "    • ${BOLD}Engineering & TDD${RESET}: tdd, prototype, implement, implement-spec, diagnosing-bugs"
    echo -e "    • ${BOLD}Architecture & Spec${RESET}: codebase-design, domain-modeling, to-spec, to-tickets"
    echo -e "    • ${BOLD}Review & Guardrails${RESET}: code-review, git-guardrails-claude-code, grill-me, grill-with-docs"
    echo -e "    • ${BOLD}Meta & Workflow${RESET}: ask-matt, chief-of-staff, wait-what, wayfinder, wizard"
  else
    echo -e "  ${YELLOW}[INFO] Local .agents/skills not found; existing ~/.agents/skills preserved.${RESET}"
  fi
fi

if [ "$SKILLS_ONLY" = true ]; then
  echo -e "\n${BOLD}${GREEN}✔ Skills synchronized successfully!${RESET}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 5. Deploy Kobayashi Extensions
# ------------------------------------------------------------------------------
if [ "$CONFIG_ONLY" = false ]; then
  echo -e "\n${CYAN}[5/7] Deploying Kobayashi SOTA Extensions...${RESET}"

  deploy_extension() {
    local file="$1"
    local src=""
    if [ -f "${SCRIPT_DIR}/${file}" ]; then
      src="${SCRIPT_DIR}/${file}"
    elif [ -f "${SCRIPT_DIR}/sota-harness/${file}" ]; then
      src="${SCRIPT_DIR}/sota-harness/${file}"
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
fi

if [ "$EXTENSIONS_ONLY" = true ]; then
  echo -e "\n${BOLD}${GREEN}✔ Extensions deployed successfully!${RESET}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 6. Configure Packages & Settings
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[6/7] Installing SOTA packages & writing configurations...${RESET}"

# Install vetted packages into Pi
echo -e "  Installing @dietrichgebert/ponytail (Lazy Senior Dev Mode)..."
pi install npm:@dietrichgebert/ponytail >/dev/null 2>&1 || true

echo -e "  Installing @langfuse/pi-observability-plugin (Enterprise Telemetry)..."
pi install npm:@langfuse/pi-observability-plugin >/dev/null 2>&1 || true

echo -e "  Installing pi-web-access (Context-Gated Web Search & Extraction)..."
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

if [ "$CONFIG_ONLY" = true ]; then
  echo -e "\n${BOLD}${GREEN}✔ Configuration files written successfully!${RESET}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 7. Pre-flight Smoke Test
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[7/7] Running pre-flight harness verification...${RESET}"

if pi --help >/dev/null 2>&1; then
  echo -e "  ✔ Pi runtime responded successfully"
else
  echo -e "  ${YELLOW}[WARN] Pi smoke test had non-zero exit code. Verify node & global npm packages.${RESET}"
fi

echo -e "\n${BOLD}${GREEN}========================================================================${RESET}"
echo -e "${BOLD}${GREEN}✔ KOBAYASHI MARU HARNESS IS READY!${RESET}"
echo -e "${BOLD}${GREEN}========================================================================${RESET}\n"

echo -e "Runtime Features Active:"
echo -e "  • ${BOLD}BM25 Skill-RAG${RESET}: ${SKILL_COUNT:-500+} skills indexed in memory; 0 cold-start tokens; auto-injected on match."
echo -e "  • ${BOLD}DeepSeek Minimal Seam${RESET}: Core engineering primitives active; passive bloat hidden."
echo -e "  • ${BOLD}NVIDIA SoL-Pi${RESET}: Observation eviction & compaction active with 12.5 cache ratio."
echo -e "  • ${BOLD}Virtual Router${RESET}: Run with ${CYAN}--model auto/planner-worker${RESET} or ${CYAN}--model auto/bottom-up${RESET}."
echo -e "  • ${BOLD}AST-grep Topology${RESET}: Run ${CYAN}repo_map({ query: '...' })${RESET} to outline codebases in < 800 tokens."
echo -e "  • ${BOLD}Git Checkpoint${RESET}: Pre-turn git stash checkpoints for 1-click deterministic rollback.\n"

echo -e "Try it now:"
echo -e "  ${BOLD}pi --model auto/planner-worker -p \"Review the repo structure and explain main entrypoints\"${RESET}\n"
echo -e "Or test a skill without token tax:"
echo -e "  ${BOLD}pi -p \"Use /tdd to implement a thread-safe LRU cache with unit tests\"${RESET}\n"
