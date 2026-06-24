'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

// ── 1. Bundle engine ─────────────────────────────────────────────────────────
execSync(
  'npx esbuild scripts/engine-browser-entry.js --bundle --format=iife --global-name=TISEngine --minify --outfile=out/engine.bundle.js',
  { cwd: ROOT, stdio: 'inherit' }
);
const engineBundle = fs.readFileSync(path.join(OUT, 'engine.bundle.js'), 'utf8');

// ── 2. Read sample trade as initial state ────────────────────────────────────
const initialTrade = JSON.parse(fs.readFileSync(path.join(ROOT, 'trades', 'sample-equity-partner.json'), 'utf8'));
const isSampleFlag = /REGRESSION|FIXTURE|dummy|test|sample/i.test(initialTrade.meta.tradeName || '');

// ── 2a. Favicon data URI (TIS mark, red #d41d1d, 32×32 logical square) ───────
const faviconDataUri = 'data:image/svg+xml,' + encodeURIComponent([
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 38">',
  '<text x="-0.65" y="36.55" font-family="Helvetica Neue,Helvetica,Arial,sans-serif"',
  ' font-weight="700" font-size="50" fill="#d41d1d">TIS</text>',
  '</svg>',
].join(''));

// ── 3. Read logo SVG ─────────────────────────────────────────────────────────
const logoSvgRaw = fs.readFileSync(path.join(ROOT, 'assets', 'tis-logo-2.svg'), 'utf8');
const logo = logoSvgRaw
  .replace(/^<\?xml[^?]*\?>\s*/,'')
  .replace(/<!DOCTYPE[^>]*>\s*/,'')
  .replace(/fill:#242331/g, 'fill:#f0f1f2');
// aria-label on the container provides accessibility; no <title> injected into inline SVG

// ── 4. CSS ───────────────────────────────────────────────────────────────────
function css() {
  const { reportCss } = require('./build-report');
  return reportCss + `
/* ════ INTERACTIVE: full-viewport sidebar layout ══════════════════════════ */
html, body { height: 100%; overflow: hidden; }
body { display: flex; flex-direction: column; }

/* Drawer toggle — hidden on wide screens */
.drawer-btn {
  display: none;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 16px;
  background: var(--white);
  border: none;
  border-bottom: 1.5px solid var(--border);
  cursor: pointer;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
  flex-shrink: 0;
}
.drawer-btn:hover { color: var(--ink); background: var(--bg); }
.drawer-arrow { margin-left: auto; font-size: 12px; }

/* App body: sidebar left, results right */
.app-body { flex: 1; display: flex; overflow: hidden; }

/* ── Sidebar ───────────────────────────────────────────────────── */
.sidebar {
  width: 290px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--white);
  border-right: 1.5px solid var(--border);
  overflow: hidden;
}

/* Tabs */
.sb-tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--border);
  background: var(--white);
}
.tab-btn {
  flex: 1;
  padding: 11px 0;
  background: none;
  border: none;
  border-bottom: 2.5px solid transparent;
  margin-bottom: -1.5px;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
  cursor: pointer;
  transition: color .15s, border-color .15s;
}
.tab-btn:hover { color: var(--ink); }
.tab-btn.active { color: var(--red); border-bottom-color: var(--red); }

/* Scrollable content */
.sb-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* Section groups */
.sb-sec { padding: 11px 13px; border-bottom: 1px solid var(--border); }
.sb-sec-title {
  font-family: var(--f-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: 9px;
}

/* Tier divider */
.tier-div {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 13px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.tier-div-lbl {
  font-family: var(--f-display);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: #94a3b8;
  white-space: nowrap;
}
.tier-div-line { flex: 1; height: 1px; background: var(--border); }

/* Disclosure / assumptions */
.disc-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 13px;
  background: var(--bg);
  border: none;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-family: var(--f-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: #94a3b8;
  transition: color .12s;
}
.disc-btn:hover { color: var(--slate); background: #eef0f3; }
.disc-body { display: none; }
.disc-body.open { display: block; }

/* ── Input rows ────────────────────────────────────────────────── */
.ir {
  display: flex;
  flex-direction: column;
  margin-bottom: 7px;
}
.ir:last-child { margin-bottom: 0; }
.ir-lbl {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--f-body);
  font-size: 10px;
  color: var(--slate);
  margin-bottom: 3px;
  line-height: 1.2;
}
/* Status pip */
.pip {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: help;
}
.pip-ok   { background: #10b981; }
.pip-conf { background: #f59e0b; }
.pip-ind  { background: #94a3b8; }
.pip-ph   { background: #f59e0b; }
.pip-unv  { background: #f97316; }
.pip-none { width: 0; }

/* Inputs */
.si {
  font-family: var(--f-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 7px;
  width: 100%;
  box-sizing: border-box;
  font-variant-numeric: tabular-nums lining-nums;
  transition: border-color .12s, box-shadow .12s;
  appearance: textfield;
}
.si:focus {
  outline: none;
  border-color: var(--ink);
  box-shadow: 0 0 0 2px rgba(36,35,49,.10);
}
.si:hover:not(:focus) { border-color: #9ca3af; background: #fafafa; }
.si.ph { border-color: #fdba74; background: #fffbf0; }

.ss {
  font-family: var(--f-body);
  font-size: 12px;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 7px;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.ss:focus { outline: none; border-color: var(--ink); }
.sr {
  font-family: var(--f-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--slate);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 7px;
  width: 100%;
  box-sizing: border-box;
}

/* Primary tier: larger */
.ir.pri .si { font-size: 13px; padding: 6px 8px; font-weight: 600; }
.ir.pri .ir-lbl { font-size: 10.5px; font-weight: 600; color: var(--ink-60); }

/* ── Toggle switches ────────────────────────────────────────────── */
.tgl-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  outline: none;
  padding: 1px 0;
}
.tgl-wrap:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(36,35,49,.25); }
.tgl-track {
  flex-shrink: 0;
  width: 34px; height: 18px;
  background: #c9cdd4;
  border-radius: 9px;
  position: relative;
  transition: background .18s;
}
.tgl-track.on { background: var(--ink); }
/* Hedge toggles ON → green (active = safe/good state) */
.tgl-wrap[data-type="hedge"] .tgl-track.on { background: #10b981; }
.tgl-wrap[data-type="hedge"]:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(16,185,129,.30); }
/* Surcharge toggle ON → amber (caution: cost/risk) */
.tgl-wrap[data-type="surcharge"] .tgl-track.on { background: #f59e0b; }
.tgl-wrap[data-type="surcharge"]:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(245,158,11,.30); }
.tgl-knob {
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,.22);
  transition: transform .18s;
}
.tgl-track.on .tgl-knob { transform: translateX(16px); }
.tgl-lbl {
  font-family: var(--f-body);
  font-size: 11px;
  font-weight: 500;
  color: var(--slate);
  transition: color .18s;
  line-height: 1;
}
.tgl-wrap[data-on="true"] .tgl-lbl { color: var(--ink); font-weight: 600; }
.tgl-set { display: flex; flex-direction: column; gap: 9px; }

/* Hedge tab: greyed disabled state */
.hedge-off { opacity: .38; pointer-events: none; }
.hedge-warn-note {
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 5px;
  color: #92400e;
  font-family: var(--f-body);
  font-size: 11px;
  padding: 7px 10px;
  margin-bottom: 10px;
  line-height: 1.4;
}
.hedge-off-note {
  font-family: var(--f-body);
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 10px;
  line-height: 1.4;
}

/* ── Sidebar footer ─────────────────────────────────────────────── */
.sb-footer {
  flex-shrink: 0;
  padding: 9px 13px;
  border-top: 1.5px solid var(--border);
  background: var(--white);
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-reset {
  flex: 1;
  padding: 6px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--f-body);
  font-size: 11px;
  color: var(--slate);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.btn-reset:hover { background: var(--bg); color: var(--ink); }
.state-badge {
  font-family: var(--f-display);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  border-radius: 3px;
  padding: 2px 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  display: inline-block;
}
.state-new      { color: var(--slate); background: var(--slate-bg); }
.state-saved    { color: #475569;      background: #f1f5f9; border: 1px solid #cbd5e1; }
.state-modified { color: #92400e;      background: #fef3c7; border: 1px solid #fbbf24; }

/* ── Results area ───────────────────────────────────────────────── */
.results {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px 64px;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Error banner */
.err-banner {
  background: #fff5f5;
  border: 1.5px solid #fca5a5;
  border-radius: 6px;
  color: #991b1b;
  font-family: var(--f-body);
  font-size: 12px;
  padding: 10px 16px;
}
.err-banner[hidden] { display: none; }

/* ── Waterfall row ──────────────────────────────────────────────── */
.wf-row {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  padding: 20px 20px 4px;
  gap: 0;
}
.wf-arrow {
  display: flex;
  align-items: center;
  color: var(--slate);
  font-size: 20px;
  padding: 0 5px;
  flex-shrink: 0;
}

/* ── Hedge cards: side by side, each card heights independently ─── */
.hedge-cards { display: flex; flex-direction: row; gap: 16px; align-items: flex-start; }
.hedge-cards .h-card { flex: 1; min-width: 0; }
.h-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.h-card.on { border-color: rgba(16,185,129,.35); }
.h-card-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px;
  background: var(--bg);
}
.h-card-title {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
}
.h-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 20px;
  font-family: var(--f-body);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  background: #f3f4f6;
  color: var(--slate);
  border: 1px solid var(--border);
  transition: all .18s;
}
.h-pill.on { background: rgba(16,185,129,.12); color: #059669; border-color: rgba(16,185,129,.40); }
.h-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* Detail expands on ON state */
.h-detail {
  max-height: 0;
  overflow: hidden;
  transition: max-height .3s ease;
}
.h-card.on .h-detail { max-height: 1000px; }
.h-detail-inner { padding: 14px 18px; border-bottom: 1px solid var(--border); }
/* Fix info-row layout in interactive card contexts (hedge detail + partner two-col) */
.h-detail .info-row,
.two-col-grid .info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
  line-height: 1.5;
}
.h-detail .info-row span,
.two-col-grid .info-row span { color: var(--slate); flex-shrink: 0; }
.h-detail .info-row b,
.two-col-grid .info-row b { font-variant-numeric: tabular-nums; text-align: right; word-break: break-word; }
.h-lock-warn {
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 5px;
  color: #92400e;
  font-family: var(--f-body);
  font-size: 11px;
  padding: 8px 12px;
  margin-bottom: 12px;
  line-height: 1.4;
}
/* Unit-sanity guard: implausibly large fee/spread (likely a units typo). Deeper amber than the
   INDICATIVE notes so it reads as "stop and check", not a routine placeholder hint. */
.h-unit-warn {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-left: 3px solid #b45309;
  border-radius: 5px;
  color: #7c2d12;
  font-family: var(--f-body);
  font-size: 11px;
  font-weight: 600;
  padding: 8px 11px;
  margin: 2px 0 10px;
  line-height: 1.45;
}
/* Comparison: always visible */
.h-cmp {
  padding: 12px 18px;
  background: var(--white);
}
.h-cmp-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--f-body);
  font-size: 12px;
  padding: 2px 0;
}
.h-cmp-lbl { color: var(--slate); }
.h-cmp-val { font-weight: 600; font-variant-numeric: tabular-nums; }
.h-cmp-delta { font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── Live badge ─────────────────────────────────────────────────── */
.live-badge {
  display: inline-block;
  background: #d1fae5;
  color: #065f46;
  font-family: var(--f-body);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  border-radius: 3px;
  padding: 2px 5px;
  margin-left: 8px;
  vertical-align: middle;
}

/* ── Ladder price-scale bar ─────────────────────────────────────── */
.ladder-scale-wrap { padding: 8px 20px 52px; position: relative; }
.ladder-scale-bar {
  height: 24px;
  border-radius: 4px;
  background: linear-gradient(to right, #fee2e2 0%, #fef3c7 42%, #d1fae5 76%, #bbf7d0 100%);
  position: relative;
}
.ladder-scale-tick {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 2px;
  background: var(--ink);
  transform: translateX(-50%);
  border-radius: 1px;
}
.ladder-scale-tick::after {
  content: attr(data-label);
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--f-body);
  font-size: 10px;
  font-weight: 600;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 6px;
}
/* ladder-tier-pip now defined below cost-totals block with alt + ::before tick */

/* ── Ladder tier pips: below bar, alternating rows ─────────────── */
.ladder-tier-pip {
  position: absolute;
  top: calc(100% + 5px);
  transform: translateX(-50%);
  font-family: var(--f-display);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: rgba(0,0,0,.55);
  white-space: nowrap;
  pointer-events: none;
  line-height: 1;
}
.ladder-tier-pip.alt { top: calc(100% + 20px); }
.ladder-tier-pip::before {
  content: '';
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  width: 1px;
  height: 10px;
  background: rgba(0,0,0,.25);
  transform: translateX(-50%);
}
.ladder-tier-pip.alt::before { bottom: calc(100% + 20px); height: 25px; }

/* ── Cost totals block ──────────────────────────────────────────── */
.cost-totals {
  background: var(--bg);
  border-top: 2px solid var(--border);
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cost-total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--f-body);
  font-size: 12px;
}
.cost-total-row span { color: var(--slate); }
.cost-total-row b { font-variant-numeric: tabular-nums; }

/* ── Tax net-after highlight ────────────────────────────────────── */
.tax-net-box {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
}
.tax-net-box .lbl { font-family: var(--f-body); font-size: 12px; color: #166534; }
.tax-net-box .val { font-family: var(--f-display); font-size: 20px; font-weight: 700; color: #15803d; font-variant-numeric: tabular-nums lining-nums; }

/* ── Sens heat-map cell classes ─────────────────────────────────── */
.sh-pos  { background: var(--heat-pos); }
.sh-pos-s{ background: var(--heat-pos-strong); }
.sh-neg  { background: var(--heat-neg); }
.sh-neg-s{ background: var(--heat-neg-strong); }

/* ── Val-flash (preserved) ──────────────────────────────────────── */
@keyframes val-flash {
  0%   { background-color: rgba(212,29,29,.07); }
  100% { background-color: transparent; }
}
.val-flash { animation: val-flash .5s ease-out; }

/* KPI chip flash */
@keyframes kpi-flash {
  0%   { opacity: .5; }
  100% { opacity: 1; }
}
.kpi-flash { animation: kpi-flash .3s ease-out; }

/* ── Two-col cards inside results ───────────────────────────────── */
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.two-col-grid > div { min-width: 0; }
.two-col-card { background: var(--white); border: 1px solid var(--border); border-radius: 10px; padding: 20px 24px; }

/* ── Route segmented control (on hedge card header) ─────────────── */
.route-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; flex-shrink: 0; }
.seg-btn { padding: 3px 9px; font-family: var(--f-body); font-size: 10px; font-weight: 600; background: none; border: none; border-right: 1px solid var(--border); cursor: pointer; color: var(--slate); white-space: nowrap; transition: background .12s, color .12s; line-height: 1.4; }
.seg-btn:last-child { border-right: none; }
.seg-btn:hover { background: var(--bg); color: var(--ink); }
.seg-btn.seg-active { background: var(--ink); color: #fff; }

/* ── Responsive: drawer at < 1000px ────────────────────────────── */
@media (max-width: 1000px) {
  .app-body { flex-direction: column; }
  .sidebar {
    width: 100%;
    max-height: 0;
    overflow: hidden;
    transition: max-height .35s ease;
    border-right: none;
    border-bottom: 1.5px solid var(--border);
    flex-shrink: 0;
  }
  .sidebar.open { max-height: 560px; overflow-y: auto; }
  .drawer-btn { display: flex !important; }
  .results { padding: 16px 14px 48px; }
  .two-col-grid { grid-template-columns: 1fr; }
  .hedge-cards { flex-direction: column; }
  .hedge-cards .h-card { min-width: unset; }
}

/* ════ SPACING SYSTEM — coherent rhythm across every interactive section ════

   Base unit: 4px.  Named steps used below:
     xs=4  sm=8  md=12  lg=16  xl=20  2xl=24  3xl=28  4xl=32
   All padding/gap/margin values snap to this grid.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 1. Header: full-bleed aligned to results band ─────────────────────────── */
/* reportCss uses max-width:1200px;margin:0 auto which floats the header content
   centered — at wide viewports it diverges from the sidebar+results layout.
   Override to remove that centering; use the same 28px padding as .results so
   the KPI chips' right edge aligns with the results area right edge.
   align-items:center from reportCss stays untouched.                              */
.header-inner {
  max-width: none;
  margin: 0;
  padding: 20px 28px;
}
/* Meta strip: same horizontal bounds as the header row                            */
.header-meta-inner {
  max-width: none;
  margin: 0;
  padding: 0 28px;
}
.kpi-chip { padding: 10px 16px; min-width: 126px; }

/* ── 2. Section headings: breathe above cards ────────────────────────────── */
.section-heading { margin-bottom: 14px; }

/* ── 3. Sidebar: 4px-grid alignment throughout ───────────────────────────── */
.sb-sec         { padding: 12px 16px; }
.sb-sec-title   { margin-bottom: 10px; }
.tier-div       { padding: 6px 16px; }
.disc-btn       { padding: 8px 16px; }
.sb-footer      { padding: 10px 16px; }
.ir             { margin-bottom: 8px; }
.tab-btn        { padding: 12px 0; }
.tgl-set        { gap: 10px; }

/* ── 4. Waterfall: more room in the row; proper reconcile text flow ──────── */
.wf-row { padding: 24px; }
/* Override reportCss padding on the shared wf-box class */
.wf-box { padding: 18px 16px; }
/* reportCss uses display:flex+gap on .wf-reconcile but content is inline;
   override to block so text wraps naturally with consistent line spacing   */
.wf-reconcile { display: block; padding: 12px 24px; line-height: 1.7; }

/* ── 5. Cost Build-Up totals: standard card padding, row breathing ───────── */
.cost-totals      { padding: 14px 24px; gap: 8px; }
.cost-total-row   { padding: 2px 0; }

/* ── 6. Partner Deliverables — all three missing style definitions ────────── */
/* .info-block separates logical groups within each column                   */
.info-block            { margin-bottom: 16px; }
.info-block:last-child { margin-bottom: 0; }

/* .info-sub is the sub-heading for each group ("(1) Product Received" etc.) */
.info-sub {
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

/* .tie-out-box is the principal reconciliation callout at the card bottom   */
.tie-out-box {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  font-family: var(--f-body);
  font-size: 12px;
  line-height: 1.5;
  border: 1.5px solid var(--border);
  background: var(--bg);
  color: var(--ink-60);
}
.tie-out-box.tie-ok   { background: #f0fdf4; border-color: #86efac; color: #166534; }
.tie-out-box.tie-warn { background: #fff5f5; border-color: #fca5a5; color: #991b1b; }
.tie-out-box b        { color: inherit; font-weight: 600; }

/* Info rows in partner two-col-grid and hedge detail: more vertical padding  */
.h-detail .info-row,
.two-col-grid .info-row { padding: 4px 0; }

/* ── 7. Hedge cards: more space throughout ───────────────────────────────── */
.hedge-cards    { gap: 20px; }
.h-card-hdr     { padding: 14px 20px; }
.h-detail-inner { padding: 16px 20px; }
.h-cmp          { padding: 14px 20px; }
.h-cmp-row      { padding: 3px 0; }

/* ── 8. Sensitivities / tornado: breathing room ──────────────────────────── */
.tn-wrap            { padding: 24px 24px 8px; }
.tn-row             { margin-bottom: 8px; }
.tn-baseline-label  { padding: 12px 0 8px; margin-top: 12px; }

/* ════ NEW-FEATURE STYLES ════════════════════════════════════════════════════ */

/* ── Text inputs share .si but don't need spinner removal ─────────────────── */
.si[type="text"] { -webkit-appearance: auto; appearance: auto; }

/* ── Sidebar footer: 3-row column layout ───────────────────────────────────── */
/* Override old .sb-footer (display:flex;align-items:center;gap:8px;padding:9px 13px)
   and the spacing-system override (padding:10px 16px). Rows own their padding. */
.sb-footer {
  flex-shrink:0; display:flex; flex-direction:column; align-items:stretch;
  padding:0; gap:0; border-top:1.5px solid var(--border); background:var(--white);
  overflow:hidden; box-sizing:border-box; width:100%;
}
.sb-footer-row1 {
  display:flex; align-items:center; gap:6px; padding:9px 14px 6px;
  box-sizing:border-box; width:100%; overflow:hidden;
}
.sb-state-row   {
  padding:4px 14px 6px; border-bottom:1px solid var(--border);
  box-sizing:border-box; width:100%; overflow:hidden;
}
.sb-footer-row2 {
  display:flex; align-items:center; gap:5px; padding:8px 14px;
  box-sizing:border-box; width:100%; overflow:hidden;
}

.btn-new {
  flex:1; padding:5px 8px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; transition:background .12s, color .12s; white-space:nowrap;
}
.btn-new:hover { background:var(--bg); color:var(--ink); }

.btn-save {
  padding:5px 12px; background:var(--ink); border:none; border-radius:4px;
  font-family:var(--f-body); font-size:11px; font-weight:600; color:#fff;
  cursor:pointer; transition:background .12s; white-space:nowrap;
}
.btn-save:hover { background:#3a3545; }

.btn-saveas {
  padding:5px 9px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; transition:background .12s, color .12s; white-space:nowrap;
}
.btn-saveas:hover { background:var(--bg); color:var(--ink); }

.btn-lib {
  padding:5px 8px; background:none; border:1px solid var(--border); border-radius:4px;
  font-family:var(--f-body); font-size:12px; color:var(--slate); cursor:pointer;
  flex-shrink:0; transition:background .12s, color .12s, border-color .12s;
}
.btn-lib:hover { background:var(--bg); color:var(--ink); }
.btn-lib-del:hover { background:var(--slate-bg); color:var(--ink); border-color:var(--slate); }

.lib-select {
  flex:1; font-family:var(--f-body); font-size:11px; color:var(--ink);
  background:var(--white); border:1px solid var(--border); border-radius:4px;
  padding:5px 6px; cursor:pointer; min-width:0; max-width:100%; overflow:hidden;
  text-overflow:ellipsis; box-sizing:border-box;
}
.lib-select:focus { outline:none; border-color:var(--ink); }

/* ── House defaults button + banner (Costs tab) ──────────────────────────── */
.btn-defaults {
  width:100%; padding:7px 10px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; text-align:left; transition:background .12s, color .12s;
}
.btn-defaults:hover { background:var(--bg); color:var(--ink); }
.defaults-note { font-family:var(--f-body); font-size:10px; color:#94a3b8; line-height:1.5; margin-top:5px; }
.costs-tab-banner {
  padding:8px 16px 7px; background:#f8fafc; border-bottom:1px solid var(--border);
  font-family:var(--f-body); font-size:10px; color:#94a3b8; line-height:1.5;
}

/* ── Per-trade chip in section title ─────────────────────────────────────── */
.per-trade-tag {
  display:inline-block; margin-left:6px; padding:1px 5px;
  background:var(--bg); border:1px solid var(--border); border-radius:3px;
  font-family:var(--f-display); font-size:7.5px; font-weight:700;
  letter-spacing:.08em; text-transform:uppercase; color:#94a3b8;
  vertical-align:middle;
}

/* ── FX rate role tags (settlement vs reference) ─────────────────────────── */
.rate-tag {
  display:inline-block; margin-left:6px; padding:1px 5px; border-radius:3px;
  font-family:var(--f-display); font-size:7.5px; font-weight:700;
  letter-spacing:.06em; text-transform:uppercase; vertical-align:middle;
}
/* settlement / P&L driver — green (positive / active, per palette) */
.rate-settle { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
/* reference only — neutral slate, visibly secondary */
.rate-ref    { background:var(--bg); color:#717c89; border:1px solid var(--border); }

/* ── C4 (Batch C) / D2 (Batch D): 3-state taxonomy badge overrides ─────────── */
/* Defensive: keep bdg-placeholder styled amber even though badge() no longer emits it */
:root { --placeholder-c: #92400e; --placeholder-bg: #fef3c7; }
.bdg.bdg-placeholder { color: #92400e !important; background: #fef3c7; }
/* INDICATIVE: amber — reasonable estimate, fine to model */
.bdg.bdg-indicative  { color: #92400e; background: #fef3c7; }
/* UNVERIFIED: deeper amber — needs checking before live trade */
.bdg.bdg-unverified  { color: #7c2d12; background: #fed7aa; }
/* pip-ind: amber dot (override reportCss slate) */
.pip-ind { background: #f59e0b; }

/* ── D3: Status legend ──────────────────────────────────────────────────────── */
.status-legend {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  font-family: var(--f-body); font-size: 10px; color: #717c89;
  padding: 8px 12px; border-top: 1px solid var(--border); margin-top: 2px;
}
.status-legend .sl-item { display: flex; align-items: center; gap: 5px; }
.status-legend .sl-check { color: #10b981; font-size: 11px; font-weight: 700; }
.status-legend .sl-key { font-weight: 600; color: #4b5563; }

/* ── Empty state (blank/new trade — insufficient inputs to compute) ─────────── */
.empty-state-section { min-height: 260px; display:flex; align-items:center; justify-content:center;
  border:none; background:none; box-shadow:none; padding:0; }
.empty-state { text-align:center; padding:48px 24px; }
.empty-state-title { font-family:var(--f-display); font-size:14px; font-weight:600;
  color:#4b5563; margin:0 0 6px; letter-spacing:0; }
.empty-state-sub { font-family:var(--f-body); font-size:11px; color:#94a3b8; margin:0; }

/* ── C1: Expected negative figures → slate/neutral, not alarm-red ─────────── */
/* .neg is used for expected structural negatives (hedge cost, sensitivity deltas).
   .loss is for actual P&L losses (TIS Net negative at a pricing tier). */
.neg { color: #717c89; }
.loss { color: #991b1b; }
.sens-neg        { background: var(--heat-neg); color: #4b5563; font-weight: 600; }
.sens-neg-strong { background: var(--heat-neg-strong); color: #374151; font-weight: 700; }
/* Subtle separator between lever groups in the sensitivities table (each lever's +/- pair) */
.sens-group-start td { border-top: 2px solid var(--border); }
.tn-neg .tn-val { color: #4b5563; }
.tn-neg-val     { color: #717c89; }

/* ── Toast ───────────────────────────────────────────────────────────────── */
.tis-toast {
  position:fixed; bottom:20px; left:50%;
  transform:translateX(-50%) translateY(60px);
  background:var(--ink); color:#fff;
  font-family:var(--f-body); font-size:12px;
  padding:8px 18px; border-radius:6px;
  z-index:9999; transition:transform .22s ease, opacity .22s ease;
  opacity:0; pointer-events:none; white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,.18);
}
.tis-toast.visible { transform:translateX(-50%) translateY(0); opacity:1; }

/* ════ Per-leg revenue editor ═════════════════════════════════════════════ */
.leg-editor { display:flex; flex-direction:column; gap:8px; }
.leg-row {
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:6px 8px;
  padding:9px 32px 10px 10px;  /* right: 32px reserves space for the × button */
  border:1px solid var(--border);
  border-radius:7px;
  background:var(--white);
  position:relative;
  box-sizing:border-box;
}
.leg-row .leg-field { display:flex; flex-direction:column; gap:3px; min-width:0; }
.leg-row .leg-field.full { grid-column:1 / -1; }
.leg-field-lbl {
  font-family:var(--f-display); font-size:9px; font-weight:700;
  letter-spacing:.07em; text-transform:uppercase; color:var(--slate);
}
.leg-row select.leg-in, .leg-row input.leg-in {
  width:100%; box-sizing:border-box;
  padding:6px 8px; font-family:var(--f-body); font-size:13px;
  border:1px solid var(--border); border-radius:5px; background:#fff; color:var(--ink);
}
.leg-row select.leg-in:disabled { background:#f3f4f6; color:var(--slate); cursor:not-allowed; }
.leg-row input.leg-in:focus, .leg-row select.leg-in:focus {
  outline:none; border-color:var(--ink); box-shadow:0 0 0 2px rgba(36,35,49,.10);
}
.leg-qty-group { display:flex; gap:6px; }
.leg-qty-group input.leg-in { flex:1; min-width:0; }
.leg-qty-group select.leg-in { flex:0 0 64px; }
.leg-row .leg-del {
  position:absolute; top:6px; right:7px;
  width:20px; height:20px; line-height:18px; text-align:center;
  border:none; background:transparent; color:var(--slate);
  font-size:16px; cursor:pointer; border-radius:4px;
}
.leg-row .leg-del:hover { background:#f3f4f6; color:#991b1b; }
.leg-foot { display:flex; align-items:center; justify-content:space-between; margin-top:9px; gap:10px; }
.leg-add {
  padding:7px 13px; font-family:var(--f-display); font-size:11px; font-weight:700;
  letter-spacing:.04em; color:var(--ink); background:var(--white);
  border:1px dashed var(--slate); border-radius:6px; cursor:pointer;
}
.leg-add:hover { background:#f3f4f6; border-color:var(--ink); }
.leg-total { font-family:var(--f-body); font-size:12px; text-align:right; line-height:1.35; }
.leg-total b { font-family:var(--f-display); font-weight:700; }
.leg-total.ok   { color:#15803d; }
.leg-total.bad  { color:#92400e; }
.leg-total .leg-total-flag { font-weight:700; }
/* Unpriced leg — calm amber cue (same language as hedge placeholders); P&L stays pending. */
.leg-in.leg-in-pending { border-color:#f59e0b; background:#fffbeb; }
.leg-price-flag { color:#92400e; font-weight:700; font-size:9px; letter-spacing:.04em; }
.leg-ngn-equiv { font-family:var(--f-body); font-size:10px; color:#94a3b8; margin-top:2px; display:block; min-height:13px; }
.ladder-ngn-equiv { color:var(--slate); font-weight:400; font-size:11px; white-space:nowrap; }

/* Per-leg native-currency ladders */
.ladder-sub { font-family:var(--f-display); font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--slate); margin:18px 20px 8px; }
.ladder-compare { margin:14px 20px 0; padding:10px 13px; background:#f8fafc; border:1px solid var(--border); border-radius:7px; font-family:var(--f-body); font-size:12px; color:var(--ink); line-height:1.5; }
.ladder-compare b { font-family:var(--f-display); }
.ladder-compare .lc-rationale { color:var(--slate); font-size:11px; }
`;
}

// ── 5. Build helpers ─────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const t = initialTrade;
const f = t.financing;
const p = t.partner;
const cl = t.costLines;
const hg = t.hedge;
const fxhg = t.fxHedge || {};
const sur = t.tax.surcharge || {};

// Round to N decimal places for display
function dp(v, n) { return parseFloat((+v).toFixed(n)); }
// Percent: 0.075 → 7.5 (shown in input)
function pct2(v) { return dp(v * 100, 2); }
function pct4(v) { return dp(v * 100, 4); }

// Input component builders
function ni(id, val, step, min, cls) {
  const minAttr = min != null ? ` min="${min}"` : '';
  const clsStr  = cls ? ` ${cls}` : '';
  const phData  = cls === 'ph' ? ' data-ph="1"' : '';
  return `<input type="number" id="${id}" class="si${clsStr}" value="${val !== '' && val != null ? val : ''}" step="${step ?? 'any'}"${minAttr}${phData}>`;
}
function si(id, opts, sel) {
  const o = opts.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `<select id="${id}" class="ss">${o}</select>`;
}
function ro(id, val) {
  return `<div id="${id}" class="sr">${esc(String(val ?? ''))}</div>`;
}
function ti(id, val, placeholder) {
  const ph = placeholder ? ` placeholder="${esc(placeholder)}"` : '';
  return `<input type="text" id="${id}" class="si" value="${esc(val ?? '')}"${ph}>`;
}
function tog(id, label, active, type) {
  const typeAttr = type ? ` data-type="${type}"` : '';
  return `<div id="${id}" class="tgl-wrap" data-on="${active}"${typeAttr} tabindex="0" role="switch" aria-checked="${active}" aria-label="${esc(label)}">
    <div class="tgl-track${active ? ' on' : ''}"><div class="tgl-knob"></div></div>
    <span class="tgl-lbl">${esc(label)}</span>
  </div>`;
}

function pip(status) {
  const s = (status || '').toUpperCase();
  let cls;
  if (!status || s === 'OK' || s.includes('FIXED')) cls = 'pip-ok';
  else if (s.includes('CONFIRM') || s.includes('UNVERIFIED')) cls = 'pip-unv';
  else cls = 'pip-ind';
  return `<span class="pip ${cls}" title="${esc(status || 'OK')}"></span>`;
}

function ir(id, label, inputHtml, status, primary) {
  const pr = primary ? ' pri' : '';
  return `<div class="ir${pr}">
  <label class="ir-lbl" for="${id}">${pip(status)}${esc(label)}</label>
  ${inputHtml}
</div>`;
}
function sec(title, rows) {
  // title is always a hardcoded string from this file — never user input — so no esc() needed
  return `<div class="sb-sec"><div class="sb-sec-title">${title}</div>${rows}</div>`;
}
function tdiv(label) {
  return `<div class="tier-div"><span class="tier-div-lbl">${esc(label)}</span><span class="tier-div-line"></span></div>`;
}

// ── 6. Sidebar HTML ──────────────────────────────────────────────────────────
const lcPctInit = dp(1 - p.bondPct - p.equityPct, 2) * 100;
const exShipPctInit = t.channels ? dp(t.channels.exShipPct * 100, 1) : 100;
const depotPctInit  = t.channels ? dp(t.channels.depotPct  * 100, 1) : 0;
const depotActive   = depotPctInit > 0;
const surEnabled    = !!(sur.enabled);
const iceOn         = !!(hg.iceHedged);
const fxOn          = !!(fxhg.fxHedged);

// ── Tab: Deal ────────────────────────────────────────────────────────────────
const shortTitleRaw = t.meta.tradeName.replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi, '').trim();
const tabDeal = `
${sec('Trade Identity <span class="per-trade-tag">per-trade</span>', [
  ir('inp-trade-name',    'Trade name',  ti('inp-trade-name',    shortTitleRaw,                   'e.g. Reference Trade 001'), ''),
  ir('inp-partner-name',  'Partner',     ti('inp-partner-name',  (t.parties||{}).partner  || '', 'Partner name'), ''),
  ir('inp-supplier-name', 'Supplier',    ti('inp-supplier-name', (t.parties||{}).supplier || '', 'Supplier name'), ''),
  ir('inp-inspector-name','Inspector',   ti('inp-inspector-name',(t.parties||{}).inspector|| '', 'Inspector name'), ''),
].join(''))}
${sec('Pricing <span class="live-badge">Live</span>', [
  ir('inp-ice',       'ICE LSGO $/MT',      ni('inp-ice',       t.market.ice.value,           0.01, 0),     t.market.ice.status, true),
  ir('inp-ice-final', 'Final ICE $/MT (settlement)', ni('inp-ice-final', t.market.ice.final != null ? t.market.ice.final : '', 0.01, 0, 'ph'), 'INDICATIVE'),
  '<p class="defaults-note">Leave blank to use live ICE. Enter the settled ICE at payment to see the realized hedge outcome — your purchase floats at this price; the swap offsets it on hedged tonnes.</p>',
  ir('inp-fob',       'FOB Premium $/MT',    ni('inp-fob',       t.market.fobPremium.value,    0.01),        '', true),
  `<div class="ir pri">
    <label class="ir-lbl" for="inp-fxnafem">${pip(t.fx.nafem.status)}FX NAFEM ₦/USD <span class="rate-tag rate-settle">settlement · P&amp;L</span></label>
    ${ni('inp-fxnafem', t.fx.nafem.value, 1, 1)}
  </div>`,
  '<p class="defaults-note" style="margin-top:-2px">Settlement rate — bank converts naira proceeds to USD at NAFEM, so this drives <b>all naira P&amp;L</b> (RULE 1). The live FX sensitivity lever.</p>',
  ir('inp-delivered', 'Delivered MT',        ni('inp-delivered', t.cargo.deliveredQtyMT,        1, 1),        '', true),
].join(''))}
${sec('Sale — Revenue Legs', [
  '<div class="leg-editor" id="leg-editor"></div>',
  '<div class="leg-foot"><button type="button" id="btn-add-leg" class="leg-add">+ Add leg</button>'
    + '<div class="leg-total" id="leg-total"></div></div>',
  '<p class="defaults-note" style="margin-top:6px">Each leg = channel + pricing unit + tonnage (or % of cargo) + price in its native unit. Depot legs are always ₦/L. Leg tonnage must sum to Delivered MT. Price is optional per leg — leave blank to price from the ladder first.</p>',
  ir('inp-profit-split', 'Partner Profit Split %', ni('inp-profit-split', pct2(p.profitSharePct), 1, 0), '', true),
].join(''))}
${sec('Toggles', `<div class="tgl-set">
  ${tog('tog-ice-hedge', 'ICE Gasoil Hedge', iceOn, 'hedge')}
  ${tog('tog-fx-hedge',  'FX Hedge (Naira)', fxOn, 'hedge')}
  ${tog('tog-surcharge', 'Fossil-fuel Surcharge', surEnabled, 'surcharge')}
