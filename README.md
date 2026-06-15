# Brand Market Analysis Agent

An AI-powered web application that generates structured global market analysis reports for any brand, complete with a downloadable PDF.

---

## Overview

Enter a brand name, and the agent will:

1. Call the **Anthropic Claude API** to produce a detailed 5-dimension market analysis in structured JSON
2. Validate the brand through a two-stage existence check before generating any report
3. Audit the analysis for vague language and missing specifics (Stage C quality check)
4. Generate a **References section** (Stage D) — each key claim is matched to a named source with URL, source type, and reliability rating
5. Render an **inline preview** with scored metrics, quality badge, issue list, and references in the browser
6. Generate a **professional 8-page PDF report** (A4) available for one-click download

---

## Features

| Feature | Details |
|---|---|
| **Global market analysis** | Analysis adapts to the brand's actual primary market(s) — not locked to China; works for US, EU, SE Asia, etc. |
| **Company name autocomplete** | Search bar shows up to 6 real company suggestions as you type; click to instantly launch analysis |
| 5-Dimension Analysis | Price, Core Selling Points, Sales Channels, Target Audience, Competitive Landscape — each with 8+ tagged insights |
| **Extended Thinking (Stage A)** | `claude-sonnet-4-6` runs with up to 8,000 thinking tokens before generating the analysis JSON, producing deeper and more consistent insights |
| Sentiment Score | Weighted composite score (0–100) across 5 sub-dimensions with progress-bar breakdown |
| Market Trend | `growing / stable / declining` verdict backed by 4 explicit indicators with per-indicator rationale |
| **Two-stage brand validation** | Stage A (embedded in analysis) + Stage B (independent lightweight check) — rejects fictional or misspelled brands before generating a report |
| **Data quality audit (Stage C)** | Independent Claude call audits the analysis for vague language, missing specifics, and potentially fabricated figures — score shown in UI with per-issue breakdown |
| **References & Source Verification (Stage D)** | Claude Haiku maps each key claim to a named source (official IR, industry report, regulatory database, etc.) with a URL, source type badge, and reliability rating (`high / medium / low`). Shown in UI and as a dedicated PDF page. |
| PDF Report | Cover page, Table of Contents, five dimension pages, References page — generated via PDFKit |
| Live progress UI | Animated step-by-step status bar while the analysis runs |
| **Simple deployment** | One `ANTHROPIC_API_KEY` in `.env` — configure once, deploy anywhere |

---

## Tech Stack

- **Runtime**: Node.js + Express 5
- **AI Model**: Anthropic Claude (`claude-sonnet-4-6` + Extended Thinking for analysis, `claude-haiku-4-5-20251001` for verification/audit/suggestions) via REST API (axios)
- **PDF**: PDFKit
- **Frontend**: Vanilla HTML/CSS/JS (single `index.html`)

---

## Project Structure

```
MarketAnalysisAgent/
├── server.js          # Express server — routes, pipeline orchestration
├── analyzer.js        # Anthropic API calls, prompt, JSON validation
├── pdfGenerator.js    # PDFKit report rendering (cover, TOC, 5 dimension pages)
├── index.html         # Single-page frontend UI (includes API key panel)
├── .env               # Local config (gitignored) — proxy settings only
├── .env.example       # Template for environment variables
├── Reports/           # Generated PDFs (gitignored)
└── package.json
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Carolynnnnn/MarketAnalysisAgent.git
cd MarketAnalysisAgent
npm install
```

### 2. Configure environment variables (optional)

Only needed if running behind a proxy. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com) |
| `HTTPS_PROXY` | If behind a proxy | e.g. `http://127.0.0.1:7897` |
| `HTTP_PROXY` | If behind a proxy | e.g. `http://127.0.0.1:7897` |
| `PORT` | No | HTTP port (default: `3000`) |

> `.env` is gitignored and never committed. When distributing the project, share only `.env.example` — each deployer fills in their own key.

### 3. Start the server

```bash
npm start
```

Open `http://localhost:3000` in your browser.

---

## Usage

1. Start typing a brand name — a dropdown of up to 6 matching company suggestions will appear; click one to auto-fill and start analysis immediately
2. Or type the full name manually and click **Start Analysis**
4. Wait ~30–90 seconds while Claude runs the 4-stage pipeline and generates the PDF
5. Review the inline preview — Sentiment Score breakdown, Market Trend rationale, Data Quality Audit, and References are shown below the summary
6. Click **Download PDF Report** to save the full 8-page report

---

## Scoring Methodology

### Sentiment Score (0–100)

A weighted composite of five sub-dimensions:

