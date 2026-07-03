'use strict';

// ─── Pure HTML report renderer (Stage A extraction from build-report.js) ──────
// No Node built-ins are referenced here, so this module is safe to bundle into the
// browser engine (window.TISEngine.generateHtml) AND to require from Node. The
// Node-only pieces (readLogo, file IO, CLI main) stay in build-report.js, which
// passes the resolved logo SVG into generateHtml as an explicit `logo` param.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const fmt = {
  usd(x, dec = 2) {
    if (x == null || !Number.isFinite(Number(x))) return '—';
    const n = Number(x);
    const abs = Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
    return (n < 0 ? '−$' : '$') + abs;
  },
  ngn(x) {
    if (x == null || !Number.isFinite(Number(x))) return '—';
    const n = Number(x);
    const abs = Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    return (n < 0 ? '−₦' : '₦') + abs;
  },
  pct(x, dec = 2) {
    if (x == null || !Number.isFinite(Number(x))) return '—';
    return (Number(x) * 100).toFixed(dec) + '%';
  },
  mt(x, dec = 2) {
    if (x == null || !Number.isFinite(Number(x))) return '—';
    return Number(x).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}) + ' MT';
  },
  num(x, dec = 2) {
    if (x == null || !Number.isFinite(Number(x))) return '—';
    return Number(x).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  },
};

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

// Status-flag taxonomy (root CLAUDE.md, "Batch D — final, 3 states"): display-only remap of the
// engine/config's historical status strings onto 4 rendered states. Mirrors build-interactive.js's
// own `badge()` exactly — engine/config schemas keep their original strings; only this render layer
// collapses them. INDICATIVE/PLACEHOLDER/PENDING/EXAMPLE/DUMMY/SUGGESTED/anything else unlisted all
// fall through to the INDICATIVE catch-all, same as the interactive app.
function badge(status) {
  if (!status || status === 'OK') return '';
  const upper = String(status).toUpperCase();
  if (upper.includes('RECOVERABLE')) return `<span class="bdg bdg-recoverable" title="${esc(status)}">&#10003; OK</span>`;
  if (upper.includes('FIXED')) return '';
  if (upper.includes('CONFIRM') || upper.includes('UNVERIFIED'))
    return `<span class="bdg bdg-unverified" title="${esc(status)}">&#9888;&#xFE0E;&nbsp;UNVERIFIED</span>`;
  return `<span class="bdg bdg-indicative" title="${esc(status)}">INDICATIVE</span>`;
}

function signClass(n) {
  const v = Number(n);
  if (v > 0) return 'pos'; if (v < 0) return 'neg'; return '';
}

// Signed USD: positive shows a leading "+", negative keeps fmt.usd's "−$". Matches the dashboard's
// fmtUsdSign so hedge realized-delta / impact figures read identically to the live UI.
function usdSign(x) {
  if (x == null || !Number.isFinite(Number(x))) return '—';
  const n = Number(x);
  return (n >= 0 ? '+' : '') + fmt.usd(n);
}

// Friendly hedge-route labels (mirror the dashboard's route segmented control).
function routeLabel(route, isFx) {
  if (route === 'third_party') return isFx ? 'Third-party NDF' : 'Third-party (margin)';
  return isFx ? 'Bank forward' : 'Bank book';
}