</div>`)}

${tdiv('Deal Terms')}

${sec('FX & Currency', [
  `<div class="ir">
    <label class="ir-lbl" for="inp-fxpar">${pip(t.fx.parallel.status)}FX Parallel ₦/USD <span class="rate-tag rate-ref">reference only</span></label>
    ${ni('inp-fxpar', t.fx.parallel.value, 1, 1)}
  </div>`,
  '<p class="defaults-note" style="margin-top:-2px">Street / parallel rate — display, exposure and reconciliation only. Drives <b>zero P&amp;L</b> (RULE 1). NAFEM (Pricing, above) is the settlement rate.</p>',
  '<p class="defaults-note">Currency mode is derived from the revenue legs above (USD-only, naira-only, or split).</p>',
  ir('inp-taxable-prop', 'Taxable Supply Prop.', ni('inp-taxable-prop', t.tax.taxableSupplyProportion, 0.05, 0), 'INDICATIVE'),
].join(''))}
${sec('Freight', [
  ir('inp-tc-rate',   'TC Rate $/day',    ni('inp-tc-rate',   t.freight.tcRatePerDay,   500,  0), t.freight.status || 'INDICATIVE'),
  ir('inp-charter',   'Charter Days',     ni('inp-charter',   t.freight.charterDays,    1,    0), t.freight.status || 'INDICATIVE'),
  ir('inp-demurrage', 'Demurrage Days',   ni('inp-demurrage', t.freight.demurrageDays,  0.5,  0), t.freight.status || 'INDICATIVE'),
].join(''))}
${sec('Financing', [
  ir('inp-credit-rate', 'Credit Rate %/yr',    ni('inp-credit-rate', pct2(f.creditRate), 0.1, 0), f.status || 'INDICATIVE'),
  ir('inp-lc-fee',      'LC Fee %',            ni('inp-lc-fee', pct2(f.lcFeePct), 0.01, 0),       f.status || 'INDICATIVE'),
  ir('inp-fin-days',    'Financing Days',      ni('inp-fin-days', f.financingDays, 1, 1),          ''),
  ir('inp-lockup',      'Capital Lockup Days', ni('inp-lockup', f.capitalLockupDays, 1, 1),        ''),
  ir('inp-wc-sublimit', 'WC Sublimit $',       ni('inp-wc-sublimit', f.wcSublimit, 10000, 0),      'INDICATIVE'),
].join(''))}
${sec('Partner & Equity', [
  ir('sel-equity-provider', 'Equity Provider',    si('sel-equity-provider', [['partner','Partner (equity split)'],['TIS','TIS (self-funded)']], p.equityProvider || 'partner'), ''),
  ir('inp-bond',    'Bond % of cargo',  ni('inp-bond',    pct2(p.bondPct),  0.5, 0), ''),
  ir('inp-equity',  'Equity % of cargo',ni('inp-equity',  pct2(p.equityPct),0.5, 0), ''),
  `<div class="ir">
    <label class="ir-lbl" for="lc-display">${pip('')}LC % (auto-derived)</label>
    <div id="lc-display" class="sr">${lcPctInit.toFixed(2)}%</div>
  </div>`,
  `<div class="ir">
    <label class="ir-lbl" for="inp-product-alloc">${pip('')}<span title="Fraction of the partner's principal (their equity stake) returned in-kind as product rather than cash. 100% = full product; 0% = full cash. Does not change the partner's share of the cargo.">Partner principal as product %&nbsp;ⓘ</span></label>
    ${ni('inp-product-alloc', pct2(p.productAllocationPct ?? 1), 5, 0)}
  </div>`,
].join(''))}
${sec('Surcharge', [
  `<div id="sur-inc-row"${!surEnabled ? ' hidden' : ''}>
    ${ir('sel-surcharge-inc', 'Surcharge incidence', si('sel-surcharge-inc', [['cost','Cost (TIS bears)'],['pass_through','Pass-through (buyer)']], (sur.incidence) || 'cost'), 'INDICATIVE')}
  </div>`,
  `<div id="sur-off-note" class="ir-lbl" style="color:#94a3b8"${surEnabled ? ' hidden' : ''}>Enable toggle to configure incidence</div>`,
].join(''))}
<button class="disc-btn" onclick="toggleDisc(this)">Assumptions &amp; Tax Rates <span>▼</span></button>
<div class="disc-body">
${sec('Tax Rates', [
  ir('inp-vat-rate', 'VAT Rate %',        ni('inp-vat-rate', pct2(t.tax.vatRate),             0.1, 0), 'OK'),
  ir('inp-wht-rate', 'WHT on freight %',  ni('inp-wht-rate', pct2(t.tax.whtFreightRate || 0.05), 0.1, 0), 'UNVERIFIED'),
].join(''))}
</div>
`;

