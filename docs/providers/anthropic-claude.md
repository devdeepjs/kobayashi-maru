# Direct Anthropic Claude & Enterprise Caution Guide ⚠️

> **Runtime Provider**: `anthropic`  
> **Key Models**: `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`

---

## ⚠️ Enterprise Caution: Direct Claude Token Consumption

> [!CAUTION]
> **Important Notice for Engineering Leaders & Budget Owners**:  
> Direct Anthropic Claude models charge **per token on every request**:
> - **Input**: $3.00 per million tokens
> - **Output**: $15.00 per million tokens
> - **Prompt Cache Write**: $3.75 per million tokens
> - **Prompt Cache Read**: $0.30 per million tokens
> 
> ### Why Unoptimized Agent Sessions Explode:
> 1. An agent running 25 turns in a 100k-line monorepo sends full file contents and bash logs on every turn.
> 2. Without log compaction, a single debugging session can consume **400,000+ tokens**, costing **$6.00 to $15.00+ for a single ticket**.
> 
> ### How Kobayashi Maru Protects Your Budget:
> - **BM25 Skill-RAG**: Injects 0 skills on greetings (saving 37,500 startup tokens).
> - **NVIDIA SoL-Pi**: Evicts raw test dumps to disk (97% log compression).
> - **Virtual Dual Router**: Use `--model auto/planner-worker` so Claude plans the architecture, but local Ornith 1.5 executes the code in RAM at **$0.00**.

---

## Authentication & Setup Options

### Option A: Official Anthropic API Key (Recommended for CI & Workstations)
1. Generate an API key from the [Anthropic Console](https://console.anthropic.com/).
2. Export the key in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
```

### Option B: Web Login / OAuth
If your organization provides an OAuth login for Anthropic Claude:

```bash
pi auth login anthropic
```

Follow the browser prompt to authorize the session.

---

## Configuration in Pi (`~/.pi/agent/settings.json`)

To set Claude 3.7 / 3.5 Sonnet as your default model:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-3-7-sonnet-20250219",
  "defaultThinkingLevel": "high"
}
```

---

## Verifying Connection

```bash
pi -p --model claude-3-7-sonnet-20250219 "State your model identity in 5 words"
```
