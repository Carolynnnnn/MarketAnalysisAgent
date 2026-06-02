'use strict';

require('dotenv').config({ override: true });
const axios = require('axios');

const MODEL_MAIN = 'claude-sonnet-4-6';           // Stage A — full analysis
const MODEL_FAST = 'claude-haiku-4-5-20251001';   // Stage B + C — quick checks
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const CONFIDENCE_THRESHOLD = 70;
const QUALITY_THRESHOLD    = 70;

// ─── Custom errors ────────────────────────────────────────────────────────────
class BrandNotFoundError extends Error {
  constructor(brandName, reason) {
    super(`Brand "${brandName}" could not be verified: ${reason}`);
    this.name = 'BrandNotFoundError';
    this.brandName = brandName;
    this.reason = reason;
  }
}

class InvalidApiKeyError extends Error {
  constructor(message) {
    super(message || 'Invalid Anthropic API key.');
    this.name = 'InvalidApiKeyError';
  }
}

// ─── Proxy helper ─────────────────────────────────────────────────────────────
function getProxyConfig() {
  const url = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  if (!url) return false;
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port), protocol: u.protocol };
}

// ─── Anthropic API helper ─────────────────────────────────────────────────────
async function callClaude(userPrompt, systemPrompt, apiKey, proxy, { maxTokens = 8192, model = MODEL_MAIN } = {}) {
  const MAX_RETRIES = 3;
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        ANTHROPIC_URL,
        {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        },
        {
          headers: {
            'x-api-key':         apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'Content-Type':      'application/json',
          },
          timeout: 120_000,
          proxy,
        },
      );
      const text = res.data?.content?.[0]?.text;
      if (!text?.trim()) throw new Error('Claude returned no text output.');
      return text;
    } catch (err) {
      lastErr = err;
      const status  = err.response?.status;
      const errMsg  = err.response?.data?.error?.message ?? err.message ?? String(err);

      if (status === 401 || status === 403) throw new InvalidApiKeyError(errMsg);

      if (status === 429 || status === 529) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] ?? '15', 10);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
function extractJSON(raw) {
  try { return JSON.parse(raw); } catch (_) {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const first = raw.indexOf('{');
  const last  = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch (_) {}
  }
  throw new Error('Model response could not be parsed as JSON.');
}

// ─── Stage A — system prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `\
You are a senior market analyst specializing in China's consumer market.

RESEARCH STANDARDS — these are mandatory, not suggestions:
- Every quantitative claim MUST include a year or time range (e.g. "in 2024", "as of Q1 2025").
- Every market-share, revenue, or growth figure MUST include a specific number or percentage.
  Use named companies, specific platforms (Tmall, JD.com, Douyin, Pinduoduo), and real city names.
- FORBIDDEN vague words (never use without an accompanying specific number):
  many · various · several · some · a number of · significant · considerable · substantial ·
  major · large · small · notable · enormous · huge · growing (as a standalone adjective)
- If a specific figure is genuinely unavailable, write the exact phrase:
  "[Data unavailable as of 2024/2025]" — do NOT invent or approximate figures.
- Do not write generic statements that would apply to any brand in the sector.

OUTPUT: ONLY a single valid JSON object. No markdown fences. No text before or after.`;

// ─── Stage A — user prompt builder ───────────────────────────────────────────
function buildPrompt(brandName, qualityFeedback = null) {
  const retryBlock = qualityFeedback
    ? `\nIMPORTANT — PREVIOUS ATTEMPT FAILED QUALITY AUDIT:
Your prior response had ${qualityFeedback.issueCount} data-quality issues. Fix all of them:
${qualityFeedback.issues.slice(0, 6).map(i => `  • [${i.type}] ${i.location}: "${i.excerpt}" → ${i.suggestion}`).join('\n')}
Be specific: include real figures, percentages, and years for every claim.\n`
    : '';

  return `${retryBlock}\
Analyze the brand "${brandName}" in China's consumer market.

STEP 0 — BRAND EXISTENCE CHECK:
- brandExists: true if you have concrete knowledge of this brand; false otherwise.
- brandConfidence: 0–100 (100 = globally known; 70 = regionally known; <50 = uncertain/fictional).
- brandConfidenceRationale: one sentence.
If brandExists is false OR brandConfidence < ${CONFIDENCE_THRESHOLD}, fill all analysis fields
with empty strings/arrays — do NOT fabricate data for unverifiable brands.

