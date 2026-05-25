'use strict';

require('dotenv').config({ override: true });
const axios = require('axios');

const MODEL       = 'gemini-2.5-flash-lite';
const GEMINI_URL  = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Confidence threshold for Stage A: below this → reject without Stage B
const CONFIDENCE_THRESHOLD = 70;

// ─── Custom error for unrecognised brands ─────────────────────────────────────
class BrandNotFoundError extends Error {
  constructor(brandName, reason) {
    super(`Brand "${brandName}" could not be verified: ${reason}`);
    this.name = 'BrandNotFoundError';
    this.brandName = brandName;
    this.reason = reason;
  }
}

// ─── Shared axios helper ──────────────────────────────────────────────────────
function buildAxiosConfig(proxyConfig) {
  return {
    headers: { 'Content-Type': 'application/json' },
    timeout: 120_000,
    proxy: proxyConfig,
  };
}

function getProxyConfig() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  if (!proxyUrl) return false;
  const u = new URL(proxyUrl);
  return { host: u.hostname, port: Number(u.port), protocol: u.protocol };
}

async function callGemini(prompt, systemPrompt, proxyConfig, maxTokens = 4096) {
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
  };
  const res = await axios.post(
    `${GEMINI_URL}?key=${process.env.GOOGLE_API_KEY}`,
    body,
    buildAxiosConfig(proxyConfig),
  );
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || !text.trim()) throw new Error('Gemini returned no text output.');
  return text;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
function extractJSON(raw) {
  try { return JSON.parse(raw); } catch (_) {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch (_) {}
  }

  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch (_) {}
  }

  throw new Error('Model response could not be parsed as JSON.');
}

// ─── Stage A — full analysis prompt (includes brand existence fields) ─────────
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

function buildPrompt(brandName) {
  return `\
Analyze the brand "${brandName}" in China's consumer market.

STEP 0 — BRAND EXISTENCE CHECK (fill this before anything else):
Assess whether "${brandName}" is a real, verifiable brand or company.
- brandExists: true if you have concrete knowledge of this brand; false if it appears fictional, misspelled, or completely unknown.
- brandConfidence: integer 0–100 reflecting how certain you are that this brand exists.
  100 = globally recognized brand; 70 = regionally known; 50 = uncertain; <50 = likely fake or unknown.
- brandConfidenceRationale: one sentence explaining your confidence level.

If brandExists is false OR brandConfidence < ${CONFIDENCE_THRESHOLD}, still return the full JSON schema but
fill all analysis fields with empty strings or empty arrays — do NOT fabricate analysis data for non-existent brands.

DIMENSIONS TO COVER (only if brand exists and confidence ≥ ${CONFIDENCE_THRESHOLD}):
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

Score anchors:
  90–100 = industry leader, overwhelmingly positive
  70–89  = strong brand with minor weaknesses
  50–69  = mixed sentiment, notable risks
  30–49  = significant challenges, negative trend
  0–29   = severe crisis or market exit risk

MARKET TREND RUBRIC:
Determine marketTrend based on four indicators (majority vote):
  1. Revenue / GMV growth (YoY): >10% → growing | -5%~+10% → stable | <-5% → declining
  2. Store / SKU expansion: net new → growing | flat → stable | closures/cuts → declining
  3. Market share vs top 3 competitors: gaining → growing | flat → stable | losing → declining
  4. Consumer demand signals (search, social, downloads): upward → growing | flat → stable | downward → declining

Return ONLY this JSON object:

{
  "brand": "${brandName}",
  "analysisTimestamp": "<ISO 8601 datetime>",
  "brandExists": <true | false>,
  "brandConfidence": <integer 0-100>,
  "brandConfidenceRationale": "<1 sentence>",
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
    "revenueGrowth":    "<indicator assessment + data point>",
    "expansionSignals": "<indicator assessment + data point>",
    "marketShare":      "<indicator assessment + data point>",
    "demandSignals":    "<indicator assessment + data point>",
    "verdict":          "<1 sentence summary>"
  },
  "strategicInsights": ["<insight>", "<insight>", "<insight>"],
  "recommendations":   ["<recommendation>", "<recommendation>", "<recommendation>"],
  "dimensions": [
    { "id": "D1", "title": "Price Analysis",        "summary": "", "insights": [], "conclusion": "" },
    { "id": "D2", "title": "Core Selling Points",   "summary": "", "insights": [], "conclusion": "" },
    { "id": "D3", "title": "Sales Channels",        "summary": "", "insights": [], "conclusion": "" },
    { "id": "D4", "title": "Target Audience",       "summary": "", "insights": [], "conclusion": "" },
    { "id": "D5", "title": "Competitive Landscape", "summary": "", "insights": [], "conclusion": "" }
  ]
}`;
}

