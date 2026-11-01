import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Bm25Ranker } from "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/extensions/tool-search/tool.js";
import fs from "fs";
import path from "path";

/**
 * SRA (Skill Retrieval Augmentation) Extension
 * 
 * Solves the 500+ skill context bloat problem:
 * 1. Maintains an in-memory BM25 index of all installed skills.
 * 2. On turn start (before_agent_start): filters systemPromptOptions.skills down to only
 *    skills relevant to the current user request (top 1-2 with score >= 2.5), or 0 for generic greetings.
 * 3. Registers a `find_skill` tool so the model can search and pull any skill into context on demand.
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

  // Pre-load from ~/.agents/skills on startup if present
  try {
    const agentsSkillsDir = path.join(process.env.HOME || "", ".agents", "skills");
    if (fs.existsSync(agentsSkillsDir)) {
      const dirs = fs.readdirSync(agentsSkillsDir);
      for (const d of dirs) {
        const skillPath = path.join(agentsSkillsDir, d, "SKILL.md");
        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, "utf8");
          const descMatch = content.match(/description:\s*([^\n]+)/);
          const desc = descMatch ? descMatch[1] : "";
          const nameMatch = content.match(/name:\s*([^\n]+)/);
          const name = nameMatch ? nameMatch[1].trim() : d;
          skillDocs.push({
            name,
            text: `${name} ${desc}`,
            skill: { name, description: desc, filePath: skillPath },
          });
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // Hook before_agent_start to dynamically prune/inject skills
  pi.on("before_agent_start", async (event, ctx) => {
    const rawSkills = event.systemPromptOptions.skills || [];
    if (rawSkills.length > allSkills.length) {
      indexSkills(rawSkills);
    }

    const promptText = (event as any).prompt || "";
    // If prompt is short or generic, do not pollute context with ambient skills
    if (!promptText || promptText.trim().length < 8) {
      event.systemPromptOptions.skills = [];
      return;
    }

    // Rank against the full catalog using BM25
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

  // Meta-tool for on-demand skill retrieval by the agent during multi-turn execution
  pi.registerTool({
    name: "find_skill",
    description: "Search and retrieve specialized skill runbooks from the 500+ skills library (e.g. archify, tdd, code-review, diagnosing-bugs, etc.).",
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
