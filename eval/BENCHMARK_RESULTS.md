# Kobayashi Agent Harness: Enterprise Token Efficiency & Cost Benchmark

> **Evaluation Methodology:** Sandboxed multi-task benchmarking across algorithm design, declarative DevOps pipeline repair, high-volume observability triage, and distributed concurrency failure recovery. Designed to evaluate the architectural impact of the agent harness layer vs direct frontier LLM usage.

## 1. Executive Summary: Head-to-Head Comparison

| Agent Harness Profile | Total Cost (4 Tasks) | Cost Reduction vs Claude Code | Avg Turns / Task | Cache Hit Rate | Task Accuracy | Avg Latency |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Claude Code (Direct Anthropic Baseline) | $0.9963 | - | 8.0 | 0.0% | 98% | 56.1s |
| Vanilla Pi Coding Agent | $0.7764 | **-22.1%** | 6.8 | 31.3% | 98% | 42.6s |
| DeepSeek Harness (DSH V4 Pro) | $0.2248 | **-77.4%** | 5.3 | 43.5% | 100% | 32.7s |
| Kobayashi Multi-Tier Harness | **$0.0455** | **-95.4%** | 3.5 | 66.3% | 100% | 14.3s |

> [!IMPORTANT]
> **Key Takeaway:** Kobayashi achieved an **95.4% overall cost reduction** ($0.0455 vs $0.9963) while simultaneously maintaining a **100% task completion accuracy** and reducing wall-clock latency by **63%**.

## 2. Token Breakdown by Architectural Layer

| Agent Profile | Prompt Tokens | Cache Write Tokens | Cache Read Tokens | Output Tokens | Total Tokens |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Claude Code (Direct Anthropic Baseline) | 2,77,750 | 0 | 0 | 10,870 | **2,88,620** |
| Vanilla Pi Coding Agent | 1,92,700 | 37,600 | 87,600 | 8,970 | **3,26,870** |
| DeepSeek Harness (DSH V4 Pro) | 1,07,000 | 19,600 | 82,500 | 6,980 | **2,16,080** |
| Kobayashi Multi-Tier Harness | 25,800 | 6,500 | 50,700 | 4,930 | **87,930** |

## 3. Deep-Dive Task Results

### Architecture: Distributed Redlock Split-Brain & Clock Drift Race Condition (`task-concurrency-04`)
* **Target Tier**: `advisor`
* **Complexity**: `expert` (staff-architect)
* **Description**: Diagnose an intermittent split-brain condition in a multi-region Redis Redlock implementation where process pauses and NTP clock drift allow two workers to acquire lock leases simultaneously during failover.

| Agent | Turns | Input / Cache Read | Output | Cost ($) | Acc | Time | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Claude | 11 | 82,000 / 0 | 4600 | $0.3150 | 90% | 89.5s | Repeated hallucinated lock renewal loops before reaching correct fencing token solution. |
| Vanilla | 9 | 58,000 / 28,000 | 3800 | $0.2394 | 90% | 64.2s | - |
| DeepSeek | 7 | 34,000 / 26,000 | 2800 | $0.0728 | 100% | 48s | - |
| Kobayashi | 4 | 7,200 / 16,400 | 1850 | $0.0381 | 100% | 21.4s | Turn 1-2 run on Luna. After 2 consecutive test failures, Circuit Breaker automatically triggered stateless call_advisor (Claude Sonnet 5.5). Sonnet provided monotonic fencing tokens in a 520-token distilled response. Cost: $0.038 vs $0.315 (87.9% savings). |

### DSA: Sliding Window Rate Limiter with Monotonic Queue (`task-dsa-01`)
* **Target Tier**: `workhorse`
* **Complexity**: `medium` (leetcode-hard)
* **Description**: Implement a thread-safe sliding window rate limiter in TypeScript that processes up to 100,000 requests per second with strict O(1) amortized time complexity and O(K) space complexity. Must pass unit tests verifying rate enforcement, window expiry, and burst handling.

| Agent | Turns | Input / Cache Read | Output | Cost ($) | Acc | Time | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Claude | 6 | 18,450 / 0 | 1280 | $0.0746 | 100% | 22.4s | - |
| Vanilla | 5 | 12,200 / 4,800 | 940 | $0.0521 | 100% | 18.2s | - |
| DeepSeek | 4 | 8,400 / 6,200 | 820 | $0.0184 | 100% | 15.6s | - |
| Kobayashi | 3 | 4,200 / 3,100 | 710 | $0.0000 | 100% | 8.9s | 100% routed to Local Workhorse (Ornith 1.5). Action-fusion collapsed test edit and run into 1 turn. Zero cloud cost. |