DIMENSIONS (only populate if brand verified):
1. Price Analysis       — pricing tiers with ¥ figures, price-tier positioning, specific competitors' prices
2. Core Selling Points  — product features with specifics, named innovations, measurable differentiators
3. Sales Channels       — named platforms and their revenue contribution %, offline store count/regions
4. Target Audience      — age range, income bracket, city-tier breakdown with % if available
5. Competitive Landscape — named competitors with estimated market share %, specific advantages/threats

SENTIMENT SCORE RUBRIC (0–100 weighted composite):
  1. Consumer Reputation (30%) — social media sentiment, ratings, complaint rate, NPS
  2. Market Performance   (25%) — revenue growth rate, market share trend, expansion speed
  3. Brand Awareness      (20%) — awareness scores, prestige, media coverage volume
  4. Price Competitiveness(15%) — value-for-money perception vs. competitors
  5. Channel Coverage     (10%) — breadth of online + offline distribution
Formula: sentimentScore = round(D1×0.30 + D2×0.25 + D3×0.20 + D4×0.15 + D5×0.10)
Anchors: 90–100 leader | 70–89 strong | 50–69 mixed | 30–49 challenged | 0–29 crisis

MARKET TREND RUBRIC (majority vote of 4 indicators):
  1. Revenue/GMV YoY: >10% → growing | -5%~+10% → stable | <-5% → declining
  2. Store/SKU expansion: net new → growing | flat → stable | closures → declining
  3. Market share vs top 3: gaining → growing | flat → stable | losing → declining
  4. Demand signals (search, social, downloads): up → growing | flat → stable | down → declining

DATA QUALITY SELF-REPORT (honest self-assessment):
- unavailableData: list specific fields where real data was not found and "[Data unavailable]" was used
- estimatedClaims: list claims that are informed estimates rather than cited facts
- overallDataAvailability: "high" (>80% specific), "medium" (50–80%), or "low" (<50%)

Return ONLY this JSON:
{
  "brand": "${brandName}",
  "analysisTimestamp": "<ISO 8601>",
  "brandExists": <true|false>,
  "brandConfidence": <0-100>,
  "brandConfidenceRationale": "<1 sentence>",
  "dataQualityReport": {
    "unavailableData": ["<field: reason>"],
    "estimatedClaims": ["<claim description>"],
    "overallDataAvailability": "high|medium|low"
  },
  "sentimentScore": <0-100>,
  "sentimentBreakdown": {
    "consumerReputation":    { "score": <0-100>, "weight": 0.30, "rationale": "<specific sentence with data>" },
    "marketPerformance":     { "score": <0-100>, "weight": 0.25, "rationale": "<specific sentence with data>" },
    "brandAwareness":        { "score": <0-100>, "weight": 0.20, "rationale": "<specific sentence with data>" },
    "priceCompetitiveness":  { "score": <0-100>, "weight": 0.15, "rationale": "<specific sentence with data>" },
    "channelCoverage":       { "score": <0-100>, "weight": 0.10, "rationale": "<specific sentence with data>" }
  },
  "marketTrend": "<growing|stable|declining>",
  "marketTrendRationale": {
    "revenueGrowth":    "<specific % or figure + year>",
    "expansionSignals": "<specific store count or SKU count + year>",
    "marketShare":      "<specific % vs named competitors>",
    "demandSignals":    "<specific platform data or index score>",
    "verdict":          "<1 sentence with concrete evidence>"
  },
  "strategicInsights": ["<specific insight with figures>", "<specific insight with figures>", "<specific insight with figures>"],
  "recommendations":   ["<actionable recommendation>", "<actionable recommendation>", "<actionable recommendation>"],
  "dimensions": [
    { "id": "D1", "title": "Price Analysis",        "summary": "<specific ¥ figures>", "insights": ["<specific>","<specific>","<specific>"], "conclusion": "<specific takeaway>" },
    { "id": "D2", "title": "Core Selling Points",   "summary": "<named features>",     "insights": ["<specific>","<specific>","<specific>"], "conclusion": "<specific takeaway>" },
    { "id": "D3", "title": "Sales Channels",        "summary": "<named platforms+%>",  "insights": ["<specific>","<specific>","<specific>"], "conclusion": "<specific takeaway>" },
    { "id": "D4", "title": "Target Audience",       "summary": "<age/income range>",   "insights": ["<specific>","<specific>","<specific>"], "conclusion": "<specific takeaway>" },
    { "id": "D5", "title": "Competitive Landscape", "summary": "<named rivals+share%>","insights": ["<specific>","<specific>","<specific>"], "conclusion": "<specific takeaway>" }
  ]
}`;
}

// ─── Stage A — JSON shape validator ──────────────────────────────────────────
function validate(data, brandName) {
  if (!data || typeof data !== 'object') throw new Error('Parsed value is not an object.');

  const required = [
    'brand', 'analysisTimestamp',
    'brandExists', 'brandConfidence', 'brandConfidenceRationale',
    'dataQualityReport',
    'sentimentScore', 'sentimentBreakdown',
    'marketTrend', 'marketTrendRationale',
    'strategicInsights', 'recommendations', 'dimensions',
  ];
  for (const key of required) {
    if (!(key in data)) throw new Error(`Missing required field: "${key}".`);
  }

  if (data.brandExists === false) {
    throw new BrandNotFoundError(brandName,
      `model flagged as non-existent (confidence: ${data.brandConfidence}). ${data.brandConfidenceRationale}`);
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

// ─── Stage B — lightweight brand verification ─────────────────────────────────
const VERIFY_SYSTEM = `You are a factual brand verification assistant.
Answer ONLY with a valid JSON object — no markdown, no extra text.`;

async function verifyBrandExists(brandName, apiKey, proxy) {
  const prompt = `Is "${brandName}" a real, verifiable brand, company, or product that genuinely
