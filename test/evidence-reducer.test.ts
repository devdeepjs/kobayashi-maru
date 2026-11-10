import { describe, it } from "node:test";
import assert from "node:assert";
import {
	stripAnsiAndSpinners,
	reduceOutput,
	getReducerStats,
	resetReducerStats,
	setReducerEnabled,
} from "../vendor/extensions/evidence-reducer.js";

describe("Evidence-Preserving Output Reducer", () => {
	it("strips ANSI color and cursor escape codes", () => {
		const raw = "\x1b[32m✔ PASS\x1b[0m \x1b[1msrc/foo.test.ts\x1b[22m";
		const cleaned = stripAnsiAndSpinners(raw);
		assert.strictEqual(cleaned, "✔ PASS src/foo.test.ts");
	});

	it("collapses carriage-return progress bars correctly", () => {
		const raw = "Downloading... 10%\rDownloading... 50%\rDownloading... 100% Done";
		const cleaned = stripAnsiAndSpinners(raw);
		assert.strictEqual(cleaned, "Downloading... 100% Done");
	});

	it("leaves small outputs under limit unchanged except for ANSI stripping", () => {
		const smallText = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join("\n");
		const { reduced, linesElided, wasTruncated } = reduceOutput(smallText, { maxLines: 100 });
		assert.strictEqual(wasTruncated, false);
		assert.strictEqual(linesElided, 0);
		assert.strictEqual(reduced, smallText);
	});

	it("truncates oversized outputs preserving exact head and tail with receipt", () => {
		const totalLines = 300;
		const lines = Array.from({ length: totalLines }, (_, i) => {
			if (i === 0) return "START_COMMAND: npm test";
			if (i === totalLines - 1) return "FAIL: src/critical.test.ts (AssertionError: expected true to be false)";
			return `test pass line ${i}`;
		});
		const raw = lines.join("\n");

		const { reduced, linesElided, wasTruncated } = reduceOutput(raw, {
			maxLines: 100,
			headLines: 10,
			tailLines: 20,
		});

		assert.strictEqual(wasTruncated, true);
		assert.strictEqual(linesElided, 270);
		// Check that head is preserved
		assert.ok(reduced.startsWith("START_COMMAND: npm test"));
		// Check that tail is preserved (including critical assertion)
		assert.ok(reduced.includes("FAIL: src/critical.test.ts"));
		// Check that receipt is inserted
		assert.ok(reduced.includes("Kobayashi Evidence-Reducer: Elided 270 repetitive lines"));
	});

	it("tracks stats and handles reset cleanly", () => {
		resetReducerStats();
		setReducerEnabled(true);
		const stats = getReducerStats();
		assert.strictEqual(stats.enabled, true);
		assert.strictEqual(stats.totalBytesSaved, 0);
		assert.strictEqual(stats.totalLinesSaved, 0);
	});
});
