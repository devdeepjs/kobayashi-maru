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
[![Cold-Start Bloat: 0 Tokens](https://img.shields.io/badge/Cold--Start%20Bloat-0%20Tokens-success)](#pillar-1-active-aerodynamics--skill-rag-skill-ragts)
[![Local Workhorse: $0.00 Compute](https://img.shields.io/badge/Local%20Workhorse-%240.00%20Compute-blueviolet)](#pillar-4-hybrid-powertrain--dual-virtual-router-bottom-up-routerts)

```text
    __ __                    
   / //_/          /  |/  /___ _ _____ __  __
  / ,<    ____    / /|_/ // __ `// ___// / / /
 / /| |  /___/   / /  / // /_/ // /   / /_/ / 
/_/ |_|         /_/  /_/ \__,_//_/    \__,_/  
     Reprogramming the Token-Maxing Simulation
```

---

## ⚡ The Unwinnable Scenario: The Token-Maxing Trap

In *Star Trek*, the **Kobayashi Maru** is an infamous training simulation programmed to be unwinnable under standard Starfleet operational doctrine.

In modern AI software engineering, **Token-Maxing** is today's Kobayashi Maru. Default coding agent architectures fall victim to compounding inefficiencies that cripple speed, blow budgets, and induce context doom loops:

1. **The 500+ Skill Bloat Trap**: When 50+ to 500+ engineering skills are installed, naive harnesses dump every single skill description into the `<available_skills>` block of the system prompt. At 500 skills, **37,500 prompt tokens are burned on every turn** before you even type `"hi"`.
2. **The Observation Flood**: Running a single `vitest`, `pytest`, `cargo check`, or compiler suite dumps thousands of lines of logs directly into context. The LLM stays bloated for the entire session, paying full input fees on those dead tokens on every subsequent turn.
3. **The All-Frontier Financial Bleed**: Utilizing frontier models ($15 to $75 per million tokens) for mundane tasks like running `git status`, fixing linting errors, or reading boilerplate wastes 90% of your AI budget on mechanical grunt work.
4. **The Hallucination Doom Loop**: When small local models fail a unit test, they loop repeatedly over a 30,000+ token chat history, generating blind `grep` calls and hallucinating non-existent file paths until the context window explodes.

**Kobayashi Maru reprograms the simulation.**

Treating autonomous software engineering like Formula 1: **strip every gram of parasitic weight, retrieve skills on demand with sub-millisecond precision, compact observations at the runtime layer, and drive execution through a dual-tier hybrid powertrain.**

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    User["Developer Prompt / Ticket / Architecture Task"] --> SRA["Pillar 1: BM25 Skill-RAG<br/>Indexes 500+ skills in < 2ms<br/>Turn 0 / 'hi': 0 skills injected"]
    
    SRA --> Seam["Pillar 2: DeepSeek Minimal Seam<br/>Prunes passive schemas<br/>Active: read, bash, edit, write, codemode"]

    Seam --> Router{"Pillar 4: Dual Virtual Router<br/>(System-1 Phase Controller)"}

    Router -->|"Planning Phase & Hard Concurrency<br/>(Frontier Speed, Luna / Sonnet)"| Planner["Twin-Turbo ICE (Planner)<br/>bedrock-mantle/openai.gpt-5.6-luna<br/>amazon-bedrock/claude-sonnet-5-5"]

    Router -->|"Execution Phase: Tests, Edits, Bash<br/>(100% Metal GPU / RAM, $0.00 Compute)"| Worker["Electric MGU-K (Workhorse)<br/>ollama/ornith-1.5:ctx:low (32K)<br/>Local Zero-Cost Compute"]

    Planner --> Compactor["Pillar 3: NVIDIA SoL-Pi Compaction<br/>├── actionFusion (Chained tool merge)<br/>├── observationPack (97% log reduction to disk)<br/>├── evidencePreservingReducer (Luna-backed)<br/>└── onlineContextCompact (Cache hygiene)"]

    Worker --> Compactor

    Compactor --> Topology["Pillar 5: AST-grep Topology Mapper<br/>Rust ast-grep outline: 100k LOC in < 800 tok"]

    Compactor --> Checkpoint["Pillar 6: Git Checkpoint Engine<br/>Turn-boundary snapshots for instant rollback"]

    Compactor --> Pi["Pi Agent Runtime & Telemetry<br/>(@langfuse/pi-observability-plugin + @dietrichgebert/ponytail)"]
```

---

## 🏎️ The 6 Kobayashi Pillars

### Pillar 1: Active Aerodynamics — Skill-RAG (`skill-rag.ts`)
- **Self-Contained Okapi BM25 Index**: Indexes 500+ skills in memory in $< 2\text{ms}$ with zero external dependencies.
- **Zero Cold-Start Bloat**: Generic greetings (`"hi"`, `"help"`, `"status"`) inject **0 skills** into context, saving 3,000 to 37,500 tokens per turn.
- **Laser Relevance**: Matches prompts against skill intents and injects **only the top 1–2 matched skills** (~150 tokens vs 37,500 tokens).
- **Mid-Session Meta-Tool**: Registers `find_skill({ query: "..." })` so the agent can pull runbooks dynamically during long multi-turn sessions.

### Pillar 2: Lean Chassis — DeepSeek Minimal Seam
- Modeled directly after DeepSeek's SWE-bench Minimal Mode: strictly exposes core primitives (`read`, `bash`, `edit`, `write`, `codemode`).
- Dynamically hides passive diagnostic and usage tools (`fetch_budget`, `show_usage_stats`, `register_budget`) from the LLM prompt to eliminate decision noise and schema overhead.
- Web tools (`web_search`, `fetch_content`) are dynamically gated, surfacing only when search keywords are present in the user prompt.

### Pillar 3: Telemetry & Downforce — NVIDIA SoL-Pi Compaction (`sol-pi.json`)
- **`actionFusion`**: Automatically fuses rapid consecutive reads and bash executions into unified execution traces.
- **`observationPack`**: Evicts massive compiler dumps, stack traces, and test logs to disk, replacing them with concise summaries and an `obs_recall` reference.
- **`evidencePreservingReducer`**: Background summarization backed by Luna that compresses older turns while preserving file paths, variable names, and critical evidence.
- **`onlineContextCompact`**: Maintains a 12.5 cache write/read ratio to maximize Anthropic/Bedrock prompt cache hits.

### Pillar 4: Hybrid Powertrain — Dual Virtual Router (`bottom-up-router.ts`)
- **Top-Down Delegation (`auto/planner-worker`)**:
  - **Turn 1 (Planning)**: Bedrock GPT-5.6 Luna analyzes monorepo structure, formulates the execution plan, and writes tasks.
  - **Planning Seam Guard**: Keeps the planner engaged until the planning phase is fully synthesized (eliminates premature handoffs mid-tool-call).
  - **Turns 2..N (Execution)**: Delegates to local Ornith 1.5 running at **$0.00 compute cost**.
  - **Circuit Breaker**: If the local worker encounters 2 consecutive test or syntax failures, execution auto-escalates back to Luna to resolve the blocker.
- **Bottom-Up Escalation (`auto/bottom-up`)**:
  - Starts directly on local Ornith 1.5; escalates to frontier intelligence only if circuit breakers trip.

### Pillar 5: Radar & LiDAR — AST-grep Monorepo Topology (`repo-mapper.ts`)
- Powered by high-speed Rust `ast-grep outline` (v0.51.0).
- Extracts class hierarchies, method signatures, exports, and imports across 100k+ line codebases in **$< 800$ tokens**.
- Eliminates context-burning `find` and `grep` hallucination loops.

### Pillar 6: Pit Crew — Pre-Turn Git Checkpointing (`git-checkpoint.ts`)
- Creates lightweight `git stash` snapshots before every turn.
- Provides 1-click deterministic rollback if an agent makes unintended edits or breaks unit test suites.

---

## 📊 Empirical Benchmarks: Harness Layer Comparison

Evaluated across real-world enterprise engineering workloads (large-scale TypeScript, React, and Node.js monorepos with 100k+ LOC and 500+ modules):

| Agent Harness Profile | Cold-Start Tokens (`"hi"`) | 500+ Skills Cost / Turn | Total Cost (4 Enterprise Tasks) | Cost Reduction vs Claude Code | Cache Hit Rate | Accuracy | Avg Turns |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Claude Code** (Direct Anthropic Baseline) | 8,130 tokens | 37,500 tokens | $0.9963 | *baseline (0%)* | 0.0% | 98% | 8.0 |
| **Vanilla Pi Coding Agent** | 8,130 tokens | 37,500 tokens | $0.7764 | -22.1% | 31.3% | 98% | 6.8 |
| **DeepSeek Harness** (DSH V4 Pro) | 4,210 tokens | 12,000 tokens | $0.2248 | -77.4% | 43.5% | 100% | 5.3 |
| **Kobayashi Maru Runtime** | **3,648 tokens** | **~150 tokens** | **$0.0455** | **-95.4%** | **95.2%** | **100%** | **3.5** |

> [!NOTE]
> Detailed per-task token breakdowns, prompt caching ratios, and reproduction datasets are available in [eval/BENCHMARK_RESULTS.md](eval/BENCHMARK_RESULTS.md).

---

## 🛠️ The Bundled Matt Pocock 38-Skill Suite

Kobayashi Maru comes pre-packaged with the complete **38-skill Matt Pocock engineering suite** located in [`.agents/skills/`](.agents/skills/). Every skill is zero-bloat ready and instantly discoverable by Okapi BM25 without paying startup token costs.

### Skill Categories & Triggers

| Category | Skill Name | Slash Trigger | Purpose & When It Is Injected |
| :--- | :--- | :---: | :--- |
| **TDD & Engineering** | `tdd` | `/tdd` | Red-Green-Refactor test cycle. Automatically injected for `"write tests"`, `"test suite"`, `"vitest"`. |
| | `implement` | `/implement` | Standardized implementation workflow following domain boundaries. |
| | `implement-spec` | `/implement-spec` | High-fidelity code generation directly from engineering design specs. |
| | `prototype` | `/prototype` | Rapid prototyping spikes separating UI and core logic layers. |
| | `diagnosing-bugs` | `/diagnosing-bugs` | Structured bug triage and reproducible root-cause analysis loops. |
| **Architecture & Design** | `codebase-design` | `/codebase-design` | Deepening codebases using high-cohesion, low-coupling module boundaries. |
| | `domain-modeling` | `/domain-modeling` | Formulates domain glossaries and Architecture Decision Records (ADRs). |
| | `to-spec` | `/to-spec` | Transforms ambiguous feature requests into rigorous technical specifications. |
| | `to-tickets` | `/to-tickets` | Breaks down large specifications into bite-sized, 100k-token agent tickets. |
| | `improve-codebase-architecture` | `/improve-codebase-architecture` | Generates comprehensive codebase architecture audits and HTML reports. |
| | `setup-ts-deep-modules` | `/setup-ts-deep-modules` | Configures `dependency-cruiser` to enforce deep TypeScript architecture boundaries. |
| **Review & Quality** | `code-review` | `/code-review` | Senior-level code review focusing on correctness, edge cases, and diff minimization. |
| | `git-guardrails-claude-code` | `/git-guardrails` | Intercepts dangerous git actions (`push --force`, `reset --hard`, deleting branches). |
| | `grill-me` | `/grill-me` | Interactive conversational interview grilling the user on design tradeoffs. |
| | `grill-with-docs` | `/grill-with-docs` | Document-grounded architecture interrogation against official reference docs. |
| | `pr` | `/pr` | Generates structured, high-context pull request descriptions and changelogs. |
| | `setup-pre-commit` | `/setup-pre-commit` | Configures Husky, lint-staged, and automated git hooks. |
| **Meta & Navigation** | `ask-matt` | `/ask-matt` | Consults Matt Pocock's software engineering principles and mental models. |
| | `chief-of-staff` | `/chief-of-staff` | High-level engineering roadmap triage and task prioritization. |
| | `wait-what` | `/wait-what` | Cognitive circuit breaker when prompts contain contradictory constraints. |
| | `wayfinder` | `/wayfinder` | Monorepo navigation and structural orientation for newcomers. |
| | `wizard` | `/wizard` | Step-by-step interactive configuration wizard for complex tooling. |
| | `retro` | `/retro` | Team retrospective generator synthesizing project wins and friction points. |

---

## ⚡ Why Skill-RAG Outperforms Naive Bundling (The Diff)

| Feature | Naive Agent Harness (Claude Code, Pi default) | Kobayashi Maru (BM25 Skill-RAG) |
| :--- | :--- | :--- |
| **Startup Token Cost** | **37,500 tokens / turn** (Dumps all 500+ skills into prompt) | **0 tokens** on greetings; **~150 tokens** on match |
| **Dollar Cost on Cold Start** | ~$0.11 per simple prompt like `"hi"` | **$0.0000** wasted on skills |
| **Matching Speed** | N/A (Brute force text injection) | **$< 2\text{ms}$** in-memory Okapi BM25 ranker |
| **Adding New Skills** | Makes system prompt longer and degrades model attention | Adds $0$ prompt overhead until dynamically queried |
| **Mid-Session Runbooks** | None (Model must remember full instructions from turn 1) | Mid-session `find_skill` meta-tool fetches any runbook |

---

## 💡 Adding Custom Skills & Runbooks

Adding custom skills to Kobayashi Maru is completely friction-free. You **never need to disable skills or fear context bloat**:

1. Create a directory in `~/.agents/skills/<my-skill>/`:
   ```bash
   mkdir -p ~/.agents/skills/db-migrate
   ```
2. Add a `SKILL.md` with clear frontmatter:
   ```markdown
   ---
   name: db-migrate
   description: "Zero-downtime PostgreSQL schema migrations and rollback scripts"
   ---

   # Database Migration Runbook
   When altering tables in production:
   1. Never add non-null columns without defaults.
   2. Use CONCURRENTLY for index creation.
   3. Always write a companion rollback script.
   ```
3. **That's it!** Skill-RAG automatically indexes your new skill on the next turn. When a prompt mentions `"migrate postgres tables"`, Skill-RAG injects `db-migrate` dynamically in $< 2\text{ms}$.

---

## 🚀 1-Command Installation & Interactive Setup Wizard

Get from zero to running autonomous engineering agent in under 2 minutes:

#### Option 1: Fast One-Liner Direct Install (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/devdeepjs/kobayashi-maru/main/setup.sh | bash
```

#### Option 2: Clone and Inspect Locally
```bash
git clone https://github.com/devdeepjs/kobayashi-maru.git
cd kobayashi-maru
./setup.sh
```

> [!TIP]
> **Executive & Non-Hands-On Friendly**:  
> Running `./setup.sh` directly in an interactive terminal launches a friendly setup wizard. It asks you which provider your team prefers (Bedrock Mantle, Direct Bedrock, Claude, OpenAI, Local Ollama, or Cursor/Proxies) and configures everything automatically.
> 
> For an executive overview of provider tradeoffs, see the [Executive Setup Guide](docs/EXECUTIVE_SETUP_GUIDE.md).

### 📚 Dedicated Provider Setup Guides

| Provider Architecture | Setup Guide | Typical Cost / Task | Key Models |
| :--- | :--- | :---: | :--- |
| **AWS Bedrock Mantle** (Recommended) | [docs/providers/bedrock-mantle.md](docs/providers/bedrock-mantle.md) | **$0.02 – $0.05** | `openai.gpt-5.6-luna`, `anthropic.claude-opus-5-5` |
| **Direct AWS Bedrock** | [docs/providers/amazon-bedrock.md](docs/providers/amazon-bedrock.md) | **$0.15 – $0.35** | `us.anthropic.claude-sonnet-5-5`, `amazon.nova-pro` |
| **Direct Anthropic Claude** *(See Caution)* | [docs/providers/anthropic-claude.md](docs/providers/anthropic-claude.md) | **$0.40 – $1.20** | `claude-3-7-sonnet-20250219`, `claude-3-5-haiku` |
| **OpenAI & Codex** | [docs/providers/openai-codex.md](docs/providers/openai-codex.md) | **$0.10 – $0.45** | `gpt-4o`, `o1`, `o3-mini`, `codex` |
| **Cursor & Custom Proxies** | [docs/providers/cursor-and-proxies.md](docs/providers/cursor-and-proxies.md) | Varies | OpenRouter, DeepSeek R1, Cursor endpoints |
| **100% Free Local Workhorse** | [docs/providers/ollama.md](docs/providers/ollama.md) | **$0.0000** | `ornith-1.5:ctx` (32K in RAM / Apple Silicon) |

> [!CAUTION]
> **Enterprise Claude Token Billing Caution**:  
> Direct Anthropic Claude models charge **$3.00/Mtok (input)** and **$15.00/Mtok (output)**. Standard agent harnesses dumping 30,000+ uncompacted tokens can easily cost **$5.00 to $15.00+ for a single ticket**.  
> Kobayashi Maru's BM25 Skill-RAG and SoL-Pi compaction save 60%–80% of tokens, but for optimal cost control, we recommend running with `--model auto/planner-worker` so Claude only plans, while local Ornith 1.5 executes the code for $0.00.

---

### Setup CLI Options

[`./setup.sh`](setup.sh) provides flexible flags for different installation workflows:

```bash
# Guided interactive wizard (default in interactive terminal)
./setup.sh

# Automated silent install with recommended defaults (CI / Docker)
./setup.sh --yes

# Non-destructive environment diagnostic check
./setup.sh --check

# Configure Ollama unified memory flags & bake 32K workhorse
./setup.sh --ollama

# Synchronize Matt Pocock & custom skills to ~/.agents/skills only
./setup.sh --skills

# Deploy Pi extensions only (~/.pi/agent/extensions/)
./setup.sh --extensions

# Write configuration files only
./setup.sh --config

# Cleanly remove extensions and reset configuration
./setup.sh --uninstall

# View CLI options
./setup.sh --help
```

### What `./setup.sh` Automates Under the Hood:
1. **System & Toolchain Checks**: Verifies Node.js (>= 20.x), Git, and installs `ast-grep` via Homebrew / npm.
2. **Pi Runtime Verification**: Checks or installs `@earendil-works/pi-coding-agent`.
3. **Skills Suite Synchronization**: Copies the 38 Matt Pocock skills from `.agents/skills/` into `~/.agents/skills/`.
4. **Extension Deployment**: Deploys the 4 runtime extensions into `~/.pi/agent/extensions/`:
   - [`skill-rag.ts`](skill-rag.ts) (Zero-token Skill-RAG & Minimal Seam)
   - [`bottom-up-router.ts`](bottom-up-router.ts) (Dual Virtual Model Router)
   - [`repo-mapper.ts`](repo-mapper.ts) (AST Codebase Topology Mapper)
   - [`git-checkpoint.ts`](git-checkpoint.ts) (Deterministic Turn Checkpoints)
5. **Ecosystem Package Installation**:
   - `@dietrichgebert/ponytail` (Senior dev mode: anti-overengineering)
   - `@langfuse/pi-observability-plugin` (Session telemetry, token breakdowns, costs)
   - `pi-web-access` (Context-gated search and web retrieval)
   - `pi-ollama` (Native Ollama provider, per-request 32K context allocation & warm-up)
6. **NVIDIA SoL-Pi & Pi Settings**: Writes production `sol-pi.json` and `settings.json`.
7. **Pre-flight Smoke Test**: Verifies runtime health and registered models.

---

## 🛠️ Usage Guide

### 1. Top-Down Planner-Worker (Recommended for Monorepos & Tickets)
Luna/Sonnet plans the architecture; local Ornith 1.5 ($0.00) executes the code, runs tests, and applies edits:

```bash
pi --model auto/planner-worker -p "Add GeoRisk dynamic heatmap layer and write Vitest unit tests"
```

### 2. Bottom-Up Escalation (Ideal for Bugfixes & Grunt Work)
Starts directly on the local 9B model at $0.00 compute. Automatically escalates to Luna if it encounters 2 consecutive failures:

```bash
pi --model auto/bottom-up -p "Fix the TypeScript and ESLint warnings in src/components/oMaps.tsx"
```

### 3. Using Skills via Slash Commands or Natural Language
You can invoke skills either via explicit slash commands or by naturally stating your engineering intent:
- **Slash Command**:
  ```bash
  pi -p "Use /tdd to implement a thread-safe token bucket rate limiter"
  ```
- **Natural Language Intent**:
  ```bash
  pi -p "Review my recent git diff and check for edge-case memory leaks"
  ```
  *Skill-RAG matches `code-review`, injecting ONLY `code-review` into context (~150 tokens).*

### 4. Fast AST Codebase Topology
Inspect symbols and structure across a 100k-line monorepo without dumping source code bodies into context:
```typescript
repo_map({ path: "packages/ui-web/src/components", query: "geo risk layer" })
```

---

## 📦 Vetted Ecosystem Packages

| Package | Purpose | Overhead |
| :--- | :--- | :---: |
| [`@dietrichgebert/ponytail`](https://www.npmjs.com/package/@dietrichgebert/ponytail) | **Lazy Senior Dev Mode**: Strictly enforces doing only what was asked. Zero unnecessary refactorings, zero overengineering. | 0 deps / 281 kB |
| [`@langfuse/pi-observability-plugin`](https://www.npmjs.com/package/@langfuse/pi-observability-plugin) | **Enterprise Telemetry**: Full token breakdowns, cache hits, latency, and cost observability in Langfuse. | Minimal |
| [`pi-web-access`](https://www.npmjs.com/package/pi-web-access) | **Context-Gated Web Access**: Real-time web search and documentation fetching, dynamically gated behind query intent. | Zero cold-start |
| [`pi-ollama`](https://www.npmjs.com/package/pi-ollama) | **Native Ollama Provider**: Direct `/api/chat` connection, per-request context allocation (`num_ctx 32K`), prompt warm-up, and zero silent history truncation. | Native |

---

## 📁 Repository Structure

```text
kobayashi-maru/
├── setup.sh               # 1-command automated installer with CLI flags
├── skill-rag.ts           # Pillar 1: Okapi BM25 Skill-RAG & Minimal Seam
├── bottom-up-router.ts    # Pillar 4: In-Process Dual Virtual Model Router
├── repo-mapper.ts         # Pillar 5: Rust ast-grep Monorepo Topology Mapper
├── git-checkpoint.ts      # Pillar 6: Turn-boundary git stash checkpoint engine
├── sol-pi.json            # Pillar 3: NVIDIA SoL-Pi 4-pillar compaction config
├── settings.json          # Production Pi settings with DeepSeek Minimal Seam
├── harness.yaml           # Declarative multi-tier orchestration spec
├── package.json           # Runtime metadata & dependencies
├── .agents/skills/        # Bundled 38-skill Matt Pocock engineering suite
│   ├── tdd/               # Test-driven development runbook
│   ├── codebase-design/   # Modular architecture and deepening runbook
│   ├── code-review/       # Senior review guidelines
│   └── ...                # 35 additional curated engineering skills
├── eval/                  # Real-world benchmark suite & datasets
│   ├── BENCHMARK_RESULTS.md # Detailed head-to-head empirical metrics
│   └── datasets/          # Reproducible test tasks (distributed lock, hyperdx, etc.)
└── sota-harness/          # Standalone modular harness package
```

---

## 🔒 Security & Privacy Guarantee

- **Zero Phoning Home**: No private telemetry or code snippets are transmitted to external servers without explicit user configuration.
- **Credential Safety**: All model providers run via local endpoints (`localhost:11434` for Ollama) or authenticated AWS Bedrock Mantle proxies. No API keys or access tokens are ever logged or checked into version control.
- **Local Isolation**: Grunt execution turns run locally on device, preserving enterprise confidentiality.

---

## 📄 License

MIT License. Designed and open-sourced for the autonomous software engineering community.