// Partner/Hedge info-row grammar (Stage 6, Step 6): label left / mono figure right — mirrors
// build-interactive.js's own infoRow() helper. `value` is pre-formatted HTML (numbers, badges,
// spans), not escaped; `cls` is an optional class on the value <b> (e.g. signClass() output).
function infoRow(label, value, cls) {
  return `<div class="info-row"><span>${esc(label)}</span><b class="${cls || ''}">${value ?? '—'}</b></div>`;
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

  /* Font stacks — Stage 5: single Plex superfamily (Plex Sans for
     display+UI+body by weight/size, Plex Mono for data); Space Grotesk
     dropped, per-heading weight 600 at call sites left as-is. */
  --f-display: 'IBM Plex Sans', 'Helvetica Neue', sans-serif;
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

/* ── Print / PDF (item 9): sane margins, brand colours preserved, clean section breaks ── */
@media print {
  @page { margin: 14mm; }
  html { font-size: 12px; }
  html, body { background: #fff; }
  /* Preserve brand header, KPI chips, badges and heat colours in the PDF */
  *, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .container { max-width: none; padding: 0 0 8mm; }
  .report-header { break-after: avoid; }
  /* Major sections start fresh so nothing straddles a page awkwardly */
  #cost-heading, #waterfall-heading, #ladder-heading, #sens-heading { break-before: page; }
  /* Keep atomic blocks intact across page breaks */
  .card, .param-card, .kpi-chip, .wf-node, .vat-block, .surcharge-block,
  .partner-tie, .tie-out-box, .tn-row, .ladder-compare, tr { break-inside: avoid; }
  /* Repeat table headers when a long table (e.g. cost build-up) spans pages */
  thead { display: table-header-group; }
  .report-footer { break-before: avoid; }
}
`;

// ─── Report-only design-system extension (Stage 6) ────────────────────────────
// Mirrors build-interactive.js's own --fs-*/--g-*/--f-mono tokens and its .data-table /
// .section-block / .summary-strip / .info-row component classes (scripts/build-interactive.js —
// "DESIGN TOKENS (Stage 0)" plus the Stage 2/3 result-table and summary-strip blocks) so the
// report's tables, KPI/param figures, and info-boxes read as the same system as the interactive
// app. Kept in a SEPARATE constant from `CSS` (the exported `reportCss`) so build-interactive.js —
// which imports only `reportCss` — never inherits it; generateHtml's <style> tag concatenates
// CSS + REPORT_CSS instead. Values are duplicated by hand from build-interactive.js's tokens
// (report-renderer.js is the lower-level module and cannot import from build-interactive.js) —
// keep both in sync if either changes. Every rule below only targets classes/tokens that
// build-interactive.js does NOT read from this file (verified: .data-table/.section-block/
// .summary-strip/.info-row overrides here are new selectors or apply only inside report-only
// markup), so nothing here can alter the interactive app's rendering.
const REPORT_CSS = `
:root {
  --f-mono:       'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
  --fs-label:     10px;
  --fs-caption:   12px;
  --fs-body:      13px;
  --fs-data:      13px;
  --fs-value:     15px;
  --fs-heading:   16px;
  --fs-kpi:       24px;
  --g-text-slate: #64707c;
  --g-hairline:   var(--border);
  --g-brand-red:  var(--red);
  --g-chrome-ink: var(--ink);
  --g-canvas:     var(--bg);
  --g-loss:       #991b1b;
}

/* Header + Trade Parameters onto tokens (Step 2): values in --f-mono tabular. */
.kpi-value {
  font-family: var(--f-mono);
  font-size: var(--fs-kpi);
  font-variant-numeric: tabular-nums lining-nums;
}
.kpi-label { font-size: var(--fs-label); }
.kpi-sub   { font-size: var(--fs-caption); }
.param-value {
  font-family: var(--f-mono);
  font-size: var(--fs-value);
  font-variant-numeric: tabular-nums lining-nums;
}
.param-label { font-size: var(--fs-label); }
.param-sub   { font-size: var(--fs-caption); }

/* section-block: eyebrow heading atop a card — mirrors build-interactive.js Stage 0. */
.section-block { display: flex; flex-direction: column; }
.section-block-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin-bottom: 8px;
}
.section-block-eyebrow {
  font-family: var(--f-display);
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--g-text-slate);
  padding-left: 12px;
  border-left: 3px solid var(--g-brand-red);
}
.section-block-status { flex-shrink: 0; }

/* data-table (Step 3): eyebrow header, hairline rows, mono tabular numerics, totals row set
   apart by weight + top hairline (never a fill) — mirrors build-interactive.js Stage 2. Layers
   onto reportCss's existing per-cell classes (.r numeric, .muted secondary, .row-total) — no
   cell class renamed, only class="data-table" added to each <table> tag. */
.data-table thead th { background: none; color: var(--g-text-slate); font-size: var(--fs-label); }
.data-table thead th.r { text-align: right; }
.data-table tbody tr { border-bottom: 1px solid var(--g-hairline); }
.data-table tbody tr:last-child { border-bottom: none; }
.data-table tbody tr:hover { background: none; }
.data-table tbody td.r {
  font-family: var(--f-mono);
  font-size: var(--fs-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--g-chrome-ink);
}
.data-table tbody td.muted { color: var(--g-text-slate); }
.data-table tbody tr.row-total td {
  font-weight: 600;
  border-top: 1px solid var(--g-hairline);
  background: none;
}

/* summary-strip (Steps 3/5/6): hairline-top + neutral tint, never a heavy fill/border box —
   mirrors build-interactive.js Stage 3. Replaces the old dark-filled "ALL-IN LANDED COST" row
   and restrains the VAT/surcharge info-boxes to the same rationed-color treatment. Compound
   selectors win the cascade regardless of position relative to each block's own base rule. */
.summary-strip {
  border: none !important;
  border-top: 1px solid var(--g-hairline) !important;
  border-radius: 0 !important;
  background: var(--g-canvas) !important;
}
.summary-strip.tbl-footer { color: inherit; }
.summary-strip .tbl-footer-label { color: var(--g-text-slate); }
.summary-strip .tbl-footer-value {
  color: var(--g-chrome-ink);
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums lining-nums;
}
.summary-strip .ss-sub { font-size: 11px; color: var(--g-text-slate); }
.summary-strip.vat-block,
.summary-strip.surcharge-block { padding: 14px 16px; }
.summary-strip .vat-block-title,
.summary-strip .surcharge-title { color: var(--g-text-slate); }

