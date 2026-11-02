# Local Ollama Zero-Cost Compute Guide 🦙

> **Runtime Provider**: `ollama` (enhanced by `pi-ollama`)  
> **Key Models**: `ornith-1.5:ctx` (32K context), `qwen2.5-coder:32b`, `qwen2.5-coder:14b-16k`  
> **Compute Cost**: **$0.0000 (100% Free Local Execution)**

---

## Overview

The **Local Workhorse** tier runs models directly inside your workstation's unified memory (RAM / Apple Silicon Metal GPU). 
When paired with Kobayashi Maru's Virtual Router (`auto/planner-worker` or `auto/bottom-up`):
- Frontier models handle high-level architecture.
- Local Ollama executes mechanical code edits, runs unit tests, and formats code for **$0.00**.
- **Result**: Slashing cloud AI spend by up to 95.4%.

---

## Step 1: Install Ollama
Download and install Ollama from [ollama.com](https://ollama.com).

Start the Ollama daemon:
```bash
ollama serve
```

---

## Step 2: Apple Silicon Memory Optimization
Add the following performance flags to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_KV_CACHE_TYPE=q8_0
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=2
```

*(These are injected automatically when you run `./setup.sh --ollama` or `./setup.sh`).*

---

## Step 3: Bake the 32K Context Workhorse Model
Kobayashi Maru uses `ornith-1.5:ctx` with an expanded 32,768-token context window:

```bash
ollama pull robit/ornith-1.5:9b

cat << 'EOF' > /tmp/Modelfile.kobayashi.ornith
FROM robit/ornith-1.5:9b
PARAMETER num_ctx 32768
PARAMETER temperature 0.2
EOF

ollama create ornith-1.5:ctx -f /tmp/Modelfile.kobayashi.ornith
rm -f /tmp/Modelfile.kobayashi.ornith
```

---

## Step 4: Native `pi-ollama` Package
Kobayashi Maru installs `npm:pi-ollama`, which communicates with Ollama's native `/api/chat` endpoint:
- **Per-request context**: Allocates exact 32K context.
- **Zero silent truncation**: Rejects context overflows cleanly so NVIDIA SoL-Pi can compact context.
- **Prompt warm-up**: Eliminates 30-second first-token cold start latencies.

Verify local execution:
```bash
pi -p --model ollama/ornith-1.5:ctx "Say hello in 3 words"
```
