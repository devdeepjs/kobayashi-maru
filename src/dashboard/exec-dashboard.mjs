#!/usr/bin/env node
/**
 * Kobayashi Enterprise Observability & Telemetry HUD
 * Modeled after DeepSeek Harness OpenTelemetry (OTel) Grafana Suite
 * Port: 4200 (Default)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";

const PORT = 4200;
const PI_DIR = path.join(os.homedir(), ".pi", "agent");
const SESSIONS_DIR = path.join(PI_DIR, "sessions");
const LEDGER_PATH = path.join(PI_DIR, "savings-ledger.jsonl");

// Pricing ($ per 1M tokens)
const PRICING = {
  "ornith-1.5:ctx": { input: 0.00, output: 0.00, cacheRead: 0.00, cacheWrite: 0.00, tier: "Workhorse: Local RAM ($0.00)", color: "#10b981" },
  "ornith-1.5:9b": { input: 0.00, output: 0.00, cacheRead: 0.00, cacheWrite: 0.00, tier: "Workhorse: Local RAM ($0.00)", color: "#10b981" },
  "openai.gpt-5.6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22, tier: "Orchestrator: Mantle Cached", color: "#3b82f6" },
  "openai.gpt-6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22, tier: "Orchestrator: Mantle Cached", color: "#3b82f6" },
  "us.openai.gpt-6-sol": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22, tier: "Orchestrator: Mantle Cached", color: "#3b82f6" },
  "global.anthropic.claude-haiku-5-5": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80, tier: "Triage: Haiku 5.5", color: "#057a55" },
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80, tier: "Triage: Haiku 4.5", color: "#057a55" },
  "us.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#a855f7" },
  "us.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#a855f7" },
  "global.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#a855f7" },
  "global.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#a855f7" },
  "us.anthropic.claude-sonnet-4-6": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 4.6", color: "#a855f7" },
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 4.5", color: "#a855f7" },
  "anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#a855f7" },
  "au.anthropic.claude-opus-4-6-v1": { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75, tier: "Frontier: Opus 4.6", color: "#e11d48" }
};

const SONNET_RATE = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

function getModelRate(modelName) {
  if (!modelName) return PRICING["openai.gpt-5.6-luna"];
  const clean = modelName.split("/").pop();
  if (PRICING[clean]) return PRICING[clean];
  if (/ornith|qwen|llama|mistral|deepseek-r1/i.test(clean) || modelName.startsWith("ollama")) {
    return { input: 0.00, output: 0.00, cacheRead: 0.00, cacheWrite: 0.00, tier: "Workhorse: Local RAM ($0.00)", color: "#10b981" };
  }
  if (/haiku/i.test(clean)) return PRICING["global.anthropic.claude-haiku-5-5"];
  if (/sonnet/i.test(clean)) return PRICING["us.anthropic.claude-sonnet-5-5"];
  if (/opus/i.test(clean)) return PRICING["au.anthropic.claude-opus-4-6-v1"];
  return PRICING["openai.gpt-5.6-luna"];
}

function formatRepoName(folderName) {
  if (folderName.includes("geo-risk")) return "geo-risk";
  if (folderName.includes("kobayashi")) return "kobayashi";
  return folderName.replace(/^--Users-[^-]+-/, "").replace(/--$/, "").replace(/-/g, "/") || folderName;
}

function timeAgo(ms) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function getTelemetryData(repoFilter = "all", timeRange = "all", selectedFileName = null) {
  const allSessions = [];
  const reposMap = {};
  const timeBuckets = {};
  const toolStats = {};
  const modelStats = {};
  const finishReasons = { tool_calls: 0, stop: 0, error: 0 };
  const turnOutcomes = { completed: 0, error: 0 };

  let aggTurns = 0, aggModelCalls = 0, aggToolCalls = 0;
  let aggTokens = 0, aggInput = 0, aggOutput = 0, aggCacheRead = 0, aggCacheWrite = 0;
  let aggActualCost = 0, aggSonnetCost = 0;

  const now = Date.now();
  let timeLimitMs = 0;
  if (timeRange === "24h" || timeRange === "1d") timeLimitMs = now - 24 * 3600 * 1000;
  else if (timeRange === "7d" || timeRange === "1w") timeLimitMs = now - 7 * 24 * 3600 * 1000;
  else if (timeRange === "30d") timeLimitMs = now - 30 * 24 * 3600 * 1000;

  if (fs.existsSync(SESSIONS_DIR)) {
    try {
      for (const ent of fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const repoKey = ent.name;
        const repoName = formatRepoName(repoKey);
        const repoDir = path.join(SESSIONS_DIR, repoKey);

        if (!reposMap[repoKey]) {
          reposMap[repoKey] = { key: repoKey, name: repoName, count: 0 };
        }

        try {
          for (const f of fs.readdirSync(repoDir)) {
            if (!f.endsWith(".jsonl")) continue;
            reposMap[repoKey].count++;

            const fullPath = path.join(repoDir, f);
            const stat = fs.statSync(fullPath);

            if (timeLimitMs > 0 && stat.mtimeMs < timeLimitMs) continue;
            if (repoFilter !== "all" && repoKey !== repoFilter) continue;

            let firstPrompt = "";
            let sTurns = 0, sModelCalls = 0, sTokens = 0, sInput = 0, sOutput = 0, sCacheRead = 0, sCacheWrite = 0;
            let sActual = 0, sSonnet = 0, sErrors = 0;
            const sModels = new Set();

            try {
              const lines = fs.readFileSync(fullPath, "utf8").split("\n").filter(Boolean);
              let curModel = "openai.gpt-5.6-luna";

              for (const l of lines) {
                try {
                  const r = JSON.parse(l);
                  const ts = r.timestamp ? new Date(r.timestamp).getTime() : stat.mtimeMs;
                  const dateObj = new Date(ts);
                  // Format: MM/DD HH:00 for smooth time-series plotting
                  const mStr = String(dateObj.getMonth() + 1).padStart(2, "0");
                  const dStr = String(dateObj.getDate()).padStart(2, "0");
                  const hStr = String(dateObj.getHours()).padStart(2, "0");
                  const hourBucketKey = `${mStr}/${dStr} ${hStr}:00`;

                  if (!timeBuckets[hourBucketKey]) {
                    timeBuckets[hourBucketKey] = {
                      label: hourBucketKey,
                      ts,
                      input: 0,
                      cached: 0,
                      output: 0,
                      modelCalls: 0,
                      toolCalls: 0,
                      turns: 0,
                      errors: 0,
                      latencies: []
                    };
                  }
                  const tb = timeBuckets[hourBucketKey];

                  if (r.type === "model_change") {
                    curModel = (r.modelId || "").split("/").pop() || curModel;
                  }
                  if (!firstPrompt && r.type === "message" && r.message?.role === "user") {
                    const c = r.message.content;
                    firstPrompt = typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text || "").join(" ").trim() : "";
                  }

                  if (r.type === "message" && r.message?.role === "assistant") {
                    sModelCalls++;
                    aggModelCalls++;
                    tb.modelCalls++;

                    const stop = r.message?.stopReason;
                    if (stop === "toolUse" || stop === "tool_use" || stop === "tool_calls") finishReasons.tool_calls++;
                    else if (stop === "stop" || stop === "end_turn") finishReasons.stop++;
                    else if (r.isError) { finishReasons.error++; sErrors++; tb.errors++; }
                    else finishReasons.stop++;

                    if (r.message?.durationMs) {
                      tb.latencies.push(Number((r.message.durationMs / 1000).toFixed(2)));
                    }
                  }

                  if (r.message?.usage) {
                    sTurns++;
                    aggTurns++;
                    tb.turns++;
                    const u = r.message.usage;
                    const inp = Number(u.input || 0);
                    const cr = Number(u.cacheRead || 0);
                    const cw = Number(u.cacheWrite || 0);
                    const out = Number(u.output || 0);
                    const toks = (u.totalTokens || (inp + cr + cw + out));

                    sTokens += toks;
                    sInput += inp;
                    sOutput += out;
                    sCacheRead += cr;
                    sCacheWrite += cw;

                    aggTokens += toks;
                    aggInput += inp;
                    aggOutput += out;
                    aggCacheRead += cr;
                    aggCacheWrite += cw;

                    tb.input += inp;
                    tb.cached += cr;
                    tb.output += out;

                    const rawM = r.message.model || curModel;
                    const cleanM = rawM.split("/").pop();
                    sModels.add(cleanM);
                    modelStats[cleanM] = (modelStats[cleanM] || 0) + toks;

                    const rate = getModelRate(cleanM);
                    let turnActual = (inp * rate.input + out * rate.output + cr * rate.cacheRead + cw * rate.cacheWrite) / 1e6;
                    if (rate.input === 0 && rate.output === 0) turnActual = 0;
                    else if (u.cost?.total && typeof u.cost.total === "number" && u.cost.total > 0) turnActual = u.cost.total;

                    const turnSonnet = (inp * SONNET_RATE.input + out * SONNET_RATE.output + cr * SONNET_RATE.cacheRead + cw * SONNET_RATE.cacheWrite) / 1e6;

                    sActual += turnActual;
                    sSonnet += turnSonnet;
                    aggActualCost += turnActual;
                    aggSonnetCost += turnSonnet;
                  }

                  const recordTool = (name, isErr = false, durMs = null) => {
                    if (!name) return;
                    aggToolCalls++;
                    tb.toolCalls++;
                    if (!toolStats[name]) toolStats[name] = { calls: 0, durations: [], errors: 0 };
                    toolStats[name].calls++;
                    if (durMs) toolStats[name].durations.push(durMs);
                    if (isErr) { toolStats[name].errors++; sErrors++; tb.errors++; }
                  };

                  if (r.toolName || (r.type === "tool_call" && r.name)) {
                    recordTool(r.toolName || r.name, r.isError);
                  }
                  if (Array.isArray(r.message?.content)) {
                    for (const p of r.message.content) {
                      if (p.type === "tool_call" || p.name) recordTool(p.name, p.isError);
                      if (p.type === "tool_result" && p.isError) { sErrors++; tb.errors++; }
                    }
                  }
                } catch {}
              }
            } catch {}

            if (sTurns > 0) turnOutcomes.completed += sTurns;
            if (sErrors > 0) turnOutcomes.error += sErrors;

            const promptTokens = sInput + sCacheRead + sCacheWrite;
            const hitRate = promptTokens > 0 ? (sCacheRead / promptTokens) * 100 : 0;
            const cleanTitle = (firstPrompt || "Session " + f.slice(0, 10)).replace(/\s+/g, " ").trim();

            allSessions.push({
              id: f.replace(".jsonl", ""),
              fileName: f,
              repoKey,
              repoName,
              title: cleanTitle.slice(0, 75) + (cleanTitle.length > 75 ? "…" : ""),
              fullPrompt: cleanTitle,
              mtimeMs: stat.mtimeMs,
              timeAgo: timeAgo(stat.mtimeMs),
              dateStr: new Date(stat.mtimeMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
              turns: sTurns,
              modelCalls: sModelCalls,
              totalTokens: sTokens,
              inputTokens: sInput,
              outputTokens: sOutput,
              cachedTokens: sCacheRead,
              cacheHitRate: hitRate.toFixed(1) + "%",
              actualCost: Number(sActual.toFixed(4)),
              sonnetCost: Number(sSonnet.toFixed(4)),
              savedCost: Number(Math.max(0, sSonnet - sActual).toFixed(4)),
              models: Array.from(sModels),
              errors: sErrors
            });
          }
        } catch {}
      }
    } catch {}
  }

  // Sort sessions newest first
  allSessions.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Build sorted timeseries buckets
  const timeseries = Object.values(timeBuckets).sort((a, b) => a.ts - b.ts).map(tb => {
    const lats = tb.latencies.sort((a, b) => a - b);
    const p95 = lats.length > 0 ? lats[Math.floor(lats.length * 0.95)] : 1.2;
    const p99 = lats.length > 0 ? lats[Math.floor(lats.length * 0.99)] : 2.4;
    return {
      label: tb.label,
      input: tb.input,
      cached: tb.cached,
      output: tb.output,
      modelCalls: tb.modelCalls,
      toolCalls: tb.toolCalls,
      turns: tb.turns,
      errors: tb.errors,
      p95Latency: p95,
      p99Latency: p99,
      ttftP95: Number((p95 * 0.35).toFixed(2)),
      ttftP99: Number((p99 * 0.40).toFixed(2))
    };
  });

  // Color mappings
  const MODEL_COLORS = {
    "ornith-1.5:ctx": "#10b981",
    "openai.gpt-5.6-luna": "#3b82f6",
    "openai.gpt-6-luna": "#38bdf8",
    "us.anthropic.claude-sonnet-5-5": "#a855f7",
    "us.anthropic.claude-sonnet-5": "#c084fc",
    "global.anthropic.claude-haiku-5-5": "#059669",
    "au.anthropic.claude-opus-4-6-v1": "#f43f5e"
  };
  const tokenByModel = Object.entries(modelStats)
    .filter(([_, toks]) => toks > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([model, tokens]) => ({
      model,
      tokens,
      color: MODEL_COLORS[model] || "#64748b"
    }));

  const TOOL_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#06b6d4", "#a855f7", "#ec4899", "#8b5cf6", "#14b8a6", "#64748b"];
  const toolDistribution = Object.entries(toolStats)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([tool, data], i) => ({
      tool,
      count: data.calls,
      color: TOOL_COLORS[i % TOOL_COLORS.length]
    }));

  const toolPerformance = Object.entries(toolStats)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([name, data]) => {
      const durs = data.durations.sort((a, b) => a - b);
      const p95 = durs.length > 0 ? (durs[Math.floor(durs.length * 0.95)] / 1000).toFixed(2) + " s" : "0.45 s";
      const max = durs.length > 0 ? (durs[durs.length - 1] / 1000).toFixed(2) + " s" : "1.80 s";
      return {
        name,
        calls: data.calls,
        p95Duration: p95,
        maxDuration: max,
        errors: data.errors
      };
    });

  const promptTotal = aggInput + aggCacheRead + aggCacheWrite;
  const overallHitRate = promptTotal > 0 ? ((aggCacheRead / promptTotal) * 100).toFixed(2) + " %" : "0.00 %";
  const netSaved = Math.max(0, aggSonnetCost - aggActualCost);
  const netSavedPct = aggSonnetCost > 0 ? ((netSaved / aggSonnetCost) * 100).toFixed(1) + "%" : "0.0%";

  // Determine active session detail target
  let activeSession = null;
  if (selectedFileName && selectedFileName !== "all") {
    activeSession = allSessions.find(s => s.fileName === selectedFileName);
  }
  if (!activeSession && allSessions.length > 0) {
    activeSession = allSessions[0];
  }
  const sessionDetail = activeSession ? parseDetailedSession(activeSession) : null;

  return {
    repos: Object.values(reposMap),
    activeRepo: repoFilter,
    activeTimeRange: timeRange,
    activeSessionFile: activeSession?.fileName || null,
    aggregate: {
      agentTurns: aggTurns,
      sessions: allSessions.length,
      modelCalls: aggModelCalls,
      toolCalls: aggToolCalls,
      totalTokens: aggTokens,
      cacheHitRate: overallHitRate,
      actualCost: Number(aggActualCost.toFixed(4)),
      sonnetCost: Number(aggSonnetCost.toFixed(4)),
      savedCost: Number(netSaved.toFixed(4)),
      savedPct: netSavedPct
    },
    timeseries,
    turnOutcomes,
    finishReasons,
    tokenByModel,
    toolDistribution,
    toolPerformance,
    sessions: allSessions,
    sessionDetail
  };
}

function parseDetailedSession(sessionFileEntry) {
  const turnAudit = [];
  const timeline = [];
  let cumActual = 0, cumSonnetCached = 0, cumSonnetCold = 0;
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalReasoning = 0;
  let totalTurns = 0, totalToolCalls = 0;
  let bashErrors = 0, delegationCount = 0;
  const tools = {};
  const models = {};
  const tierTokens = { workhorse: 0, orchestrator: 0, advisor: 0 };

  const fullPath = path.join(SESSIONS_DIR, sessionFileEntry.repoKey, sessionFileEntry.fileName);
  if (!fs.existsSync(fullPath)) return null;

  try {
    const lines = fs.readFileSync(fullPath, "utf8").split("\n").filter(Boolean);
    let currentModel = "openai.gpt-5.6-luna";
    let lastUserPrompt = sessionFileEntry.fullPrompt || "";

    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (rec.type === "model_change") {
          currentModel = (rec.modelId || "").split("/").pop() || currentModel;
        }
        if (rec.type === "message" && rec.message?.role === "user") {
          const c = rec.message.content;
          lastUserPrompt = typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text || "").join(" ").trim() : lastUserPrompt;
        }

        const rawModel = rec.model || rec.message?.model || rec.data?.model;
        if (rawModel && typeof rawModel === "string") {
          currentModel = rawModel.split("/").pop();
        }

        const turnTools = [];
        const recordTool = (name, isErr = false) => {
          if (!name) return;
          totalToolCalls++;
          tools[name] = (tools[name] || 0) + 1;
          turnTools.push(name);
          if (name === "delegate_workhorse") delegationCount++;
          if (isErr) bashErrors++;
        };

        if (rec.toolName || (rec.type === "tool_call" && rec.name)) {
          recordTool(rec.toolName || rec.name, rec.isError);
        }
        if (Array.isArray(rec.message?.content)) {
          for (const p of rec.message.content) {
            if (p.type === "tool_call" || p.name) recordTool(p.name, p.isError);
            if (p.type === "tool_result" && p.isError) bashErrors++;
          }
        }

        if (rec.message?.usage) {
          const u = rec.message.usage;
          const inp = Number(u.input ?? 0);
          const out = Number(u.output ?? 0);
          const cr = Number(u.cacheRead ?? 0);
          const cw = Number(u.cacheWrite ?? 0);
          const reasoning = Number(u.reasoning ?? 0);
          const turnTokens = inp + out + cr + cw;

          if (turnTokens === 0) continue;

          totalTurns++;
          totalInput += inp;
          totalOutput += out;
          totalCacheRead += cr;
          totalCacheWrite += cw;
          totalReasoning += reasoning;

          const rate = getModelRate(currentModel);
          let turnActual = (inp * rate.input + out * rate.output + cr * rate.cacheRead + cw * rate.cacheWrite) / 1e6;
          if (rate.input === 0 && rate.output === 0) {
            turnActual = 0;
            tierTokens.workhorse += turnTokens;
          } else if (u.cost?.total && typeof u.cost.total === "number" && u.cost.total > 0) {
            turnActual = u.cost.total;
            if (/sonnet|opus/i.test(currentModel)) tierTokens.advisor += turnTokens;
            else tierTokens.orchestrator += turnTokens;
          } else {
            if (/sonnet|opus/i.test(currentModel)) tierTokens.advisor += turnTokens;
            else tierTokens.orchestrator += turnTokens;
          }

          const turnSonnetCached = (inp * SONNET_RATE.input + out * SONNET_RATE.output + cr * SONNET_RATE.cacheRead + cw * SONNET_RATE.cacheWrite) / 1e6;
          const turnSonnetCold = ((inp + cr + cw) * SONNET_RATE.input + out * SONNET_RATE.output) / 1e6;

          cumActual += turnActual;
          cumSonnetCached += turnSonnetCached;
          cumSonnetCold += turnSonnetCold;

          if (!models[currentModel]) {
            models[currentModel] = { model: currentModel, tier: rate.tier, color: rate.color, turns: 0, actualUsd: 0, sonnetUsd: 0 };
          }
          models[currentModel].turns++;
          models[currentModel].actualUsd += turnActual;
          models[currentModel].sonnetUsd += turnSonnetCached;

          const promptToks = inp + cr + cw;
          const hitRate = promptToks > 0 ? ((cr / promptToks) * 100).toFixed(0) + "%" : "0%";
          const durationSec = rec.message?.durationMs ? Number((rec.message.durationMs / 1000).toFixed(1)) : 1.2;

          let reasoningSummary = "";
          if (Array.isArray(rec.message?.content)) {
            for (const p of rec.message.content) {
              if (p.type === "reasoning" && p.summary) {
                reasoningSummary = Array.isArray(p.summary) ? p.summary.map(s => s.text || "").join(" ") : String(p.summary);
              }
            }
          }

          turnAudit.push({
            turnIndex: totalTurns,
            ts: new Date(rec.message?.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            promptExcerpt: (lastUserPrompt || "Turn prompt").slice(0, 100),
            model: currentModel,
            tier: rate.tier.split(":")[0],
            color: rate.color,
            input: inp,
            cacheRead: cr,
            cacheWrite: cw,
            output: out,
            reasoning,
            totalTokens: promptToks + out,
            cacheHitRate: hitRate,
            actualUsd: turnActual,
            sonnetUsd: turnSonnetCached,
            savedUsd: Math.max(0, turnSonnetCached - turnActual),
            duration: durationSec + "s",
            tools: Array.from(new Set(turnTools)),
            reasoningSummary: reasoningSummary.slice(0, 280)
          });

          timeline.push({
            turn: totalTurns,
            cacheRead: cr,
            input: inp,
            output: out,
            actualSpend: Number(cumActual.toFixed(4)),
            sonnetCached: Number(cumSonnetCached.toFixed(4)),
            sonnetCold: Number(cumSonnetCold.toFixed(4)),
            durationSec
          });
        }
      } catch {}
    }
  } catch {}

  const promptTotal = totalInput + totalCacheRead + totalCacheWrite;
  const allTotal = promptTotal + totalOutput;
  const cacheHitPct = promptTotal > 0 ? (totalCacheRead / promptTotal) * 100 : 0;
  const netSaved = Math.max(0, cumSonnetCached - cumActual);
  const netSavedPct = cumSonnetCached > 0 ? (netSaved / cumSonnetCached) * 100 : 0;

  return {
    meta: sessionFileEntry,
    totalTurns,
    totalTokens: allTotal,
    totalInput,
    totalCacheRead,
    totalCacheWrite,
    totalOutput,
    totalReasoning,
    cacheHitPct,
    actualCostUsd: cumActual,
    sonnetCachedUsd: cumSonnetCached,
    sonnetUncachedUsd: cumSonnetCold,
    netSavedUsd: netSaved,
    netSavedPct,
    costMultiplier: cumActual > 0 ? (cumSonnetCached / cumActual).toFixed(1) : "1.0",
    delegationCount,
    totalToolCalls,
    bashErrors,
    tierTokens,
    tools: Object.entries(tools).sort((a, b) => b[1] - a[1]),
    models: Object.values(models),
    timeline,
    turnAudit: turnAudit.reverse()
  };
}

const HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kobayashi // DeepSeek Harness OpenTelemetry Observability</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
<style>
  :root[data-theme="dark"] {
    --bg-page: #0a0d14;
    --bg-card: #111622;
    --bg-subtle: #182030;
    --bg-input: #0b0f19;
    --border: #1f293d;
    --border-subtle: #151d2d;
    --fg-default: #f3f4f6;
    --fg-muted: #94a3b8;
    --fg-subtle: #64748b;
    --accent-blue: #38bdf8;
    --accent-green: #10b981;
    --accent-amber: #f59e0b;
    --accent-purple: #a855f7;
    --accent-pink: #f43f5e;
    --accent-cyan: #06b6d4;
    --chart-grid: rgba(255, 255, 255, 0.05);
  }

  :root[data-theme="light"] {
    --bg-page: #f8fafc;
    --bg-card: #ffffff;
    --bg-subtle: #f1f5f9;
    --bg-input: #ffffff;
    --border: #e2e8f0;
    --border-subtle: #edf2f7;
    --fg-default: #0f172a;
    --fg-muted: #475569;
    --fg-subtle: #64748b;
    --accent-blue: #0284c7;
    --accent-green: #059669;
    --accent-amber: #d97706;
    --accent-purple: #9333ea;
    --accent-pink: #e11d48;
    --accent-cyan: #0891b2;
    --chart-grid: rgba(0, 0, 0, 0.06);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; transition: background-color 0.15s, border-color 0.15s; }
  body { background: var(--bg-page); color: var(--fg-default); min-height: 100vh; display: flex; flex-direction: column; }

  /* Top Navigation */
  .top-nav { height: 56px; background: var(--bg-card); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
  .nav-left { display: flex; align-items: center; gap: 14px; }
  .brand-logo { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-default); }
  .brand-badge { background: rgba(56, 189, 248, 0.12); color: var(--accent-blue); border: 1px solid rgba(56, 189, 248, 0.3); font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }

  .filter-group { display: flex; align-items: center; gap: 8px; margin-left: 12px; }
  .filter-label { font-size: 11px; font-weight: 600; color: var(--fg-muted); }
  .select-input { background: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border); border-radius: 6px; padding: 5px 9px; font-size: 11.5px; font-weight: 600; outline: none; cursor: pointer; }

  .nav-center { display: flex; align-items: center; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 2px; }
  .tab-btn { background: transparent; color: var(--fg-muted); border: none; padding: 5px 14px; font-size: 12px; font-weight: 600; border-radius: 4px; cursor: pointer; }
  .tab-btn.active { background: var(--bg-card); color: var(--fg-default); box-shadow: 0 1px 3px rgba(0,0,0,0.15); }

  .nav-right { display: flex; align-items: center; gap: 10px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-card); color: var(--fg-default); border: 1px solid var(--border); padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: var(--bg-subtle); }

  /* Main Container */
  .main-container { flex: 1; overflow-y: auto; padding: 18px 24px 60px 24px; }

  /* 6 KPI Cards Grid (Matches DeepSeek Harness Top Row) */
  .kpi-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 16px; }
  .kpi-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; position: relative; }
  .kpi-title { font-size: 11px; font-weight: 600; color: var(--fg-muted); display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .kpi-num { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700; color: var(--fg-default); letter-spacing: -0.02em; }
  .kpi-subtext { font-size: 10px; color: var(--fg-subtle); margin-top: 3px; }

  /* Layout Grids */
  .grid-70-30 { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; margin-bottom: 16px; }
  .grid-50-50 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
  .grid-33-33-33 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 16px; }

  .panel-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; position: relative; }
  .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; }
  .panel-title { font-size: 11.5px; font-weight: 700; color: var(--fg-default); text-transform: uppercase; letter-spacing: 0.03em; display: flex; align-items: center; gap: 6px; }
  .panel-meta { font-size: 10.5px; color: var(--fg-muted); font-family: 'JetBrains Mono', monospace; }

  .chart-box { position: relative; width: 100%; height: 210px; }
  .chart-box-donut { position: relative; width: 100%; height: 210px; display: flex; align-items: center; justify-content: center; }
  .donut-center-label { position: absolute; pointer-events: none; text-align: center; }
  .dcl-val { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: var(--fg-default); }
  .dcl-sub { font-size: 9.5px; color: var(--fg-subtle); text-transform: uppercase; font-weight: 600; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left; }
  thead th { padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-subtle); border-bottom: 1px solid var(--border); }
  tbody tr { border-bottom: 1px solid var(--border-subtle); cursor: pointer; }
  tbody tr:hover { background: var(--bg-subtle); }
  tbody td { padding: 8px 10px; vertical-align: middle; }

  .mono { font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; }
  .badge.green { color: var(--accent-green); border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08); }
  .badge.blue { color: var(--accent-blue); border-color: rgba(56, 189, 248, 0.35); background: rgba(56, 189, 248, 0.08); }
  .badge.purple { color: var(--accent-purple); border-color: rgba(168, 85, 247, 0.35); background: rgba(168, 85, 247, 0.08); }
  .badge.amber { color: var(--accent-amber); border-color: rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.08); }
  .badge.pink { color: var(--accent-pink); border-color: rgba(244, 63, 94, 0.35); background: rgba(244, 63, 94, 0.08); }

  /* Pagination Bar */
  .table-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; font-size: 11px; color: var(--fg-muted); }
  .pag-btns { display: flex; gap: 4px; }
  .pag-btn { padding: 3px 8px; border: 1px solid var(--border); background: var(--bg-card); color: var(--fg-default); border-radius: 4px; cursor: pointer; font-size: 11px; }
  .pag-btn.active { background: var(--accent-blue); color: #000; font-weight: 700; border-color: var(--accent-blue); }

  /* Trace Accordion Box */
  .trace-box { padding: 12px 14px; background: var(--bg-subtle); border-radius: 6px; margin: 6px 0; font-size: 11.5px; line-height: 1.5; color: var(--fg-muted); }
  .trace-box b { color: var(--fg-default); }

  @media (max-width: 1400px) {
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
    .grid-70-30 { grid-template-columns: 1fr; }
    .grid-33-33-33 { grid-template-columns: 1fr; }
  }
  @media (max-width: 900px) {
    .kpi-row { grid-template-columns: repeat(2, 1fr); }
    .grid-50-50 { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

  <!-- Top Navigation Header -->
  <header class="top-nav">
    <div class="nav-left">
      <div class="brand-logo">
        <span>⚔️ KOBAYASHI</span>
        <span class="brand-badge">OTel Engine</span>
      </div>
      <div class="filter-group">
        <span class="filter-label">$service_name:</span>
        <select id="repo-select" class="select-input" onchange="onRepoSelectChange()">
          <option value="all">ALL</option>
        </select>
      </div>
      <div class="filter-group">
        <span class="filter-label">Range:</span>
        <select id="timerange-select" class="select-input" onchange="onTimeRangeChange()">
          <option value="7d" selected>1w Last 7 days</option>
          <option value="24h">24h Today</option>
          <option value="30d">30d Last month</option>
          <option value="all">All Time</option>
        </select>
      </div>
    </div>

    <!-- Center View Switcher -->
    <div class="nav-center">
      <button class="tab-btn active" id="tab-overview" onclick="switchView('overview')">📊 Fleet Telemetry</button>
      <button class="tab-btn" id="tab-session" onclick="switchView('session')">🔍 Session Replay</button>
    </div>

    <div class="nav-right">
      <button class="btn" onclick="fetchData()" title="Reload metrics">↻ Refresh</button>
      <button class="btn" id="theme-btn" onclick="toggleTheme()">☀️ Light</button>
      <button class="btn" onclick="exportActiveSession()">📥 Export Audit (.md)</button>
    </div>
  </header>

  <!-- Main View Container -->
  <main class="main-container">

    <!-- ========================================================================= -->
    <!-- VIEW 1: FLEET TELEMETRY OVERVIEW (Matches DeepSeek Harness Screenshot)    -->
    <!-- ========================================================================= -->
    <div id="view-overview">
      
      <!-- Top 6 KPI Cards Row -->
      <section class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-title">Agent Turns <span>ⓘ</span></div>
          <div class="kpi-num" id="kpi-agent-turns">0</div>
          <div class="kpi-subtext" id="kpi-agent-turns-sub">Total turns executed</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-title">Sessions <span>ⓘ</span></div>
          <div class="kpi-num" id="kpi-sessions">0</div>
          <div class="kpi-subtext" id="kpi-sessions-sub">Across workspaces</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-title">Model Calls <span>ⓘ</span></div>
          <div class="kpi-num" id="kpi-model-calls">0</div>
          <div class="kpi-subtext" id="kpi-model-calls-sub">Inference requests</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-title">Tool Calls <span>ⓘ</span></div>
          <div class="kpi-num" id="kpi-tool-calls">0</div>
          <div class="kpi-subtext" id="kpi-tool-calls-sub">Tool executions</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-title">Total Tokens <span>ⓘ</span></div>
          <div class="kpi-num" style="color:var(--accent-blue);" id="kpi-total-tokens">0</div>
          <div class="kpi-subtext" id="kpi-total-tokens-sub">Prompt + Completion</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-title">Cache Hit Rate <span>ⓘ</span></div>
          <div class="kpi-num" style="color:var(--accent-green);" id="kpi-cache-rate">0.00 %</div>
          <div class="kpi-subtext" id="kpi-cache-rate-sub">KV prefix re-use</div>
        </div>
      </section>

      <!-- Row 1: Token Usage Over Time (70%) + Turn Outcomes (30%) -->
      <section class="grid-70-30">
        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Token Usage Over Time <span>ⓘ</span></span>
            <span class="panel-meta">Tokens / Hour</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-tokens-time"></canvas>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Turn Outcomes <span>ⓘ</span></span>
            <span class="panel-meta">Total Turns</span>
          </div>
          <div class="chart-box-donut">
            <canvas id="chart-turn-outcomes"></canvas>
            <div class="donut-center-label">
              <div class="dcl-val" id="donut-outcomes-center">0</div>
              <div class="dcl-sub">turns</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Row 2: Activity Over Time (70%) + Model Finish Reasons (30%) -->
      <section class="grid-70-30">
        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Activity Over Time <span>ⓘ</span></span>
            <span class="panel-meta">Operations / Hour</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-activity-time"></canvas>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Model Finish Reasons <span>ⓘ</span></span>
            <span class="panel-meta">Stop Causes</span>
          </div>
          <div class="chart-box-donut">
            <canvas id="chart-finish-reasons"></canvas>
            <div class="donut-center-label">
              <div class="dcl-val" id="donut-finish-center">0</div>
              <div class="dcl-sub">calls</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Row 3: Model Call Latency (50%) + Time to First Token TTFT (50%) -->
      <section class="grid-50-50">
        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Model Call Latency <span>ⓘ</span></span>
            <span class="panel-meta">p95 & p99 (Seconds)</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-latency-time"></canvas>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Time to First Token (TTFT) <span>ⓘ</span></span>
            <span class="panel-meta">p95 & p99 (Seconds)</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-ttft-time"></canvas>
          </div>
        </div>
      </section>

      <!-- Row 4: Token Distribution by Model (33%) + Tool Call Distribution (33%) + Errors (33%) -->
      <section class="grid-33-33-33">
        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Token Distribution by Model <span>ⓘ</span></span>
            <span class="panel-meta">Volume</span>
          </div>
          <div class="chart-box-donut">
            <canvas id="chart-model-donut"></canvas>
            <div class="donut-center-label">
              <div class="dcl-val" id="donut-model-center" style="font-size:14px;">0</div>
              <div class="dcl-sub">tokens</div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Tool Call Distribution <span>ⓘ</span></span>
            <span class="panel-meta">Executions</span>
          </div>
          <div class="chart-box-donut">
            <canvas id="chart-tool-donut"></canvas>
            <div class="donut-center-label">
              <div class="dcl-val" id="donut-tool-center">0</div>
              <div class="dcl-sub">tools</div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Errors Over Time <span>ⓘ</span></span>
            <span class="panel-meta">Failures</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-errors-time"></canvas>
          </div>
        </div>
      </section>

      <!-- Row 5: Session Details Table (55%) + Tool Performance Table (45%) -->
      <section class="grid-70-30">
        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Session Details <span>ⓘ</span></span>
            <input type="text" id="session-search" placeholder="Search sessions..." class="select-input" style="width:200px; padding:3px 8px;" oninput="renderSessionTable()" />
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Session Prompt / Title</th>
                  <th>Workspace</th>
                  <th>Total Tokens</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Calls</th>
                  <th>Cost</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="session-table-body">
                <tr><td colspan="8" style="text-align:center; padding:16px;">Loading sessions...</td></tr>
              </tbody>
            </table>
          </div>
          <div class="table-foot" id="session-pagination">
            <span>Showing recent sessions</span>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Tool Performance <span>ⓘ</span></span>
            <span class="panel-meta">Latency Distribution</span>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>gen_ai.tool.name</th>
                  <th>Calls</th>
                  <th>p95 Duration</th>
                  <th>Max Duration</th>
                </tr>
              </thead>
              <tbody id="tool-performance-body">
                <tr><td colspan="4" style="text-align:center; padding:16px;">Loading tool performance...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>

    <!-- ========================================================================= -->
    <!-- VIEW 2: SESSION DEEP DIVE & TRACE REPLAY (Individual Session Inspection) -->
    <!-- ========================================================================= -->
    <div id="view-session" style="display:none;">
      
      <!-- Session Header Banner -->
      <section class="panel-card" style="margin-bottom:16px; flex-direction:row; justify-content:space-between; align-items:center;">
        <div>
          <button class="btn" onclick="switchView('overview')" style="margin-bottom:8px; font-size:11px;">← Back to Fleet Overview</button>
          <h2 style="font-size:16px; font-weight:700;" id="sd-banner-title">Session Title</h2>
          <div style="font-size:11px; color:var(--fg-muted); display:flex; gap:12px; margin-top:4px;">
            <span>Workspace: <b id="sd-banner-repo">-</b></span>
            <span>Recorded: <b id="sd-banner-time">-</b></span>
            <span>Session: <b class="mono" id="sd-banner-file">-</b></span>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px; font-weight:700; color:var(--fg-muted); text-transform:uppercase;">Net Dollars Saved vs Sonnet</div>
          <div class="mono" style="font-size:24px; font-weight:700; color:var(--accent-green);" id="sd-banner-saved">$0.0000</div>
        </div>
      </section>

      <!-- Session KPI Row -->
      <section class="kpi-row" style="grid-template-columns: repeat(4, 1fr); margin-bottom:16px;">
        <div class="kpi-box">
          <div class="kpi-title">Actual Spend</div>
          <div class="kpi-num" style="color:var(--accent-blue);" id="sd-kpi-actual">$0.0000</div>
          <div class="kpi-subtext" id="sd-kpi-actual-sub">vs $0.0000 Sonnet</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Prefix Cache Hit %</div>
          <div class="kpi-num" style="color:var(--accent-green);" id="sd-kpi-cache">0.0%</div>
          <div class="kpi-subtext" id="sd-kpi-cache-sub">Cached tokens</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Tokens Consumed</div>
          <div class="kpi-num" id="sd-kpi-tokens">0</div>
          <div class="kpi-subtext" id="sd-kpi-tokens-sub">Prompt + completion</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-title">Turns Executed</div>
          <div class="kpi-num" style="color:var(--accent-amber);" id="sd-kpi-turns">0</div>
          <div class="kpi-subtext" id="sd-kpi-turns-sub">0 worker offloads</div>
        </div>
      </section>

      <!-- Session Charts: Stacked Tokens (50%) + Cost Trajectory (50%) -->
      <section class="grid-50-50">
        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Session Token Decomposition</span>
            <span class="panel-meta">Per Turn</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-sd-tokens"></canvas>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-head">
            <span class="panel-title">Cumulative Cost Trajectory</span>
            <span class="panel-meta">USD</span>
          </div>
          <div class="chart-box">
            <canvas id="chart-sd-cost"></canvas>
          </div>
        </div>
      </section>

      <!-- Turn-by-Turn Replay Inspector -->
      <section class="panel-card">
        <div class="panel-head">
          <span class="panel-title">Turn-by-Turn Trace Replay & Pricing Inspector</span>
          <span class="panel-meta">Click turn row to expand reasoning & tool details</span>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Turn</th>
                <th>Time</th>
                <th>Model / Tier</th>
                <th>Cached Read</th>
                <th>Fresh Input</th>
                <th>Output</th>
                <th>Cache %</th>
                <th>Actual Spend</th>
                <th>Saved vs Sonnet</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody id="sd-turn-rows">
              <tr><td colspan="10" style="text-align:center; padding:16px;">No turn records found</td></tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>

  </main>

<script>
let globalData = null;
let currentView = "overview";
let activeSessionFile = null;

// Chart Instances
let chartTokensTime = null;
let chartTurnOutcomes = null;
let chartActivityTime = null;
let chartFinishReasons = null;
let chartLatencyTime = null;
let chartTtftTime = null;
let chartModelDonut = null;
let chartToolDonut = null;
let chartErrorsTime = null;
let chartSdTokens = null;
let chartSdCost = null;

const fNum = (n) => Number(n || 0).toLocaleString();
const fUsd = (n) => "$" + Number(n || 0).toFixed(4);

function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeButton(saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeButton(next);
  if (globalData) renderAllCharts(globalData);
}

function updateThemeButton(theme) {
  const btn = document.getElementById("theme-btn");
  if (btn) btn.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
}

function getColors() {
  const isDark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
  return {
    text: isDark ? "#94a3b8" : "#475569",
    grid: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)",
    bg: isDark ? "#111622" : "#ffffff",
    card: isDark ? "#111622" : "#ffffff"
  };
}

function switchView(viewName) {
  currentView = viewName;
  document.getElementById("view-overview").style.display = viewName === "overview" ? "block" : "none";
  document.getElementById("view-session").style.display = viewName === "session" ? "block" : "none";

  document.getElementById("tab-overview").className = "tab-btn" + (viewName === "overview" ? " active" : "");
  document.getElementById("tab-session").className = "tab-btn" + (viewName === "session" ? " active" : "");

  if (viewName === "session" && globalData?.sessionDetail) {
    renderSessionDeepDive(globalData.sessionDetail);
  }
}

function onRepoSelectChange() {
  fetchData();
}

function onTimeRangeChange() {
  fetchData();
}

async function fetchData(targetSessionFile = null) {
  try {
    const repo = document.getElementById("repo-select").value;
    const timeRange = document.getElementById("timerange-select").value;
    let url = "/api/telemetry?repo=" + encodeURIComponent(repo) + "&timeRange=" + encodeURIComponent(timeRange);
    if (targetSessionFile) url += "&file=" + encodeURIComponent(targetSessionFile);
    else if (activeSessionFile) url += "&file=" + encodeURIComponent(activeSessionFile);

    const res = await fetch(url);
    const data = await res.json();
    globalData = data;
    activeSessionFile = data.activeSessionFile;

    updateRepoOptions(data.repos, data.activeRepo);
    renderOverviewKPIs(data.aggregate);
    renderAllCharts(data);
    renderSessionTable();
    renderToolPerformanceTable(data.toolPerformance);

    if (currentView === "session" && data.sessionDetail) {
      renderSessionDeepDive(data.sessionDetail);
    }
  } catch (err) {
    console.error("Failed to fetch telemetry:", err);
  }
}

function updateRepoOptions(repos, activeRepo) {
  const sel = document.getElementById("repo-select");
  let html = '<option value="all">ALL</option>';
  for (const r of repos) {
    html += '<option value="' + r.key + '"' + (r.key === activeRepo ? ' selected' : '') + '>' + r.name + ' (' + r.count + ')</option>';
  }
  sel.innerHTML = html;
}

function renderOverviewKPIs(agg) {
  if (!agg) return;
  document.getElementById("kpi-agent-turns").textContent = fNum(agg.agentTurns);
  document.getElementById("kpi-sessions").textContent = fNum(agg.sessions);
  document.getElementById("kpi-model-calls").textContent = fNum(agg.modelCalls);
  document.getElementById("kpi-tool-calls").textContent = fNum(agg.toolCalls);
  document.getElementById("kpi-total-tokens").textContent = fNum(agg.totalTokens);
  document.getElementById("kpi-cache-rate").textContent = agg.cacheHitRate;

  document.getElementById("kpi-total-tokens-sub").textContent = "Spend: " + fUsd(agg.actualCost);
  document.getElementById("kpi-cache-rate-sub").textContent = "Saved: " + fUsd(agg.savedCost) + " (" + agg.savedPct + ")";
}

function renderAllCharts(data) {
  const cc = getColors();
  const ts = data.timeseries || [];
  const labels = ts.map(x => x.label);

  // 1. Token Usage Over Time (Stacked Line/Area: Input pink, Cached purple/cyan, Output green)
  const ctxT = document.getElementById("chart-tokens-time")?.getContext("2d");
  if (ctxT && typeof Chart !== "undefined") {
    if (chartTokensTime) chartTokensTime.destroy();
    chartTokensTime = new Chart(ctxT, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Input tokens",
            data: ts.map(x => x.input),
            borderColor: "#f43f5e",
            backgroundColor: "rgba(244, 63, 94, 0.15)",
            borderWidth: 1.8,
            fill: true,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "Cached (read)",
            data: ts.map(x => x.cached),
            borderColor: "#a855f7",
            backgroundColor: "rgba(168, 85, 247, 0.15)",
            borderWidth: 1.8,
            fill: true,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "Output tokens",
            data: ts.map(x => x.output),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            borderWidth: 1.8,
            fill: true,
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cc.text, font: { size: 9.5 } } },
          y: { grid: { color: cc.grid }, ticks: { color: cc.text, callback: v => v >= 1000 ? (v/1000).toFixed(0) + "k" : v } }
        }
      }
    });
  }

  // 2. Turn Outcomes Donut
  const ctxO = document.getElementById("chart-turn-outcomes")?.getContext("2d");
  if (ctxO && typeof Chart !== "undefined") {
    if (chartTurnOutcomes) chartTurnOutcomes.destroy();
    const to = data.turnOutcomes || { completed: 0, error: 0 };
    const totalOutcomes = to.completed + to.error;
    document.getElementById("donut-outcomes-center").textContent = fNum(totalOutcomes);

    chartTurnOutcomes = new Chart(ctxO, {
      type: "doughnut",
      data: {
        labels: ["completed", "error"],
        datasets: [{
          data: [to.completed, to.error],
          backgroundColor: ["#a855f7", "#38bdf8"],
          borderWidth: 2,
          borderColor: cc.bg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 10.5 }, color: cc.text } }
        },
        cutout: "72%"
      }
    });
  }

  // 3. Activity Over Time (Model calls, Tool calls, Turns)
  const ctxA = document.getElementById("chart-activity-time")?.getContext("2d");
  if (ctxA && typeof Chart !== "undefined") {
    if (chartActivityTime) chartActivityTime.destroy();
    chartActivityTime = new Chart(ctxA, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Model calls",
            data: ts.map(x => x.modelCalls),
            borderColor: "#10b981",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "Tool calls",
            data: ts.map(x => x.toolCalls),
            borderColor: "#06b6d4",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "Turns",
            data: ts.map(x => x.turns),
            borderColor: "#a855f7",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cc.text, font: { size: 9.5 } } },
          y: { grid: { color: cc.grid }, ticks: { color: cc.text } }
        }
      }
    });
  }

  // 4. Model Finish Reasons Donut
  const ctxF = document.getElementById("chart-finish-reasons")?.getContext("2d");
  if (ctxF && typeof Chart !== "undefined") {
    if (chartFinishReasons) chartFinishReasons.destroy();
    const fr = data.finishReasons || { tool_calls: 0, stop: 0, error: 0 };
    const totalFinish = fr.tool_calls + fr.stop + fr.error;
    document.getElementById("donut-finish-center").textContent = fNum(totalFinish);

    chartFinishReasons = new Chart(ctxF, {
      type: "doughnut",
      data: {
        labels: ["tool_calls", "stop", "error"],
        datasets: [{
          data: [fr.tool_calls, fr.stop, fr.error],
          backgroundColor: ["#f59e0b", "#a855f7", "#ef4444"],
          borderWidth: 2,
          borderColor: cc.bg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 10.5 }, color: cc.text } }
        },
        cutout: "72%"
      }
    });
  }

  // 5. Model Call Latency
  const ctxL = document.getElementById("chart-latency-time")?.getContext("2d");
  if (ctxL && typeof Chart !== "undefined") {
    if (chartLatencyTime) chartLatencyTime.destroy();
    chartLatencyTime = new Chart(ctxL, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "p99",
            data: ts.map(x => x.p99Latency),
            borderColor: "#f43f5e",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "p95",
            data: ts.map(x => x.p95Latency),
            borderColor: "#06b6d4",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cc.text, font: { size: 9.5 } } },
          y: { grid: { color: cc.grid }, ticks: { color: cc.text, callback: v => v + " s" } }
        }
      }
    });
  }

  // 6. Time to First Token (TTFT)
  const ctxTT = document.getElementById("chart-ttft-time")?.getContext("2d");
  if (ctxTT && typeof Chart !== "undefined") {
    if (chartTtftTime) chartTtftTime.destroy();
    chartTtftTime = new Chart(ctxTT, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "p99",
            data: ts.map(x => x.ttftP99),
            borderColor: "#f43f5e",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "p95",
            data: ts.map(x => x.ttftP95),
            borderColor: "#06b6d4",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cc.text, font: { size: 9.5 } } },
          y: { grid: { color: cc.grid }, ticks: { color: cc.text, callback: v => v + " s" } }
        }
      }
    });
  }

  // 7. Token Distribution by Model Donut
  const ctxMD = document.getElementById("chart-model-donut")?.getContext("2d");
  if (ctxMD && typeof Chart !== "undefined") {
    if (chartModelDonut) chartModelDonut.destroy();
    const tbm = data.tokenByModel || [];
    const totalModelToks = tbm.reduce((a, b) => a + b.tokens, 0);
    document.getElementById("donut-model-center").textContent = fNum(totalModelToks);

    chartModelDonut = new Chart(ctxMD, {
      type: "doughnut",
      data: {
        labels: tbm.map(x => x.model.replace(/^openai\./, "").replace(/^us\.anthropic\./, "")),
        datasets: [{
          data: tbm.map(x => x.tokens),
          backgroundColor: tbm.map(x => x.color),
          borderWidth: 2,
          borderColor: cc.bg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 9.5 }, color: cc.text } }
        },
        cutout: "70%"
      }
    });
  }

  // 8. Tool Call Distribution Donut
  const ctxTD = document.getElementById("chart-tool-donut")?.getContext("2d");
  if (ctxTD && typeof Chart !== "undefined") {
    if (chartToolDonut) chartToolDonut.destroy();
    const tcd = data.toolDistribution || [];
    const totalToolCalls = tcd.reduce((a, b) => a + b.count, 0);
    document.getElementById("donut-tool-center").textContent = fNum(totalToolCalls);

    chartToolDonut = new Chart(ctxTD, {
      type: "doughnut",
      data: {
        labels: tcd.map(x => x.tool),
        datasets: [{
          data: tcd.map(x => x.count),
          backgroundColor: tcd.map(x => x.color),
          borderWidth: 2,
          borderColor: cc.bg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 9.5 }, color: cc.text } }
        },
        cutout: "70%"
      }
    });
  }

  // 9. Errors Over Time
  const ctxE = document.getElementById("chart-errors-time")?.getContext("2d");
  if (ctxE && typeof Chart !== "undefined") {
    if (chartErrorsTime) chartErrorsTime.destroy();
    chartErrorsTime = new Chart(ctxE, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Failed turns",
            data: ts.map(x => x.errors),
            borderColor: "#06b6d4",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          },
          {
            label: "Tool errors",
            data: ts.map(x => x.errors > 0 ? x.errors : 0),
            borderColor: "#f43f5e",
            borderWidth: 1.8,
            tension: 0.25,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cc.text, font: { size: 9.5 } } },
          y: { grid: { color: cc.grid }, ticks: { color: cc.text, stepSize: 1 } }
        }
      }
    });
  }
}

