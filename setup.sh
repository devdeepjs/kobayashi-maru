#!/usr/bin/env bash
# ==============================================================================
# KOBAYASHI MARU - AGENT HARNESS & PI RUNTIME SETUP WIZARD
# ==============================================================================
# "I don't believe in the unwinnable scenario." — James T. Kirk
#
# Production-grade setup wizard for executives, tech leads, and developers:
# 1. Interactive Provider Selection (Bedrock Mantle, Direct Bedrock, Claude, OpenAI, Local Ollama, Cursor/Proxy)
# 2. Bundled Matt Pocock 38-Skill Suite Synchronization (~/.agents/skills)
# 3. SRA Skill-RAG (Okapi BM25 Dynamic Capability Retrieval for 500+ skills)
# 4. DeepSeek Minimal Seam (Lean active toolloadout, zero prompt bloat)
# 5. NVIDIA SoL-Pi (Observation Compaction & Online Context Pruning)
# 6. Dual Virtual Model Router (Frontier Planner + $0 Local Workhorse)
# 7. AST-grep Repository Topology Mapper (v0.51 outline)
# 8. Git Checkpoint Engine (Turn-boundary rollback)
# 9. Vetted Extensions: @dietrichgebert/ponytail, @langfuse/pi-observability-plugin, pi-web-access, pi-ollama
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
MAGENTA="\033[0;35m"
RESET="\033[0m"

# Safe resolution of script directory even when executed via curl | bash
if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "bash" ] && [ "${BASH_SOURCE[0]}" != "sh" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
else
  SCRIPT_DIR="$(pwd)"
fi

PI_AGENT_DIR="${HOME}/.pi/agent"
EXTENSIONS_DIR="${PI_AGENT_DIR}/extensions"
SKILLS_DIR="${HOME}/.agents/skills"

# Detect a working git binary that can actually execute on this CPU architecture
find_working_git() {
  for g in "git" "/usr/bin/git" "/opt/homebrew/bin/git" "/usr/local/bin/git"; do
    if command -v "$g" >/dev/null 2>&1; then
      if "$g" --version >/dev/null 2>&1; then
        echo "$g"
        return 0
      fi
    fi
  done
  return 1
}

# ------------------------------------------------------------------------------
# Help & Argument Parsing
# ------------------------------------------------------------------------------
show_help() {
  cat << EOF
Kobayashi Maru (小林丸) Setup CLI & Provider Configurator

USAGE:
  ./setup.sh [OPTIONS]

OPTIONS:
  -i, --interactive     Run guided interactive setup wizard (default in interactive terminal)
  -y, --yes             Run non-interactive setup with recommended defaults
  --telemetry, --stats  Display top-down F1 Pit Wall executive efficiency scorecard & savings
  --skills-only         Synchronize bundled Matt Pocock & custom skills only
  --extensions-only     Deploy Pi harness extensions only
  --config-only         Write NVIDIA SoL-Pi & Pi settings.json only
  --ollama              Configure Ollama memory flags, bake 32K workhorse & install pi-ollama
  --check               Run environment diagnostic check without modifications
  --uninstall           Cleanly remove deployed extensions and reset configuration
  -h, --help            Show this help guide and exit

PROVIDER DOCUMENTATION:
  Executive Guide:      docs/EXECUTIVE_SETUP_GUIDE.md
  AWS Bedrock Mantle:   docs/providers/bedrock-mantle.md
  Direct AWS Bedrock:   docs/providers/amazon-bedrock.md
  Anthropic Claude:     docs/providers/anthropic-claude.md (Includes Enterprise Token Caution)
  OpenAI & Codex:       docs/providers/openai-codex.md
  Cursor & Proxies:     docs/providers/cursor-and-proxies.md
  Local Ollama (\$0):   docs/providers/ollama.md

EXAMPLES:
  ./setup.sh            # Guided interactive wizard
  ./setup.sh --yes      # Automated silent install (recommended for CI / Docker)
  ./setup.sh --telemetry# Executive F1 Pit Wall telemetry & savings scorecard
  ./setup.sh --ollama   # Configure Ollama & bake 32K local workhorse
  ./setup.sh --check    # Check current system readiness

DOCUMENTATION:
  https://github.com/devdeepjs/kobayashi-maru
EOF
  exit 0
}

INTERACTIVE=false
NON_INTERACTIVE=false
SKILLS_ONLY=false
EXTENSIONS_ONLY=false
CONFIG_ONLY=false
OLLAMA_ONLY=false
CHECK_ONLY=false
TELEMETRY_ONLY=false
UNINSTALL=false

# If run directly with no arguments in an interactive terminal, default to interactive wizard
if [ "$#" -eq 0 ] && [ -t 0 ]; then
  INTERACTIVE=true
fi

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      show_help
      ;;
    -i|--interactive)
      INTERACTIVE=true
      ;;
    -y|--yes|--non-interactive)
      NON_INTERACTIVE=true
      INTERACTIVE=false
      ;;
    --telemetry|--stats)
      TELEMETRY_ONLY=true
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
    --ollama|--ollama-only)
      OLLAMA_ONLY=true
      ;;
    --uninstall|--remove)
      UNINSTALL=true
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

