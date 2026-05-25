# Brand Market Analysis Agent

An AI-powered web application that generates structured China market analysis reports for any brand, complete with a downloadable PDF.

---

## Overview

Enter a brand name, and the agent will:

1. Call the **Google Gemini API** to produce a detailed 5-dimension market analysis in structured JSON
2. Render an **inline preview** with scored metrics directly in the browser
3. Generate a **professional 7-page PDF report** (A4) available for one-click download

---

## Features

| Feature | Details |
|---|---|
| 5-Dimension Analysis | Price, Core Selling Points, Sales Channels, Target Audience, Competitive Landscape |
| Sentiment Score | Weighted composite score (0–100) across 5 sub-dimensions with progress-bar breakdown |
| Market Trend | `growing / stable / declining` verdict backed by 4 explicit indicators with per-indicator rationale |
| **Two-stage brand validation** | Stage A (embedded in analysis) + Stage B (independent lightweight check) — rejects fictional or misspelled brands before generating a report |
| PDF Report | Cover page, Table of Contents, one full page per dimension — generated via PDFKit |
| Live progress UI | Animated step-by-step status bar while the analysis runs |

---

## Tech Stack

- **Runtime**: Node.js + Express 5
- **AI Model**: Google Gemini `gemini-2.5-flash-lite` via REST API (axios)
- **PDF**: PDFKit
- **Frontend**: Vanilla HTML/CSS/JS (single `index.html`)

---

## Project Structure

```
MarketAnalysisAgent/
├── server.js          # Express server — routes, pipeline orchestration
├── analyzer.js        # Gemini API call, prompt, JSON validation
├── pdfGenerator.js    # PDFKit report rendering (cover, TOC, 5 dimension pages)
├── index.html         # Single-page frontend UI
├── .env               # Local secrets (gitignored)
├── .env.example       # Template for required environment variables
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

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | Yes | Google AI Studio API key — get one at [aistudio.google.com](https://aistudio.google.com) |
| `HTTPS_PROXY` | If behind a proxy | e.g. `http://127.0.0.1:7897` |
| `HTTP_PROXY` | If behind a proxy | e.g. `http://127.0.0.1:7897` |
| `PORT` | No | HTTP port (default: `3000`) |

> **Note:** The server uses `dotenv` with `override: true`, so values in `.env` always take precedence over the shell environment.

### 3. Start the server

```bash
npm start
```

Open `http://localhost:3000` in your browser.

---

## Usage

1. Enter a brand name in the input field (e.g. *Luckin Coffee*, *Huawei*, *BYD*)
2. Click **Start Analysis**
3. Wait ~10–30 seconds while the AI runs the analysis and generates the PDF
4. Review the inline preview — Sentiment Score breakdown and Market Trend rationale are shown below the summary
5. Click **Download PDF Report** to save the full 7-page report

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
  "downloadUrl": "/download/20260525 Luckin Coffee Analysis.pdf",
  "filename": "20260525 Luckin Coffee Analysis.pdf",
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
    "strategicInsights": ["...", "...", "..."],
    "recommendations":   ["...", "...", "..."],
    "dimensions": [...],
    "priceSummary": "...",
    "competitiveSummary": "..."
  }
}
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

---

## Brand Validation

Every analysis request passes through a two-stage validation pipeline before a PDF is generated.

### Stage A — Embedded existence check (inside main analysis call)

The Gemini model is asked to self-assess two fields alongside the full analysis:

| Field | Type | Meaning |
|---|---|---|
| `brandExists` | boolean | Whether the model recognises this as a real brand |
| `brandConfidence` | 0–100 | Certainty level: 100 = globally known, 70 = regionally known, <50 = unknown/fictional |
| `brandConfidenceRationale` | string | One-sentence explanation |

**Gate:** if `brandExists === false` OR `brandConfidence < 70` → request is rejected immediately with HTTP 404. Stage B is skipped (no extra API call).

### Stage B — Independent lightweight verification (only runs if A passes)

A separate, minimal Gemini call asks a single yes/no question:

> *"Is this brand a real, verifiable company with documented revenue, retail presence, or media coverage?"*

Returns `{ "verified": true/false, "reason": "..." }`. If `verified === false` → rejected with HTTP 404.

### UI behaviour on rejection

The status bar shows a clear message: `⚠️ Brand not recognised: "...". Please check the spelling or try a different brand.` The message auto-dismisses after 6 seconds.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `GOOGLE_API_KEY is not set` | `.env` not created or not loaded | Create `.env` from `.env.example` |
| `429 Quota exceeded` | Free-tier rate limit hit | Wait 60 s and retry, or upgrade API plan |
| `TLS connection failed` | Behind a proxy | Set `HTTPS_PROXY` and `HTTP_PROXY` in `.env` |
| `Model response could not be parsed as JSON` | Model returned markdown fences | Transient — retry; the prompt instructs plain JSON output |
