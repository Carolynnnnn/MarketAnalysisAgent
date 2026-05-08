# Market Analysis Agent

## Skill Name
Market Analysis Agent

## Description
Generates a structured China market analysis report for any brand or product. Covers five strategic dimensions — pricing, core selling points, sales channels, target audience, and competitive landscape — and produces a downloadable PDF report.

**When to use this skill:** When the user wants to generate and view a China market analysis report for any brand or product, including pricing strategy, core selling points, sales channels, target audience, and competitive landscape.

## Trigger Conditions
- User provides a brand name and asks for a market report or market insights
- User asks to analyze a brand in China's consumer market
- User requests a competitive analysis, pricing overview, or sales channel breakdown for a specific brand
- User asks to generate a PDF report on a brand

## Parameters

| Parameter   | Type   | Required | Description                                      |
|-------------|--------|----------|--------------------------------------------------|
| `brand`     | string | Yes      | The brand or product name to analyze             |

## Workflow

1. **Collect real-time data** — Query the OpenRouter LLM (backed by web-grounded knowledge) with a structured prompt covering all five analysis dimensions for the given brand in China's market.

2. **Structured AI analysis** — The model returns a validated JSON object containing:
   - `sentimentScore` (0–100)
   - `marketTrend` (growing / stable / declining)
   - `strategicInsights` and `recommendations`
   - Five dimensions: D1 Price Analysis, D2 Core Selling Points, D3 Sales Channels, D4 Target Audience, D5 Competitive Landscape — each with a summary, bullet insights, and strategic conclusion.

3. **PDF generation** — PDFKit renders a professional 7-page A4 report (cover, table of contents, one page per dimension) and saves it to the `Reports/` directory.

4. **Return report** — The server responds with a download URL and an inline preview of key metrics, which the UI renders immediately. The user can download the full PDF with one click.

## API Endpoint

```
POST /analyze
Content-Type: application/json

{ "brand": "<brand name>" }
```

**Response:**
```json
{
  "success": true,
  "brand": "Luckin Coffee",
  "downloadUrl": "/download/<filename>.pdf",
  "filename": "<filename>.pdf",
  "preview": {
    "sentimentScore": 68,
    "marketTrend": "growing",
    "strategicInsights": ["..."],
    "recommendations": ["..."],
    "dimensions": [...],
    "priceSummary": "...",
    "competitiveSummary": "..."
  }
}
```

## Environment Variables

| Variable            | Description                              |
|---------------------|------------------------------------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM access       |
| `PORT`              | HTTP port the server listens on (default 3000) |

## Stack
- **Runtime:** Node.js + Express
- **LLM:** OpenRouter API → `openai/gpt-oss-120b:free`
- **PDF:** PDFKit
- **Entry point:** `server.js`
- **Start:** `npm start`