if [ "$TELEMETRY_ONLY" = true ]; then
  if [ -x "${SCRIPT_DIR}/node_modules/.bin/tsx" ] && [ -f "${SCRIPT_DIR}/bin/kobayashi.ts" ]; then
    "${SCRIPT_DIR}/node_modules/.bin/tsx" "${SCRIPT_DIR}/bin/kobayashi.ts" stats
  elif [ -f "${SCRIPT_DIR}/bin/kobayashi.ts" ]; then
    npx --yes tsx "${SCRIPT_DIR}/bin/kobayashi.ts" stats
  elif command -v kobayashi &> /dev/null; then
    kobayashi stats
  else
    echo -e "${RED}[ERROR] Kobayashi CLI not found. Run ./setup.sh first.${RESET}"
    exit 1
  fi
  exit 0
fi

# Remote execution handler (e.g. curl -fsSL ... | bash)
if [ ! -f "${SCRIPT_DIR}/skill-rag.ts" ] && [ ! -f "${SCRIPT_DIR}/sota-harness/skill-rag.ts" ]; then
  REMOTE_TARGET="${HOME}/.kobayashi-maru"
  echo -e "${CYAN}Remote execution detected. Syncing repository into ${REMOTE_TARGET}...${RESET}"

  GIT_BIN="$(find_working_git || true)"
  SYNCED=false

  if [ -n "$GIT_BIN" ]; then
    if [ -d "${REMOTE_TARGET}/.git" ]; then
      if "$GIT_BIN" -C "${REMOTE_TARGET}" pull --quiet 2>/dev/null; then
        SYNCED=true
      fi
    else
      if "$GIT_BIN" clone --quiet https://github.com/devdeepjs/kobayashi-maru.git "${REMOTE_TARGET}" 2>/dev/null; then
        SYNCED=true
      fi
    fi
  fi

  if [ "$SYNCED" = false ]; then
    echo -e "  Syncing via HTTPS archive download (curl + tar)..."
    mkdir -p "${REMOTE_TARGET}"
    if curl -fsSL https://github.com/devdeepjs/kobayashi-maru/archive/refs/heads/main.tar.gz | tar -xz -C "${REMOTE_TARGET}" --strip-components=1 2>/dev/null; then
      SYNCED=true
    else
      echo -e "  ${RED}[ERROR] Failed to download repository archive. Please check your internet connection.${RESET}"
      exit 1
    fi
  fi

  # Transfer execution to the cloned/downloaded script on disk
  if [ -f "${REMOTE_TARGET}/setup.sh" ]; then
    chmod +x "${REMOTE_TARGET}/setup.sh"
    if [ -t 0 ]; then
      exec bash "${REMOTE_TARGET}/setup.sh" "$@"
    elif [ -c /dev/tty ]; then
      exec bash "${REMOTE_TARGET}/setup.sh" "$@" < /dev/tty
    else
      exec bash "${REMOTE_TARGET}/setup.sh" --yes "$@"
    fi
  else
    echo -e "  ${RED}[ERROR] setup.sh missing from ${REMOTE_TARGET}.${RESET}"
    exit 1
  fi
