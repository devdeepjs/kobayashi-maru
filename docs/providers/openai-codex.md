# OpenAI & Codex Setup Guide 🤖

> **Runtime Provider**: `openai`  
> **Key Models**: `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`, `codex`

---

## Overview

Use OpenAI / Codex if your engineering team has an existing OpenAI Enterprise agreement, ChatGPT Enterprise workspace, or standard API keys.

---

## Authentication & Setup Options

### Option A: Standard API Key
1. Generate an API key from the [OpenAI Platform](https://platform.openai.com/api-keys).
2. Add the key to your shell environment (`~/.zshrc` or `~/.bashrc`):

```bash
export OPENAI_API_KEY="sk-proj-your-openai-api-key"
```

### Option B: OAuth / CLI Login
If your team uses an OpenAI OAuth SSO workflow:

```bash
pi auth login openai
```

---

## Configuration in Pi (`~/.pi/agent/settings.json`)

Set OpenAI as your default provider:

```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-4o",
  "defaultThinkingLevel": "medium"
}
```

For reasoning models like `o1` or `o3-mini`:

```bash
pi --model openai/o1 -p "Analyze this distributed lock race condition"
```

---

## Testing Connection

Verify connectivity with a test prompt:

```bash
pi -p --provider openai --model gpt-4o "Respond with: OpenAI connection confirmed"
```