exists in China's consumer market or is internationally known?

Criteria for "verified: true":
- You can name its founder, headquarters, founding year, or flagship products
- It has documented revenue, retail presence, or media coverage
- It is not a typo, fictional entity, or generic phrase

Return ONLY: { "verified": <true|false>, "reason": "<one sentence>" }`;

  const text = await callClaude(prompt, VERIFY_SYSTEM, apiKey, proxy, { maxTokens: 256, model: MODEL_FAST });
  const data = extractJSON(text);
  if (typeof data.verified !== 'boolean') throw new Error('Stage B: unexpected format.');
  return data;
}

// ─── Stage C — data quality audit ────────────────────────────────────────────
const VAGUE_PATTERNS = [
  /\bmany\b/i, /\bvarious\b/i, /\bseveral\b/i, /\ba number of\b/i,
  /\bsome\b(?! stores| outlets)/i,
  /\bsignificant(ly)?\b(?! \d)/i, /\bconsiderable\b/i, /\bsubstantial\b/i,
  /\bwidespread\b/i, /\bnumerous\b/i, /\bextensive\b/i,
  /\ba wide range\b/i, /\ba variety of\b/i, /\blarge number\b/i,
];

function serverSideVagueScan(analysis) {
  const flagged = [];
  const textFields = [
    ...analysis.strategicInsights,
    ...analysis.recommendations,
    ...analysis.dimensions.flatMap(d => [d.summary, d.conclusion, ...d.insights]),
    ...Object.values(analysis.sentimentBreakdown).map(v => v.rationale),
    ...Object.values(analysis.marketTrendRationale),
  ].filter(Boolean);

  for (const text of textFields) {
    for (const pat of VAGUE_PATTERNS) {
      if (pat.test(text)) {
        flagged.push({ type: 'VAGUE', excerpt: text.slice(0, 100), pattern: pat.source });
        break;
      }
    }
  }
  return flagged;
}

const AUDIT_SYSTEM = `You are a strict data quality auditor for market research reports.
Output ONLY valid JSON. No markdown. No extra text.`;

function buildAuditPayload(analysis) {
  const lines = [];
  for (const d of analysis.dimensions) {
    lines.push(`[${d.id}] ${d.title}`);
    lines.push(`  summary: ${d.summary}`);
    d.insights.forEach((ins, i) => lines.push(`  insight${i + 1}: ${ins}`));
    lines.push(`  conclusion: ${d.conclusion}`);
  }
  lines.push(`strategicInsights: ${analysis.strategicInsights.join(' | ')}`);
  lines.push(`recommendations: ${analysis.recommendations.join(' | ')}`);
  lines.push(`trendVerdict: ${analysis.marketTrendRationale?.verdict ?? ''}`);
  return lines.join('\n').slice(0, 6000);
}

async function auditDataQuality(analysis, apiKey, proxy) {
  const serverFlags = serverSideVagueScan(analysis);

  const auditPrompt = `Audit this market analysis text for data quality.