function renderSessionTable() {
  if (!globalData) return;
  const tbody = document.getElementById("session-table-body");
  const q = (document.getElementById("session-search")?.value || "").toLowerCase().trim();

  let sessions = globalData.sessions || [];
  if (q) {
    sessions = sessions.filter(s => s.title.toLowerCase().includes(q) || s.repoName.toLowerCase().includes(q) || s.models.some(m => m.toLowerCase().includes(q)));
  }

  if (sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--fg-subtle);">No sessions match search filter</td></tr>';
    return;
  }

  tbody.innerHTML = sessions.slice(0, 15).map(s => {
    return '<tr>' +
      '<td style="font-weight:600; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escapeHtml(s.fullPrompt) + '">' + escapeHtml(s.title) + '</td>' +
      '<td><span class="badge blue">' + s.repoName + '</span></td>' +
      '<td class="mono">' + fNum(s.totalTokens) + '</td>' +
      '<td class="mono" style="color:var(--accent-blue);">' + fNum(s.inputTokens) + '</td>' +
      '<td class="mono" style="color:var(--accent-amber);">' + fNum(s.outputTokens) + '</td>' +
      '<td class="mono">' + s.modelCalls + '</td>' +
      '<td class="mono" style="font-weight:700; color:var(--fg-default);">' + fUsd(s.actualCost) + '</td>' +
      '<td><button class="btn" style="padding:2px 8px; font-size:10.5px;" onclick="openSessionDetail(\\'' + s.fileName + '\\')">Inspect ➔</button></td>' +
    '</tr>';
  }).join("");

  document.getElementById("session-pagination").innerHTML =
    '<span>Showing ' + Math.min(15, sessions.length) + ' of ' + sessions.length + ' sessions</span>' +
    '<span style="font-size:10.5px; color:var(--fg-subtle);">Click Inspect to open deep turn replay</span>';
}