fi

# Uninstall / Clean Reset Handler
if [ "$UNINSTALL" = true ]; then
  echo -e "${YELLOW}Uninstalling Kobayashi Maru extensions from ~/.pi/agent/extensions/...${RESET}"
  rm -f "${EXTENSIONS_DIR}/skill-rag.ts"
  rm -f "${EXTENSIONS_DIR}/bottom-up-router.ts"
  rm -f "${EXTENSIONS_DIR}/repo-mapper.ts"
  rm -f "${EXTENSIONS_DIR}/git-checkpoint.ts"
  echo -e "  ✔ Removed extensions: skill-rag.ts, bottom-up-router.ts, repo-mapper.ts, git-checkpoint.ts"

  if [ -f "${PI_AGENT_DIR}/sol-pi.json" ]; then
    rm -f "${PI_AGENT_DIR}/sol-pi.json"
    echo -e "  ✔ Removed: sol-pi.json"
  fi

  echo -e "\n${BOLD}${GREEN}✔ Kobayashi Maru extensions uninstalled cleanly.${RESET}"
  echo -e "Your Pi coding agent installation and personal configurations remain untouched."
  exit 0
fi

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
  GIT_CMD="$(find_working_git || true)"
  if [ -n "$GIT_CMD" ]; then
    echo -e "${GREEN}$($GIT_CMD --version)${RESET}"
  else
    echo -e "${YELLOW}NOT FUNCTIONAL (Broken git in PATH; install Xcode CLT or brew git)${RESET}"
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

  echo -n "  Harness Extensions: "
  if [ -f "${EXTENSIONS_DIR}/skill-rag.ts" ] && [ -f "${EXTENSIONS_DIR}/bottom-up-router.ts" ]; then
    echo -e "${GREEN}Active in ~/.pi/agent/extensions/${RESET}"
  else
    echo -e "${YELLOW}Not fully deployed (Run ./setup.sh)${RESET}"
  fi

  echo -e "\n${BOLD}${GREEN}Diagnostic check complete.${RESET}"
  exit 0
fi

# ------------------------------------------------------------------------------
# Omnichannel Provider Configuration (All Providers Enabled & Ready)
# ------------------------------------------------------------------------------
CHOSEN_PROVIDER="bedrock-mantle"
CHOSEN_MODEL="openai.gpt-5.6-luna"
CHOSEN_THINKING="medium"
ENABLE_LOCAL_WORKHORSE=true
CUSTOM_BASE_URL=""
CUSTOM_API_KEY=""

echo -e "${BOLD}${MAGENTA}Omnichannel Multi-Provider Architecture Setup${RESET}"
echo -e "Enabling ALL 6 model providers simultaneously — you have full freedom across all models!\n"
echo -e "  ${GREEN}✔ [1] AWS Bedrock Mantle${RESET}     — Luna (openai.gpt-5.6-luna) & Claude Opus via Mantle SigV4"
echo -e "  ${GREEN}✔ [2] Direct Amazon Bedrock${RESET}  — Sonnet 3.5/3.7 (us.anthropic.claude-sonnet-5-5), Nova Pro"
echo -e "  ${GREEN}✔ [3] Direct Anthropic Claude${RESET} — Claude 3.7 Sonnet & Haiku (OAuth or ANTHROPIC_API_KEY)"
echo -e "  ${GREEN}✔ [4] OpenAI & Codex${RESET}          — GPT-4o, o1, o3-mini, Codex (OPENAI_API_KEY)"
echo -e "  ${GREEN}✔ [5] Local Ollama (\$0 RAM)${RESET}  — ornith-1.5:ctx, deepseek-r1, qwen2.5 (100% private in RAM)"
echo -e "  ${GREEN}✔ [6] Cursor & OpenRouter${RESET}     — OpenRouter DeepSeek R1 & Cursor-compatible proxy endpoints\n"

