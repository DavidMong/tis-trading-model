'use strict';

// ─── Playwright PDF generator ─────────────────────────────────────────────────
// CLI:  node scripts/build-report-pdf.js <trade.json> <out.pdf>
//
// Computes the trade through the SAME verified flow engine that build-report.js /
// the dashboard use (no figure is recomputed differently — same pure functions,
// same opts), renders the McKinsey PDF document (scripts/report-pdf-renderer.js),
// and rasterises it to PDF via Playwright `page.pdf()` — A4, print background on,
// running header + "Page X of Y" footer. No browser print dialog is involved.
//
// Exports `renderTradePdf(trade, opts)` → Buffer so the local server can stream
// the PDF straight to the browser for auto-download.

const fs   = require('node:fs');
const path = require('node:path');

// The report renders through the SAME engine call the dashboard uses — `computeTrade`
// (the unified flow) UNCONDITIONALLY — never the per-trade `meta.flow` dispatch. The
// dashboard bundles only computeTrade and ignores meta.flow; the report must mirror it so
// the PDF is a faithful copy of the screen. `computeTrade` reproduces every legacy flow's
// P&L exactly for its own configuration (asserted FX1 / the computeTrade==computeEquityPartner
// invariant), so the reference trade stays byte-for-byte identical. The engine is not edited.
const { computeTrade }     = require('../engine/flows/trade');
const { runSensitivities } = require('../engine/core/sensitivities');
const { buildLadder }      = require('../engine/core/pricing-ladder');
const { generatePdfHtml, generateCoverHtml } = require('./report-pdf-renderer');

const ROOT = path.join(__dirname, '..');

// Filename slug — derived from the LIVE trade name (never the stale fixture meta.tradeId).
// Drops the parenthetical fixture/dummy caveat, then keeps word chars + hyphens, collapsing
// everything else to single hyphens. Falls back to 'trade' when the name is blank.
function slugifyTradeName(name) {
  const base = String(name || '')
    .replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample|EXAMPLE)[^)]*\)/gi, '')
    .trim();
  const slug = base
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'trade';
}

// Title shown in the running header — strip the parenthetical fixture/dummy caveat,
// matching the cover/dashboard. Kept here (not imported) so the header template is
// a plain string with no renderer coupling.
function headerTitle(name) {
  return String(name || 'Trade')
    .replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample|EXAMPLE)[^)]*\)/gi, '')
    .trim() || 'Trade';
}

// ─── Compute — IDENTICAL to the dashboard's recompute() ───────────────────────
// Mirrors scripts/build-interactive.js recompute() call-for-call: unconditional
// computeTrade(trade, {}), sensitivities on the NAFEM lever (RULE 1) with the
// hedge-compare recursion guard, and the ladder through the same guarded fn. No
// meta.flow dispatch — so the PDF reflects exactly what the screen computed.
function computeForReport(trade) {
  const res = computeTrade(trade, {});
  // RULE 1 (2026-06-23): NAFEM drives naira P&L, so the live FX sensitivity lever is NAFEM —
  // matching the dashboard. `skipHedgeCompare` is the same recursion guard recompute() passes.
  const fn = (t) => computeTrade(t, { skipHedgeCompare: true });
  res.sensitivities = runSensitivities(trade, fn, { fxMode: 'nafem' });
  const ladder = buildLadder(trade, fn, res);
  return { res, ladder };
}

// ─── Header / footer templates (Playwright) ───────────────────────────────────
// Chromium draws these inside the page top/bottom margins. The cover (page 1) is
// set to `@page :first { margin: 0 }` in the stylesheet, so there is no margin box
// on the cover and the header/footer are not drawn there — exactly the spec's
// "running header from page 2".
function headerTemplate(title) {
  return `
  <div style="width:100%; font-family:'Helvetica Neue',Arial,sans-serif; font-size:7pt; color:#717c89;
              padding:0 18mm; margin-top:8mm;">
    <div style="display:flex; justify-content:space-between; align-items:baseline;
                border-bottom:0.5px solid #d7dbe0; padding-bottom:4px;">
      <span style="font-weight:600; color:#242331;">${escapeHtml(title)}</span>
      <span>TIS Global Trading — Confidential</span>
    </div>
  </div>`;
}