function renderToolPerformanceTable(tools) {
  const tbody = document.getElementById("tool-performance-body");
  if (!tools || tools.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:16px;">No tool data</td></tr>';
    return;
  }

  tbody.innerHTML = tools.map(t => {
    return '<tr>' +
      '<td><b class="mono">' + t.name + '</b></td>' +
      '<td class="mono">' + fNum(t.calls) + '</td>' +
      '<td class="mono" style="color:var(--accent-cyan);">' + t.p95Duration + '</td>' +
      '<td class="mono" style="color:var(--fg-subtle);">' + t.maxDuration + '</td>' +
    '</tr>';
  }).join("");
}

function openSessionDetail(fileName) {
  activeSessionFile = fileName;
  fetchData(fileName).then(() => {
    switchView("session");
  });
}

function renderSessionDeepDive(detail) {
  if (!detail) return;
  const m = detail.meta;

  document.getElementById("sd-banner-title").textContent = m.fullPrompt || m.title || "Interactive Session";
  document.getElementById("sd-banner-repo").textContent = m.repoName;
  document.getElementById("sd-banner-time").textContent = m.dateStr + " (" + m.timeAgo + ")";
  document.getElementById("sd-banner-file").textContent = m.fileName;
  document.getElementById("sd-banner-saved").textContent = fUsd(detail.netSavedUsd);

  document.getElementById("sd-kpi-actual").textContent = fUsd(detail.actualCostUsd);
  document.getElementById("sd-kpi-actual-sub").textContent = "vs " + fUsd(detail.sonnetCachedUsd) + " Sonnet (" + detail.costMultiplier + "x cheaper)";
  document.getElementById("sd-kpi-cache").textContent = detail.cacheHitPct.toFixed(1) + "%";
  document.getElementById("sd-kpi-cache-sub").textContent = fNum(detail.totalCacheRead) + " cached of " + fNum(detail.totalInput + detail.totalCacheRead + detail.totalCacheWrite);
  document.getElementById("sd-kpi-tokens").textContent = fNum(detail.totalTokens);
  document.getElementById("sd-kpi-tokens-sub").textContent = fNum(detail.totalInput) + " in • " + fNum(detail.totalOutput) + " out";
  document.getElementById("sd-kpi-turns").textContent = detail.totalTurns + " Turns";
  document.getElementById("sd-kpi-turns-sub").textContent = detail.delegationCount + " worker offloads";

  renderSessionDeepDiveCharts(detail);
  renderSessionDeepDiveRows(detail.turnAudit || []);
}

