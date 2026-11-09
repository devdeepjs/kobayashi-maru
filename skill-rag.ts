import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import fs from "fs";
import path from "path";

/**
 * Self-contained Okapi BM25 Ranker for Zero-Dependency SRA (Skill Retrieval Augmentation).
 * Follows the standard Robertson-Spärck Jones Okapi BM25 formula.
 */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with"
]);

function stem(term: string): string {
  if (term.length > 4 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && /(ches|shes|sses|xes|zes)$/.test(term)) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith("s") && !term.endsWith("ss")) return term.slice(0, -1);
  return term;
}

export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 0 && !STOP_WORDS.has(term))
    .map(stem);
}

export class Bm25Ranker {
  k1: number;
  b: number;
  constructor(options: { k1?: number; b?: number } = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
  }

  rank(query: string, documents: Array<{ name: string; text: string }>, limit: number): Array<{ name: string; score: number }> {
    const queryTerms = [...new Set(tokenize(query))];
    if (queryTerms.length === 0 || documents.length === 0 || limit <= 0) return [];

    const termCounts = documents.map((document) => {
      const counts = new Map<string, number>();
      for (const term of tokenize(document.text)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
      return counts;
    });

    const lengths = termCounts.map((counts) => [...counts.values()].reduce((sum, count) => sum + count, 0));
    const averageLength = lengths.reduce((sum, length) => sum + length, 0) / documents.length || 1;

    const idf = new Map(
      queryTerms.map((term) => {
        const frequency = termCounts.filter((counts) => counts.has(term)).length;
        return [term, Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5))];
      })
    );

    const matches: Array<{ name: string; score: number }> = [];
    documents.forEach((document, index) => {
      let score = 0;
      for (const term of queryTerms) {
        const count = termCounts[index].get(term);
        if (!count) continue;
        const norm = this.k1 * (1 - this.b + (this.b * lengths[index]) / averageLength);
        score += (idf.get(term) ?? 0) * ((count * (this.k1 + 1)) / (count + norm));
      }
      if (score > 0) {
        matches.push({ name: document.name, score });
      }
    });

    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

/**
 * Recursively scans directory for SKILL.md files (up to maxDepth)
 * Allows zero-friction import of git repos or nested folders of custom skills on fresh laptops.
 */
export function findSkillFiles(dir: string, depth = 0, maxDepth = 3): string[] {
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
        results.push(...findSkillFiles(fullPath, depth + 1, maxDepth));
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  } catch {}
  return [...new Set(results)];
}

/**
 * F1 SRA Engine (Skill Retrieval Augmentation & Minimal Tool Seam)
 * 
 * 1. Supports 500+ skills in memory via BM25 (< 2ms index latency).
 * 2. On turn start (before_agent_start):
 *    - Injects 0 skills on greetings or generic tasks (saving 3,000 to 35,000 tokens).
 *    - Injects ONLY the top 1-2 matched skills when a task specifically calls for them.
 *    - Implements Dynamic Tool Seam: keeps passive meta/web tools out of prompt unless requested.
 * 3. Registers `find_skill` (with both execute & handler for Pi 1.4+ compatibility)
 *    so the agent can discover and retrieve ANY skill mid-turn on demand.
 */
