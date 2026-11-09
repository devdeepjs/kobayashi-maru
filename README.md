# Kobayashi Maru (小林丸) 🚀

> **The Zero-Waste Autonomous Engineering Runtime for Pi & Open Models**  
> *"I don't believe in the unwinnable scenario." — James T. Kirk*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/devdeepjs/kobayashi-maru/actions/workflows/ci.yml/badge.svg)](https://github.com/devdeepjs/kobayashi-maru/actions/workflows/ci.yml)
[![TypeScript: 5.6](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Runtime: Pi](https://img.shields.io/badge/Runtime-Pi%20v1.4.0%2B-purple.svg)](https://github.com/earendil-works/pi)
[![Compaction: NVIDIA SoL--Pi](https://img.shields.io/badge/Compaction-NVIDIA%20SoL--Pi-76B900.svg)](https://github.com/NVlabs/SoL-Pi)
[![Topology: ast--grep](https://img.shields.io/badge/AST-ast--grep%20v0.51-orange.svg)](https://ast-grep.github.io/)
[![Cost Reduction: -95.4%](https://img.shields.io/badge/Cost%20Reduction--95.4%25-brightgreen)](eval/BENCHMARK_RESULTS.md)
[![Cold-Start Bloat: 0 Tokens](https://img.shields.io/badge/Cold--Start%20Bloat-0%20Tokens-success)](docs/SKILLS_GUIDE.md)
[![Local Workhorse: $0.00 Compute](https://img.shields.io/badge/Local%20Workhorse-%240.00%20Compute-blueviolet)](docs/ARCHITECTURE.md#pillar-4-hybrid-powertrain--dual-virtual-model-router-bottom-up-routerts)

```text
    __ __                    
   / //_/          /  |/  /___ _ _____ __  __
  / ,<    ____    / /|_/ // __ `// ___// / / /
 / /| |  /___/   / /  / // /_/ // /   / /_/ / 
/_/ |_|         /_/  /_/ \__,_//_/    \__,_/  
     Reprogramming the Token-Maxing Simulation
```

---

## ⚡ The 30-Second Overview

Default coding agent harnesses dump 50+ to 500+ skills into every prompt, burn thousands of lines of compiler logs into context, and waste expensive frontier models on simple file edits and test runs.

**Kobayashi Maru reprograms the simulation like Formula 1:**
- **BM25 Skill-RAG**: Injects **0 skills on cold start**; mounts only the top 1–2 matched runbooks on demand (< 2ms in RAM).
- **Dual Virtual Router**: **Frontier Planner** (Luna / Sonnet / R1) formulates architecture; **$0.00 Local Workhorse** (Ollama Ornith 1.5) executes tests and edits.
- **NVIDIA SoL-Pi Compaction**: Evicts compiler dumps and test logs to disk while preserving crucial evidence.
- **AST-grep Topology**: Maps 100k+ line codebases in **$< 800$ tokens** with zero hallucination loops.
- **Fresh Laptop Ready**: Import custom skills and MCP servers from Git repos, Cursor, or Claude Desktop in seconds.

---

## 🚀 1-Command Setup (Works on Any Fresh Laptop)

#### Option 1: Git Clone & Auto-Setup (Single Command)
```bash
git clone https://github.com/devdeepjs/kobayashi-maru.git && cd kobayashi-maru && ./setup.sh
```
> [!NOTE]
> Want zero interactive prompts? Run with `-y` for full silent automation:
> ```bash
> git clone https://github.com/devdeepjs/kobayashi-maru.git && cd kobayashi-maru && ./setup.sh -y
> ```

#### Option 2: Curl One-Liner (Zero-Clone)
```bash
curl -fsSL https://raw.githubusercontent.com/devdeepjs/kobayashi-maru/main/setup.sh | bash
```

#### Option 3: Make or npm
```bash
git clone https://github.com/devdeepjs/kobayashi-maru.git && cd kobayashi-maru && make
# or
git clone https://github.com/devdeepjs/kobayashi-maru.git && cd kobayashi-maru && npm run setup
```

#### Option 4: Non-Destructive Overlay on Existing Pi (1 Command)
Already have Pi installed? Layer Kobayashi Maru on top without touching your existing `auth.json` API keys:
```bash
curl -fsSL https://raw.githubusercontent.com/devdeepjs/kobayashi-maru/main/install.sh | bash
# or inside the repo:
./install.sh
```
- **Preserves existing credentials**: Never modifies or deletes `~/.pi/agent/auth.json`.
- **Cleans up broken symlinks**: Eliminates dead symlinks from Pi updates (fixing `spawn Unknown system error -86`).
- **Zero-bloat MCP**: Configures MCP servers with `exposure: "deferred"` so cold-start prompt schemas are never inflated.
- **Retroactive Session Backfill**: Automatically scans `~/.pi/agent/sessions/` to restore historical tokens, costs, and ROI into `kobayashi stats`.

> [!TIP]
> **Executive & Non-Hands-On Friendly**:  
> Running `./setup.sh` launches an interactive wizard that detects your environment, configures your preferred provider backends, and bakes local 32K workhorse models automatically. See the [Executive Setup Guide](docs/EXECUTIVE_SETUP_GUIDE.md).

---

## 🏎️ Omnichannel Model Powertrain

Kobayashi Maru enables **all 6 provider backends simultaneously** — you have full freedom across all models:

| Provider Architecture | Setup Guide | Typical Cost / Task | Default Starting Model |
| :--- | :--- | :---: | :--- |
| **AWS Bedrock Mantle** (Recommended) | [docs/providers/bedrock-mantle.md](docs/providers/bedrock-mantle.md) | **$0.02 – $0.05** | `openai.gpt-5.6-luna` |
| **Direct Amazon Bedrock** | [docs/providers/amazon-bedrock.md](docs/providers/amazon-bedrock.md) | **$0.15 – $0.35** | `us.anthropic.claude-sonnet-5-5` |
| **Direct Anthropic Claude** *(See Caution)* | [docs/providers/anthropic-claude.md](docs/providers/anthropic-claude.md) | **$0.40 – $1.20** | `claude-3-7-sonnet-20250219` |
| **OpenAI & Codex** | [docs/providers/openai-codex.md](docs/providers/openai-codex.md) | **$0.10 – $0.45** | `gpt-4o`, `o3-mini`, `o1` |
| **Cursor & Proxies** | [docs/providers/cursor-and-proxies.md](docs/providers/cursor-and-proxies.md) | Varies | OpenRouter DeepSeek R1, Cursor endpoints |
| **100% Free Local Workhorse** | [docs/providers/ollama.md](docs/providers/ollama.md) | **$0.0000** | `ornith-1.5:ctx` (32K in RAM) |

> [!CAUTION]
> **Enterprise Claude Token Billing Caution**:  
> Standard agent harnesses dumping 30,000+ uncompacted tokens can easily cost **$5.00 to $15.00+ for a single ticket** on direct Claude APIs. Kobayashi Maru's Skill-RAG and compaction cut token spend by 60%–95%. Running with `--model auto/planner-worker` lets Claude plan while local Ornith 1.5 executes for $0.00.

---

## 💻 Fast Usage

```bash
# 1. Run with Hybrid Dual Virtual Router (Frontier Planner + $0 Local Worker)
pi --model auto/planner-worker -p "Refactor auth middleware and add unit tests"

# 2. Run with Bottom-Up Escalation ($0 Local Worker first, escalates on failure)
pi --model auto/bottom-up -p "Fix the failing assertion in test/auth.test.ts"

# 3. Search and outline codebase symbols for $0 in < 800 tokens
pi -p "Use repo_map to outline authentication and token management modules"

# 4. View executive F1 telemetry and capital savings
kobayashi stats
```

---

## 🔀 Create Your Own Custom Virtual Models

You can pair **any planner model** with **any local or cloud worker model** under your own custom virtual model ID.

#### 1. Interactive CLI Wizard
```bash
kobayashi virtual add
```

#### 2. Direct CLI One-Liner
```bash
kobayashi virtual add speed-demon \
  --name "Speed Demon" \
  --planner "anthropic/claude-3-5-haiku-20241022" \
  --worker "ollama/qwen2.5-coder:14b-16k" \
  --policy bottom-up
```

#### 3. Or in `~/.pi/agent/virtual-models.json`
```json
{
  "custom": {
    "speed-demon": {
      "name": "Speed Demon",
      "planner": "anthropic/claude-3-5-haiku-20241022",
      "worker": "ollama/qwen2.5-coder:14b-16k",
      "policy": "bottom-up"
    }
  }
}
```

#### List & Run:
```bash
kobayashi virtual list         # View all active virtual models
pi --model auto/speed-demon    # Run your custom virtual router
```

---

## 🏛️ The 6 Runtime Pillars

Detailed architectural specifications are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):

1. **Active Aerodynamics — BM25 Skill-RAG (`skill-rag.ts`)**: In-memory retrieval across 500+ skills; 0 cold-start tokens.
2. **Lean Chassis — Minimal Tool Seam**: Prunes passive tools from prompt schemas; context-gates web tools.
3. **Telemetry & Downforce — NVIDIA SoL-Pi Compaction (`sol-pi.json`)**: Chained tool merging, observation log eviction to disk, and prompt cache hygiene.
4. **Hybrid Powertrain — Dual Virtual Model Router (`bottom-up-router.ts`)**: Seamless orchestration across any planner and worker model.
5. **Radar & LiDAR — AST-grep Topology (`repo-mapper.ts`)**: Fast Rust AST symbol extraction in $< 800$ tokens.
6. **Pit Crew — Architecture-Safe Git Checkpoints (`git-checkpoint.ts`)**: Automatic pre-turn snapshots with 1-click deterministic rollback.

---

## 🛠️ Skills & Fresh Laptop Import

Kobayashi Maru comes pre-packaged with the **38-skill Matt Pocock engineering suite** (TDD, Architecture, Code Review, etc.).

On a brand-new laptop, import your existing custom skills and MCP servers with 1 command:

```bash
# Import custom skills from a Git repo or directory
kobayashi skills --add https://github.com/myorg/custom-skills.git

# Auto-import MCP servers from Claude Desktop or Cursor into Pi
kobayashi mcp --import

# Audit installed skills and test BM25 dynamic activation
kobayashi skills --test-prompt "Write unit tests for authentication"
```

For the full skill catalog and authoring guide, see [docs/SKILLS_GUIDE.md](docs/SKILLS_GUIDE.md).

---

## 📊 Empirical Benchmarks

Tested on real-world enterprise monorepos (100k+ LOC TypeScript / React / Node.js):

| Agent Harness Profile | Cold-Start Tokens (`"hi"`) | 500+ Skills Cost / Turn | Total Cost (4 Tasks) | Cost Reduction vs Claude Code | Cache Hit Rate | Accuracy | Avg Turns |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Claude Code** (Direct Anthropic Baseline) | 8,130 tokens | 37,500 tokens | $0.9963 | *baseline (0%)* | 0.0% | 98% | 8.0 |
| **Vanilla Pi Coding Agent** | 8,130 tokens | 37,500 tokens | $0.7764 | -22.1% | 31.3% | 98% | 6.8 |
| **DeepSeek Harness** (DSH V4 Pro) | 4,210 tokens | 12,000 tokens | $0.2248 | -77.4% | 43.5% | 100% | 5.3 |
| **Kobayashi Maru Runtime** | **3,648 tokens** | **~150 tokens** | **$0.0455** | **-95.4%** | **95.2%** | **100%** | **3.5** |

Full benchmark reproduction scripts and traces are in [eval/BENCHMARK_RESULTS.md](eval/BENCHMARK_RESULTS.md).

---

## 🎛️ Interactive CLI Commands

```bash
# Interactive model switcher (Orchestrator, Workhorse, Advisor)
kobayashi config

# Audit environment and verify Ollama, Bedrock, and Pi readiness
kobayashi doctor

# Launch live browser telemetry dashboard
kobayashi stats --web

# Run sandboxed SWE benchmark suite
kobayashi eval --report
```

---

## 📖 Documentation Index

- **[Executive Setup Guide](docs/EXECUTIVE_SETUP_GUIDE.md)**: Non-technical executive guide for choosing providers & managing costs.
- **[Architecture Deep Dive](docs/ARCHITECTURE.md)**: In-depth technical guide to the 6 runtime pillars.
- **[Skills & Runbooks Guide](docs/SKILLS_GUIDE.md)**: 38-skill catalog, authoring runbooks, and fresh-laptop onboarding.
- **[Benchmark Results](eval/BENCHMARK_RESULTS.md)**: Empirical cost and accuracy validation across enterprise workloads.
- **[Provider Guides](docs/providers/)**: Bedrock Mantle, Direct Bedrock, Claude, OpenAI, Ollama, Cursor.
