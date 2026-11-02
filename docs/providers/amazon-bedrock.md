# Direct AWS Bedrock Setup Guide ☁️

> **Runtime Provider**: `amazon-bedrock`  
> **Key Models**: `us.anthropic.claude-sonnet-5-5`, `anthropic.claude-sonnet-4-5-20250929-v1:0`, `amazon.nova-pro-v1:0`, `deepseek.v3.2`

---

## Overview

Use Direct AWS Bedrock if your enterprise requires all LLM traffic to remain strictly within your corporate AWS account, VPC, or IAM boundary without intermediate proxies.

---

## Required IAM Permissions

Attach the following policy (or `AmazonBedrockFullAccess`) to your IAM user or role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Configuration Steps

### Step 1: Environment Variables
Add your AWS credentials to your shell configuration (`~/.zshrc` or `~/.bashrc`):

```bash
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your_access_key_id"
export AWS_SECRET_ACCESS_KEY="your_secret_access_key"
# Optional: If using temporary STS credentials
# export AWS_SESSION_TOKEN="your_session_token"
```

Or reference a configured AWS profile:

```bash
export AWS_PROFILE="my-company-aws"
export AWS_REGION="us-east-1"
```

### Step 2: Configure Pi Settings (`~/.pi/agent/settings.json`)
Set Bedrock as your default provider:

```json
{
  "defaultProvider": "amazon-bedrock",
  "defaultModel": "us.anthropic.claude-sonnet-5-5",
  "defaultThinkingLevel": "high"
}
```

### Step 3: Test Connection
Verify the connection with a quick test prompt:

```bash
pi -p --provider amazon-bedrock --model us.anthropic.claude-sonnet-5-5 "Verify AWS Bedrock connection"
```