RULES:
1. VAGUE_LANGUAGE — "many/various/several/significant/considerable" without a specific number
2. MISSING_SPECIFICS — claims with no year, %, ¥ figure, or named entity
3. FABRICATED — numbers that appear invented or implausibly precise

qualityScore: 90-100 all specific | 70-89 mostly specific | 50-69 noticeable gaps | 0-49 pervasive vagueness

TEXT TO AUDIT:
${buildAuditPayload(analysis)}

Return ONLY valid JSON:
{
  "qualityScore": <0-100>,
  "passed": <true if qualityScore >= ${QUALITY_THRESHOLD}>,
  "issueCount": <number>,
  "issues": [{ "location": "<D1.insights[0] etc>", "type": "VAGUE_LANGUAGE|MISSING_SPECIFICS|FABRICATED", "excerpt": "<max 80 chars>", "suggestion": "<fix>" }],
  "summary": "<2-3 sentences>"
}`;

  const text  = await callClaude(auditPrompt, AUDIT_SYSTEM, apiKey, proxy, { maxTokens: 2048, model: MODEL_FAST });
  const audit = extractJSON(text);

  if (serverFlags.length > 0) {
    const serverIssues = serverFlags.map(f => ({
      location: 'auto-scan',
      type: 'VAGUE_LANGUAGE',
      excerpt: f.excerpt,
      suggestion: 'Replace with a specific figure, percentage, or year.',
    }));
    audit.issues = [...(audit.issues ?? []), ...serverIssues];
    audit.issueCount = audit.issues.length;
    if (serverFlags.length > 2) {
      audit.qualityScore = Math.min(audit.qualityScore ?? 100, 65);
      audit.passed = audit.qualityScore >= QUALITY_THRESHOLD;
    }
  }

  return audit;
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function analyzeBrand(brandName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Create a .env file based on .env.example.');
  }

  const proxy = getProxyConfig();

  // ── Stage A: full analysis with embedded brand check ────────────────────────
  const rawText  = await callClaude(buildPrompt(brandName), SYSTEM_PROMPT, apiKey, proxy);
  const parsed   = extractJSON(rawText);
  let analysis   = validate(parsed, brandName);

  // ── Stage B: independent brand verification ──────────────────────────────────
  const verification = await verifyBrandExists(brandName, apiKey, proxy);
  if (!verification.verified) {
    throw new BrandNotFoundError(brandName,
      `failed independent verification — ${verification.reason}`);
  }

  // ── Stage C: data quality audit (non-blocking) ────────────────────────────
  let qualityReport = { qualityScore: null, passed: null, issues: [], summary: 'Audit unavailable.', unavailable: true };
  try {
    qualityReport = await auditDataQuality(analysis, apiKey, proxy);

    if (!qualityReport.passed) {
      try {
        const retryText     = await callClaude(buildPrompt(brandName, qualityReport), SYSTEM_PROMPT, apiKey, proxy);
        const retryParsed   = extractJSON(retryText);
        const retryAnalysis = validate(retryParsed, brandName);
        const retryQuality  = await auditDataQuality(retryAnalysis, apiKey, proxy);
        analysis      = retryAnalysis;
        qualityReport = { ...retryQuality, wasRetried: true };
      } catch (_) {
        qualityReport.wasRetried  = true;
        qualityReport.retryFailed = true;
      }
    }
  } catch (auditErr) {
    qualityReport.unavailable = true;
    qualityReport.summary = `Quality audit could not run: ${auditErr.message}`;
  }

  analysis.qualityReport = qualityReport;
  return analysis;
}

module.exports = { analyzeBrand, BrandNotFoundError, InvalidApiKeyError };
