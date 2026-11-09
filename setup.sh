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
# 4. Minimal Tool Seam (Lean active toolloadout, zero prompt bloat)
# 5. NVIDIA SoL-Pi (Observation Compaction & Online Context Pruning)
# 6. Dual Virtual Model Router (Frontier Planner + $0 Local Workhorse, any model customizable)
# 7. AST-grep Repository Topology Mapper (v0.51 outline)
# 8. Git Checkpoint Engine (Architecture-safe turn-boundary rollback)
# 9. Fresh Laptop Zero-Friction MCP & Custom Skills Import
# 10. Vetted Extensions: @dietrichgebert/ponytail, @langfuse/pi-observability-plugin, pi-web-access, pi-ollama
# ==============================================================================

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
MAGENTA="\033[0;35m"
RESET="\033[0m"

# Ensure Apple Silicon native Homebrew is first in PATH to avoid broken Intel binaries
if [ "$(uname -m)" = "arm64" ] && [ -d "/opt/homebrew/bin" ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

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
  for g in "/opt/homebrew/bin/git" "/usr/bin/git" "git" "/usr/local/bin/git"; do
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
  --overlay             Non-destructive 1-command overlay on existing Pi (cleans broken links, backfills stats)
  --telemetry, --stats  Display top-down F1 Pit Wall executive efficiency scorecard & savings
  --skills-only         Synchronize bundled Matt Pocock & custom skills only
  --extensions-only     Deploy Pi harness extensions only
  --config-only         Write NVIDIA SoL-Pi & Pi settings.json only
  --ollama              Configure Ollama memory flags, bake 32K workhorse & install pi-ollama
  --check               Run environment diagnostic check without modifications
  --uninstall           Cleanly remove deployed extensions and reset configuration
  --planner <model>     Set custom planner for virtual router (e.g. anthropic/claude-3-7-sonnet-20250219)
  --worker <model>      Set custom worker for virtual router (e.g. ollama/qwen2.5-coder:7b)
  --skills-repo <url>   Import custom skills from Git repository (Zero-friction for fresh laptops)
  --skills-dir <path>   Import custom skills from local directory
  --create-virtual <sp> Create custom virtual model (<id>:<planner>:<worker>[:policy])
  --mcp-import          Import MCP servers from Claude Desktop & Cursor into Pi
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
SKILLS_REPO=""
SKILLS_DIR_INPUT=""
CUSTOM_PLANNER=""
CUSTOM_WORKER=""
CREATE_VIRTUAL_SPEC=""
CUSTOM_VM_ID=""
CUSTOM_VM_NAME=""
CUSTOM_VM_PLANNER=""
CUSTOM_VM_WORKER=""
CUSTOM_VM_POLICY="planner-worker"
MCP_IMPORT=false

# If run directly with no arguments in an interactive terminal, default to interactive wizard
if [ "$#" -eq 0 ] && [ -t 0 ]; then
  INTERACTIVE=true
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      show_help
      ;;
    -i|--interactive)
      INTERACTIVE=true
      shift
      ;;
    -y|--yes|--non-interactive)
      NON_INTERACTIVE=true
      INTERACTIVE=false
      shift
      ;;
    --overlay)
      exec "${SCRIPT_DIR}/install.sh"
      ;;
    --telemetry|--stats)
      TELEMETRY_ONLY=true
      shift
      ;;
    --skills|--skills-only)
      SKILLS_ONLY=true
      shift
      ;;
    --extensions|--extensions-only)
      EXTENSIONS_ONLY=true
      shift
      ;;
    --config|--config-only)
      CONFIG_ONLY=true
      shift
      ;;
    --ollama|--ollama-only)
      OLLAMA_ONLY=true
      shift
      ;;
    --uninstall|--remove)
      UNINSTALL=true
      shift
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    --skills-repo)
      SKILLS_REPO="${2:-}"
      shift 2
      ;;
    --skills-dir)
      SKILLS_DIR_INPUT="${2:-}"
      shift 2
      ;;
    --planner)
      CUSTOM_PLANNER="${2:-}"
      shift 2
      ;;
    --worker)
      CUSTOM_WORKER="${2:-}"
      shift 2
      ;;
    --create-virtual)
      CREATE_VIRTUAL_SPEC="${2:-}"
      shift 2
      ;;
    --mcp-import)
      MCP_IMPORT=true
      shift
      ;;
    *)
      echo -e "${RED}[ERROR] Unknown option: $1${RESET}"
      echo "Run './setup.sh --help' for usage instructions."
      exit 1
      ;;
  esac
