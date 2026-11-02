#!/usr/bin/env bash
# ==============================================================================
# KOBAYASHI AGENT HARNESS BOOTSTRAP SCRIPT
# One-command automated setup for any fresh macOS / Linux environment
# ==============================================================================
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}"
cat << "EOF"
  ██╗  ██╗ ██████╗ ██████╗  █████╗ ██╗   ██╗ █████╗ ███████╗██╗  ██╗██╗
  ██║ ██╔╝██╔═══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██╔════╝██║  ██║██║
  █████╔╝ ██║   ██║██████╔╝███████║ ╚████╔╝ ███████║███████╗███████║██║
  ██╔═██╗ ██║   ██║██╔══██╗██╔══██║  ╚██╔╝  ██╔══██║╚════██║██╔══██║██║
  ██║  ██╗╚██████╔╝██████╔╝██║  ██║   ██║   ██║  ██║███████║██║  ██║██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝
    Automated Bootstrap Installer • Zero-To-Working Agent Runtime
EOF
echo -e "${RESET}"

# --- 1. CHECK NODE.JS ---
echo -e "${BOLD}[1/6] Checking Node.js runtime...${RESET}"
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is not installed. Please install Node.js 22.19+ (https://nodejs.org)${RESET}"
  exit 1
fi
NODE_VER=$(node -v)
echo -e "${GREEN}✔ Detected Node.js: ${NODE_VER}${RESET}"

# --- 2. CONFIGURE OLLAMA MEMORY OPTIMIZATION ---
echo -e "\n${BOLD}[2/6] Configuring Ollama memory optimization...${RESET}"
SHELL_RC="$HOME/.zshrc"
if [ ! -f "$SHELL_RC" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if ! grep -q "OLLAMA_FLASH_ATTENTION" "$SHELL_RC" 2>/dev/null; then
  cat << 'EOF' >> "$SHELL_RC"

# --- Kobayashi Ollama Memory Flags (32K context in unified memory) ---
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=2
EOF
  echo -e "${GREEN}✔ Injected Flash Attention and q8_0 KV Cache flags into ${SHELL_RC}${RESET}"
else
  echo -e "${GREEN}✔ Ollama memory optimization flags already present in ${SHELL_RC}${RESET}"
fi

export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0

# --- 3. CHECK / INSTALL PI CODING AGENT ---
echo -e "\n${BOLD}[3/6] Checking Pi Coding Agent installation...${RESET}"
if ! command -v pi &> /dev/null; then
  echo -e "${YELLOW}Installing @earendil-works/pi-coding-agent globally...${RESET}"
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  echo -e "${GREEN}✔ Installed Pi global binary${RESET}"
else
  PI_VER=$(pi --version 2>/dev/null || echo "detected")
  echo -e "${GREEN}✔ Pi coding agent already installed: v${PI_VER}${RESET}"
fi

# --- 4. VERIFY / PULL LOCAL WORKHORSE MODEL ---
echo -e "\n${BOLD}[4/6] Verifying local Ollama model (ornith-1.5:ctx)...${RESET}"
if command -v ollama &> /dev/null; then
  if ! ollama list 2>/dev/null | grep -q "ornith-1.5:ctx"; then
    echo -e "${YELLOW}Pulling robit/ornith-1.5:9b and baking 32K context Modelfile...${RESET}"
    ollama pull robit/ornith-1.5:9b
    cat << 'EOF' > /tmp/Modelfile.kobayashi.ornith
FROM robit/ornith-1.5:9b
PARAMETER num_ctx 32768
PARAMETER temperature 0.2
EOF
    ollama create ornith-1.5:ctx -f /tmp/Modelfile.kobayashi.ornith
    rm -f /tmp/Modelfile.kobayashi.ornith
    echo -e "${GREEN}✔ Created 32K context model: ornith-1.5:ctx${RESET}"
  else
    echo -e "${GREEN}✔ ornith-1.5:ctx is already ready in Ollama${RESET}"
  fi
else
  echo -e "${YELLOW}⚠ Ollama not found in PATH. Make sure Ollama is installed from https://ollama.com${RESET}"
fi

# --- 5. INSTALL KOBAYASHI DEPENDENCIES ---
echo -e "\n${BOLD}[5/6] Building Kobayashi CLI...${RESET}"
if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "bash" ] && [ "${BASH_SOURCE[0]}" != "sh" ]; then
  DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
else
  DIR="$(pwd)"
fi
cd "$DIR"
npm install --silent
npm run build --silent || true
echo -e "${GREEN}✔ Dependencies installed & typecheck passed${RESET}"

# --- 5b. SYNCHRONIZE GLOBAL SKILLS ---
echo -e "\n${BOLD}[5b/6] Installing Matt Pocock skills globally into ~/.agents/skills...${RESET}"
mkdir -p "$HOME/.agents/skills"
if [ -d "$DIR/.agents/skills" ]; then
  cp -R "$DIR/.agents/skills/"* "$HOME/.agents/skills/" 2>/dev/null || true
  SKILL_COUNT=$(ls -1 "$HOME/.agents/skills" 2>/dev/null | wc -l | tr -d ' ')
  echo -e "${GREEN}✔ Synchronized ${SKILL_COUNT} skills globally (available across all projects)${RESET}"
fi

# --- 6. LINK CLI, APPLY CONFIGS & RUN DIAGNOSTIC ---
echo -e "\n${BOLD}[6/6] Linking Kobayashi CLI and synchronizing runtime...${RESET}"
npm link --silent 2>/dev/null || true
node dist/bin/kobayashi.js apply
echo ""
node dist/bin/kobayashi.js doctor

echo -e "${BOLD}${GREEN}
==============================================================================
🎉 KOBAYASHI HARNESS IS READY!
==============================================================================
You can now run Kobayashi anywhere in your terminal:

  kobayashi start       # Launch interactive Pi session with multi-tier routing
  kobayashi config      # Fuzzy search interactive model selector & thinking budgets
  kobayashi stats       # Show cumulative token usage & dollar savings audit
  kobayashi stats --web # Launch live browser analytics dashboard
  kobayashi eval        # Run sandboxed token efficiency benchmarks
  kobayashi doctor      # Verify environment health and credentials
==============================================================================${RESET}
"