// ── Tab: Costs ───────────────────────────────────────────────────────────────
const tabCosts = `
<div class="costs-tab-banner">House defaults — rates &amp; fees that persist across new trades</div>
${sec('Port & Cargo Dues', [
  ir('inp-npa-per-mt', 'NPA cargo dues $/MT', ni('inp-npa-per-mt', cl.npaCargoDuesPerMT, 0.1, 0), 'OK'),
  ir('inp-port-das',   'Port DAs $',          ni('inp-port-das',   cl.portDAs, 1000, 0),           'OK'),
  ir('inp-ncs-docs',   'NCS documentation $', ni('inp-ncs-docs',   cl.ncsDocs, 100, 0),            'OK'),
].join(''))}
${sec('Maritime Levies', [
  ir('inp-nimasa-cab',     'NIMASA cabotage %',     ni('inp-nimasa-cab',     pct2(cl.nimasaCabotagePct),     0.1, 0), 'UNVERIFIED'),
  ir('inp-nimasa-freight', 'NIMASA freight levy %', ni('inp-nimasa-freight', pct2(cl.nimasaFreightLevyPct), 0.1, 0), 'UNVERIFIED'),
  ir('inp-spomo',          'SPOMO / CVFF %',        ni('inp-spomo',          pct2(cl.spomoCvffPct),         0.1, 0), 'UNVERIFIED'),
].join(''))}
${sec('Cargo & Services', [
  ir('inp-marine-icc',    'Marine ICC(A) %',      ni('inp-marine-icc',    pct4(cl.marineIccPct),    0.001, 0), 'INDICATIVE'),
  ir('inp-sgs',           'SGS inspection $',     ni('inp-sgs',           cl.sgsInspection,         500,   0), 'OK'),
  ir('inp-port-agency',   'Port agency $',        ni('inp-port-agency',   cl.portAgency,            500,   0), 'OK'),
  ir('inp-alloc-security','Allocated security %', ni('inp-alloc-security',pct4(cl.allocSecurityPct),0.001, 0), 'INDICATIVE'),
].join(''))}
${sec('Banking & Admin', [
  ir('inp-bank-charges',  'Bank charges $',      ni('inp-bank-charges',  cl.bankCharges,      100,  0), 'OK'),
  ir('inp-overhead',      'Overhead $',          ni('inp-overhead',      cl.overhead,          100,  0), 'OK'),
  ir('inp-contingency',   'Contingency $',       ni('inp-contingency',   cl.contingency,       1000, 0), 'OK'),
  ir('inp-collateral-mgr','Collateral manager $',ni('inp-collateral-mgr',cl.collateralManager, 100,  0), 'OK'),
].join(''))}
<div id="storage-sec"${!depotActive ? ' hidden' : ''}>
${sec('Storage (depot active)', [
  ir('inp-throughput',     'Throughput ₦/MT',       ni('inp-throughput',     cl.throughputNgnPerMT || cl.throughput    || 0,  100,   0), 'OK'),
  ir('inp-storage-rental', 'Storage rental ₦ total',ni('inp-storage-rental', cl.storageRentalNgn   || cl.storageRental || 0,  10000, 0), 'OK'),
  ir('inp-evaporation',    'Evaporation %',          ni('inp-evaporation',    pct4(cl.evaporationPct),     0.01, 0), 'INDICATIVE'),
  ir('inp-tank-insurance', 'Tank insurance %',       ni('inp-tank-insurance', pct4(cl.tankInsurancePct),   0.001,0), 'INDICATIVE'),
  ir('inp-litres-per-mt',  'Litres per MT (density)',ni('inp-litres-per-mt',  t.pricing.conversion.litresPerMT, 1, 100), 'INDICATIVE'),
].join(''))}
</div>
<div id="storage-off-note" class="sb-sec" style="color:#94a3b8;font-family:var(--f-body);font-size:11px"${depotActive ? ' hidden' : ''}>Storage inputs activate when a depot revenue leg is added (Sale section, Deal tab).</div>
<div class="sb-sec">
  <button class="btn-defaults" onclick="saveAsDefaults()">↓ Save current rates as house defaults</button>
  <div class="defaults-note">Saves cost lines, tax rates &amp; hedge bank terms — applied automatically on New Trade.</div>
</div>
`;

// ── Tab: Hedge ───────────────────────────────────────────────────────────────
const tabHedge = `
<div class="sb-sec">
  <div class="sb-sec-title">ICE Gasoil Swap</div>
  <div id="ice-on-warn" class="hedge-warn-note"${!iceOn ? ' hidden' : ''}>Hedge ON — unconfirmed values are marked INDICATIVE. Verify all before live trading.</div>
  <div id="ice-off-note" class="hedge-off-note"${iceOn ? ' hidden' : ''}>Enable ICE Hedge in Deal tab to activate.</div>
  <div id="ice-params" class="${iceOn ? '' : 'hedge-off'}">
    ${ir('sel-ice-route', 'Route', si('sel-ice-route', [['bank_book','Bank book'],['third_party','Third-party (margin)']], hg.route || 'bank_book'), '')}
    ${ir('inp-ice-fixed',  'Fixed price $/MT',  ni('inp-ice-fixed',  hg.fixedPrice != null ? hg.fixedPrice : '', 0.01, 0, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-ice-fee',    'Swap fee $/MT',      ni('inp-ice-fee',    hg.feePerMT || 1.5, 0.01, 0, 'ph'),   'PLACEHOLDER')}
    <div id="ice-spread-row"${hg.route === 'third_party' ? ' hidden' : ''}>
      ${ir('inp-ice-spread', 'Bank spread $/MT', ni('inp-ice-spread', hg.bankSpreadPerMT || 0.5, 0.01, 0), 'INDICATIVE')}
    </div>
    <div id="ice-margin-row"${hg.route !== 'third_party' ? ' hidden' : ''}>
      ${ir('inp-ice-margin', 'Initial margin %', ni('inp-ice-margin', pct2(hg.initialMarginPct || 0.10), 1, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    ${ir('inp-ice-hedged-vol', 'Hedged volume MT', ni('inp-ice-hedged-vol', hg.hedgedVolumeMT != null ? hg.hedgedVolumeMT : '', 100, 0), 'INDICATIVE')}
    <p class="defaults-note">Swap fee and bank spread are absolute <b>$/MT</b> amounts (×&nbsp;hedged tonnes), not a fraction of notional — typically ~$0.5–$2/MT.</p>
    <div id="ice-fee-warn" class="h-unit-warn" hidden></div>
    <p class="defaults-note">Defaults to TIS-retained tonnes — the fixed-price tonnes sold to clients. Partner principal is repaid at par (= landed cost), so ICE cancels on partner tonnes; only TIS's fixed-price tonnes carry ICE risk. Raise to full cargo only if partner repayment is fixed-VALUE rather than par/landed-cost.</p>
  </div>
</div>
<div class="sb-sec">
  <div class="sb-sec-title">FX Hedge (Naira Exposure)</div>
  <div id="fx-on-warn" class="hedge-warn-note"${!fxOn ? ' hidden' : ''}>FX Hedge ON — unconfirmed values are marked INDICATIVE. Verify all before live trading.</div>
  <div id="fx-off-note" class="hedge-off-note"${fxOn ? ' hidden' : ''}>Enable FX Hedge in Deal tab to activate.</div>
  <div id="fx-params" class="${fxOn ? '' : 'hedge-off'}">
    ${ir('sel-fx-route',   'Route',             si('sel-fx-route', [['bank_book','Bank forward'],['third_party','Third-party NDF']], fxhg.route || 'bank_book'), '')}
    ${ir('inp-fx-forward', 'Forward rate ₦/USD',ni('inp-fx-forward', fxhg.forwardRate != null ? fxhg.forwardRate : '', 1, 1, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-fx-ratio',   'Hedge ratio %',     ni('inp-fx-ratio',  pct2(fxhg.hedgeRatio != null ? fxhg.hedgeRatio : 1), 5, 0), 'INDICATIVE')}
    ${ir('inp-fx-fee',     'Fee $/USD (e.g. 0.004)',    ni('inp-fx-fee',    fxhg.feePerUsd || 0.004, 0.001, 0, 'ph'), 'PLACEHOLDER')}
    <div id="fx-spread-row"${fxhg.route === 'third_party' ? ' hidden' : ''}>
      ${ir('inp-fx-spread',  'Spread $/USD (e.g. 0.002)', ni('inp-fx-spread', fxhg.spreadPerUsd || 0.002, 0.001, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    <div id="fx-thirdparty-rows"${fxhg.route !== 'third_party' ? ' hidden' : ''}>
      ${ir('inp-fx-margin', 'Initial margin %', ni('inp-fx-margin', pct2(fxhg.initialMarginPct != null ? fxhg.initialMarginPct : 0.05), 1, 0, 'ph'), 'PLACEHOLDER')}
      ${ir('inp-fx-tenor',  'Tenor (days)',     ni('inp-fx-tenor',  fxhg.tenorDays != null ? fxhg.tenorDays : 30, 1, 0, 'ph'), 'PLACEHOLDER')}
      ${ir('inp-fx-broker', 'Broker fee $',     ni('inp-fx-broker', fxhg.brokerFee != null ? fxhg.brokerFee : 0, 100, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    <p class="defaults-note">Fee and spread are a small <b>fraction of every USD of notional</b> — typically 0.001–0.004 ($1–$4 per $1,000 hedged), not whole dollars. 0.004 on a $19M hedge ≈ $76k cost. Entering whole-dollar figures (e.g. 2.0 = $2 per $1) overstates the cost by ~1000×.</p>
    <p class="defaults-note" id="fx-thirdparty-note"${fxhg.route !== 'third_party' ? ' hidden' : ''}>NDF cost drivers: the bank posts <b>initial margin %</b> of notional (financed at the credit rate over <b>tenor days</b>) plus a flat <b>broker fee</b>. Margin is bank-provided, never partner equity.</p>
    <div id="fx-fee-warn" class="h-unit-warn" hidden></div>
  </div>
</div>
`;

// ── 7. Sidebar assembly ──────────────────────────────────────────────────────
const sidebarHtml = `<aside class="sidebar" id="sidebar">
  <div class="sb-tabs">
    <button class="tab-btn active" data-tab="deal">Deal</button>
    <button class="tab-btn" data-tab="costs">Costs</button>
    <button class="tab-btn" data-tab="hedge">Hedge</button>
  </div>
  <div class="sb-scroll">
    <div class="tab-panel active" id="tab-deal">${tabDeal}</div>
    <div class="tab-panel" id="tab-costs">${tabCosts}</div>
    <div class="tab-panel" id="tab-hedge">${tabHedge}</div>
  </div>
  <div class="sb-footer">
    <div class="sb-footer-row1">
      <button class="btn-new"    onclick="newTrade()"    title="Clear form, start a new trade">New Trade</button>
      <button class="btn-save"   onclick="saveTrade()"   title="Save / update this trade">Save</button>
      <button class="btn-saveas" onclick="saveAsTrade()" title="Save a copy under a new name">Save As…</button>
    </div>
    <div class="sb-state-row">
      <span id="trade-state-badge" class="state-badge state-new">New · unsaved</span>
    </div>
    <div class="sb-footer-row2">
      <select id="sel-saved-trades" class="lib-select" onchange="loadSelectedTrade()"><option value="">Load a saved trade…</option></select>
      <button class="btn-lib"               onclick="loadSelectedTrade(true)" title="Reload the selected trade">↓</button>
      <button class="btn-lib btn-lib-ren"   onclick="renameTrade()"           title="Rename selected trade">✎</button>
      <button class="btn-lib btn-lib-del"   onclick="deleteSelectedTrade()"   title="Delete selected trade">✕</button>
    </div>
  </div>
</aside>`;

// ── 8. Header HTML ───────────────────────────────────────────────────────────
const shortTitle = esc(shortTitleRaw);
// Fixture badge: always present in DOM, visibility driven by _isSample JS state
const fixtureBadgeHtml = `<span id="hdr-fixture-badge" style="display:${isSampleFlag ? 'inline-block' : 'none'};margin-left:10px;padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:rgba(212,29,29,.20);color:#fca5a5;border:1px solid rgba(212,29,29,.35);border-radius:3px;vertical-align:middle">Fixture</span>`;

// ── 9. Assemble CSS ──────────────────────────────────────────────────────────
let sharedCss;
try { sharedCss = css(); }
catch(e) { throw e; }

// ── 10. Full HTML ────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.meta.tradeId)} — TIS Global Trading (Interactive)</title>
<link rel="icon" type="image/svg+xml" href="${faviconDataUri}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
${sharedCss}
</style>
</head>
<body>

<!-- ── App header (always visible) ─────────────────────────────────────── -->
<header class="report-header">
  <div class="header-inner">
    <div class="header-logo" role="img" aria-label="TIS Global Trading">${logo}</div>
    <div class="header-trade">
      <h1 class="trade-name" id="hdr-trade-name">${shortTitle}</h1>
      <p class="trade-id" id="hdr-trade-id">${esc(t.meta.tradeId)}${fixtureBadgeHtml}</p>
    </div>
    <div class="header-kpis" role="region" aria-label="Key metrics">
      <div class="kpi-chip">
        <span class="kpi-label">TIS Net Profit</span>
        <span class="kpi-value" id="kpi-tisnet-val">—</span>
        <span class="kpi-sub"  id="kpi-tisnet-sub">after partner split</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label">Annualised Return</span>
        <span class="kpi-value" id="kpi-annret-val">—</span>
        <span class="kpi-sub"  id="kpi-annret-sub">—</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label" id="kpi-margin-label">Ex-Ship Margin</span>
        <span class="kpi-value" id="kpi-margin-val">—</span>
        <span class="kpi-sub"  id="kpi-margin-sub">—</span>
      </div>
    </div>
  </div>
  <div class="header-meta-strip">
    <div class="header-meta-inner">
      Flow: <b id="hdr-flow">${esc(t.meta.flow || 'equity-partner')}</b><span id="hdr-partner-seg">&nbsp;&middot;&nbsp;Partner: <b id="hdr-partner">${esc((t.parties || {}).partner || '')}</b></span><span id="hdr-supplier-seg">&nbsp;&middot;&nbsp;Supplier: <span id="hdr-supplier">${esc((t.parties || {}).supplier || '')}</span></span><span id="hdr-inspector-seg">&nbsp;&middot;&nbsp;Inspector: <span id="hdr-inspector">${esc((t.parties || {}).inspector || '')}</span></span>
    </div>
  </div>
</header>

<!-- ── Narrow-screen drawer toggle ──────────────────────────────────────── -->
<button class="drawer-btn" id="drawer-btn" onclick="toggleDrawer()">
  ☰ Trade Inputs <span class="drawer-arrow">▼</span>
</button>

<!-- ── App body: sidebar + results ──────────────────────────────────────── -->
<div class="app-body">

  ${sidebarHtml}

  <!-- ── Results ──────────────────────────────────────────────────────── -->
  <main class="results" role="main">
    <div id="rpt-error" class="err-banner" hidden></div>
    <div id="sec-waterfall"></div>
    <div id="sec-ladder"></div>
    <div id="sec-cost"></div>
    <div id="sec-partner"></div>
    <div id="sec-hedge"></div>
    <div id="sec-tax"></div>
    <div id="sec-sens"></div>
  </main>

</div>

<footer class="report-footer" role="contentinfo" style="display:none">
  TIS Global Trading — Interactive Trade Model — ${esc(t.meta.tradeId)} — DUMMY/EXAMPLE data.
</footer>

<!-- ── Engine bundle ────────────────────────────────────────────────────── -->
<script>${engineBundle}</script>

