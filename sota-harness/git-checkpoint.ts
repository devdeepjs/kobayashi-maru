/**
 * Git Checkpoint Extension (Apple Silicon & Architecture Safe)
 *
 * Creates git stash checkpoints at each turn so /fork can restore code state.
 * When forking, offers to restore code to that point in history.
 *
 * Fault tolerant:
 * - Detects working git binary across /opt/homebrew/bin, /usr/bin, PATH
 * - Bypasses broken / Rosetta-mismatched git binaries (prevents errno -86)
 * - Safe no-op outside git repositories
 * - Fully wrapped in try/catch to ensure 0 extension runtime crashes
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const checkpoints = new Map<string, string>();
	let currentEntryId: string | undefined;
	let workingGitBinary: string | null = null;
	let gitChecked = false;

	async function getWorkingGit(): Promise<string | null> {
		if (gitChecked) return workingGitBinary;
		gitChecked = true;

		// Prioritize Apple Silicon native Homebrew git, then system /usr/bin/git, then PATH
		const candidates = ["/opt/homebrew/bin/git", "/usr/bin/git", "git"];
		for (const candidate of candidates) {
			try {
				const { stdout, exitCode } = await pi.exec(candidate, ["--version"]);
				if (exitCode === 0 && stdout && stdout.includes("git version")) {
					workingGitBinary = candidate;
					return candidate;
				}
			} catch {
				// Continue to next candidate if binary throws EBADARCH (-86) or ENOENT
			}
		}

		workingGitBinary = null;
		return null;
	}

	async function isGitRepo(gitCmd: string): Promise<boolean> {
		try {
			const { stdout, exitCode } = await pi.exec(gitCmd, ["rev-parse", "--is-inside-work-tree"]);
			return exitCode === 0 && stdout.trim() === "true";
		} catch {
			return false;
		}
	}

	// Track current entry ID when user messages or tool results are recorded
	pi.on("tool_result", async (_event, ctx) => {
		try {
			const leaf = ctx.sessionManager.getLeafEntry();
			if (leaf) currentEntryId = leaf.id;
		} catch {}
	});

	pi.on("turn_start", async () => {
		try {
			const gitCmd = await getWorkingGit();
			if (!gitCmd) return;

			if (!(await isGitRepo(gitCmd))) return;

			// Create a git stash entry before LLM makes changes
			const { stdout, exitCode } = await pi.exec(gitCmd, ["stash", "create"]);
			if (exitCode === 0) {
				const ref = stdout.trim();
				if (ref && currentEntryId) {
					checkpoints.set(currentEntryId, ref);
				}
			}
		} catch {
			// Gracefully ignore git checkpoint errors to never break agent turns
		}
	});

	pi.on("session_before_fork", async (event, ctx) => {
		try {
			const ref = checkpoints.get(event.entryId);
			if (!ref) return;

			if (!ctx.hasUI) {
				// In non-interactive mode, don't restore automatically
				return;
			}

			const choice = await ctx.ui.select("Restore code state?", [
				"Yes, restore code to that point",
				"No, keep current code",
			]);

			if (choice?.startsWith("Yes")) {
				const gitCmd = await getWorkingGit();
				if (gitCmd) {
					await pi.exec(gitCmd, ["stash", "apply", ref]);
					ctx.ui.notify("Code restored to checkpoint", "info");
				}
			}
		} catch {
			// Graceful fallback
		}
	});

	pi.on("agent_settled", async () => {
		// Clear checkpoints after the full agent run completes
		checkpoints.clear();
	});
}
