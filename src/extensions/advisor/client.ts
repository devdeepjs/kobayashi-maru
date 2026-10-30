import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";

export interface AdvisorRequest {
  summary: string;
  codeSnippet?: string;
  question: string;
  modelId?: string;
  region?: string;
  profile?: string;
}

export interface AdvisorResponse {
  advice: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

/**
 * Invokes Frontier Advisor (Claude Sonnet 4.5 via Bedrock) in a stateless 1-turn call
 */
export async function askAdvisor(params: AdvisorRequest): Promise<AdvisorResponse> {
  const region = params.region || process.env.AWS_REGION || "us-east-1";
  const profile = params.profile || process.env.AWS_PROFILE || "default";
  const modelId =
    params.modelId || "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

  const client = new BedrockRuntimeClient({
    region,
    credentials: fromIni({ profile }),
  });

  const promptContent = `
### CONTEXT / PROBLEM SUMMARY:
${params.summary}

### TARGET QUESTION / ROOT-CAUSE NEEDED:
${params.question}

${params.codeSnippet ? `### MINIMAL RELEVANT CODE:\n\`\`\`\n${params.codeSnippet}\n\`\`\`` : ""}
`.trim();

  const command = new ConverseCommand({
    modelId,
    system: [
      {
        text: "You are an Elite Principal Systems Architect acting as a stateless Frontier Advisor. You receive an isolated problem statement from a local worker agent. Provide a surgical, high-accuracy root-cause diagnosis and code fix strategy. Be concise, direct, and authoritative. Do not output conversational preamble.",
      },
    ],
    messages: [
      {
        role: "user",
        content: [{ text: promptContent }],
      },
    ],
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.2,
    },
  });

  const start = Date.now();
  const response = await client.send(command);
  const latencyMs = Date.now() - start;

  const textBlocks = response.output?.message?.content || [];
  const advice = textBlocks
    .map((block) => block.text || "")
    .join("\n")
    .trim();

  const inputTokens = response.usage?.inputTokens || 0;
  const outputTokens = response.usage?.outputTokens || 0;

  // Pricing: Sonnet 4.5 on Bedrock ($3.00/1M in, $15.00/1M out)
  const costUsd = (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;

  return {
    advice,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
  };
}
