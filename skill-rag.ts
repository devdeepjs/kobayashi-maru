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
 * F1 SRA Engine (Skill Retrieval Augmentation & DeepSeek Minimal Seam)
 * 
 * 1. Supports 500+ skills in memory via BM25 (< 2ms index latency).
 * 2. On turn start (before_agent_start):
 *    - Injects 0 skills on greetings or generic tasks (saving 3,000 to 35,000 tokens).
 *    - Injects ONLY the top 1-2 matched skills when a task specifically calls for them.
 *    - Implements Dynamic Tool Seam: keeps passive meta/web tools out of prompt unless requested.
 * 3. Registers `find_skill` so the agent can discover and retrieve ANY skill mid-turn on demand.
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

  // Pre-load from user ~/.agents/skills and package directories
  try {
    const candidateDirs = [
      path.join(process.env.HOME || "", ".agents", "skills"),
      path.join(process.cwd(), ".agents", "skills"),
      path.join(process.env.HOME || "", ".pi", "agent", "skills"),
      path.join(process.env.HOME || "", ".pi", "agent", "npm", "node_modules", "@dietrichgebert", "ponytail", "skills"),
    ];

    for (const baseDir of candidateDirs) {
      if (fs.existsSync(baseDir)) {
        const entries = fs.readdirSync(baseDir);
        for (const entry of entries) {
          const skillPath = path.join(baseDir, entry, "SKILL.md");
          if (fs.existsSync(skillPath)) {
            const content = fs.readFileSync(skillPath, "utf8");
            const descMatch = content.match(/description:\s*([^\n]+)/);
            const desc = descMatch ? descMatch[1].trim() : "";
            const nameMatch = content.match(/name:\s*([^\n]+)/);
            const name = nameMatch ? nameMatch[1].trim() : entry;
            if (!skillDocs.some((d) => d.name === name)) {
              skillDocs.push({
                name,
                text: `${name} ${desc}`,
                skill: { name, description: desc, filePath: skillPath },
              });
            }
          }
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

    const promptText = (event as any).prompt || "";
    const isWebRequested = /\b(web|search|browse|fetch|url|http|https|docs|online|google)\b/i.test(promptText);

    // 1. DeepSeek Minimal Seam: Filter noisy tools from the active model schema
    if (event.systemPromptOptions.selectedTools) {
      const PASSIVE_TOOLS = new Set([
        "fetch_budget_from_portkey",
        "register_usage_budget",
        "show_usage_stats",
        "todo",
        "subagent",
        ...(!isWebRequested ? ["web_search", "source_check", "fetch_content", "get_search_content"] : [])
      ]);
      event.systemPromptOptions.selectedTools = event.systemPromptOptions.selectedTools.filter(
        (t) => !PASSIVE_TOOLS.has(t)
      );
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
  pi.registerTool({
    name: "find_skill",
    description: "Search and retrieve specialized skill runbooks from the 500+ skills library (e.g. archify, ponytail, tdd, code-review, diagnosing-bugs, etc.).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords or task description to search skills (e.g. 'draw sequence diagram', 'unit test', 'refactor', 'diagnose memory').",
        },
      },
      required: ["query"],
    },
    handler: async (args: { query: string }, ctx: ExtensionContext) => {
      const hits = ranker.rank(args.query, skillDocs, 3);
      if (!hits || hits.length === 0) {
        return `No specialized skills found matching "${args.query}". Proceed with standard tools.`;
      }

      const results = hits.map((h: any) => {
        const doc = skillDocs.find((d) => d.name === h.name);
        if (!doc || !doc.skill) return "";
        const filePath = doc.skill.filePath;
        let content = "";
        try {
          content = fs.readFileSync(filePath, "utf8");
        } catch {}
        return `### Skill: ${doc.name} (relevance score: ${h.score.toFixed(2)})\nPath: ${filePath}\nInstructions:\n${content}\n`;
      });

      return results.join("\n---\n");
    },
  });
}
