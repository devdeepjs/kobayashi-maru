import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

describe("Ecosystem End-to-End Regression Test", () => {
	const vendorExtensionsDir = path.resolve(process.cwd(), "vendor", "extensions");

	it("verifies all core vendor extensions exist and are non-empty", () => {
		const requiredFiles = [
			"evidence-reducer.ts",
			"protected-paths.ts",
			"session-namer.ts",
			"rules-ingester.ts",
			"todo.ts",
			"handoff.ts",
		];

		for (const file of requiredFiles) {
			const full = path.join(vendorExtensionsDir, file);
			assert.ok(fs.existsSync(full), `Missing expected extension: ${file}`);
			const stat = fs.statSync(full);
			assert.ok(stat.size > 200, `Extension file ${file} appears suspiciously empty (< 200 bytes)`);
		}
	});

	it("verifies plan-mode and subagent directories exist with valid entrypoints", () => {
		assert.ok(fs.existsSync(path.join(vendorExtensionsDir, "plan-mode", "index.ts")));
		assert.ok(fs.existsSync(path.join(vendorExtensionsDir, "subagent", "index.ts")));
	});

	it("runs real Pi agent turn with all extensions active", () => {
		// Run a live turn against our local Pi installation
		const cmd = 'pi --no-session --model auto/planner-worker -p "Reply with exactly: ALL_SYSTEMS_GO"';
		const output = execSync(cmd, { encoding: "utf8", timeout: 25000 });

		assert.ok(
			output.includes("ALL_SYSTEMS_GO"),
			`Expected Pi output to contain 'ALL_SYSTEMS_GO', received: ${output}`
		);
	});
});
