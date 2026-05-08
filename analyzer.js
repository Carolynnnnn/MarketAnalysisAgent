'use strict';

require('dotenv').config();
const axios = require('axios');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL          = 'openai/gpt-oss-120b:free';

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

Return ONLY this JSON object. No markdown fences, no extra text, no explanation:

{
  "brand": "${brandName}",
  "analysisTimestamp": "<ISO 8601 datetime>",
  "sentimentScore": <integer 0-100>,
  "marketTrend": "<growing | stable | declining>",
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

  const required = ['brand', 'analysisTimestamp', 'sentimentScore', 'marketTrend',
                    'strategicInsights', 'recommendations', 'dimensions'];
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
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables.');
  }

  const response = await axios.post(
    OPENROUTER_URL,
    {
      model:    MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildPrompt(brandName) },
      ],
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type':  'application/json',
      },
      timeout: 120_000,
    },
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) {
    throw new Error('OpenRouter returned no text output.');
  }

  const parsed = extractJSON(text);
  return validate(parsed, brandName);
}

module.exports = { analyzeBrand };
