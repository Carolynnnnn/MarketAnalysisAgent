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

// Fixed spacing constants (used across all row-based sections)
const ROW_GAP      = 4;   // gap between consecutive rows (KEY INSIGHTS, refs)
const REC_GAP      = 10;  // gap between KEY RECOMMENDATIONS items
const ROW_H_MIN    = 30;  // minimum row height for KEY INSIGHTS rows
const ROW_PAD_V    = 8;   // top/bottom text padding inside a row

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
    .text(brand,            M,             y, { width: 160,       align: 'left',   lineBreak: false })
    .text(dateStr,          M + 160,       y, { width: CW - 320,  align: 'center', lineBreak: false })
    .text(`Page ${pageNum}`,M + CW - 160,  y, { width: 160,       align: 'right',  lineBreak: false })
    .restore();
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function coverPage(doc, brand, dateStr, analysis) {
  // Background
  doc.rect(0, 0, PW, PH).fill(C.navy);
  doc.rect(0, 0, PW, 6).fill(C.blue);   // top accent bar
  doc.rect(0, 0, 6, PH).fill(C.blue);   // side accent strip

  // Brand name — dynamic font size so long names never overflow into subtitle/cards
  // Try decreasing sizes until single-line OR until we reach the min size
  const brandSizes = [46, 38, 30, 24, 20];
  let brandFontSize = 46;
  let brandLineCount = 1;
  for (const sz of brandSizes) {
    doc.font('Helvetica-Bold').fontSize(sz);
    const singleLineW = doc.widthOfString(brand);
    if (singleLineW <= CW - 10) {
      brandFontSize = sz;
      brandLineCount = 1;
      break;
    }
    // Estimate how many lines it will wrap to at this size
    const lines = Math.ceil(singleLineW / (CW - 10));
    if (lines <= 2) {
      brandFontSize = sz;
      brandLineCount = lines;
      break;
    }
    brandFontSize = sz; // keep trying smaller
    brandLineCount = lines;
  }

  // Brand name Y: always start at 130, but cap so cards don't get pushed below 330
  const brandNameY = 130;
  doc.font('Helvetica-Bold').fontSize(brandFontSize).fillColor(C.white)
    .text(brand, M + 10, brandNameY, { width: CW, align: 'center' });

  // Compute Y after brand name — use doc.y (PDFKit tracks the current write cursor)
  const afterBrandY = Math.max(doc.y + 10, brandNameY + brandFontSize * brandLineCount + 12);

  // Report title — positioned immediately after brand name
  const subtitleY = Math.min(afterBrandY, 240);
  doc.font('Helvetica').fontSize(17).fillColor(C.sky)
    .text('China Market Analysis Report', M + 20, subtitleY, { width: CW, align: 'center' });

  // Divider & Date — fixed gap below subtitle
  const dividerY = subtitleY + 32;
  const midX = PW / 2;
  doc.moveTo(midX - 70, dividerY).lineTo(midX + 70, dividerY)
    .strokeColor(C.blue).lineWidth(2).stroke();

  doc.font('Helvetica').fontSize(11).fillColor(C.muted)
    .text(dateStr, M + 20, dividerY + 12, { width: CW, align: 'center' });

  // Metric cards — always at Y=340 minimum, pushed down if brand name is very long
  const cardsY = Math.max(dividerY + 36, 330);

  // Metric cards
  const cards = [
    { label: 'Sentiment Score', value: String(analysis.sentimentScore) + ' / 100' },
    { label: 'Market Trend',    value: analysis.marketTrend.toUpperCase() },
  ];
  const cardW    = 180;
  const cardGap  = 24;
  const totalW   = cards.length * cardW + (cards.length - 1) * cardGap;
  const startX   = (PW - totalW) / 2;

  cards.forEach(({ label, value }, i) => {
    const x = startX + i * (cardW + cardGap);
    const y = cardsY;
    const trendColor = { GROWING: C.green, STABLE: C.yellow, DECLINING: C.red }[value] ?? C.white;
    const valueColor = label === 'Market Trend' ? trendColor : C.sky;
    doc.roundedRect(x, y, cardW, 90, 10).fillAndStroke('#1e293b', C.blue);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(valueColor)
      .text(value, x, y + 14, { width: cardW, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text(label, x, y + 57, { width: cardW, align: 'center' });
  });

  // ── KEY RECOMMENDATIONS section ──────────────────────────────────────────
  const badgeTop  = PH - 52;
  // secTop = 20pt below bottom of metric cards; never above 460 or below 560
  const secTop    = Math.min(560, Math.max(460, cardsY + 90 + 20));
  const secPad    = 14;          // internal padding inside card
  const recW      = CW - 40;    // text width for each recommendation
  const titleH    = 22;         // height for section label row
  const available = badgeTop - secTop - secPad * 2 - titleH - 6; // usable height for text

  const recs = analysis.recommendations.slice(0, 3);

  // Pre-measure every recommendation at font 9.5
  doc.font('Helvetica').fontSize(9.5);
  const recHeights = recs.map((rec, i) =>
    doc.heightOfString(`${i + 1}.  ${rec}`, { width: recW, lineGap: 2 })
  );

  // Decide which recommendations fit within the available area
  // (include REC_GAP between items)
  let fitsCount = 0;
  let usedH = 0;
  for (let i = 0; i < recHeights.length; i++) {
    const needed = recHeights[i] + (i > 0 ? REC_GAP : 0);
    if (usedH + needed <= available) {
      usedH += needed;
      fitsCount++;
    } else {
      break;
    }
  }

  // Draw card background for the whole section
  const cardH = secPad + titleH + 6 + usedH + secPad;
  doc.roundedRect(M + 10, secTop, CW - 10, cardH, 6).fill('#0d1f3c');

  // Section label
  doc.rect(M + 10, secTop, CW - 10, 1).fill('#1e3a5f');
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.sky)
    .text('KEY RECOMMENDATIONS', M + 24, secTop + secPad, { width: CW - 30 });

  // Render only the recommendations that fit, with fixed REC_GAP spacing
  let recTextY = secTop + secPad + titleH + 6;
  recs.slice(0, fitsCount).forEach((rec, i) => {
    if (i > 0) recTextY += REC_GAP;
    doc.font('Helvetica').fontSize(9.5).fillColor('#94a3b8')
      .text(`${i + 1}.  ${rec}`, M + 24, recTextY, { width: recW, lineGap: 2 });
    recTextY += recHeights[i]; // advance by exact pre-measured height
  });

  // Generated-by badge
  doc.rect(0, badgeTop, PW, 52).fill('#070d1a');
  doc.font('Helvetica').fontSize(9).fillColor('#475569')
    .text('Generated by AI Agent  ·  AnalysisAgent  ·  Powered by Claude', M, PH - 30, {
      width: CW, align: 'center',
    });
}

// ─── Table of contents ────────────────────────────────────────────────────────

function tocPage(doc, brand, dateStr, analysis) {
  doc.rect(0, 0, PW, 72).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(22).fillColor(C.white)
    .text('Table of Contents', M, 24, { width: CW });

  let y = 110;

  const entries = [
    { num: '—', title: 'Cover', pg: 1 },
    { num: '—', title: 'Table of Contents', pg: 2 },
    ...DIMENSIONS.map((d, i) => ({ num: String(d.num), title: d.title, pg: i + 3 })),
    { num: String(DIMENSIONS.length + 1), title: 'References & Source Verification', pg: DIMENSIONS.length + 3 },
  ];

  entries.forEach(({ num, title, pg }, idx) => {
    const isSection = num !== '—';
    const bg = idx % 2 === 0 ? C.light : C.white;
    doc.rect(M, y, CW, 32).fill(bg);

    if (isSection) {
      doc.rect(M, y, 4, 32).fill(C.blue);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.blue)
        .text(`0${num}`, M + 12, y + 9, { width: 24 });
    }

    doc.font(isSection ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(C.text)
      .text(title, M + (isSection ? 44 : 14), y + 9, { width: CW - 80 });

    const dotsX = M + CW - 64;
    doc.font('Helvetica').fontSize(9).fillColor(C.muted)
      .text('· · · · · · ·', dotsX - 60, y + 10, { width: 60, align: 'right' });

    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy)
      .text(String(pg), M + CW - 28, y + 9, { width: 28, align: 'right' });

    y += 32;
  });

  const sY = y + 30;
  doc.roundedRect(M, sY, CW, 78, 8).fill(C.accent);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.blue)
    .text('Executive Summary', M + 16, sY + 14, { width: CW - 32 });
  doc.font('Helvetica').fontSize(9.5).fillColor(C.text)
    .text(
      `${brand} achieved a sentiment score of ${analysis.sentimentScore}/100 with a ${analysis.marketTrend} market trend. ` +
        `This report covers ${DIMENSIONS.length} strategic dimensions drawn from live market data.`,
      M + 16, sY + 34, { width: CW - 32, lineGap: 3 },
    );

  footer(doc, brand, dateStr, 2);
}

