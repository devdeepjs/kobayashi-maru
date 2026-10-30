import { askAdvisor, AdvisorRequest } from "./client.js";

/**
 * Pi Extension: Registers `call_advisor` tool inside Pi runtime
 */
export default function kobayashiAdvisorExtension(pi: any) {
  if (!pi || typeof pi.registerTool !== "function") {
    return;
  }

  pi.registerTool({
    name: "call_advisor",
    description:
      "Stateless escalation to Frontier Advisor (Claude Sonnet 4.5 via AWS Bedrock). Use when encountering hard architectural choices, concurrency bugs, or repeated test failures. Transmits an isolated ~500-token problem summary rather than the full session context, saving 95%+ on token costs.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Clear 1-2 sentence summary of what the agent is attempting to solve.",
        },
        question: {
          type: "string",
          description: "The specific architectural or root-cause question.",
        },
        code_snippet: {
          type: "string",
          description: "Minimal relevant code snippet (under 50 lines).",
        },
      },
      required: ["summary", "question"],
    },
    execute: async (_callId: string, params: { summary: string; question: string; code_snippet?: string }) => {
      try {
        const result = await askAdvisor({
          summary: params.summary,
          question: params.question,
          codeSnippet: params.code_snippet,
        });

        return {
          content: [
            {
              type: "text",
              text: `[Frontier Advisor Consultation • Cost: $${result.costUsd.toFixed(4)} • Tokens: ${result.inputTokens}in/${result.outputTokens}out]\n\n${result.advice}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `[Frontier Advisor Error]: Unable to reach Bedrock Sonnet: ${err.message}`,
            },
          ],
        };
      }
    },
  });
}