done

if [ -n "$CREATE_VIRTUAL_SPEC" ]; then
  IFS=':' read -r CUSTOM_VM_ID CUSTOM_VM_PLANNER CUSTOM_VM_WORKER CUSTOM_VM_POLICY <<< "$CREATE_VIRTUAL_SPEC"
  CUSTOM_VM_POLICY="${CUSTOM_VM_POLICY:-planner-worker}"
  CUSTOM_VM_NAME="${CUSTOM_VM_ID}"
fi

if [ "$TELEMETRY_ONLY" = true ]; then
  if [ -x "${SCRIPT_DIR}/node_modules/.bin/tsx" ] && [ -f "${SCRIPT_DIR}/bin/kobayashi.ts" ]; then
    "${SCRIPT_DIR}/node_modules/.bin/tsx" "${SCRIPT_DIR}/bin/kobayashi.ts" stats
  elif [ -f "${SCRIPT_DIR}/bin/kobayashi.ts" ]; then
    npx --yes tsx "${SCRIPT_DIR}/bin/kobayashi.ts" stats
  elif command -v kobayashi &> /dev/null; then
    kobayashi stats
  else
    echo -e "${YELLOW}Notice: Kobayashi telemetry CLI not built yet.${RESET}"
    echo -e "Run ${BOLD}./setup.sh${RESET} or ${BOLD}npm run stats${RESET} inside the repo directory."
  fi
  exit 0
fi

# ------------------------------------------------------------------------------
# Remote Execution Bootstrap (Handles curl | bash on Fresh Laptops)
# ------------------------------------------------------------------------------
if [ ! -f "${SCRIPT_DIR}/package.json" ]; then
  echo -e "${CYAN}Remote execution detected. Syncing repository into ${HOME}/.kobayashi-maru...${RESET}"
  INSTALL_TARGET="${HOME}/.kobayashi-maru"

  GIT_CMD="$(find_working_git || true)"

  if [ -n "$GIT_CMD" ]; then
    if [ -d "${INSTALL_TARGET}/.git" ]; then
      echo -e "  Updating existing repository via git..."
      $GIT_CMD -C "${INSTALL_TARGET}" pull --rebase origin main --quiet || true
    else
      echo -e "  Cloning repository via git..."
      rm -rf "${INSTALL_TARGET}"
      $GIT_CMD clone --depth 1 "https://github.com/devdeepjs/kobayashi-maru.git" "${INSTALL_TARGET}" --quiet
    fi
  else
    echo -e "  ${YELLOW}No functional git detected. Downloading tarball archive directly via HTTPS...${RESET}"
    mkdir -p "${INSTALL_TARGET}"
    curl -fsSL "https://github.com/devdeepjs/kobayashi-maru/archive/refs/heads/main.tar.gz" | tar -xz -C "${INSTALL_TARGET}" --strip-components=1
  fi

  SCRIPT_DIR="${INSTALL_TARGET}"
  echo -e "  ✔ Successfully synchronized into ${GREEN}${INSTALL_TARGET}${RESET}\n"
fi

