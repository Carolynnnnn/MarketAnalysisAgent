'use strict';

require('dotenv').config({ override: true });
const axios = require('axios');

const MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `\
You are a senior market analyst specializing in China's consumer market.
Use your knowledge to provide accurate, detailed information about the brand.

RESEARCH INSTRUCTIONS:
- Cover each of the 5 analysis dimensions thoroughly using your knowledge of China's market.
- Prefer recent data (2023–2025) where available. Cite specific figures, platform names, and competitor names.
- Do not fabricate data. If a figure is unavailable, state that clearly in the relevant field.

OUTPUT INSTRUCTIONS:
- Output ONLY a single valid JSON object. No other text.
- Do not wrap the JSON in markdown code fences.
- Do not include any text before or after the JSON object.
- The JSON must exactly match the schema described in the user message.`;

// ─── User prompt ─────────────────────────────────────────────────────────────
function buildPrompt(brandName) {
  return `\
Analyze the brand "${brandName}" in China's consumer market.
Cover each of the following 5 dimensions thoroughly.

DIMENSIONS TO COVER:
1. Price Analysis       — current pricing tiers, price perception, value positioning in China
2. Core Selling Points  — key product features, USPs, innovation, brand identity
3. Sales Channels       — online platforms (Tmall, JD, Douyin, Pinduoduo), offline retail, distribution model
4. Target Audience      — consumer demographics, psychographics, key user segments in China
5. Competitive Landscape — main competitors, estimated market share, advantages and strategic threats

SENTIMENT SCORE RUBRIC (0–100):
Calculate sentimentScore as a weighted composite of the following 5 dimensions.
Score each dimension 0–100 first, then apply the weights below:

  1. Consumer Reputation (30%) — social media sentiment, user ratings, complaint rate, NPS
  2. Market Performance   (25%) — revenue growth rate, market share trend, store expansion speed
  3. Brand Awareness      (20%) — aided/unaided awareness, brand prestige, media coverage
  4. Price Competitiveness(15%) — perceived value-for-money vs. key competitors
  5. Channel Coverage     (10%) — breadth of online + offline distribution footprint

Formula: sentimentScore = round(D1×0.30 + D2×0.25 + D3×0.20 + D4×0.15 + D5×0.10)
Also include the sub-scores in the "sentimentBreakdown" field (see schema).

Score anchors:
  90–100 = industry leader, overwhelmingly positive
  70–89  = strong brand with minor weaknesses
  50–69  = mixed sentiment, notable risks
  30–49  = significant challenges, negative trend
  0–29   = severe crisis or market exit risk

MARKET TREND RUBRIC:
Determine marketTrend based on the following four indicators. Evaluate each, then pick the trend:

  1. Revenue / GMV growth (most recent full year vs. prior year)
     — >10% YoY growth      → supports "growing"
     — -5% to +10%          → supports "stable"
     — <-5% YoY decline     → supports "declining"

  2. Store / SKU expansion
     — Net new locations or product lines added → supports "growing"
     — Flat footprint                           → supports "stable"
     — Store closures or SKU cuts               → supports "declining"

  3. Market share trajectory (vs. top 3 competitors)
     — Share gaining          → supports "growing"
     — Share roughly flat     → supports "stable"
     — Share losing           → supports "declining"

  4. Consumer demand signals (search index, social buzz, app downloads)
     — Clear upward trend     → supports "growing"
     — Flat                   → supports "stable"
     — Clear downward trend   → supports "declining"

Decision rule: majority of the 4 indicators determines the trend.
If data is insufficient for an indicator, note it in marketTrendRationale and weight the remaining ones equally.

Return ONLY this JSON object. No markdown fences, no extra text, no explanation:

{
  "brand": "${brandName}",
  "analysisTimestamp": "<ISO 8601 datetime>",
  "sentimentScore": <weighted composite integer 0-100>,
  "sentimentBreakdown": {
    "consumerReputation":    { "score": <0-100>, "weight": 0.30, "rationale": "<1 sentence>" },
    "marketPerformance":     { "score": <0-100>, "weight": 0.25, "rationale": "<1 sentence>" },
    "brandAwareness":        { "score": <0-100>, "weight": 0.20, "rationale": "<1 sentence>" },
    "priceCompetitiveness":  { "score": <0-100>, "weight": 0.15, "rationale": "<1 sentence>" },
    "channelCoverage":       { "score": <0-100>, "weight": 0.10, "rationale": "<1 sentence>" }
  },
  "marketTrend": "<growing | stable | declining>",
  "marketTrendRationale": {
    "revenueGrowth":     "<indicator assessment + data point>",
    "expansionSignals":  "<indicator assessment + data point>",
    "marketShare":       "<indicator assessment + data point>",
    "demandSignals":     "<indicator assessment + data point>",
    "verdict":           "<1 sentence summary of why this trend was chosen>"
  },
  "strategicInsights": ["<insight>", "<insight>", "<insight>"],
  "recommendations": ["<recommendation>", "<recommendation>", "<recommendation>"],
  "dimensions": [
    {
      "id": "D1",
      "title": "Price Analysis",
      "summary": "<2-3 sentence overview>",
      "insights": ["<bullet insight>", "<bullet insight>", "<bullet insight>"],
      "conclusion": "<1 sentence strategic takeaway>"
    },
    {
      "id": "D2",
      "title": "Core Selling Points",
      "summary": "<2-3 sentence overview>",
      "insights": ["<bullet insight>", "<bullet insight>", "<bullet insight>"],
      "conclusion": "<1 sentence strategic takeaway>"
    },
    {
      "id": "D3",
      "title": "Sales Channels",
      "summary": "<2-3 sentence overview>",
      "insights": ["<bullet insight>", "<bullet insight>", "<bullet insight>"],
      "conclusion": "<1 sentence strategic takeaway>"
    },
    {
      "id": "D4",
      "title": "Target Audience",
      "summary": "<2-3 sentence overview>",
      "insights": ["<bullet insight>", "<bullet insight>", "<bullet insight>"],
      "conclusion": "<1 sentence strategic takeaway>"
    },
    {
      "id": "D5",
      "title": "Competitive Landscape",
      "summary": "<2-3 sentence overview>",
      "insights": ["<bullet insight>", "<bullet insight>", "<bullet insight>"],
      "conclusion": "<1 sentence strategic takeaway>"
    }
  ]
}`;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
function extractJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {}
  }

  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch (_) {}
  }

  throw new Error('Model response could not be parsed as JSON.');
}

