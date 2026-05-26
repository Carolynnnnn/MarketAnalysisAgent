'use strict';

require('dotenv').config({ override: true });

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { analyzeBrand, BrandNotFoundError } = require('./analyzer');
const { generatePDF }  = require('./pdfGenerator');

const app  = express();
const PORT = process.env.PORT || 3000;
const REPORTS_DIR = path.join(__dirname, 'Reports');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(level, step, message, extra) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${step}] ${message}`;
  if (level === 'error') {
    console.error(line, extra ?? '');
  } else {
    console.log(line, extra !== undefined ? extra : '');
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET / — serve index.html
app.get('/', (req, res) => {
  log('info', 'SERVE', 'Serving index.html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// POST /analyze — full analysis pipeline
app.post('/analyze', async (req, res) => {
  const { brand } = req.body;

  if (!brand || typeof brand !== 'string' || !brand.trim()) {
    log('warn', 'VALIDATE', 'Missing or empty brand name in request body');
    return res.status(400).json({ success: false, error: 'brand name is required.' });
  }

  const brandName = brand.trim();
  log('info', 'PIPELINE', `Starting analysis for brand: "${brandName}"`);

  // ── Step 1: AI analysis with live web search ───────────────────────────────
  let analysis;
  try {
    log('info', 'ANALYZE', `Claude is searching the web and analysing "${brandName}"…`);
    analysis = await analyzeBrand(brandName);
    log('info', 'ANALYZE', `Analysis complete. Sentiment: ${analysis.sentimentScore}, Trend: ${analysis.marketTrend}, Dimensions: ${analysis.dimensions.length}`);
  } catch (err) {
    const detail = err.response?.data?.error?.message ?? err.message ?? String(err);
    if (err instanceof BrandNotFoundError) {
      log('warn', 'ANALYZE', `Brand not found: "${brandName}".`, err.reason);
      return res.status(404).json({ success: false, brandNotFound: true, error: detail });
    }
    log('error', 'ANALYZE', 'Analysis failed.', detail);
    return res.status(502).json({ success: false, error: `AI analysis failed: ${detail}` });
  }

  // ── Step 2: PDF generation ────────────────────────────────────────────────
  let pdfPath;
  try {
    log('info', 'PDF', `Generating PDF report for "${brandName}"…`);
    pdfPath = await generatePDF(analysis);
    const sizeKB = Math.round(fs.statSync(pdfPath).size / 1024);
    log('info', 'PDF', `PDF saved: ${path.basename(pdfPath)} (${sizeKB} KB)`);
  } catch (err) {
    log('error', 'PDF', 'PDF generation failed.', err.message);
    return res.status(500).json({ success: false, error: `PDF generation failed: ${err.message}` });
  }

  // ── Step 3: Respond ───────────────────────────────────────────────────────
  const filename    = path.basename(pdfPath);
  const downloadUrl = `/download/${encodeURIComponent(filename)}`;

  const dimMap = Object.fromEntries(
    (analysis.dimensions ?? []).map((d) => [d.id, d]),
  );

  const preview = {
    brand:                 analysis.brand,
    sentimentScore:        analysis.sentimentScore,
    sentimentBreakdown:    analysis.sentimentBreakdown ?? {},
    marketTrend:           analysis.marketTrend,
    marketTrendRationale:  analysis.marketTrendRationale ?? {},
    qualityReport:         analysis.qualityReport ?? {},
    strategicInsights:   (analysis.strategicInsights ?? []).slice(0, 3),
    recommendations:     (analysis.recommendations   ?? []).slice(0, 3),
    dimensions:          (analysis.dimensions ?? []).map(({ id, title, summary, conclusion }) => ({
      id, title, summary, conclusion,
    })),
    priceSummary:         dimMap.D1?.summary ?? '',
    competitiveSummary:   dimMap.D5?.summary ?? '',
  };

  log('info', 'PIPELINE', `Analysis pipeline complete for "${brandName}". Sending response.`);

  return res.status(200).json({
    success:     true,
    brand:       brandName,
    downloadUrl,
    filename,
    preview,
  });
});

// GET /download/:filename — stream PDF to browser
app.get('/download/:filename', (req, res) => {
  const raw      = req.params.filename;
  const filename = path.basename(decodeURIComponent(raw)); // strip any path traversal

  if (!filename.endsWith('.pdf')) {
    log('warn', 'DOWNLOAD', `Rejected non-PDF request: "${filename}"`);
    return res.status(400).json({ success: false, error: 'Only PDF files may be downloaded.' });
  }

  const filePath = path.join(REPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    log('warn', 'DOWNLOAD', `File not found: "${filename}"`);
    return res.status(404).json({ success: false, error: 'Report not found.' });
  }

  log('info', 'DOWNLOAD', `Streaming "${filename}" to client.`);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', fs.statSync(filePath).size);

  const stream = fs.createReadStream(filePath);

  stream.on('error', (err) => {
    log('error', 'DOWNLOAD', `Stream error for "${filename}".`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to stream file.' });
    }
  });

  stream.on('end', () => {
    log('info', 'DOWNLOAD', `Finished streaming "${filename}".`);
  });

  stream.pipe(res);
});

// ─── 404 fallback ────────────────────────────────────────────────────────────
app.use((req, res) => {
  log('warn', 'ROUTER', `404 — ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: 'Route not found.' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  log('error', 'UNHANDLED', `Unhandled error on ${req.method} ${req.originalUrl}`, err.message);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  log('info', 'SERVER', `AnalysisAgent listening on http://localhost:${PORT}`);
  log('info', 'SERVER', `Reports directory: ${REPORTS_DIR}`);
});