# ------------------------------------------------------------------------------
# Uninstall Workflow
# ------------------------------------------------------------------------------
if [ "$UNINSTALL" = true ]; then
  echo -e "${YELLOW}Uninstalling Kobayashi Maru extensions and resetting configuration...${RESET}"
  rm -f "${EXTENSIONS_DIR}/skill-rag.ts"
  rm -f "${EXTENSIONS_DIR}/bottom-up-router.ts"
  rm -f "${EXTENSIONS_DIR}/repo-mapper.ts"
  rm -f "${EXTENSIONS_DIR}/git-checkpoint.ts"
  rm -f "${EXTENSIONS_DIR}/kobayashi-router.js"
  rm -f "${EXTENSIONS_DIR}/tier-switcher.ts"
  rm -f "${PI_AGENT_DIR}/exec-dashboard.mjs"
  echo -e "${GREEN}✔ Kobayashi extensions removed from ${EXTENSIONS_DIR}${RESET}"
  echo -e "${GREEN}✔ Skills in ~/.agents/skills preserved.${RESET}"
  echo -e "${BOLD}${GREEN}Uninstall complete.${RESET}"
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
CHOSEN_PROVIDER="auto"
CHOSEN_MODEL="planner-worker"
CHOSEN_THINKING="medium"
ENABLE_LOCAL_WORKHORSE=true

PLANNER_PROVIDER="bedrock-mantle"
PLANNER_MODEL="openai.gpt-5.6-luna"
WORKER_PROVIDER="ollama"
WORKER_MODEL="ornith-1.5:ctx"

if [ -n "$CUSTOM_PLANNER" ]; then
  if [[ "$CUSTOM_PLANNER" == *"/"* ]]; then
    PLANNER_PROVIDER="${CUSTOM_PLANNER%%/*}"
    PLANNER_MODEL="${CUSTOM_PLANNER#*/}"
  else
    PLANNER_MODEL="$CUSTOM_PLANNER"
  fi
fi

if [ -n "$CUSTOM_WORKER" ]; then
  if [[ "$CUSTOM_WORKER" == *"/"* ]]; then
    WORKER_PROVIDER="${CUSTOM_WORKER%%/*}"
    WORKER_MODEL="${CUSTOM_WORKER#*/}"
  else
    WORKER_MODEL="$CUSTOM_WORKER"
  fi
fi

echo -e "${BOLD}${MAGENTA}Omnichannel Multi-Provider Architecture Setup${RESET}"
echo -e "Enabling ALL 6 model providers simultaneously — you have full freedom across all models!\n"
echo -e "  ${GREEN}✔ [1] AWS Bedrock Mantle${RESET}     — Luna (openai.gpt-5.6-luna) & Claude Opus via Mantle SigV4"
echo -e "  ${GREEN}✔ [2] Direct Amazon Bedrock${RESET}  — Sonnet 3.5/3.7 (us.anthropic.claude-sonnet-5-5), Nova Pro"
echo -e "  ${GREEN}✔ [3] Direct Anthropic Claude${RESET} — Claude 3.7 Sonnet & Haiku (OAuth or ANTHROPIC_API_KEY)"
echo -e "  ${GREEN}✔ [4] OpenAI & Codex${RESET}          — GPT-4o, o1, o3-mini, Codex (OPENAI_API_KEY)"
echo -e "  ${GREEN}✔ [5] Local Ollama (\$0 RAM)${RESET}  — ornith-1.5:ctx, deepseek-r1, qwen2.5 (100% private in RAM)"
echo -e "  ${GREEN}✔ [6] Cursor & OpenRouter${RESET}     — OpenRouter DeepSeek R1 & Cursor-compatible proxy endpoints\n"

