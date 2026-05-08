'use strict';

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

// ─── Layout ──────────────────────────────────────────────────────────────────
const PW   = 595.28;   // A4 width  (pt)
const PH   = 841.89;   // A4 height (pt)
const M    = 50;       // side margin
const CW   = PW - M * 2;
const FOOT = 45;       // footer zone height from bottom

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  navy:   '#0f172a', blue:   '#2563eb', sky:    '#38bdf8',
  accent: '#dbeafe', text:   '#1e293b', muted:  '#64748b',
  border: '#e2e8f0', white:  '#ffffff', light:  '#f8fafc',
  green:  '#16a34a', yellow: '#ca8a04', red:    '#dc2626',
};

// ─── Dimension definitions ────────────────────────────────────────────────────
const DIMENSIONS = [
  {
    num:      1,
    title:    'Price Analysis',
    subtitle: 'Market positioning and price architecture',
    dimId:    'D1',
    build: (a) => {
      const dim = a.dimensions.find((d) => d.id === 'D1') ?? {};
      return { summary: dim.summary ?? '', bullets: dim.insights ?? [], conclusion: dim.conclusion ?? '' };
    },
  },
  {
    num:      2,
    title:    'Core Selling Points',
    subtitle: 'Key features, USPs, innovation, and brand identity',
    dimId:    'D2',
    build: (a) => {
      const dim = a.dimensions.find((d) => d.id === 'D2') ?? {};
      return { summary: dim.summary ?? '', bullets: dim.insights ?? [], conclusion: dim.conclusion ?? '' };
    },
  },
  {
    num:      3,
    title:    'Sales Channels',
    subtitle: 'Online and offline go-to-market footprint in China',
    dimId:    'D3',
    build: (a) => {
      const dim = a.dimensions.find((d) => d.id === 'D3') ?? {};
      return { summary: dim.summary ?? '', bullets: dim.insights ?? [], conclusion: dim.conclusion ?? '' };
    },
  },
  {
    num:      4,
    title:    'Target Audience',
    subtitle: 'Consumer demographics and psychographic profile',
    dimId:    'D4',
    build: (a) => {
      const dim = a.dimensions.find((d) => d.id === 'D4') ?? {};
      return { summary: dim.summary ?? '', bullets: dim.insights ?? [], conclusion: dim.conclusion ?? '' };
    },
  },
  {
    num:      5,
    title:    'Competitive Landscape',
    subtitle: 'Market share, rival analysis, and strategic threats',
    dimId:    'D5',
    build: (a) => {
      const dim = a.dimensions.find((d) => d.id === 'D5') ?? {};
      return { summary: dim.summary ?? '', bullets: dim.insights ?? [], conclusion: dim.conclusion ?? '' };
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function filenameDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function footer(doc, brand, dateStr, pageNum) {
  const y = PH - FOOT + 8;
  doc
    .save()
    .moveTo(M, y - 6).lineTo(PW - M, y - 6)
    .strokeColor(C.border).lineWidth(0.5).stroke()
    .font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text(brand, M, y, { width: 160, align: 'left', lineBreak: false })
    .text(dateStr, M + 160, y, { width: CW - 320, align: 'center', lineBreak: false })
    .text(`Page ${pageNum}`, M + CW - 160, y, { width: 160, align: 'right', lineBreak: false })
    .restore();
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function coverPage(doc, brand, dateStr, analysis) {
  // Background
  doc.rect(0, 0, PW, PH).fill(C.navy);

  // Top accent bar
  doc.rect(0, 0, PW, 6).fill(C.blue);

  // Side accent strip
  doc.rect(0, 0, 6, PH).fill(C.blue);

  // Brand name
  doc
    .font('Helvetica-Bold').fontSize(46).fillColor(C.white)
    .text(brand, M + 20, 160, { width: CW, align: 'center' });

  // Report title
  doc
    .font('Helvetica').fontSize(17).fillColor(C.sky)
    .text('China Market Analysis Report', M + 20, 220, { width: CW, align: 'center' });

  // Divider
  const midX = PW / 2;
  doc.moveTo(midX - 70, 255).lineTo(midX + 70, 255)
    .strokeColor(C.blue).lineWidth(2).stroke();

  // Date
  doc
    .font('Helvetica').fontSize(11).fillColor(C.muted)
    .text(dateStr, M + 20, 270, { width: CW, align: 'center' });

  // Metric cards
  const cards = [
    { label: 'Sentiment Score', value: String(analysis.sentimentScore) + ' / 100' },
    { label: 'Market Trend',    value: analysis.marketTrend.toUpperCase() },
  ];
  const cardW = 180;
  const cardGap = 24;
  const totalW = cards.length * cardW + (cards.length - 1) * cardGap;
  const startX = (PW - totalW) / 2;

  cards.forEach(({ label, value }, i) => {
    const x = startX + i * (cardW + cardGap);
    const y = 340;
    const trendColor = { GROWING: C.green, STABLE: C.yellow, DECLINING: C.red }[value] ?? C.white;
    const valueColor = label === 'Market Trend' ? trendColor : C.sky;

    doc.roundedRect(x, y, cardW, 90, 10)
      .fillAndStroke('#1e293b', C.blue);

    doc.font('Helvetica-Bold').fontSize(28).fillColor(valueColor)
      .text(value, x, y + 14, { width: cardW, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text(label, x, y + 57, { width: cardW, align: 'center' });
  });

  // Recommendations teaser
  const recY = 480;
  doc.rect(M + 20, recY, CW - 20, 1).fill('#1e3a5f');
  doc
    .font('Helvetica-Bold').fontSize(10).fillColor(C.sky)
    .text('KEY RECOMMENDATIONS', M + 20, recY + 14, { width: CW - 20 });

  const shown = analysis.recommendations.slice(0, 3);
  shown.forEach((rec, i) => {
    doc.font('Helvetica').fontSize(9.5).fillColor('#94a3b8')
      .text(`${i + 1}.  ${rec}`, M + 30, recY + 36 + i * 22, { width: CW - 40 });
  });

  // Generated-by badge
  doc.rect(0, PH - 52, PW, 52).fill('#070d1a');
  doc
    .font('Helvetica').fontSize(9).fillColor('#475569')
    .text('Generated by AI Agent  ·  AnalysisAgent  ·  Powered by Claude', M, PH - 30, {
      width: CW, align: 'center',
    });
}

// ─── Table of contents ────────────────────────────────────────────────────────

function tocPage(doc, brand, dateStr, analysis) {
  // Header bar
  doc.rect(0, 0, PW, 72).fill(C.navy);
  doc
    .font('Helvetica-Bold').fontSize(22).fillColor(C.white)
    .text('Table of Contents', M, 24, { width: CW });

  let y = 110;

  const entries = [
    { num: '—', title: 'Cover', pg: 1 },
    { num: '—', title: 'Table of Contents', pg: 2 },
    ...DIMENSIONS.map((d, i) => ({ num: String(d.num), title: d.title, pg: i + 3 })),
  ];

  entries.forEach(({ num, title, pg }, idx) => {
    const isSection = num !== '—';
    const bg = idx % 2 === 0 ? C.light : C.white;
    doc.rect(M, y, CW, 32).fill(bg);

    if (isSection) {
      doc.rect(M, y, 4, 32).fill(C.blue);
      doc
        .font('Helvetica-Bold').fontSize(10).fillColor(C.blue)
        .text(`0${num}`, M + 12, y + 9, { width: 24 });
    }

    doc
      .font(isSection ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(10)
      .fillColor(C.text)
      .text(title, M + (isSection ? 44 : 14), y + 9, { width: CW - 80 });

    // Dot leaders
    const dotsX = M + CW - 64;
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text('· · · · · · ·', dotsX - 60, y + 10, { width: 60, align: 'right' });

    doc
      .font('Helvetica-Bold').fontSize(10).fillColor(C.navy)
      .text(String(pg), M + CW - 28, y + 9, { width: 28, align: 'right' });

    y += 32;
  });

  // Sentiment summary box
  const sY = y + 30;
  doc.roundedRect(M, sY, CW, 78, 8).fill(C.accent);
  doc
    .font('Helvetica-Bold').fontSize(11).fillColor(C.blue)
    .text('Executive Summary', M + 16, sY + 14, { width: CW - 32 });
  doc
    .font('Helvetica').fontSize(9.5).fillColor(C.text)
    .text(
      `${brand} achieved a sentiment score of ${analysis.sentimentScore}/100 with a ${analysis.marketTrend} market trend. ` +
        `This report covers ${DIMENSIONS.length} strategic dimensions drawn from live market data.`,
      M + 16,
      sY + 34,
      { width: CW - 32, lineGap: 3 },
    );

  footer(doc, brand, dateStr, 2);
}

// ─── Dimension page ───────────────────────────────────────────────────────────

function dimensionPage(doc, brand, dateStr, pageNum, dim, analysis) {
  const { title, subtitle, build } = dim;
  const { summary, bullets, conclusion } = build(analysis);

  // Header bar
  doc.rect(0, 0, PW, 76).fill(C.navy);
  doc.rect(0, 0, PW, 6).fill(C.blue);

  // Circle badge with number
  const bx = M + 22;
  const by = 38;
  doc.circle(bx, by, 20).fillColor(C.blue).fill();
  doc
    .font('Helvetica-Bold').fontSize(18).fillColor(C.white)
    .text(String(dim.num), bx - 6, by - 10, { width: 14, align: 'center', lineBreak: false });

  // Title + subtitle
  doc
    .font('Helvetica-Bold').fontSize(19).fillColor(C.white)
    .text(title, M + 56, 20, { width: CW - 60 });
  doc
    .font('Helvetica').fontSize(9.5).fillColor('#94a3b8')
    .text(subtitle, M + 56, 47, { width: CW - 60 });

  let y = 100;

  // ── Summary paragraph ──────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold').fontSize(10).fillColor(C.blue)
    .text('OVERVIEW', M, y);
  y += 16;

  doc.rect(M, y, CW, 1).fill(C.border);
  y += 10;

  doc
    .font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(summary, M, y, { width: CW, lineGap: 4 });
  y = doc.y + 20;

  // ── Bullet insights ────────────────────────────────────────────────────────
  doc
    .font('Helvetica-Bold').fontSize(10).fillColor(C.blue)
    .text('KEY INSIGHTS', M, y);
  y += 16;
  doc.rect(M, y, CW, 1).fill(C.border);
  y += 10;

  const cappedBullets = bullets.slice(0, 9);
  cappedBullets.forEach((item) => {
    if (y > PH - FOOT - 140) return; // guard: leave room for conclusion

    // Tag prefix extraction
    const tagMatch = item.match(/^\[([^\]]+)\]\s*/);
    const tag   = tagMatch ? tagMatch[1] : null;
    const label = tagMatch ? item.replace(tagMatch[0], '') : item;

    // Row background
    doc.rect(M, y, CW, 22).fill(C.light);

    // Bullet dot
    doc.circle(M + 8, y + 11, 3).fill(C.blue);

    let textX = M + 18;

    // Tag badge
    if (tag) {
      const tagW = 54;
      doc.roundedRect(textX, y + 5, tagW, 13, 3).fill(C.accent);
      doc
        .font('Helvetica-Bold').fontSize(7).fillColor(C.blue)
        .text(tag.toUpperCase(), textX + 2, y + 8, { width: tagW - 4, lineBreak: false });
      textX += tagW + 6;
    }

    doc
      .font('Helvetica').fontSize(9.5).fillColor(C.text)
      .text(label, textX, y + 6, { width: CW - (textX - M) - 4, lineBreak: false });

    y += 24;
  });

  y += 10;

  // ── Conclusion box ─────────────────────────────────────────────────────────
  if (conclusion) {
    const boxH = 74;
    const boxY = Math.max(y, PH - FOOT - boxH - 30);

    doc.roundedRect(M, boxY, CW, boxH, 8)
      .fillAndStroke(C.accent, C.blue);

    doc
      .font('Helvetica-Bold').fontSize(9.5).fillColor(C.blue)
      .text('STRATEGIC CONCLUSION', M + 14, boxY + 12, { width: CW - 28 });

    doc
      .font('Helvetica').fontSize(9.5).fillColor(C.text)
      .text(conclusion, M + 14, boxY + 30, { width: CW - 28, lineGap: 3 });
  }

  footer(doc, brand, dateStr, pageNum);
}

// ─── Public API ───────────────────────────────────────────────────────────────

function generatePDF(analysis) {
  const now       = new Date();
  const dateStr   = fmt(now);
  const brand     = analysis.brand;
  const reportsDir = path.join(__dirname, 'Reports');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const filename = `${filenameDate(now)} ${brand} Analysis.pdf`;
  const filePath = path.join(reportsDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    const out = fs.createWriteStream(filePath);

    doc.pipe(out);
    out.on('error', reject);
    out.on('finish', () => resolve(filePath));

    // ── Page 1: Cover ──────────────────────────────────────────────────────
    coverPage(doc, brand, dateStr, analysis);

    // ── Page 2: Table of contents ──────────────────────────────────────────
    doc.addPage();
    tocPage(doc, brand, dateStr, analysis);

    // ── Pages 3-7: Dimensions ──────────────────────────────────────────────
    DIMENSIONS.forEach((dim, i) => {
      doc.addPage();
      dimensionPage(doc, brand, dateStr, i + 3, dim, analysis);
    });

    doc.end();
  });
}

module.exports = { generatePDF };
