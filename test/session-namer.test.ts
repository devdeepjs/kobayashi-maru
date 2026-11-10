import { describe, it } from "node:test";
import assert from "node:assert";
import { generateCleanSessionName } from "../vendor/extensions/session-namer.js";

describe("Session Auto-Namer Slug Heuristics", () => {
	it("strips leading slash commands from prompt", () => {
		const name = generateCleanSessionName("/plan build the JWT authentication middleware");
		assert.strictEqual(name, "build the JWT authentication middleware");
	});

	it("strips multiple conversational fluff prefixes", () => {
		const name = generateCleanSessionName("Please can you fix the postgres connection pool timeout");
		assert.strictEqual(name, "fix the postgres connection pool");
	});

	it("handles inline code backticks and filenames cleanly", () => {
		const name = generateCleanSessionName("Refactor `bottom-up-router.ts` to support dynamic discovery");
		assert.strictEqual(name, "Refactor bottom-up-router.ts to support...");
	});

	it("strips URLs and markdown syntax", () => {
		const name = generateCleanSessionName("Review PR https://github.com/org/repo/pull/42 for broken symlinks");
		assert.strictEqual(name, "Review PR for broken symlinks");
	});

	it("clamps long strings to max length with ellipsis", () => {
		const name = generateCleanSessionName("ExtremelyLongModuleNameWithVeryVerboseRequirementsAndDescriptionsHere", 25);
		assert.ok(name.length <= 25);
		assert.ok(name.endsWith("..."));
	});

	it("returns safe fallback on empty or punctuation-only strings", () => {
		assert.strictEqual(generateCleanSessionName(""), "New Session");
		assert.strictEqual(generateCleanSessionName("??? !!! @@@"), "Session");
	});
});