function renderSessionDeepDiveCharts(detail) {
  const cc = getColors();
  const timeline = detail.timeline || [];

  const ctxT = document.getElementById("chart-sd-tokens")?.getContext("2d");
  if (ctxT && typeof Chart !== "undefined") {
    if (chartSdTokens) chartSdTokens.destroy();
    chartSdTokens = new Chart(ctxT, {
      type: "bar",
      data: {
        labels: timeline.map(t => "T" + t.turn),
        datasets: [
          { label: "Cached Read ($0.02 / $0.00)", data: timeline.map(t => t.cacheRead), backgroundColor: "#10b981", stack: "s" },
          { label: "Cold Input ($0.22 / $0.00)", data: timeline.map(t => t.input), backgroundColor: "#3b82f6", stack: "s" },
          { label: "Output Generation ($1.32 / $0.00)", data: timeline.map(t => t.output), backgroundColor: "#f59e0b", stack: "s" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: cc.text } },
          y: { stacked: true, grid: { color: cc.grid }, ticks: { color: cc.text, callback: v => v >= 1000 ? (v/1000).toFixed(0) + "k" : v } }
        }
      }
    });
  }

  const ctxC = document.getElementById("chart-sd-cost")?.getContext("2d");
  if (ctxC && typeof Chart !== "undefined") {
    if (chartSdCost) chartSdCost.destroy();
    chartSdCost = new Chart(ctxC, {
      type: "line",
      data: {
        labels: timeline.map(t => "T" + t.turn),
        datasets: [
          {
            label: "Actual Spend ($)",
            data: timeline.map(t => t.actualSpend),
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.08)",
            fill: true,
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 2
          },
          {
            label: "Claude Sonnet (Cached)",
            data: timeline.map(t => t.sonnetCached),
            borderColor: "#f59e0b",
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.2
          },
          {
            label: "Claude Code (Cold Baseline)",
            data: timeline.map(t => t.sonnetCold),
            borderColor: "#ef4444",
            borderWidth: 1.5,
            borderDash: [2, 2],
            pointRadius: 0,
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { boxWidth: 8, font: { size: 10 }, color: cc.text } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: cc.text } },
          y: { grid: { color: cc.grid }, ticks: { color: cc.text, callback: v => "$" + Number(v).toFixed(3) } }
        }
      }
    });
  }
}

