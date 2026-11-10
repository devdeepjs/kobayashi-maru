import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { discoverProjectRules, formatRulesGuideline } from "../vendor/extensions/rules-ingester.js";

describe("Repository Rules Auto-Ingester", () => {
	let tempDir: string;

	before(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-ingester-test-"));

		// Create mock rules
		fs.writeFileSync(path.join(tempDir, ".cursorrules"), "# Cursor Rules");
		fs.writeFileSync(path.join(tempDir, "CLAUDE.md"), "# Claude Guidelines");
		fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Agent Conventions");

		// Create mock .cursor/rules
		const cursorDir = path.join(tempDir, ".cursor", "rules");
		fs.mkdirSync(cursorDir, { recursive: true });
		fs.writeFileSync(path.join(cursorDir, "architecture.mdc"), "# Architecture MDC");
		fs.writeFileSync(path.join(cursorDir, "style.md"), "# Style Guide");

		// Create mock .claude/rules/nested
		const claudeNested = path.join(tempDir, ".claude", "rules", "backend");
		fs.mkdirSync(claudeNested, { recursive: true });
		fs.writeFileSync(path.join(claudeNested, "database.md"), "# DB Rules");
	});

	after(() => {
		if (tempDir && fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("discovers all root and nested rule files accurately", () => {
		const rules = discoverProjectRules(tempDir);
		assert.strictEqual(rules.length, 6);

		const names = rules.map((r) => r.name);
		assert.ok(names.includes(".cursorrules"));
		assert.ok(names.includes("CLAUDE.md"));
		assert.ok(names.includes("AGENTS.md"));
		assert.ok(names.includes(path.join(".cursor", "rules", "architecture.mdc")));
		assert.ok(names.includes(path.join(".cursor", "rules", "style.md")));
		assert.ok(names.includes(path.join(".claude", "rules", "backend", "database.md")));
	});

	it("formats guidelines markdown cleanly for system prompt", () => {
		const rules = discoverProjectRules(tempDir);
		const guideline = formatRulesGuideline(rules);

		assert.ok(guideline.includes("## Discovered Repository Rules"));
		assert.ok(guideline.includes(".cursorrules"));
		assert.ok(guideline.includes("architecture.mdc"));
		assert.ok(guideline.includes("database.md"));
	});

	it("gracefully returns empty list on non-existent directories", () => {
		const nonExistent = path.join(os.tmpdir(), "does-not-exist-dir-" + Date.now());
		const rules = discoverProjectRules(nonExistent);
		assert.deepStrictEqual(rules, []);
		assert.strictEqual(formatRulesGuideline([]), "");
	});
});
