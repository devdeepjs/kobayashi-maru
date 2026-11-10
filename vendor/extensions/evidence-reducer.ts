/**
 * Kobayashi Maru // Evidence-Preserving Output Reducer Extension
 *
 * Inspired by NVIDIA SoL-Pi (arXiv:2609.20519) and Harness Design Benchmarks (arXiv:2609.20804).
 * Staged rule-based elision performed BEFORE LLM ingestion:
 * - Strips ANSI escape sequences and terminal cursor controls
 * - Collapses carriage-return progress bars (\r)
 * - Safely truncates oversized bash outputs (preserving command header and tail error/exit traces)
 * - Emits a verified elision receipt so model context is not polluted with terminal noise
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface ReducerOptions {
	maxLines?: number;
	headLines?: number;
	tailLines?: number;
}

export interface ReducerStats {
	enabled: boolean;
	totalBytesSaved: number;
	totalLinesSaved: number;
	totalCommandsProcessed: number;
}

let reducerEnabled = true;
let totalBytesSaved = 0;
let totalLinesSaved = 0;
let totalCommandsProcessed = 0;

export function stripAnsiAndSpinners(text: string): string {
	// 1. Strip ANSI escape codes and CSI/OSC sequences
	let clean = text
		.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
		.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
		.replace(/\x1b[()][AB012]/g, "");

	// 2. Collapse carriage-return spinners (\r) per line
	clean = clean
		.split("\n")
		.map((line) => {
			if (!line.includes("\r")) return line;
			const parts = line.split("\r").filter((p) => p.length > 0);
			return parts.length > 0 ? parts[parts.length - 1] : "";
		})
		.join("\n");

	return clean;
}

export function reduceOutput(
	text: string,
	options: ReducerOptions = {}
): { reduced: string; linesElided: number; bytesElided: number; wasTruncated: boolean } {
	const cleaned = stripAnsiAndSpinners(text);
	const lines = cleaned.split("\n");

	const maxLines = options.maxLines ?? 220;
	const headLines = options.headLines ?? 40;
	const tailLines = options.tailLines ?? 120;

	if (lines.length <= maxLines) {
		const bytesElided = text.length - cleaned.length;
		return {
			reduced: cleaned,
			linesElided: 0,
			bytesElided: Math.max(0, bytesElided),
			wasTruncated: false,
		};
	}

	const linesElided = lines.length - headLines - tailLines;
	const head = lines.slice(0, headLines).join("\n");
	const tail = lines.slice(-tailLines).join("\n");

	const receipt = `\n\n... [Kobayashi Evidence-Reducer: Elided ${linesElided} repetitive lines (~${Math.round(
		(linesElided * 80) / 1024
	)} KB). Retained execution header and final error/exit traces] ...\n\n`;

	const reduced = `${head}${receipt}${tail}`;
	const bytesElided = Math.max(0, text.length - reduced.length);

	return {
		reduced,
		linesElided,
		bytesElided,
		wasTruncated: true,
	};
}

export function getReducerStats(): ReducerStats {
	return {
		enabled: reducerEnabled,
		totalBytesSaved,
		totalLinesSaved,
		totalCommandsProcessed,
	};
}

export function setReducerEnabled(enabled: boolean): void {
	reducerEnabled = enabled;
}

export function resetReducerStats(): void {
	totalBytesSaved = 0;
	totalLinesSaved = 0;
	totalCommandsProcessed = 0;
}

export default function (pi: ExtensionAPI) {
	// Slash command: /reducer [on|off|status|reset]
	pi.registerCommand("reducer", {
		description: "Toggle or check Evidence-Preserving Output Reducer (/reducer on|off|status|reset)",
		handler: async (args: string, ctx: any) => {
			const sub = args.trim().toLowerCase();
			if (sub === "on") {
				reducerEnabled = true;
				ctx.ui.notify("Evidence-Preserving Reducer ENABLED", "info");
			} else if (sub === "off") {
				reducerEnabled = false;
				ctx.ui.notify("Evidence-Preserving Reducer DISABLED", "warning");
			} else if (sub === "reset") {
				resetReducerStats();
				ctx.ui.notify("Evidence-Preserving Reducer stats reset", "info");
			} else {
				const kb = (totalBytesSaved / 1024).toFixed(1);
				ctx.ui.notify(
					`Reducer: ${reducerEnabled ? "ACTIVE" : "INACTIVE"} | Saved: ${kb} KB (${totalLinesSaved} lines across ${totalCommandsProcessed} cmds)`,
					"info"
				);
			}
		},
	});

	// Hook into tool results to elide noise from bash command outputs
	pi.on("tool_result", async (event: any) => {
		if (!reducerEnabled || event.toolName !== "bash") {
			return undefined;
		}

		if (!Array.isArray(event.content)) {
			return undefined;
		}

		totalCommandsProcessed++;
		let modified = false;

		const newContent = event.content.map((item: any) => {
			if (item.type !== "text" || typeof item.text !== "string") {
				return item;
			}

			const original = item.text;
			const { reduced, linesElided, bytesElided, wasTruncated } = reduceOutput(original);

			if (wasTruncated || reduced.length < original.length) {
				totalBytesSaved += bytesElided;
				totalLinesSaved += linesElided;
				modified = true;
				return { ...item, text: reduced };
			}

			return item;
		});

		if (modified) {
			return { content: newContent };
		}

		return undefined;
	});
}