// ─── Dimension page ───────────────────────────────────────────────────────────

function dimensionPage(doc, brand, dateStr, pageNum, dim, analysis) {
  const { title, subtitle, build } = dim;
  const { summary, bullets, conclusion } = build(analysis);

  doc.rect(0, 0, PW, 76).fill(C.navy);
  doc.rect(0, 0, PW, 6).fill(C.blue);

  const bx = M + 22;
  const by = 38;
  doc.circle(bx, by, 20).fillColor(C.blue).fill();
  doc.font('Helvetica-Bold').fontSize(18).fillColor(C.white)
    .text(String(dim.num), bx - 6, by - 10, { width: 14, align: 'center', lineBreak: false });

  doc.font('Helvetica-Bold').fontSize(19).fillColor(C.white)
    .text(title, M + 56, 20, { width: CW - 60 });
  doc.font('Helvetica').fontSize(9.5).fillColor('#94a3b8')
    .text(subtitle, M + 56, 47, { width: CW - 60 });

  let y = 100;

  // ── Overview ───────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.blue).text('OVERVIEW', M, y);
  y += 16;
  doc.rect(M, y, CW, 1).fill(C.border);
  y += 10;
  doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
    .text(summary, M, y, { width: CW, lineGap: 4 });
  y = doc.y + 20;

  // ── KEY INSIGHTS ──────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.blue).text('KEY INSIGHTS', M, y);
  y += 16;
  doc.rect(M, y, CW, 1).fill(C.border);
  y += 10;

  // Reserve space for the conclusion box
  doc.font('Helvetica').fontSize(9.5);
  const conclusionH = conclusion
    ? doc.heightOfString(conclusion, { width: CW - 28, lineGap: 3 })
    : 0;
  const conclusionBoxH = conclusion ? conclusionH + 36 : 0;
  const insightsBottom = PH - FOOT - conclusionBoxH - (conclusionBoxH > 0 ? 16 : 10);

  const cappedBullets = bullets.slice(0, 9);
  cappedBullets.forEach((item) => {
    // Tag prefix extraction
    const tagMatch = item.match(/^\[([^\]]+)\]\s*/);
    const tag   = tagMatch ? tagMatch[1] : null;
    const label = tagMatch ? item.replace(tagMatch[0], '') : item;

    // Compute dynamic tag badge width first so textWidth is accurate
    let tagW = 0;
    if (tag) {
      doc.font('Helvetica-Bold').fontSize(7);
      tagW = Math.min(90, Math.max(40, doc.widthOfString(tag.toUpperCase()) + 8));
    }
    const textX    = M + 18 + (tag ? tagW + 6 : 0);
    const textWidth = CW - (textX - M) - 4;

    // Pre-measure text height
    doc.font('Helvetica').fontSize(9.5);
    const labelH = doc.heightOfString(label, { width: textWidth, lineGap: 2 });
    const rowH   = Math.max(ROW_H_MIN, labelH + ROW_PAD_V * 2);

    // Guard: skip if row would overlap conclusion box area
    if (y + rowH > insightsBottom) return;

    // Row background
    doc.rect(M, y, CW, rowH).fill(C.light);

    // Bullet dot (vertically centred)
    doc.circle(M + 8, y + rowH / 2, 3).fill(C.blue);

    let curX = M + 18;

    // Tag badge
    if (tag) {
      doc.roundedRect(curX, y + (rowH - 13) / 2, tagW, 13, 3).fill(C.accent);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.blue)
        .text(tag.toUpperCase(), curX + 2, y + (rowH - 13) / 2 + 3,
          { width: tagW - 4, lineBreak: false, ellipsis: true });
      curX += tagW + 6;
    }

    // Text — wrapping enabled, top-padded by ROW_PAD_V
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text)
      .text(label, curX, y + ROW_PAD_V, { width: CW - (curX - M) - 4, lineGap: 2 });

    y += rowH + ROW_GAP; // fixed ROW_GAP between every row
  });

  y += 6;

  // ── Conclusion box ─────────────────────────────────────────────────────────
  if (conclusion && conclusionBoxH > 0) {
    const boxY = Math.min(y, PH - FOOT - conclusionBoxH - 10);
    if (boxY >= 76 && boxY + conclusionBoxH < PH - FOOT) {
      doc.roundedRect(M, boxY, CW, conclusionBoxH, 8).fillAndStroke(C.accent, C.blue);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.blue)
        .text('STRATEGIC CONCLUSION', M + 14, boxY + 12, { width: CW - 28 });
      doc.font('Helvetica').fontSize(9.5).fillColor(C.text)
        .text(conclusion, M + 14, boxY + 30, { width: CW - 28, lineGap: 3 });
    }
  }

  footer(doc, brand, dateStr, pageNum);
}