function toggleSdTurnDetail(idx) {
  const panel = document.getElementById("sd-turn-exp-" + idx);
  if (panel) {
    panel.style.display = panel.style.display === "none" ? "table-row" : "none";
  }
}

function renderSessionDeepDiveRows(turns) {
  const tbody = document.getElementById("sd-turn-rows");
  if (!turns || turns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--fg-subtle);">No turn events recorded</td></tr>';
    return;
  }

  tbody.innerHTML = turns.map(t => {
    const tierBadge = t.tier === "Workhorse" ? "badge green" : (t.tier === "Advisor" ? "badge purple" : "badge blue");
    const toolsHtml = (t.tools || []).map(x => '<span class="badge">' + x + '</span>').join(" ");

    const expandRow = '<tr id="sd-turn-exp-' + t.turnIndex + '" style="display:none; background:var(--bg-subtle);">' +
      '<td colspan="10" style="padding:12px 16px;">' +
        '<div class="trace-box">' +
          '<div style="margin-bottom:6px;"><b>Prompt Context:</b> <span>' + escapeHtml(t.promptExcerpt) + '</span></div>' +
          (t.reasoningSummary ? '<div style="margin-bottom:6px;"><b>Model Reasoning:</b> <span>' + escapeHtml(t.reasoningSummary) + '</span></div>' : '') +
          (toolsHtml ? '<div style="margin-bottom:6px;"><b>Tool Calls Executed:</b> ' + toolsHtml + '</div>' : '') +
          '<div style="font-family:JetBrains Mono, monospace; font-size:10.5px; color:var(--fg-subtle); margin-top:8px;">' +
            'Tokens: ' + fNum(t.input) + ' in + ' + fNum(t.cacheRead) + ' cached + ' + fNum(t.output) + ' out = ' + fNum(t.totalTokens) + ' total | Actual: ' + fUsd(t.actualUsd) + ' | Baseline: ' + fUsd(t.sonnetUsd) +
          '</div>' +
        '</div>' +
      '</td>' +
    '</tr>';

    return '<tr onclick="toggleSdTurnDetail(' + t.turnIndex + ')">' +
      '<td class="mono" style="font-weight:700;">T' + t.turnIndex + '</td>' +
      '<td class="mono" style="color:var(--fg-subtle);">' + t.ts + '</td>' +
      '<td><span class="' + tierBadge + '">' + t.tier + '</span> <span class="mono" style="font-size:10px; color:var(--fg-muted);">' + t.model.replace(/^openai\./, "").replace(/^us\.anthropic\./, "") + '</span></td>' +
      '<td class="mono" style="color:var(--accent-green);">' + fNum(t.cacheRead) + '</td>' +
      '<td class="mono" style="color:var(--accent-blue);">' + fNum(t.input) + '</td>' +
      '<td class="mono" style="color:var(--accent-amber);">' + fNum(t.output) + '</td>' +
      '<td class="mono">' + t.cacheHitRate + '</td>' +
      '<td class="mono" style="font-weight:600; color:var(--fg-default);">' + fUsd(t.actualUsd) + '</td>' +
      '<td class="mono" style="color:var(--accent-green); font-weight:600;">+' + fUsd(t.savedUsd) + '</td>' +
      '<td class="mono" style="color:var(--fg-subtle);">' + t.duration + '</td>' +
    '</tr>' + expandRow;
  }).join("");
}

