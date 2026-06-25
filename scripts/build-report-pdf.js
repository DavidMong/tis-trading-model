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

const { computeEquityPartner }   = require('../engine/flows/equity-partner');
const { computeStraightExship }  = require('../engine/flows/straight-exship');
const { computeFullDepotResale } = require('../engine/flows/full-depot-resale');
const { computeTrade }           = require('../engine/flows/trade');
const { runSensitivities }       = require('../engine/core/sensitivities');
const { buildLadder }            = require('../engine/core/pricing-ladder');
const { generatePdfHtml, generateCoverHtml } = require('./report-pdf-renderer');

const FLOWS = {
  'equity-partner':    computeEquityPartner,
  'straight-exship':   computeStraightExship,
  'full-depot-resale': computeFullDepotResale,
  trade:               computeTrade,
};

const ROOT = path.join(__dirname, '..');

// Title shown in the running header — strip the parenthetical fixture/dummy caveat,
// matching the cover/dashboard. Kept here (not imported) so the header template is
// a plain string with no renderer coupling.
function headerTitle(name) {
  return String(name || 'Trade')
    .replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample|EXAMPLE)[^)]*\)/gi, '')
    .trim() || 'Trade';
}

// ─── Compute (mirrors build-report.js exactly) ────────────────────────────────
function computeForReport(trade) {
  const flow    = trade.meta.flow;
  const compute = FLOWS[flow];
  if (!compute) throw new Error(`Unknown flow: ${flow}`);

  const res = compute(trade, {});

  // Annualised-return PARITY WITH THE DASHBOARD. The dashboard bundles ONLY the unified
  // computeTrade, which surfaces the canonical annualised return on the BANK LC MOBILISED
  // (RULE 2026-06-23 — `financing.lc`, label "bank LC mobilised"). The legacy `equity-partner`
  // flow (the verified reference path, kept byte-for-byte) still emits the DEPRECATED
  // cargo-based `tisAnnualisedReturnOnCargo` instead, so its report would otherwise show a
  // different figure than the screen. To make the PDF match the dashboard EXACTLY without
  // touching the engine, graft the single annualised-return display field from computeTrade —
  // which reproduces this flow's P&L exactly (asserted FX1 / the computeTrade==computeEquityPartner
  // invariant) — and drop the stale cargo value. Every other number stays from the verified
  // flow; the engine, its outputs and the fingerprint are untouched.
  if (res.tisAnnualisedReturn == null && res.financing && res.financing.capitalLockupDays) {
    try {
      const unified = computeTrade(trade, {});
      if (unified && unified.tisAnnualisedReturn != null) {
        res.tisAnnualisedReturn   = unified.tisAnnualisedReturn;
        res.annualReturnBase      = unified.annualReturnBase;
        res.annualReturnBaseLabel = unified.annualReturnBaseLabel;
        delete res.tisAnnualisedReturnOnCargo;
      }
    } catch (e) { /* unified flow unavailable for this trade — keep the verified-flow result as-is */ }
  }

  const isUnified = res.channels !== undefined;
  // RULE 1: NAFEM drives naira P&L, so the live FX sensitivity lever is NAFEM for unified
  // flows; all-USD flows have no naira leg, so default opts ({}) are kept. Identical to
  // build-report.js so sensitivities match the static HTML report byte-for-byte.
  res.sensitivities = runSensitivities(trade, (t) => compute(t, {}), isUnified ? { fxMode: 'nafem' } : {});
  const ladder = buildLadder(trade, compute, res);
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
    out.setTitle(`${res.meta.tradeId} — Commercial Trade Analysis`);
    out.setAuthor('TIS Global Trading');
    const pdf = Buffer.from(await out.save());

    return { pdf, res, tradeId: res.meta.tradeId };
  } finally {
    if (ownBrowser) await browser.close();
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
  const tradeFile = process.argv[2] || path.join(ROOT, 'trades', 'reference-trade-001.json');
  const trade = JSON.parse(fs.readFileSync(path.resolve(tradeFile), 'utf8'));

  const { res } = computeForReport(trade);   // resolve tradeId for the default out name
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(ROOT, 'out', `${res.meta.tradeId}.pdf`);

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { pdf } = await renderTradePdf(trade);
  fs.writeFileSync(outPath, pdf);
  console.log(`PDF → ${outPath}  (${(pdf.length / 1024).toFixed(0)} KB)`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { renderTradePdf, computeForReport, headerTitle };