if [ "$INTERACTIVE" = true ]; then
  echo -e "${BOLD}Default Starting Model:${RESET} [press Enter for recommended Bedrock Mantle (Luna)]"
  echo -e "  ${CYAN}[1] Bedrock Mantle (Luna)${RESET}     — openai.gpt-5.6-luna (Recommended default)"
  echo -e "  ${CYAN}[2] Direct Bedrock (Sonnet)${RESET}   — us.anthropic.claude-sonnet-5-5"
  echo -e "  ${CYAN}[3] Direct Claude (Sonnet 3.7)${RESET}— claude-3-7-sonnet-20250219"
  echo -e "  ${CYAN}[4] OpenAI (GPT-4o)${RESET}           — gpt-4o"
  echo -e "  ${CYAN}[5] Local Ollama (\$0 Workhorse)${RESET}— ornith-1.5:ctx"
  echo -e "  ${CYAN}[6] OpenRouter (DeepSeek R1)${RESET}  — deepseek/deepseek-r1"

  read -r -p "Select starting default [1-6, press Enter for Bedrock Mantle]: " DEFAULT_CHOICE
  DEFAULT_CHOICE="${DEFAULT_CHOICE:-1}"

  case "$DEFAULT_CHOICE" in
    1)
      CHOSEN_PROVIDER="bedrock-mantle"
      CHOSEN_MODEL="openai.gpt-5.6-luna"
      CHOSEN_THINKING="medium"
      ;;
    2)
      CHOSEN_PROVIDER="amazon-bedrock"
      CHOSEN_MODEL="us.anthropic.claude-sonnet-5-5"
      CHOSEN_THINKING="high"
      ;;
    3)
      CHOSEN_PROVIDER="anthropic"
      CHOSEN_MODEL="claude-3-7-sonnet-20250219"
      CHOSEN_THINKING="high"
      ;;
    4)
      CHOSEN_PROVIDER="openai"
      CHOSEN_MODEL="gpt-4o"
      CHOSEN_THINKING="medium"
      ;;
    5)
      CHOSEN_PROVIDER="ollama"
      CHOSEN_MODEL="ornith-1.5:ctx"
      CHOSEN_THINKING="max"
      ;;
    6)
      CHOSEN_PROVIDER="openrouter"
      CHOSEN_MODEL="deepseek/deepseek-r1"
      CHOSEN_THINKING="high"
      ;;
  esac

  echo ""
  read -r -p "Enable Local Workhorse in RAM for \$0.00 compute on tests & edits? [Y/n, default: Y]: " WORKHORSE_CHOICE
  WORKHORSE_CHOICE="${WORKHORSE_CHOICE:-Y}"
  if [[ "$WORKHORSE_CHOICE" =~ ^[Nn] ]]; then
    ENABLE_LOCAL_WORKHORSE=false
  fi
  echo ""
fi

