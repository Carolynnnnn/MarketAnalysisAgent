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
// Uses the Streaming API so that the proxy sees the first bytes within a few
// seconds, preventing the proxy from timing out on long-running responses.
//
// userPrompt    — plain string OR pre-built content-block array
// useCache      — when true, adds prompt-caching beta header + cache_control blocks
// useThinking   — when true, enables extended thinking (Stage A only); temperature forced to 1
// thinkingBudget— tokens reserved for thinking (must be < maxTokens)
async function callClaude(userPrompt, systemPrompt, apiKey, proxy, { maxTokens = 8192, model = MODEL_MAIN, useCache = false, useThinking = false, thinkingBudget = 8000 } = {}) {
  const MAX_RETRIES = 3;
  let lastErr;

  // System block: cacheable only when useCache is explicitly requested
  const systemBlock = useCache
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : systemPrompt;

  // Normalise userPrompt → content array
  const userContent = Array.isArray(userPrompt)
    ? userPrompt
    : [{ type: 'text', text: userPrompt }];

  const betas = [];
  if (useCache)    betas.push('prompt-caching-2024-07-31');
  if (useThinking) betas.push('interleaved-thinking-2025-05-14');
  const extraHeaders = betas.length > 0 ? { 'anthropic-beta': betas.join(',') } : {};

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ── Streaming request ────────────────────────────────────────────────
      // stream:true keeps the proxy alive by sending data incrementally.
      // responseType:'stream' tells axios not to buffer the entire response.
      const body = {
        model,
        max_tokens: maxTokens,
        stream:     true,
        system:     systemBlock,
        messages:   [{ role: 'user', content: userContent }],
      };
      if (useThinking) {
        body.thinking    = { type: 'enabled', budget_tokens: thinkingBudget };
        body.temperature = 1;
      }

      const res = await axios.post(
        ANTHROPIC_URL,
        body,
        {
          headers: {
            'x-api-key':         apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            ...extraHeaders,
            'Content-Type':      'application/json',
          },
          responseType: 'stream',
          timeout:      120_000,
          proxy,
        },
      );

      // ── Accumulate SSE stream into a single text string ──────────────────
      const text = await new Promise((resolve, reject) => {
        let fullText = '';
        let buffer   = '';
        let httpErr  = null;   // error event from an error-status SSE frame

        res.data.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep any incomplete trailing line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            try {
              const evt = JSON.parse(payload);

              // Anthropic error event inside the stream (e.g. rate-limit mid-stream)
              if (evt.type === 'error') {
                httpErr = evt.error;
                return;
              }
              // Accumulate text deltas
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                fullText += evt.delta.text;
              }
            } catch (_) { /* incomplete JSON chunk — ignore */ }
          }
        });

        res.data.on('end', () => {
          if (httpErr) return reject(Object.assign(new Error(httpErr.message ?? 'Stream error'), { streamError: httpErr }));
          if (!fullText.trim()) return reject(new Error('Claude returned no text output.'));
          resolve(fullText);
        });

        res.data.on('error', reject);
      });

      return text;

    } catch (err) {
      lastErr = err;

      // Decode status: axios wraps HTTP errors; stream errors carry streamError
      const status  = err.response?.status ?? (err.streamError ? 500 : undefined);
      const errBody = err.response?.data;
      const errMsg  = err.streamError?.message
        ?? errBody?.error?.message
        ?? err.message
        ?? String(err);

      if (status && status >= 400) {
        console.error(`[CLAUDE] HTTP ${status} on attempt ${attempt + 1}/${MAX_RETRIES + 1}:`,
          JSON.stringify(errBody ?? err.message ?? ''));
      }

      if (status === 401 || status === 403) throw new InvalidApiKeyError(errMsg);

      if (status === 429 || status === 529) {
        const retryAfter = parseInt(err.response?.headers?.['retry-after'] ?? '15', 10);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
          continue;
        }
      }

      // 502/503: gateway errors — exponential backoff (2s → 4s → 8s)
      if ((status === 502 || status === 503) && attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.error(`[CLAUDE] ${status} — retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      throw new Error(errMsg);
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
You are a senior global market analyst specializing in brand intelligence and consumer markets worldwide.

RESEARCH STANDARDS — these are mandatory, not suggestions:
- Every quantitative claim MUST include a year or time range (e.g. "in 2024", "as of Q1 2025").
- Every market-share, revenue, or growth figure MUST include a specific number or percentage.
  Name specific companies, platforms, retailers, and real geographic markets.
- FORBIDDEN vague words (never use without an accompanying specific number):
  many · various · several · some · a number of · significant · considerable · substantial ·
  major · large · small · notable · enormous · huge · growing (as a standalone adjective)
- If a specific figure is genuinely unavailable, write the exact phrase:
  "[Data unavailable as of 2024/2025]" — do NOT invent or approximate figures.
- Do not write generic statements that would apply to any brand in the sector.
- Always identify the brand's PRIMARY market(s) and tailor all analysis to those markets.

OUTPUT: ONLY a single valid JSON object. No markdown fences. No text before or after.`;

// ─── Stage A — user prompt builder ───────────────────────────────────────────
//
// Returns an array of content blocks so the large static template is sent as a
// cache_control:ephemeral block (cached across calls) while only the small
// dynamic portion (brand name + optional retry feedback) is sent fresh each time.
//
const PROMPT_STATIC_TEMPLATE = `\
Analyze the target brand globally as directed below. First identify the brand's PRIMARY market(s)
and headquarters country — all analysis must be scoped to where the brand actually operates.

STEP 0 — BRAND EXISTENCE CHECK:
- brandExists: true if you have concrete knowledge of this brand; false otherwise.
- brandConfidence: 0–100 (100 = globally known; 70 = regionally known; <50 = uncertain/fictional).
- brandConfidenceRationale: one sentence.
If brandExists is false OR brandConfidence < ${CONFIDENCE_THRESHOLD}, fill all analysis fields
with empty strings/arrays — do NOT fabricate data for unverifiable brands.

DIMENSIONS (only populate if brand verified; adapt to the brand's actual markets):
1. Price Analysis       — pricing tiers in local currency + USD equivalent, price-tier positioning, specific competitors' prices
2. Core Selling Points  — product/service features with specifics, named innovations, measurable differentiators
3. Sales Channels       — named platforms, retailers, or distribution channels with revenue contribution %; offline presence
4. Target Audience      — age range, income bracket, geographic/demographic breakdown with % if available
5. Competitive Landscape — named competitors with estimated market share %, specific advantages/threats in the brand's primary market

INSIGHT FORMAT — MANDATORY for all dimension insights:
Each insight MUST follow this exact structure:
  [TAG] Specific claim with exact figure (year) — strategic implication or comparison with a named competitor.
  Example: [PRICING] Average price point $299 USD (2024) undercuts Competitor X by 23%, securing value-tier leadership.
Tags to use (pick the most fitting): [PRICING] [MARKET SHARE] [GROWTH] [DISTRIBUTION] [CONSUMER] [COMPETITIVE] [PRODUCT] [TREND] [GEOGRAPHY] [FINANCIAL] [INNOVATION] [DIGITAL]
MINIMUM 8 insights per dimension. Vary tags across insights within each dimension.

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

Return ONLY this JSON (substitute BRAND_NAME with the actual brand name given below):
{
  "brand": "<BRAND_NAME>",
  "analysisTimestamp": "<ISO 8601>",
  "primaryMarket": "<Country or region where the brand primarily operates>",
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
  "strategicInsights": ["<[TAG] insight with figures>", "<[TAG] insight with figures>", "<[TAG] insight with figures>", "<[TAG] insight with figures>", "<[TAG] insight with figures>"],
  "recommendations":   ["<actionable recommendation>", "<actionable recommendation>", "<actionable recommendation>", "<actionable recommendation>", "<actionable recommendation>"],
  "dimensions": [
    { "id": "D1", "title": "Price Analysis",        "summary": "<pricing overview with local currency figures>", "insights": ["<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>"], "conclusion": "<specific takeaway>" },
    { "id": "D2", "title": "Core Selling Points",   "summary": "<named features and differentiators>",          "insights": ["<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>"], "conclusion": "<specific takeaway>" },
    { "id": "D3", "title": "Sales Channels",        "summary": "<named channels with contribution %>",          "insights": ["<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>"], "conclusion": "<specific takeaway>" },
    { "id": "D4", "title": "Target Audience",       "summary": "<demographic profile with specifics>",          "insights": ["<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>"], "conclusion": "<specific takeaway>" },
    { "id": "D5", "title": "Competitive Landscape", "summary": "<named rivals with market share %>",            "insights": ["<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>","<[TAG] insight>"], "conclusion": "<specific takeaway>" }
  ]
}`;

function buildPrompt(brandName, qualityFeedback = null) {
  const retryBlock = qualityFeedback
    ? `IMPORTANT — PREVIOUS ATTEMPT FAILED QUALITY AUDIT:\n` +
      `Your prior response had ${qualityFeedback.issueCount} data-quality issues. Fix all of them:\n` +
      qualityFeedback.issues.slice(0, 6)
        .map(i => `  • [${i.type}] ${i.location}: "${i.excerpt}" → ${i.suggestion}`)
        .join('\n') +
      `\nBe specific: include real figures, percentages, and years for every claim.\n\n`
    : '';

  // Block 1: large static template — eligible for prompt caching
  // Block 2: small dynamic part (brand name + optional retry note) — always fresh
  return [
    {
      type:          'text',
      text:          PROMPT_STATIC_TEMPLATE,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `${retryBlock}BRAND_NAME: "${brandName}"`,
    },
  ];
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
  const prompt = `Is "${brandName}" a real, verifiable brand, company, or product that genuinely exists anywhere in the world?

Criteria for "verified: true":
- You can name its founder, headquarters country, founding year, or flagship products
- It has documented revenue, retail presence, or media coverage in any country
- It is not a typo, fictional entity, or generic phrase

Return ONLY: { "verified": <true|false>, "reason": "<one sentence>" }`;

  const text = await callClaude(prompt, VERIFY_SYSTEM, apiKey, proxy, { maxTokens: 256, model: MODEL_FAST });
  const data = extractJSON(text);
  if (typeof data.verified !== 'boolean') throw new Error('Stage B: unexpected format.');
  return data;
}

// ─── Stage C+D — combined quality audit + reference generation ───────────────
//
// One Haiku call replaces two. The static instructions block is marked
// cache_control:ephemeral so it is reused across the retry path.
//
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

const AUDIT_REF_SYSTEM = `You are a combined data quality auditor and research citation specialist for China consumer-market analysis reports.
Output ONLY valid JSON. No markdown. No extra text.`;

// Static instructions block — shared across all calls, eligible for caching
const AUDIT_REF_STATIC = `You will receive a market analysis. Perform TWO tasks simultaneously and return ONE JSON object.

═══ TASK 1 — DATA QUALITY AUDIT ═══
RULES:
1. VAGUE_LANGUAGE    — words like many/various/several/significant/considerable without a specific number
2. MISSING_SPECIFICS — claims with no year, %, ¥ figure, or named entity
3. FABRICATED        — numbers that appear invented or implausibly precise

qualityScore: 90-100 all specific | 70-89 mostly specific | 50-69 noticeable gaps | 0-49 pervasive vagueness

═══ TASK 2 — REFERENCE GENERATION ═══
For each of the ~15 most specific, verifiable claims, identify the most authoritative source.

SOURCE TYPES:
- official_ir      : Brand IR page or official press release
- industry_report  : iResearch, Euromonitor, Nielsen, Frost & Sullivan, QuestMobile, Mob Research
- regulatory       : SAMR, NMPA, NBS stats.gov.cn, customs.gov.cn
- platform_data    : Tmall, JD.com, Douyin, Pinduoduo official data
- news_media       : Caixin, 36kr, Reuters, Bloomberg
- estimated        : No retrievable source — AI training-knowledge estimate

RELIABILITY: "high" = official/regulatory | "medium" = research/media | "low" = estimate
Set needsVerification: true for any URL you are not fully confident is currently live.

═══ RETURN ONLY THIS JSON ═══
{
  "qualityReport": {
    "qualityScore": <0-100>,
    "passed": <true if qualityScore >= ${QUALITY_THRESHOLD}>,
    "issueCount": <number>,
    "issues": [{ "location": "<D1.insights[0] etc>", "type": "VAGUE_LANGUAGE|MISSING_SPECIFICS|FABRICATED", "excerpt": "<max 80 chars>", "suggestion": "<fix>" }],
    "summary": "<2-3 sentences>"
  },
  "referencesData": {
    "references": [
      {
        "id": "R01",
        "dimension": "<D1-D5 or general>",
        "claimExcerpt": "<first 120 chars>",
        "source": "<Organisation — report/page title>",
        "url": "<best known URL>",
        "sourceType": "official_ir|industry_report|regulatory|platform_data|news_media|estimated",
        "reliability": "high|medium|low",
        "needsVerification": <true|false>
      }
    ],
    "disclaimer": "References were generated by AI from training data. All URLs and source details must be independently verified before citation. Claims marked estimated reflect AI inference, not a directly retrievable source."
  }
}`;

function buildAnalysisPayload(analysis) {
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

async function auditAndGenerateRefs(analysis, apiKey, proxy) {
  const serverFlags = serverSideVagueScan(analysis);

  // Two-block user message: static instructions (cached) + dynamic analysis payload
  const userBlocks = [
    { type: 'text', text: AUDIT_REF_STATIC, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `BRAND: ${analysis.brand}\n\nANALYSIS TEXT:\n${buildAnalysisPayload(analysis)}` },
  ];

  const text   = await callClaude(userBlocks, AUDIT_REF_SYSTEM, apiKey, proxy, { maxTokens: 4096, model: MODEL_FAST, useCache: true });
  const result = extractJSON(text);

  if (!result.qualityReport || !result.referencesData) {
    throw new Error('Stage C+D: unexpected response format.');
  }

  // Merge server-side vague scan results into the AI audit
  const audit = result.qualityReport;
  if (serverFlags.length > 0) {
    const serverIssues = serverFlags.map(f => ({
      location:   'auto-scan',
      type:       'VAGUE_LANGUAGE',
      excerpt:    f.excerpt,
      suggestion: 'Replace with a specific figure, percentage, or year.',
    }));
    audit.issues     = [...(audit.issues ?? []), ...serverIssues];
    audit.issueCount = audit.issues.length;
    if (serverFlags.length > 2) {
      audit.qualityScore = Math.min(audit.qualityScore ?? 100, 65);
      audit.passed       = audit.qualityScore >= QUALITY_THRESHOLD;
    }
  }

  return { qualityReport: audit, referencesData: result.referencesData };
}

// ─── Main export ──────────────────────────────────────────────────────────────
async function analyzeBrand(brandName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Create a .env file based on .env.example.');
  }

  const proxy = getProxyConfig();

  // ── Stage A: full analysis with embedded brand check (extended thinking enabled) ─
  const rawText  = await callClaude(buildPrompt(brandName), SYSTEM_PROMPT, apiKey, proxy,
    { useCache: true, useThinking: true, thinkingBudget: 4000, maxTokens: 12000 });
  const parsed   = extractJSON(rawText);
  let analysis   = validate(parsed, brandName);

  // ── Stage B: independent brand verification ──────────────────────────────────
  const verification = await verifyBrandExists(brandName, apiKey, proxy);
  if (!verification.verified) {
    throw new BrandNotFoundError(brandName,
      `failed independent verification — ${verification.reason}`);
  }

  // ── Stage C+D: combined quality audit + reference generation (non-blocking) ─
  let qualityReport  = { qualityScore: null, passed: null, issues: [], summary: 'Audit unavailable.', unavailable: true };
  let referencesData = { references: [], disclaimer: 'References unavailable.', unavailable: true };
  try {
    const cdResult = await auditAndGenerateRefs(analysis, apiKey, proxy);
    qualityReport  = cdResult.qualityReport;
    referencesData = cdResult.referencesData;

    // Auto-retry Stage A if quality is below threshold
    if (!qualityReport.passed) {
      try {
        const retryText     = await callClaude(buildPrompt(brandName, qualityReport), SYSTEM_PROMPT, apiKey, proxy,
          { useCache: true, useThinking: true, thinkingBudget: 4000, maxTokens: 12000 });
        const retryParsed   = extractJSON(retryText);
        const retryAnalysis = validate(retryParsed, brandName);
        const retryCDResult = await auditAndGenerateRefs(retryAnalysis, apiKey, proxy);
        analysis       = retryAnalysis;
        qualityReport  = { ...retryCDResult.qualityReport,  wasRetried: true };
        referencesData = retryCDResult.referencesData;
      } catch (_) {
        qualityReport.wasRetried  = true;
        qualityReport.retryFailed = true;
      }
    }
  } catch (cdErr) {
    qualityReport.unavailable  = true;
    qualityReport.summary      = `Quality audit could not run: ${cdErr.message}`;
    referencesData.disclaimer  = `References could not be generated: ${cdErr.message}`;
  }

  analysis.qualityReport  = qualityReport;
  analysis.referencesData = referencesData;

  return analysis;
}

// ─── Company name suggestions ─────────────────────────────────────────────────
async function suggestCompanies(query) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || query.length < 2) return [];
  const proxy = getProxyConfig();

  const prompt = `List up to 6 real, well-known company or brand names whose name CONTAINS the characters "${query}" (case-insensitive).

Rules:
- Every name in the list MUST contain the substring "${query}" somewhere in it
- Only real, verifiable companies or brands (not fictional)
- Prefer well-known names; include global and regional brands
- If fewer than 6 names actually contain "${query}", return only the ones that do
- Return ONLY a JSON array of strings, no explanations, no markdown

Example for query "apple": ["Apple Inc.", "Apple Bank", "Applebee's", "Apple Records"]`;

  try {
    const text = await callClaude(
      prompt,
      'You are a company name lookup assistant. Return ONLY a valid JSON array of strings.',
      apiKey, proxy,
      { maxTokens: 300, model: MODEL_FAST }
    );
    const data = extractJSON(text);
    if (!Array.isArray(data)) return [];
    return data.slice(0, 6).filter(s => typeof s === 'string' && s.trim().length > 0);
  } catch (_) {
    return [];
  }
}

module.exports = { analyzeBrand, suggestCompanies, BrandNotFoundError, InvalidApiKeyError };
