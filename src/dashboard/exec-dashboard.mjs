#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";

const PI_DIR = path.join(os.homedir(), ".pi", "agent");
const SESSIONS_DIR = path.join(PI_DIR, "sessions");
const LEDGER_PATH = path.join(PI_DIR, "savings-ledger.jsonl");
const PORT = Number(process.env.PI_EXEC_PORT || 4200);

const PRICING = {
  "ornith-1.5:ctx": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, tier: "Workhorse: Local ($0.00)", color: "#2da44e" },
  "openai.gpt-5.6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22, tier: "Orchestrator: Mantle Cached", color: "#0969da" },
  "openai.gpt-6-luna": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22, tier: "Orchestrator: Mantle Cached", color: "#0969da" },
  "us.openai.gpt-6-sol": { input: 0.22, output: 1.32, cacheRead: 0.02, cacheWrite: 0.22, tier: "Orchestrator: Mantle Cached", color: "#0969da" },
  "global.anthropic.claude-haiku-5-5": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80, tier: "Triage: Haiku 5.5", color: "#057a55" },
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 0.80, output: 4.00, cacheRead: 0.08, cacheWrite: 0.80, tier: "Triage: Haiku 4.5", color: "#057a55" },
  "us.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#bf8700" },
  "us.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#bf8700" },
  "global.anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#bf8700" },
  "global.anthropic.claude-sonnet-5-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#bf8700" },
  "us.anthropic.claude-sonnet-4-6": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 4.6", color: "#bf8700" },
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 4.5", color: "#bf8700" },
  "global.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 4.5", color: "#bf8700" },
  "anthropic.claude-sonnet-5": { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75, tier: "Advisor: Sonnet 5.5", color: "#bf8700" },
  "au.anthropic.claude-opus-4-6-v1": { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75, tier: "Frontier: Opus 4.6", color: "#8250df" }
};

const SONNET_RATE = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };
const DSH_V4_PRO_RATE = { input: 1.74, output: 3.48, cacheRead: 0.145, cacheWrite: 1.74 };

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