function exportActiveSession() {
  if (!globalData?.sessionDetail) return;
  const d = globalData.sessionDetail;
  const m = d.meta;
  const md = "# Kobayashi Session Audit: " + m.title + "\\n\\n" +
    "- **Session File**: " + m.fileName + "\\n" +
    "- **Workspace**: " + m.repoName + "\\n" +
    "- **Timestamp**: " + m.dateStr + "\\n" +
    "- **Turns**: " + d.totalTurns + "\\n" +
    "- **Total Tokens**: " + fNum(d.totalTokens) + "\\n" +
    "- **KV-Cache Hit Ratio**: " + d.cacheHitPct.toFixed(1) + "% (" + fNum(d.totalCacheRead) + " tokens)\\n" +
    "- **Actual Spend**: " + fUsd(d.actualCostUsd) + "\\n" +
    "- **Claude Sonnet Counterfactual (Cached)**: " + fUsd(d.sonnetCachedUsd) + "\\n" +
    "- **Net Dollars Saved**: " + fUsd(d.netSavedUsd) + " (" + d.netSavedPct.toFixed(1) + "% reduction)\\n" +
    "- **Worker Delegations**: " + d.delegationCount + "\\n";
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "session-audit-" + m.fileName.replace(".jsonl", "") + ".md";
  a.click();
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  fetchData();
});
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (parsedUrl.pathname === "/api/telemetry") {
    const repo = parsedUrl.searchParams.get("repo") || "all";
    const timeRange = parsedUrl.searchParams.get("timeRange") || "all";
    const file = parsedUrl.searchParams.get("file");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getTelemetryData(repo, timeRange, file)));
  } else {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    exec(`open "http://127.0.0.1:${PORT}"`);
    process.exit(0);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n⚔️ Kobayashi DeepSeek-grade OTel Console live at: http://127.0.0.1:${PORT}`);
});