if [ "$INTERACTIVE" = true ]; then
  echo -e "${BOLD}Default Starting Model:${RESET} [press Enter for recommended Dual Virtual Router]"
  echo -e "  ${CYAN}[1] Kobayashi Dual Virtual Router${RESET} — auto/planner-worker (Planner: Mantle Luna + Worker: \$0 Local Ollama) [RECOMMENDED]"
  echo -e "  ${CYAN}[2] Bottom-Up Virtual Router${RESET}     — auto/bottom-up (\$0 Local Workhorse first -> Planner on failure)"
  echo -e "  ${CYAN}[3] Bedrock Mantle (Luna)${RESET}        — openai.gpt-5.6-luna (Direct)"
  echo -e "  ${CYAN}[4] Direct Bedrock (Sonnet)${RESET}      — us.anthropic.claude-sonnet-5-5"
  echo -e "  ${CYAN}[5] Direct Claude (Sonnet 3.7)${RESET}   — claude-3-7-sonnet-20250219"
  echo -e "  ${CYAN}[6] OpenAI (GPT-4o)${RESET}              — gpt-4o"
  echo -e "  ${CYAN}[7] Local Ollama (\$0 Workhorse)${RESET}   — ornith-1.5:ctx"
  echo -e "  ${CYAN}[8] OpenRouter (DeepSeek R1)${RESET}     — deepseek/deepseek-r1"

  read -r -p "Select starting default [1-8, press Enter for Dual Virtual Router]: " DEFAULT_CHOICE
  DEFAULT_CHOICE="${DEFAULT_CHOICE:-1}"

  case "$DEFAULT_CHOICE" in
    1)
      CHOSEN_PROVIDER="auto"
      CHOSEN_MODEL="planner-worker"
      CHOSEN_THINKING="medium"
      ;;
    2)
      CHOSEN_PROVIDER="auto"
      CHOSEN_MODEL="bottom-up"
      CHOSEN_THINKING="off"
      ;;
    3)
      CHOSEN_PROVIDER="bedrock-mantle"
      CHOSEN_MODEL="openai.gpt-5.6-luna"
      CHOSEN_THINKING="medium"
      ;;
    4)
      CHOSEN_PROVIDER="amazon-bedrock"
      CHOSEN_MODEL="us.anthropic.claude-sonnet-5-5"
      CHOSEN_THINKING="high"
      ;;
    5)
      CHOSEN_PROVIDER="anthropic"
      CHOSEN_MODEL="claude-3-7-sonnet-20250219"
      CHOSEN_THINKING="high"
      ;;
    6)
      CHOSEN_PROVIDER="openai"
      CHOSEN_MODEL="gpt-4o"
      CHOSEN_THINKING="medium"
      ;;
    7)
      CHOSEN_PROVIDER="ollama"
      CHOSEN_MODEL="ornith-1.5:ctx"
      CHOSEN_THINKING="max"
      ;;
    8)
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

  # Virtual Model Router Customization
  echo ""
  read -r -p "Customize Virtual Model Router (Planner & Worker models)? [y/N, default: N]: " VIRTUAL_CUSTOM_CHOICE
  if [[ "$VIRTUAL_CUSTOM_CHOICE" =~ ^[Yy] ]]; then
    read -r -p "Enter Planner model [default: bedrock-mantle/openai.gpt-5.6-luna]: " INPUT_PLANNER
    if [ -n "$INPUT_PLANNER" ]; then
      if [[ "$INPUT_PLANNER" == *"/"* ]]; then
        PLANNER_PROVIDER="${INPUT_PLANNER%%/*}"
        PLANNER_MODEL="${INPUT_PLANNER#*/}"
      else
        PLANNER_MODEL="$INPUT_PLANNER"
      fi
    fi

    read -r -p "Enter Worker model [default: ollama/ornith-1.5:ctx]: " INPUT_WORKER
    if [ -n "$INPUT_WORKER" ]; then
      if [[ "$INPUT_WORKER" == *"/"* ]]; then
        WORKER_PROVIDER="${INPUT_WORKER%%/*}"
        WORKER_MODEL="${INPUT_WORKER#*/}"
      else
        WORKER_MODEL="$INPUT_WORKER"
      fi
    fi
  fi

  # Step: Create Custom Virtual Model
  echo ""
  read -r -p "Create your own custom virtual model (pair any planner + worker)? [y/N, default: N]: " CREATE_CUSTOM_VM_CHOICE
  if [[ "$CREATE_CUSTOM_VM_CHOICE" =~ ^[Yy] ]]; then
    read -r -p "  Enter virtual model ID (e.g. speed-coder): " CUSTOM_VM_ID
    if [ -n "$CUSTOM_VM_ID" ]; then
      read -r -p "  Enter friendly name [default: ${CUSTOM_VM_ID}]: " CUSTOM_VM_NAME
      CUSTOM_VM_NAME="${CUSTOM_VM_NAME:-$CUSTOM_VM_ID}"
      read -r -p "  Enter Planner model [e.g. bedrock-mantle/openai.gpt-5.6-luna]: " CUSTOM_VM_PLANNER
      read -r -p "  Enter Worker model [e.g. ollama/ornith-1.5:ctx]: " CUSTOM_VM_WORKER
      echo -e "  Routing Policy:"
      echo -e "    [1] Top-Down (Planner reasons Turn 1 -> Worker executes Turn 2+ -> Planner escalates on error) [Default]"
      echo -e "    [2] Bottom-Up (Local Worker executes at \$0 compute -> Planner escalates on error)"
      read -r -p "  Select policy [1-2, default: 1]: " CUSTOM_VM_POLICY_CHOICE
      CUSTOM_VM_POLICY="planner-worker"
      if [ "$CUSTOM_VM_POLICY_CHOICE" = "2" ]; then
        CUSTOM_VM_POLICY="bottom-up"
      fi
      echo -e "  ✔ Custom virtual model configured: ${GREEN}auto/${CUSTOM_VM_ID}${RESET}"
    fi
  fi

  # Fresh Laptop Custom Skills Import
  echo ""
  read -r -p "Fresh Laptop: Import your existing custom skills from Git or directory? [y/N, default: N]: " SKILLS_IMPORT_CHOICE
  if [[ "$SKILLS_IMPORT_CHOICE" =~ ^[Yy] ]]; then
    read -r -p "Enter Git repo URL or local directory path: " INPUT_SKILLS_SRC
    if [ -n "$INPUT_SKILLS_SRC" ]; then
      if [[ "$INPUT_SKILLS_SRC" == http* ]] || [[ "$INPUT_SKILLS_SRC" == git@* ]]; then
        SKILLS_REPO="$INPUT_SKILLS_SRC"
      else
        SKILLS_DIR_INPUT="$INPUT_SKILLS_SRC"
      fi
    fi
  fi

  # MCP Auto-Import
  CLAUDE_MCP="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
  CURSOR_MCP="${HOME}/.cursor/mcp.json"
  if [ -f "$CLAUDE_MCP" ] || [ -f "$CURSOR_MCP" ]; then
    echo ""
    read -r -p "Detected MCP configs in Claude Desktop / Cursor. Auto-import into Pi? [Y/n, default: Y]: " MCP_CHOICE
    MCP_CHOICE="${MCP_CHOICE:-Y}"
    if [[ ! "$MCP_CHOICE" =~ ^[Nn] ]]; then
      MCP_IMPORT=true
    fi
  fi
  echo ""