function getAllSessionsMeta() {
  const list = [];
  if (!fs.existsSync(SESSIONS_DIR)) return list;

  try {
    for (const ent of fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const repoDir = path.join(SESSIONS_DIR, ent.name);
      try {
        for (const f of fs.readdirSync(repoDir)) {
          if (!f.endsWith(".jsonl")) continue;
          const fullPath = path.join(repoDir, f);
          const stat = fs.statSync(fullPath);
          let firstPrompt = "";
          let turns = 0;
          let totalTokens = 0;
          let actualCost = 0;
          let sonnetCost = 0;
          let cachedTokens = 0;
          let promptTokens = 0;
          const models = new Set();

          try {
            const lines = fs.readFileSync(fullPath, "utf8").split("\n").filter(Boolean);
            for (const l of lines) {
              try {
                const r = JSON.parse(l);
                if (!firstPrompt && r.type === "message" && r.message?.role === "user") {
                  const c = r.message.content;
                  firstPrompt = typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x.text || "").join(" ").trim() : "";
                }
                if (r.message?.usage) {
                  turns++;
                  const u = r.message.usage;
                  const inp = Number(u.input || 0);
                  const out = Number(u.output || 0);
                  const cr = Number(u.cacheRead || 0);
                  const cw = Number(u.cacheWrite || 0);
                  totalTokens += (u.totalTokens || (inp + out + cr + cw));
                  cachedTokens += cr;
                  promptTokens += (inp + cr + cw);

                  const m = r.message.model || "openai.gpt-5.6-luna";
                  const cleanModel = m.split("/").pop();
                  models.add(cleanModel);

                  const rate = PRICING[cleanModel] || PRICING["openai.gpt-5.6-luna"];
                  actualCost += (inp * rate.input + out * rate.output + cr * rate.cacheRead + cw * rate.cacheWrite) / 1e6;
                  sonnetCost += (inp * SONNET_RATE.input + out * SONNET_RATE.output + cr * SONNET_RATE.cacheRead + cw * SONNET_RATE.cacheWrite) / 1e6;
                }
              } catch {}
            }
          } catch {}

          const hitRate = promptTokens > 0 ? (cachedTokens / promptTokens) * 100 : 0;
          const cleanTitle = (firstPrompt || "Session " + f.slice(0, 10)).replace(/\s+/g, " ").trim();

          list.push({
            fileName: f,
            repoKey: ent.name,
            repoName: formatRepoName(ent.name),
            title: cleanTitle.slice(0, 75) + (cleanTitle.length > 75 ? "…" : ""),
            fullPrompt: cleanTitle,
            mtimeMs: stat.mtimeMs,
            timeAgo: timeAgo(stat.mtimeMs),
            dateStr: new Date(stat.mtimeMs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            sizeKb: (stat.size / 1024).toFixed(1),
            turns,
            totalTokens,
            cachedTokens,
            cacheHitRate: hitRate.toFixed(1) + "%",
            actualCost: Number(actualCost.toFixed(4)),
            sonnetCost: Number(sonnetCost.toFixed(4)),
            savedCost: Number(Math.max(0, sonnetCost - actualCost).toFixed(4)),
            models: Array.from(models)
          });
        }
      } catch {}
    }
  } catch {}

  return list.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function parseDetailedSession(sessionFileEntry) {
  const turnAudit = [];
  const timeline = [];
  let cumActual = 0, cumSonnetCached = 0, cumSonnetCold = 0, cumDsh = 0;
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0, totalReasoning = 0;
  let totalTurns = 0, totalToolCalls = 0;
  let bashErrors = 0, delegationCount = 0;
  const tools = {};
  const models = {};

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
          for (const part of rec.message.content) {
            if (part.type === "toolCall" || part.type === "tool_use") {
              recordTool(part.name || part.toolName, false);
            }
          }
        }

        const u = rec.message?.usage;
        if (u) {
          const inp = Number(u.input ?? 0);
          const out = Number(u.output ?? 0);
          const cr = Number(u.cacheRead ?? 0);
          const cw = Number(u.cacheWrite ?? 0);
          const reasoning = Number(u.reasoning ?? 0);

          if (inp + out + cr + cw === 0) continue;

          totalTurns++;
          totalInput += inp;
          totalOutput += out;
          totalCacheRead += cr;
          totalCacheWrite += cw;
          totalReasoning += reasoning;

          const rate = PRICING[currentModel] || PRICING["openai.gpt-5.6-luna"];
          const turnActual = (inp * rate.input + out * rate.output + cr * rate.cacheRead + cw * rate.cacheWrite) / 1e6;
          const turnSonnetCached = (inp * SONNET_RATE.input + out * SONNET_RATE.output + cr * SONNET_RATE.cacheRead + cw * SONNET_RATE.cacheWrite) / 1e6;
          const turnSonnetCold = ((inp + cr + cw) * SONNET_RATE.input + out * SONNET_RATE.output) / 1e6;
          const turnDsh = (inp * DSH_V4_PRO_RATE.input + out * DSH_V4_PRO_RATE.output + cr * DSH_V4_PRO_RATE.cacheRead + cw * DSH_V4_PRO_RATE.cacheWrite) / 1e6;

          cumActual += turnActual;
          cumSonnetCached += turnSonnetCached;
          cumSonnetCold += turnSonnetCold;
          cumDsh += turnDsh;

          if (!models[currentModel]) {
            models[currentModel] = { model: currentModel, tier: rate.tier, color: rate.color, turns: 0, actualUsd: 0, sonnetUsd: 0 };
          }
          models[currentModel].turns++;
          models[currentModel].actualUsd += turnActual;
          models[currentModel].sonnetUsd += turnSonnetCached;

          const promptToks = inp + cr + cw;
          const hitRate = promptToks > 0 ? ((cr / promptToks) * 100).toFixed(0) + "%" : "0%";
          const durationSec = rec.message?.durationMs ? (rec.message.durationMs / 1000).toFixed(1) + "s" : "-";

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
            duration: durationSec,
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
            durationSec: rec.message?.durationMs ? Number((rec.message.durationMs / 1000).toFixed(1)) : 1.5
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
    tools: Object.entries(tools).sort((a, b) => b[1] - a[1]),
    models: Object.values(models),
    timeline,
    turnAudit: turnAudit.reverse()
  };
}