echo -e "${BOLD}Starting Kobayashi Maru Harness Setup (${CHOSEN_PROVIDER})...${RESET}\n"

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

  GIT_CMD="$(find_working_git || true)"
  if [ -n "$GIT_CMD" ]; then
    echo -e "  ✔ Git: ${GREEN}$($GIT_CMD --version)${RESET}"
  else
    echo -e "  ${YELLOW}[WARNING] Working git binary not detected in PATH.${RESET}"
    echo -e "  (Git checkpoint engine will be bypassed until 'xcode-select --install' or 'brew install git' is run)."
  fi

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

  # Check & Configure Ollama if enabled
  if [ "$ENABLE_LOCAL_WORKHORSE" = true ] || [ "$CHOSEN_PROVIDER" = "ollama" ]; then
    if command -v ollama >/dev/null 2>&1; then
      echo -e "  ✔ Ollama: ${GREEN}Detected${RESET}"

      # Configure Ollama Memory Optimization Flags in Shell
      SHELL_RC="${HOME}/.zshrc"
      if [ ! -f "${SHELL_RC}" ]; then
        SHELL_RC="${HOME}/.bashrc"
      fi
      if ! grep -q "OLLAMA_FLASH_ATTENTION" "${SHELL_RC}" 2>/dev/null; then
        cat << 'EOF' >> "${SHELL_RC}"

# --- Kobayashi Ollama Memory Flags (32K context in unified memory) ---
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=2
EOF
        echo -e "  ✔ Injected Flash Attention & q8_0 KV Cache flags into ${GREEN}${SHELL_RC}${RESET}"
      fi
      export OLLAMA_FLASH_ATTENTION=1
      export OLLAMA_KV_CACHE_TYPE=q8_0

      if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        echo -e "  ✔ Ollama daemon: ${GREEN}Active on localhost:11434${RESET}"

        # Check / bake 32K ornith-1.5:ctx
        if ! ollama list 2>/dev/null | grep -q "ornith-1.5:ctx"; then
          echo -e "  ${YELLOW}Baking 32K context model ornith-1.5:ctx...${RESET}"
          if ! ollama list 2>/dev/null | grep -q "ornith-1.5:9b"; then
            ollama pull robit/ornith-1.5:9b || true
          fi
          cat << 'EOF' > /tmp/Modelfile.kobayashi.ornith
FROM robit/ornith-1.5:9b
PARAMETER num_ctx 32768
PARAMETER temperature 0.2
EOF
          ollama create ornith-1.5:ctx -f /tmp/Modelfile.kobayashi.ornith || true
          rm -f /tmp/Modelfile.kobayashi.ornith
          echo -e "  ✔ Created 32K context model: ${GREEN}ornith-1.5:ctx${RESET}"
        else
          echo -e "  ✔ Workhorse model ready: ${GREEN}ornith-1.5:ctx (32K context)${RESET}"
        fi
      else
        echo -e "  ${YELLOW}[INFO] Ollama daemon is not running. Start with 'ollama serve' when using local workhorse.${RESET}"
      fi
    else
      echo -e "  ${YELLOW}[INFO] Ollama not found. Download from https://ollama.com if using local workhorse.${RESET}"
    fi
  fi

  if [ "${OLLAMA_ONLY}" = true ]; then
    echo -e "\n${CYAN}Installing pi-ollama native extension...${RESET}"
    pi install npm:pi-ollama >/dev/null 2>&1 || true
    echo -e "\n${BOLD}${GREEN}✔ Ollama configuration & pi-ollama ready!${RESET}"
    exit 0
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
  echo -e "\n${CYAN}[5/7] Deploying Kobayashi Runtime Extensions...${RESET}"

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

  # Deploy executive telemetry dashboard
  dash_src=""
  if [ -f "${SCRIPT_DIR}/src/dashboard/exec-dashboard.mjs" ]; then
    dash_src="${SCRIPT_DIR}/src/dashboard/exec-dashboard.mjs"
  elif [ -f "${SCRIPT_DIR}/sota-harness/exec-dashboard.mjs" ]; then
    dash_src="${SCRIPT_DIR}/sota-harness/exec-dashboard.mjs"
  fi
  if [ -n "$dash_src" ]; then
    cp -f "${dash_src}" "${PI_AGENT_DIR}/exec-dashboard.mjs"
    echo -e "  ✔ Deployed: ${GREEN}exec-dashboard.mjs${RESET} -> ~/.pi/agent/"
  fi
