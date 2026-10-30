import { z } from "zod";

export const CostSchema = z.object({
  input: z.number().default(0),
  output: z.number().default(0),
  cache_read: z.number().default(0),
  cache_write: z.number().default(0),
});

export const ThinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const TierModelSchema = z.object({
  provider: z.enum(["ollama", "bedrock-mantle", "amazon-bedrock", "anthropic", "openai", "custom"]),
  model: z.string(),
  name: z.string().optional(),
  context_window: z.number().default(32768),
  max_tokens: z.number().default(8192),
  reasoning: z.boolean().default(true),
  thinking: ThinkingLevelSchema.default("medium"), // Reasoning budget / thinking effort (high, medium, low, off)
  temperature: z.number().min(0).max(1).default(0.2),
  cost: CostSchema.default({}),
  default_for: z.array(z.string()).default([]),
  mode: z.enum(["full", "stateless"]).default("full"),
  max_turns_per_task: z.number().optional(),
  fallback_model: z.string().optional(), // Secondary fallback model if primary throttles (HTTP 429/503)
  fallback_thinking: ThinkingLevelSchema.optional(),
});

export const RouterSchema = z.object({
  engine: z.enum(["jev", "rule-based", "manual"]).default("jev"),
  model: z.string().default("kev:4b"),
  escalation_threshold: z.number().default(2),
});

export const SolPiSchema = z.object({
  action_fusion: z.boolean().default(true),
  observation_pack: z.boolean().default(true),
  online_context_compact: z.boolean().default(true),
  evidence_preserving_reducer: z.boolean().default(false),
  cache_write_read_ratio: z.number().default(12.5),
});

export const SpillStoreSchema = z.object({
  enabled: z.boolean().default(true),
  threshold_tokens: z.number().default(1500),
});

export const CompactionSchema = z.object({
  reserve_tokens: z.number().default(6144),
});

export const EfficiencySchema = z.object({
  sol_pi: SolPiSchema.default({}),
  spill_store: SpillStoreSchema.default({}),
  compaction: CompactionSchema.default({}),
});

export const SecuritySchema = z.object({
  firewall: z.enum(["local", "none", "pi-jev-auto-mode"]).default("local"),
  blocked_commands: z.array(z.string()).default([
    "rm -rf /",
    "git reset --hard",
    "sudo",
    "npm publish",
  ]),
  sandbox: z.enum(["codemode", "gondolin", "docker", "none"]).default("codemode"),
});

export const SkillsSchema = z.object({
  directory: z.string().default(".agents/skills"),
  loader: z.enum(["dynamic", "static"]).default("dynamic"),
  auto_detect_slash_commands: z.boolean().default(true),
  max_header_words: z.number().default(15),
});

export const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
});

export const McpSchema = z.object({
  mode: z.enum(["deferred", "static"]).default("deferred"),
  servers: z.record(McpServerSchema).default({}),
});

export const KobayashiConfigSchema = z.object({
  name: z.string().default("kobayashi-workstation"),
  version: z.string().default("1.0.0"),
  starting_tier: z.enum(["advisor", "orchestrator", "workhorse", "local"]).default("orchestrator"),
  router: RouterSchema.default({}),
  tiers: z.object({
    local: TierModelSchema.optional(),
    workhorse: TierModelSchema,
    orchestrator: TierModelSchema.optional(),
    advisor: TierModelSchema.optional(),
  }),
  efficiency: EfficiencySchema.default({}),
  security: SecuritySchema.default({}),
  skills: SkillsSchema.default({}),
  mcp: McpSchema.default({}),
});

export type KobayashiConfig = z.infer<typeof KobayashiConfigSchema>;
export type TierModel = z.infer<typeof TierModelSchema>;
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;
export type RouterConfig = z.infer<typeof RouterSchema>;
export type EfficiencyConfig = z.infer<typeof EfficiencySchema>;
export type SecurityConfig = z.infer<typeof SecuritySchema>;
export type SkillsConfig = z.infer<typeof SkillsSchema>;
export type McpConfig = z.infer<typeof McpSchema>;