function getDashboardPayload(repoFilter = "all", selectedFileName = null) {
  const allSessions = getAllSessionsMeta();

  // Aggregate workspace counts
  const reposMap = {};
  for (const s of allSessions) {
    if (!reposMap[s.repoKey]) {
      reposMap[s.repoKey] = { key: s.repoKey, name: s.repoName, count: 0 };
    }
    reposMap[s.repoKey].count++;
  }
  const repos = Object.values(reposMap);

  let filteredSessions = allSessions;
  if (repoFilter && repoFilter !== "all") {
    filteredSessions = filteredSessions.filter(s => s.repoKey === repoFilter);
  }

  // Active session target: either explicit query or the most recent session
  let activeSession = null;
  if (selectedFileName && selectedFileName !== "all") {
    activeSession = filteredSessions.find(s => s.fileName === selectedFileName) || allSessions.find(s => s.fileName === selectedFileName);
  }
  if (!activeSession && filteredSessions.length > 0) {
    activeSession = filteredSessions[0];
  }

  const sessionDetail = activeSession ? parseDetailedSession(activeSession) : null;

  // Global aggregate metrics across filtered scope
  let aggTurns = 0, aggTokens = 0, aggActual = 0, aggSonnet = 0, aggCached = 0, aggPrompt = 0;
  for (const s of filteredSessions) {
    aggTurns += s.turns;
    aggTokens += s.totalTokens;
    aggActual += s.actualCost;
    aggSonnet += s.sonnetCost;
    aggCached += s.cachedTokens;
  }
  const aggHitRate = aggTokens > 0 ? ((aggCached / aggTokens) * 100).toFixed(1) + "%" : "0%";
  const aggSaved = Math.max(0, aggSonnet - aggActual);
  const aggSavedPct = aggSonnet > 0 ? ((aggSaved / aggSonnet) * 100).toFixed(1) : "0.0";

  return {
    repos,
    sessions: filteredSessions,
    activeRepo: repoFilter,
    activeSessionFile: activeSession?.fileName || null,
    sessionDetail,
    aggregate: {
      sessionCount: filteredSessions.length,
      turns: aggTurns,
      tokens: aggTokens,
      actualCost: Number(aggActual.toFixed(4)),
      sonnetCost: Number(aggSonnet.toFixed(4)),
      savedCost: Number(aggSaved.toFixed(4)),
      savedPct: aggSavedPct + "%",
      cacheHitRate: aggHitRate
    }
  };
}

const HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kobayashi // Agent Observability & Telemetry</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
<style>
  :root[data-theme="dark"] {
    --bg-page: #0b0f17;
    --bg-card: #111827;
    --bg-subtle: #1f2937;
    --bg-input: #111827;
    --border: #283548;
    --border-subtle: #1e293b;
    --fg-default: #f3f4f6;
    --fg-muted: #9ca3af;
    --fg-subtle: #6b7280;
    --accent-blue: #3b82f6;
    --accent-green: #10b981;
    --accent-amber: #f59e0b;
    --accent-red: #ef4444;
    --card-active: #1e293b;
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
    --fg-muted: #64748b;
    --fg-subtle: #94a3b8;
    --accent-blue: #2563eb;
    --accent-green: #059669;
    --accent-amber: #d97706;
    --accent-red: #dc2626;
    --card-active: #e2e8f0;
    --chart-grid: rgba(0, 0, 0, 0.06);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; transition: background-color 0.15s, border-color 0.15s; }
  body { background: var(--bg-page); color: var(--fg-default); min-height: 100vh; display: flex; flex-direction: column; }

  /* Header */
  .top-nav { height: 54px; background: var(--bg-card); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
  .nav-left { display: flex; align-items: center; gap: 12px; }
  .brand-title { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-default); }
  .live-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent-green); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 7px; border-radius: 4px; }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-green); }

  .nav-right { display: flex; align-items: center; gap: 10px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-card); color: var(--fg-default); border: 1px solid var(--border); padding: 5px 12px; border-radius: 6px; font-size: 11.5px; font-weight: 600; cursor: pointer; }
  .btn:hover { background: var(--bg-subtle); }
  .btn-theme { font-size: 13px; padding: 5px 9px; }

  /* App Shell 2-Pane Layout */
  .app-shell { display: flex; flex: 1; overflow: hidden; height: calc(100vh - 54px); }

  /* Left Sidebar: Session Explorer */
  .sidebar { width: 340px; background: var(--bg-card); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .sidebar-filter-box { padding: 12px; border-bottom: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px; }
  .search-input { width: 100%; background: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 12px; outline: none; }
  .search-input:focus { border-color: var(--accent-blue); }
  .repo-select { width: 100%; background: var(--bg-input); color: var(--fg-default); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; font-size: 11.5px; font-weight: 600; outline: none; cursor: pointer; }

  .sidebar-list { flex: 1; overflow-y: auto; padding: 6px; }
  .session-card { padding: 10px 12px; border-radius: 6px; border: 1px solid transparent; margin-bottom: 4px; cursor: pointer; transition: all 0.12s ease; }
  .session-card:hover { background: var(--bg-subtle); }
  .session-card.active { background: var(--card-active); border-color: var(--accent-blue); }

  .sc-title { font-size: 12px; font-weight: 600; color: var(--fg-default); line-height: 1.35; margin-bottom: 4px; word-break: break-word; }
  .sc-meta { display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: var(--fg-muted); }
  .sc-badges { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  .mini-badge { font-size: 9.5px; font-weight: 600; padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; }
  .mini-badge.green { color: var(--accent-green); border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08); }
  .mini-badge.blue { color: var(--accent-blue); border-color: rgba(59, 130, 246, 0.35); background: rgba(59, 130, 246, 0.08); }

  /* Right Pane: Telemetry Analytics & Replay */
  .main-content { flex: 1; overflow-y: auto; padding: 20px 24px 60px 24px; }
  
  /* Session Banner */
  .session-header { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .sh-prompt { font-size: 16px; font-weight: 700; color: var(--fg-default); line-height: 1.4; margin-bottom: 4px; }
  .sh-sub { font-size: 11.5px; color: var(--fg-muted); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .sh-sub b { color: var(--fg-default); }

  /* KPI Grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
  .kpi-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .kpi-lbl { font-size: 10.5px; font-weight: 600; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .kpi-val { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: var(--fg-default); letter-spacing: -0.02em; margin-bottom: 2px; }
  .kpi-sub { font-size: 11px; color: var(--fg-subtle); }

  /* Charts Grid */
  .charts-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; margin-bottom: 18px; }
  .chart-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; }
  .cp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; }
  .cp-title { font-size: 12px; font-weight: 700; color: var(--fg-default); text-transform: uppercase; letter-spacing: 0.03em; }
  .cp-meta { font-size: 10.5px; color: var(--fg-muted); font-family: 'JetBrains Mono', monospace; }
  .chart-container { position: relative; width: 100%; height: 210px; }

  /* Trace Accordion Table */
  .trace-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left; }
  thead th { padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--fg-subtle); border-bottom: 1px solid var(--border); }
  tbody tr { border-bottom: 1px solid var(--border-subtle); cursor: pointer; }
  tbody tr:hover { background: var(--bg-subtle); }
  tbody td { padding: 9px 10px; vertical-align: middle; }

  .mono { font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 600; border: 1px solid var(--border); }
  .badge.green { color: var(--accent-green); border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.08); }
  .badge.blue { color: var(--accent-blue); border-color: rgba(59, 130, 246, 0.35); background: rgba(59, 130, 246, 0.08); }
  .badge.amber { color: var(--accent-amber); border-color: rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.08); }

  .trace-details-box { padding: 10px 14px; background: var(--bg-subtle); border-radius: 6px; margin: 6px 0; font-size: 11px; line-height: 1.5; color: var(--fg-muted); }
  .trace-details-box b { color: var(--fg-default); }

  @media (max-width: 1024px) {
    .app-shell { flex-direction: column; height: auto; }
    .sidebar { width: 100%; height: 260px; border-right: none; border-bottom: 1px solid var(--border); }
    .charts-grid { grid-template-columns: 1fr; }
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>

  <!-- Top Navigation Bar -->
  <header class="top-nav">
    <div class="nav-left">
      <div class="brand-title">KOBAYASHI // OBSERVABILITY</div>
      <span class="live-tag"><span class="live-dot"></span> Live Telemetry</span>
    </div>
    <div class="nav-right">
      <button class="btn btn-theme" id="theme-btn" onclick="toggleTheme()" title="Toggle Light / Dark Mode">☀️ Light</button>
      <button class="btn" onclick="exportActiveSession()">📥 Export Audit (.md)</button>
    </div>
  </header>

  <!-- App Shell -->
  <div class="app-shell">
    
    <!-- Left Sidebar: Session Explorer -->
    <aside class="sidebar">
      <div class="sidebar-filter-box">
        <input type="text" class="search-input" id="search-box" placeholder="🔍 Search prompts or tasks..." oninput="onSearchInput()">
        <select class="repo-select" id="repo-filter" onchange="onRepoChange()">
          <option value="all">🌐 All Workspaces</option>
        </select>
      </div>

      <div class="sidebar-list" id="session-cards-box">
        <!-- Rendered by JS -->
      </div>
    </aside>

    <!-- Right Main Area: Selected Session Telemetry & Replay -->
    <main class="main-content">
      
      <!-- Session Context Banner -->
      <section class="session-header" id="session-banner">
        <div>
          <div class="sh-prompt" id="banner-title">Select a session from the left sidebar</div>
          <div class="sh-sub">
            <span>Workspace: <b id="banner-repo">-</b></span>
            <span>Recorded: <b id="banner-time">-</b></span>
            <span>File: <code style="font-family:'JetBrains Mono',monospace;" id="banner-file">-</code></span>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px; font-weight:800; font-family:'JetBrains Mono',monospace; color:var(--accent-green);" id="banner-saved">$0.0000</div>
          <div style="font-size:10px; font-weight:600; color:var(--fg-muted); text-transform:uppercase;">Net Dollars Saved</div>
        </div>
      </section>

      <!-- KPI Metrics Row -->
      <section class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-lbl">Actual Session Spend</div>
          <div class="kpi-val" style="color:var(--accent-blue);" id="kpi-actual">$0.0000</div>
          <div class="kpi-sub" id="kpi-actual-sub">vs $0.0000 Claude Sonnet</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-lbl">Prefix Cache Hit Ratio</div>
          <div class="kpi-val" style="color:var(--accent-green);" id="kpi-cache-pct">0.0%</div>
          <div class="kpi-sub" id="kpi-cache-sub">0 cached reads</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-lbl">Total Tokens Consumed</div>
          <div class="kpi-val" id="kpi-tokens">0</div>
          <div class="kpi-sub" id="kpi-tokens-sub">0 prompt • 0 output</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-lbl">Session Turns & Health</div>
          <div class="kpi-val" style="color:var(--accent-amber);" id="kpi-turns">0 Turns</div>
          <div class="kpi-sub" id="kpi-turns-sub">0 worker offloads</div>
        </div>
      </section>

      <!-- Charts Row: Cache Efficiency Stacked & Cost Curve -->
      <section class="charts-grid">
        <div class="chart-panel">
          <div class="cp-head">
            <span class="cp-title">KV-Cache Hit Ratio & Token Stream</span>
            <span class="cp-meta">Tokens / Turn</span>
          </div>
          <div class="chart-container">
            <canvas id="tokensChart"></canvas>
          </div>
        </div>

        <div class="chart-panel">
          <div class="cp-head">
            <span class="cp-title">Cumulative Cost vs Claude Code</span>
            <span class="cp-meta" id="cost-chart-meta">USD</span>
          </div>
          <div class="chart-container">
            <canvas id="costChart"></canvas>
          </div>
        </div>
      </section>

      <!-- Turn-by-Turn Replay Inspector -->
      <section class="trace-panel">
        <div class="cp-head">
          <span class="cp-title">Turn-by-Turn Execution Replay</span>
          <span class="cp-meta">Click turn row to expand details</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>User Prompt / Task</th>
              <th>Model</th>
              <th>Latency</th>
              <th>Cache Read</th>
              <th>Fresh In</th>
              <th>Out</th>
              <th>Cost ($)</th>
              <th>Tools</th>
            </tr>
          </thead>
          <tbody id="turn-rows">
            <tr><td colspan="10" style="text-align:center; padding:20px; color:var(--fg-subtle);">Select a session to inspect turns</td></tr>
          </tbody>
        </table>
      </section>

    </main>
  </div>

<script>
let globalData = null;
let activeSessionFile = null;
let tokensChartInstance = null;
let costChartInstance = null;

const fNum = (n) => Number(n || 0).toLocaleString();
const fUsd = (n) => "$" + Number(n || 0).toFixed(4);

// Theme Toggle Engine
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
  if (globalData?.sessionDetail) {
    renderCharts(globalData.sessionDetail);
  }
}

