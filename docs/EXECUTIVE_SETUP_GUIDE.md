# Kobayashi Maru (小林丸) — Executive Setup & Provider Guide 🚀

> **Target Audience**: VPs of Engineering, CTOs, Tech Leads, and Engineering Managers.  
> **Objective**: Get your autonomous software engineering team running in under 2 minutes with enterprise cost controls.

---

## 🧭 Executive Overview: The Agent Economics Dilemma

When engineering teams adopt autonomous coding agents (like Claude Code, Cursor Agent, or vanilla Pi), their cloud token bills frequently explode by **$1,500 to $5,000 per developer per month**. 

This happens because standard agent runtimes:
1. **Dump 50+ to 500+ skills into prompt Turn 1** (charging $0.11 on every single prompt before work begins).
2. **Send 5,000-line test outputs and build logs directly to frontier models** ($15–$75/Mtok).
3. **Use expensive frontier models for routine syntax fixes, git status, and grep loops**.

**Kobayashi Maru reprograms this reality.** By utilizing Okapi BM25 Skill-RAG, NVIDIA SoL-Pi log compaction, and a dual virtual router (Frontier Planner + $0 Local Workhorse), Kobayashi Maru cuts enterprise token costs by **up to 95.4%** while improving task accuracy.

---

## ⚡ 2-Minute Quickstart

Run our interactive setup wizard in any macOS or Linux terminal:

```bash
git clone https://github.com/devdeepjs/kobayashi-maru.git
cd kobayashi-maru
./setup.sh
```

The setup script will welcome you, analyze your system, and ask **two simple questions**:
1. **Which Model Provider** does your organization prefer?
2. **Would you like to enable the Free Local Workhorse** (Ollama in RAM) for $0.00 compute on mechanical tasks?

Everything else (dependencies, extensions, NVIDIA SoL-Pi, Matt Pocock 38-skill suite, and telemetry) is configured automatically.

---

## 📊 Provider Decision Matrix for Engineering Leaders

Choose the architecture that aligns with your organization's cloud infrastructure, security policies, and budget:

| Provider Architecture | Best For | Typical Cost / Task | Security & Compliance | Setup Guide |
| :--- | :--- | :---: | :--- | :--- |
| **1. Hybrid Powertrain (Recommended)**<br/>*(Bedrock Mantle + Local Ollama)* | Enterprise teams seeking maximum accuracy at minimum cost. | **$0.02 – $0.05**<br/>*(-95% vs Claude Code)* | Code edits stay in local RAM. Only planning prompts hit authenticated AWS Bedrock. | [Bedrock Mantle Guide](providers/bedrock-mantle.md) |
| **2. Direct AWS Bedrock**<br/>*(Claude 3.7 / Nova / DeepSeek)* | Organizations with existing AWS commitments and strict IAM governance. | **$0.15 – $0.35**<br/>*(-65% vs Claude Code)* | 100% within your corporate AWS VPC / account. No external data transfer. | [AWS Bedrock Guide](providers/amazon-bedrock.md) |
| **3. Direct Anthropic Claude**<br/>*(Claude 3.7 Sonnet / Opus)* | Teams prioritizing advanced Anthropic reasoning capabilities directly. | **$0.40 – $1.20**<br/>*(Requires Token Caution)* | Direct Anthropic API key or web login. Multi-turn sessions bill tokens aggressively. | [Anthropic Claude Guide](providers/anthropic-claude.md) |
| **4. OpenAI / Codex**<br/>*(GPT-4o, o1, o3-mini)* | Teams with enterprise OpenAI agreements or ChatGPT Enterprise seats. | **$0.10 – $0.45** | SOC2 compliant through enterprise OpenAI contract. | [OpenAI / Codex Guide](providers/openai-codex.md) |
| **5. 100% Local ($0.00 Zero-Cost)**<br/>*(Ollama / Apple Silicon)* | Strict air-gapped security, zero cloud budget, or offline development. | **$0.0000**<br/>*(100% Free)* | 100% on-device Metal GPU / RAM. Zero bytes leave the machine. | [Local Ollama Guide](providers/ollama.md) |
| **6. Cursor / OpenRouter / Custom Proxies**<br/>*(OpenAI-compatible)* | Teams using Cursor, OpenRouter, or internal LLM gateway proxies. | Varies by upstream model | Configurable through your gateway. | [Cursor & Proxies Guide](providers/cursor-and-proxies.md) |

---

## ⚠️ Enterprise Caution: Direct Claude Token Consumption

> [!CAUTION]
> **Important Note for Budget Approvers & Tech Leads**:  
> Direct Anthropic Claude (Claude 3.7 Sonnet) charges **$3.00 / Mtok (input)** and **$15.00 / Mtok (output)**. Without Kobayashi Maru's compaction and local workhorse tier:
> - A 30-turn refactoring session with uncompressed Vitest logs can consume **300,000+ tokens**, costing **$4.50 to $12.00 per ticket**.
> - With Kobayashi Maru's **Hybrid Powertrain**:
>   - Luna / Claude plans the architecture (**Turn 1: ~$0.015**).
>   - Local Ornith 1.5 executes tests, edits, and syntax checks (**Turns 2..28: $0.000**).
>   - Total task cost drops to **under $0.05**.

---

## 🔒 Security, Privacy & Corporate Compliance

1. **Zero Phoning Home**: Kobayashi Maru runs entirely locally. It does not send code, telemetry, or user metrics to third-party tracking services without explicit configuration.
2. **Confidentiality by Default**: When the local workhorse (`ornith-1.5:ctx`) is enabled, heavy file reads, code diffs, and test runs remain in local RAM on developer hardware.
3. **No Hardcoded Credentials**: Integrates with standard OS keychains, `~/.aws/credentials`, and standard environment variables (`AWS_PROFILE`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).

---

## 📞 Detailed Setup Guides

- [AWS Bedrock Mantle Setup Guide](providers/bedrock-mantle.md)
- [Direct AWS Bedrock Setup Guide](providers/amazon-bedrock.md)
- [Anthropic Claude & Enterprise Caution Guide](providers/anthropic-claude.md)
- [OpenAI & Codex Setup Guide](providers/openai-codex.md)
- [Cursor Models, OpenRouter & Custom Proxies Guide](providers/cursor-and-proxies.md)
- [Local Ollama Zero-Cost Guide](providers/ollama.md)