| Dimension | Weight | What is measured |
|---|---|---|
| Consumer Reputation | 30% | Social media sentiment, user ratings, complaint rate, NPS |
| Market Performance | 25% | Revenue growth rate, market share trend, store expansion speed |
| Brand Awareness | 20% | Aided/unaided awareness, brand prestige, media coverage |
| Price Competitiveness | 15% | Perceived value-for-money vs. key competitors |
| Channel Coverage | 10% | Breadth of online + offline distribution footprint |

**Formula:** `sentimentScore = round(D1×0.30 + D2×0.25 + D3×0.20 + D4×0.15 + D5×0.10)`

Score anchors:

| Range | Meaning |
|---|---|
| 90–100 | Industry leader, overwhelmingly positive |
| 70–89 | Strong brand with minor weaknesses |
| 50–69 | Mixed sentiment, notable risks |
| 30–49 | Significant challenges, negative trend |
| 0–29 | Severe crisis or market exit risk |

---

### Market Trend (`growing / stable / declining`)

Determined by majority vote across four indicators:

| Indicator | Growing | Stable | Declining |
|---|---|---|---|
| Revenue / GMV growth (YoY) | > 10% | −5% to +10% | < −5% |
| Store / SKU expansion | Net new locations or SKUs | Flat footprint | Store closures or SKU cuts |
| Market share trajectory | Gaining vs. top 3 competitors | Roughly flat | Losing |
| Consumer demand signals | Clear upward trend (search, social, app downloads) | Flat | Clear downward trend |

> If data is insufficient for an indicator, it is noted in the rationale and the remaining indicators are weighted equally.

---

## API Reference

### `POST /analyze`

Run a full analysis pipeline for a brand.

**Request body:**
```json
{ "brand": "Luckin Coffee" }
```

**Success response:**
```json
{
  "success": true,
  "brand": "Luckin Coffee",
  "downloadUrl": "/download/20260526 Luckin Coffee Analysis.pdf",
  "filename": "20260526 Luckin Coffee Analysis.pdf",
  "preview": {
    "sentimentScore": 78,
    "sentimentBreakdown": {
      "consumerReputation":   { "score": 75, "weight": 0.30, "rationale": "..." },
      "marketPerformance":    { "score": 90, "weight": 0.25, "rationale": "..." },
      "brandAwareness":       { "score": 85, "weight": 0.20, "rationale": "..." },
      "priceCompetitiveness": { "score": 80, "weight": 0.15, "rationale": "..." },
      "channelCoverage":      { "score": 80, "weight": 0.10, "rationale": "..." }
    },
    "marketTrend": "growing",
    "marketTrendRationale": {
      "revenueGrowth":    "...",
      "expansionSignals": "...",
      "marketShare":      "...",
      "demandSignals":    "...",
      "verdict":          "..."
    },
    "qualityReport": {
      "qualityScore": 92,
      "passed": true,
      "issueCount": 1,
      "issues": [...],
      "summary": "..."
    },
    "referencesData": {
      "references": [
        {
          "id": "R01",
          "dimension": "D1",
          "claimExcerpt": "...",
          "source": "Organisation — Report Title",
          "url": "https://...",
          "sourceType": "official_ir|industry_report|regulatory|platform_data|news_media|estimated",
          "reliability": "high|medium|low",
          "needsVerification": false
        }
      ],
      "disclaimer": "..."
    },
    "strategicInsights": ["...", "...", "..."],
    "recommendations":   ["...", "...", "..."],
    "dimensions": [...],
    "priceSummary": "...",
    "competitiveSummary": "..."
  }
}
```

**Error responses:**

| HTTP | Condition | Body fields |
|---|---|---|
| 400 | Missing brand name | `{ success: false, error: "…" }` |
| 404 | Brand not recognised | `{ success: false, brandNotFound: true, error: "…" }` |
| 502 | Claude API / network error | `{ success: false, error: "…" }` |

### `GET /api/suggest?q=<query>`

Return up to 6 real company/brand name suggestions matching the query string (min 2 chars). Powered by Claude Haiku.

**Response:**
```json
{ "suggestions": ["Apple Inc.", "Apple Bank", "Applebee's"] }
```

### `GET /download/:filename`

Stream a previously generated PDF report to the browser.

---

## PDF Report Structure

| Page | Content |
|---|---|
| 1 | Cover — brand name, sentiment score card, market trend card, top 3 recommendations |
| 2 | Table of Contents + Executive Summary |
| 3 | Dimension 1: Price Analysis |
| 4 | Dimension 2: Core Selling Points |
| 5 | Dimension 3: Sales Channels |
| 6 | Dimension 4: Target Audience |
| 7 | Dimension 5: Competitive Landscape |
| 8 | References & Source Verification — claim-to-source mapping with reliability ratings and URLs |