/* info-row (Step 6): label left (slate) / figure right (mono tabular) — mirrors
   build-interactive.js's existing .info-row grammar, applied here to the report's Partner
   Deliverables / Hedges panels (previously .dl/dt/dd). */
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 4px 0;
}
.info-row span {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
  color: var(--g-text-slate);
  white-space: nowrap;
}
.info-row b {
  font-family: var(--f-mono);
  font-size: var(--fs-data);
  font-weight: 600;
  color: var(--g-chrome-ink);
  font-variant-numeric: tabular-nums lining-nums;
  text-align: right;
}
.info-row b.neg { color: var(--g-loss); }
`;


// ─── HTML generators ─────────────────────────────────────────────────────────

function headerSection(logo, trade, res) {
  const tisNet       = res.profit.tisNetProfit;
  const annRet       = res.tisAnnualisedReturnOnCargo ?? res.tisAnnualisedReturn;
  const exShipLanded = res.price.exShipLandedPerMT ?? res.price.landedCostPerMT;
  const exShipPrice  = res.price.exShipPricePerMT;
  const marginPct    = (exShipPrice && exShipLanded) ? (exShipPrice - exShipLanded) / exShipPrice : null;

  const parties = res.meta.parties || {};
  const isTisFunded = res.equityProvider === 'TIS';

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
        <span class="kpi-sub">${isTisFunded ? 'self-funded — no partner' : 'after partner split'}</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label">Annualised Return</span>
        <span class="kpi-value">${annRet != null ? fmt.pct(annRet) : '&mdash;'}</span>
        <span class="kpi-sub">on ${esc(res.annualReturnBaseLabel || 'bank LC mobilised')} &middot; ${res.financing.capitalLockupDays}d lockup</span>
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
    // RULE 1: NAFEM is the settlement rate that drives naira→USD P&L; parallel is reference/reconciliation
    // only. The role label always shows (status badge appended when present) so the semantics are explicit.
    { label:'FX NAFEM',    value: nafem    != null ? fmt.num(nafem,0)    + ' ₦/USD' : '—', sub: 'drives P&amp;L (settlement)' + (badge((fxIn.nafem   ||{}).status) ? ' ' + badge((fxIn.nafem   ||{}).status) : '') },
    { label:'FX Parallel', value: parallel != null ? fmt.num(parallel,0) + ' ₦/USD' : '—', sub: 'reference only' + (badge((fxIn.parallel||{}).status) ? ' ' + badge((fxIn.parallel||{}).status) : '') },
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
    const flagBadge = isRecov ? badge('RECOVERABLE') : badge(l.status);
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
        <table class="data-table" aria-label="Cost build-up">
          <thead>
            <tr>
              <th>#</th><th>Line Item</th><th>Category</th>
              <th class="r">Amount (USD)</th><th>Flag</th>
            </tr>
          </thead>
          <tbody>${costRows}</tbody>
        </table>
      </div>
      <div class="tbl-footer summary-strip">
        <div>
          <div class="tbl-footer-label">All-In Landed Cost</div>
          <div class="ss-sub" style="margin-top:2px">excl. recoverable VAT · ${fmt.mt(res.meta.deliveredQty)}</div>
        </div>
        <div style="text-align:right">
          <div class="tbl-footer-value">${fmt.usd(cost.allInCost)}</div>
          <div class="ss-sub" style="margin-top:2px">${fmt.usd(exShipLanded)}/MT</div>
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
        <table class="data-table" aria-label="Tax items">
          <thead>
            <tr><th>#</th><th>Item &amp; Legal Reference</th><th class="r">Amount (USD)</th><th>Status</th></tr>
          </thead>
          <tbody>${taxRows}</tbody>
        </table>
      </div>

      <div class="card-body">
        <div class="vat-block summary-strip" role="note" aria-label="Recoverable VAT block">
          <div class="vat-block-title">&#9679; Recoverable VAT — Cash-Flow Timing Only (NTA 2025 s.155(4))</div>
          <div class="dl">
            ${rv.lines.map(l => `<dt>Line ${l.id} ${esc(l.label)}</dt><dd>${fmt.usd(l.amount)}</dd>`).join('')}
            <dt>Gross input VAT</dt><dd>${fmt.usd(rv.grossRecoverable)}</dd>
            <dt>Taxable supply proportion</dt><dd>${fmt.pct(rv.taxableSupplyProportion)}</dd>
            <dt><strong>Recoverable (reclaim / WC timing)</strong></dt><dd><strong>${fmt.usd(rv.recoverable)}</strong></dd>
            ${rv.irrecoverable > 0 ? `<dt>Irrecoverable → added to landed cost</dt><dd class="warn">${fmt.usd(rv.irrecoverable)}</dd>` : ''}
          </div>
          <p style="font-size:11px;color:var(--g-text-slate);margin-top:8px">
            Does NOT affect profit. Recoverable VAT is a working-capital timing item only.
          </p>
        </div>

        <div class="surcharge-block summary-strip" role="note" aria-label="Fossil-fuel surcharge">
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
  const isTisFunded = res.equityProvider === 'TIS';

  // TIS self-funded → simple 3-node Revenue → All-in Cost → TIS Net (no partner waterfall).
  // Partner-funded → the 5-node standalone / margin-foregone / adjusted / partner-share / net waterfall.
  const wf = isTisFunded
    ? [
        { cls:'wf-standalone', label:'Revenue',     amount: res.revenue.combinedUSD, sub:'Combined channels', prefix:'' },
        { cls:'wf-deduct',     label:'All-In Cost', amount: res.cost.allInCost,      sub:'Incl. irrecoverable VAT', prefix:'−' },
        { cls: p.tisNetProfit < 0 ? 'wf-net wf-loss' : 'wf-net', label:'TIS Net Profit', amount: p.tisNetProfit, sub:'Self-funded — no partner', prefix:'=' },
      ]
    : [
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

  const hedges = res.hedges || {};
  const hedgeNote = (hedges.iceHedgeNetImpact || hedges.fxHedgeNetImpact)
    ? `ICE hedge impact: <b>${usdSign(hedges.iceHedgeNetImpact)}</b> &middot; FX hedge: <b>${usdSign(hedges.fxHedgeNetImpact)}</b> &middot; `
    : '';

  const reconcileHtml = isTisFunded
    ? `<span>${hedgeNote}Revenue − cost = TIS net: <b>${fmt.usd(res.revenue.combinedUSD)} − ${fmt.usd(res.cost.allInCost)} = ${fmt.usd(p.tisNetProfit)}</b></span>`
    : `<span>${hedgeNote}Reconciliation: marginForegone + adjusted = standalone
        &nbsp;&nbsp;
        <b>${fmt.usd(p.marginForegone)} + ${fmt.usd(p.adjustedProfit)} = ${fmt.usd(p.standaloneProfit)}</b>
        &nbsp;
        <span class="${p.reconciliation.ok ? 'wf-ok' : 'warn'}">${p.reconciliation.ok ? '&#10003; OK' : '&#9888; MISMATCH'}</span>
      </span>`;

  return `
