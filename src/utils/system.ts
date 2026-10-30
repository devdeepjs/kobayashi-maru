import { execSync } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";

export interface DiagnosticResult {
  ok: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface DiscoveredModel {
  provider: string;
  id: string;
  context: string;
  maxOut: string;
  thinking: boolean;
}

/**
 * Dynamically queries Pi for all active models registered on this machine
 */
export function discoverPiModels(): DiscoveredModel[] {
  try {
    const output = execSync("pi --list-models 2>/dev/null", {
      encoding: "utf-8",
      env: {
        ...process.env,
        AWS_PROFILE: process.env.AWS_PROFILE || "default",
        AWS_REGION: process.env.AWS_REGION || "us-east-1",
      },
    });

    const lines = output.split("\n");
    const models: DiscoveredModel[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6 && parts[0] !== "provider" && !parts[0].startsWith("Warning") && !parts[0].startsWith("File:")) {
        models.push({
          provider: parts[0],
          id: parts[1],
          context: parts[2],
          maxOut: parts[3],
          thinking: parts[4] === "yes",
        });
      }
    }
    return models;
  } catch {
    return [];
  }
}

export async function checkOllama(): Promise<DiagnosticResult> {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:11434/api/tags", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const models = (parsed.models || []).map((m: any) => m.name);
          resolve({
            ok: true,
            message: `Ollama is running with ${models.length} model(s)`,
            details: { models },
          });
        } catch {
          resolve({ ok: false, message: "Ollama returned invalid JSON response" });
        }
      });
    });

    req.on("error", () => {
      resolve({
        ok: false,
        message: "Ollama is not running on http://127.0.0.1:11434. Start with: ollama serve",
      });
    });

    req.setTimeout(2500, () => {
      req.destroy();
      resolve({ ok: false, message: "Connection to Ollama timed out (2.5s)" });
    });
  });
}

export function checkNode(): DiagnosticResult {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);
  if (major >= 22) {
    return { ok: true, message: `Node.js version is compatible: ${version}` };
  }
  return {
    ok: false,
    message: `Node.js 22.19+ required for NVIDIA SoL-Pi. Current: ${version}`,
  };
}

export function checkPiInstalled(): DiagnosticResult {
  try {
    const output = execSync("pi --version 2>/dev/null", { encoding: "utf-8" }).trim();
    return { ok: true, message: `Pi coding agent installed: v${output}` };
  } catch {
    return {
      ok: false,
      message: "Pi coding agent not found. Install globally: npm i -g @earendil-works/pi-coding-agent",
    };
  }
}

export function checkAwsCredentials(): DiagnosticResult {
  const profile = process.env.AWS_PROFILE || "default";
  const region = process.env.AWS_REGION || "us-east-1";

  const credPath = path.join(os.homedir(), ".aws", "credentials");
  if (fs.existsSync(credPath)) {
    return {
      ok: true,
      message: `AWS credentials detected (~/.aws/credentials), profile: ${profile}, region: ${region}`,
      details: { profile, region },
    };
  }

  return {
    ok: false,
    message: "No ~/.aws/credentials found. AWS Bedrock models will require AWS configuration.",
  };
}