---

## Brand Validation

Every analysis request passes through a two-stage validation pipeline before a PDF is generated.

### Stage A — Embedded existence check (inside main analysis call)

Claude is asked to self-assess two fields alongside the full analysis:

| Field | Type | Meaning |
|---|---|---|
| `brandExists` | boolean | Whether the model recognises this as a real brand |
| `brandConfidence` | 0–100 | Certainty level: 100 = globally known, 70 = regionally known, <50 = unknown/fictional |
| `brandConfidenceRationale` | string | One-sentence explanation |

**Gate:** if `brandExists === false` OR `brandConfidence < 70` → request is rejected immediately with HTTP 404. Stage B is skipped.

### Stage B — Independent lightweight verification (only runs if A passes)

A separate, minimal Claude Haiku call asks a single yes/no question:

> *"Is this brand a real, verifiable company with documented revenue, retail presence, or media coverage?"*

Returns `{ "verified": true/false, "reason": "..." }`. If `verified === false` → rejected with HTTP 404.

### UI behaviour on rejection

The status bar shows a clear message: `⚠️ Brand not recognised: "...". Please check the spelling or try a different brand.` The message auto-dismisses after 6 seconds.

---

## Data Quality Audit (Stage C)

After brand validation passes, a third Claude Haiku call audits the generated analysis for data quality.

### What is checked

| Issue type | Meaning |
|---|---|
| `VAGUE_LANGUAGE` | Words like "many / various / several / significant" used without a specific number |
| `MISSING_SPECIFICS` | Claims with no year, %, ¥ figure, or named entity |
| `FABRICATED` | Numbers that appear invented or implausibly precise |

A server-side regex pre-scan also flags common vague words before the AI audit, so obvious issues are caught even if the AI misses them.

### Quality score

| Range | Meaning |
|---|---|
| 90–100 | All claims are specific and verifiable — green ✓ |
| 70–89 | Mostly specific with minor gaps — yellow ⚠ |
| Below 70 | Pervasive vagueness or missing data — pipeline retries once |

### Retry behaviour

If the first analysis scores below 70, the pipeline automatically retries Stage A with targeted feedback: it lists the exact failing excerpts and instructs the model to fix them. The retry result is used for both the preview and the PDF.

### Graceful degradation

If the audit API call itself fails, the analysis and PDF are still returned. The quality section in the UI shows a blue `?` badge and an "Audit unavailable" message — the report is not blocked.

---

## References & Source Verification (Stage D)

After the quality audit, a fourth Claude Haiku call maps the most important claims in the analysis to named, publicly available sources.

### What each reference contains

| Field | Description |
|---|---|
| `id` | Sequential reference ID (R01, R02, …) |
| `dimension` | Which analysis dimension the claim belongs to (D1–D5 or `general`) |
| `claimExcerpt` | First 120 characters of the original claim |
| `source` | Organisation name and report/page title |
| `url` | Best known URL for that source |
| `sourceType` | Category: `official_ir`, `industry_report`, `regulatory`, `platform_data`, `news_media`, or `estimated` |
| `reliability` | `high` (official/regulatory), `medium` (industry research/media), or `low` (estimate) |
| `needsVerification` | `true` if the URL is not fully confirmed as currently live |

### Source types

| Type | Examples |
|---|---|
| `official_ir` | Brand investor-relations pages, official press releases |
| `industry_report` | iResearch, Euromonitor, Nielsen, Frost & Sullivan, QuestMobile |
| `regulatory` | SAMR, NMPA, NBS (stats.gov.cn), customs.gov.cn |
| `platform_data` | Tmall, JD.com, Douyin, Pinduoduo official data releases |
| `news_media` | Caixin, 36kr, Reuters, Bloomberg, WSJ |
| `estimated` | No retrievable source — AI training-knowledge inference |

### Disclaimer

All references are generated by AI from training data. URLs and source details **must be independently verified** before citation in any research, report, or publication. References are a starting point for human verification, not a substitute for it.

### Graceful degradation

If Stage D fails, the analysis and PDF are still returned. The References section in the UI and PDF shows an "unavailable" message — the report is not blocked.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ANTHROPIC_API_KEY is not set` | `.env` not created or key missing | Copy `.env.example` to `.env` and add your key |
| `AI analysis failed: 401` | API key is wrong or expired | Check your key at [console.anthropic.com](https://console.anthropic.com) |
| `429 Rate limit` | Too many requests | The server retries automatically (up to 3×); if it persists, wait 60 s |
| `TLS connection failed` | Behind a proxy | Set `HTTPS_PROXY` and `HTTP_PROXY` in `.env` |
| `Model response could not be parsed as JSON` | Transient model output issue | Retry the request |