<section class="section" aria-labelledby="waterfall-heading">
  <h2 class="section-heading" id="waterfall-heading">Profit Waterfall</h2>
  <div class="card">
    <div class="waterfall" role="region" aria-label="Profit waterfall">
      ${nodes}
    </div>
    <div class="wf-reconcile">
      ${reconcileHtml}
      ${annRet != null ? `<span>Annualised return: <b>${fmt.pct(annRet)}</b> on ${esc(annBase)} &middot; ${res.financing.capitalLockupDays}d lockup</span>` : ''}
    </div>
  </div>
</section>`;
}

function partnerAndHedge(trade, res) {
  const pd = res.partnerDelivers || {};
  const h  = res.hedge;
  const f  = res.financing;
  const isTisFunded = res.equityProvider === 'TIS';

  const subHead = (txt) => `<p style="font-family:var(--f-display);font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--slate);text-transform:uppercase;margin-bottom:8px">${txt}</p>`;

  // TIS self-funded → Equity Structure (no partner waterfall); partner-funded → Partner Deliverables.
  const partnerHtml = isTisFunded ? `
  <div class="section" aria-labelledby="partner-heading">
    <h2 class="section-heading" id="partner-heading">Equity Structure</h2>
    <div class="card">
      <div class="card-body">
        <p class="muted" style="font-size:12px;margin-bottom:10px">${esc(pd.note || 'TIS self-funded — no partner.')}</p>
        ${infoRow('Cargo value', fmt.usd(res.cargoValue))}
        ${infoRow('Partner funding (self)', fmt.usd(f.partnerFunding))}
        ${infoRow('Standalone = Adjusted = TIS net', fmt.usd(res.profit.tisNetProfit))}
      </div>
    </div>
  </div>` : `
  <div class="section" aria-labelledby="partner-heading">
    <h2 class="section-heading" id="partner-heading">Partner Deliverables</h2>
    <div class="card">
      <div class="card-body">
        <p class="muted" style="font-size:11px;margin-bottom:12px">${esc(pd.note || '')}</p>

        ${subHead('(1) Product Received')}
        ${infoRow('Tonnes (economic)', fmt.mt(pd.productReceived ? pd.productReceived.tonnes : null))}
        ${infoRow('Valued at ex-ship landed', fmt.usd(pd.productReceived ? (pd.productReceived.valuedAtExShipLandedCost ?? pd.productReceived.valuedAtLandedCost) : null))}
        ${infoRow('= Principal at par', fmt.usd(f.partnerFunding))}

        <div class="separator"></div>

        ${subHead('(2) Cash Received')}
        ${infoRow(`Profit share (${fmt.pct(res.profit.profitSharePct)})`, fmt.usd(pd.cashReceived ? pd.cashReceived.profitShare : null))}
        ${pd.cashReceived && pd.cashReceived.principalCashPortion > 0 ? infoRow('Principal (cash portion)', fmt.usd(pd.cashReceived.principalCashPortion)) : ''}
        ${infoRow('Settlement true-up', fmt.usd(pd.cashReceived ? pd.cashReceived.settlementTrueUp : null))}

        <div class="separator"></div>

        ${subHead('Funding Stack')}
        ${infoRow(`Partner bond (${fmt.pct(f.pct.bondPct)})`, fmt.usd(f.performanceBond))}
        ${infoRow(`Partner equity (${fmt.pct(f.pct.equityPct)})`, fmt.usd(f.equity))}
        ${infoRow(`Bank LC (${fmt.pct(f.pct.lcPct)})`, fmt.usd(f.lc))}

        ${res.quantities.paper ? `
        <div class="separator"></div>
        ${subHead('Paper vs Economic Quantities')}
        ${infoRow('Partner (economic)', fmt.mt(res.quantities.economic.partnerTonnes))}
        ${infoRow('Partner (paper, nearest 50)', `${fmt.mt(res.quantities.paper.partnerPaper, 0)} <span class="muted" style="font-size:11px">↓ (TIS favour)</span>`)}
        ${infoRow('TIS retained (economic)', fmt.mt(res.quantities.economic.tisRetainedTonnes))}
        ${infoRow('Settlement cash true-up', fmt.usd(res.quantities.paper.cashTrueUp))}` : ''}

        ${pd.principalTie ? `<div class="partner-tie summary-strip">
          Principal tie-out: owed <b>${fmt.usd(f.partnerFunding)}</b>
          = product <b>${fmt.usd(pd.principalTie.returnedProductValue)}</b>
          + cash <b>${fmt.usd(pd.principalTie.returnedCash)}</b>
          &nbsp;
          <span class="${pd.principalTie.ok ? 'tie-ok' : 'warn'}">${pd.principalTie.ok ? '&#10003; OK' : '&#9888; MISMATCH'}</span>
        </div>` : ''}
      </div>
    </div>
  </div>`;

  const iceOn  = !!(trade.hedge && trade.hedge.iceHedged);
  const fxOn   = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const hc     = res.hedgeComparison || null;
  const hedges = res.hedges || {};

  // Settlement ICE (item 7): when market.ice.final is set, the purchase floats to it; relabel the
  // live-ICE row + surface realized swap P&L.
  const finalSet = !!(trade.market && trade.market.ice && trade.market.ice.final != null);
  const effIce   = h.liveIce || (trade.market && trade.market.ice ? trade.market.ice.value : null);
  const iceRouteLbl = routeLabel(h.route, false);

  const hedgeHtml = `
  <div class="section" aria-labelledby="hedge-heading">
    <h2 class="section-heading" id="hedge-heading">Hedges</h2>
    <div class="card">
      <div class="card-body">

        ${subHead('ICE Gasoil Swap')}
        <div class="${iceOn ? 'hedge-toggle hedge-on' : 'hedge-toggle hedge-off'}">
          <span class="dot">${iceOn ? '&#10003;' : '&times;'}</span>
          ${iceOn ? 'HEDGED' : 'UNHEDGED'} — Toggle ${iceOn ? 'ON' : 'OFF'}
        </div>
        ${infoRow('Route', esc(iceRouteLbl))}
        ${infoRow('Lots', `${h.lots || 0} (${fmt.mt(h.hedgedTonnes)})`)}
        ${infoRow('Comparison basis', `${fmt.mt(h.comparisonBasisTonnes)} TIS retained`)}
        ${infoRow('Fixed price', `${h.fixedPrice ? fmt.usd(h.fixedPrice) + '/MT' : '—'} ${badge('PLACEHOLDER')}`)}
        ${infoRow(finalSet ? 'Settlement ICE (final)' : 'Live ICE', `${fmt.usd(effIce)}/MT ${finalSet ? badge('SETTLEMENT') : ''}`)}
        ${infoRow('Effective ICE cost', fmt.usd(h.effectiveIceCost))}
        ${infoRow('Unhedged ICE cost', fmt.usd(h.unhedgedIceCost))}
        ${infoRow('ICE cost delta', fmt.usd(h.iceCostDelta), signClass(-h.iceCostDelta))}
        ${finalSet ? infoRow('Realized hedge P&amp;L', `${usdSign(hedges.iceHedgeNetImpact)}${iceOn ? '' : ' (OFF — not applied)'}`) : ''}
        ${infoRow('Swap fee', `${fmt.usd(h.swapFee)} ${badge('PLACEHOLDER')}`)}
        ${infoRow('Bank-provided margin', fmt.usd(h.bankProvidedMargin))}
        ${infoRow('Extra financing cost', fmt.usd(h.extraFinancingCost))}
        ${finalSet ? `<p class="legal-ref" style="margin-top:8px">Realized at settlement ICE <b>${fmt.usd(effIce)}/MT</b>: the purchase floats to this price (landed cost recomputed) and the swap settles (final − fixed) × hedged tonnes on TIS's retained tonnes only.</p>` : ''}
        ${hc && hc.ice ? `
        <div class="summary-strip" style="margin-top:14px;padding:12px;font-size:12px;font-family:var(--f-body);">
          <b>Hedged vs Unhedged:</b>
          TIS net hedged ${fmt.usd(hc.ice.hedgedTisNet)} &nbsp;|&nbsp;
          unhedged ${fmt.usd(hc.ice.unhedgedTisNet)} &nbsp;|&nbsp;
          hedge worth <b>${usdSign(hc.ice.hedgeWorthItVsUnhedged)}</b>
        </div>` : ''}
        <p class="legal-ref" style="margin-top:10px">${badge(h.status || '')} All hedge params are PLACEHOLDER — confirm with bank/broker before any live hedge.</p>

        <div class="separator" style="margin:18px 0"></div>

        ${subHead('FX Hedge (Naira Exposure)')}
        <div class="${fxOn ? 'hedge-toggle hedge-on' : 'hedge-toggle hedge-off'}">
          <span class="dot">${fxOn ? '&#10003;' : '&times;'}</span>
          ${fxOn ? 'HEDGED' : 'UNHEDGED'} — Toggle ${fxOn ? 'ON' : 'OFF'}
        </div>
        ${(() => {
          const fh = res.fxHedge;
          if (!fh) return `<p class="muted" style="font-size:12px">No FX hedge in this trade flow — no naira legs.</p>`;
          if (fh.noHedgeReason) return infoRow('Note', esc(fh.noHedgeReason));
          const fxRouteLbl = routeLabel((trade.fxHedge || {}).route, true);
          return `${infoRow('Benchmark', esc(fh.benchmark || '—'))}
            ${infoRow('Route', esc(fxRouteLbl))}
            ${infoRow('Bank-repayment hedge base', `${fmt.num(fh.exposureNgn, 0)} ₦${fh.bankRepaymentUsd ? ` (= ${fmt.usd(fh.bankRepaymentUsd)} @ NAFEM)` : ''}`)}
            ${infoRow('Hedge ratio', fmt.pct(fh.hedgeRatio || 0))}
            ${infoRow('Forward rate', fh.forwardRate ? fmt.num(fh.forwardRate, 0) + ' ₦/USD' : badge('PLACEHOLDER'))}
            ${infoRow('FX realized delta', `${usdSign(fh.fxRealizedDeltaUsd || 0)}${fxOn ? '' : ' (OFF)'}`)}
            ${infoRow('FX hedge cost', fmt.usd(fh.extraFinancingCost || 0))}
            ${fh.basis ? infoRow('Basis risk (benchmark vs NAFEM)', `${fmt.num(fh.basis.gapNgnPerUsd, 2)} ₦/USD residual`) : ''}
          ${fh.basis ? `<p class="warn" style="font-size:12px;margin-top:8px">⚠ ${esc(fh.basis.note || '')}</p>` : ''}
          <p class="legal-ref" style="margin-top:8px">FX hedge covers the naira needed to repay the bank's USD facility (principal + interest). Naira profit is retained in naira and not hedged.</p>`;
        })()}
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

