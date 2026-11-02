#!/usr/bin/env node

import { Command } from "commander";
import { doctorCommand } from "../src/cli/commands/doctor.js";
import { applyCommand } from "../src/cli/commands/apply.js";
import { startCommand } from "../src/cli/commands/start.js";
import { skillsCommand } from "../src/cli/commands/skills.js";
import { advisorCommand } from "../src/cli/commands/advisor.js";
import { configCommand } from "../src/cli/commands/config.js";
import { statsCommand } from "../src/cli/commands/stats.js";
import { evalCommand } from "../src/cli/commands/eval.js";

const program = new Command();

program
  .name("kobayashi")
  .description("Token-efficient, multi-tier agent harness orchestrator for Pi")
  .version("0.1.0");

program
  .command("doctor")
  .description("Diagnose environment, Ollama models, AWS credentials, and Pi setup")
  .action(doctorCommand);

program
  .command("config")
  .description("Interactive model tier wizard (Advisor, Orchestrator, Workhorse & Fallbacks)")
  .option("-a, --advisor <model>", "Primary Advisor model (provider/model)")
  .option("--advisor-thinking <level>", "Advisor thinking level ('high' | 'medium' | 'low' | 'off')")
  .option("--advisor-fallback <model>", "Fallback Advisor model (provider/model)")
  .option("-o, --orchestrator <model>", "Primary Orchestrator model (provider/model)")
  .option("--orchestrator-thinking <level>", "Orchestrator thinking level ('high' | 'medium' | 'low' | 'off')")
  .option("--orchestrator-fallback <model>", "Fallback Orchestrator model (provider/model)")
  .option("-w, --workhorse <model>", "Primary Workhorse model (provider/model)")
  .option("--workhorse-thinking <level>", "Workhorse thinking level ('high' | 'medium' | 'low' | 'off')")
  .option("--workhorse-fallback <model>", "Fallback Workhorse model (provider/model)")
  .option("-s, --starting-tier <tier>", "Starting tier ('advisor' | 'orchestrator' | 'workhorse')")
  .action(configCommand);

program
  .command("apply")
  .description("Compile harness.yaml and synchronize Pi runtime configurations")
  .option("-c, --config <path>", "Path to custom harness.yaml")
  .action(applyCommand);

program
  .command("start")
  .description("Launch Pi agent with full multi-tier and SoL-Pi optimizations")
  .option("-c, --config <path>", "Path to custom harness.yaml")
  .option("-m, --model <model>", "Override default model")
  .option("-p, --provider <provider>", "Override default provider")
  .option("-e, --prompt <prompt>", "Pass a one-off prompt to Pi instead of interactive mode")
  .action(startCommand);

program
  .command("stats")
  .alias("telemetry")
  .description("Display cumulative telemetry audit, token usage by tier, and capital saved")
  .option("-w, --web", "Launch live browser analytics dashboard")
  .option("-j, --json", "Output telemetry in raw JSON format")
  .action(statsCommand);

program
  .command("eval")
  .description("Run sandboxed benchmarks and generate comparative cost & accuracy reports")
  .option("-r, --report", "Generate detailed markdown report in eval/BENCHMARK_RESULTS.md")
  .option("-d, --dataset <path>", "Path to specific task dataset JSON")
  .action(evalCommand);

program
  .command("skills")
  .description("Audit installed skills and test dynamic progressive activation")
  .option("-t, --test-prompt <prompt>", "Test dynamic skill activation for a given prompt")
  .action(skillsCommand);

program
  .command("advisor <question>")
  .description("Execute a stateless 1-turn escalation probe to Claude Sonnet 4.5/5.5 via Bedrock")
  .option("-s, --summary <summary>", "Brief context summary")
  .option("-c, --snippet <snippet>", "Code snippet to analyze")
  .action(advisorCommand);

program.parse(process.argv);
