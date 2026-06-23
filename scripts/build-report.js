'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const { computeEquityPartner }  = require('../engine/flows/equity-partner');
const { computeStraightExship } = require('../engine/flows/straight-exship');
const { computeFullDepotResale }= require('../engine/flows/full-depot-resale');
const { computeTrade }          = require('../engine/flows/trade');
const { runSensitivities }      = require('../engine/core/sensitivities');
const { buildLadder }           = require('../engine/core/pricing-ladder');

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

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const fmt = {
  usd(x, dec = 2) {
    if (x == null) return '—';
    const n = Number(x);
    const abs = Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
    return (n < 0 ? '−$' : '$') + abs;
  },
  ngn(x) {
    if (x == null) return '—';
    const n = Number(x);
    const abs = Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    return (n < 0 ? '−₦' : '₦') + abs;
  },
  pct(x, dec = 2) {
    if (x == null) return '—';
    return (Number(x) * 100).toFixed(dec).replace(/\.?0+$/,'') + '%';
  },
  mt(x, dec = 2) {
    if (x == null) return '—';
    return Number(x).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}) + ' MT';
  },
  num(x, dec = 2) {
    if (x == null) return '—';
    return Number(x).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  },
};

const BADGE_CLASSES = [
  ['UNVERIFIED',   'bdg-unverified'],
  ['CONFIRM',      'bdg-confirm'],
  ['PLACEHOLDER',  'bdg-placeholder'],
  ['PENDING',      'bdg-pending'],
  ['RECOVERABLE',  'bdg-recoverable'],
  ['INDICATIVE',   'bdg-indicative'],
  ['EXAMPLE',      'bdg-example'],
  ['DUMMY',        'bdg-example'],
  ['FIXED',        'bdg-fixed'],
  ['SUGGESTED',    'bdg-indicative'],
];

// FIX 1: Human-readable cost category labels
const CATEGORY_LABELS = {
  per_mt:           'Per MT',
  derived_freight:  'Freight',
  derived_financing:'Financing',
  derived:          'Derived',
  flat:             'Fixed fee',
  storage:          'Storage',
  pct_of_freight:   '% of freight',
  pct_of_cargo_value:'% of cargo',
  pct_of_services:  '% of services',
  pct_of_LC:        '% of LC',
  pct_of_sell:      '% of sell',
};
function catLabel(cat) { return CATEGORY_LABELS[cat] || cat; }

// FIX 2: Shorten EXAMPLE/DUMMY badges — full text in tooltip, short label rendered
const SHORT_LABELS = [
  [/^EXAMPLE.*$/i, 'Example'],
  [/^DUMMY.*$/i,   'Example'],
  [/UNVERIFIED/i,  'Unverified'],
  [/CONFIRM/i,     'Confirm'],
  [/PLACEHOLDER.*$/i, 'Placeholder'],
  [/PENDING/i,     'Pending'],
  [/RECOVERABLE/i, 'Recoverable'],
  [/INDICATIVE/i,  'Indicative'],
  [/FIXED/i,       'Fixed'],
  [/SUGGESTED/i,   'Suggested'],
];

function badgeLabel(status) {
  for (const [re, label] of SHORT_LABELS) { if (re.test(status)) return label; }
  return status.length > 16 ? status.slice(0, 14) + '…' : status;
}

function badge(status) {
  if (!status || status === 'OK') return '';
  const upper = String(status).toUpperCase();
  let cls = 'bdg-default';
  for (const [kw, c] of BADGE_CLASSES) { if (upper.includes(kw)) { cls = c; break; } }
  return `<span class="bdg ${cls}" title="${esc(status)}">${esc(badgeLabel(status))}</span>`;
}

function signClass(n) {
  const v = Number(n);
  if (v > 0) return 'pos'; if (v < 0) return 'neg'; return '';
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

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
/* ── Reset & base ─────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 14px; -webkit-text-size-adjust: 100%; }
body {
  font-family: 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.5;
}

/* ── Brand tokens ──────────────────────────────────────────────────── */
:root {
  --red:     #d41d1d;
  --red-dim: #a81616;
  --red-bg:  #fff0f0;
  --ink:     #242331;
  --ink-60:  rgba(36,35,49,.60);
  --ink-20:  rgba(36,35,49,.10);
  --slate:   #717c89;
  --slate-bg:#eef0f3;
  --bg:      #f6f7f8;
  --white:   #ffffff;
  --border:  rgba(113,124,137,.18);

  /* Status colours — AA-compliant text on their bg */
  --confirm-c:  #7c2d02; --confirm-bg:  #fef3c7;
  --unver-c:    #991b1b; --unver-bg:    #fee2e2;
  --placeholder-c:#1e40af;--placeholder-bg:#dbeafe;
  --pending-c:  #5b21b6; --pending-bg:  #ede9fe;
  --recov-c:    #065f46; --recov-bg:    #d1fae5;
  --indic-c:    #374151; --indic-bg:    #f3f4f6;
  --example-c:  #374151; --example-bg:  #e5e7eb;
  --fixed-c:    #065f46; --fixed-bg:    #d1fae5;

  /* Sensitivity heat */
  --heat-pos: #dcfce7; --heat-pos-strong: #bbf7d0;
  --heat-neg: #fee2e2; --heat-neg-strong: #fecaca;

  /* Font stacks */
  --f-display: 'Space Grotesk', 'Helvetica Neue', sans-serif;
  --f-body:    'IBM Plex Sans', 'Helvetica Neue', sans-serif;
}

/* ── Layout container ──────────────────────────────────────────────── */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px 64px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* ── Header ────────────────────────────────────────────────────────── */
.report-header {
  background: var(--ink);
  color: var(--white);
  border-top: 3px solid var(--red);
}
.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px 20px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 24px 40px;
  align-items: center;
}
.header-logo {
  display: flex;
  align-items: center;
  padding-right: 24px;
  border-right: 1px solid rgba(255,255,255,.15);
}
.header-logo svg text { fill: inherit; }
.header-trade { min-width: 0; }
.trade-name {
  font-family: var(--f-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--white);
  line-height: 1.3;
  margin-bottom: 4px;
}
.trade-id {
  font-family: var(--f-body);
  font-size: 11px;
  color: rgba(255,255,255,.40);
  letter-spacing: .02em;
}
/* Slim metadata strip below main header row */
.header-meta-strip {
  background: rgba(0,0,0,.18);
  border-top: 1px solid rgba(255,255,255,.07);
  padding: 7px 0;
}
.header-meta-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  font-family: var(--f-body);
  font-size: 11px;
  color: rgba(255,255,255,.38);
  letter-spacing: .01em;
}
.header-meta-inner b { color: rgba(255,255,255,.60); font-weight: 500; }
.header-kpis {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}
.kpi-chip {
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  padding: 12px 18px;
  min-width: 140px;
  text-align: right;
}
.kpi-chip.kpi-accent {
  background: #15803d;
  border-color: #14532d;
}
.kpi-label {
  display: block;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: rgba(255,255,255,.55);
  margin-bottom: 6px;
}
.kpi-accent .kpi-label { color: rgba(255,255,255,.70); }
.kpi-accent .kpi-value { color: var(--white); }
.kpi-accent .kpi-sub  { color: rgba(255,255,255,.60); }
/* Genuine loss (TIS net < 0) — deep-red box, never the green profit treatment (Batch C). */
.kpi-chip.kpi-loss { background: #991b1b; border-color: #7f1d1d; }
.kpi-loss .kpi-label { color: rgba(255,255,255,.72); }
.kpi-loss .kpi-value { color: var(--white); }
.kpi-loss .kpi-sub  { color: rgba(255,255,255,.62); }
.kpi-value {
  display: block;
  font-family: var(--f-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--white);
  font-variant-numeric: tabular-nums lining-nums;
  line-height: 1;
}
.kpi-sub {
  display: block;
  font-family: var(--f-body);
  font-size: 11px;
  color: rgba(255,255,255,.45);
  margin-top: 4px;
}

/* ── Section wrapper ───────────────────────────────────────────────── */
.section { display: flex; flex-direction: column; gap: 0; }
.section-heading {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--ink);
  padding: 0 0 10px 12px;
  border-left: 3px solid var(--red);
  margin-bottom: 12px;
}
.card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.card-body { padding: 20px 24px; }
.card-footer {
  padding: 12px 24px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--ink-60);
  font-family: var(--f-body);
}