// ─── Stage A — validate JSON shape + brand existence ─────────────────────────
function validate(data, brandName) {
  if (!data || typeof data !== 'object') throw new Error('Parsed value is not an object.');

  const required = [
    'brand', 'analysisTimestamp',
    'brandExists', 'brandConfidence', 'brandConfidenceRationale',
    'sentimentScore', 'sentimentBreakdown',
    'marketTrend', 'marketTrendRationale',
    'strategicInsights', 'recommendations', 'dimensions',
  ];
  for (const key of required) {
    if (!(key in data)) throw new Error(`Missing required field: "${key}".`);
  }

  // Stage A brand existence gate
  if (data.brandExists === false) {
    throw new BrandNotFoundError(brandName,
      `model flagged it as non-existent (confidence: ${data.brandConfidence}). ${data.brandConfidenceRationale}`);
  }
  if (data.brandConfidence < CONFIDENCE_THRESHOLD) {
    throw new BrandNotFoundError(brandName,
      `confidence too low (${data.brandConfidence}/${CONFIDENCE_THRESHOLD}). ${data.brandConfidenceRationale}`);
  }

  if (!Array.isArray(data.dimensions) || data.dimensions.length !== 5) {
    throw new Error(`Expected 5 dimensions, got ${data.dimensions?.length ?? 0}.`);
  }
  for (const dim of data.dimensions) {
    for (const f of ['id', 'title', 'summary', 'insights', 'conclusion']) {
      if (!(f in dim)) throw new Error(`Dimension "${dim.id ?? '?'}" missing field "${f}".`);
    }
    if (!Array.isArray(dim.insights)) throw new Error(`Dimension "${dim.id}" insights must be an array.`);
  }

  data.brand = brandName;
  return data;
}

// ─── Stage B — lightweight independent verification ───────────────────────────
const VERIFY_SYSTEM = `You are a factual brand verification assistant.
Answer ONLY with a valid JSON object — no markdown, no extra text.`;

async function verifyBrandExists(brandName, proxyConfig) {
  const prompt = `\
Is "${brandName}" a real, verifiable brand, company, or product that genuinely exists
in China's consumer market or is internationally known?

Criteria for "verified: true":
- You can name its founder, headquarters, founding year, or flagship products
- It has documented revenue, retail presence, or media coverage
- It is not a typo, fictional entity, or generic phrase

Return ONLY this JSON:
{
  "verified": <true | false>,
  "reason": "<one sentence explaining your decision>"
}`;

  const text = await callGemini(prompt, VERIFY_SYSTEM, proxyConfig, 256);
  const data = extractJSON(text);

  if (typeof data.verified !== 'boolean') {
    throw new Error('Stage B verification returned unexpected format.');
  }
  return data; // { verified, reason }
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function analyzeBrand(brandName) {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in environment variables.');
  }

  const proxy = getProxyConfig();

  // ── Stage A: full analysis + embedded brand existence check ─────────────────
  const rawText = await callGemini(buildPrompt(brandName), SYSTEM_PROMPT, proxy);
  const parsed  = extractJSON(rawText);
  const analysis = validate(parsed, brandName); // throws BrandNotFoundError if A fails

  // ── Stage B: independent lightweight verification ────────────────────────────
  const verification = await verifyBrandExists(brandName, proxy);
  if (!verification.verified) {
    throw new BrandNotFoundError(brandName,
      `failed independent verification — ${verification.reason}`);
  }

  return analysis;
}

module.exports = { analyzeBrand, BrandNotFoundError };