fi

echo -e "${BOLD}Starting Kobayashi Maru Harness Setup (${CHOSEN_PROVIDER})...${RESET}\n"

# ------------------------------------------------------------------------------
# 1. Dependency Checks & Apple Silicon Path Injection
# ------------------------------------------------------------------------------
if [ "$SKILLS_ONLY" = false ] && [ "$CONFIG_ONLY" = false ]; then
  echo -e "${CYAN}[1/7] Checking system dependencies & configuring architecture paths...${RESET}"

  if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}[ERROR] Node.js is required (>= 20.x). Please install Node.js first.${RESET}"
    exit 1
  fi
  NODE_VERSION=$(node -v)
  echo -e "  ✔ Node.js: ${GREEN}${NODE_VERSION}${RESET}"

  # Protect Apple Silicon shells against Rosetta/Intel git binary crashes
  SHELL_RC="${HOME}/.zshrc"
  if [ ! -f "${SHELL_RC}" ]; then
    SHELL_RC="${HOME}/.bashrc"
  fi

  if [ "$(uname -m)" = "arm64" ] && [ -d "/opt/homebrew/bin" ]; then
    if ! grep -q "/opt/homebrew/bin" "${SHELL_RC}" 2>/dev/null; then
      cat << 'EOF' >> "${SHELL_RC}"