/* ── Grid layouts ──────────────────────────────────────────────────── */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.three-col { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }

/* ── Parameter cards ───────────────────────────────────────────────── */
.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px,1fr));
  gap: 10px;
}
.param-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
}
.param-label {
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: 6px;
  display: block;
}
.param-value {
  font-family: var(--f-body);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums lining-nums;
  display: block;
  margin-bottom: 2px;
}
.param-sub {
  font-family: var(--f-body);
  font-size: 11px;
  color: var(--slate);
}

/* ── Tables ────────────────────────────────────────────────────────── */
.tbl-wrap { overflow-x: auto; }
table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--f-body);
  font-size: 13px;
}
thead th {
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--slate);
  padding: 10px 12px;
  text-align: left;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
thead th.r { text-align: right; }
tbody tr { border-bottom: 1px solid var(--ink-20); }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: rgba(212,29,29,.025); }
tbody td {
  padding: 9px 12px;
  color: var(--ink);
  vertical-align: middle;
}
tbody td.r {
  text-align: right;
  font-variant-numeric: tabular-nums lining-nums;
  white-space: nowrap;
}
tbody td.muted { color: var(--slate); }
.tbl-id {
  font-size: 11px;
  color: var(--slate);
  font-variant-numeric: tabular-nums;
  width: 28px;
}
.tbl-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--ink);
  color: var(--white);
}
.tbl-footer-label {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: rgba(255,255,255,.65);
}
.tbl-footer-value {
  font-family: var(--f-body);
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--white);
}
.row-recoverable { background: #f0fdf9; }
.row-recoverable td { color: var(--recov-c); }
.row-total td {
  font-weight: 600;
  border-top: 2px solid var(--border);
  background: var(--bg);
}

/* ── Badges ────────────────────────────────────────────────────────── */
.bdg {
  display: inline-block;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
.bdg-confirm     { color: var(--confirm-c);     background: var(--confirm-bg); }
.bdg-unverified  { color: var(--unver-c);       background: var(--unver-bg); }
.bdg-placeholder { color: var(--placeholder-c); background: var(--placeholder-bg); }
.bdg-pending     { color: var(--pending-c);     background: var(--pending-bg); }
.bdg-recoverable { color: var(--recov-c);       background: var(--recov-bg); }
.bdg-indicative  { color: var(--indic-c);       background: var(--indic-bg); }
.bdg-example     { color: var(--example-c);     background: var(--example-bg); }
.bdg-fixed       { color: var(--fixed-c);       background: var(--fixed-bg); }
.bdg-default     { color: var(--ink-60);        background: var(--slate-bg); }

/* ── Profit waterfall ──────────────────────────────────────────────── */
.waterfall {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding: 24px;
}
.wf-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 150px;
  flex: 1;
}
.wf-box {
  width: 100%;
  border-radius: 8px;
  padding: 16px 14px;
  text-align: center;
  border: 1px solid var(--border);
  background: var(--bg);
}
.wf-box.wf-standalone { background: var(--ink); border-color: var(--ink); }
.wf-box.wf-deduct     { background: #fff5f5;  border-color: #fca5a5; }
.wf-box.wf-adjusted   { background: #fffbeb;  border-color: #fcd34d; }
.wf-box.wf-share      { background: #fff5f5;  border-color: #fca5a5; }
.wf-box.wf-net        { background: #15803d;  border-color: #14532d; }
/* TIS net negative — deep-red, overrides the green wf-net (must follow it in source). */
.wf-box.wf-net.wf-loss { background: #991b1b; border-color: #7f1d1d; }
.wf-box-label {
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  margin-bottom: 8px;
  color: var(--slate);
}
.wf-standalone .wf-box-label,
.wf-net .wf-box-label { color: rgba(255,255,255,.65); }
.wf-box-amount {
  font-family: var(--f-display);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--ink);
  line-height: 1.1;
}
.wf-standalone .wf-box-amount,
.wf-net .wf-box-amount { color: var(--white); }
.wf-box-sub {
  font-family: var(--f-body);
  font-size: 11px;
  color: var(--slate);
  margin-top: 5px;
}
.wf-standalone .wf-box-sub,
.wf-net .wf-box-sub { color: rgba(255,255,255,.50); }
.wf-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  color: var(--border);
  font-size: 20px;
  align-self: center;
  flex-shrink: 0;
}
.wf-reconcile {
  display: flex;
  gap: 24px;
  padding: 14px 24px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--ink-60);
  flex-wrap: wrap;
}
.wf-reconcile b { color: var(--ink); font-weight: 600; }
.wf-ok { color: #15803d; font-weight: 600; }

/* ── Partner / Hedge panels ────────────────────────────────────────── */
.dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 20px; align-items: baseline; }
.dl dt {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--slate);
  white-space: nowrap;
}
.dl dd {
  font-family: var(--f-body);
  font-size: 13px;
  color: var(--ink);
  font-variant-numeric: tabular-nums lining-nums;
}
.partner-tie {
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--bg);
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 12px;
  font-family: var(--f-body);
  color: var(--ink-60);
}
.partner-tie b { color: var(--ink); font-weight: 600; }
.tie-ok { color: #15803d; font-weight: 700; }

.hedge-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: 20px;
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .06em;
  border: 1px solid var(--border);
  background: var(--bg);
  margin-bottom: 14px;
}
.hedge-toggle .dot {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
}
.hedge-off .dot { background: var(--slate-bg); color: var(--slate); }
.hedge-on  .dot { background: var(--red); color: #fff; }
.hedge-off { color: var(--slate); }
.hedge-on  { border-color: var(--red); color: var(--red); }

/* ── Pricing ladder ────────────────────────────────────────────────── */
.ladder-current {
  background: rgba(212,29,29,.06);
  border-left: 3px solid var(--red) !important;
}
.ladder-current td { font-weight: 600; color: var(--ink) !important; }
.ladder-tier-name { font-weight: 600; }
.ladder-disclaimer {
  font-size: 11px;
  color: var(--slate);
  font-style: italic;
  padding: 8px 24px 12px;
}

/* ── Sensitivities ─────────────────────────────────────────────────── */
.sens-pos { background: var(--heat-pos); color: #15803d; font-weight: 600; }
.sens-neg { background: var(--heat-neg); color: #991b1b; font-weight: 600; }
.sens-pos-strong { background: var(--heat-pos-strong); color: #14532d; font-weight: 700; }
.sens-neg-strong { background: var(--heat-neg-strong); color: #7f1d1d; font-weight: 700; }
.sens-note {
  font-size: 12px;
  color: var(--slate);
  padding: 12px 24px;
  border-top: 1px solid var(--border);
}

/* ── Tornado chart ─────────────────────────────────────────────────── */
.tn-wrap { padding: 20px 24px 4px; }
.tn-axis-labels {
  display: flex;
  justify-content: space-between;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--slate);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.tn-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 12px;
  align-items: center;
  margin-bottom: 6px;
}
.tn-label {
  font-family: var(--f-body);
  font-size: 12px;
  color: var(--ink);
  text-align: right;
  padding-right: 4px;
  white-space: nowrap;
}
.tn-bars {
  display: flex;
  align-items: center;
  height: 26px;
}
.tn-half { flex: 1; display: flex; height: 100%; align-items: center; gap: 4px; }
.tn-left  { justify-content: flex-end; }
.tn-right { justify-content: flex-start; }
.tn-spine {
  width: 2px;
  height: 100%;
  background: var(--border);
  flex-shrink: 0;
}
.tn-bar {
  height: 100%;
  display: flex;
  align-items: center;
  border-radius: 3px;
  min-width: 4px;
  overflow: hidden;
  flex-shrink: 0;
}
.tn-neg { background: #fee2e2; border-radius: 3px 0 0 3px; justify-content: flex-end;   padding: 0 6px; }
.tn-pos { background: #d1fae5; border-radius: 0 3px 3px 0; justify-content: flex-start; padding: 0 6px; }
.tn-val, .tn-val-out {
  font-family: var(--f-body);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums lining-nums;
}
.tn-neg .tn-val { color: #991b1b; }
.tn-pos .tn-val { color: #065f46; }
.tn-neg-val { color: #991b1b; }
.tn-pos-val { color: #065f46; }
.tn-baseline-label {
  font-family: var(--f-body);
  font-size: 11px;
  color: var(--slate);
  padding: 10px 0 6px;
  border-top: 1px solid var(--border);
  margin-top: 10px;
}

/* ── Tax block ─────────────────────────────────────────────────────── */
.vat-block {
  background: #f0fdf9;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 16px;
  font-size: 12px;
  font-family: var(--f-body);
}
.vat-block-title {
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--recov-c);
  margin-bottom: 8px;
}
.vat-block dl { gap: 6px 16px; }
.surcharge-block {
  background: var(--pending-bg);
  border: 1px solid #c4b5fd;
  border-radius: 8px;
  padding: 14px 16px;
  margin-top: 12px;
  font-size: 12px;
  font-family: var(--f-body);
  color: var(--pending-c);
}
.surcharge-title {
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--pending-c);
  margin-bottom: 8px;
}

/* ── Footer ────────────────────────────────────────────────────────── */
.report-footer {
  background: var(--ink);
  color: rgba(255,255,255,.4);
  font-size: 11px;
  font-family: var(--f-body);
  padding: 18px 32px;
  text-align: center;
  letter-spacing: .02em;
}

/* ── Responsive ────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .header-inner { grid-template-columns: 1fr; gap: 16px; }
  .header-kpis  { flex-wrap: wrap; }
  .two-col      { grid-template-columns: 1fr; }
  .waterfall    { flex-direction: column; }
  .wf-arrow     { transform: rotate(90deg); }
}
@media (max-width: 600px) {
  .param-grid { grid-template-columns: 1fr 1fr; }
  .kpi-chip   { min-width: 100px; }
  .kpi-value  { font-size: 17px; }
}

/* ── Utils ─────────────────────────────────────────────────────────── */
.pos { color: #15803d; }
.neg { color: #991b1b; }
.muted { color: var(--slate); }
.legal-ref {
  font-size: 11px;
  color: var(--slate);
  font-style: italic;
  line-height: 1.4;
  margin-top: 2px;
}
.warn { color: var(--confirm-c); font-weight: 600; }
.separator { height: 1px; background: var(--border); margin: 12px 0; }
`;

// ─── HTML generators ─────────────────────────────────────────────────────────

function headerSection(logo, trade, res) {
  const tisNet       = res.profit.tisNetProfit;
  const annRet       = res.tisAnnualisedReturnOnCargo ?? res.tisAnnualisedReturn;
  const exShipLanded = res.price.exShipLandedPerMT ?? res.price.landedCostPerMT;
  const exShipPrice  = res.price.exShipPricePerMT;
  const marginPct    = (exShipPrice && exShipLanded) ? (exShipPrice - exShipLanded) / exShipPrice : null;

  const parties = res.meta.parties || {};

  // Short title: strip "(REGRESSION FIXTURE, dummy data)" or similar parenthetical caveats
  const shortTitle = esc(res.meta.tradeName.replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi, '').trim());
  const isFixture = /REGRESSION|FIXTURE|dummy/i.test(res.meta.tradeName);
  const fixtureBadge = isFixture
    ? `<span style="display:inline-block;margin-left:10px;padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:rgba(212,29,29,.20);color:#fca5a5;border:1px solid rgba(212,29,29,.35);border-radius:3px;vertical-align:middle">Fixture</span>`
    : '';

  const metaParts = [
    `Flow: <b>${esc(res.meta.flow)}</b>`,
    parties.partner   ? `Partner: <b>${esc(parties.partner)}</b>`   : null,
    parties.supplier  ? `Supplier: ${esc(parties.supplier)}`         : null,
    parties.inspector ? `Inspector: ${esc(parties.inspector)}`       : null,
    `Delivered: <b>${fmt.mt(res.meta.deliveredQty)}</b>`,
  ].filter(Boolean).join(' &nbsp;&middot;&nbsp; ');

  return `
<header class="report-header" role="banner">
  <div class="header-inner">
    <div class="header-logo" aria-label="TIS Global Trading">
      ${logo}
    </div>
    <div class="header-trade">
      <h1 class="trade-name">${shortTitle}${fixtureBadge}</h1>
      <p class="trade-id">${esc(res.meta.tradeId)}</p>
    </div>
    <div class="header-kpis" role="region" aria-label="Key metrics">
      <div class="kpi-chip ${tisNet < 0 ? 'kpi-loss' : 'kpi-accent'}">
        <span class="kpi-label">TIS Net Profit</span>
        <span class="kpi-value">${fmt.usd(tisNet)}</span>
        <span class="kpi-sub">after partner split</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label">Annualised Return</span>
        <span class="kpi-value">${annRet != null ? fmt.pct(annRet) : '&mdash;'}</span>
        <span class="kpi-sub">on cargo value &middot; ${res.financing.capitalLockupDays}d lockup</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label">Ex-Ship Margin</span>
        <span class="kpi-value">${marginPct != null ? fmt.pct(marginPct) : '&mdash;'}</span>
        <span class="kpi-sub">${fmt.usd(exShipPrice)}/MT sell</span>
      </div>
    </div>
  </div>
  <div class="header-meta-strip">
    <div class="header-meta-inner">${metaParts}</div>
  </div>
</header>`;
}

function paramCards(trade, res) {
  const f    = res.financing;
  const fxIn = trade.fx || {};
  const nafem    = fxIn.nafem   ? (fxIn.nafem.override   ?? fxIn.nafem.value)   : null;
  const parallel = fxIn.parallel? (fxIn.parallel.override ?? fxIn.parallel.value): null;

  const cards = [
    { label:'ICE Mark',    value: fmt.usd(trade.market.ice.value) + '/MT', sub: badge(trade.market.ice.status) || (trade.market.ice.asOf ? `as of ${trade.market.ice.asOf}` : '') },
    { label:'FOB Premium', value: fmt.usd(trade.market.fobPremium.value) + '/MT', sub: '' },
    { label:'Unit FOB',    value: fmt.usd(res.unitFob) + '/MT', sub: 'ICE + premium' },
    { label:'Cargo Size',  value: fmt.mt(trade.cargo.deliveredQtyMT, 0), sub: `Nominal ${fmt.mt(trade.cargo.nominalMT,0)} · ±${fmt.pct(trade.cargo.sellersOptionPct,0)}` },
    { label:'Ex-Ship Price', value: fmt.usd(res.price.exShipPricePerMT) + '/MT', sub: badge(res.price.exShipStatus) },
    { label:'Landed/MT',   value: fmt.usd(res.price.exShipLandedPerMT ?? res.price.landedCostPerMT) + '/MT', sub: 'excl. recoverable VAT' },
    { label:'FX Parallel', value: parallel != null ? fmt.num(parallel,0) + ' ₦/USD' : '—', sub: badge((fxIn.parallel||{}).status) || 'drives P&amp;L' },
    { label:'FX NAFEM',    value: nafem    != null ? fmt.num(nafem,0)    + ' ₦/USD' : '—', sub: badge((fxIn.nafem   ||{}).status) || 'reference only' },
    { label:'Equity Stack',value: `${fmt.pct(f.pct.bondPct)} + ${fmt.pct(f.pct.equityPct)}`, sub: `Partner ${fmt.pct(f.pct.partnerPct)} · LC ${fmt.pct(f.pct.lcPct)}` },
    { label:'Partner Principal', value: fmt.usd(f.partnerFunding), sub: `Bond ${fmt.usd(f.performanceBond)} + Equity ${fmt.usd(f.equity)}` },
    { label:'Credit Rate', value: fmt.pct(f.creditRate), sub: `${f.financingDays}d financing · Actual/${f.dayCountBasis}` },
    { label:'Profit Split', value: `${fmt.pct(1 - res.profit.profitSharePct)} TIS`, sub: `Partner ${fmt.pct(res.profit.profitSharePct)} cash share` },
  ];

  return `
<section class="section" aria-labelledby="params-heading">
  <h2 class="section-heading" id="params-heading">Trade Parameters</h2>
  <div class="param-grid">
    ${cards.map(c => `
    <div class="param-card">
      <span class="param-label">${c.label}</span>
      <span class="param-value">${c.value}</span>
      ${c.sub ? `<span class="param-sub">${c.sub}</span>` : ''}
    </div>`).join('')}
  </div>
</section>`;
}

function costAndTax(trade, res) {
  const cost  = res.cost;
  const lines = cost.lines;

  // Cost build-up table
  const costRows = lines.map(l => {
    const isRecov = l.recoverable;
    const flagBadge = isRecov
      ? `<span class="bdg bdg-recoverable">Recoverable</span>`
      : badge(l.status);
    const rowClass = isRecov ? 'row-recoverable' : '';
    return `
      <tr class="${rowClass}">
        <td class="tbl-id">${l.id}</td>
        <td>${esc(l.label)}</td>
        <td class="muted" style="font-size:11px">${esc(catLabel(l.category))}</td>
        <td class="r">${fmt.usd(l.amountUsd)}</td>
        <td>${flagBadge}</td>
      </tr>`;
  }).join('');

  const exShipLanded = cost.exShipLandedPerMT ?? cost.landedCostPerMT;

  const costHtml = `
  <div class="section" aria-labelledby="cost-heading">
    <h2 class="section-heading" id="cost-heading">Cost Build-Up</h2>
    <div class="card">
      <div class="tbl-wrap">
        <table aria-label="Cost build-up">
          <thead>
            <tr>
              <th>#</th><th>Line Item</th><th>Category</th>
              <th class="r">Amount (USD)</th><th>Flag</th>
            </tr>
          </thead>
          <tbody>${costRows}</tbody>
        </table>
      </div>
      <div class="tbl-footer">
        <div>
          <div class="tbl-footer-label">All-In Landed Cost</div>
          <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px">excl. recoverable VAT · ${fmt.mt(res.meta.deliveredQty)}</div>
        </div>
        <div style="text-align:right">
          <div class="tbl-footer-value">${fmt.usd(cost.allInCost)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.55);margin-top:2px">${fmt.usd(exShipLanded)}/MT</div>
        </div>
      </div>
      <div class="card-footer">
        Freight base: TC hire ${fmt.usd(cost.freight.tcHire)} + demurrage ${fmt.usd(cost.freight.demurrage)} = ${fmt.usd(cost.freight.freightBase)}
        &nbsp;·&nbsp; Services VAT base: ${cost.servicesBucket.composition.map(c => `${esc(c.label)} (${fmt.usd(c.amount)})`).join(', ')} = ${fmt.usd(cost.servicesBucket.sum)}
      </div>
    </div>
  </div>`;

  // Tax block
  const rv    = cost.recoverableVat;
  const tx    = res.tax;
  const sc    = tx.surcharge;

  const taxRows = (tx.items || []).map(t => `
    <tr>
      <td class="tbl-id">${t.id}</td>
      <td>
        ${esc(t.label)}
        <div class="legal-ref">${esc(t.legalRef || '')}</div>
      </td>
      <td class="r">${fmt.usd(t.amountUsd)}</td>
      <td>${badge(t.status)}</td>
    </tr>`).join('');

  const taxHtml = `
  <div class="section" aria-labelledby="tax-heading">
    <h2 class="section-heading" id="tax-heading">Tax Block</h2>
    <div class="card">
      <div class="tbl-wrap">
        <table aria-label="Tax items">
          <thead>
            <tr><th>#</th><th>Item &amp; Legal Reference</th><th class="r">Amount (USD)</th><th>Status</th></tr>
          </thead>
          <tbody>${taxRows}</tbody>
        </table>
      </div>

      <div class="card-body">
        <div class="vat-block" role="note" aria-label="Recoverable VAT block">
          <div class="vat-block-title">&#9679; Recoverable VAT — Cash-Flow Timing Only (NTA 2025 s.155(4))</div>
          <div class="dl">
            ${rv.lines.map(l => `<dt>Line ${l.id} ${esc(l.label)}</dt><dd>${fmt.usd(l.amount)}</dd>`).join('')}
            <dt>Gross input VAT</dt><dd>${fmt.usd(rv.grossRecoverable)}</dd>
            <dt>Taxable supply proportion</dt><dd>${fmt.pct(rv.taxableSupplyProportion)}</dd>
            <dt><strong>Recoverable (reclaim / WC timing)</strong></dt><dd><strong>${fmt.usd(rv.recoverable)}</strong></dd>
            ${rv.irrecoverable > 0 ? `<dt>Irrecoverable → added to landed cost</dt><dd class="warn">${fmt.usd(rv.irrecoverable)}</dd>` : ''}
          </div>
          <p style="font-size:11px;color:var(--recov-c);margin-top:8px">
            Does NOT affect profit. Recoverable VAT is a working-capital timing item only.
          </p>
        </div>

        <div class="surcharge-block" role="note" aria-label="Fossil-fuel surcharge">
          <div class="surcharge-title">&#9888; Fossil-Fuel Surcharge (NTA 2025 s.158&ndash;161) ${badge('PENDING')}</div>
          <div class="dl">
            <dt>Status</dt><dd>${sc.enabled ? '<b style="color:var(--unver-c)">ENABLED</b>' : 'OFF (default — commencementGazetted: false)'}</dd>
            <dt>Rate</dt><dd>${fmt.pct(sc.rate)} of retail price</dd>
            <dt>Incidence</dt><dd>${esc(sc.incidence)}</dd>
            <dt>Full statutory amount</dt><dd>${fmt.usd(sc.amountUsd)}</dd>
            <dt>TIS-borne (retained tonnes only)</dt><dd>${fmt.usd(sc.tisBorneUsd)}</dd>
          </div>
          <p class="legal-ref" style="margin-top:8px">${esc(sc.legalRef || '')}</p>
        </div>
      </div>
    </div>
  </div>`;

  // FIX 5: Cost build-up is 28 rows — full-width sections, tax block below cost, no cramped two-col
  return `
${costHtml}
${taxHtml}`;
}

function profitWaterfall(res) {
  const p  = res.profit;
  const wf = [
    { cls:'wf-standalone', label:'Standalone Profit', amount: p.standaloneProfit, sub:'TIS as 100% owner', prefix:'' },
    { cls:'wf-deduct',     label:'Margin Foregone',   amount: p.marginForegone,   sub:`${fmt.mt(res.quantities.economic.partnerTonnes, 2)} partner tonnes`, prefix:'−' },
    { cls:'wf-adjusted',   label:'Adjusted Profit',   amount: p.adjustedProfit,   sub:'TIS retained tonnes share', prefix:'=' },
    { cls:'wf-share',      label:'Partner Cash Share', amount: p.partnerCashProfitShare, sub:`${fmt.pct(p.profitSharePct)} of adjusted`, prefix:'−' },
    { cls: p.tisNetProfit < 0 ? 'wf-net wf-loss' : 'wf-net', label:'TIS Net Profit', amount: p.tisNetProfit, sub:`${fmt.pct(1 - p.profitSharePct)} of adjusted`, prefix:'=' },
  ];

  const nodes = wf.map((n, i) => {
    // FIX 3: Bold visible arrow using inline SVG chevron
    const arrowSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 4l6 6-6 6" stroke="var(--slate)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const arrowHtml = i > 0 ? `<div class="wf-arrow">${arrowSvg}</div>` : '';
    return `${arrowHtml}
    <div class="wf-node">
      <div class="wf-box ${n.cls}">
        <div class="wf-box-label">${n.label}</div>
        <div class="wf-box-amount">${n.prefix}${fmt.usd(n.amount)}</div>
        <div class="wf-box-sub">${n.sub}</div>
      </div>
    </div>`;
  }).join('');

  const annRet = res.tisAnnualisedReturnOnCargo ?? res.tisAnnualisedReturn;
  const annBase = res.annualReturnBaseLabel || 'bank LC mobilised';

  return `
<section class="section" aria-labelledby="waterfall-heading">
  <h2 class="section-heading" id="waterfall-heading">Profit Waterfall</h2>
  <div class="card">
    <div class="waterfall" role="region" aria-label="Profit waterfall">
      ${nodes}
    </div>
    <div class="wf-reconcile">
      <span>
        Reconciliation: marginForegone + adjusted = standalone
        &nbsp;&nbsp;
        <b>${fmt.usd(p.marginForegone)} + ${fmt.usd(p.adjustedProfit)} = ${fmt.usd(p.standaloneProfit)}</b>
        &nbsp;
        <span class="${p.reconciliation.ok ? 'wf-ok' : 'warn'}">${p.reconciliation.ok ? '&#10003; OK' : '&#9888; MISMATCH'}</span>
      </span>
      ${annRet != null ? `<span>Annualised return: <b>${fmt.pct(annRet)}</b> on ${esc(annBase)} &middot; ${res.financing.capitalLockupDays}d lockup</span>` : ''}
    </div>
  </div>
</section>`;
}

function partnerAndHedge(trade, res) {
  const pd = res.partnerDelivers;
  const h  = res.hedge;

  const partnerHtml = pd && pd.productReceived ? `
  <div class="section" aria-labelledby="partner-heading">
    <h2 class="section-heading" id="partner-heading">Partner Deliverables</h2>
    <div class="card">
      <div class="card-body">
        <p class="muted" style="font-size:11px;margin-bottom:12px">${esc(pd.note || '')}</p>

        <p style="font-family:var(--f-display);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--slate);text-transform:uppercase;margin-bottom:8px">(1) Product Received</p>
        <div class="dl">
          <dt>Tonnes (economic)</dt><dd>${fmt.mt(pd.productReceived.tonnes)}</dd>
          <dt>Valued at ex-ship landed</dt><dd>${fmt.usd(pd.productReceived.valuedAtExShipLandedCost ?? pd.productReceived.valuedAtLandedCost)}</dd>
          <dt>= Principal at par</dt><dd><b>${fmt.usd(res.financing.partnerFunding)}</b></dd>
        </div>

        <div class="separator"></div>

        <p style="font-family:var(--f-display);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--slate);text-transform:uppercase;margin-bottom:8px">(2) Cash Received</p>
        <div class="dl">
          <dt>Profit share (${fmt.pct(res.profit.profitSharePct)})</dt><dd>${fmt.usd(pd.cashReceived.profitShare)}</dd>
          ${pd.cashReceived.principalCashPortion > 0 ? `<dt>Principal (cash portion)</dt><dd>${fmt.usd(pd.cashReceived.principalCashPortion)}</dd>` : ''}
        </div>

        ${res.quantities.paper ? `
        <div class="separator"></div>
        <p style="font-family:var(--f-display);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--slate);text-transform:uppercase;margin-bottom:8px">Paper vs Economic Quantities</p>
        <div class="dl">
          <dt>Partner (economic)</dt><dd>${fmt.mt(res.quantities.economic.partnerTonnes)}</dd>
          <dt>Partner (paper, nearest 50)</dt><dd>${fmt.mt(res.quantities.paper.partnerPaper, 0)} <span class="muted" style="font-size:11px">↓ (TIS favour)</span></dd>
          <dt>TIS retained (economic)</dt><dd>${fmt.mt(res.quantities.economic.tisRetainedTonnes)}</dd>
          <dt>Settlement cash true-up</dt><dd>${fmt.usd(res.quantities.paper.cashTrueUp)}</dd>
        </div>` : ''}

        <div class="partner-tie">
          Principal tie-out: owed <b>${fmt.usd(pd.principalTie.owed)}</b>
          = product <b>${fmt.usd(pd.principalTie.returnedProductValue)}</b>
          + cash <b>${fmt.usd(pd.principalTie.returnedCash)}</b>
          &nbsp;
          <span class="${pd.principalTie.ok ? 'tie-ok' : 'warn'}">${pd.principalTie.ok ? '&#10003; OK' : '&#9888; MISMATCH'}</span>
        </div>
      </div>
    </div>
  </div>` : `
  <div class="section">
    <h2 class="section-heading">Partner Deliverables</h2>
    <div class="card"><div class="card-body muted">${esc((pd||{}).note || 'TIS self-funded — no partner.')}</div></div>
  </div>`;

  const iceOn  = !!(trade.hedge && trade.hedge.iceHedged);
  const fxOn   = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const hc     = res.hedgeComparison || null;

  const hedgeHtml = `
  <div class="section" aria-labelledby="hedge-heading">
    <h2 class="section-heading" id="hedge-heading">Hedges</h2>
    <div class="card">
      <div class="card-body">

        <p style="font-family:var(--f-display);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--slate);text-transform:uppercase;margin-bottom:8px">ICE Gasoil Swap</p>
        <div class="${iceOn ? 'hedge-toggle hedge-on' : 'hedge-toggle hedge-off'}">
          <span class="dot">${iceOn ? '&#10003;' : '&times;'}</span>
          ${iceOn ? 'HEDGED' : 'UNHEDGED'} — Toggle ${iceOn ? 'ON' : 'OFF'}
        </div>
        <div class="dl">
          <dt>Route</dt><dd>${esc(h.route)}</dd>
          <dt>Lots</dt><dd>${h.lots || 0} (${fmt.mt(h.hedgedTonnes)})</dd>
          <dt>Comparison basis</dt><dd>${fmt.mt(h.comparisonBasisTonnes)} TIS retained</dd>
          <dt>Fixed price</dt><dd>${h.fixedPrice ? fmt.usd(h.fixedPrice) + '/MT' : '—'} ${badge('PLACEHOLDER')}</dd>
          <dt>Live ICE</dt><dd>${fmt.usd(h.liveIce)}/MT</dd>
          <dt>Effective ICE cost</dt><dd>${fmt.usd(h.effectiveIceCost)}</dd>
          <dt>Unhedged ICE cost</dt><dd>${fmt.usd(h.unhedgedIceCost)}</dd>
          <dt>ICE cost delta</dt><dd class="${signClass(-h.iceCostDelta)}">${fmt.usd(h.iceCostDelta)}</dd>
          <dt>Swap fee</dt><dd>${fmt.usd(h.swapFee)} ${badge('PLACEHOLDER')}</dd>
          <dt>Bank-provided margin</dt><dd>${fmt.usd(h.bankProvidedMargin)}</dd>
          <dt>Extra financing cost</dt><dd>${fmt.usd(h.extraFinancingCost)}</dd>
        </div>
        ${hc ? `
        <div style="margin-top:14px;padding:12px;background:var(--bg);border-radius:8px;font-size:12px;font-family:var(--f-body);">
          <b>Hedged vs Unhedged:</b>
          TIS net hedged ${fmt.usd(hc.ice.hedgedTisNet)} &nbsp;|&nbsp;
          unhedged ${fmt.usd(hc.ice.unhedgedTisNet)} &nbsp;|&nbsp;
          hedge worth <b>${fmt.usd(hc.ice.hedgeWorthItVsUnhedged)}</b>
        </div>` : ''}
        <p class="legal-ref" style="margin-top:10px">${badge(h.status || '')} All hedge params are PLACEHOLDER — confirm with bank/broker before any live hedge.</p>

        <div class="separator" style="margin:18px 0"></div>

        <p style="font-family:var(--f-display);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--slate);text-transform:uppercase;margin-bottom:8px">FX Hedge (Naira Exposure)</p>
        <div class="${fxOn ? 'hedge-toggle hedge-on' : 'hedge-toggle hedge-off'}">
          <span class="dot">${fxOn ? '&#10003;' : '&times;'}</span>
          ${fxOn ? 'HEDGED' : 'UNHEDGED'} — Toggle ${fxOn ? 'ON' : 'OFF'}
        </div>
        ${res.fxHedge ? (() => {
          const fh = res.fxHedge;
          if (!fh.hasExposure) return `<p class="muted" style="font-size:12px">No naira exposure in this trade — FX hedge is a no-op.</p>`;
          return `<div class="dl">
            <dt>Benchmark</dt><dd>${esc(fh.benchmark)}</dd>
            <dt>Exposure (NGN)</dt><dd>${fmt.ngn(fh.exposureNgn)}</dd>
            <dt>Hedge ratio</dt><dd>${fmt.pct(fh.hedgeRatio || 1)}</dd>
          </div>
          ${fh.basis ? `<p class="warn" style="font-size:12px;margin-top:8px">⚠ Basis risk: ${esc(fh.basis.note || '')}</p>` : ''}`;
        })() : `<p class="muted" style="font-size:12px">No FX hedge in this trade flow — no naira legs.</p>`}
      </div>
    </div>
  </div>`;

  return `
<section aria-label="Partner and hedges">
  <div class="two-col" style="align-items:start">
    ${partnerHtml}
    ${hedgeHtml}
  </div>
</section>`;
}

function pricingLadder(ladder) {
  const ex = ladder.exShip;
  const tiers = ex.tiers;
  const current = ex.current;
  const depotNote = ladder.depot.applicable ? null : ladder.depot.note;

  const rows = tiers.map(t => {
    const isCurrent = current && Math.abs(t.pricePerMT - current.pricePerMT) < 0.01;
    const cls = isCurrent ? 'ladder-current' : '';
    return `
    <tr class="${cls}">
      <td class="ladder-tier-name">${isCurrent ? '&#9658; ' : ''}${esc(t.name)}</td>
      <td class="r">${fmt.pct(t.marginOfSell)}</td>
      <td class="r"><b>${fmt.usd(t.pricePerMT)}</b>/MT</td>
      <td class="r">${fmt.usd(t.spreadPerMT)}/MT</td>
      <td class="r">${fmt.pct(t.markupPctOnCost)}</td>
      <td class="r">${t.spreadNgnPerL != null ? '&#8358;' + fmt.num(t.spreadNgnPerL) + '/L' : '—'}</td>
      <td class="r">${fmt.usd(t.tisNetProfit)}</td>
    </tr>`;
  }).join('');

  const costBase = fmt.usd(ex.costBasePerMT);

  return `
<section class="section" aria-labelledby="ladder-heading">
  <h2 class="section-heading" id="ladder-heading">Pricing Ladder (Ex-Ship)</h2>
  <div class="card">
    <p class="ladder-disclaimer">&#9888; ${esc(ladder.disclaimer)}</p>
    <div class="tbl-wrap">
      <table aria-label="Ex-ship pricing ladder">
        <thead>
          <tr>
            <th>Tier</th>
            <th class="r">Margin % Sell</th>
            <th class="r">Price $/MT</th>
            <th class="r">Spread $/MT</th>
            <th class="r">Markup % Cost</th>
            <th class="r">Spread ₦/L</th>
            <th class="r">TIS Net</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${current ? `
    <div class="card-footer">
      <b>Your price:</b> ${fmt.usd(current.pricePerMT)}/MT &nbsp;[${esc(current.status)}]&nbsp;&middot;&nbsp;
      Margin ${fmt.pct(current.marginPctOfSell)} of sell &middot;
      Markup ${fmt.pct(current.markupPctOnCost)} on cost &middot;
      Spread ${fmt.usd(current.spreadPerMT)}/MT &middot;
      Tier: <b>${esc(current.nearestTier)}</b>
    </div>` : ''}
    <div class="card-footer" style="border-top: 1px solid var(--border)">
      Cost base: ${costBase}/MT (ex-ship landed, excl. storage)
      ${depotNote ? `&nbsp;&middot;&nbsp; Depot: ${esc(depotNote)}` : ''}
    </div>
  </div>
</section>`;
}

function tornadoChart(sens) {
  const scenarios = sens.scenarios;
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);
  const sorted = [...scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));

  // Pair ± levers into single rows (e.g. "ICE +10%" and "ICE -10%" → one row)
  const seen = new Set();
  const rows = [];
  for (const s of sorted) {
    if (seen.has(s.lever)) continue;
    const baseName = s.lever.replace(/\s*[+\-]\s*10%$/i, '').trim();
    const partner = sorted.find(p =>
      !seen.has(p.lever) && p !== s &&
      p.lever.replace(/\s*[+\-]\s*10%$/i, '').trim() === baseName
    );
    let label, pos, neg;
    if (partner) {
      label = baseName;
      pos = s.deltaVsBase >= 0 ? s : partner;
      neg = s.deltaVsBase <  0 ? s : partner;
      seen.add(s.lever); seen.add(partner.lever);
    } else {
      label = s.lever;
      pos = s.deltaVsBase >= 0 ? s : null;
      neg = s.deltaVsBase <  0 ? s : null;
      seen.add(s.lever);
    }
    const impact = Math.max(pos ? Math.abs(pos.deltaVsBase) : 0, neg ? Math.abs(neg.deltaVsBase) : 0);
    rows.push({ label, pos, neg, impact });
  }
  rows.sort((a, b) => b.impact - a.impact);

  const BAR_PCT = 46;
  const INSIDE_THRESHOLD = 13; // bar must be >= 13% wide to fit label inside
  const rowHtml = rows.filter(row => row.impact > 1).map(row => {
    const negPct = row.neg ? +(Math.abs(row.neg.deltaVsBase) / maxAbs * BAR_PCT).toFixed(1) : 0;
    const posPct = row.pos ? +(Math.abs(row.pos.deltaVsBase) / maxAbs * BAR_PCT).toFixed(1) : 0;
    const negVal = row.neg ? fmt.usd(row.neg.deltaVsBase) : '';
    const posVal = row.pos ? (row.pos.deltaVsBase >= 0 ? '+' : '') + fmt.usd(row.pos.deltaVsBase) : '';
    const negInside = negPct >= INSIDE_THRESHOLD;
    const posInside = posPct >= INSIDE_THRESHOLD;
    const negBar = row.neg ? `<div class="tn-bar tn-neg" style="width:${negPct}%">${negInside ? `<span class="tn-val">${esc(negVal)}</span>` : ''}</div>` : '';
    const posBar = row.pos ? `<div class="tn-bar tn-pos" style="width:${posPct}%">${posInside ? `<span class="tn-val">${esc(posVal)}</span>` : ''}</div>` : '';
    return `
    <div class="tn-row">
      <div class="tn-label">${esc(row.label)}</div>
      <div class="tn-bars">
        <div class="tn-half tn-left">
          ${!negInside && row.neg ? `<span class="tn-val-out tn-neg-val">${esc(negVal)}</span>` : ''}
          ${negBar}
        </div>
        <div class="tn-spine" aria-hidden="true"></div>
        <div class="tn-half tn-right">
          ${posBar}
          ${!posInside && row.pos ? `<span class="tn-val-out tn-pos-val">${esc(posVal)}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="tn-wrap" role="img" aria-label="Sensitivity tornado chart — bars show TIS Net delta from base case">
    <div class="tn-axis-labels">
      <span class="tn-axis-left">&#8592; Negative impact (↓ TIS Net)</span>
      <span class="tn-axis-right">Positive impact (↑ TIS Net) &#8594;</span>
    </div>
    ${rowHtml}
    <div class="tn-baseline-label">Base case: <b>${fmt.usd(sens.baseNet)}</b> &nbsp;&middot;&nbsp; Bars show &Delta; vs base at &plusmn;10% of each input</div>
  </div>`;
}

function sensitivitiesSection(sens) {
  const scenarios = [...sens.scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);

  const rows = scenarios.map(s => {
    const pct  = Math.abs(s.deltaVsBase) / maxAbs;
    let dcls   = '';
    if (s.deltaVsBase > 0) dcls = pct > 0.6 ? 'sens-pos-strong' : 'sens-pos';
    if (s.deltaVsBase < 0) dcls = pct > 0.6 ? 'sens-neg-strong' : 'sens-neg';
    const sign = s.deltaVsBase >= 0 ? '+' : '';
    return `
    <tr>
      <td>${esc(s.lever)}</td>
      <td class="r">${fmt.usd(s.tisNet)}</td>
      <td class="r ${dcls}">${sign}${fmt.usd(s.deltaVsBase)}</td>
    </tr>`;
  }).join('');

  return `
<section class="section" aria-labelledby="sens-heading">
  <h2 class="section-heading" id="sens-heading">Sensitivities (&plusmn;10%)</h2>
  <div class="card">
    ${tornadoChart(sens)}
    <div class="tbl-wrap" style="border-top:1px solid var(--border)">
      <table aria-label="Sensitivities">
        <thead>
          <tr><th>Lever</th><th class="r">TIS Net</th><th class="r">&Delta; vs Base</th></tr>
        </thead>
        <tbody>
          <tr class="row-total">
            <td><b>Base case</b></td>
            <td class="r"><b>${fmt.usd(sens.baseNet)}</b></td>
            <td class="r muted">—</td>
          </tr>
          ${rows}
        </tbody>
      </table>
    </div>
    <div class="sens-note">
      FX: ${esc(sens.fx.note)}
      ${sens.depotDownside ? `&nbsp;&middot;&nbsp; Depot sold-at-cost downside: TIS net ${fmt.usd(sens.depotDownside.tisNet)} (delta ${fmt.usd(sens.depotDownside.deltaVsBase)})` : ''}
    </div>
  </div>
</section>`;
}

function footerSection(generatedAt, res) {
  return `
<footer class="report-footer" role="contentinfo">
  TIS Global Trading &mdash; Internal Trade Model Report &mdash;
  ${esc(res.meta.tradeId)} &mdash; Generated ${generatedAt}
  &mdash; All figures DUMMY/EXAMPLE data only. Not a real trade.
</footer>`;
}

// ─── Full HTML assembly ───────────────────────────────────────────────────────

function generateHtml(trade, res, ladder, generatedAt) {
  const logo = readLogo();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Trade model report — ${esc(res.meta.tradeId)}">
  <title>${esc(res.meta.tradeId)} — TIS Global Trading</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>
${headerSection(logo, trade, res)}
<main class="container" id="main-content">
  ${paramCards(trade, res)}
  ${costAndTax(trade, res)}
  ${profitWaterfall(res)}
  ${partnerAndHedge(trade, res)}
  ${pricingLadder(ladder)}
  ${sensitivitiesSection(res.sensitivities)}
</main>
${footerSection(generatedAt, res)}
</body>
</html>`;
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
  const html     = generateHtml(trade, res, ladder, generatedAt);
  const htmlPath = path.join(OUT, `${res.meta.tradeId}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`HTML → ${htmlPath}`);

  return htmlPath;
}

if (require.main === module) main();

// Exported for use by build-interactive.js (CSS only — does not re-run main)
module.exports = { reportCss: CSS };
