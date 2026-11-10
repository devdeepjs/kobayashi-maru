/**
 * Kobayashi Maru // Session Namer Extension
 *
 * Automatically assigns clean, human-readable session names after Turn 1,
 * and adds the /rename slash command to customize names anytime.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Extracts a concise, readable 3-6 word slug from an initial prompt.
 * Strips slash commands, fluff prefixes, special markdown formatting, and clamps length.
 */
export function generateCleanSessionName(prompt: string, maxLen: number = 42): string {
	if (!prompt || typeof prompt !== "string") return "New Session";

	let text = prompt
		// Strip slash commands, file mentions, and URLs
		.replace(/^(\/|@)[a-zA-Z0-9_\-:]+\s*/g, "")
		.replace(/https?:\/\/\S+/g, "")
		// Strip code blocks and inline backticks
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`([^`]+)`/g, "$1")
		// Strip markdown headings and list bullets
		.replace(/^[#*\->+\d.]+\s*/gm, "");

	// Repeatedly strip leading conversational fluff
	const fluffRegex = /^(please|can you|could you|i need to|i want to|hey|hello|hi)\s+/i;
	while (fluffRegex.test(text)) {
		text = text.replace(fluffRegex, "");
	}

	// Preserve letters, numbers, hyphens, dots, underscores
	text = text
		.replace(/[^a-zA-Z0-9_\-.\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!text) return "Session";

	// Take first 5 meaningful words
	const words = text.split(" ").filter((w) => w.length > 0).slice(0, 5);
	const slug = words.join(" ");

	if (slug.length <= maxLen) return slug;
	return slug.substring(0, maxLen - 3).trim() + "...";
}

export default function (pi: ExtensionAPI) {
	let hasAutoNamed = false;

	// In-session slash command: /rename [new name]
	pi.registerCommand("rename", {
		description: "Rename the current session (e.g. /rename feature-auth)",
		handler: async (args, ctx) => {
			const name = args.trim();
			if (name) {
				pi.setSessionName(name);
				hasAutoNamed = true;
				ctx.ui.notify(`Session renamed to: "${name}"`, "info");
			} else {
				const current = pi.getSessionName();
				ctx.ui.notify(current ? `Current session: "${current}"` : "No session name set", "info");
			}
		},
	});

	// Auto-name after first user message if unnamed
	pi.on("user_message", async (event) => {
		if (hasAutoNamed) return;

		const current = pi.getSessionName();
		if (!current) {
			const promptText = typeof event.content === "string" ? event.content : "";
			if (promptText && promptText.length > 2) {
				const autoName = generateCleanSessionName(promptText);
				pi.setSessionName(autoName);
				hasAutoNamed = true;
			}
		} else {
			hasAutoNamed = true;
		}
	});
}