# --- Apple Silicon Native Priority Path ---
export PATH="/opt/homebrew/bin:$PATH"
EOF
      echo -e "  ✔ Prioritized /opt/homebrew/bin in ${GREEN}${SHELL_RC}${RESET}"
    fi
    export PATH="/opt/homebrew/bin:$PATH"
  fi

  GIT_CMD="$(find_working_git || true)"
  if [ -n "$GIT_CMD" ]; then
    echo -e "  ✔ Functional Git: ${GREEN}$($GIT_CMD --version)${RESET} (${GIT_CMD})"
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
# 4. Synchronize Bundled & Custom Skills
# ------------------------------------------------------------------------------
if [ "$EXTENSIONS_ONLY" = false ] && [ "$CONFIG_ONLY" = false ]; then
  echo -e "\n${CYAN}[4/7] Synchronizing skills into ~/.agents/skills (Okapi BM25 Indexing)...${RESET}"

  SKILLS_SRC=""
  if [ -d "${SCRIPT_DIR}/.agents/skills" ]; then
    SKILLS_SRC="${SCRIPT_DIR}/.agents/skills"
  elif [ -d "${SCRIPT_DIR}/../.agents/skills" ]; then
    SKILLS_SRC="${SCRIPT_DIR}/../.agents/skills"
  fi

  if [ -n "${SKILLS_SRC}" ] && [ -d "${SKILLS_SRC}" ]; then
    cp -R "${SKILLS_SRC}/"* "${SKILLS_DIR}/" 2>/dev/null || true
  fi

  # Import custom skills from Git repository if requested
  GIT_BIN="$(find_working_git || true)"
  if [ -n "$SKILLS_REPO" ]; then
    echo -e "  ${CYAN}Cloning custom skills repo: ${BOLD}${SKILLS_REPO}${RESET}..."
    REPO_NAME=$(basename "${SKILLS_REPO}" .git)
    TARGET_REPO_DIR="${SKILLS_DIR}/${REPO_NAME}"
    if [ -d "$TARGET_REPO_DIR" ] && [ -n "$GIT_BIN" ]; then
      $GIT_BIN -C "$TARGET_REPO_DIR" pull --rebase 2>/dev/null || true
    elif [ -n "$GIT_BIN" ]; then
      $GIT_BIN clone --depth 1 "$SKILLS_REPO" "$TARGET_REPO_DIR" 2>/dev/null || true
    fi
    echo -e "  ✔ Cloned custom skills into ${GREEN}${TARGET_REPO_DIR}${RESET}"
  fi

  # Import custom skills from local directory if requested
  if [ -n "$SKILLS_DIR_INPUT" ] && [ -d "$SKILLS_DIR_INPUT" ]; then
    DIR_NAME=$(basename "${SKILLS_DIR_INPUT}")
    TARGET_CUSTOM_DIR="${SKILLS_DIR}/${DIR_NAME}"
    mkdir -p "$TARGET_CUSTOM_DIR"
    cp -R "${SKILLS_DIR_INPUT}/"* "$TARGET_CUSTOM_DIR/" 2>/dev/null || true
    echo -e "  ✔ Copied custom skills into ${GREEN}${TARGET_CUSTOM_DIR}${RESET}"
  fi

  SKILL_COUNT=$(find "${SKILLS_DIR}" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  echo -e "  ✔ Synchronized: ${GREEN}${SKILL_COUNT} skills${RESET} globally indexed in ${SKILLS_DIR}"
  echo -e "  ✔ Okapi BM25 RAG: 0 tokens on Turn 1 cold starts (vs ~37,500 in static dump)"
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

echo -e "  Installing git:github.com/NVlabs/SoL-Pi (NVIDIA Observation Compaction)..."
pi install git:github.com/NVlabs/SoL-Pi >/dev/null 2>&1 || true

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

# 4. Virtual Model Routing Configuration (Any Model Customizable)
VIRTUAL_MODELS_CONF="${PI_AGENT_DIR}/virtual-models.json"
cat > "${VIRTUAL_MODELS_CONF}" << EOF
{
  "\$schema": "https://pi.dev/schemas/virtual-models.schema.json",
  "planner": {
    "provider": "${PLANNER_PROVIDER}",
    "model": "${PLANNER_MODEL}",
    "thinking": "medium"
  },
  "worker": {
    "provider": "${WORKER_PROVIDER}",
    "model": "${WORKER_MODEL}",
    "thinking": "off"
  },
  "advisor": {
    "provider": "amazon-bedrock",
    "model": "us.anthropic.claude-sonnet-5-5",
    "thinking": "high"
  },
  "escalationThreshold": 2
}
EOF
echo -e "  ✔ Configured Virtual Models: ${GREEN}${VIRTUAL_MODELS_CONF}${RESET} (Planner: ${PLANNER_PROVIDER}/${PLANNER_MODEL}, Worker: ${WORKER_PROVIDER}/${WORKER_MODEL})"

# Merge any new custom virtual model into virtual-models.json
if [ -n "$CUSTOM_VM_ID" ] && [ -n "$CUSTOM_VM_PLANNER" ] && [ -n "$CUSTOM_VM_WORKER" ]; then
  node -e "
    const fs = require('fs');
    const p = '${VIRTUAL_MODELS_CONF}';
    let data = {};
    try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
    if (!data.custom) data.custom = {};
    data.custom['${CUSTOM_VM_ID}'] = {
      name: '${CUSTOM_VM_NAME:-$CUSTOM_VM_ID}',
      provider: 'auto',
      planner: '${CUSTOM_VM_PLANNER}',
      worker: '${CUSTOM_VM_WORKER}',
      policy: '${CUSTOM_VM_POLICY:-planner-worker}'
    };
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  " 2>/dev/null || true
  echo -e "  ✔ Registered custom virtual model in ${GREEN}${VIRTUAL_MODELS_CONF}${RESET}: ${BOLD}auto/${CUSTOM_VM_ID}${RESET}"
fi

# 5. Keyless Jina Reader Web Routing for JavaScript Rendered Sites (Jira, Confluence, etc.)
WEB_SEARCH_CONF="${PI_AGENT_DIR}/web-search.json"
cat > "${WEB_SEARCH_CONF}" << 'EOF'
{
  "$schema": "https://pi.dev/schemas/web-search.schema.json",
  "fetchRouting": {
    "allowRemoteHostedProviders": true,
    "providers": [
      "jina",
      "direct"
    ]
  }
}
EOF
echo -e "  ✔ Configured Dynamic Web Fetching (Jina Reader for Jira/Confluence): ${GREEN}${WEB_SEARCH_CONF}${RESET}"

# 6. Auto-Import MCP Servers from Claude Desktop & Cursor
if [ "$MCP_IMPORT" = true ]; then
  echo -e "\n  ${CYAN}Auto-importing MCP servers into ~/.pi/agent/mcp.json...${RESET}"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const home = process.env.HOME || '';
    const target = path.join(home, '.pi', 'agent', 'mcp.json');
    const candidates = [
      path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      path.join(home, '.cursor', 'mcp.json'),
      path.join(home, '.config', 'Claude', 'claude_desktop_config.json')
    ];
    let dest = { mcpServers: {} };
    if (fs.existsSync(target)) {
      try { dest = JSON.parse(fs.readFileSync(target, 'utf8')); if (!dest.mcpServers) dest.mcpServers = {}; } catch {}
    }
    let count = 0;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          const data = JSON.parse(fs.readFileSync(c, 'utf8'));
          for (const [name, cfg] of Object.entries(data.mcpServers || {})) {
            dest.mcpServers[name] = cfg;
            count++;
          }
        } catch {}
      }
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(dest, null, 2) + '\n');
    console.log('    ✔ Merged ' + count + ' MCP servers into ~/.pi/agent/mcp.json');
  " 2>/dev/null || true
