# 📖 Kobayashi Maru // The Complete User Manual & Daily Driver Guide

> **Your zero-waste, token-efficient autonomous engineering cockpit.**  
> *"I don't believe in the unwinnable scenario." — James T. Kirk*

---

## 📑 Table of Contents
1. [The 30-Second Fast Start](#1-the-30-second-fast-start)
2. [Daily Driver Workflows (The 5 Core Patterns)](#2-daily-driver-workflows-the-5-core-patterns)
3. [Slash Command Encyclopedia](#3-slash-command-encyclopedia)
4. [Model Switching & Custom Virtual Routers](#4-model-switching--custom-virtual-routers)
5. [Images, Multimodal & Terminal Ergonomics](#5-images-multimodal--terminal-ergonomics)
6. [Evidence Reducer & Safety Guardrails](#6-evidence-reducer--safety-guardrails)
7. [Subagents, Planning & Task Execution](#7-subagents-planning--task-execution)
8. [Telemetry, Auditing & Capital Savings](#8-telemetry-auditing--capital-savings)
9. [Common Tasks & Troubleshooting FAQ](#9-common-tasks--troubleshooting-faq)

---

## 1. The 30-Second Fast Start

### Launching Pi with Kobayashi Maru
```bash
# 1. Start with the Dual Virtual Router (Recommended Daily Driver)
#    Plans on cheap cached frontier model; executes test/edits on $0.00 local model
pi

# 2. Or explicitly launch with virtual powertrain
pi --model auto/planner-worker

# 3. Or 100% Free Local Execution (Zero cloud tokens)
pi --model auto/bottom-up

# 4. View your executive savings and telemetry audit
kobayashi stats
```

---

## 2. Daily Driver Workflows (The 5 Core Patterns)

### Pattern A: Standard Interactive Coding
Start Pi inside any git repository. Pi automatically identifies your workspace, detects any repository rules (`.cursorrules`, `CLAUDE.md`, `.claude/rules/`), and addresses you personally.
```text
pi
> Refactor the authentication service to use JWT refresh tokens and add unit tests
```

### Pattern B: The Read-Only Exploration (/plan)
When approaching unfamiliar or complex codebases, enter **Plan Mode** to explore, trace symbols, and draft an implementation strategy without modifying files or running destructive commands:
```text
> /plan
[Plan Mode Activated]
> Trace the order checkout flow and map all database queries
```
*Press `Ctrl+Alt+P` or run `/plan` to toggle plan mode on or off at any point.*

### Pattern C: The Surgical Sniper (Cursor / Frontier Reserve)
Keep your day-to-day coding on cheap cached models (`openai.gpt-5.6-luna` or local `ornith-1.5:ctx`). When you hit an exceptionally hard algorithm or architectural bug:
1. Switch on the fly: `/switch opus` or `/switch grok`
2. Ask for the architectural solution (1–2 turns).
3. Switch back immediately: `/switch luna` or `/switch default`
4. Let the cheap workhorse write the boilerplate, run `npm test`, and commit!

### Pattern D: The Zero-Pollution Side Question (/btw)
Need to ask a quick clarifying question (e.g. *"What port does Redis run on?"* or *"What did we name that helper function?"*) without polluting your active context or invalidating your prompt cache?
```text
> /btw what is the standard signature of jwt.verify in jsonwebtoken?
```
Pi answers in a transient sidebar, keeping your main context pristine!

### Pattern E: Pre-Commit Diff Review (/diff-review)
Before pushing or committing your changes:
```text
> /diff-review
```
Pi launches an interactive verification loop that inspects your git diff, runs tests, flags unintended file edits, and ensures code quality.

---

## 3. Slash Command Encyclopedia

| Command | Arguments | Purpose & Effect |
| :--- | :--- | :--- |
| **`/switch`** | `[query]` | Dynamically search and switch active models (e.g. `/switch grok`, `/switch opus`, `/switch luna`). |
| **`/virtual`** | `[none\|add\|rm]` | Interactive TUI configurator to pair any planner + worker into a virtual router without restart. |
| **`/btw`** | `<question>` | Execute an isolated side query without polluting your main conversation context. |
| **`/plan`** | `[toggle]` | Toggle safe, read-only exploration mode (`Ctrl+Alt+P`). |
| **`/todos`** | `[show\|clear]` | View and track in-session, branch-safe task lists. |
| **`/rename`** | `[new-name]` | Rename the current session so `pi --session` stays organized. |
| **`/reducer`** | `[status\|on\|off]` | Inspect or toggle the Evidence-Preserving Terminal Output Reducer. |
| **`/diff-review`**| `[none]` | Launch interactive diff review loop to audit uncommitted changes. |
| **`/review`** | `uncommitted` | Run comprehensive code review against working directory or branch. |
| **`/handoff`** | `<goal>` | Losslessly transfer context and active tasks into a fresh session. |
| **`/stats`** | `[--web]` | Open live executive telemetry HUD and token savings scorecard. |
| **`/login`** | `[provider]` | Safely authenticate API keys without exposing them in shell history. |
| **`/hotkeys`** | `[none]` | Show all active terminal shortcuts and keybindings. |

---

## 4. Model Switching & Custom Virtual Routers

### Live Switching in the TUI
No need to exit Pi or edit configuration files:
* Type `/switch` to see all available live models discovered across your configured providers.
* Type `/switch opus` to jump to Claude Opus.
* Type `/switch grok` to switch to Grok 4.
* Type `/switch luna` to switch back to the ultra-cheap Bedrock Mantle workhorse.

### Creating Virtual Model Pairs
A **Virtual Model** orchestrates two models:
1. **The Planner:** A frontier model that generates architectural steps and specs.
2. **The Worker:** A fast or free model (e.g. local Ollama `ornith-1.5:ctx` or `gpt-5.6-luna`) that executes bash commands, edits files, and runs tests.

#### Create via TUI:
Type **`/virtual add`** inside Pi to select your planner, worker, and policy with live fuzzy selection.

#### Create via CLI:
```bash
# Pair Claude Sonnet with local Qwen Coder
kobayashi virtual add smart-local \
  --name "Smart Local" \
  --planner "anthropic/claude-3-5-haiku-20241022" \
  --worker "ollama/ornith-1.5:ctx" \
  --policy bottom-up

# Run it
pi --model auto/smart-local
```

---

## 5. Images, Multimodal & Terminal Ergonomics

### How to Pass Images to Pi
Kobayashi Maru and Pi support full multimodal vision input via multiple ergonomics:

1. **Clipboard Paste (`Ctrl+V` or `Option+V` / `Alt+V`)**:
   - Take a screenshot (`Cmd+Shift+Control+4` on macOS to copy to clipboard).
   - In Pi's prompt editor, press **`Ctrl+V`** (or **`Option+V`**).
   - The image is natively attached to your prompt.
2. **Inline File Mention (`@image.png`)**:
   - Mention any image file directly in your prompt:
     ```text
     pi @docs/architecture.png "Refactor the database schema to match this diagram"
     ```
3. **Drag & Drop**:
   - Drag any image file from Finder directly into your terminal window, prepend with `@`, and press Enter.

### Essential Keyboard Shortcuts
* **`Ctrl+V` / `Option+V`**: Paste image or text from clipboard.
* **`Ctrl+Alt+P`**: Toggle Plan Mode (Read-only exploration).
* **`Ctrl+T` / `Alt+T`**: Open interactive Session Tree navigator.
* **`Ctrl+N`**: Start a fresh new session.
* **`Ctrl+C`**: Clear editor (first press) / Exit session (second press).
* **`Escape`**: Cancel / Abort current agent thinking turn.

---

## 6. Evidence Reducer & Safety Guardrails

### Evidence-Preserving Terminal Output Reducer
When running test suites (`npm test`, `pytest`, `cargo test`), terminal output often dumps 1,000+ lines of repetitive ANSI escape codes and progress bar spinners.
* **What it does:** Automatically intercepts bash tool outputs:
  - Strips ANSI color codes and carriage-return (`\r`) spinners.
  - If output exceeds 220 lines, it elides the repetitive middle logs while **strictly preserving the first 40 lines (command start) and last 120 lines (where error traces, failed assertions, and exit codes live)**.
  - Saves **60%–80% of tokens** on every test/build command.
* **Command:** `/reducer status` (or `/reducer on|off|reset`).

### Protected Paths Guardrail
Prevents the agent from accidentally modifying, wiping, or overwriting critical files:
* Automatically blocks `write` and `edit` operations targeting:
  - Environment files: `.env`, `.env.*`
  - Version control: `.git/*`
  - Private keys and certs: `id_rsa`, `id_ed25519`, `*.pem`, `*.key`
  - Dependencies: `node_modules/*`

---

## 7. Subagents, Planning & Task Execution

### Delegating to Subagents
Pi includes isolated context delegation. You can ask Pi to delegate tasks to background subagents:
* **Scout:** Fast read-only exploration of files and code topology.
* **Planner:** Generates comprehensive architecture specifications.
* **Reviewer:** Audits code changes for security, regressions, and syntax errors.
* **Worker:** Executes isolated code changes.

```text
> Delegate searching the database schema to a scout subagent and summarize findings
```

### Automatic Project Rules Ingestion
Whenever Pi starts in a directory, it automatically scans and enforces:
* `.cursorrules`
* `.cursor/rules/*.mdc`
* `.claude/rules/*.md`
* `CLAUDE.md` / `AGENTS.md`

Rules are automatically indexed into the model's system prompt so repository conventions and styling standards are natively adhered to without prompt repetition.

---

## 8. Telemetry, Auditing & Capital Savings

Kobayashi Maru tracks every token, cache hit, and cost across all your sessions.

### CLI Summary
```bash
kobayashi stats
```
Displays:
* **Net Capital Saved:** Exact dollar arbitrage vs Claude Code baseline.
* **Cache Acceleration:** Percentage of tokens reused via prompt caching (@ $0.02/1M).
* **Multi-Tier Workload Matrix:** Exact turn distribution between Free Local Workhorse, Cached Orchestrator, and Frontier Advisor.

### Live Web HUD
```bash
kobayashi stats --web
```
Launches the **F1 Pit Wall live telemetry web dashboard** with interactive charts, latency percentiles, and token flow diagrams.

---

## 9. Common Tasks & Troubleshooting FAQ

### Q: Why do I see `[pi-ollama] Ollama not reachable (TypeError: fetch failed)` on startup?
* **Answer:** This is a harmless non-fatal warning from `npm:pi-ollama` indicating your local Ollama daemon isn't running on port 11434. Pi automatically falls back to cached models and continues.
* **Fix:** If you want local models, run `ollama serve`. If you only use cloud models, you can safely ignore it.

### Q: How do I make sure I stay under my $20/month Cursor budget?
* **Answer:** Kobayashi Maru has this built in:
  1. `export PI_CURSOR_CONTEXT="min"` is automatically set in `~/.zshrc` (prevents 1M token contexts).
  2. Your default startup model is `auto/planner-worker` (not Cursor).
  3. Cursor is used strictly as a "surgical sniper" reserve via `/switch cursor` for 1–2 hard turns when needed.

### Q: How do I change my name in instructions?
* **Answer:** Run:
  ```bash
  kobayashi set-name "Your Name"
  ```
  Or set `export KOBAYASHI_USER="Your Name"` in `~/.zshrc`.

### Q: How do I update Kobayashi Maru to the latest version?
* **Answer:** Just re-run the 1-line installer anytime:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/devdeepjs/kobayashi-maru/main/install.sh | bash
  ```
  It pulls the latest changes, verifies extensions, and preserves all your keys and settings non-destructively.
