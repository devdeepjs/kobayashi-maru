/**
 * Kobayashi Maru // Protected Paths Extension
 *
 * Blocks accidental write and edit operations to sensitive files and directories:
 * - Environment and secret files (.env, .env.*, *.pem, *.key, id_rsa, id_ed25519)
 * - Version control internals (.git/)
 * - Dependency directories (node_modules/)
 */

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const PROTECTED_PATTERNS = [
	/(^|[/\\])\.env(\..+)?$/i,
	/(^|[/\\])\.git([/\\]|$)/i,
	/(^|[/\\])node_modules([/\\]|$)/i,
	/(^|[/\\])id_rsa(\.pub)?$/i,
	/(^|[/\\])id_ed25519(\.pub)?$/i,
	/(^|[/\\])id_ecdsa(\.pub)?$/i,
	/\.(pem|key|p12|pfx|kdbx)$/i,
];

/**
 * Validates whether a file path touches a protected target.
 * Normalizes relative paths and path traversal tricks (e.g., ../../.env).
 */
export function isPathProtected(filePath: string, cwd: string = process.cwd()): boolean {
	if (!filePath || typeof filePath !== "string") return false;

	// Normalize relative and absolute paths
	const normalized = path.normalize(filePath);
	const resolved = path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);

	// Check both normalized relative path and resolved absolute path
	return (
		PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized)) ||
		PROTECTED_PATTERNS.some((pattern) => pattern.test(resolved))
	);
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const targetPath = (event.input?.path as string) || "";
		if (!targetPath) return undefined;

		const cwd = ctx.cwd || process.cwd();
		if (isPathProtected(targetPath, cwd)) {
			const reason = `Path "${targetPath}" is protected by Kobayashi Maru safety guardrails (.env, .git, keys, node_modules). Direct write/edit blocked.`;
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${targetPath}`, "warning");
			}
			return { block: true, reason };
		}

		return undefined;
	});
}