// ─── References page (supports automatic continuation pages) ─────────────────

const SOURCE_TYPE_LABELS = {
  official_ir:     'Official IR',
  industry_report: 'Industry Report',
  regulatory:      'Regulatory',
  platform_data:   'Platform Data',
  news_media:      'News Media',
  estimated:       'Estimated',
};

const RELIABILITY_COLORS = { high: C.green, medium: C.yellow, low: C.red };

const dimColors = { D1: '#2563eb', D2: '#7c3aed', D3: '#0891b2', D4: '#059669', D5: '#d97706', general: '#64748b' };

/**
 * Draw the References page header and return the starting y for content.
 * Used for page 1 and continuation pages.
 */
function drawRefsHeader(doc, isContinuation) {
  doc.rect(0, 0, PW, isContinuation ? 44 : 76).fill(C.navy);
  doc.rect(0, 0, PW, 6).fill(C.blue);

  if (!isContinuation) {
    doc.circle(M + 22, 38, 20).fillColor(C.blue).fill();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.white)
      .text('REF', M + 6, 30, { width: 34, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(19).fillColor(C.white)
      .text('References & Source Verification', M + 56, 20, { width: CW - 60 });
    doc.font('Helvetica').fontSize(9.5).fillColor('#94a3b8')
      .text('AI-cited sources for key claims — verify URLs independently before citation',
        M + 56, 47, { width: CW - 60 });
    return 96;
  } else {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.white)
      .text('References & Source Verification (continued)', M + 14, 16, { width: CW });
    return 54;
  }
}