function pricingLadder(ladder, res) {
  // Show only the ladders relevant to the trade's legs (mirror the dashboard's renderLadder gating).
  // res.channels is present on unified/depot/ex-ship flows; the legacy equity-partner flow omits it and
  // is always ex-ship-only.
  const ch = (res && res.channels) || null;
  const hasExShip = ch ? ch.exShipPct > 0 : true;
  const depotApplicable = !!(ladder.depot && ladder.depot.applicable && ladder.depot.tiers && ladder.depot.tiers.length);
  const bothLadders = hasExShip && depotApplicable;
  const depotNote = depotApplicable ? null : (ladder.depot && ladder.depot.note);

  const ladderSub = (txt) => `<h3 style="font-family:var(--f-display);font-size:13px;font-weight:600;letter-spacing:.01em;color:var(--ink);margin:18px 0 8px">${txt}</h3>`;

  // ----- Ex-Ship $/MT ladder (margin-of-sell tiers) -----
  let exShipBlock = '';
  const ex = ladder.exShip;
  const current = ex && ex.current;
  if (hasExShip && ex && ex.tiers && ex.tiers.length) {
    const rows = ex.tiers.map(t => {
      const isCurrent = current && Math.abs(t.pricePerMT - current.pricePerMT) < 0.01;
      return `
      <tr class="${isCurrent ? 'ladder-current' : ''}">
        <td class="ladder-tier-name">${isCurrent ? '&#9658; ' : ''}${esc(t.name)}</td>
        <td class="r">${fmt.pct(t.marginOfSell)}</td>
        <td class="r"><b>${fmt.usd(t.pricePerMT)}</b>/MT</td>
        <td class="r">${fmt.usd(t.spreadPerMT)}/MT</td>
        <td class="r">${fmt.pct(t.markupPctOnCost)}</td>
        <td class="r">${t.spreadNgnPerL != null ? '&#8358;' + fmt.num(t.spreadNgnPerL) + '/L' : '—'}</td>
        <td class="r ${t.tisNetProfit >= 0 ? 'pos' : 'neg'}">${fmt.usd(t.tisNetProfit)}</td>
      </tr>`;
    }).join('');
    exShipBlock = `${bothLadders ? ladderSub('Ex-Ship $/MT Ladder') : ''}
    <div class="tbl-wrap">
      <table class="data-table" aria-label="Ex-ship pricing ladder">
        <thead>
          <tr>
            <th>Tier</th><th class="r">Margin % Sell</th><th class="r">Price $/MT</th>
            <th class="r">Spread $/MT</th><th class="r">Markup % Cost</th><th class="r">Spread ₦/L</th><th class="r">TIS Net</th>
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
    </div>` : ''}`;
  }

  // ----- Depot ₦/L ladder (absolute-spread tiers; native naira) -----
  let depotBlock = '';
  if (depotApplicable) {
    const curDepot = (res && res.price) ? res.price.depotPriceNgnPerL : null;
    const depotRows = ladder.depot.tiers.map(t => {
      const isCur = curDepot != null && isFinite(curDepot) && Math.abs(t.priceNgnPerL - curDepot) < 0.005;
      const net = (t.tisNetProfit == null)
        ? '<span class="muted">PENDING</span>'
        : `<span class="${t.tisNetProfit >= 0 ? 'pos' : 'neg'}">${fmt.usd(t.tisNetProfit)}</span>`;
      const rec = t.reconciliation || {};
      const delta = rec.deltaUsdPerMT != null
        ? `<span class="${rec.deltaUsdPerMT >= 0 ? 'pos' : 'neg'}" title="${esc(rec.note || '')}">${usdSign(rec.deltaUsdPerMT)}/MT</span>`
        : '<span class="muted">—</span>';
      return `
      <tr class="${isCur ? 'ladder-current' : ''}">
        <td class="ladder-tier-name">${isCur ? '&#9658; ' : ''}${esc(t.name)}</td>
        <td class="r"><b>&#8358;${fmt.num(t.priceNgnPerL, 2)}</b>/L</td>
        <td class="r">&#8358;${fmt.num(t.spreadNgnPerL, 0)}/L</td>
        <td class="r">${fmt.pct(t.marginPctOfSell)}</td>
        <td class="r">${fmt.pct(t.markupPctOnCost)}</td>
        <td class="r">${delta}</td>
        <td class="r">${net}</td>
      </tr>`;
    }).join('');
    const tierRate = ladder.depot.fxUsed;
    const tierBasisLabel = String(ladder.depot.fxBasis || 'parallel').toUpperCase(); // DERIVED from trade.pricing.conversion.fxMarketForDepot — never hardcoded
    const nafemRate = ladder.depot.nafemUsed;
    const deltaColLabel = `&#916; ${esc(tierBasisLabel)}&#8596;NAFEM`;
    const basisNote = nafemRate != null
      ? `Margin % / Markup % Cost ${badge('INDICATIVE')} are priced at ${esc(tierBasisLabel)} &#8358;${fmt.num(tierRate, 2)}/USD (market-quoting basis) &middot; TIS Net settles at NAFEM &#8358;${fmt.num(nafemRate, 2)}/USD (RULE 1) &middot; &ldquo;${deltaColLabel}&rdquo; is the reconciliation gap between the two bases, not a P&amp;L error.`
      : `Margin % / Markup % Cost ${badge('INDICATIVE')} are priced at ${esc(tierBasisLabel)} &#8358;${fmt.num(tierRate, 2)}/USD (market-quoting basis) &middot; TIS Net settles at NAFEM (RULE 1).`;
    depotBlock = `${ladderSub('Depot ₦/L Ladder')}
    <div class="tbl-wrap">
      <table class="data-table" aria-label="Depot pricing ladder">
        <thead>
          <tr>
            <th>Tier</th><th class="r">Price ₦/L</th><th class="r">Spread ₦/L</th>
            <th class="r">Margin %</th><th class="r">Markup % Cost</th>
            <th class="r">${deltaColLabel}</th><th class="r">TIS Net</th>
          </tr>
        </thead>
        <tbody>${depotRows}</tbody>
      </table>
    </div>
    <div class="card-footer" style="border-top:1px solid var(--border)">${basisNote}</div>`;
  }

  // ----- Cross-leg comparison (only when BOTH legs actually exist) -----
  let compBlock = '';
  const cmp = ladder.comparison;
  if (bothLadders && cmp && cmp.applicable && cmp.exShip && cmp.depot) {
    const winner = cmp.depotEarnsMoreAbsolute ? 'Depot' : 'Ex-ship';
    compBlock = `
    <div class="card-footer" style="border-top:1px solid var(--border)">
      <b>Cross-leg spread</b> (common ₦/L): Ex-ship <b>${esc(cmp.exShip.tier)}</b> ${fmt.num(cmp.exShip.spreadNgnPerL, 1)} ₦/L
      vs Depot <b>${esc(cmp.depot.tier)}</b> ${fmt.num(cmp.depot.spreadNgnPerL, 1)} ₦/L — <b>${winner}</b> earns the larger absolute spread.
      ${cmp.rationale ? `<div class="muted" style="font-size:11px;margin-top:4px">${esc(cmp.rationale)}</div>` : ''}
    </div>`;
  }

  // ----- Footer: landed-cost bases in native units -----
  const footerParts = [];
  if (hasExShip && ex) footerParts.push(`Ex-ship landed: <b>${fmt.usd(ex.costBasePerMT)}/MT</b> (excl. storage)`);
  if (depotApplicable && ladder.depot.costBaseNgnPerL != null) footerParts.push(`Depot landed: <b>${fmt.num(ladder.depot.costBaseNgnPerL, 2)} ₦/L</b>`);
  if (depotNote) footerParts.push(`Depot: ${esc(depotNote)}`);

  return `
<section class="section" aria-labelledby="ladder-heading">
  <h2 class="section-heading" id="ladder-heading">Pricing Ladder <span class="muted" style="font-size:11px;font-weight:400;letter-spacing:0;text-transform:none">— advisory only</span></h2>
  <div class="card">
    <p class="ladder-disclaimer">&#9888; ${esc(ladder.disclaimer)}</p>
    ${exShipBlock}
    ${depotBlock}
    ${compBlock}
    ${footerParts.length ? `<div class="card-footer" style="border-top: 1px solid var(--border)">${footerParts.join(' &nbsp;&middot;&nbsp; ')}</div>` : ''}
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
  const isFixture = /REGRESSION|FIXTURE|dummy/i.test(res.meta.tradeName);
  const disclaimer = isFixture
    ? 'All figures DUMMY/EXAMPLE data only. Not a real trade.'
    : 'Confidential — internal use only.';
  return `