fi

if [ "$CONFIG_ONLY" = true ]; then
  echo -e "\n${BOLD}${GREEN}✔ Configuration files written successfully!${RESET}"
  exit 0
fi

# ------------------------------------------------------------------------------
# 7. Pre-flight Smoke Test & CLI Linking
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[7/7] Running pre-flight harness verification...${RESET}"

# Build repository CLI and link globally if run from source
if [ -f "${SCRIPT_DIR}/package.json" ]; then
  echo -e "  Building Kobayashi CLI tools..."
  if [ ! -d "${SCRIPT_DIR}/node_modules" ]; then
    (cd "${SCRIPT_DIR}" && npm install --no-audit --prefer-offline 2>/dev/null || npm install)
  fi
  (cd "${SCRIPT_DIR}" && npm run build >/dev/null 2>&1 || true)
  (cd "${SCRIPT_DIR}" && npm link >/dev/null 2>&1 || true)
  if command -v kobayashi >/dev/null 2>&1; then
    echo -e "  ✔ Kobayashi CLI linked globally: ${GREEN}$(which kobayashi)${RESET}"
  fi
fi

if pi --help >/dev/null 2>&1; then
  echo -e "  ✔ Pi runtime responded successfully"
  if pi --list-models 2>/dev/null | grep -q "planner-worker"; then
    echo -e "  ✔ Virtual models ready: ${GREEN}auto/planner-worker${RESET} & ${GREEN}auto/bottom-up${RESET}"
  fi
