import fs from "fs";
import path from "path";
import yaml from "yaml";

export interface SkillMetadata {
  name: string;
  description: string;
  disableModelInvocation?: boolean;
  filePath: string;
  wordCount: number;
  estimatedTokens: number;
}

export interface SkillIndexReport {
  totalSkills: number;
  skills: SkillMetadata[];
  staticTokenCostPerTurn: number;
  dynamicTokenCostDefault: number;
  tokenSavingsPercentage: number;
}

/**
 * Parses YAML frontmatter from a SKILL.md file
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  try {
    const frontmatter = yaml.parse(match[1]);
    return { frontmatter: frontmatter || {}, body: match[2] };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Indexes all Matt Pocock SKILL.md files inside the specified directory
 */
export function indexSkills(skillsDir: string = ".agents/skills"): SkillIndexReport {
  const resolvedDir = path.resolve(process.cwd(), skillsDir);
  if (!fs.existsSync(resolvedDir)) {
    return {
      totalSkills: 0,
      skills: [],
      staticTokenCostPerTurn: 0,
      dynamicTokenCostDefault: 0,
      tokenSavingsPercentage: 0,
    };
  }

  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  const skills: SkillMetadata[] = [];
  let totalWords = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(resolvedDir, entry.name, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const raw = fs.readFileSync(skillPath, "utf-8");
        const { frontmatter } = parseFrontmatter(raw);

        const name = frontmatter.name || entry.name;
        const description = frontmatter.description || "";
        const disableModelInvocation = Boolean(frontmatter["disable-model-invocation"]);

        const descWords = description.split(/\s+/).filter(Boolean).length;
        totalWords += descWords + 10; // plus schema formatting overhead

        // ~1.3 tokens per word + JSON formatting
        const estimatedTokens = Math.ceil((descWords + 10) * 1.35);

        skills.push({
          name,
          description,
          disableModelInvocation,
          filePath: skillPath,
          wordCount: descWords,
          estimatedTokens,
        });
      }
    }
  }

  // If dumped statically on every turn, includes full tool schemas + descriptions
  const staticTokenCostPerTurn = skills.reduce((acc, s) => acc + s.estimatedTokens, 0) + 500;
  // With dynamic System-1 loading, default Turn 1 cost is ZERO tokens
  const dynamicTokenCostDefault = 0;
  const tokenSavingsPercentage = 100;

  return {
    totalSkills: skills.length,
    skills,
    staticTokenCostPerTurn,
    dynamicTokenCostDefault,
    tokenSavingsPercentage,
  };
}

/**
 * Evaluates a user prompt to detect if any skill should be dynamically activated
 */
export function matchSkill(
  prompt: string,
  skills: SkillMetadata[]
): SkillMetadata | null {
  const trimmed = prompt.trim().toLowerCase();

  // 1. Direct slash command match (e.g., "/to-spec", "/grill-me")
  for (const skill of skills) {
    if (trimmed.startsWith(`/${skill.name}`)) {
      return skill;
    }
  }

  // 2. Exact name token match in prompt
  for (const skill of skills) {
    const regex = new RegExp(`\\b${skill.name}\\b`, "i");
    if (regex.test(trimmed)) {
      return skill;
    }
  }

  return null;
}

/**
 * Loads the full markdown content of a matched skill
 */
export function loadSkillContent(skill: SkillMetadata): string {
  return fs.readFileSync(skill.filePath, "utf-8");
}
