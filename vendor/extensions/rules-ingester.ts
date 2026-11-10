/**
 * Kobayashi Maru // Rules Ingester Extension
 *
 * Automatically detects and ingests project rules:
 * - .cursorrules
 * - .cursor/rules/*.mdc
 * - .claude/rules/*.md
 * - CLAUDE.md
 * - AGENTS.md
 *
 * Appends active rule summaries into systemPromptOptions so models natively adhere
 * to project-specific coding standards, architecture patterns, and conventions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface DiscoveredRule {
	name: string;
	path: string;
	type: "cursor" | "claude" | "agent";
}

function findRuleFilesRecursively(dir: string, extensions: string[]): string[] {
	const results: string[] = [];
	if (!fs.existsSync(dir)) return results;

	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip node_modules and .git
				if (entry.name !== "node_modules" && entry.name !== ".git") {
					results.push(...findRuleFilesRecursively(full, extensions));
				}
			} else if (entry.isFile()) {
				const lower = entry.name.toLowerCase();
				if (extensions.some((ext) => lower.endsWith(ext))) {
					results.push(full);
				}
			}
		}
	} catch {}

	return results;
}

export function discoverProjectRules(rootDir: string): DiscoveredRule[] {
	const rules: DiscoveredRule[] = [];
	if (!rootDir || !fs.existsSync(rootDir)) return rules;

	// 1. Root rule files
	const rootConfigs: Array<{ file: string; type: DiscoveredRule["type"] }> = [
		{ file: ".cursorrules", type: "cursor" },
		{ file: "CLAUDE.md", type: "claude" },
		{ file: "AGENTS.md", type: "agent" },
	];

	for (const config of rootConfigs) {
		const full = path.join(rootDir, config.file);
		if (fs.existsSync(full)) {
			rules.push({ name: config.file, path: full, type: config.type });
		}
	}

	// 2. .cursor/rules/ (*.mdc and *.md)
	const cursorRulesDir = path.join(rootDir, ".cursor", "rules");
	const cursorFiles = findRuleFilesRecursively(cursorRulesDir, [".mdc", ".md"]);
	for (const file of cursorFiles) {
		rules.push({
			name: path.relative(rootDir, file),
			path: file,
			type: "cursor",
		});
	}

	// 3. .claude/rules/ (*.md)
	const claudeRulesDir = path.join(rootDir, ".claude", "rules");
	const claudeFiles = findRuleFilesRecursively(claudeRulesDir, [".md"]);
	for (const file of claudeFiles) {
		rules.push({
			name: path.relative(rootDir, file),
			path: file,
			type: "claude",
		});
	}

	return rules;
}

export function formatRulesGuideline(rules: DiscoveredRule[]): string {
	if (rules.length === 0) return "";
	const list = rules.map((r) => `- \`${r.name}\` (${r.type} rule)`).join("\n");
	return `\n\n## Discovered Repository Rules\nThe following project rules are active in this workspace:\n${list}\nRead and strictly adhere to these rules when analyzing, modifying, or creating code in this repository.\n`;
}

export default function (pi: ExtensionAPI) {
	let discoveredRules: DiscoveredRule[] = [];

	pi.on("session_start", async (_event, ctx) => {
		discoveredRules = discoverProjectRules(ctx.cwd || process.cwd());
		if (discoveredRules.length > 0 && ctx.hasUI) {
			ctx.ui.notify(
				`Kobayashi: Ingested ${discoveredRules.length} repository rule file(s)`,
				"info"
			);
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (discoveredRules.length === 0) return undefined;

		const notice = formatRulesGuideline(discoveredRules);
		return {
			systemPrompt: (event.systemPrompt || "") + notice,
		};
	});
}