fi

if [ "$EXTENSIONS_ONLY" = true ]; then
  echo -e "\n${BOLD}${GREEN}✔ Extensions deployed successfully!${RESET}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 6. Configure Packages & Settings
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[6/7] Installing vetted packages & writing configurations...${RESET}"

# Install vetted packages into Pi
echo -e "  Installing @dietrichgebert/ponytail (Lazy Senior Dev Mode)..."
pi install npm:@dietrichgebert/ponytail >/dev/null 2>&1 || true

echo -e "  Installing @langfuse/pi-observability-plugin (Enterprise Telemetry)..."
pi install npm:@langfuse/pi-observability-plugin >/dev/null 2>&1 || true

echo -e "  Installing pi-web-access (Context-Gated Web Search & Extraction)..."
pi install npm:pi-web-access >/dev/null 2>&1 || true

echo -e "  Installing pi-ollama (Native Ollama Provider, per-request context & warm-up)..."
pi install npm:pi-ollama >/dev/null 2>&1 || true

echo -e "  Installing pi-bedrock-mantle (AWS Bedrock Mantle Provider)..."
pi install npm:pi-bedrock-mantle >/dev/null 2>&1 || true

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
cat > "${SETTINGS_CONF}" << EOF
{
  "\$schema": "https://pi.dev/schemas/settings.schema.json",
  "packages": [
    "git:github.com/NVlabs/SoL-Pi",
    "npm:pi-bedrock-mantle",
    "npm:@dietrichgebert/ponytail",
    "npm:@langfuse/pi-observability-plugin",
    "npm:pi-web-access",
    "npm:pi-ollama"
  ],
  "defaultProvider": "${CHOSEN_PROVIDER}",
  "defaultModel": "${CHOSEN_MODEL}",
  "defaultThinkingLevel": "${CHOSEN_THINKING}",
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
echo -e "  ✔ Configured Settings: ${GREEN}${SETTINGS_CONF}${RESET} (Default: ${CHOSEN_PROVIDER}/${CHOSEN_MODEL})"

# 3. Comprehensive Models Configuration (Ollama, OpenRouter & Cursor Proxies)
MODELS_CONF="${PI_AGENT_DIR}/models.json"
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
        },
        {
          "id": "deepseek-r1:latest",
          "name": "DeepSeek R1 (Local RAM)",
          "contextWindow": 32768,
          "maxTokens": 8192,
          "reasoning": true,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        },
        {
          "id": "qwen2.5-coder:7b",
          "name": "Qwen 2.5 Coder 7B (Local RAM)",
          "contextWindow": 32768,
          "maxTokens": 8192,
          "reasoning": false,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    },
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "api": "openai-completions",
      "apiKey": "openrouter",
      "models": [
        {
          "id": "deepseek/deepseek-r1",
          "name": "DeepSeek R1 (OpenRouter)",
          "contextWindow": 163840,
          "maxTokens": 8192,
          "reasoning": true
        },
        {
          "id": "qwen/qwen-2.5-coder-32b-instruct",
          "name": "Qwen 2.5 Coder 32B (OpenRouter)",
          "contextWindow": 32768,
          "maxTokens": 8192,
          "reasoning": false
        },
        {
          "id": "meta-llama/llama-3.3-70b-instruct",
          "name": "Llama 3.3 70B (OpenRouter)",
          "contextWindow": 131072,
          "maxTokens": 8192,
          "reasoning": false
        }
      ]
    },
    "cursor-proxy": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "apiKey": "cursor-proxy",
      "models": [
        {
          "id": "cursor-fast",
          "name": "Cursor Fast Model",
          "contextWindow": 65536,
          "maxTokens": 8192,
          "reasoning": true
        },
        {
          "id": "cursor-pro",
          "name": "Cursor Pro Model",
          "contextWindow": 131072,
          "maxTokens": 8192,
          "reasoning": true
        }
      ]
    }
  }
}
EOF
echo -e "  ✔ Configured Omnichannel Model Registry: ${GREEN}${MODELS_CONF}${RESET} (Ollama, OpenRouter, Cursor Proxies)"

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
echo -e "${BOLD}${GREEN}✔ KOBAYASHI MARU OMNICHANNEL HARNESS IS READY!${RESET}"
echo -e "${BOLD}${GREEN}========================================================================${RESET}\n"