function updateThemeButton(theme) {
  const btn = document.getElementById("theme-btn");
  if (btn) btn.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
}

function getChartColors() {
  const isDark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
  return {
    text: isDark ? "#9ca3af" : "#64748b",
    grid: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)",
    bg: isDark ? "#111827" : "#ffffff",
    border: isDark ? "#283548" : "#e2e8f0"
  };
}

function updateRepoDropdown(repos, activeRepo) {
  const sel = document.getElementById("repo-filter");
  let html = '<option value="all">🌐 All Workspaces</option>';
  for (const r of repos) {
    html += '<option value="' + r.key + '"' + (r.key === activeRepo ? ' selected' : '') + '>' + r.name + ' (' + r.count + ')</option>';
  }
  sel.innerHTML = html;
}

function renderSessionCards(sessions, activeFile, searchQuery = "") {
  const box = document.getElementById("session-cards-box");
  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? sessions.filter(s => s.title.toLowerCase().includes(q) || s.repoName.toLowerCase().includes(q) || s.models.some(m => m.toLowerCase().includes(q)))
    : sessions;

  if (filtered.length === 0) {
    box.innerHTML = '<div style="padding:16px; font-size:11.5px; color:var(--fg-subtle); text-align:center;">No sessions match filter</div>';
    return;
  }

  box.innerHTML = filtered.map(s => {
    const isActive = s.fileName === activeFile;
    const modelPills = s.models.map(m => {
      const cls = m.includes("ornith") ? "mini-badge green" : (m.includes("sonnet") ? "mini-badge blue" : "mini-badge");
      return '<span class="' + cls + '">' + m.replace(/^openai\./, "").replace(/^us\.anthropic\./, "") + '</span>';
    }).join(" ");

    return '<div class="session-card' + (isActive ? ' active' : '') + '" onclick="selectSession(\\'' + s.fileName + '\\')">' +
      '<div class="sc-title">' + escapeHtml(s.title) + '</div>' +
      '<div class="sc-meta">' +
        '<span>' + s.repoName + ' • ' + s.turns + ' turns</span>' +
        '<span>' + s.timeAgo + '</span>' +
      '</div>' +
      '<div class="sc-badges">' +
        '<span class="mini-badge green">' + fUsd(s.actualCost) + '</span>' +
        '<span class="mini-badge">' + s.cacheHitRate + ' hit</span>' +
        modelPills +
      '</div>' +
    '</div>';
  }).join("");
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function selectSession(fileName) {
  activeSessionFile = fileName;
  fetchData(document.getElementById("repo-filter").value, fileName);
}

function onSearchInput() {
  if (!globalData) return;
  const q = document.getElementById("search-box").value;
  renderSessionCards(globalData.sessions, activeSessionFile, q);
}

function onRepoChange() {
  const repo = document.getElementById("repo-filter").value;
  activeSessionFile = null;
  fetchData(repo, null);
}

function renderSessionDetail(detail) {
  if (!detail) return;
  const m = detail.meta;

  // Banner
  document.getElementById("banner-title").textContent = m.fullPrompt || m.title || "Interactive Session";
  document.getElementById("banner-repo").textContent = m.repoName;
  document.getElementById("banner-time").textContent = m.dateStr + " (" + m.timeAgo + ")";
  document.getElementById("banner-file").textContent = m.fileName;
  document.getElementById("banner-saved").textContent = fUsd(detail.netSavedUsd);

  // KPIs
  document.getElementById("kpi-actual").textContent = fUsd(detail.actualCostUsd);
  document.getElementById("kpi-actual-sub").textContent = "vs " + fUsd(detail.sonnetCachedUsd) + " Sonnet (" + detail.costMultiplier + "x cheaper)";
  document.getElementById("kpi-cache-pct").textContent = detail.cacheHitPct.toFixed(1) + "%";
  document.getElementById("kpi-cache-sub").textContent = fNum(detail.totalCacheRead) + " cached of " + fNum(detail.totalInput + detail.totalCacheRead + detail.totalCacheWrite) + " prompt";
  document.getElementById("kpi-tokens").textContent = fNum(detail.totalTokens);
  document.getElementById("kpi-tokens-sub").textContent = fNum(detail.totalInput + detail.totalCacheRead + detail.totalCacheWrite) + " in • " + fNum(detail.totalOutput) + " out";
  document.getElementById("kpi-turns").textContent = detail.totalTurns + " Turns";
  document.getElementById("kpi-turns-sub").textContent = detail.delegationCount + " worker offloads • " + detail.bashErrors + " errors";

  renderCharts(detail);
  renderTurnRows(detail.turnAudit || []);
}

function renderCharts(detail) {
  const cc = getChartColors();
  const timeline = detail.timeline || [];

  // 1. Stacked Tokens Chart
  const ctxT = document.getElementById("tokensChart")?.getContext("2d");
  if (ctxT && typeof Chart !== "undefined") {
    if (tokensChartInstance) tokensChartInstance.destroy();
    tokensChartInstance = new Chart(ctxT, {
      type: "bar",
      data: {
        labels: timeline.map(t => "T" + t.turn),
        datasets: [
          { label: "Cached Read ($0.02)", data: timeline.map(t => t.cacheRead), backgroundColor: "#10b981", stack: "s" },
          { label: "Cold Input ($0.22)", data: timeline.map(t => t.input), backgroundColor: "#3b82f6", stack: "s" },
          { label: "Output Generation ($1.32)", data: timeline.map(t => t.output), backgroundColor: "#f59e0b", stack: "s" }
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

  // 2. Cost Trajectory Chart
  const ctxC = document.getElementById("costChart")?.getContext("2d");
  if (ctxC && typeof Chart !== "undefined") {
    if (costChartInstance) costChartInstance.destroy();
    costChartInstance = new Chart(ctxC, {
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

function toggleTurnDetail(idx) {
  const panel = document.getElementById("turn-exp-" + idx);
  if (panel) {
    panel.style.display = panel.style.display === "none" ? "table-row" : "none";
  }
}

function renderTurnRows(turns) {
  const tbody = document.getElementById("turn-rows");
  if (!turns || turns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--fg-subtle);">No turn events recorded</td></tr>';
    return;
  }

  tbody.innerHTML = turns.map((t, idx) => {
    const toolBadges = (t.tools || []).map(tool => {
      let cls = "badge";
      if (tool === "delegate_workhorse") cls += " green";
      else if (tool === "call_advisor") cls += " amber";
      return '<span class="' + cls + '">' + tool + '</span>';
    }).join(" ");

    const expandRow = 
      '<tr id="turn-exp-' + idx + '" style="display:none; background:var(--bg-subtle);">' +
        '<td colspan="10" style="padding:10px 14px;">' +
          '<div class="trace-details-box">' +
            '<div style="margin-bottom:6px;"><b>User Prompt:</b> <i>' + escapeHtml(t.promptExcerpt) + '</i></div>' +
            (t.reasoningSummary ? '<div style="margin-bottom:6px;"><b>Model Thinking Excerpt:</b> <i>' + escapeHtml(t.reasoningSummary) + '...</i></div>' : '') +
            '<div><b>Token Cost Formula:</b> (' + fNum(t.input) + ' cold + ' + fNum(t.cacheRead) + ' cached + ' + fNum(t.output) + ' out) = <b style="color:var(--accent-blue);">' + fUsd(t.actualUsd) + '</b> vs Sonnet: <b style="color:var(--accent-amber);">' + fUsd(t.sonnetUsd) + '</b> (Saved +' + fUsd(t.savedUsd) + ')</div>' +
          '</div>' +
        '</td>' +
      '</tr>';

    return '<tr onclick="toggleTurnDetail(' + idx + ')">' +
      '<td class="mono" style="color:var(--fg-subtle);">#' + t.turnIndex + '</td>' +
      '<td class="mono" style="color:var(--fg-subtle);">' + t.ts + '</td>' +
      '<td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>' + escapeHtml(t.promptExcerpt) + '</b></td>' +
      '<td><span class="badge">' + t.model + '</span></td>' +
      '<td class="mono">' + t.duration + '</td>' +
      '<td class="mono" style="color:var(--accent-green);">' + fNum(t.cacheRead) + ' (' + t.cacheHitRate + ')</td>' +
      '<td class="mono">' + fNum(t.input) + '</td>' +
      '<td class="mono">' + fNum(t.output) + '</td>' +
      '<td class="mono" style="color:var(--accent-blue); font-weight:600;">' + fUsd(t.actualUsd) + '</td>' +
      '<td>' + (toolBadges || '<span style="color:var(--fg-subtle);">chat</span>') + '</td>' +
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

async function fetchData(repo = "all", file = null) {
  try {
    let url = "/api/telemetry?repo=" + encodeURIComponent(repo);
    if (file) url += "&file=" + encodeURIComponent(file);
    const res = await fetch(url);
    const data = await res.json();
    globalData = data;
    activeSessionFile = data.activeSessionFile;

    updateRepoDropdown(data.repos, data.activeRepo);
    renderSessionCards(data.sessions, activeSessionFile, document.getElementById("search-box")?.value || "");
    renderSessionDetail(data.sessionDetail);
  } catch (err) {
    console.error("Failed to load telemetry data", err);
  }
}

initTheme();
fetchData();
setInterval(() => {
  const repo = document.getElementById("repo-filter")?.value || "all";
  fetchData(repo, activeSessionFile);
}, 3000);
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (parsedUrl.pathname === "/api/telemetry") {
    const repo = parsedUrl.searchParams.get("repo") || "all";
    const file = parsedUrl.searchParams.get("file");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getDashboardPayload(repo, file)));
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
  console.log(`\n⚔️ Kobayashi Observability Console live at: http://127.0.0.1:${PORT}`);
});
