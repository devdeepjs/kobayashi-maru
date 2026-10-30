import fs from "fs";
import path from "path";
import yaml from "yaml";
import { KobayashiConfig, KobayashiConfigSchema } from "./schema.js";
import { DEFAULT_CONFIG } from "./defaults.js";

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
  const resolvedPath = configPath
    ? path.resolve(configPath)
    : path.resolve(process.cwd(), "harness.yaml");

  if (!fs.existsSync(resolvedPath)) {
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