<!-- ── Interactive controller ───────────────────────────────────────────── -->
<script>
(function () {
'use strict';

// ── Initial trade (baseline for reset + modified detection) ────────────────
const INIT = ${JSON.stringify(initialTrade)};
const INIT_IS_SAMPLE = /REGRESSION|FIXTURE|dummy|test|sample/i.test((INIT.meta || {}).tradeName || '');

// ── Shared set-value helpers (used by resetToDefaults, newTrade, loadTrade) ─
function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function sd(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── isSample runtime state (true = show Fixture badge) ─────────────────────
let _isSample = INIT_IS_SAMPLE;

// ── Formatters ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtUsd(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (v < 0 ? '−$' : '$') + abs;
}
function fmtUsdSign(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (v < 0 ? '−$' : '+$') + abs;
}
function fmtPct(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return (v * 100).toFixed(d != null ? d : 2) + '%';
}
function fmtMt(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d??2,maximumFractionDigits:d??2}) + ' MT';
}
function fmtNum(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d??0,maximumFractionDigits:d??0});
}
function badge(s) {
  if (!s || s === 'OK') return '';
  const upper = String(s).toUpperCase();
  if (upper.includes('RECOVERABLE')) return \`<span class="bdg bdg-recoverable" title="\${esc(s)}">&#10003; OK</span>\`;
  if (upper.includes('FIXED')) return '';
  if (upper.includes('CONFIRM') || upper.includes('UNVERIFIED'))
    return \`<span class="bdg bdg-unverified" title="\${esc(s)}">&#9888;&#xFE0E;&nbsp;UNVERIFIED</span>\`;
  return \`<span class="bdg bdg-indicative" title="\${esc(s)}">INDICATIVE</span>\`;
}

// ── DOM helpers ────────────────────────────────────────────────────────────
function gf(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; }
function gi(id) { const el = document.getElementById(id); return el ? parseInt(el.value, 10) : NaN; }
function gs(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function isOn(id) { const el = document.getElementById(id); return el ? el.dataset.on === 'true' : false; }
function show(id, vis) { const el = document.getElementById(id); if (el) el.hidden = !vis; }

// ── Collect trade from inputs ──────────────────────────────────────────────
// ── Per-leg revenue editor ───────────────────────────────────────────────
// Source of truth for the Sale section. Each entry:
//   { channel:'ex-ship'|'depot', unit:'USD_PER_MT'|'NGN_PER_L', qtyMode:'tonnes'|'pct', qty:Number, price:Number|null }
var _legs = [];
var _lastRetainedTonnes = null; // updated after each recompute; drives hedge-vol placeholder

function legBlank() { return { channel:'ex-ship', unit:'USD_PER_MT', qtyMode:'pct', qty:100, price:null }; }
function legUnitLabel(unit) { return unit === 'NGN_PER_L' ? '₦/L' : '$/MT'; }

// Derive editor legs from a legacy-shape trade object (channels + sell.currencyMode + prices).
// Mirrors the engine's legacy adapter so a loaded legacy trade recomputes byte-for-byte identically.
function legsFromLegacyTrade(tr) {
  var legs = [];
  var ch = tr.channels || { exShipPct: 1, depotPct: 0 };
  var exPct = (ch.exShipPct != null ? ch.exShipPct : 1);
  var dePct = (ch.depotPct  != null ? ch.depotPct  : (1 - exPct));
  var sell = tr.sell || {};
  var mode = sell.currencyMode || 'USD';
  var usdShare = (mode === 'USD') ? 1 : (mode === 'NGN') ? 0 : (sell.splitUsdPct != null ? sell.splitUsdPct : 1);
  var exPriceUsd = (sell.exShipPricePerMT && isFinite(sell.exShipPricePerMT.value)) ? sell.exShipPricePerMT.value : null;
  var litres = (tr.pricing && tr.pricing.conversion && tr.pricing.conversion.litresPerMT) || 1183;
  var parPricing = (tr.fx && tr.fx.parallel && isFinite(tr.fx.parallel.value)) ? tr.fx.parallel.value : null;
  if (exPct > 1e-9) {
    var exUsdPct = exPct * usdShare;
    var exNgnPct = exPct * (1 - usdShare);
    if (exUsdPct > 1e-9) {
      legs.push({ channel:'ex-ship', unit:'USD_PER_MT', qtyMode:'pct', qty:+(exUsdPct*100).toFixed(4), price: exPriceUsd });
    }
    if (exNgnPct > 1e-9) {
      var ngnPerL = (exPriceUsd != null && parPricing != null) ? (exPriceUsd * parPricing) / litres : null;
      legs.push({ channel:'ex-ship', unit:'NGN_PER_L', qtyMode:'pct', qty:+(exNgnPct*100).toFixed(4), price: ngnPerL != null ? +ngnPerL.toFixed(4) : null });
    }
  }
  if (dePct > 1e-9) {
    var depPrice = (sell.depotPriceNgnPerL && isFinite(sell.depotPriceNgnPerL.value)) ? sell.depotPriceNgnPerL.value : null;
    legs.push({ channel:'depot', unit:'NGN_PER_L', qtyMode:'pct', qty:+(dePct*100).toFixed(4), price: depPrice });
  }
  if (!legs.length) legs.push(legBlank());
  return legs;
}

// Derive editor legs from any trade object: native revenueLegs win; else the legacy adapter.
function legsFromTrade(tr) {
  if (tr && Array.isArray(tr.revenueLegs) && tr.revenueLegs.length) {
    return tr.revenueLegs.map(function(l) {
      var hasTonnes = (l.tonnes != null);
      return {
        channel: l.channel || 'ex-ship',
        unit: l.pricingUnit || 'USD_PER_MT',
        qtyMode: hasTonnes ? 'tonnes' : 'pct',
        qty: hasTonnes ? l.tonnes : (l.share != null ? +(l.share*100).toFixed(4) : 0),
        price: (l.price != null && isFinite(l.price)) ? l.price : null,
      };
    });
  }
  return legsFromLegacyTrade(tr || {});
}

// Reconstruct legs from a saved input snapshot. New snapshots carry _legs JSON; older
// (pre per-leg) snapshots are rebuilt from their legacy ex-ship/depot/currency fields.
function legsFromSnapshot(snap) {
  if (snap && snap['_legs']) { try { return JSON.parse(snap['_legs']); } catch(_) {} }
  var exPct  = (snap['inp-exship-pct'] != null && snap['inp-exship-pct'] !== '') ? parseFloat(snap['inp-exship-pct'])/100 : 1;
  var exPrice= (snap['inp-exship-price'] != null && snap['inp-exship-price'] !== '') ? parseFloat(snap['inp-exship-price']) : null;
  var depPrice=(snap['inp-depot-price'] != null && snap['inp-depot-price'] !== '') ? parseFloat(snap['inp-depot-price']) : null;
  var fakeTrade = {
    channels: { exShipPct: exPct, depotPct: Math.round((1-exPct)*1e10)/1e10 },
    sell: {
      currencyMode: snap['inp-currency-mode'] || 'USD',
      splitUsdPct: (snap['inp-split-usd'] != null && snap['inp-split-usd'] !== '') ? parseFloat(snap['inp-split-usd'])/100 : 1,
      exShipPricePerMT: { value: exPrice },
      depotPriceNgnPerL: depPrice != null ? { value: depPrice } : null,
    },
    fx: { parallel: { value: (snap['inp-fxpar'] != null ? parseFloat(snap['inp-fxpar']) : null) } },
    pricing: { conversion: { litresPerMT: (snap['inp-litres-per-mt'] != null ? parseFloat(snap['inp-litres-per-mt']) : 1183) } },
  };
  return legsFromLegacyTrade(fakeTrade);
}

function legRowHtml(leg, i) {
  var depot = leg.channel === 'depot';
  var chanOpts =
    '<option value="ex-ship"' + (depot ? '' : ' selected') + '>Ex-ship</option>' +
    '<option value="depot"'   + (depot ? ' selected' : '') + '>Depot</option>';
  var unitOpts =
    '<option value="USD_PER_MT"' + (leg.unit==='USD_PER_MT' ? ' selected':'') + (depot ? ' disabled':'') + '>USD $/MT</option>' +
    '<option value="NGN_PER_L"'  + (leg.unit==='NGN_PER_L'  ? ' selected':'') + '>Naira ₦/L</option>';
  var qtyModeOpts =
    '<option value="tonnes"' + (leg.qtyMode==='tonnes' ? ' selected':'') + '>MT</option>' +
    '<option value="pct"'    + (leg.qtyMode==='pct'    ? ' selected':'') + '>%</option>';
  var qtyVal   = isFinite(leg.qty) ? leg.qty : '';
  var priced   = (leg.price != null && isFinite(leg.price) && leg.price > 0);
  var priceVal = priced ? leg.price : '';
  var priceFlag = priced ? '' : ' <span class="leg-price-flag">· pending</span>';
  return '<div class="leg-row" data-idx="' + i + '">' +
    '<button type="button" class="leg-del" data-act="del" data-idx="' + i + '" title="Remove leg" aria-label="Remove leg">×</button>' +
    '<div class="leg-field"><span class="leg-field-lbl">Channel</span>' +
      '<select class="leg-in" data-field="channel" data-idx="' + i + '">' + chanOpts + '</select></div>' +
    '<div class="leg-field"><span class="leg-field-lbl">Pricing unit</span>' +
      '<select class="leg-in" data-field="unit" data-idx="' + i + '"' + (depot ? ' disabled' : '') + '>' + unitOpts + '</select></div>' +
    '<div class="leg-field full"><span class="leg-field-lbl">Quantity</span>' +
      '<div class="leg-qty-group">' +
        '<input class="leg-in" type="number" step="any" min="0" data-field="qty" data-idx="' + i + '" value="' + qtyVal + '">' +
        '<select class="leg-in" data-field="qtyMode" data-idx="' + i + '">' + qtyModeOpts + '</select>' +
      '</div></div>' +
    '<div class="leg-field full"><span class="leg-field-lbl">Price (' + legUnitLabel(leg.unit) + ')' + priceFlag + '</span>' +
      '<input class="leg-in' + (priced ? '' : ' leg-in-pending') + '" type="number" step="any" min="0" data-field="price" data-idx="' + i + '" value="' + priceVal + '" placeholder="optional">' +
      '<span id="leg-ngn-equiv-' + i + '" class="leg-ngn-equiv"></span></div>' +
    '</div>';
}

function updateLegNgnEquiv() {
  // RULE 1 (2026-06-23): naira<->USD conversion is at NAFEM, so the ₦/L-equiv hint uses the NAFEM rate.
  var nafemEl = document.getElementById('inp-fxnafem');
  var litEl = document.getElementById('inp-litres-per-mt');
  var nafemRate = nafemEl ? parseFloat(nafemEl.value) : NaN;
  var litresPerMT = (litEl && isFinite(parseFloat(litEl.value)) && parseFloat(litEl.value) > 0)
    ? parseFloat(litEl.value) : 1183;
  var canCompute = isFinite(nafemRate) && nafemRate > 0 && isFinite(litresPerMT) && litresPerMT > 0;
  for (var i = 0; i < _legs.length; i++) {
    var leg = _legs[i];
    var el = document.getElementById('leg-ngn-equiv-' + i);
    if (!el) continue;
    if (!canCompute || leg.unit !== 'USD_PER_MT' || leg.price == null || !isFinite(leg.price) || leg.price <= 0) {
      el.textContent = '';
    } else {
      var ngnPerL = (leg.price * nafemRate) / litresPerMT;
      el.textContent = '· ₦' + Math.round(ngnPerL).toLocaleString('en-US') + '/L equiv';
    }
  }
}

function renderLegEditor() {
  var box = document.getElementById('leg-editor');
  if (!box) return;
  if (!_legs.length) _legs = [legBlank()];
  var html = '';
  for (var i = 0; i < _legs.length; i++) html += legRowHtml(_legs[i], i);
  box.innerHTML = html;
  updateLegTotal();
  updateLegNgnEquiv();
}

function legTonnesResolved(leg, delivered) {
  if (!isFinite(leg.qty)) return 0;
  return leg.qtyMode === 'pct' ? (leg.qty/100) * delivered : leg.qty;
}

function updateLegTotal() {
  var el = document.getElementById('leg-total');
  if (!el) return;
  var dEl = document.getElementById('inp-delivered');
  var delivered = dEl ? parseFloat(dEl.value) : NaN;
  var base = (isFinite(delivered) && delivered > 0) ? delivered : 0;
  var sum = 0;
  for (var i = 0; i < _legs.length; i++) sum += legTonnesResolved(_legs[i], base);
  var sumStr = sum.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (!isFinite(delivered) || delivered <= 0) {
    el.className = 'leg-total';
    el.innerHTML = !isFinite(delivered)
      ? 'Σ legs: <b>—</b>'
      : 'Σ legs: <b>' + sumStr + ' MT</b>';
    return;
  }
  var delivStr = delivered.toLocaleString('en-US', { maximumFractionDigits: 2 });
  var diff = sum - delivered;
  var ok = Math.abs(diff) <= 1e-6 * Math.max(1, delivered);
  el.className = 'leg-total ' + (ok ? 'ok' : 'bad');
  var flag = ok
    ? '<span class="leg-total-flag">✓ matches delivered</span>'
    : '<span class="leg-total-flag">⚠ ' + (diff > 0 ? 'over' : 'under') + ' by ' + Math.abs(diff).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' MT</span>';
  el.innerHTML = 'Σ legs: <b>' + sumStr + ' MT</b> / delivered <b>' + delivStr + ' MT</b><br>' + flag;
}

function onLegFieldChange(i, field, value) {
  var leg = _legs[i];
  if (!leg) return false;
  var rerender = false;
  if (field === 'channel') {
    leg.channel = value;
    if (value === 'depot' && leg.unit !== 'NGN_PER_L') leg.unit = 'NGN_PER_L'; // depot forces ₦/L
    rerender = true;
  } else if (field === 'unit') {
    leg.unit = value;
    rerender = true; // price label/placeholder depends on unit
  } else if (field === 'qtyMode') {
    leg.qtyMode = value;
  } else if (field === 'qty') {
    leg.qty = (value === '' ? NaN : parseFloat(value));
  } else if (field === 'price') {
    leg.price = (value === '' ? null : parseFloat(value));
    // Live-toggle the amber "pending" cue without re-rendering (preserve input focus).
    var rowEl = document.querySelector('.leg-row[data-idx="' + i + '"]');
    var inp = rowEl ? rowEl.querySelector('input[data-field="price"]') : null;
    var pend = !(leg.price != null && isFinite(leg.price) && leg.price > 0);
    if (inp) {
      inp.classList.toggle('leg-in-pending', pend);
      var lbl = inp.parentNode ? inp.parentNode.querySelector('.leg-field-lbl') : null;
      if (lbl) {
        var flag = lbl.querySelector('.leg-price-flag');
        if (pend && !flag) { var sp = document.createElement('span'); sp.className = 'leg-price-flag'; sp.textContent = ' · pending'; lbl.appendChild(sp); }
        else if (!pend && flag) { flag.remove(); }
      }
    }
  }
  if (rerender) renderLegEditor(); else updateLegTotal();
  return rerender;
}

function legInputChanged() {
  if (_isSample) { _isSample = false; }
  setModified(true);
  updateDepotVisibility();   // a depot leg activates the storage section
  updateHeader();
  recompute();
}

function addLeg() {
  _legs.push(legBlank());
  renderLegEditor();
  legInputChanged();
}

function removeLeg(i) {
  if (_legs.length <= 1) _legs = [legBlank()];
  else _legs.splice(i, 1);
  renderLegEditor();
  legInputChanged();
}

function wireLegEditor() {
  var box = document.getElementById('leg-editor');
  if (box) {
    var handler = function(e) {
      var tEl = e.target;
      if (!tEl || !tEl.dataset || tEl.dataset.field == null) return;
      onLegFieldChange(+tEl.dataset.idx, tEl.dataset.field, tEl.value);
      legInputChanged();
    };
    box.addEventListener('input', handler);
    box.addEventListener('change', handler);
    box.addEventListener('click', function(e) {
      var tEl = e.target;
      if (tEl && tEl.dataset && tEl.dataset.act === 'del') removeLeg(+tEl.dataset.idx);
    });
  }
  var addBtn = document.getElementById('btn-add-leg');
  if (addBtn) addBtn.addEventListener('click', addLeg);
}

// Build the engine revenueLegs array from the editor. Blank price → null (price-independent run).
function collectLegs() {
  return _legs.map(function(leg) {
    var out = { channel: leg.channel, pricingUnit: leg.unit };
    if (leg.qtyMode === 'pct') out.share = (isFinite(leg.qty) ? leg.qty/100 : NaN);
    else out.tonnes = leg.qty;
    out.price = (leg.price != null && isFinite(leg.price)) ? leg.price : null;
    return out;
  });
}

function collectTrade() {
  const bondPct     = gf('inp-bond')   / 100;
  const equityPct   = gf('inp-equity') / 100;
  const lcPct       = Math.round((1 - bondPct - equityPct) * 1e10) / 1e10;
  // Sale revenue is a PER-LEG model now. Channels + currency are DERIVED from the legs.
  const revenueLegs = collectLegs();
  const deliveredQ  = gf('inp-delivered');
  let _exT = 0, _deT = 0;
  for (const l of revenueLegs) {
    const tn = (l.tonnes != null ? l.tonnes : (isFinite(l.share) ? l.share * deliveredQ : 0));
    if (l.channel === 'depot') _deT += tn; else _exT += tn;
  }
  const _totT       = _exT + _deT;
  const exShipPct   = _totT > 0 ? _exT / _totT : 1;
  const depotPct    = _totT > 0 ? _deT / _totT : 0;
  const depotOn     = revenueLegs.some(l => l.channel === 'depot');
  const needLitres  = revenueLegs.some(l => l.pricingUnit === 'NGN_PER_L');
  const iceHedgeOn  = isOn('tog-ice-hedge');
  const fxHedgeOn   = isOn('tog-fx-hedge');
  const surOn       = isOn('tog-surcharge');
  const eqProvider  = gs('sel-equity-provider') || 'partner';

  // Hedge params
  const iceRoute      = gs('sel-ice-route')   || 'bank_book';
  const fxRoute       = gs('sel-fx-route')    || 'bank_book';
  const iceFixedRaw   = gf('inp-ice-fixed');
  const iceFixed      = (isNaN(iceFixedRaw) || iceFixedRaw <= 0) ? null : iceFixedRaw;
  const fxFwdRaw      = gf('inp-fx-forward');
  const fxFwd         = (isNaN(fxFwdRaw) || fxFwdRaw <= 0) ? null : fxFwdRaw;
  const iceVolRaw     = gf('inp-ice-hedged-vol');
  const iceVol        = (isNaN(iceVolRaw) || iceVolRaw <= 0) ? null : iceVolRaw;
  // Final/settlement ICE: blank (or non-positive) => null => engine defaults to live ICE.
  const iceFinalRaw   = gf('inp-ice-final');
  const iceFinal      = (isNaN(iceFinalRaw) || iceFinalRaw <= 0) ? null : iceFinalRaw;

  // sell kept for back-compat shape only; the engine prices from revenueLegs (native path).
  const sell = { ...INIT.sell };

  return {
    ...INIT,
    revenueLegs,
    market: {
      ice:        { ...INIT.market.ice,        value: gf('inp-ice'), final: iceFinal },
      fobPremium: { ...INIT.market.fobPremium, value: gf('inp-fob') },
    },
    cargo:    { ...INIT.cargo, deliveredQtyMT: gf('inp-delivered') },
    freight:  { ...INIT.freight, tcRatePerDay: gf('inp-tc-rate'), charterDays: gi('inp-charter'), demurrageDays: gi('inp-demurrage') },
    financing: {
      ...INIT.financing,
      creditRate:       gf('inp-credit-rate') / 100,
      lcFeePct:         gf('inp-lc-fee') / 100,
      financingDays:    gi('inp-fin-days'),
      capitalLockupDays:gi('inp-lockup'),
      lcPctOfCargo:     lcPct,
      wcSublimit:       gf('inp-wc-sublimit'),
    },
    sell,
    fx: {
      parallel: { ...INIT.fx.parallel, value: gf('inp-fxpar'),   override: null },
      nafem:    { ...INIT.fx.nafem,    value: gf('inp-fxnafem'), override: null },
    },
    channels: { exShipPct, depotPct },
    partner: {
      ...INIT.partner,
      equityProvider:     eqProvider,
      bondPct, equityPct,
      totalFundingPct:    bondPct + equityPct,
      profitSharePct:     gf('inp-profit-split') / 100,
      productAllocationPct: gf('inp-product-alloc') / 100,
    },
    tax: {
      ...INIT.tax,
      vatRate:                   gf('inp-vat-rate') / 100,
      whtFreightRate:            gf('inp-wht-rate') / 100,
      taxableSupplyProportion:   gf('inp-taxable-prop'),
      surcharge: { ...INIT.tax.surcharge, enabled: surOn, incidence: gs('sel-surcharge-inc') || 'cost' },
    },
    hedge: {
      ...INIT.hedge,
      iceHedged:       iceHedgeOn,
      route:           iceRoute,
      fixedPrice:      iceFixed,
      feePerMT:        gf('inp-ice-fee'),
      bankSpreadPerMT: gf('inp-ice-spread'),
      initialMarginPct:gf('inp-ice-margin') / 100,
      hedgedVolumeMT:  iceVol,
    },
    fxHedge: {
      ...INIT.fxHedge,
      fxHedged:    fxHedgeOn,
      route:       fxRoute,
      forwardRate: fxFwd,
      hedgeRatio:  gf('inp-fx-ratio') / 100,
      feePerUsd:   gf('inp-fx-fee'),
      spreadPerUsd:gf('inp-fx-spread'),
      initialMarginPct: gf('inp-fx-margin') / 100,
      tenorDays:        gi('inp-fx-tenor'),
      brokerFee:        gf('inp-fx-broker'),
    },
    pricing: {
      ...INIT.pricing,
      conversion: {
        ...INIT.pricing.conversion,
        litresPerMT: (needLitres && isFinite(gf('inp-litres-per-mt')) && gf('inp-litres-per-mt') > 0)
          ? gf('inp-litres-per-mt') : (INIT.pricing.conversion.litresPerMT || 1183),
      },
    },
    depot: { enabled: depotOn },
    costLines: {
      npaCargoDuesPerMT:    gf('inp-npa-per-mt'),
      portDAs:              gf('inp-port-das'),
      nimasaCabotagePct:    gf('inp-nimasa-cab')     / 100,
      nimasaFreightLevyPct: gf('inp-nimasa-freight') / 100,
      spomoCvffPct:         gf('inp-spomo')          / 100,
      ncsDocs:              gf('inp-ncs-docs'),
      marineIccPct:         gf('inp-marine-icc')     / 100,
      sgsInspection:        gf('inp-sgs'),
      portAgency:           gf('inp-port-agency'),
      allocSecurityPct:     gf('inp-alloc-security') / 100,
      bankCharges:          gf('inp-bank-charges'),
      overhead:             gf('inp-overhead'),
      contingency:          gf('inp-contingency'),
      collateralManager:    gf('inp-collateral-mgr'),
      throughputNgnPerMT:   depotOn ? gf('inp-throughput')      : 0,
      storageRentalNgn:     depotOn ? gf('inp-storage-rental')  : 0,
      evaporationPct:       gf('inp-evaporation')    / 100,
      tankInsurancePct:     gf('inp-tank-insurance') / 100,
    },
  };
}

// ── Visibility updates ────────────────────────────────────────────────────
function updateLcDisplay() {
  const b = gf('inp-bond') / 100, e = gf('inp-equity') / 100;
  const lc = Math.round((1 - b - e) * 10000) / 100;
  const el = document.getElementById('lc-display');
  if (el) { el.textContent = lc.toFixed(2) + '%'; el.style.color = lc < 0 ? 'var(--red)' : ''; }
}

function updateDepotVisibility() {
  const hasDepot = _legs.some(l => l.channel === 'depot');
  show('storage-sec', hasDepot);
  show('storage-off-note', !hasDepot);
}

function updateCurrencyVisibility() {
  // Currency mode is derived from the revenue legs — no UI row to toggle.
}

function updateSurchargeVisibility() {
  const on = isOn('tog-surcharge');
  show('sur-inc-row', on);
  show('sur-off-note', !on);
}

function updateHedgeTab() {
  const iceOn = isOn('tog-ice-hedge');
  const fxOn  = isOn('tog-fx-hedge');
  show('ice-on-warn', iceOn);  show('ice-off-note', !iceOn);
  show('fx-on-warn',  fxOn);   show('fx-off-note',  !fxOn);
  const iceP = document.getElementById('ice-params');
  const fxP  = document.getElementById('fx-params');
  if (iceP) iceP.classList.toggle('hedge-off', !iceOn);
  if (fxP)  fxP.classList.toggle('hedge-off',  !fxOn);
}

function updateIceRouteVisibility() {
  const r = gs('sel-ice-route');
  show('ice-spread-row', r !== 'third_party');
  show('ice-margin-row', r === 'third_party');
}

function updateFxRouteVisibility() {
  const r = gs('sel-fx-route');
  // Bank forward → spread only; Third-party NDF → margin/tenor/broker only.
  show('fx-spread-row',       r !== 'third_party');
  show('fx-thirdparty-rows',  r === 'third_party');
  show('fx-thirdparty-note',  r === 'third_party');
}

// ── Modified state ─────────────────────────────────────────────────────────
let _modified = false;
let _currentTradeName = null;   // null = new/unsaved; string = loaded/saved trade key

function updateStateBadge() {
  const el = document.getElementById('trade-state-badge');
  if (!el) return;
  if (_currentTradeName === null) {
    el.textContent = 'New · unsaved';
    el.className = 'state-badge state-new';
  } else if (_modified) {
    el.textContent = _currentTradeName + ' · modified';
    el.className = 'state-badge state-modified';
  } else {
    el.textContent = _currentTradeName + ' · saved';
    el.className = 'state-badge state-saved';
  }
}

function setModified(v) {
  _modified = v;
  updateStateBadge();
}

// ── Reset to defaults ──────────────────────────────────────────────────────
function resetToDefaults() {
  const I = INIT;
  const f = I.financing, p = I.partner, cl = I.costLines, h = I.hedge, fxh = I.fxHedge || {};
  const sur = I.tax.surcharge || {};

  sv('inp-ice',            I.market.ice.value);
  sv('inp-ice-final',      I.market.ice.final != null ? I.market.ice.final : '');
  sv('inp-fob',            I.market.fobPremium.value);
  sv('inp-fxpar',          I.fx.parallel.value);
  sv('inp-delivered',      I.cargo.deliveredQtyMT);
  _legs = legsFromTrade(I);
  renderLegEditor();
  sv('inp-profit-split',   +(p.profitSharePct * 100).toFixed(1));
  sv('inp-fxnafem',        I.fx.nafem.value);
  sv('inp-taxable-prop',   I.tax.taxableSupplyProportion);
  sv('inp-tc-rate',        I.freight.tcRatePerDay);
  sv('inp-charter',        I.freight.charterDays);
  sv('inp-demurrage',      I.freight.demurrageDays);
  sv('inp-credit-rate',    +(f.creditRate * 100).toFixed(2));
  sv('inp-lc-fee',         +(f.lcFeePct * 100).toFixed(3));
  sv('inp-fin-days',       f.financingDays);
  sv('inp-lockup',         f.capitalLockupDays);
  sv('inp-wc-sublimit',    f.wcSublimit);
  sd('sel-equity-provider',p.equityProvider || 'partner');
  sv('inp-bond',           +(p.bondPct * 100).toFixed(2));
  sv('inp-equity',         +(p.equityPct * 100).toFixed(2));
  sv('inp-product-alloc',  +((p.productAllocationPct ?? 1) * 100).toFixed(1));
  sd('sel-surcharge-inc',  sur.incidence || 'cost');
  sv('inp-vat-rate',       +(I.tax.vatRate * 100).toFixed(2));
  sv('inp-wht-rate',       +((I.tax.whtFreightRate || 0.05) * 100).toFixed(2));
  // Costs
  sv('inp-npa-per-mt',     cl.npaCargoDuesPerMT);
  sv('inp-port-das',       cl.portDAs);
  sv('inp-ncs-docs',       cl.ncsDocs);
  sv('inp-nimasa-cab',     +(cl.nimasaCabotagePct * 100).toFixed(2));
  sv('inp-nimasa-freight', +(cl.nimasaFreightLevyPct * 100).toFixed(2));
  sv('inp-spomo',          +(cl.spomoCvffPct * 100).toFixed(2));
  sv('inp-marine-icc',     +(cl.marineIccPct * 100).toFixed(4));
  sv('inp-sgs',            cl.sgsInspection);
  sv('inp-port-agency',    cl.portAgency);
  sv('inp-alloc-security', +(cl.allocSecurityPct * 100).toFixed(4));
  sv('inp-bank-charges',   cl.bankCharges);
  sv('inp-overhead',       cl.overhead);
  sv('inp-contingency',    cl.contingency);
  sv('inp-collateral-mgr', cl.collateralManager);
  sv('inp-throughput',     cl.throughputNgnPerMT || cl.throughput || 0);
  sv('inp-storage-rental', cl.storageRentalNgn || cl.storageRental || 0);
  sv('inp-evaporation',    +(cl.evaporationPct * 100).toFixed(4));
  sv('inp-tank-insurance', +(cl.tankInsurancePct * 100).toFixed(4));
  sv('inp-litres-per-mt',  I.pricing.conversion.litresPerMT);
  // Hedge
  sd('sel-ice-route',      h.route || 'bank_book');
  sv('inp-ice-fixed',      h.fixedPrice != null ? h.fixedPrice : '');
  sv('inp-ice-fee',        h.feePerMT || 1.5);
  sv('inp-ice-spread',     h.bankSpreadPerMT || 0.5);
  sv('inp-ice-margin',     +((h.initialMarginPct || 0.10) * 100).toFixed(1));
  sv('inp-ice-hedged-vol', h.hedgedVolumeMT != null ? h.hedgedVolumeMT : '');
  sd('sel-fx-route',       fxh.route || 'bank_book');
  sv('inp-fx-forward',     fxh.forwardRate != null ? fxh.forwardRate : '');
  sv('inp-fx-ratio',       +((fxh.hedgeRatio != null ? fxh.hedgeRatio : 1) * 100).toFixed(1));
  sv('inp-fx-fee',         fxh.feePerUsd || 0.004);
  sv('inp-fx-spread',      fxh.spreadPerUsd || 0.002);
  sv('inp-fx-margin',      +((fxh.initialMarginPct != null ? fxh.initialMarginPct : 0.05) * 100).toFixed(1));
  sv('inp-fx-tenor',       fxh.tenorDays != null ? fxh.tenorDays : 30);
  sv('inp-fx-broker',      fxh.brokerFee != null ? fxh.brokerFee : 0);
  // Toggles
  activateToggle(document.getElementById('tog-ice-hedge'), !!h.iceHedged);
  activateToggle(document.getElementById('tog-fx-hedge'),  !!fxh.fxHedged);
  activateToggle(document.getElementById('tog-surcharge'), !!(sur.enabled));
  // Identity
  sv('inp-trade-name',    (I.meta.tradeName||'').replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi,'').trim());
  sv('inp-partner-name',  (I.parties||{}).partner   || '');
  sv('inp-supplier-name', (I.parties||{}).supplier  || '');
  sv('inp-inspector-name',(I.parties||{}).inspector || '');
  _isSample = INIT_IS_SAMPLE;
  _currentTradeName = null;
  const selRTD = document.getElementById('sel-saved-trades');
  if (selRTD) selRTD.value = '';
  // UI state
  updateLcDisplay();
  updateDepotVisibility();
  updateCurrencyVisibility();
  updateSurchargeVisibility();
  updateHedgeTab();
  updateIceRouteVisibility();
  updateFxRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
}

// ── Render helpers ─────────────────────────────────────────────────────────
function infoRow(label, value, extra) {
  return \`<div class="info-row"><span>\${esc(label)}</span><b>\${value ?? '—'}</b>\${extra ? \` \${extra}\` : ''}</div>\`;
}

// Calm pending card shown in the waterfall slot before a sell price is entered.
// Per-leg pricing status: how many legs have a price, and which ones don't.
function legPricingStatus(trade) {
  var legs = (trade && trade.revenueLegs) || [];
  var unpriced = [];
  for (var i = 0; i < legs.length; i++) {
    var l = legs[i];
    if (!(isFinite(l.price) && l.price > 0)) {
      unpriced.push((unpriced.length + 1) + '. ' + l.channel + (l.pricingUnit === 'NGN_PER_L' ? ' ₦/L' : ' $/MT'));
    }
  }
  return { total: legs.length, priced: legs.length - unpriced.length, unpriced: unpriced };
}

function renderPricePending(status) {
  var s = status || { total: 0, priced: 0, unpriced: [] };
  var headline = s.total > 0 ? (s.priced + ' of ' + s.total + ' legs priced') : 'Add a revenue leg';
  var awaiting = s.unpriced.length ? ' Awaiting a price for: ' + esc(s.unpriced.join('  ·  ')) + '.' : '';
  return \`<section class="section" aria-labelledby="wf-h">
  <h2 class="section-heading" id="wf-h">Profit Waterfall</h2>
  <div class="card">
    <div class="empty-state" style="padding:36px 24px">
      <p class="empty-state-title">P&amp;L pending — \${esc(headline)}</p>
      <p class="empty-state-sub">The cost build-up and pricing ladder below are ready. Enter a price for every revenue leg to compute TIS Net Profit, ex-ship margin, partner split and sensitivities.\${awaiting}</p>
    </div>
  </div>
</section>\`;
}

// ── KPI chips ──────────────────────────────────────────────────────────────
function renderKPIs(res, hasSellPrice) {
  const kv = document.getElementById('kpi-tisnet-val');
  const ks = document.getElementById('kpi-tisnet-sub');
  const av  = document.getElementById('kpi-annret-val');
  const as_ = document.getElementById('kpi-annret-sub');
  const mv = document.getElementById('kpi-margin-val');
  const ms = document.getElementById('kpi-margin-sub');
  const ml = document.getElementById('kpi-margin-label');
  // The margin KPI tracks whichever channel the trade actually sells through: ex-ship $/MT margin
  // when an ex-ship leg is priced, else depot ₦/L margin on a depot trade. Avoids a dead "Ex-Ship
  // Margin ——" slot on depot-only trades.
  const depotActiveKpi = !!(res && res.channels && res.channels.depotPct > 0);

  // Colour the TIS Net chip by sign: green only for a positive net; deep-red for a genuine
  // loss; neutral when pending (no value). Green is never used for a real negative (Batch C).
  const netChip = kv ? kv.closest('.kpi-chip') : null;
  function setNetChip(state) {
    if (!netChip) return;
    netChip.classList.toggle('kpi-accent', state === 'pos');
    netChip.classList.toggle('kpi-loss',   state === 'loss');
  }

  // P&L KPIs are pending until every leg has a price — show calm placeholders, no fake numbers.
  if (hasSellPrice === false) {
    setNetChip('neutral');
    if (kv) kv.textContent = '—';
    if (ks) ks.textContent = 'enter leg prices for P&L';
    if (av) av.textContent = '—';
    if (as_) as_.textContent = 'enter leg prices';
    if (ml) ml.textContent = depotActiveKpi ? 'Depot Margin' : 'Ex-Ship Margin';
    if (mv) mv.textContent = '—';
    if (ms) ms.textContent = 'enter leg prices';
    return;
  }

  const p   = res.profit;
  const tisNet = p.tisNetProfit;
  setNetChip(tisNet < 0 ? 'loss' : 'pos');
  if (kv) { kv.textContent = fmtUsd(tisNet); kv.classList.add('kpi-flash'); setTimeout(() => kv.classList.remove('kpi-flash'), 350); }
  if (ks) ks.textContent = res.equityProvider === 'TIS' ? 'self-funded (no partner)' : 'after partner split';

  const ann = res.tisAnnualisedReturn;
  if (av) av.textContent = ann != null ? fmtPct(ann) : '—';
  if (as_) as_.textContent = \`on \${res.annualReturnBaseLabel||'bank LC mobilised'} · \${res.financing.capitalLockupDays}d lockup\`;

  const landed = res.price.exShipLandedPerMT;
  const price  = res.price.exShipPricePerMT;
  const exMargin = (price && landed) ? (price - landed) / price : null;
  if (exMargin != null) {
    // Ex-ship leg priced — show ex-ship margin (unchanged behaviour for ex-ship/split trades).
    if (ml) ml.textContent = 'Ex-Ship Margin';
    if (mv) mv.textContent = fmtPct(exMargin);
    if (ms) ms.textContent = fmtUsd(price) + '/MT sell';
  } else if (depotActiveKpi
      && isFinite(res.price.depotPriceUSDperMT) && res.price.depotPriceUSDperMT > 0
      && isFinite(res.price.depotLandedPerMT)) {
    // Depot-only (or no ex-ship price) — show the depot margin instead of a dead slot.
    const dp_ = res.price.depotPriceUSDperMT;
    const dMargin = (dp_ - res.price.depotLandedPerMT) / dp_;
    if (ml) ml.textContent = 'Depot Margin';
    if (mv) mv.textContent = fmtPct(dMargin);
    if (ms) ms.textContent = isFinite(res.price.depotPriceNgnPerL)
      ? fmtNum(res.price.depotPriceNgnPerL, 0) + ' ₦/L sell'
      : fmtUsd(dp_) + '/MT sell';
  } else {
    if (ml) ml.textContent = depotActiveKpi ? 'Depot Margin' : 'Ex-Ship Margin';
    if (mv) mv.textContent = '—';
    if (ms) ms.textContent = '—';
  }
}

// ── 1. Profit Waterfall ────────────────────────────────────────────────────
function renderWaterfall(res) {
  const p   = res.profit;
  const ep  = res.equityProvider;
  const qty = res.quantities;
  const rec = p.reconciliation;
  const okMark = rec.ok
    ? \`<span class="bdg bdg-recoverable">&#10003; OK</span>\`
    : \`<span class="bdg bdg-confirm">MISMATCH</span>\`;

  function box(cls, label, prefix, amount, sub) {
    return \`<div class="wf-box \${cls}">
      <div class="wf-box-label">\${label}</div>
      <div class="wf-box-amount">\${prefix}\${fmtUsd(amount)}</div>
      <div class="wf-box-sub">\${sub}</div>
    </div>\`;
  }

  let wfBoxes;
  if (ep === 'TIS') {
    wfBoxes = \`
      \${box('wf-standalone','REVENUE','',   res.revenue.combinedUSD,  'Combined channels')}
      <div class="wf-arrow">›</div>
      \${box('wf-deduct',    'ALL-IN COST','−',res.cost.allInCost,     'Incl. irrecoverable VAT')}
      <div class="wf-arrow">›</div>
      \${box(p.tisNetProfit < 0 ? 'wf-net wf-loss' : 'wf-net', 'TIS NET PROFIT','=', p.tisNetProfit,     'Self-funded — no partner')}
    \`;
  } else {
    wfBoxes = \`
      \${box('wf-standalone','STANDALONE PROFIT','',  p.standaloneProfit, 'TIS as 100% owner')}
      <div class="wf-arrow">›</div>
      \${box('wf-deduct',    'MARGIN FOREGONE','−',   p.marginForegone,   fmtMt(qty.economic.partnerTonnes,2)+' partner tonnes')}
      <div class="wf-arrow">›</div>
      \${box('wf-adjusted',  'ADJUSTED PROFIT','=',   p.adjustedProfit,   'TIS retained tonnes share')}
      <div class="wf-arrow">›</div>
      \${box('wf-share',     'PARTNER CASH SHARE','−',p.partnerCashProfitShare, fmtPct(p.profitSharePct)+' of adjusted')}
      <div class="wf-arrow">›</div>
      \${box(p.tisNetProfit < 0 ? 'wf-net wf-loss' : 'wf-net', 'TIS NET PROFIT','=',    p.tisNetProfit,     fmtPct(1-p.profitSharePct)+' of adjusted')}
    \`;
  }

  const hedgeNote = (res.hedges.iceHedgeNetImpact !== 0 || res.hedges.fxHedgeNetImpact !== 0)
    ? \`ICE hedge impact: <b>\${fmtUsdSign(res.hedges.iceHedgeNetImpact)}</b> &nbsp;·&nbsp; FX hedge: <b>\${fmtUsdSign(res.hedges.fxHedgeNetImpact)}</b> &nbsp;·&nbsp;\`
    : '';

  const reconcile = ep === 'TIS'
    ? \`Revenue − cost = TIS net: <b>\${fmtUsd(res.revenue.combinedUSD)} − \${fmtUsd(res.cost.allInCost)} = \${fmtUsd(p.tisNetProfit)}</b>\`
    : \`Reconciliation: marginForegone + adjusted = standalone <b>\${fmtUsd(p.marginForegone)} + \${fmtUsd(p.adjustedProfit)} = \${fmtUsd(p.standaloneProfit)}</b> \${okMark}\`;

  return \`<section class="section" aria-labelledby="wf-h">
  <h2 class="section-heading" id="wf-h">Profit Waterfall</h2>
  <div class="card">
    <div class="wf-row">\${wfBoxes}</div>
    <div class="wf-reconcile">
      \${hedgeNote}
      \${reconcile}
      &nbsp;·&nbsp; Annualised return: <b>\${fmtPct(res.tisAnnualisedReturn)}</b> on \${esc(res.annualReturnBaseLabel||'bank LC mobilised')} · \${res.financing.capitalLockupDays}d lockup
    </div>
    <div class="card-footer">
      Unit FOB: <b>\${fmtUsd(res.unitFob)}/MT</b> &nbsp;·&nbsp;
      Ex-ship landed: <b>\${fmtUsd(res.price.exShipLandedPerMT)}/MT</b> &nbsp;·&nbsp;
      Equity stack: <b>\${fmtPct(res.financing.pct.bondPct,1)} bond + \${fmtPct(res.financing.pct.equityPct,1)} equity + \${fmtPct(res.financing.pct.lcPct,1)} LC</b>
    </div>
  </div>
</section>\`;
}

// ── 2. Pricing Ladder ──────────────────────────────────────────────────────
// Surfaces the engine's ladders, each in its NATIVE unit: an ex-ship $/MT ladder
// (margin-of-sell tiers) and a depot ₦/L ladder (absolute-spread tiers), plus the
// engine's cross-leg comparison. Show only the ladders relevant to the trade's legs.
function renderLadder(trade, res, ladder) {
  if (!ladder) return '';
  const legs = (trade && trade.revenueLegs) || [];
  const hasExShip = legs.some(l => l.channel === 'ex-ship');
  const depotApplicable = !!(ladder.depot && ladder.depot.applicable && ladder.depot.tiers && ladder.depot.tiers.length);
  const bothLadders = hasExShip && depotApplicable;
  const curPrice = res.price.exShipPricePerMT;
  const landed   = res.price.exShipLandedPerMT;

  // Naira-equivalent converter for ex-ship USD prices (trader-on-a-call reference).
  // RULE 1 (2026-06-23): naira<->USD settles at NAFEM, so this ₦/L-equiv uses NAFEM — matching the
  // leg-editor ₦/L hint and the depot ladder. (Display-only reference; per-tier P&L is engine-computed.)
  const ladderNafem  = (trade && trade.fx && trade.fx.nafem && isFinite(trade.fx.nafem.value) && trade.fx.nafem.value > 0) ? trade.fx.nafem.value : null;
  const ladderLitres   = (trade && trade.pricing && trade.pricing.conversion && isFinite(trade.pricing.conversion.litresPerMT) && trade.pricing.conversion.litresPerMT > 0) ? trade.pricing.conversion.litresPerMT : null;
  const ngnEquivSpan = usd => (ladderNafem && ladderLitres)
    ? \` <span class="ladder-ngn-equiv muted">· ₦\${Math.round((usd * ladderNafem) / ladderLitres).toLocaleString('en-US')}/L</span>\`
    : '';

  // ----- Ex-ship $/MT ladder (only when an ex-ship leg exists) -----
  let exShipBlock = '';
  const exShip = ladder.exShip;
  if (hasExShip && exShip && exShip.tiers && exShip.tiers.length) {
    const tiers = exShip.tiers;
    let scaleHtml = '';
    if (tiers.length >= 2) {
      const prices = tiers.map(t => t.pricePerMT);
      const lo = Math.min(...prices);
      const hi = Math.max(...prices);
      const range = hi - lo || 1;
      const tierPips = tiers.map((tier, i) => {
        const pos = ((tier.pricePerMT - lo) / range * 80 + 10).toFixed(1);
        const altCls = i % 2 === 1 ? ' alt' : '';
        return \`<span class="ladder-tier-pip\${altCls}" style="left:\${pos}%">\${esc(tier.name)}</span>\`;
      }).join('');
      let tick = '';
      if (curPrice != null && curPrice >= lo - (range*0.1) && curPrice <= hi + (range*0.1)) {
        const pos = ((curPrice - lo) / range * 80 + 10).toFixed(1);
        tick = \`<div class="ladder-scale-tick" style="left:\${pos}%" data-label="\${esc(fmtUsd(curPrice)+'/MT')}"></div>\`;
      }
      scaleHtml = \`<div class="ladder-scale-wrap" style="padding-top:28px">
        <div class="ladder-scale-bar">\${tierPips}\${tick}</div>
      </div>\`;
    }
    const tierRows = tiers.map(tier => {
      const isCur = curPrice != null && Math.abs(tier.pricePerMT - curPrice) < 0.005;
      return \`<tr class="\${isCur ? 'ladder-current' : ''}">
        <td><b>\${esc(tier.name)}</b></td>
        <td class="r">\${fmtUsd(tier.pricePerMT)}/MT\${ngnEquivSpan(tier.pricePerMT)}</td>
        <td class="r">\${fmtPct(tier.marginPctOfSell)}</td>
        <td class="r">\${fmtPct(tier.markupPctOnCost)}</td>
        <td class="r">\${fmtUsd(tier.spreadPerMT)}/MT</td>
        <td class="r \${tier.tisNetProfit >= 0 ? 'pos' : 'loss'}">\${fmtUsd(tier.tisNetProfit)}</td>
      </tr>\`;
    }).join('');
    // Label the ex-ship ladder only when a depot ladder is also shown (preserves the
    // single-ladder look for ex-ship-only / legacy trades — no regression).
    const subHead = bothLadders ? '<h3 class="ladder-sub">Ex-Ship $/MT Ladder</h3>' : '';
    exShipBlock = \`\${subHead}\${scaleHtml}
    <div class="tbl-wrap"><table>
      <thead><tr><th>Tier</th><th class="r">Price/MT</th><th class="r">Margin of Sell</th><th class="r">Markup on Landed</th><th class="r">Spread/MT</th><th class="r">TIS Net</th></tr></thead>
      <tbody>\${tierRows}</tbody>
    </table></div>\`;
  }

  // ----- Depot ₦/L ladder (absolute-spread tiers; native naira) -----
  let depotBlock = '';
  if (depotApplicable) {
    const depotRows = ladder.depot.tiers.map(tier => {
      const net = (tier.tisNetProfit == null)
        ? '<span class="muted">PENDING</span>'
        : \`<span class="\${tier.tisNetProfit >= 0 ? 'pos' : 'loss'}">\${fmtUsd(tier.tisNetProfit)}</span>\`;
      return \`<tr>
        <td><b>\${esc(tier.name)}</b></td>
        <td class="r">\${fmtNum(tier.priceNgnPerL, 2)} ₦/L</td>
        <td class="r">\${fmtNum(tier.spreadNgnPerL, 0)} ₦/L</td>
        <td class="r">\${fmtPct(tier.marginPctOfSell)}</td>
        <td class="r">\${fmtPct(tier.markupPctOnCost)}</td>
        <td class="r">\${net}</td>
      </tr>\`;
    }).join('');
    depotBlock = \`<h3 class="ladder-sub">Depot ₦/L Ladder</h3>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Tier</th><th class="r">Price ₦/L</th><th class="r">Spread ₦/L</th><th class="r">Margin %</th><th class="r">Markup on Landed</th><th class="r">TIS Net</th></tr></thead>
      <tbody>\${depotRows}</tbody>
    </table></div>\`;
  }

  // ----- Cross-leg comparison (engine output; only when BOTH legs actually exist) -----
  // The engine still emits a comparison (with a hypothetical ex-ship tier) on a depot-only trade,
  // but an ex-ship-vs-depot spread is meaningless without a real ex-ship channel. Gate the display
  // on bothLadders so depot-only / ex-ship-only trades don't show a phantom cross-leg comparison.
  // (UI-only — the engine output is untouched.)
  let compBlock = '';
  const cmp = ladder.comparison;
  if (bothLadders && cmp && cmp.applicable && cmp.exShip && cmp.depot) {
    const winner = cmp.depotEarnsMoreAbsolute ? 'Depot' : 'Ex-ship';
    compBlock = \`<div class="ladder-compare">
      <b>Cross-leg spread</b> (common ₦/L): Ex-ship <b>\${esc(cmp.exShip.tier)}</b> \${fmtNum(cmp.exShip.spreadNgnPerL, 1)} ₦/L
      vs Depot <b>\${esc(cmp.depot.tier)}</b> \${fmtNum(cmp.depot.spreadNgnPerL, 1)} ₦/L — <b>\${winner}</b> earns the larger absolute spread.
      <div class="lc-rationale">\${esc(cmp.rationale || '')}</div>
    </div>\`;
  }

  // ----- Footer: landed-cost bases in native units -----
  const footerParts = [];
  if (hasExShip) {
    footerParts.push(\`Ex-ship landed: <b>\${fmtUsd(landed)}/MT</b>\`);
    if (curPrice != null) footerParts.push(\`Current price: <b>\${fmtUsd(curPrice)}/MT</b>\`);
  }
  if (depotApplicable && ladder.depot.costBaseNgnPerL != null) {
    footerParts.push(\`Depot landed: <b>\${fmtNum(ladder.depot.costBaseNgnPerL, 2)} ₦/L</b>\`);
  }

  return \`<section class="section" aria-labelledby="ladder-h">
  <h2 class="section-heading" id="ladder-h">Pricing Ladder <span class="muted" style="font-size:11px;font-weight:400;letter-spacing:0;text-transform:none">— advisory only</span></h2>
  <div class="card">
    \${exShipBlock}
    \${depotBlock}
    \${compBlock}
    <div class="card-footer">
      \${footerParts.join(' &nbsp;·&nbsp; ')}
    </div>
  </div>
</section>\`;
}

// ── 3. Cost Build-Up ───────────────────────────────────────────────────────
function renderCost(res) {
  const cost = res.cost;
  const catLabel = c => ({ per_mt:'Per MT', derived_freight:'Freight', derived_financing:'Financing',
    flat:'Fixed fee', storage:'Storage', pct_of_freight:'% of freight',
    pct_of_cargo_value:'% of cargo', pct_of_services:'% of services',
    pct_of_LC:'% of LC', pct_of_sell:'% of sell', derived:'Derived' }[c] || c);

  const rows = cost.lines.map(l => \`<tr>
    <td class="muted" style="font-variant-numeric:tabular-nums">\${l.id}</td>
    <td>\${esc(l.label)}\${l.legalRef ? \`<div class="legal-ref">\${esc(l.legalRef)}</div>\` : ''}</td>
    <td class="muted">\${catLabel(l.category)}</td>
    <td class="r">\${l.amountUsd === 0 && l.category === 'storage' ? '<span class="muted">—</span>' : fmtUsd(l.amountUsd)}</td>
    <td>\${badge(l.status)}</td>
  </tr>\`).join('');

  const rv = cost.recoverableVat;
  const sb = cost.servicesBucket;
  const vatBase = \`<tr style="border-top:2px solid var(--border);background:var(--bg)">
    <td colspan="2"><b>VAT base (services bucket)</b><div class="legal-ref">\${sb.composition.map(x => esc(x.label)).join(', ')}</div></td>
    <td class="muted" style="background:var(--bg)">% of services</td>
    <td class="r" style="background:var(--bg)">\${fmtUsd(sb.sum)}</td>
    <td style="background:var(--bg)"></td>
  </tr>\`;
  const recRows = rv.lines.map(l => \`<tr class="tc-rec-row" style="background:var(--bg)">
    <td colspan="2" class="muted" style="padding-left:22px;background:var(--bg)">↩ \${esc(l.label)} (recoverable s.155(4))</td>
    <td style="background:var(--bg)"></td><td class="r muted" style="background:var(--bg)">\${fmtUsd(l.amount)}</td><td style="background:var(--bg)"></td>
  </tr>\`).join('');

  return \`<section class="section" aria-labelledby="cost-h">
  <h2 class="section-heading" id="cost-h">Cost Build-Up</h2>
  <div class="card">
    <div class="tbl-wrap"><table class="cost-table">
      <thead><tr><th>#</th><th>Line</th><th>Category</th><th class="r">USD</th><th>Flag</th></tr></thead>
      <tbody>\${rows}\${vatBase}\${recRows}</tbody>
    </table></div>
    <div class="cost-totals">
      <div class="cost-total-row"><span>All-in cost (incl. irrecoverable VAT):</span><b>\${fmtUsd(cost.allInCost)}</b></div>
      <div class="cost-total-row"><span>Recoverable VAT (timing only, s.155(4)):</span><b>\${fmtUsd(rv.recoverable)}</b></div>
      <div class="cost-total-row"><span>Landed cost / MT (ex-ship, excl. storage):</span><b>\${fmtUsd(cost.exShipLandedPerMT)}/MT</b></div>
    </div>
    <div class="card-footer">
      Freight base: TC hire <b>\${fmtUsd(cost.freight.tcHire)}</b> + demurrage <b>\${fmtUsd(cost.freight.demurrage)}</b> = <b>\${fmtUsd(cost.freight.freightBase)}</b>
      \${cost.storageActive ? '&nbsp;·&nbsp; Storage active (depot leg)' : ''}
    </div>
    <div class="status-legend">
      <span class="sl-item"><span class="sl-check">&#10003;</span><span class="sl-key">No badge</span>Verified — confirmed vs statute or contract</span>
      <span class="sl-item"><span class="bdg bdg-indicative" style="font-size:9px;padding:1px 5px">INDICATIVE</span><span class="sl-key" style="margin-left:2px">Indicative</span>Reasonable estimate; fine to model, not contractual</span>
      <span class="sl-item"><span class="bdg bdg-unverified" style="font-size:9px;padding:1px 5px">&#9888;&#xFE0E;&nbsp;UNVERIFIED</span><span class="sl-key" style="margin-left:2px">Unverified</span>Needs confirmation before live trading</span>
    </div>
  </div>
</section>\`;
}

// ── 4. Partner Deliverables ────────────────────────────────────────────────
function renderPartner(trade, res) {
  const pd  = res.partnerDelivers;
  const q   = res.quantities;
  const ep  = res.equityProvider;

  if (ep === 'TIS') {
    return \`<section class="section" aria-labelledby="partner-h">
    <h2 class="section-heading" id="partner-h">Equity Structure</h2>
    <div class="card card-body">
      <p class="muted" style="font-size:12px;margin-bottom:10px">\${esc(pd.note)}</p>
      <div class="info-block">
        \${infoRow('Cargo value', fmtUsd(res.cargoValue))}
        \${infoRow('Partner funding (self)', fmtUsd(res.financing.partnerFunding))}
        \${infoRow('Standalone = Adjusted = TIS net', fmtUsd(res.profit.tisNetProfit))}
      </div>
    </div>
    </section>\`;
  }

  const pp = q.paper;
  return \`<section class="section" aria-labelledby="partner-h">
  <h2 class="section-heading" id="partner-h">Partner Deliverables</h2>
  <div class="card card-body">
    <p class="muted" style="font-size:11px;margin-bottom:12px">\${esc(pd.note)}</p>
    <div class="two-col-grid">
      <div>
        <div class="info-block">
          <div class="info-sub">(1) Product Received</div>
          \${infoRow('Tonnes (economic)', fmtMt(q.economic.partnerTonnes, 2))}
          \${infoRow('Valued at ex-ship landed', fmtUsd(pd.productReceived?.valuedAtExShipLandedCost))}
          \${infoRow('= Principal at par', fmtUsd(res.financing.partnerFunding))}
        </div>
        <div class="info-block">
          <div class="info-sub">(2) Cash Received</div>
          \${infoRow('Profit share ('+fmtPct(res.profit.profitSharePct)+')', fmtUsd(pd.cashReceived?.profitShare))}
          \${pd.cashReceived?.principalCashPortion > 0 ? infoRow('Principal cash portion', fmtUsd(pd.cashReceived?.principalCashPortion)) : ''}
          \${infoRow('Settlement true-up', fmtUsd(pd.cashReceived?.settlementTrueUp))}
        </div>
      </div>
      <div>
        <div class="info-block">
          <div class="info-sub">Funding Stack</div>
          \${infoRow('Partner bond ('+fmtPct(res.financing.pct.bondPct,1)+')', fmtUsd(res.financing.performanceBond))}
          \${infoRow('Partner equity ('+fmtPct(res.financing.pct.equityPct,1)+')', fmtUsd(res.financing.equity))}
          \${infoRow('Bank LC ('+fmtPct(res.financing.pct.lcPct,1)+')', fmtUsd(res.financing.lc))}
        </div>
        \${pp ? \`<div class="info-block">
          <div class="info-sub">Paper vs Economic Quantities</div>
          \${infoRow('Partner economic', fmtMt(q.economic.partnerTonnes, 2))}
          \${infoRow('Partner paper (nearest 50)', fmtMt(pp.partnerPaper, 0) + ' ↓ TIS favour')}
          \${infoRow('Settlement cash true-up', fmtUsd(pp.cashTrueUp))}
        </div>\` : ''}
      </div>
    </div>
    <div class="tie-out-box\${pd.principalTie?.ok ? ' tie-ok' : ' tie-warn'}">
      Principal tie-out: owed <b>\${fmtUsd(res.financing.partnerFunding)}</b> = product <b>\${fmtUsd(pd.principalTie?.returnedProductValue)}</b> + cash <b>\${fmtUsd(pd.principalTie?.returnedCash)}</b>
      \${pd.principalTie?.ok ? ' <span class="bdg bdg-recoverable">&#10003; OK</span>' : ' <span class="bdg bdg-confirm">MISMATCH</span>'}
    </div>
  </div>
</section>\`;
}

// ── 5. Hedge Analysis (two side-by-side cards, independent heights) ──────
function renderHedge(trade, res) {
  const h       = res.hedge;
  const fxh     = res.fxHedge;
  const hc      = res.hedgeComparison;
  const iceOn   = !!(trade.hedge && trade.hedge.iceHedged);
  const fxOn    = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const iceRoute = (trade.hedge && trade.hedge.route) || 'bank_book';
  const fxRoute  = (trade.fxHedge && trade.fxHedge.route) || 'bank_book';

  const iceNullFixed = iceOn && (trade.hedge.fixedPrice == null);
  const fxNullFwd    = fxOn  && (trade.fxHedge.forwardRate == null);

  // Route segmented control rendered inline on each card header
  function routeSeg(selectId, current) {
    const bb = current === 'bank_book';
    // ICE is a SWAP (bank books in-house vs third-party margin financing); FX is a forward/NDF.
    const isFx = selectId === 'sel-fx-route';
    const bankLbl  = isFx ? 'Bank forward'     : 'Bank book';
    const thirdLbl = isFx ? 'Third-party NDF'  : 'Third-party (margin)';
    return \`<div class="route-seg">
      <button class="seg-btn\${bb ? ' seg-active' : ''}" onclick="setHedgeRoute('\${selectId}','bank_book')">\${bankLbl}</button>
      <button class="seg-btn\${!bb ? ' seg-active' : ''}" onclick="setHedgeRoute('\${selectId}','third_party')">\${thirdLbl}</button>
    </div>\`;
  }

  function cmpBlock(comp) {
    if (!comp) return '<div class="h-cmp"><span class="muted" style="font-size:11px">Comparison not available</span></div>';
    const delta = comp.hedgeWorthItVsUnhedged;
    const dcls  = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
    return \`<div class="h-cmp">
      <div class="h-cmp-row"><span class="h-cmp-lbl">Hedged TIS Net</span><b class="h-cmp-val">\${fmtUsd(comp.hedgedTisNet)}</b></div>
      <div class="h-cmp-row"><span class="h-cmp-lbl">Unhedged TIS Net</span><b class="h-cmp-val">\${fmtUsd(comp.unhedgedTisNet)}</b></div>
      <div class="h-cmp-row"><span class="h-cmp-lbl">Hedge value vs unhedged</span><b class="h-cmp-delta \${dcls}">\${fmtUsdSign(delta)}</b></div>
      <p class="defaults-note" style="margin-top:6px">Cost or benefit of hedging vs running unhedged, given how the rate actually moved. Negative = the hedge cost its fee/financing because the rate stayed flat or moved in your favour (protection you didn't need to claim). Positive = the hedge paid off because the rate moved against you. The hedge locks your margin both ways — it trades the chance of a windfall for certainty.</p>
    </div>\`;
  }

  // ICE rows — route-aware: third_party shows notional/margin/financing; bank_book shows spread
  const hedgedTonnes     = h.hedgedTonnes || 0;
  const priceForNotional = h.fixedPrice || trade.market.ice.value || 0;
  const iceNotional      = hedgedTonnes * priceForNotional;

  const iceRouteRows = iceRoute === 'third_party'
    ? \`\${infoRow('Notional (hedged × price)', fmtUsd(iceNotional))}
       \${infoRow('Margin posted (' + fmtPct(trade.hedge.initialMarginPct || 0.10) + ')', fmtUsd(h.bankProvidedMargin) + ' ' + badge('PLACEHOLDER'))}
       \${infoRow('Margin financing cost', fmtUsd(h.extraFinancingCost))}\`
    : infoRow('Bank spread', fmtUsd((trade.hedge.bankSpreadPerMT || 0) * hedgedTonnes) + ' total');

  // Final/settlement ICE: when entered, h.liveIce carries the settled price and the purchase floats to
  // it; the row relabels and a realized swap-P&L row appears.
  const finalSet = trade.market.ice && trade.market.ice.final != null;
  const effIce   = h.liveIce || trade.market.ice.value;
  const iceRows = \`
    \${infoRow('Lots / Hedged MT', \`\${h.lots ?? '—'} lots (\${fmtNum(hedgedTonnes, 0)} MT)\`)}
    \${infoRow('Retained basis', fmtMt(h.comparisonBasisTonnes, 2) + ' TIS retained')}
    \${infoRow('Fixed price', fmtUsd(h.fixedPrice) + '/MT ' + (trade.hedge.fixedPrice == null ? badge('PLACEHOLDER') : ''))}
    \${infoRow(finalSet ? 'Settlement ICE (final)' : 'Live ICE', fmtUsd(effIce) + '/MT' + (finalSet ? ' ' + badge('SETTLEMENT') : ''))}
    \${infoRow('ICE cost delta', fmtUsdSign(h.iceCostDelta) + (iceOn ? '' : ' (OFF — not applied)'))}
    \${finalSet ? infoRow('Realized hedge P&L', fmtUsdSign(res.hedges.iceHedgeNetImpact) + (iceOn ? ' (swap settles − fee/financing)' : ' (OFF — not applied)')) : ''}
    \${infoRow('Swap fee', fmtUsd(h.swapFee) + ' ' + badge('PLACEHOLDER'))}
    \${iceRouteRows}
  \`;
  const settlementNote = finalSet
    ? \`<div class="defaults-note">Realized at settlement ICE <b>\${fmtUsd(effIce)}/MT</b>: the purchase floats to this price (landed cost recomputed) and the swap settles (final − fixed) × hedged tonnes on TIS's retained tonnes only. "Hedge value vs unhedged" below is the realized outcome.</div>\`
    : '';
  const iceDetail = settlementNote + (iceNullFixed
    ? \`<div class="h-lock-warn">⚠ Fixed price not set — hedge prices at live ICE (<b>\${fmtUsd(trade.market.ice.value)}/MT</b>). No lock-in effect. Set a fixed price in the Hedge tab.</div>\`
    : '');

  // FX rows
  let fxRows;
  if (fxh.noHedgeReason) {
    fxRows = infoRow('Note', fxh.noHedgeReason);
  } else {
    fxRows = \`
      \${infoRow('Bank-repayment hedge base', fmtNum(fxh.exposureNgn, 0) + ' ₦' + (fxh.bankRepaymentUsd ? ' (= ' + fmtUsd(fxh.bankRepaymentUsd) + ' @ NAFEM)' : ''))}
      \${infoRow('Hedge ratio', fmtPct(fxh.hedgeRatio || 0))}
      \${infoRow('Forward rate', fxh.forwardRate ? fmtNum(fxh.forwardRate, 0) + ' ₦/USD' : badge('PLACEHOLDER'))}
      \${infoRow('FX realized delta', fmtUsdSign(fxh.fxRealizedDeltaUsd || 0) + (fxOn ? '' : ' (OFF)'))}
      \${infoRow('FX hedge cost', fmtUsd(fxh.extraFinancingCost || 0))}
      \${fxh.basis ? infoRow('Basis risk (benchmark vs NAFEM)', fmtNum(fxh.basis.gapNgnPerUsd, 2) + ' ₦/USD residual') : ''}
      <div class="defaults-note">FX hedge covers the naira needed to repay the bank's USD facility (principal + interest). Naira profit is retained in naira and not hedged.</div>
    \`;
  }
  const fxWarning = (!fxh.noHedgeReason && fxNullFwd)
    ? \`<div class="h-lock-warn">⚠ Forward rate not set — FX hedge prices at parallel pricing rate (<b>\${fmtNum(res.fx.rates.parallelPricing, 0)} ₦/USD</b>). No lock-in effect. Set a forward rate in the Hedge tab.</div>\`
    : '';

  // card(title, on, routeCtrl, detail, detailExtra, comp) — no forced equal height
  function card(title, on, routeCtrl, detail, detailExtra, comp) {
    const pillCls = on ? 'h-pill on' : 'h-pill';
    return \`<div class="h-card\${on ? ' on' : ''}">
      <div class="h-card-hdr">
        <span class="h-card-title">\${esc(title)}</span>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          \${routeCtrl}
          <span class="\${pillCls}"><span class="h-pill-dot"></span>\${on ? 'Active' : 'Off'}</span>
        </div>
      </div>
      <div class="h-detail">
        <div class="h-detail-inner">
          \${detailExtra || ''}
          <div class="info-block">\${detail}</div>
        </div>
      </div>
      \${cmpBlock(comp)}
    </div>\`;
  }

  return \`<section class="section" aria-labelledby="hedge-h">
  <h2 class="section-heading" id="hedge-h">Hedge Analysis</h2>
  <div class="hedge-cards">
    \${card('ICE Gasoil Swap',           iceOn, routeSeg('sel-ice-route', iceRoute), iceRows, iceDetail, hc?.ice)}
    \${card('FX Hedge (Naira Exposure)', fxOn,  routeSeg('sel-fx-route',  fxRoute),  fxRows,  fxWarning, hc?.fx)}
  </div>
</section>\`;
}

// ── 6. Tax Block ───────────────────────────────────────────────────────────
function renderTax(res) {
  const cost = res.cost;
  const tb   = res.tax;
  const sur  = tb.surcharge;
  const rv   = cost.recoverableVat;

  // Full tax-line set: all cost lines flagged taxLine=true, ordered by id
  const taxLines = cost.lines.filter(l => l.taxLine);
  const taxRows = taxLines.map(l => \`<tr>
    <td>\${esc(l.label)}\${l.legalRef ? \`<div class="legal-ref">\${esc(l.legalRef)}</div>\` : ''}</td>
    <td class="r">\${fmtUsd(l.amountUsd)}</td>
    <td>\${badge(l.status)}</td>
  </tr>\`).join('');

  // Recoverable VAT callout (timing note)
  const recBox = \`<tr style="background:var(--bg);border-top:2px solid var(--border)">
    <td colspan="2" style="background:var(--bg)">
      <span class="muted" style="font-size:11px">
        ↩ <b>Recoverable input VAT (s.155(4))</b> — cash-flow timing only, excluded from cost.
        Apportioned at \${(rv.taxableSupplyProportion*100).toFixed(0)}% taxable supply:
        <b>\${fmtUsd(rv.recoverable)}</b> recoverable · <b>\${fmtUsd(rv.irrecoverable)}</b> irrecoverable (IS a cost).
      </span>
    </td>
    <td class="r muted" style="background:var(--bg)">\${fmtUsd(rv.recoverable)}</td>
  </tr>\`;

  // Fossil-fuel surcharge row (toggle-gated)
  const surRow = \`<tr style="border-top:2px solid var(--border)">
    <td><b>Fossil-fuel surcharge (5%)</b>
      <div class="legal-ref">NTA 2025 s.158–161; commences on Gazette date (s.160)</div>
    </td>
    <td class="r">\${sur.enabled ? fmtUsd(sur.tisBorneUsd || 0) : '<span class="muted">OFF</span>'}</td>
    <td>\${sur.enabled ? '' : badge('PENDING')}</td>
  </tr>\`;

  const afterSurcharge = sur.enabled
    ? \`<div class="tax-net-box">
        <span class="lbl">TIS Net after surcharge</span>
        <span class="val">\${fmtUsd(res.profit.tisNetAfterSurcharge)}</span>
      </div>\`
    : '';

  return \`<section class="section" aria-labelledby="tax-h">
  <h2 class="section-heading" id="tax-h">Tax Block</h2>
  <div class="card">
    <div class="tbl-wrap"><table class="cost-table">
      <thead><tr><th>Tax Line</th><th class="r">Amount (USD)</th><th>Flag</th></tr></thead>
      <tbody>\${taxRows}\${recBox}\${surRow}</tbody>
    </table></div>
    \${afterSurcharge}
  </div>
</section>\`;
}

// ── 7. Sensitivities ───────────────────────────────────────────────────────
// Pair each lever's +10% / -10% scenarios into one group {label, pos, neg, impact},
// sorted by the lever's max absolute impact. Shared by the tornado chart and the
// sensitivities table so the table can group each lever's two rows adjacently.
function pairLeverScenarios(scenarios) {
  const sorted = [...scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));
  const seen = new Set();
  const rows = [];
  for (const s of sorted) {
    if (seen.has(s.lever)) continue;
    const baseName = s.lever.replace(/\\s*[+\\-]\\s*\\d+%$/i, '').trim();
    const partner  = sorted.find(p => !seen.has(p.lever) && p !== s && p.lever.replace(/\\s*[+\\-]\\s*\\d+%$/i,'').trim() === baseName);
    let label, pos, neg;
    if (partner) {
      label = baseName;
      pos = s.deltaVsBase >= 0 ? s : partner;
      neg = s.deltaVsBase < 0  ? s : partner;
      seen.add(s.lever); seen.add(partner.lever);
    } else {
      label = s.lever;
      pos = s.deltaVsBase >= 0 ? s : null;
      neg = s.deltaVsBase < 0  ? s : null;
      seen.add(s.lever);
    }
    const impact = Math.max(pos ? Math.abs(pos.deltaVsBase) : 0, neg ? Math.abs(neg.deltaVsBase) : 0);
    rows.push({ label, pos, neg, impact });
  }
  rows.sort((a, b) => b.impact - a.impact);
  return rows;
}

function renderTornado(sens) {
  const scenarios = sens.scenarios;
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);
  const rows = pairLeverScenarios(scenarios);

  const BAR = 52, THRESH = 13;
  const rowHtml = rows.filter(r => r.impact > 1).map(row => {
    const negPct = row.neg ? +(Math.abs(row.neg.deltaVsBase) / maxAbs * BAR).toFixed(1) : 0;
    const posPct = row.pos ? +(Math.abs(row.pos.deltaVsBase) / maxAbs * BAR).toFixed(1) : 0;
    const negVal = row.neg ? fmtUsd(row.neg.deltaVsBase) : '';
    const posVal = row.pos ? (row.pos.deltaVsBase >= 0 ? '+' : '') + fmtUsd(row.pos.deltaVsBase) : '';
    const negIn  = negPct >= THRESH, posIn = posPct >= THRESH;
    const negBar = row.neg ? \`<div class="tn-bar tn-neg" style="width:\${negPct}%">\${negIn ? \`<span class="tn-val">\${esc(negVal)}</span>\` : ''}</div>\` : '';
    const posBar = row.pos ? \`<div class="tn-bar tn-pos" style="width:\${posPct}%">\${posIn ? \`<span class="tn-val">\${esc(posVal)}</span>\` : ''}</div>\` : '';
    return \`<div class="tn-row">
      <div class="tn-label">\${esc(row.label)}</div>
      <div class="tn-bars">
        <div class="tn-half tn-left">
          \${!negIn && row.neg ? \`<span class="tn-val-out tn-neg-val">\${esc(negVal)}</span>\` : ''}
          \${negBar}
        </div>
        <div class="tn-spine"></div>
        <div class="tn-half tn-right">
          \${posBar}
          \${!posIn && row.pos ? \`<span class="tn-val-out tn-pos-val">\${esc(posVal)}</span>\` : ''}
        </div>
      </div>
    </div>\`;
  }).join('');

  return \`<div class="tn-wrap">
    <div class="tn-axis-labels">
      <span class="tn-axis-left">&larr; Negative impact (&darr; TIS Net)</span>
      <span class="tn-axis-right">Positive impact (&uarr; TIS Net) &rarr;</span>
    </div>
    \${rowHtml}
    <div class="tn-baseline-label">Base: <b>\${fmtUsd(sens.baseNet)}</b> &nbsp;·&nbsp; Bars = &Delta; vs base at &plusmn;10%</div>
  </div>\`;
}

function renderSens(res) {
  if (!res.sensitivities) return '';
  const sens = res.sensitivities;
  const scenarios = [...sens.scenarios].sort((a,b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);

  // Proportional heat: every non-zero Δ cell gets a tint; intensity scales linearly with magnitude
  function heatStyle(delta) {
    if (delta === 0 || delta == null) return '';
    const pct = Math.min(1, Math.abs(delta) / maxAbs);
    const alpha = (0.08 + pct * 0.42).toFixed(2);
    const bg = delta > 0
      ? \`rgba(16,185,129,\${alpha})\`   // green
      : \`rgba(239,68,68,\${alpha})\`;   // red
    return \` style="background:\${bg}"\`;
  }

  // Group each lever's +10% / -10% on adjacent rows (shared pairing logic with the tornado),
  // ordered by the lever's max impact. Both directions stay visible; the first row of each
  // group carries a subtle separator (.sens-group-start).
  const groups = pairLeverScenarios(scenarios);
  const sensRow = (s, first) => \`<tr\${first ? ' class="sens-group-start"' : ''}>
      <td>\${esc(s.lever)}</td>
      <td class="r">\${fmtUsd(s.tisNet)}</td>
      <td class="r"\${heatStyle(s.deltaVsBase)}>\${s.deltaVsBase >= 0 ? '+' : ''}\${fmtUsd(s.deltaVsBase)}</td>
    </tr>\`;
  const tableRows = [
    // Base-case row: neutral bg + "baseline" label (not "—" which looks broken)
    \`<tr class="sens-base">
      <td><b>Base case</b></td>
      <td class="r"><b>\${fmtUsd(sens.baseNet)}</b></td>
      <td class="r" style="background:var(--bg);color:var(--slate);font-style:italic;font-size:11px">baseline</td>
    </tr>\`,
    ...groups.flatMap(g => [g.pos, g.neg].filter(Boolean)
      .sort((a, b) => a.lever < b.lever ? -1 : a.lever > b.lever ? 1 : 0)
      .map((s, i) => sensRow(s, i === 0))),
  ].join('');

  const fxNote = !(sens.fx && sens.fx.hasNgnLegs)
    ? \`<div class="card-footer muted">FX: No NGN legs — FX sensitivity = $0 (all-USD ex-ship trade).</div>\`
    : '';

  return \`<section class="section" aria-labelledby="sens-h">
  <h2 class="section-heading" id="sens-h">Sensitivities (&plusmn;10%)</h2>
  <div class="card">
    \${renderTornado(sens)}
    <div class="tbl-wrap" style="margin-top:24px;border-top:1.5px solid var(--border);padding-top:16px">
      <table class="cost-table">
        <thead><tr><th>Lever</th><th class="r">TIS Net</th><th class="r">&Delta; vs Base</th></tr></thead>
        <tbody>\${tableRows}</tbody>
      </table>
    </div>
    \${fxNote}
  </div>
</section>\`;
}

// ── Master render ──────────────────────────────────────────────────────────
function renderAll(trade, res, ladder, hasSellPrice) {
  renderKPIs(res, hasSellPrice);
  if (hasSellPrice === false) {
    // No sell price yet: show price-INDEPENDENT outputs (cost build-up + pricing ladder),
    // a calm pending card where the waterfall goes, and clear the P&L-dependent sections.
    document.getElementById('sec-waterfall').innerHTML = renderPricePending(legPricingStatus(trade));
    document.getElementById('sec-ladder').innerHTML    = renderLadder(trade, res, ladder);
    document.getElementById('sec-cost').innerHTML      = renderCost(res);
    document.getElementById('sec-partner').innerHTML   = '';
    document.getElementById('sec-hedge').innerHTML     = '';
    document.getElementById('sec-tax').innerHTML       = '';
    document.getElementById('sec-sens').innerHTML      = '';
  } else {
    document.getElementById('sec-waterfall').innerHTML = renderWaterfall(res);
    document.getElementById('sec-ladder').innerHTML    = renderLadder(trade, res, ladder);
    document.getElementById('sec-cost').innerHTML      = renderCost(res);
    document.getElementById('sec-partner').innerHTML   = renderPartner(trade, res);
    document.getElementById('sec-hedge').innerHTML     = renderHedge(trade, res);
    document.getElementById('sec-tax').innerHTML       = renderTax(res);
    document.getElementById('sec-sens').innerHTML      = renderSens(res);
  }
  requestAnimationFrame(() => {
    document.querySelectorAll('.section').forEach(el => {
      el.classList.remove('val-flash');
      void el.offsetWidth;
      el.classList.add('val-flash');
    });
  });
}

// ── Error UI ───────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('rpt-error');
  if (el) { el.textContent = '⚠ ' + msg; el.hidden = false; }
}
function clearError() {
  const el = document.getElementById('rpt-error');
  if (el) { el.textContent = ''; el.hidden = true; }
}
function clearResults() {
  ['sec-waterfall','sec-ladder','sec-cost','sec-partner','sec-hedge','sec-tax','sec-sens']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  [['kpi-tisnet-val','—'],['kpi-annret-val','—'],['kpi-margin-val','—'],
   ['kpi-tisnet-sub','—'],['kpi-annret-sub','—'],['kpi-margin-sub','—'],
   ['kpi-margin-label','Ex-Ship Margin']]
    .forEach(([id,t]) => { const el = document.getElementById(id); if (el) el.textContent = t; });
  // No value → neutral chip (never the green profit box).
  const nv = document.getElementById('kpi-tisnet-val');
  const nc = nv ? nv.closest('.kpi-chip') : null;
  if (nc) { nc.classList.remove('kpi-accent','kpi-loss'); }
}
function showEmptyState() {
  _lastRetainedTonnes = null;
  updateHedgedVolPlaceholder();
  clearResults();
  clearError();
  const el = document.getElementById('sec-waterfall');
  if (el) el.innerHTML = '<section class="section empty-state-section"><div class="empty-state"><p class="empty-state-title">Enter trade data to see results</p><p class="empty-state-sub">Required: ICE price · FX NAFEM rate · delivered MT</p></div></section>';
}

// ── Recompute ──────────────────────────────────────────────────────────────
function recompute() {
  // Gate on key per-trade input — blank form (New Trade) shows empty state, no stale numbers
  const delivEl = document.getElementById('inp-delivered');
  if (!delivEl || !delivEl.value.trim()) { showEmptyState(); return; }

  let trade;
  try { trade = collectTrade(); }
  catch(e) { clearResults(); showError('Input error: ' + e.message); return; }

  // Sell price is OPTIONAL, now PER LEG. The cost build-up and pricing ladder are price-INDEPENDENT
  // (the ladder derives each tier's price from landed cost); only the P&L outputs need prices.
  // When any leg is unpriced we run the engine with synthetic per-leg placeholders purely so the
  // price-independent outputs compute, then suppress every price-dependent display below.
  const legsAll = trade.revenueLegs || [];
  const hasSellPrice = legsAll.length > 0 && legsAll.every(l => isFinite(l.price) && l.price > 0);

  let engineTrade = trade;
  if (!hasSellPrice) {
    const iceV = trade.market.ice.value, fobV = trade.market.fobPremium.value;
    const base = (isFinite(iceV) ? iceV : 0) + (isFinite(fobV) ? fobV : 0);
    const synthUsd = base > 0 ? base * 1.25 : 1000; // positive; never displayed
    const par = (trade.fx && trade.fx.parallel && isFinite(trade.fx.parallel.value)) ? trade.fx.parallel.value : null;
    const litres = (trade.pricing && trade.pricing.conversion && trade.pricing.conversion.litresPerMT) || 1183;
    const synthNgnPerL = par ? (synthUsd * par) / litres : 1000;
    const filled = legsAll.map(l => {
      if (isFinite(l.price) && l.price > 0) return l;
      return { ...l, price: (l.pricingUnit === 'NGN_PER_L' ? synthNgnPerL : synthUsd) };
    });
    engineTrade = { ...trade, revenueLegs: filled };
  }

  let res;
  try { res = TISEngine.computeTrade(engineTrade); }
  catch(e) { clearResults(); showError(e.message); return; }

  // Sensitivities are P&L-based — only meaningful (and only shown) once a sell price exists.
  if (hasSellPrice) {
    try {
      const fn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
      // RULE 1 (2026-06-23): NAFEM drives naira P&L, so the live FX sensitivity is the NAFEM lever.
      res.sensitivities = TISEngine.runSensitivities(engineTrade, fn, { fxMode: 'nafem' });
    } catch(_) { res.sensitivities = null; }
  } else {
    res.sensitivities = null;
  }

  let ladder = null;
  try {
    const fn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
    ladder = TISEngine.buildLadder(engineTrade, fn, res);
  } catch(_) { ladder = null; }

  // Suppress the synthetic price so the ladder shows no fake current-price marker.
  if (!hasSellPrice) res.price.exShipPricePerMT = null;

  // Update retained-tonnes for the hedge-volume placeholder (engine default = retained, not full cargo).
  _lastRetainedTonnes = (res.quantities && res.quantities.economic)
    ? res.quantities.economic.tisRetainedTonnes
    : null;

  clearError();
  renderAll(trade, res, ladder, hasSellPrice);
  updateLegNgnEquiv();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();
}

// ── Toggle switches ────────────────────────────────────────────────────────
function activateToggle(wrap, on) {
  if (!wrap) return;
  wrap.dataset.on = String(on);
  wrap.setAttribute('aria-checked', String(on));
  wrap.querySelector('.tgl-track').classList.toggle('on', on);
}

document.querySelectorAll('.tgl-wrap').forEach(wrap => {
  const toggle = () => {
    if (_isSample) { _isSample = false; }
    activateToggle(wrap, wrap.dataset.on !== 'true');
    updateSurchargeVisibility();
    updateHedgeTab();
    setModified(true);
    updateHeader();
    recompute();
  };
  wrap.addEventListener('click', toggle);
  wrap.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });
});

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = 'tab-' + btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
  });
});

// ── Hedge route switcher (called from route-seg buttons on cards) ──────────
window.setHedgeRoute = function(selectId, route) {
  const el = document.getElementById(selectId);
  if (el) { el.value = route; onInputChange(selectId); }
};

// ── Disclosure toggles ─────────────────────────────────────────────────────
window.toggleDisc = function(btn) {
  const body = btn.nextElementSibling;
  if (!body) return;
  const open = body.classList.toggle('open');
  const arrow = btn.querySelector('span');
  if (arrow) arrow.textContent = open ? '▲' : '▼';
};

// ── Drawer (responsive) ────────────────────────────────────────────────────
window.toggleDrawer = function() {
  const sb  = document.getElementById('sidebar');
  const btn = document.getElementById('drawer-btn');
  const open = sb.classList.toggle('open');
  if (btn) {
    const arr = btn.querySelector('.drawer-arrow');
    if (arr) arr.textContent = open ? '▲' : '▼';
  }
};

// ── Input listeners ────────────────────────────────────────────────────────
document.querySelectorAll('.si, .ss').forEach(el => {
  el.addEventListener('input',  () => { onInputChange(el.id); });
  el.addEventListener('change', () => { onInputChange(el.id); });
});

// Sync ph-class and pip on hedge placeholder fields: amber only when field is empty
function refreshHedgePh() {
  document.querySelectorAll('[data-ph]').forEach(function(inp) {
    const hasVal = inp.value.trim() !== '';
    inp.classList.toggle('ph', !hasVal);
    const pipEl = inp.closest('.ir') ? inp.closest('.ir').querySelector('.pip') : null;
    if (pipEl) {
      pipEl.classList.remove('pip-ok','pip-ind','pip-unv','pip-ph','pip-conf','pip-none');
      pipEl.classList.add(hasVal ? 'pip-ok' : 'pip-ind');
      pipEl.title = hasVal ? 'OK' : 'PLACEHOLDER';
    }
  });
}
// Unit-sanity guard for hedge fee/spread inputs. These multiply USD notional (FX) or hedged
// tonnes (ICE); a units typo (e.g. 2.0 meaning "$2 per $1" instead of 0.002) silently produces a
// catastrophic cost rather than an error. We surface an amber "check units" warning instead of
// letting the bad number flow into P&L. Pure display — no engine math touched.
function refreshHedgeSanity() {
  // FX fee/spread are a FRACTION OF USD NOTIONAL. Sane range ~0.001-0.004; >0.05 (5% of notional)
  // is almost certainly a units error (whole dollars typed where a small fraction belongs).
  const FX_MAX = 0.05;
  const fxFee = parseFloat((document.getElementById('inp-fx-fee') || {}).value);
  const fxSpread = parseFloat((document.getElementById('inp-fx-spread') || {}).value);
  const fxBad = [];
  if (isFinite(fxFee) && fxFee > FX_MAX) fxBad.push('Fee ' + fxFee);
  if (isFinite(fxSpread) && fxSpread > FX_MAX) fxBad.push('Spread ' + fxSpread);
  const fxWarn = document.getElementById('fx-fee-warn');
  if (fxWarn) {
    if (fxBad.length) {
      fxWarn.hidden = false;
      fxWarn.innerHTML = '⚠ ' + fxBad.join(' / ') + ' $/USD is implausibly high (>' + FX_MAX
        + ' = ' + Math.round(FX_MAX * 100) + '% of notional). These are a small fraction per USD '
        + '(e.g. 0.004), not whole dollars — check the units before this flows into P&L.';
    } else {
      fxWarn.hidden = true;
      fxWarn.textContent = '';
    }
  }

  // ICE swap fee / bank spread are ABSOLUTE $/MT (different exposure: x hedged tonnes, not a
  // fraction of notional). A typo here is bounded but can still be large, so we guard proportionally
  // against the ICE price: >10% of ICE $/MT (sane values are ~$0.5-$2/MT) signals a likely error.
  const iceEl = document.getElementById('inp-ice-final');
  const iceLiveEl = document.getElementById('inp-ice');
  let icePrice = iceEl && iceEl.value.trim() !== '' ? parseFloat(iceEl.value) : NaN;
  if (!(isFinite(icePrice) && icePrice > 0) && iceLiveEl) icePrice = parseFloat(iceLiveEl.value);
  const iceCap = (isFinite(icePrice) && icePrice > 0) ? icePrice * 0.10 : 100; // $/MT
  const iceFee = parseFloat((document.getElementById('inp-ice-fee') || {}).value);
  const iceSpread = parseFloat((document.getElementById('inp-ice-spread') || {}).value);
  const iceBad = [];
  if (isFinite(iceFee) && iceFee > iceCap) iceBad.push('Swap fee ' + iceFee);
  if (isFinite(iceSpread) && iceSpread > iceCap) iceBad.push('Bank spread ' + iceSpread);
  const iceWarn = document.getElementById('ice-fee-warn');
  if (iceWarn) {
    if (iceBad.length) {
      iceWarn.hidden = false;
      iceWarn.innerHTML = '⚠ ' + iceBad.join(' / ') + ' $/MT is implausibly high (>'
        + (Math.round(iceCap * 100) / 100) + ' $/MT ≈ 10% of ICE). Sane swap fee/spread is '
        + '~$0.5–$2/MT — check the units.';
    } else {
      iceWarn.hidden = true;
      iceWarn.textContent = '';
    }
  }
}
// // Keep hedged-volume placeholder in sync with retained tonnes from the last compute.
// The engine default is retained (not full cargo); placeholder reflects the actual
// computed value when available, or a label when not yet computed.
function updateHedgedVolPlaceholder() {
  const volEl = document.getElementById('inp-ice-hedged-vol');
  if (!volEl) return;
  const hasDefault = _lastRetainedTonnes != null && isFinite(_lastRetainedTonnes) && _lastRetainedTonnes > 0;
  volEl.placeholder = hasDefault
    ? _lastRetainedTonnes.toLocaleString('en-US', {maximumFractionDigits: 0}) + ' (retained)'
    : 'retained tonnes';
  // Pip: green when user entered a value OR a valid computed default exists;
  // amber only when genuinely empty with no computable default.
  const pipEl = volEl.closest('.ir') && volEl.closest('.ir').querySelector('.pip');
  if (pipEl) {
    const hasValue = volEl.value.trim() !== '';
    pipEl.classList.remove('pip-ok','pip-ind','pip-unv','pip-ph','pip-conf','pip-none');
    pipEl.classList.add(hasValue || hasDefault ? 'pip-ok' : 'pip-ind');
    pipEl.title = hasValue ? 'OK' : (hasDefault ? 'Using retained default' : 'INDICATIVE');
  }
}
// Keep the Final ICE placeholder showing the current live ICE (blank => engine uses live).
function updateFinalIcePlaceholder() {
  const finEl = document.getElementById('inp-ice-final');
  if (!finEl) return;
  const iceEl = document.getElementById('inp-ice');
  const live = iceEl ? parseFloat(iceEl.value) : NaN;
  finEl.placeholder = isFinite(live) && live > 0
    ? live.toLocaleString('en-US', {maximumFractionDigits: 2}) + ' (live ICE)'
    : 'live ICE';
}
function onInputChange(id) {
  if (_isSample) { _isSample = false; }
  setModified(true);
  updateLcDisplay();
  updateDepotVisibility();
  updateCurrencyVisibility();
  updateSurchargeVisibility();
  updateHedgeTab();
  updateIceRouteVisibility();
  updateFxRouteVisibility();
  updateHeader();
  refreshHedgePh();
  refreshHedgeSanity();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();
  updateLegTotal();   // delivered MT feeds the leg tonnage total
  recompute();
}

// ── Per-trade vs house-defaults grouping ──────────────────────────────────
const PER_TRADE_IDS = [
  'inp-trade-name','inp-partner-name','inp-supplier-name','inp-inspector-name',
  'inp-ice','inp-ice-final','inp-fob','inp-fxpar','inp-fxnafem','inp-delivered',
  'inp-profit-split',
  'inp-tc-rate','inp-charter','inp-demurrage',
  'inp-credit-rate','inp-lc-fee','inp-fin-days','inp-lockup','inp-wc-sublimit',
  'sel-equity-provider','inp-bond','inp-equity','inp-product-alloc',
  'sel-surcharge-inc',
  'inp-ice-fixed','inp-fx-forward','inp-ice-hedged-vol',
];
const DEFAULT_IDS = [
  'inp-npa-per-mt','inp-port-das','inp-ncs-docs',
  'inp-nimasa-cab','inp-nimasa-freight','inp-spomo',
  'inp-marine-icc','inp-sgs','inp-port-agency','inp-alloc-security',
  'inp-bank-charges','inp-overhead','inp-contingency','inp-collateral-mgr',
  'inp-throughput','inp-storage-rental','inp-evaporation','inp-tank-insurance',
  'inp-litres-per-mt',
  'inp-vat-rate','inp-wht-rate','inp-taxable-prop',
  'inp-ice-fee','inp-ice-spread','inp-ice-margin',
  'inp-fx-ratio','inp-fx-fee','inp-fx-spread',
  'inp-fx-margin','inp-fx-tenor','inp-fx-broker',
  'sel-ice-route','sel-fx-route',
];

// ── Storage layer — swap methods here to move to a hosted backend ─────────
const TISStorage = (function() {
  const KEY_TRADES   = 'tis_saved_trades_v1';
  const KEY_DEFAULTS = 'tis_house_defaults_v1';
  function safeRead(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(_) { return null; }
  }
  function safeWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch(_) { return false; }
  }
  return {
    saveTrade(name, snap) {
      const trades = safeRead(KEY_TRADES) || {};
      trades[name] = { snap, savedAt: Date.now() };
      safeWrite(KEY_TRADES, trades);
    },
    loadTrades()  { return safeRead(KEY_TRADES) || {}; },
    loadTrade(name) { const t = this.loadTrades(); return t[name] ? t[name].snap : null; },
    deleteTrade(name) {
      const t = this.loadTrades(); delete t[name]; safeWrite(KEY_TRADES, t);
    },
    saveDefaults(snap) { safeWrite(KEY_DEFAULTS, snap); },
    loadDefaults()     { return safeRead(KEY_DEFAULTS); },
  };
})();

// ── Input snapshot helpers ────────────────────────────────────────────────
function snapshotInputs(ids) {
  const snap = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) snap[id] = el.value;
  }
  return snap;
}
function applyInputSnapshot(snap) {
  if (!snap) return;
  for (const [id, val] of Object.entries(snap)) {
    const el = document.getElementById(id);
    if (el && !id.startsWith('_')) el.value = val;
  }
}

// ── Live header update ────────────────────────────────────────────────────
function updateHeader() {
  const nameEl = document.getElementById('inp-trade-name');
  const name   = nameEl ? (nameEl.value.trim() || '(Unnamed Trade)') : '(Unnamed Trade)';
  const hName  = document.getElementById('hdr-trade-name');
  if (hName) hName.textContent = name;

  // Sync browser tab title — sample fixture keeps its id; real/new trades use trade name
  if (_isSample) {
    document.title = INIT.meta.tradeId + ' — TIS Global Trading (Interactive)';
  } else if (name === '(Unnamed Trade)') {
    document.title = 'New Trade — TIS Global Trading';
  } else {
    document.title = name + ' — TIS Global Trading';
  }

  const partner   = document.getElementById('inp-partner-name')?.value.trim()   || '';
  const supplier  = document.getElementById('inp-supplier-name')?.value.trim()  || '';
  const inspector = document.getElementById('inp-inspector-name')?.value.trim() || '';

  const hP = document.getElementById('hdr-partner');   if (hP) hP.textContent = partner;
  const hS = document.getElementById('hdr-supplier');  if (hS) hS.textContent = supplier;
  const hI = document.getElementById('hdr-inspector'); if (hI) hI.textContent = inspector;

  const hPS = document.getElementById('hdr-partner-seg');
  const hSS = document.getElementById('hdr-supplier-seg');
  const hIS = document.getElementById('hdr-inspector-seg');
  if (hPS) hPS.style.display = partner   ? '' : 'none';
  if (hSS) hSS.style.display = supplier  ? '' : 'none';
  if (hIS) hIS.style.display = inspector ? '' : 'none';

  const badge = document.getElementById('hdr-fixture-badge');
  if (badge) badge.style.display = _isSample ? 'inline-block' : 'none';

  const tradeIdEl = document.getElementById('hdr-trade-id');
  if (tradeIdEl) {
    if (_isSample) {
      tradeIdEl.firstChild.textContent = INIT.meta.tradeId;
      tradeIdEl.style.display = '';
    } else {
      tradeIdEl.firstChild.textContent = '';
      tradeIdEl.style.display = 'none';
    }
  }
}

// ── New Trade ─────────────────────────────────────────────────────────────
function newTrade() {
  if (_modified && !confirm('You have unsaved changes. Start a new trade and discard them?')) return;
  const BLANK = [
    'inp-trade-name','inp-partner-name','inp-supplier-name','inp-inspector-name',
    'inp-ice','inp-ice-final','inp-fob','inp-fxpar','inp-fxnafem','inp-delivered',
    'inp-ice-fixed','inp-fx-forward','inp-ice-hedged-vol',
  ];
  for (const id of BLANK) { const el = document.getElementById(id); if (el) el.value = ''; }

  // Fresh trade starts with one blank, unpriced ex-ship leg.
  _legs = [legBlank()];
  renderLegEditor();

  // Structural per-trade: reset to INIT defaults
  const I = INIT, p = I.partner, f = I.financing;
  sv('inp-profit-split',  +(p.profitSharePct*100).toFixed(1));
  sv('inp-tc-rate',       I.freight.tcRatePerDay);
  sv('inp-charter',       I.freight.charterDays);
  sv('inp-demurrage',     I.freight.demurrageDays);
  sv('inp-credit-rate',   +(f.creditRate*100).toFixed(2));
  sv('inp-lc-fee',        +(f.lcFeePct*100).toFixed(3));
  sv('inp-fin-days',      f.financingDays);
  sv('inp-lockup',        f.capitalLockupDays);
  sv('inp-wc-sublimit',   f.wcSublimit);
  sd('sel-equity-provider', p.equityProvider || 'partner');
  sv('inp-bond',          +(p.bondPct*100).toFixed(2));
  sv('inp-equity',        +(p.equityPct*100).toFixed(2));
  sv('inp-product-alloc', +((p.productAllocationPct??1)*100).toFixed(1));
  sd('sel-surcharge-inc', (I.tax.surcharge||{}).incidence || 'cost');

  // Apply saved house defaults for cost lines, tax rates, hedge params
  const defs = TISStorage.loadDefaults();
  if (defs) { applyInputSnapshot(defs); }
  refreshHedgePh();
  refreshHedgeSanity();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();

  activateToggle(document.getElementById('tog-ice-hedge'), false);
  activateToggle(document.getElementById('tog-fx-hedge'),  false);
  activateToggle(document.getElementById('tog-surcharge'), false);

  _isSample = false;
  _currentTradeName = null;
  const selNT = document.getElementById('sel-saved-trades');
  if (selNT) selNT.value = '';
  updateLcDisplay(); updateDepotVisibility(); updateCurrencyVisibility();
  updateSurchargeVisibility(); updateHedgeTab(); updateIceRouteVisibility(); updateFxRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
  showToast('New trade — enter market data');
}

// ── Save trade (smart: update in place if already saved, else create new) ─────
function saveTrade() {
  const nameEl = document.getElementById('inp-trade-name');
  let saveName;
  const isUpdate = _currentTradeName !== null;

  if (isUpdate) {
    saveName = _currentTradeName;
  } else {
    const typedName = nameEl ? nameEl.value.trim() : '';
    if (!typedName) { showToast('Enter a trade name first'); if (nameEl) nameEl.focus(); return; }
    if (TISStorage.loadTrades()[typedName] &&
        !confirm('"' + typedName + '" already exists. Overwrite it?')) return;
    saveName = typedName;
  }

  const snap = snapshotInputs([...PER_TRADE_IDS, ...DEFAULT_IDS]);
  snap['_tog-ice-hedge'] = String(isOn('tog-ice-hedge'));
  snap['_tog-fx-hedge']  = String(isOn('tog-fx-hedge'));
  snap['_tog-surcharge'] = String(isOn('tog-surcharge'));
  snap['_isSample']      = 'false';
  snap['_legs']          = JSON.stringify(_legs);
  TISStorage.saveTrade(saveName, snap);
  _currentTradeName = saveName;
  renderSavedTradesList(saveName);
  setModified(false);
  showToast(isUpdate ? 'Updated: ' + saveName : 'Saved: ' + saveName);
}

// ── Save As (always prompts for a new name, creates a separate saved copy) ───
function saveAsTrade() {
  const nameEl    = document.getElementById('inp-trade-name');
  const suggestion = _currentTradeName
    ? _currentTradeName + ' (copy)'
    : (nameEl ? nameEl.value.trim() : '');
  const input = prompt('Save a copy as:', suggestion);
  if (input === null) return;
  const saveName = input.trim();
  if (!saveName) { showToast('Name cannot be empty'); return; }
  if (TISStorage.loadTrades()[saveName] && saveName !== _currentTradeName &&
      !confirm('"' + saveName + '" already exists. Overwrite it?')) return;

  const snap = snapshotInputs([...PER_TRADE_IDS, ...DEFAULT_IDS]);
  snap['_tog-ice-hedge'] = String(isOn('tog-ice-hedge'));
  snap['_tog-fx-hedge']  = String(isOn('tog-fx-hedge'));
  snap['_tog-surcharge'] = String(isOn('tog-surcharge'));
  snap['_isSample']      = 'false';
  snap['_legs']          = JSON.stringify(_legs);
  TISStorage.saveTrade(saveName, snap);
  _currentTradeName = saveName;
  renderSavedTradesList(saveName);
  setModified(false);
  showToast('Saved as: ' + saveName);
}

// ── Rename selected saved trade ────────────────────────────────────────────
function renameTrade() {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) { showToast('Select a saved trade first'); return; }
  const currentName = sel.value;
  const input = prompt('Rename "' + currentName + '" to:', currentName);
  if (input === null) return;
  const renamed = input.trim();
  if (!renamed) { showToast('Name cannot be empty'); return; }
  if (renamed === currentName) return;
  if (TISStorage.loadTrades()[renamed] &&
      !confirm('"' + renamed + '" already exists. Overwrite it?')) return;

  const snap = TISStorage.loadTrade(currentName);
  if (!snap) { showToast('Trade not found'); return; }
  TISStorage.saveTrade(renamed, snap);
  TISStorage.deleteTrade(currentName);
  if (_currentTradeName === currentName) _currentTradeName = renamed;
  renderSavedTradesList(renamed);
  updateStateBadge();
  showToast('Renamed to: ' + renamed);
}

// ── Load selected trade ───────────────────────────────────────────────────
function loadSelectedTrade(explicit) {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) {
    if (explicit) showToast('Select a saved trade first');
    return;
  }
  const targetName = sel.value;
  if (_modified && !confirm('Discard unsaved changes and load "' + targetName + '"?')) {
    // Restore dropdown to reflect the form's current state
    sel.value = _currentTradeName || '';
    return;
  }
  const snap = TISStorage.loadTrade(targetName);
  if (!snap) { showToast('Trade not found in storage'); return; }
  applyInputSnapshot(snap);
  _legs = legsFromSnapshot(snap);   // new snaps carry _legs; legacy snaps rebuild from old fields
  renderLegEditor();
  refreshHedgePh();
  refreshHedgeSanity();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();
  if (snap['_tog-ice-hedge'] != null) activateToggle(document.getElementById('tog-ice-hedge'), snap['_tog-ice-hedge'] === 'true');
  if (snap['_tog-fx-hedge']  != null) activateToggle(document.getElementById('tog-fx-hedge'),  snap['_tog-fx-hedge']  === 'true');
  if (snap['_tog-surcharge'] != null) activateToggle(document.getElementById('tog-surcharge'), snap['_tog-surcharge'] === 'true');
  _isSample = snap['_isSample'] === 'true';
  _currentTradeName = targetName;
  updateLcDisplay(); updateDepotVisibility(); updateCurrencyVisibility();
  updateSurchargeVisibility(); updateHedgeTab(); updateIceRouteVisibility(); updateFxRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
  showToast('Loaded: ' + targetName);
}

// ── Delete selected trade ─────────────────────────────────────────────────
function deleteSelectedTrade() {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) { showToast('Select a saved trade first'); return; }
  const name = sel.value;
  const isCurrentTrade = (_currentTradeName === name);
  const extra = isCurrentTrade ? ' (This is the trade currently in your form.)' : '';
  if (!confirm('Delete "' + name + '"? This cannot be undone.' + extra)) return;
  TISStorage.deleteTrade(name);
  if (isCurrentTrade) {
    _currentTradeName = null;
    // Form stays intact; saved copy is gone → state reverts to "new · unsaved"
  }
  renderSavedTradesList();
  sel.value = '';
  updateStateBadge();
  showToast('Deleted: ' + name);
}

// ── Save house defaults ───────────────────────────────────────────────────
function saveAsDefaults() {
  TISStorage.saveDefaults(snapshotInputs(DEFAULT_IDS));
  showToast('House defaults saved');
}

// ── Render saved trades dropdown ──────────────────────────────────────────
function renderSavedTradesList(selectName) {
  const trades = TISStorage.loadTrades();
  const sel    = document.getElementById('sel-saved-trades');
  if (!sel) return;
  const names = Object.keys(trades).sort();
  sel.innerHTML = '<option value="">Load a saved trade…</option>' +
    names.map(n => \`<option value="\${esc(n)}"\${n === selectName ? ' selected' : ''}>\${esc(n)}</option>\`).join('');
}

// ── Toast ─────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  let el = document.getElementById('tis-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tis-toast'; el.className = 'tis-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

// ── Window exposes ────────────────────────────────────────────────────────
window.newTrade            = newTrade;
window.saveTrade           = saveTrade;
window.saveAsTrade         = saveAsTrade;
window.renameTrade         = renameTrade;
window.loadSelectedTrade   = loadSelectedTrade;
window.deleteSelectedTrade = deleteSelectedTrade;
window.saveAsDefaults      = saveAsDefaults;

// ── Boot ───────────────────────────────────────────────────────────────────
_legs = legsFromTrade(INIT);   // seed the per-leg editor from the initial trade
renderLegEditor();
wireLegEditor();
updateLcDisplay();
updateDepotVisibility();
updateCurrencyVisibility();
updateSurchargeVisibility();
updateHedgeTab();
updateIceRouteVisibility();
updateFxRouteVisibility();
updateHeader();
renderSavedTradesList();
updateStateBadge();
recompute();
refreshHedgePh();
refreshHedgeSanity();
updateHedgedVolPlaceholder();
updateFinalIcePlaceholder();

})();
</script>

</body>
</html>`;

// ── 11. Write output ─────────────────────────────────────────────────────────
const outPath = path.join(OUT, 'TIS-interactive.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('HTML → ' + path.relative(ROOT, outPath));
