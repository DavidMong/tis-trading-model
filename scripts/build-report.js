'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// The report renders through computeTrade UNCONDITIONALLY (like the dashboard), never the
// per-trade meta.flow dispatch — so it mirrors the screen. computeTrade reproduces every legacy
// flow's P&L for its own config (FX1), so the reference report is byte-for-byte identical.
const { computeTrade }          = require('../engine/flows/trade');
const { runSensitivities }      = require('../engine/core/sensitivities');
const { buildLadder }           = require('../engine/core/pricing-ladder');
const { generateHtml, reportCss } = require('./report-renderer');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'out');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadTrade(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function readLogo() {
  const svgPath = path.join(ROOT, 'assets', 'tis-logo-2.svg');
  let raw = fs.readFileSync(svgPath, 'utf8');
  // Strip XML declaration and DOCTYPE for clean inline embedding
  raw = raw.replace(/<\?xml[^?]*\?>/g,'').replace(/<!DOCTYPE[^>]*>/g,'').trim();
  // FIX 4: Larger logo — 260px wide (aspect ratio 398:48 ≈ 8.3:1 → height 31px)
  raw = raw.replace(/width="[^"]*"/, 'width="260"').replace(/height="[^"]*"/, 'height="31"');
  // The SVG has "Global Trading" in fill:#242331 (ink) — invisible on the dark header.
  // Replace with off-white so both words are legible on the dark background.
  raw = raw.replace(/fill:#242331/g, 'fill:#f0f1f2');
  // "Global Trading" text element: leave x="90.62px" in place — the two SVG text elements
  // already render with natural spacing in the browser. Shifting this x breaks the internal
  // <tspan> absolute positions for the "ra" glyph pair in "Trading", causing "Tading".
  return raw;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function main() {
  const tradeFile = process.argv[2] || path.join(ROOT, 'trades', 'sample-equity-partner.json');
  const trade     = loadTrade(tradeFile);

  // Render through the SAME engine call the dashboard uses — computeTrade UNCONDITIONALLY,
  // never the per-trade meta.flow dispatch — so the static report mirrors the screen exactly.
  // computeTrade reproduces every legacy flow's P&L for its own config (FX1), so the reference
  // report is byte-for-byte identical; it natively emits the canonical bank-LC annualised return.
  const res       = computeTrade(trade, {});
  // RULE 1 (2026-06-23): NAFEM drives naira P&L → FX sensitivity lever is NAFEM. `skipHedgeCompare`
  // is the recursion guard the dashboard's recompute() passes.
  const fn        = (t) => computeTrade(t, { skipHedgeCompare: true });
  res.sensitivities = runSensitivities(trade, fn, { fxMode: 'nafem' });
  const ladder    = buildLadder(trade, fn, res);
  const generatedAt = new Date().toISOString().replace('T',' ').slice(0,16) + ' UTC';

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // 1. Write full JSON (engine output — the report reads this shape)
  const jsonPath  = path.join(OUT, `${res.meta.tradeId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt, trade, result: res, ladder }, null, 2), 'utf8');
  console.log(`JSON → ${jsonPath}`);

  // 2. Write self-contained HTML report
  const logo     = readLogo();
  const html     = generateHtml(logo, trade, res, ladder, generatedAt);
  const htmlPath = path.join(OUT, `${res.meta.tradeId}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`HTML → ${htmlPath}`);

  return htmlPath;
}

if (require.main === module) main();

// reportCss re-exported for backward compatibility (now defined in ./report-renderer).
module.exports = { reportCss };
