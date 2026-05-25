# Claude Code Guidelines — MarketAnalysisAgent

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
- **AI layer**: `analyzer.js` — calls Google Gemini REST API via axios with `HTTPS_PROXY` support
- **PDF layer**: `pdfGenerator.js` — PDFKit, A4, 7 pages
- **Frontend**: `index.html` — single file, vanilla JS, no build step
- **Reports output**: `Reports/` directory (gitignored)

## Environment

- Requires `GOOGLE_API_KEY` in `.env`
- Local proxy (`HTTPS_PROXY` / `HTTP_PROXY`) must be set in `.env` if the machine is behind a proxy — Node.js does NOT auto-read these from the shell when started by Claude Code's preview runner
- Use `dotenv.config({ override: true })` — already in place — so `.env` values always win over shell env

## Key Design Decisions

- **axios over fetch / SDK**: Node.js native fetch (undici) is blocked in the sandbox; axios uses Node's `http` module which respects the proxy config and works correctly.
- **dotenv override:true**: The shell environment pre-sets `ANTHROPIC_API_KEY` and other vars to empty strings; without `override:true` dotenv silently skips them.
- **gemini-2.5-flash-lite model**: Chosen because it has free-tier quota available on this API key. `gemini-2.0-flash` and `gemini-1.5-flash` have exhausted free quota.
