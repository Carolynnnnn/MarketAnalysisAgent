# Claude Code Guidelines — MarketAnalysisAgent

## Git Workflow

All new work must go on a **feature branch**, never directly on `master`.

**Branch naming:** `feat/<short-description>` (e.g. `feat/pdf-layout-fix`, `feat/autocomplete`)

**Workflow:**
1. `git checkout -b feat/<name>` before starting any new task
2. Commit on the feature branch; keep commits focused
3. When the task is done, open a PR from `feat/<name>` → `master` via `gh pr create`
4. Merge only after PR is created (squash or merge commit — either is fine for this repo)

This rule applies to every change regardless of size.

---

## README Maintenance Rule

**Every time you modify any of the files below, you MUST update `README.md` accordingly before committing:**

| File changed | README sections to review |
|---|---|
| `analyzer.js` — model, prompt, scoring rubric, new fields | Scoring Methodology, API Reference, Tech Stack |
| `pdfGenerator.js` — page layout, new pages/sections | PDF Report Structure |
| `server.js` — new routes, response shape changes | API Reference |
| `index.html` — new UI features or sections | Features, Usage |
| `.env.example` — new environment variables | Setup → Environment Variables, Troubleshooting |
| `package.json` — dependency changes | Tech Stack |

This rule exists so that `README.md` always reflects the actual state of the project and never goes stale.

## Project Overview

- **Entry point**: `server.js` (run with `npm start`)
- **AI layer**: `analyzer.js` — calls Anthropic Claude API via axios with `HTTPS_PROXY` support
- **PDF layer**: `pdfGenerator.js` — PDFKit, A4, auto-paginating
- **Frontend**: `index.html` — single file, vanilla JS, no build step
- **Reports output**: `Reports/` directory (gitignored)

## Environment

- Requires `ANTHROPIC_API_KEY` in `.env`
- Local proxy (`HTTPS_PROXY` / `HTTP_PROXY`) must be set in `.env` if the machine is behind a proxy — Node.js does NOT auto-read these from the shell when started by Claude Code's preview runner
- Use `dotenv.config({ override: true })` — already in place — so `.env` values always win over shell env

## Key Design Decisions

- **axios over fetch / SDK**: Node.js native fetch (undici) is blocked in the sandbox; axios uses Node's `http` module which respects the proxy config and works correctly.
- **dotenv override:true**: The shell environment pre-sets env vars to empty strings; without `override:true` dotenv silently skips them.
- **Server-side API key**: `ANTHROPIC_API_KEY` lives in `.env` (gitignored). Each deployer configures their own. The `.env.example` ships without a key so users know what to fill in.
- **Two Claude models**: `claude-sonnet-4-6` + Extended Thinking (budget 4000 tokens) for Stage A; `claude-haiku-4-5-20251001` for Stages B, C+D, and autocomplete suggestions.
- **429/529 auto-retry in callClaude**: Anthropic rate-limit and overload errors are retried up to 3×, waiting on the `retry-after` header before each attempt.
- **InvalidApiKeyError**: 401/403 from Anthropic is surfaced as a distinct error class so the server returns HTTP 401 and the UI clears the bad key from localStorage automatically.
- **Global market scope**: Stage A identifies `primaryMarket` per brand; all five analysis dimensions adapt to that market — not locked to China.
- **Prompt caching**: the large static template blocks in Stage A and Stage C+D carry `cache_control: ephemeral`, reducing input cost on repeated / retry calls.
