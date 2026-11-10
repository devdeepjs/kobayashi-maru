# 🚀 Kobayashi Maru // Viral Launch Kit (Copy-Paste Ready)

> **Everything prepared for Devdeep.**  
> Simply copy, paste into the target platform, and hit Submit.

---

## 1. Hacker News (Show HN)

* **Where to post:** https://news.ycombinator.com/submit
* **Title:** `Show HN: Kobayashi Maru – A hybrid agent harness that cuts coding token costs by 60-95%`
* **URL:** `https://github.com/devdeepjs/kobayashi-maru`
* **Text / Comment:**

```markdown
Hey HN,

We love autonomous coding agents (Claude Code, Pi, Aider), but our team was burning hundreds of dollars a month because naive harnesses dump thousands of uncompressed lines of terminal noise, compiler traces, and passing test assertions into the prompt cache on every single tool turn.

We built Kobayashi Maru (open-source MIT): a high-efficiency runtime layer for coding agents inspired by recent 2026 harness design research (NVIDIA SoL-Pi arXiv:2609.20519 and UMass arXiv:2609.20804).

Key architectural mechanisms:
1. Dual Virtual Router: You formulate the spec and architecture using a frontier model (Claude Sonnet 3.7 / GPT-5 / DeepSeek R1), but all file editing, bash loops, and unit tests execute on a $0.00 local model (Ollama 32k) or cheap cached models ($0.02/1M).
2. Evidence-Preserving Reducer: Staged rule-based elision strips ANSI sequences and flattens \r progress bars before context hits the LLM. If a test suite exceeds 220 lines, it elides repetitive passes while strictly retaining the command header, failure stack traces, and exit status.
3. BM25 Skill-RAG: 0 skills dumped on cold start. It indexes runbooks in memory (< 2ms) and injects only the top 1-2 matching runbooks dynamically.
4. Blast-Radius Protection: Safe guardrails blocking direct writes to .env*, .git/, and credentials.

Across 1,306 live assistant turns across 128 real engineering sessions, we measured a 61.5% net cost reduction ($13.51 actual spent vs $35.07 Claude Code baseline), and up to 95.4% reduction on heavy log-triage benchmarks.

Setup is 1 command (non-destructive on existing Pi installs, preserving all API keys):
curl -fsSL https://raw.githubusercontent.com/devdeepjs/kobayashi-maru/main/install.sh | bash

Repo: https://github.com/devdeepjs/kobayashi-maru

We’d love feedback on the evidence reducer rules and virtual model routing policies!
```

---

## 2. Reddit: r/LocalLLaMA

* **Where to post:** https://www.reddit.com/r/LocalLLaMA/submit
* **Title:** `Why spend $50/day on Claude Code? We built a hybrid router that uses Claude/GPT only for architecture and local Ollama for the test/edit loops (60-95% cost reduction)`
* **Flair:** `Project / Software`
* **Body:**

```markdown
Hey everyone,

If you've been using agentic coding tools like Claude Code, Cursor Agent, or Aider, you know the painful truth: frontier models are incredible at architectural reasoning, but spending $0.15–$0.50 on Claude 3.7 just to read a 400-line passing `pytest` log or replace a 2-line typo is burning money.

We built and open-sourced **Kobayashi Maru**:
GitHub: https://github.com/devdeepjs/kobayashi-maru

### The Architecture:
1. **Frontier Planner + Local Workhorse:**
You pair any frontier model (Sonnet 3.7 / R1 / GPT-5) with a local quantized model in RAM (`ollama/ornith-1.5:ctx` or `qwen2.5-coder`). The frontier model drafts the architectural plan; the local model runs the bash tools, AST edits, and unit tests at $0.00 cost.

2. **Evidence-Preserving Log Reducer (arXiv:2609.20519 & arXiv:2609.20804):**
Research shows staged rule-based elision *before* LLM ingestion is the #1 token saver. We strip terminal ANSI codes, flatten carriage-return spinners, and truncate passing test logs while preserving 100% of error stack traces, failed assertions, and exit codes. This alone saves 60–80% of bash tokens.

3. **BM25 Skill-RAG:**
Instead of dumping 40 markdown skills into every prompt (wasting 30,000+ tokens on Turn 1), our in-memory BM25 ranker starts with 0 tokens and mounts runbooks on-demand in < 2ms.

4. **F1 Pit Wall Telemetry:**
Run `kobayashi stats` to see exact token acceleration, cache hit rates (96% on cached routes), and dollar arbitrage vs raw Claude Code baselines.

### Real-World Numbers:
Across 1,306 live assistant turns on our development team:
- Actual spend: **$13.51**
- Baseline Claude Code cost: **$35.07**
- Real savings: **61.5%** ($21.56 saved)
- On heavy log triage tasks: **95.4%** savings.

1-Command Setup (works on macOS / Linux):
```bash
curl -fsSL https://raw.githubusercontent.com/devdeepjs/kobayashi-maru/main/install.sh | bash
```

Check it out and let us know what local model pairings you get the best results with!
```

---

## 3. Twitter / X (5-Tweet Launch Thread)

* **Where to post:** https://twitter.com/compose/tweet

**Tweet 1 (The Hook):**
> Coding agents are burning $20–$100/day because they waste 80% of your tokens reading raw terminal progress bars and compiler noise.
>
> Today we’re open-sourcing Kobayashi Maru 🚀
> A zero-waste hybrid agent harness that cuts coding token costs by 60%–95%.
>
> 🧵👇 [Attach assets/demo.gif or screenshot]

**Tweet 2 (The Problem):**
> The "Scaffold Effect" (arXiv:2606.02542) proved that harness design causes up to 40x token variance for the same model.
>
> Default harnesses dump 30,000 tokens of skills on greeting and send 1,000 lines of passing npm/pytest logs to $75/1M frontier models. That’s pure waste.

**Tweet 3 (The Powertrain):**
> Kobayashi Maru pairs models like Formula 1:
> 🏎️ Frontier Planner (Claude 3.7 / R1 / GPT-5) architects the solution.
> 🛠️ $0.00 Local Workhorse (Ollama 32k) executes edits, git, and tests in RAM.
> 📉 Evidence Reducer strips ANSI escapes and elides noise while preserving errors.

**Tweet 4 (Real Verified Numbers):**
> We audited 1,306 live turns on our daily engineering workload:
> • Net Cost: $13.51 vs $35.07 baseline (61.5% verified savings)
> • 96.0% prompt cache hit rate
> • 0 cold-start skill bloat via in-memory BM25 RAG

**Tweet 5 (Link & Call to Action):**
> 100% open source (MIT). 1-command installer layers on top of Pi without touching your credentials.
>
> GitHub: https://github.com/devdeepjs/kobayashi-maru
>
> Give it a star ⭐️ and stop overpaying for AI coding agents!
