'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const { computeEquityPartner }  = require('../engine/flows/equity-partner');
const { computeStraightExship } = require('../engine/flows/straight-exship');
const { computeFullDepotResale }= require('../engine/flows/full-depot-resale');
const { computeTrade }          = require('../engine/flows/trade');
const { runSensitivities }      = require('../engine/core/sensitivities');
const { buildLadder }           = require('../engine/core/pricing-ladder');
const { generateHtml, reportCss } = require('./report-renderer');

const FLOWS = {
  'equity-partner':    computeEquityPartner,
  'straight-exship':   computeStraightExship,
  'full-depot-resale': computeFullDepotResale,
  trade:               computeTrade,
};

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
  const flow      = trade.meta.flow;
  const compute   = FLOWS[flow];
  if (!compute) { console.error(`Unknown flow: ${flow}`); process.exit(1); }

  const res       = compute(trade, {});
  const isUnified = res.channels !== undefined;
  res.sensitivities = runSensitivities(trade, (t) => compute(t, {}), isUnified ? { fxMode: 'parallel' } : {});
  const ladder    = buildLadder(trade, compute, res);
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
