import { describe, it } from "node:test";
import assert from "node:assert";
import { isPathProtected } from "../vendor/extensions/protected-paths.js";

describe("Protected Paths Guardrails", () => {
	it("blocks various environment and secret files", () => {
		assert.strictEqual(isPathProtected(".env"), true);
		assert.strictEqual(isPathProtected(".env.local"), true);
		assert.strictEqual(isPathProtected(".env.production"), true);
		assert.strictEqual(isPathProtected("config/.env"), true);
		assert.strictEqual(isPathProtected("./deep/path/.env.test"), true);
	});

	it("blocks path traversal attempts targeting .env", () => {
		assert.strictEqual(isPathProtected("src/utils/../../.env"), true);
		assert.strictEqual(isPathProtected("./some/dir/../.env.secret"), true);
	});

	it("blocks git repository internals", () => {
		assert.strictEqual(isPathProtected(".git/config"), true);
		assert.strictEqual(isPathProtected(".git/HEAD"), true);
		assert.strictEqual(isPathProtected(".git/hooks/pre-commit"), true);
		assert.strictEqual(isPathProtected("submodule/.git/index"), true);
	});

	it("blocks private keys and certificates", () => {
		assert.strictEqual(isPathProtected("id_rsa"), true);
		assert.strictEqual(isPathProtected("~/.ssh/id_rsa"), true);
		assert.strictEqual(isPathProtected("id_ed25519"), true);
		assert.strictEqual(isPathProtected("certs/server.key"), true);
		assert.strictEqual(isPathProtected("tls/cert.pem"), true);
		assert.strictEqual(isPathProtected("secrets.pfx"), true);
	});

	it("blocks node_modules modifications", () => {
		assert.strictEqual(isPathProtected("node_modules/express/index.js"), true);
		assert.strictEqual(isPathProtected("./node_modules/@types/node/index.d.ts"), true);
	});

	it("safely permits normal application source files", () => {
		assert.strictEqual(isPathProtected("src/index.ts"), false);
		assert.strictEqual(isPathProtected("package.json"), false);
		assert.strictEqual(isPathProtected("README.md"), false);
		assert.strictEqual(isPathProtected("src/environments/environment.ts"), false);
		assert.strictEqual(isPathProtected("tests/env-loader.test.ts"), false);
	});
});
