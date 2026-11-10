# Skills Registry & Runbooks Guide 🛠️

> Guide to using the bundled Matt Pocock 38-skill suite, importing existing custom skills on fresh laptops, and zero-bloat BM25 Skill-RAG.

---

## 🏎️ Why Skill-RAG Outperforms Naive Bundling

| Feature | Naive Agent Harness (Claude Code, Pi default) | Kobayashi Maru (BM25 Skill-RAG) |
| :--- | :--- | :--- |
| **Startup Token Cost** | **~28,500 tokens / turn** (Dumps all 38 skills into prompt) | **0 tokens** on greetings; **~150 tokens** on match |
| **Dollar Cost on Cold Start** | ~$0.11 per simple prompt like `"hi"` | **$0.0000** wasted on skills |
| **Matching Speed** | N/A (Brute force text injection) | **$< 2\text{ms}$** in-memory Okapi BM25 ranker |
| **Adding New Skills** | Makes system prompt longer and degrades model attention | Adds $0$ prompt overhead until dynamically queried |
| **Mid-Session Runbooks** | None (Model must remember full instructions from turn 1) | Mid-session `find_skill` meta-tool fetches any runbook |

---

## 📦 The Bundled Matt Pocock 38-Skill Suite

Kobayashi Maru includes the complete 38-skill Matt Pocock engineering suite in `~/.agents/skills/`:

| Category | Skill Name | Slash Trigger | Purpose & When It Is Injected |
| :--- | :--- | :---: | :--- |
| **TDD & Engineering** | `tdd` | `/tdd` | Red-Green-Refactor test cycle. Automatically injected for `"write tests"`, `"test suite"`, `"vitest"`. |
| | `implement` | `/implement` | Standardized implementation workflow following domain boundaries. |
| | `implement-spec` | `/implement-spec` | High-fidelity code generation directly from engineering design specs. |
| | `prototype` | `/prototype` | Rapid prototyping spikes separating UI and core logic layers. |
| | `diagnosing-bugs` | `/diagnosing-bugs` | Structured bug triage and reproducible root-cause analysis loops. |
| **Architecture & Design** | `codebase-design` | `/codebase-design` | Deepening codebases using high-cohesion, low-coupling module boundaries. |
| | `domain-modeling` | `/domain-modeling` | Formulates domain glossaries and Architecture Decision Records (ADRs). |
| | `to-spec` | `/to-spec` | Transforms ambiguous feature requests into rigorous technical specifications. |
| | `to-tickets` | `/to-tickets` | Breaks down large specifications into bite-sized, 100k-token agent tickets. |
| | `improve-codebase-architecture` | `/improve-codebase-architecture` | Generates comprehensive codebase architecture audits and HTML reports. |
| | `setup-ts-deep-modules` | `/setup-ts-deep-modules` | Configures `dependency-cruiser` to enforce deep TypeScript architecture boundaries. |
| **Review & Quality** | `code-review` | `/code-review` | Senior-level code review focusing on correctness, edge cases, and diff minimization. |
| | `git-guardrails-claude-code` | `/git-guardrails` | Intercepts dangerous git actions (`push --force`, `reset --hard`, deleting branches). |
| | `grill-me` | `/grill-me` | Interactive conversational interview grilling the user on design tradeoffs. |
| | `grill-with-docs` | `/grill-with-docs` | Document-grounded architecture interrogation against official reference docs. |
| | `pr` | `/pr` | Generates structured, high-context pull request descriptions and changelogs. |
| | `setup-pre-commit` | `/setup-pre-commit` | Configures Husky, lint-staged, and automated git hooks. |
| **Meta & Navigation** | `ask-matt` | `/ask-matt` | Consults Matt Pocock's software engineering principles and mental models. |
| | `chief-of-staff` | `/chief-of-staff` | High-level engineering roadmap triage and task prioritization. |
| | `wait-what` | `/wait-what` | Cognitive circuit breaker when prompts contain contradictory constraints. |
| | `wayfinder` | `/wayfinder` | Monorepo navigation and structural orientation for newcomers. |
| | `wizard` | `/wizard` | Step-by-step interactive configuration wizard for complex tooling. |
| | `retro` | `/retro` | Team retrospective generator synthesizing project wins and friction points. |

---

## 💻 Fresh Laptop Setup: Importing Existing Skills

When setting up a brand-new laptop, you can import your existing custom skills directly from a Git repository or local folder with 1 command:

```bash
# Import skills from a remote Git repository
kobayashi skills --add https://github.com/myorg/my-agent-skills.git

# Or import from a local folder / cloud drive
kobayashi skills --add ~/Dropbox/agent-skills
```

Or pass it directly during installation:
```bash
./setup.sh --skills-repo https://github.com/myorg/my-agent-skills.git
```

### Why BM25 Never Blows Your Token Budget
- The Okapi BM25 ranker recursively indexes all nested `SKILL.md` files in RAM ($< 2\text{ms}$).
- Your Turn 1 cold-start token count remains **0 tokens**.
- Skills are mounted only when your query or ticket specifically calls for them.

---

## ✍️ Creating a Custom Skill Runbook

Creating a custom skill requires just a folder and a `SKILL.md` file:

```bash
mkdir -p ~/.agents/skills/jira-investigate
```

Create `~/.agents/skills/jira-investigate/SKILL.md`:
```markdown
---
name: jira-investigate
description: "Structured workflow for reading Jira tickets, extracting acceptance criteria, and planning technical execution"
---

# Jira Ticket Investigation Runbook
When investigating a Jira ticket:
1. Fetch ticket details using Jira API or web reader.
2. Outline current behavior, expected behavior, and reproduction steps.
3. Identify affected modules using `repo_map`.
4. Formulate an implementation spec before editing code.
```

The next time you prompt the agent:
```bash
pi "Investigate Jira ticket ONT-51883 and draft an implementation plan"
```
The BM25 indexer will dynamically inject `jira-investigate` for only ~150 tokens.