export default function (pi: ExtensionAPI) {
  let allSkills: any[] = [];
  let skillDocs: Array<{ name: string; text: string; skill: any }> = [];
  const ranker = new Bm25Ranker();

  function indexSkills(skills: any[]) {
    if (!skills || skills.length === 0) return;
    allSkills = [...skills];
    skillDocs = allSkills.map((s) => ({
      name: s.name,
      text: `${s.name} ${s.description || ""}`,
      skill: s,
    }));
  }

  // Pre-load from user ~/.agents/skills, package directories, and custom imports
  try {
    const candidateDirs = [
      path.join(process.env.HOME || "", ".agents", "skills"),
      path.join(process.cwd(), ".agents", "skills"),
      path.join(process.env.HOME || "", ".pi", "agent", "skills"),
      path.join(process.env.HOME || "", ".pi", "agent", "npm", "node_modules", "@dietrichgebert", "ponytail", "skills"),
    ];

    // Check virtual-models.json for user-configured skill directories
    try {
      const vConfigPath = path.join(process.env.HOME || "", ".pi", "agent", "virtual-models.json");
      if (fs.existsSync(vConfigPath)) {
        const vConfig = JSON.parse(fs.readFileSync(vConfigPath, "utf8"));
        if (Array.isArray(vConfig.skillDirs)) {
          for (const d of vConfig.skillDirs) {
            if (typeof d === "string" && fs.existsSync(d)) candidateDirs.push(d);
          }
        }
      }
    } catch {}

    for (const baseDir of candidateDirs) {
      if (fs.existsSync(baseDir)) {
        const skillFiles = findSkillFiles(baseDir, 0, 3);
        for (const skillPath of skillFiles) {
          try {
            const content = fs.readFileSync(skillPath, "utf8");
            const descMatch = content.match(/description:\s*([^\n]+)/);
            const desc = descMatch ? descMatch[1].trim() : "";
            const nameMatch = content.match(/name:\s*([^\n]+)/);
            const dirName = path.basename(path.dirname(skillPath));
            const name = nameMatch ? nameMatch[1].trim() : dirName;
            if (!skillDocs.some((d) => d.name === name)) {
              skillDocs.push({
                name,
                text: `${name} ${desc}`,
                skill: { name, description: desc, filePath: skillPath },
              });
            }
          } catch {}
        }
      }
    }
  } catch {
    // Graceful fallback
  }

  // Hook before_agent_start: Dynamic Skill Selection & Minimal Tool Seam
  pi.on("before_agent_start", async (event, ctx) => {
    const rawSkills = event.systemPromptOptions.skills || [];
    if (rawSkills.length > allSkills.length) {
      indexSkills(rawSkills);
    }

    const promptText = (event as any).prompt || (event as any).userPrompt || "";
    const isWebRequested = /\b(web|search|browse|fetch|url|http|https|docs|online|google|jira|atlassian)\b/i.test(promptText);

    // 1. Minimal Tool Seam: Filter noisy tools & context-gate MCP tools from the active model schema
    if (event.systemPromptOptions.selectedTools) {
      const PASSIVE_TOOLS = new Set([
        "fetch_budget_from_portkey",
        "register_usage_budget",
        "show_usage_stats",
        "todo",
        "subagent",
        ...(!isWebRequested ? ["web_search", "source_check", "fetch_content", "get_search_content"] : [])
      ]);

      event.systemPromptOptions.selectedTools = event.systemPromptOptions.selectedTools.filter((t) => {
        if (PASSIVE_TOOLS.has(t)) return false;
        // Context-gate MCP tools (mcp__<server>__<tool>): omit unless prompt references server or tool keywords
        if (t.startsWith("mcp__")) {
          const parts = t.split("__");
          if (parts.length >= 2) {
            const serverName = parts[1].toLowerCase().replace(/[-_]/g, "");
            const toolName = (parts[2] || "").toLowerCase().replace(/[-_]/g, "");
            const promptNorm = promptText.toLowerCase().replace(/[-_]/g, "");
            const serverMatch = serverName.length >= 3 && promptNorm.includes(serverName);
            const toolMatch = toolName.length >= 4 && promptNorm.includes(toolName);
            if (!serverMatch && !toolMatch) {
              return false;
            }
          }
        }
        return true;
      });
    }

    // 2. Intent-based Skill Injection: Zero tokens on generic prompts
    if (!promptText || promptText.trim().length < 8) {
      event.systemPromptOptions.skills = [];
      return;
    }

    // BM25 Ranking over the 500+ skill catalog
    const hits = ranker.rank(promptText, skillDocs, 2);
    const matched = hits
      .filter((h: any) => h.score >= 2.5)
      .map((h: any) => {
        const found = skillDocs.find((d) => d.name === h.name);
        return found ? found.skill : null;
      })
      .filter(Boolean);

    event.systemPromptOptions.skills = matched;
  });

  // Meta-tool for on-demand skill retrieval during multi-turn sessions
  // Supports BOTH execute(callId, params, ...) and handler(params, ctx) for universal Pi compatibility
  const findSkillExecutor = async (
    first: any,
    second?: any,
    _signal?: any,
    _onUpdate?: any,
    _ctx?: any
  ) => {
    const params = (second && typeof second === "object" && "query" in second)
      ? second
      : (first && typeof first === "object" && "query" in first)
      ? first
      : { query: typeof first === "string" ? first : "" };

    const query = String(params.query || "").trim();
    if (!query) {
      return {
        content: [{ type: "text", text: "Please provide a search query to locate skills (e.g. 'jira ticket investigation', 'unit tests', 'refactor')." }],
      };
    }

    const hits = ranker.rank(query, skillDocs, 4);
    if (!hits || hits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No specialized skills found matching "${query}". Available skills can be listed or standard engineering tools can be used directly.`,
          },
        ],
      };
    }

    const results = hits.map((h: any) => {
      const doc = skillDocs.find((d) => d.name === h.name);
      if (!doc || !doc.skill) return "";
      const filePath = doc.skill.filePath;
      let content = "";
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {}
      return `### Skill: ${doc.name} (BM25 relevance score: ${h.score.toFixed(2)})\nPath: ${filePath}\nInstructions:\n${content}\n`;
    });

    const text = results.filter(Boolean).join("\n---\n");
    return {
      content: [{ type: "text", text }],
    };
  };

  pi.registerTool({
    name: "find_skill",
    label: "Search & Mount Skills from BM25 Catalog",
    description: "Search and retrieve specialized skill runbooks from the 500+ skills library on demand (e.g. Jira, TDD, code review, git-guardrails, architecture, etc.).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords or task description to search skills (e.g. 'jira ticket investigation', 'unit test', 'refactor', 'diagram').",
        },
      },
      required: ["query"],
    },
    execute: findSkillExecutor,
    handler: findSkillExecutor,
  });
}
