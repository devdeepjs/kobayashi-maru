# Contributing to Kobayashi Maru (小林丸) 🤝

Thank you for your interest in contributing to **Kobayashi Maru**! Our goal is to build the most token-efficient, zero-waste autonomous engineering runtime for modern AI software development.

---

## 🛠️ Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/devdeepjs/kobayashi-maru.git
   cd kobayashi-maru
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run automated checks**:
   ```bash
   npm run typecheck    # Validate TypeScript types
   npm test             # Run Okapi BM25 ranking unit tests
   bash -n setup.sh     # Verify setup bash script syntax
   ```

---

## 📐 Architecture Guidelines

When adding extensions, skills, or features:
1. **Zero Cold-Start Bloat**: Never add static text dumps to the turn-1 system prompt. All skills and tools must be dynamically indexed via BM25 or gated behind query intent.
2. **Minimal Toolloadout**: Adhere to DeepSeek's Minimal Seam (`read`, `bash`, `edit`, `write`, `codemode`). Avoid adding passive meta-tools that create decision noise for smaller models.
3. **Local-First Fallback**: Always provide a path for grunt work to execute locally in RAM on Ollama at $0.00 compute.
4. **No Secrets or Credentials**: Never log, store, or commit sensitive API keys, session tokens, or proprietary paths.

---

## 🚀 Submitting Pull Requests

1. Fork the repo and create your branch from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Ensure all tests and typechecks pass:
   ```bash
   npm test && npm run typecheck
   ```
3. Commit your changes with clear, semantic commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
4. Open a Pull Request on GitHub.