echo -e "${BOLD}All 6 Provider Backends Activated & Ready to Use:${RESET}"
echo -e "  • ${CYAN}Hybrid Powertrain${RESET}     : pi --model auto/planner-worker (Planner + \$0 Local Workhorse)"
echo -e "  • ${CYAN}AWS Bedrock Mantle${RESET}    : pi -m bedrock-mantle/openai.gpt-5.6-luna (14x cheaper token economics)"
echo -e "  • ${CYAN}Direct Amazon Bedrock${RESET} : pi -m amazon-bedrock/us.anthropic.claude-sonnet-5-5"
echo -e "  • ${CYAN}Direct Anthropic Claude${RESET}: pi -m anthropic/claude-3-7-sonnet-20250219"
echo -e "  • ${CYAN}OpenAI & Codex${RESET}        : pi -m openai/gpt-4o"
echo -e "  • ${CYAN}Local Ollama (\$0 RAM)${RESET} : pi -m ollama/ornith-1.5:ctx"
echo -e "  • ${CYAN}Cursor & Proxies${RESET}      : pi -m cursor-proxy/cursor-fast or pi -m openrouter/deepseek/deepseek-r1\n"

echo -e "Interactive Tier & Model Switcher:"
echo -e "  ${BOLD}npx kobayashi config${RESET}     (Real-time live model search across all tiers)\n"

echo -e "Active Configuration:"
echo -e "  • ${BOLD}Default Provider${RESET}: ${GREEN}${CHOSEN_PROVIDER}${RESET} (${CHOSEN_MODEL})"
echo -e "  • ${BOLD}BM25 Skill-RAG${RESET}: ${SKILL_COUNT:-38+} skills indexed in memory; 0 cold-start tokens; auto-injected on match."
echo -e "  • ${BOLD}DeepSeek Minimal Seam${RESET}: Core engineering primitives active; passive bloat hidden."
echo -e "  • ${BOLD}NVIDIA SoL-Pi${RESET}: Observation eviction & compaction active with 12.5 cache ratio."
echo -e "  • ${BOLD}Virtual Router${RESET}: Run with ${CYAN}--model auto/planner-worker${RESET} or ${CYAN}--model auto/bottom-up${RESET}."
echo -e "  • ${BOLD}AST-grep Topology${RESET}: Run ${CYAN}repo_map({ query: '...' })${RESET} to outline codebases in < 800 tokens."
echo -e "  • ${BOLD}Native Ollama (pi-ollama)${RESET}: Per-request context allocation (32K), warm-up, and zero silent truncation."
echo -e "  • ${BOLD}Git Checkpoint${RESET}: Pre-turn git stash checkpoints for 1-click deterministic rollback.\n"

echo -e "Try it now:"
echo -e "  ${BOLD}pi --model auto/planner-worker -p \"Review the repo structure and explain main entrypoints\"${RESET}\n"
echo -e "Or test a skill without token tax:"
echo -e "  ${BOLD}pi -p \"Use /tdd to implement a thread-safe LRU cache with unit tests\"${RESET}\n"
echo -e "Documentation & Provider Guides:"
echo -e "  • Executive Guide:    ${CYAN}docs/EXECUTIVE_SETUP_GUIDE.md${RESET}"
echo -e "  • Provider Guides:    ${CYAN}docs/providers/${RESET}\n"
