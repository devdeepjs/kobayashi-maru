import fs from "fs";
import path from "path";
import yaml from "yaml";
import { fileURLToPath } from "url";
import { KobayashiConfig, KobayashiConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Expands environment variables matching ${VAR_NAME} or $VAR_NAME
 */
function expandEnvVars(raw: string): string {
  return raw.replace(/\$\{([a-zA-Z0-9_]+)\}|\$([a-zA-Z0-9_]+)/g, (_, p1, p2) => {
    const key = p1 || p2;
    return process.env[key] ?? "";
  });
}

/**
 * Loads and validates a harness.yaml configuration file
 */
export function loadConfig(configPath?: string): KobayashiConfig {
  const candidatePaths = [
    configPath ? path.resolve(configPath) : undefined,
    path.resolve(process.cwd(), "harness.yaml"),
    path.resolve(__dirname, "../../harness.yaml"),
    path.resolve(__dirname, "../../../harness.yaml"),
  ].filter((p): p is string => Boolean(p));

  const resolvedPath = candidatePaths.find((p) => fs.existsSync(p));

  if (!resolvedPath) {
    return DEFAULT_CONFIG;
  }

  const fileContent = fs.readFileSync(resolvedPath, "utf-8");
  const expanded = expandEnvVars(fileContent);
  const parsed = yaml.parse(expanded);

  const result = KobayashiConfigSchema.safeParse(parsed);
  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    throw new Error(`Invalid harness.yaml configuration:\n${formattedErrors}`);
  }

  return result.data;
}