function footerTemplate(dateStr) {
  return `
  <div style="width:100%; font-family:'Helvetica Neue',Arial,sans-serif; font-size:7pt; color:#717c89;
              padding:0 18mm; margin-bottom:6mm;">
    <div style="display:flex; justify-content:space-between; align-items:baseline;
                border-top:0.5px solid #eceef1; padding-top:4px;">
      <span>${escapeHtml(dateStr)}</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  </div>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Render one HTML string to a PDF Buffer on an existing browser.
async function htmlToPdf(browser, html, pdfOpts) {
  const page = await browser.newPage();
  try {
    // Print emulation so @page / break rules resolve as for paged media.
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf(pdfOpts);
  } finally {
    await page.close();
  }
}

// ─── Render to PDF buffer ─────────────────────────────────────────────────────
// Two-pass + merge: Chromium draws its header/footer band on EVERY page (the
// @page:first margin:0 trick does not suppress it), so the spec's "clean cover,
// running header from page 2" is produced by rendering the cover separately with
// NO header/footer and splicing it in front of the body pages — which keep the
// document's own correct "Page X of Y" numbering (cover stays unnumbered, body
// reads "Page 2 of N" onward).
//
// opts.browser — reuse a warm Playwright browser (the server keeps one alive);
//                when omitted a fresh chromium is launched and closed per call.
// opts.generatedAt — override timestamp (so tests/golden runs are deterministic).
async function renderTradePdf(trade, opts = {}) {
  const { chromium } = require('playwright');
  const { PDFDocument } = require('pdf-lib');
  const { res, ladder } = computeForReport(trade);
  const generatedAt = opts.generatedAt
    || (new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC');

  const fullHtml  = generatePdfHtml(trade, res, ladder, generatedAt);
  const coverHtml = generateCoverHtml(trade, res, generatedAt);
  const title = headerTitle(res.meta.tradeName);

  const ownBrowser = !opts.browser;
  const browser = opts.browser || await chromium.launch();
  try {
    // Pass 1 — full document WITH running header + "Page X of Y" footer (all pages).
    const fullPdf = await htmlToPdf(browser, fullHtml, {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(title),
      footerTemplate: footerTemplate(generatedAt),
    });
    // Pass 2 — cover only, NO header/footer (clean first page).
    const coverPdf = await htmlToPdf(browser, coverHtml, {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });

    // Merge: clean cover + body pages (page 1 of the full doc — its headered cover — is dropped).
    const out      = await PDFDocument.create();
    const fullDoc  = await PDFDocument.load(fullPdf);
    const coverDoc = await PDFDocument.load(coverPdf);
    const [cover]  = await out.copyPages(coverDoc, [0]);
    out.addPage(cover);
    const bodyIdx  = fullDoc.getPageIndices().slice(1);   // drop the headered cover
    const bodyPages = await out.copyPages(fullDoc, bodyIdx);
    bodyPages.forEach((p) => out.addPage(p));
    out.setTitle(`${res.meta.tradeName || res.meta.tradeId} — Commercial Trade Analysis`);
    out.setAuthor('TIS Global Trading');
    const pdf = Buffer.from(await out.save());

    // Filename reflects the LIVE trade name (slugified), NOT the stale fixture meta.tradeId.
    const fileName = slugifyTradeName(res.meta.tradeName) + '.pdf';
    return { pdf, res, tradeId: res.meta.tradeId, fileName };
  } finally {
    if (ownBrowser) await browser.close();
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const tradeFile = process.argv[2] || path.join(ROOT, 'trades', 'reference-trade-001.json');
  const trade = JSON.parse(fs.readFileSync(path.resolve(tradeFile), 'utf8'));

  const { pdf, fileName } = await renderTradePdf(trade);
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(ROOT, 'out', fileName);   // default out name = live-trade slug

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outPath, pdf);
  console.log(`PDF → ${outPath}  (${(pdf.length / 1024).toFixed(0)} KB)`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { renderTradePdf, computeForReport, headerTitle };
