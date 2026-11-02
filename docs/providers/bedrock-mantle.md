# AWS Bedrock Mantle Setup Guide ⚡

> **Runtime Provider**: `bedrock-mantle`  
> **Key Models**: `openai.gpt-5.6-luna` (Planning & Orchestration), `anthropic.claude-opus-5-5`, `openai.gpt-5.6-sol`

---

## What is Bedrock Mantle?

`bedrock-mantle` is an in-process, high-throughput proxy for AWS Bedrock. It provides:
1. **Low-Latency Streaming Cache Warming**: Pre-warms model KV caches to cut first-token response latency by up to 70%.
2. **Predictable Token Economics**: Luna (`openai.gpt-5.6-luna`) delivers frontier planning capabilities at **$0.02 / Mtok cache read** and **$0.22 / Mtok input** (14x cheaper than direct Claude Sonnet).
3. **Cross-Region SigV4 Handshakes**: Seamlessly handles authentication across US and EU Bedrock regions.

---

## Step-by-Step Setup

### Step 1: AWS Credentials
Ensure your AWS credentials have permission to invoke Bedrock models (`bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`).

You can configure them via the standard AWS CLI:

```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, and Default Region (e.g. us-east-1)
```

Alternatively, export them in your terminal profile (`~/.zshrc` or `~/.bashrc`):

```bash
export AWS_PROFILE="your-company-profile"
export AWS_REGION="us-east-1"
```

### Step 2: Install Mantle Package in Pi
Run the following command (handled automatically by `./setup.sh`):

```bash
pi install npm:pi-bedrock-mantle
```

### Step 3: Configure `~/.pi/agent/settings.json`
Set Bedrock Mantle as your default provider:

```json
{
  "packages": [
    "npm:pi-bedrock-mantle"
  ],
  "defaultProvider": "bedrock-mantle",
  "defaultModel": "openai.gpt-5.6-luna",
  "defaultThinkingLevel": "medium"
}
```

### Step 4: Verify Connection
Test connection to Luna:

```bash
pi -p --provider bedrock-mantle --model openai.gpt-5.6-luna "Say hello in 3 words"
```
