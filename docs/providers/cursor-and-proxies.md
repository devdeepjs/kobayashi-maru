# Cursor Models, OpenRouter & Custom Proxies Guide 🔌

> **Runtime Provider**: OpenAI-compatible custom endpoints, OpenRouter, or Cursor proxies.  
> **Key Use Cases**: Connecting Cursor-compatible models, OpenRouter aggregator, DeepSeek API, or internal company LLM gateways.

---

## Overview

Pi and Kobayashi Maru can connect to **any OpenAI-compatible proxy, endpoint, or gateway**. This allows you to:
1. Route requests to **OpenRouter** (accessing hundreds of open models like DeepSeek-R1, Qwen 2.5 Coder, Llama 3.3).
2. Connect to **Cursor-compatible proxies** or internal developer gateways.
3. Access self-hosted vLLM, LiteLLM, or Ollama servers on your corporate network.

---

## Setup: Adding Custom Providers in `~/.pi/agent/models.json`

Add your custom endpoint under `providers` in `~/.pi/agent/models.json`:

```json
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "api": "openai-completions",
      "apiKey": "sk-or-v1-your-openrouter-key",
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
        }
      ]
    },
    "cursor-proxy": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "apiKey": "cursor-proxy-key",
      "models": [
        {
          "id": "cursor-fast",
          "name": "Cursor Fast Model",
          "contextWindow": 65536,
          "maxTokens": 8192,
          "reasoning": true
        }
      ]
    }
  }
}
```

---

## Using Environment Variables for Base URL

Alternatively, you can redirect the default `openai` provider to your proxy via environment variables:

```bash
export OPENAI_BASE_URL="https://your-custom-gateway.company.com/v1"
export OPENAI_API_KEY="your-gateway-token"
```

---

## Testing Your Custom Provider

```bash
# Test OpenRouter
pi -p --provider openrouter --model deepseek/deepseek-r1 "Say hello in 3 words"

# Test Custom / Cursor Proxy
pi -p --provider cursor-proxy --model cursor-fast "Hello from Kobayashi Maru"
```