/**
 * Draw the column header row and return the new y.
 */
function drawRefsTableHeader(doc, y, colId, colDim, colBody, colSrc) {
  doc.rect(M, y, CW, 18).fill(C.navy);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.sky)
    .text('#',             M + 4,                       y + 5, { width: colId,   lineBreak: false })
    .text('DIM',           M + colId + 4,               y + 5, { width: colDim,  lineBreak: false })
    .text('CLAIM & SOURCE',M + colId + colDim + 4,      y + 5, { width: colBody, lineBreak: false })
    .text('RELIABILITY',   M + colId + colDim + colBody + 8, y + 5, { width: colSrc, lineBreak: false });
  return y + 20;
}

function referencesPage(doc, brand, dateStr, startPageNum, analysis) {
  const refs       = analysis.referencesData?.references ?? [];
  const disclaimer = analysis.referencesData?.disclaimer ?? '';

  let pageNum = startPageNum;
  let y = drawRefsHeader(doc, false);

  if (refs.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(C.muted)
      .text('Reference data unavailable for this report.', M, y);
    footer(doc, brand, dateStr, pageNum);
    return;
  }

  // Column widths
  const colId   = 30;
  const colDim  = 34;
  const colBody = CW - colId - colDim - 100 - 10;
  const colSrc  = 100;

  y = drawRefsTableHeader(doc, y, colId, colDim, colBody, colSrc);

  // Pre-compute disclaimer box height
  doc.font('Helvetica').fontSize(7.5);
  const disclTextH = disclaimer
    ? doc.heightOfString(disclaimer, { width: CW - 20, lineGap: 1.5 })
    : 0;
  const disclBoxH  = disclaimer ? disclTextH + 30 : 0;

  // Bottom threshold: on the LAST page we need room for disclaimer + gap
  // On non-last pages we just need to avoid the footer
  const footerTop  = PH - FOOT;
  const bodyBottom = footerTop - 8; // content must stay above this

  refs.forEach((ref, idx) => {
    const bg       = idx % 2 === 0 ? C.light : C.white;
    const relColor = RELIABILITY_COLORS[ref.reliability] ?? C.muted;
    const typeLabel= SOURCE_TYPE_LABELS[ref.sourceType] ?? ref.sourceType ?? '';
    const claimX   = M + colId + colDim + 4;
    const claimText= `"${(ref.claimExcerpt ?? '').slice(0, 110)}"`;
    const srcText  = ref.source ?? '';

    // Pre-measure row height
    doc.font('Helvetica').fontSize(8);
    const claimH = doc.heightOfString(claimText, { width: colBody - 4 });
    doc.font('Helvetica-Bold').fontSize(7.5);
    const srcH   = doc.heightOfString(srcText,   { width: colBody - 4 });
    const rowH   = Math.max(46, claimH + srcH + 22);

    // ── Overflow: start a new page ──────────────────────────────────────────
    if (y + rowH > bodyBottom) {
      footer(doc, brand, dateStr, pageNum);
      doc.addPage();
      pageNum++;
      y = drawRefsHeader(doc, true);
      y = drawRefsTableHeader(doc, y, colId, colDim, colBody, colSrc);
    }

    doc.rect(M, y, CW, rowH).fill(bg);
    doc.rect(M, y, 3, rowH).fill(dimColors[ref.dimension] ?? C.muted);

    // ID
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted)
      .text(ref.id ?? `R${String(idx + 1).padStart(2, '0')}`,
        M + 6, y + 8, { width: colId - 4, lineBreak: false });

    // Dimension badge
    doc.roundedRect(M + colId + 2, y + 8, 28, 12, 3)
      .fill(dimColors[ref.dimension] ?? C.muted);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
      .text(ref.dimension ?? '—', M + colId + 4, y + 11, { width: 24, lineBreak: false });

    // Claim excerpt
    doc.font('Helvetica').fontSize(8).fillColor(C.text)
      .text(claimText, claimX, y + 4, { width: colBody - 4, lineGap: 1 });
    const afterClaim = doc.y + 3;

    // Source name
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.blue)
      .text(srcText, claimX, afterClaim, { width: colBody - 4, lineGap: 1 });
    const afterSrc = doc.y + 2;

    // URL — single line with ellipsis
    if (ref.url) {
      doc.font('Helvetica').fontSize(7).fillColor(C.muted)
        .text(ref.url, claimX, afterSrc, {
          width: colBody - 4, lineBreak: false, ellipsis: true, link: ref.url,
        });
    }

    // Reliability column — anchored to row top
    const relX = M + colId + colDim + colBody + 8;
    doc.circle(relX + 5, y + 12, 4).fill(relColor);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(relColor)
      .text((ref.reliability ?? '').toUpperCase(), relX + 12, y + 8,  { width: colSrc - 16, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(C.muted)
      .text(typeLabel,                             relX + 12, y + 21, { width: colSrc - 16, lineBreak: false });
    if (ref.needsVerification) {
      doc.font('Helvetica').fontSize(6.5).fillColor(C.yellow)
        .text('⚠ verify URL',                     relX + 12, y + 32, { width: colSrc - 16, lineBreak: false });
    }

    y += rowH + ROW_GAP;
  });

  // ── Disclaimer box ────────────────────────────────────────────────────────
  if (disclaimer && disclBoxH > 0) {
    // If the disclaimer doesn't fit on the current page, add a new page
    if (y + 10 + disclBoxH > bodyBottom) {
      footer(doc, brand, dateStr, pageNum);
      doc.addPage();
      pageNum++;
      y = drawRefsHeader(doc, true);
    }

    const disclY = y + 10;
    doc.roundedRect(M, disclY, CW, disclBoxH, 6)
      .fill('#fefce8').stroke('#fef08a');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#854d0e')
      .text('DISCLAIMER', M + 10, disclY + 8, { width: CW - 20 });
    doc.font('Helvetica').fontSize(7.5).fillColor('#92400e')
      .text(disclaimer, M + 10, disclY + 20, { width: CW - 20, lineGap: 1.5 });
  }

  footer(doc, brand, dateStr, pageNum);
}

// ─── Public API ───────────────────────────────────────────────────────────────

function generatePDF(analysis) {
  const now        = new Date();
  const dateStr    = fmt(now);
  const brand      = analysis.brand;
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

    // Page 1: Cover
    coverPage(doc, brand, dateStr, analysis);

    // Page 2: Table of contents
    doc.addPage();
    tocPage(doc, brand, dateStr, analysis);

    // Pages 3-7: Dimensions
    DIMENSIONS.forEach((dim, i) => {
      doc.addPage();
      dimensionPage(doc, brand, dateStr, i + 3, dim, analysis);
    });

    // Page 8+: References (may span multiple pages if refs are many)
    doc.addPage();
    referencesPage(doc, brand, dateStr, DIMENSIONS.length + 3, analysis);

    doc.end();
  });
}

module.exports = { generatePDF };
