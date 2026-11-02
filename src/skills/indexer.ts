import fs from "fs";
import path from "path";
import yaml from "yaml";
import { execSync } from "child_process";

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
 * Recursively discovers all SKILL.md files within a base directory
 */
export function findSkillMarkdownFiles(dir: string, depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const directSkill = path.join(fullPath, "SKILL.md");
        if (fs.existsSync(directSkill)) {
          results.push(directSkill);
        }
        results.push(...findSkillMarkdownFiles(fullPath, depth + 1, maxDepth));
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  } catch {}
  return [...new Set(results)];
}

/**
 * Indexes SKILL.md files from the specified directory or user ~/.agents/skills
 */
export function indexSkills(skillsDir?: string): SkillIndexReport {
  const candidateDirs: string[] = [];
  if (skillsDir) {
    candidateDirs.push(path.resolve(process.cwd(), skillsDir));
  } else {
    candidateDirs.push(path.resolve(process.cwd(), ".agents/skills"));
    const home = process.env.HOME || "";
    if (home) {
      candidateDirs.push(path.join(home, ".agents", "skills"));
      candidateDirs.push(path.join(home, ".pi", "agent", "skills"));
    }
  }

  const skills: SkillMetadata[] = [];
  const seenNames = new Set<string>();

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;

    const skillFiles = findSkillMarkdownFiles(dir, 0, 3);
    for (const skillPath of skillFiles) {
      try {
        const raw = fs.readFileSync(skillPath, "utf-8");
        const { frontmatter } = parseFrontmatter(raw);

        const dirName = path.basename(path.dirname(skillPath));
        const name = frontmatter.name || dirName;
        if (seenNames.has(name)) continue;
        seenNames.add(name);

        const description = frontmatter.description || "";
        const disableModelInvocation = Boolean(frontmatter["disable-model-invocation"]);

        const descWords = description.split(/\s+/).filter(Boolean).length;
        // ~1.35 tokens per word + schema formatting overhead
        const estimatedTokens = Math.ceil((descWords + 10) * 1.35);

        skills.push({
          name,
          description,
          disableModelInvocation,
          filePath: skillPath,
          wordCount: descWords,
          estimatedTokens,
        });
      } catch {}
    }
  }

  // If dumped statically on every turn, includes full tool schemas + descriptions
  const staticTokenCostPerTurn = skills.reduce((acc, s) => acc + s.estimatedTokens, 0) + 500;
  // With dynamic System-1 BM25 loading, default Turn 1 cost is ZERO tokens
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
 * Imports skills from a Git repo or local directory into ~/.agents/skills/<name>
 * Zero-friction skill onboarding for fresh laptops.
 */
export function importSkillsFromSource(
  source: string,
  targetBaseDir?: string
): { success: boolean; importedName: string; destination: string; report: SkillIndexReport; error?: string } {
  const home = process.env.HOME || "";
  const targetDir = targetBaseDir || path.join(home, ".agents", "skills");
  fs.mkdirSync(targetDir, { recursive: true });

  const trimmed = source.trim();
  const isGit = trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("git@") || trimmed.endsWith(".git");

  let folderName = path.basename(trimmed).replace(/\.git$/, "");
  if (!folderName || folderName === "." || folderName === "/") {
    folderName = "custom-skills-" + Date.now();
  }

  const destination = path.join(targetDir, folderName);

  try {
    if (isGit) {
      if (fs.existsSync(destination)) {
        // Update existing git repo
        execSync(`git -C "${destination}" pull --rebase`, { stdio: "ignore" });
      } else {
        // Clone into target
        execSync(`git clone --depth 1 "${trimmed}" "${destination}"`, { stdio: "ignore" });
      }
    } else {
      // Local directory copy
      const srcDir = path.resolve(process.cwd(), trimmed);
      if (!fs.existsSync(srcDir)) {
        return {
          success: false,
          importedName: folderName,
          destination,
          report: indexSkills(targetDir),
          error: `Source directory does not exist: ${srcDir}`,
        };
      }
      fs.cpSync(srcDir, destination, { recursive: true });
    }

    const report = indexSkills(targetDir);
    return {
      success: true,
      importedName: folderName,
      destination,
      report,
    };
  } catch (err: any) {
    return {
      success: false,
      importedName: folderName,
      destination,
      report: indexSkills(targetDir),
      error: err?.message || String(err),
    };
  }
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