<footer class="report-footer" role="contentinfo">
  TIS Global Trading &mdash; Internal Trade Model Report &mdash;
  ${esc(res.meta.tradeId)} &mdash; Generated ${generatedAt}
  &mdash; ${disclaimer}
</footer>`;
}


// ─── Full HTML assembly ───────────────────────────────────────────────────────

function generateHtml(logo, trade, res, ladder, generatedAt) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Trade model report — ${esc(res.meta.tradeId)}">
  <title>${esc(res.meta.tradeId)} — TIS Global Trading</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${CSS}${REPORT_CSS}</style>
</head>
<body>
${headerSection(logo, trade, res)}
<main class="container" id="main-content">
  ${paramCards(trade, res)}
  ${costAndTax(trade, res)}
  ${profitWaterfall(res)}
  ${partnerAndHedge(trade, res)}
  ${pricingLadder(ladder, res)}
  ${sensitivitiesSection(res.sensitivities)}
</main>
${footerSection(generatedAt, res)}
</body>
</html>`;
}

// `generateHtml` + `reportCss` are the original public surface (dashboard "Download Report"
// + build-report.js). The formatting helpers below are additionally exported so the
// Playwright PDF renderer (scripts/report-pdf-renderer.js) reuses byte-identical number,
// badge and sign formatting — the PDF must never re-derive or re-format any figure.
module.exports = {
  generateHtml,
  reportCss: CSS,
  // shared formatting helpers (reused by the PDF renderer — do not duplicate)
  esc, fmt, badge, signClass, usdSign, routeLabel, catLabel,
};