### Observability: HyperDX 2,500-Line Log Memory Leak Root Cause Triage (`task-triage-03`)
* **Target Tier**: `orchestrator`
* **Complexity**: `high` (production-incident)
* **Description**: Analyze a high-volume 2,500-line JSON log stream exported from HyperDX / OpenTelemetry. Identify a silent connection pool leak where gRPC keepalive timeouts cause thread exhaustion in microservice auth workers under burst traffic.

| Agent | Turns | Input / Cache Read | Output | Cost ($) | Acc | Time | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Claude | 7 | 1,42,500 / 0 | 2840 | $0.4701 | 100% | 68.4s | Token-maxing trap: Claude Code dumps entire 2,500 raw log lines directly into prompt each turn without log filtering. |
| Vanilla | 6 | 98,400 / 42,000 | 2410 | $0.3815 | 100% | 52.1s | - |
| DeepSeek | 5 | 48,200 / 36,100 | 1950 | $0.0982 | 100% | 39.7s | - |
| Kobayashi | 3 | 4,600 / 12,800 | 1220 | $0.0029 | 100% | 12.3s | SoL-Pi observation pack stripped 97.4% of repetitive JSON log noise. Spill store offloaded raw dumps to disk. 99.4% cost savings vs Claude Code. |

### DevOps: Broken Multi-Branch Jenkins Declarative Pipeline Repair (`task-devops-02`)
* **Target Tier**: `orchestrator`
* **Complexity**: `high` (enterprise-devops)
* **Description**: Fix a corrupted declarative Jenkinsfile pipeline failing due to Docker-in-Docker socket mounting permission denied, broken post-action notification closures, and parallel matrix agent workspace collisions in Kubernetes agent pods.

| Agent | Turns | Input / Cache Read | Output | Cost ($) | Acc | Time | Notes |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| Claude | 8 | 34,800 / 0 | 2150 | $0.1366 | 100% | 44.2s | - |
| Vanilla | 7 | 24,100 / 12,800 | 1820 | $0.1034 | 100% | 36.1s | - |
| DeepSeek | 5 | 16,400 / 14,200 | 1410 | $0.0354 | 100% | 27.5s | - |
| Kobayashi | 4 | 9,800 / 18,400 | 1150 | $0.0045 | 100% | 14.8s | Routed to Bedrock Mantle GPT-5.6 Luna Cached Orchestrator. 95% prompt cache hit on Jenkins schema; SoL-Pi observation pack stripped Groovy stack trace noise. |

## 4. Why the Harness Layer Matters (Architectural Analysis)

### 1. Dynamic 3-Tier Model Routing (Zero Waste)
In standard agent workflows (e.g. Claude Code), 100% of turns are executed on frontier reasoning models ($3/input, $15/output per 1M tokens), even for routine file reads, ripgrep queries, and boilerplate unit test generation. Kobayashi routes 85% of execution turns to a free local workhorse (`ornith-1.5:ctx` on Apple Silicon / Ollama), reserving the cached orchestrator (`openai.gpt-5.6-luna` at $0.02 cache read) for planning and escalating to Claude Sonnet 5.5 only when circuit breakers trip.

### 2. NVIDIA SoL-Pi Observation Packing (97% Noise Reduction)
Observability logs, compiler traces, and test outputs frequently dump thousands of repetitive lines. In the HyperDX log triage benchmark, Claude Code consumed 142,500 input tokens reading raw JSON lines ($0.47 per run). Kobayashi's SoL-Pi observation pack filtered 97.4% of repetitive noise into distilled anomalies, slashing input tokens to 4,600 and cost to $0.0028 (a 99.4% savings on that task).

### 3. Dynamic Progressive Skill Disclosure (Zero Startup Bloat)
Rather than dumping full markdown schemas and instructions for all 27+ skills into Turn 1 system prompts (wasting 1,730+ tokens on every turn), Kobayashi indexes skills by keyword intent and injects only the active skill when triggered (e.g., `/to-spec` adds only 46 tokens).

### 4. Circuit Breakers & Stateless Escalation
When an agent encounters a difficult concurrency bug, naive agents enter a "token-burning hallucination loop" (attempting minor edits repeatedly). Kobayashi monitors bash/test return codes. Upon 2 consecutive failures, it triggers `call_advisor`, sending an isolated 500-token problem summary to Claude Sonnet 5.5 rather than re-transmitting the entire 30,000+ token context.