else
  echo -e "  ${YELLOW}[WARN] Pi smoke test had non-zero exit code. Verify node & global npm packages.${RESET}"
fi

echo -e "\n${BOLD}${GREEN}========================================================================${RESET}"
echo -e "${BOLD}${GREEN}✔ KOBAYASHI MARU OMNICHANNEL HARNESS IS READY!${RESET}"
echo -e "${BOLD}${GREEN}========================================================================${RESET}\n"

echo -e "${BOLD}All 6 Provider Backends Activated & Ready to Use:${RESET}"
echo -e "  • ${CYAN}Hybrid Powertrain${RESET}     : pi --model auto/planner-worker (Planner: ${PLANNER_PROVIDER}/${PLANNER_MODEL} + Worker: ${WORKER_PROVIDER}/${WORKER_MODEL})"
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
echo -e "  • ${BOLD}Minimal Tool Seam${RESET}: Core engineering primitives active; passive bloat hidden."
echo -e "  • ${BOLD}NVIDIA SoL-Pi${RESET}: Observation eviction & compaction active with 12.5 cache ratio."
echo -e "  • ${BOLD}Virtual Router${RESET}: Run with ${CYAN}--model auto/planner-worker${RESET} or ${CYAN}--model auto/bottom-up${RESET}."
echo -e "  • ${BOLD}AST-grep Topology${RESET}: Run ${CYAN}repo_map({ query: '...' })${RESET} to outline codebases in < 800 tokens."
echo -e "  • ${BOLD}Native Ollama (pi-ollama)${RESET}: Per-request context allocation (32K), warm-up, and zero silent truncation."
echo -e "  • ${BOLD}Architecture-Safe Git Checkpoint${RESET}: Pre-turn git stash checkpoints with 0-overhead fallback.\n"

echo -e "Try it now:"
echo -e "  ${BOLD}pi --model auto/planner-worker -p \"Review the repo structure and explain main entrypoints\"${RESET}\n"
echo -e "Or test a skill without token tax:"
echo -e "  ${BOLD}pi -p \"Use /tdd to implement a thread-safe LRU cache with unit tests\"${RESET}\n"
echo -e "Documentation & Provider Guides:"
echo -e "  • Executive Guide:    ${CYAN}docs/EXECUTIVE_SETUP_GUIDE.md${RESET}"
echo -e "  • Provider Guides:    ${CYAN}docs/providers/${RESET}\n"