// ─── Validate shape ───────────────────────────────────────────────────────────
function validate(data, brandName) {
  if (!data || typeof data !== 'object') throw new Error('Parsed value is not an object.');

  const required = ['brand', 'analysisTimestamp', 'sentimentScore', 'sentimentBreakdown',
                    'marketTrend', 'marketTrendRationale', 'strategicInsights', 'recommendations', 'dimensions'];
  for (const key of required) {
    if (!(key in data)) throw new Error(`Missing required field: "${key}".`);
  }

  if (!Array.isArray(data.dimensions) || data.dimensions.length !== 5) {
    throw new Error(`Expected 5 dimensions, got ${data.dimensions?.length ?? 0}.`);
  }

  for (const dim of data.dimensions) {
    for (const f of ['id', 'title', 'summary', 'insights', 'conclusion']) {
      if (!(f in dim)) throw new Error(`Dimension "${dim.id ?? '?'}" is missing field "${f}".`);
    }
    if (!Array.isArray(dim.insights)) {
      throw new Error(`Dimension "${dim.id}" insights must be an array.`);
    }
  }

  data.brand = brandName;
  return data;
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function analyzeBrand(brandName) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in environment variables.');
  }

  // Read proxy from environment (HTTP_PROXY / HTTPS_PROXY) so Node.js uses it like curl does
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  let proxyConfig = false;
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    proxyConfig = { host: u.hostname, port: Number(u.port), protocol: u.protocol };
  }

  const response = await axios.post(
    `${GEMINI_URL}?key=${process.env.GOOGLE_API_KEY}`,
    {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(brandName) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 120_000, proxy: proxyConfig },
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) {
    throw new Error('Gemini returned no text output.');
  }

  const parsed = extractJSON(text);
  return validate(parsed, brandName);
}

module.exports = { analyzeBrand };
