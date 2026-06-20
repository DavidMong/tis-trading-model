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
  .replace(/fill:#242331/g, 'fill:#f0f1f2')
  .replace(/(<svg[^>]*>)/, '$1<title>TIS Global Trading</title>');

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
.pip-ph   { background: #f97316; }
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
  border-color: var(--red);
  box-shadow: 0 0 0 2px rgba(212,29,29,.10);
}
.si:hover:not(:focus) { border-color: #9ca3af; background: #fafafa; }
.si.ph { border-color: #fdba74; background: #fffbf0; color: #9a3412; }

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
.ss:focus { outline: none; border-color: var(--red); }
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
.tgl-wrap:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(212,29,29,.30); }
.tgl-track {
  flex-shrink: 0;
  width: 34px; height: 18px;
  background: #c9cdd4;
  border-radius: 9px;
  position: relative;
  transition: background .18s;
}
.tgl-track.on { background: var(--red); }
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
  color: #9a3412;
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
.mod-badge {
  font-family: var(--f-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  background: rgba(212,29,29,.08);
  color: var(--red);
  border: 1px solid rgba(212,29,29,.20);
  border-radius: 3px;
  padding: 2px 6px;
  white-space: nowrap;
}

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
  color: #9a3412;
  font-family: var(--f-body);
  font-size: 11px;
  padding: 8px 12px;
  margin-bottom: 12px;
  line-height: 1.4;
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
.wf-row { padding: 24px 24px 8px; }
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

/* ── Sidebar footer: 2-row layout ────────────────────────────────────────── */
.sb-footer { flex-shrink:0; border-top:1.5px solid var(--border); background:var(--white); }
.sb-footer-row1 { display:flex; align-items:center; gap:8px; padding:10px 16px; border-bottom:1px solid var(--border); }
.sb-footer-row2 { display:flex; align-items:center; gap:6px; padding:8px 16px; }

.btn-new {
  flex:1; padding:6px 10px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; transition:background .12s, color .12s;
}
.btn-new:hover { background:var(--bg); color:var(--ink); }

.btn-save {
  padding:6px 14px; background:var(--red); border:none; border-radius:4px;
  font-family:var(--f-body); font-size:11px; font-weight:600; color:#fff;
  cursor:pointer; transition:background .12s; white-space:nowrap;
}
.btn-save:hover { background:#b91c1c; }

.btn-lib {
  padding:5px 9px; background:none; border:1px solid var(--border); border-radius:4px;
  font-family:var(--f-body); font-size:12px; color:var(--slate); cursor:pointer;
  flex-shrink:0; transition:background .12s, color .12s, border-color .12s;
}
.btn-lib:hover { background:var(--bg); color:var(--ink); }
.btn-lib-del:hover { background:#fef2f2; color:var(--red); border-color:#fca5a5; }

.lib-select {
  flex:1; font-family:var(--f-body); font-size:11px; color:var(--ink);
  background:var(--white); border:1px solid var(--border); border-radius:4px;
  padding:5px 6px; cursor:pointer; min-width:0;
}
.lib-select:focus { outline:none; border-color:var(--red); }

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
  return `<input type="number" id="${id}" class="si${clsStr}" value="${val !== '' && val != null ? val : ''}" step="${step ?? 'any'}"${minAttr}>`;
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
  let cls = 'pip-none';
  if (!status || s === 'OK')           cls = 'pip-ok';
  else if (s.includes('CONFIRM'))      cls = 'pip-conf';
  else if (s.includes('INDICATIVE'))   cls = 'pip-ind';
  else if (s.includes('PLACEHOLDER'))  cls = 'pip-ph';
  else if (s.includes('EXAMPLE') || s.includes('DUMMY')) cls = 'pip-ind';
  else cls = 'pip-ok';
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
  ir('inp-trade-name',    'Trade name',  ti('inp-trade-name',    shortTitleRaw,                   'e.g. Profogas Dangote 001'), ''),
  ir('inp-partner-name',  'Partner',     ti('inp-partner-name',  (t.parties||{}).partner  || '', 'Partner name'), ''),
  ir('inp-supplier-name', 'Supplier',    ti('inp-supplier-name', (t.parties||{}).supplier || '', 'Supplier name'), ''),
  ir('inp-inspector-name','Inspector',   ti('inp-inspector-name',(t.parties||{}).inspector|| '', 'Inspector name'), ''),
].join(''))}
${sec('Pricing <span class="live-badge">Live</span>', [
  ir('inp-ice',       'ICE LSGO $/MT',      ni('inp-ice',       t.market.ice.value,           0.01, 0),     t.market.ice.status, true),
  ir('inp-fob',       'FOB Premium $/MT',    ni('inp-fob',       t.market.fobPremium.value,    0.01),        '', true),
  ir('inp-fxpar',     'FX Parallel ₦/USD',   ni('inp-fxpar',     t.fx.parallel.value,          1, 1),        t.fx.parallel.status, true),
  ir('inp-delivered', 'Delivered MT',        ni('inp-delivered', t.cargo.deliveredQtyMT,        1, 1),        '', true),
].join(''))}
${sec('Sale', [
  ir('inp-exship-price', 'Ex-Ship Price $/MT', ni('inp-exship-price', t.sell.exShipPricePerMT.value, 0.01, 0), t.sell.exShipPricePerMT.status, true),
  ir('inp-exship-pct',   'Ex-ship Channel %',  ni('inp-exship-pct',   exShipPctInit, 1, 0), '', true),
  `<div class="ir pri" id="depot-price-row"${!depotActive ? ' hidden' : ''}>
    <label class="ir-lbl" for="inp-depot-price">${pip('INDICATIVE')}Depot Price ₦/L</label>
    ${ni('inp-depot-price', t.sell.depotPriceNgnPerL ? t.sell.depotPriceNgnPerL.value : 1400, 1, 0)}
  </div>`,
  ir('inp-profit-split', 'Partner Profit Split %', ni('inp-profit-split', pct2(p.profitSharePct), 1, 0), '', true),
].join(''))}
${sec('Toggles', `<div class="tgl-set">
  ${tog('tog-ice-hedge', 'ICE Gasoil Hedge', iceOn, 'hedge')}
  ${tog('tog-fx-hedge',  'FX Hedge (Naira)', fxOn, 'hedge')}
  ${tog('tog-surcharge', 'Fossil-fuel Surcharge', surEnabled, 'surcharge')}
</div>`)}

${tdiv('Deal Terms')}

${sec('FX & Currency', [
  ir('inp-fxnafem',       'FX NAFEM ₦/USD',   ni('inp-fxnafem', t.fx.nafem.value, 1, 1), t.fx.nafem.status),
  ir('inp-currency-mode', 'Currency Mode',     si('inp-currency-mode', [['USD','USD (fully USD)'],['NGN','NGN (fully naira)'],['split','Split (USD+NGN)']], t.sell.currencyMode || 'USD'), ''),
  `<div class="ir" id="split-usd-row"${(t.sell.currencyMode || 'USD') !== 'split' ? ' hidden' : ''}>
    <label class="ir-lbl" for="inp-split-usd">${pip('')}Split USD %</label>
    ${ni('inp-split-usd', pct2(t.sell.splitUsdPct || 1), 1, 0)}
  </div>`,
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
    ${ir('sel-surcharge-inc', 'Surcharge incidence', si('sel-surcharge-inc', [['cost','Cost (TIS bears)'],['pass_through','Pass-through (buyer)']], (sur.incidence) || 'cost'), 'PENDING')}
  </div>`,
  `<div id="sur-off-note" class="ir-lbl" style="color:#94a3b8"${surEnabled ? ' hidden' : ''}>Enable toggle to configure incidence</div>`,
].join(''))}
<button class="disc-btn" onclick="toggleDisc(this)">Assumptions &amp; Tax Rates <span>▼</span></button>
<div class="disc-body">
${sec('Tax Rates', [
  ir('inp-vat-rate', 'VAT Rate %',        ni('inp-vat-rate', pct2(t.tax.vatRate),             0.1, 0), 'OK'),
  ir('inp-wht-rate', 'WHT on freight %',  ni('inp-wht-rate', pct2(t.tax.whtFreightRate || 0.05), 0.1, 0), 'CONFIRM'),
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
  ir('inp-nimasa-cab',     'NIMASA cabotage %',     ni('inp-nimasa-cab',     pct2(cl.nimasaCabotagePct),     0.1, 0), 'CONFIRM'),
  ir('inp-nimasa-freight', 'NIMASA freight levy %', ni('inp-nimasa-freight', pct2(cl.nimasaFreightLevyPct), 0.1, 0), 'CONFIRM'),
  ir('inp-spomo',          'SPOMO / CVFF %',        ni('inp-spomo',          pct2(cl.spomoCvffPct),         0.1, 0), 'CONFIRM'),
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
<div id="storage-off-note" class="sb-sec" style="color:#94a3b8;font-family:var(--f-body);font-size:11px"${depotActive ? ' hidden' : ''}>Storage inputs activate when a depot channel is enabled (Ex-ship Channel &lt; 100% in Deal tab).</div>
<div class="sb-sec">
  <button class="btn-defaults" onclick="saveAsDefaults()">↓ Save current rates as house defaults</button>
  <div class="defaults-note">Saves cost lines, tax rates &amp; hedge bank terms — applied automatically on New Trade.</div>
</div>
`;

// ── Tab: Hedge ───────────────────────────────────────────────────────────────
const tabHedge = `
<div class="sb-sec">
  <div class="sb-sec-title">ICE Gasoil Swap</div>
  <div id="ice-on-warn" class="hedge-warn-note"${!iceOn ? ' hidden' : ''}>Hedge ON — verify all PLACEHOLDER values before live trading.</div>
  <div id="ice-off-note" class="hedge-off-note"${iceOn ? ' hidden' : ''}>Enable ICE Hedge in Deal tab to activate.</div>
  <div id="ice-params" class="${iceOn ? '' : 'hedge-off'}">
    ${ir('sel-ice-route', 'Route', si('sel-ice-route', [['bank_book','Bank book (in-house)'],['third_party','Third party (margin financing)']], hg.route || 'bank_book'), '')}
    ${ir('inp-ice-fixed',  'Fixed price $/MT',  ni('inp-ice-fixed',  hg.fixedPrice != null ? hg.fixedPrice : '', 0.01, 0, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-ice-fee',    'Swap fee $/MT',      ni('inp-ice-fee',    hg.feePerMT || 1.5, 0.01, 0, 'ph'),   'PLACEHOLDER')}
    <div id="ice-spread-row"${hg.route === 'third_party' ? ' hidden' : ''}>
      ${ir('inp-ice-spread', 'Bank spread $/MT', ni('inp-ice-spread', hg.bankSpreadPerMT || 0.5, 0.01, 0), 'INDICATIVE')}
    </div>
    <div id="ice-margin-row"${hg.route !== 'third_party' ? ' hidden' : ''}>
      ${ir('inp-ice-margin', 'Initial margin %', ni('inp-ice-margin', pct2(hg.initialMarginPct || 0.10), 1, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    ${ir('inp-ice-hedged-vol', 'Hedged volume MT', ni('inp-ice-hedged-vol', hg.hedgedVolumeMT != null ? hg.hedgedVolumeMT : '', 100, 0), 'INDICATIVE')}
  </div>
</div>
<div class="sb-sec">
  <div class="sb-sec-title">FX Hedge (Naira Exposure)</div>
  <div id="fx-on-warn" class="hedge-warn-note"${!fxOn ? ' hidden' : ''}>FX Hedge ON — verify all PLACEHOLDER values before live trading.</div>
  <div id="fx-off-note" class="hedge-off-note"${fxOn ? ' hidden' : ''}>Enable FX Hedge in Deal tab to activate.</div>
  <div id="fx-params" class="${fxOn ? '' : 'hedge-off'}">
    ${ir('sel-fx-route',   'Route',             si('sel-fx-route', [['bank_book','Bank book'],['third_party','Third party']], fxhg.route || 'bank_book'), '')}
    ${ir('inp-fx-forward', 'Forward rate ₦/USD',ni('inp-fx-forward', fxhg.forwardRate != null ? fxhg.forwardRate : '', 1, 1, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-fx-ratio',   'Hedge ratio %',     ni('inp-fx-ratio',  pct2(fxhg.hedgeRatio != null ? fxhg.hedgeRatio : 1), 5, 0), 'INDICATIVE')}
    ${ir('inp-fx-fee',     'Fee per USD',       ni('inp-fx-fee',    fxhg.feePerUsd || 0.004, 0.001, 0, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-fx-spread',  'Spread per USD',    ni('inp-fx-spread', fxhg.spreadPerUsd || 0.002, 0.001, 0, 'ph'), 'PLACEHOLDER')}
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
      <button class="btn-new" onclick="newTrade()" title="Clear per-trade fields, keep house defaults">New Trade</button>
      <button class="btn-save" onclick="saveTrade()" title="Save all inputs under the trade name">Save</button>
      <span class="mod-badge" id="modified-badge" hidden>Modified</span>
    </div>
    <div class="sb-footer-row2">
      <select id="sel-saved-trades" class="lib-select"><option value="">— saved trades —</option></select>
      <button class="btn-lib" onclick="loadSelectedTrade()" title="Load selected trade">↓</button>
      <button class="btn-lib btn-lib-del" onclick="deleteSelectedTrade()" title="Delete selected trade">✕</button>
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
      <p class="trade-id">${esc(t.meta.tradeId)}${fixtureBadgeHtml}</p>
    </div>
    <div class="header-kpis" role="region" aria-label="Key metrics">
      <div class="kpi-chip kpi-accent">
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
        <span class="kpi-label">Ex-Ship Margin</span>
        <span class="kpi-value" id="kpi-margin-val">—</span>
        <span class="kpi-sub"  id="kpi-margin-sub">—</span>
      </div>
    </div>
  </div>
  <div class="header-meta-strip">
    <div class="header-meta-inner">
      Flow: <b id="hdr-flow">${esc(t.meta.flow || 'equity-partner')}</b> &nbsp;&middot;&nbsp;
      Partner: <b id="hdr-partner">${esc((t.parties || {}).partner || '—')}</b> &nbsp;&middot;&nbsp;
      Supplier: <span id="hdr-supplier">${esc((t.parties || {}).supplier || '—')}</span> &nbsp;&middot;&nbsp;
      Inspector: <span id="hdr-inspector">${esc((t.parties || {}).inspector || '—')}</span>
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
  const cls = {
    CONFIRM:'bdg-confirm', UNVERIFIED:'bdg-unverified', PLACEHOLDER:'bdg-placeholder',
    PENDING:'bdg-pending', RECOVERABLE:'bdg-recoverable', INDICATIVE:'bdg-indicative',
    EXAMPLE:'bdg-example', DUMMY:'bdg-example', FIXED:'bdg-fixed',
  };
  const upper = String(s).toUpperCase();
  let c = 'bdg-default';
  for (const [k,v] of Object.entries(cls)) { if (upper.includes(k)) { c = v; break; } }
  const short = s.length > 18 ? s.replace(/\\s*\\([^)]*\\)/g,'').trim() : s;
  return \`<span class="bdg \${c}" title="\${esc(s)}">\${esc(short.split('(')[0].trim())}</span>\`;
}

// ── DOM helpers ────────────────────────────────────────────────────────────
function gf(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; }
function gi(id) { const el = document.getElementById(id); return el ? parseInt(el.value, 10) : NaN; }
function gs(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function isOn(id) { const el = document.getElementById(id); return el ? el.dataset.on === 'true' : false; }
function show(id, vis) { const el = document.getElementById(id); if (el) el.hidden = !vis; }

// ── Collect trade from inputs ──────────────────────────────────────────────
function collectTrade() {
  const bondPct     = gf('inp-bond')   / 100;
  const equityPct   = gf('inp-equity') / 100;
  const lcPct       = Math.round((1 - bondPct - equityPct) * 1e10) / 1e10;
  const exShipPct   = Math.min(1, Math.max(0, gf('inp-exship-pct') / 100));
  const depotPct    = Math.round((1 - exShipPct) * 1e10) / 1e10;
  const depotOn     = depotPct > 0;
  const currMode    = gs('inp-currency-mode') || 'USD';
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

  const sell = {
    ...INIT.sell,
    exShipPricePerMT: { ...INIT.sell.exShipPricePerMT, value: gf('inp-exship-price') },
    currencyMode: currMode,
  };
  if (currMode === 'split') sell.splitUsdPct = gf('inp-split-usd') / 100;
  if (depotOn) sell.depotPriceNgnPerL = { value: gf('inp-depot-price'), status: 'INDICATIVE' };

  return {
    ...INIT,
    market: {
      ice:        { ...INIT.market.ice,        value: gf('inp-ice') },
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
    },
    pricing: {
      ...INIT.pricing,
      conversion: {
        ...INIT.pricing.conversion,
        litresPerMT: depotOn ? gf('inp-litres-per-mt') : (INIT.pricing.conversion.litresPerMT || 1183),
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
  const pct = gf('inp-exship-pct');
  const hasDepot = pct < 100;
  show('depot-price-row', hasDepot);
  show('storage-sec', hasDepot);
  show('storage-off-note', !hasDepot);
}

function updateCurrencyVisibility() {
  show('split-usd-row', gs('inp-currency-mode') === 'split');
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

// ── Modified state ─────────────────────────────────────────────────────────
let _modified = false;
function setModified(v) {
  _modified = v;
  const el = document.getElementById('modified-badge');
  if (el) el.hidden = !v;
}

// ── Reset to defaults ──────────────────────────────────────────────────────
function resetToDefaults() {
  const I = INIT;
  const f = I.financing, p = I.partner, cl = I.costLines, h = I.hedge, fxh = I.fxHedge || {};
  const sur = I.tax.surcharge || {};

  sv('inp-ice',            I.market.ice.value);
  sv('inp-fob',            I.market.fobPremium.value);
  sv('inp-fxpar',          I.fx.parallel.value);
  sv('inp-delivered',      I.cargo.deliveredQtyMT);
  sv('inp-exship-price',   I.sell.exShipPricePerMT.value);
  sv('inp-exship-pct',     I.channels ? +(I.channels.exShipPct * 100).toFixed(1) : 100);
  sv('inp-depot-price',    I.sell.depotPriceNgnPerL ? I.sell.depotPriceNgnPerL.value : 1400);
  sv('inp-profit-split',   +(p.profitSharePct * 100).toFixed(1));
  sv('inp-fxnafem',        I.fx.nafem.value);
  sd('inp-currency-mode',  I.sell.currencyMode || 'USD');
  sv('inp-split-usd',      +(((I.sell.splitUsdPct || 1) * 100)).toFixed(1));
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
  // UI state
  updateLcDisplay();
  updateDepotVisibility();
  updateCurrencyVisibility();
  updateSurchargeVisibility();
  updateHedgeTab();
  updateIceRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
}

// ── Render helpers ─────────────────────────────────────────────────────────
function infoRow(label, value, extra) {
  return \`<div class="info-row"><span>\${esc(label)}</span><b>\${value ?? '—'}</b>\${extra ? \` \${extra}\` : ''}</div>\`;
}

// ── KPI chips ──────────────────────────────────────────────────────────────
function renderKPIs(res) {
  const p   = res.profit;
  const tisNet = p.tisNetProfit;

  const kv = document.getElementById('kpi-tisnet-val');
  const ks = document.getElementById('kpi-tisnet-sub');
  if (kv) { kv.textContent = fmtUsd(tisNet); kv.classList.add('kpi-flash'); setTimeout(() => kv.classList.remove('kpi-flash'), 350); }
  if (ks) ks.textContent = res.equityProvider === 'TIS' ? 'self-funded (no partner)' : 'after partner split';

  const ann = res.tisAnnualisedReturn;
  const av  = document.getElementById('kpi-annret-val');
  const as_ = document.getElementById('kpi-annret-sub');
  if (av) av.textContent = ann != null ? fmtPct(ann) : '—';
  if (as_) as_.textContent = \`on cargo value · \${res.financing.capitalLockupDays}d lockup\`;

  const landed = res.price.exShipLandedPerMT;
  const price  = res.price.exShipPricePerMT;
  const margin = (price && landed) ? (price - landed) / price : null;
  const mv = document.getElementById('kpi-margin-val');
  const ms = document.getElementById('kpi-margin-sub');
  if (mv) mv.textContent = margin != null ? fmtPct(margin) : '—';
  if (ms) ms.textContent = price ? fmtUsd(price) + '/MT sell' : '—';
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
      \${box('wf-net',       'TIS NET PROFIT','=', p.tisNetProfit,     'Self-funded — no partner')}
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
      \${box('wf-net',       'TIS NET PROFIT','=',    p.tisNetProfit,     fmtPct(1-p.profitSharePct)+' of adjusted')}
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
      &nbsp;·&nbsp; Annualised return: <b>\${fmtPct(res.tisAnnualisedReturn)}</b> on \${esc(res.annualReturnBaseLabel||'cargo value')} · \${res.financing.capitalLockupDays}d lockup
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
function renderLadder(trade, res, ladder) {
  if (!ladder || !ladder.exShip) return '';
  const exShip  = ladder.exShip;
  const tiers   = exShip.tiers || [];
  const curPrice = res.price.exShipPricePerMT;
  const landed   = res.price.exShipLandedPerMT;

  // Price-scale bar: floor to premium range
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
      <td class="r">\${fmtUsd(tier.pricePerMT)}/MT</td>
      <td class="r">\${fmtPct(tier.marginPctOfSell)}</td>
      <td class="r">\${fmtPct(tier.markupPctOnCost)}</td>
      <td class="r">\${fmtUsd(tier.spreadPerMT)}/MT</td>
      <td class="r \${tier.tisNetProfit >= 0 ? 'pos' : 'neg'}">\${fmtUsd(tier.tisNetProfit)}</td>
    </tr>\`;
  }).join('');

  const depotTiers = (ladder.depot && ladder.depot.tiers) || [];
  let depotSection = '';
  if (depotTiers.length > 0) {
    const depotRows = depotTiers.map(tier => \`<tr>
      <td><b>\${esc(tier.name)}</b></td>
      <td class="r">\${fmtNum(tier.ngnPricePerL || tier.priceNgnPerL || 0, 2)} ₦/L</td>
      <td class="r">\${fmtPct(tier.marginPctOfSell)}</td>
      <td class="r">\${fmtPct(tier.markupPctOnCost)}</td>
      <td class="r \${tier.tisNetProfit >= 0 ? 'pos' : 'neg'}">\${fmtUsd(tier.tisNetProfit)}</td>
    </tr>\`).join('');
    depotSection = \`<h3 style="font-family:var(--f-display);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--slate);margin:16px 20px 8px">Depot ₦/L Ladder</h3>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Tier</th><th class="r">₦/L</th><th class="r">Margin %</th><th class="r">Markup on Landed</th><th class="r">TIS Net</th></tr></thead>
      <tbody>\${depotRows}</tbody>
    </table></div>\`;
  }

  const compNote = ladder.comparison && ladder.comparison.summary ? \`&nbsp;·&nbsp;\${esc(ladder.comparison.summary)}\` : '';
  return \`<section class="section" aria-labelledby="ladder-h">
  <h2 class="section-heading" id="ladder-h">Pricing Ladder <span class="muted" style="font-size:11px;font-weight:400;letter-spacing:0;text-transform:none">— advisory only</span></h2>
  <div class="card">
    \${scaleHtml}
    <div class="tbl-wrap"><table>
      <thead><tr><th>Tier</th><th class="r">Price/MT</th><th class="r">Margin of Sell</th><th class="r">Markup on Landed</th><th class="r">Spread/MT</th><th class="r">TIS Net</th></tr></thead>
      <tbody>\${tierRows}</tbody>
    </table></div>
    \${depotSection}
    <div class="card-footer">
      Ex-ship landed: <b>\${fmtUsd(landed)}/MT</b> &nbsp;·&nbsp; Current price: <b>\${fmtUsd(curPrice)}/MT</b>\${compNote}
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
      Principal tie-out: owed <b>\${fmtUsd(res.financing.partnerFunding)}</b> = product <b>\${fmtUsd(pd.productReceived?.valuedAtExShipLandedCost)}</b> + cash <b>\${fmtUsd(pd.cashReceived?.principalCashPortion)}</b>
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
    return \`<div class="route-seg">
      <button class="seg-btn\${bb ? ' seg-active' : ''}" onclick="setHedgeRoute('\${selectId}','bank_book')">Bank book</button>
      <button class="seg-btn\${!bb ? ' seg-active' : ''}" onclick="setHedgeRoute('\${selectId}','third_party')">3rd party</button>
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

  const iceRows = \`
    \${infoRow('Lots / Hedged MT', \`\${h.lots ?? '—'} lots (\${fmtNum(hedgedTonnes, 0)} MT)\`)}
    \${infoRow('Retained basis', fmtMt(h.comparisonBasisTonnes, 2) + ' TIS retained')}
    \${infoRow('Fixed price', fmtUsd(h.fixedPrice) + '/MT ' + (trade.hedge.fixedPrice == null ? badge('PLACEHOLDER') : ''))}
    \${infoRow('Live ICE', fmtUsd(h.liveIce || trade.market.ice.value) + '/MT')}
    \${infoRow('ICE cost delta', fmtUsdSign(h.iceCostDelta) + (iceOn ? '' : ' (OFF — not applied)'))}
    \${infoRow('Swap fee', fmtUsd(h.swapFee) + ' ' + badge('PLACEHOLDER'))}
    \${iceRouteRows}
  \`;
  const iceDetail = iceNullFixed
    ? \`<div class="h-lock-warn">⚠ Fixed price not set — hedge prices at live ICE (<b>\${fmtUsd(trade.market.ice.value)}/MT</b>). No lock-in effect. Set a fixed price in the Hedge tab.</div>\`
    : '';

  // FX rows
  let fxRows;
  if (fxh.noHedgeReason) {
    fxRows = infoRow('Note', fxh.noHedgeReason);
  } else {
    fxRows = \`
      \${infoRow('Net ₦ exposure', fmtNum(fxh.exposureNgn, 0) + ' ₦')}
      \${infoRow('Hedge ratio', fmtPct(fxh.hedgeRatio || 0))}
      \${infoRow('Forward rate', fxh.forwardRate ? fmtNum(fxh.forwardRate, 0) + ' ₦/USD' : badge('PLACEHOLDER'))}
      \${infoRow('FX realized delta', fmtUsdSign(fxh.fxRealizedDeltaUsd || 0) + (fxOn ? '' : ' (OFF)'))}
      \${infoRow('FX hedge cost', fmtUsd(fxh.extraFinancingCost || 0))}
      \${fxh.basis ? infoRow('Basis risk (benchmark vs parallel)', fmtNum(fxh.basis.gapNgnPerUsd, 2) + ' ₦/USD residual') : ''}
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
function renderTornado(sens) {
  const scenarios = sens.scenarios;
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);
  const sorted  = [...scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));

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

  const tableRows = [
    // Base-case row: neutral bg + "baseline" label (not "—" which looks broken)
    \`<tr class="sens-base">
      <td><b>Base case</b></td>
      <td class="r"><b>\${fmtUsd(sens.baseNet)}</b></td>
      <td class="r" style="background:var(--bg);color:var(--slate);font-style:italic;font-size:11px">baseline</td>
    </tr>\`,
    ...scenarios.map(s => \`<tr>
      <td>\${esc(s.lever)}</td>
      <td class="r">\${fmtUsd(s.tisNet)}</td>
      <td class="r"\${heatStyle(s.deltaVsBase)}>\${s.deltaVsBase >= 0 ? '+' : ''}\${fmtUsd(s.deltaVsBase)}</td>
    </tr>\`),
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
function renderAll(trade, res, ladder) {
  renderKPIs(res);
  document.getElementById('sec-waterfall').innerHTML = renderWaterfall(res);
  document.getElementById('sec-ladder').innerHTML    = renderLadder(trade, res, ladder);
  document.getElementById('sec-cost').innerHTML      = renderCost(res);
  document.getElementById('sec-partner').innerHTML   = renderPartner(trade, res);
  document.getElementById('sec-hedge').innerHTML     = renderHedge(trade, res);
  document.getElementById('sec-tax').innerHTML       = renderTax(res);
  document.getElementById('sec-sens').innerHTML      = renderSens(res);
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

// ── Recompute ──────────────────────────────────────────────────────────────
function recompute() {
  let trade;
  try { trade = collectTrade(); }
  catch(e) { showError('Input error: ' + e.message); return; }

  let res;
  try { res = TISEngine.computeTrade(trade); }
  catch(e) { showError(e.message); return; }

  try {
    const fn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
    res.sensitivities = TISEngine.runSensitivities(trade, fn, { fxMode: 'parallel' });
  } catch(_) { res.sensitivities = null; }

  let ladder = null;
  try {
    const fn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
    ladder = TISEngine.buildLadder(trade, fn, res);
  } catch(_) { ladder = null; }

  clearError();
  renderAll(trade, res, ladder);
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
    activateToggle(wrap, wrap.dataset.on !== 'true');
    updateSurchargeVisibility();
    updateHedgeTab();
    setModified(true);
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

function onInputChange(id) {
  setModified(true);
  updateLcDisplay();
  updateDepotVisibility();
  updateCurrencyVisibility();
  updateSurchargeVisibility();
  updateHedgeTab();
  updateIceRouteVisibility();
  updateHeader();
  recompute();
}

// ── Per-trade vs house-defaults grouping ──────────────────────────────────
const PER_TRADE_IDS = [
  'inp-trade-name','inp-partner-name','inp-supplier-name','inp-inspector-name',
  'inp-ice','inp-fob','inp-fxpar','inp-fxnafem','inp-delivered',
  'inp-exship-price','inp-exship-pct','inp-depot-price','inp-profit-split',
  'inp-currency-mode','inp-split-usd',
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

  const partner   = document.getElementById('inp-partner-name')?.value   || '—';
  const supplier  = document.getElementById('inp-supplier-name')?.value  || '—';
  const inspector = document.getElementById('inp-inspector-name')?.value || '—';
  const hP = document.getElementById('hdr-partner');   if (hP) hP.textContent = partner;
  const hS = document.getElementById('hdr-supplier');  if (hS) hS.textContent = supplier;
  const hI = document.getElementById('hdr-inspector'); if (hI) hI.textContent = inspector;

  const badge = document.getElementById('hdr-fixture-badge');
  if (badge) badge.style.display = _isSample ? 'inline-block' : 'none';
}

// ── New Trade ─────────────────────────────────────────────────────────────
function newTrade() {
  const BLANK = [
    'inp-trade-name','inp-partner-name','inp-supplier-name','inp-inspector-name',
    'inp-ice','inp-fob','inp-fxpar','inp-fxnafem','inp-delivered',
    'inp-exship-price','inp-depot-price','inp-ice-fixed','inp-fx-forward','inp-ice-hedged-vol',
  ];
  for (const id of BLANK) { const el = document.getElementById(id); if (el) el.value = ''; }

  // Structural per-trade: reset to INIT defaults
  const I = INIT, p = I.partner, f = I.financing;
  sv('inp-exship-pct',    I.channels ? +(I.channels.exShipPct*100).toFixed(1) : 100);
  sv('inp-profit-split',  +(p.profitSharePct*100).toFixed(1));
  sd('inp-currency-mode', I.sell.currencyMode || 'USD');
  sv('inp-split-usd',     +(((I.sell.splitUsdPct||1)*100)).toFixed(1));
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

  activateToggle(document.getElementById('tog-ice-hedge'), false);
  activateToggle(document.getElementById('tog-fx-hedge'),  false);
  activateToggle(document.getElementById('tog-surcharge'), false);

  _isSample = false;
  updateLcDisplay(); updateDepotVisibility(); updateCurrencyVisibility();
  updateSurchargeVisibility(); updateHedgeTab(); updateIceRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
  showToast('New trade — enter market data');
}

// ── Save trade ────────────────────────────────────────────────────────────
function saveTrade() {
  const nameEl = document.getElementById('inp-trade-name');
  const name   = nameEl ? nameEl.value.trim() : '';
  if (!name) { showToast('Enter a trade name first'); if (nameEl) nameEl.focus(); return; }
  const snap = snapshotInputs([...PER_TRADE_IDS, ...DEFAULT_IDS]);
  snap['_tog-ice-hedge'] = String(isOn('tog-ice-hedge'));
  snap['_tog-fx-hedge']  = String(isOn('tog-fx-hedge'));
  snap['_tog-surcharge'] = String(isOn('tog-surcharge'));
  snap['_isSample']      = 'false';
  TISStorage.saveTrade(name, snap);
  renderSavedTradesList(name);
  setModified(false);
  showToast('Saved: ' + name);
}

// ── Load selected trade ───────────────────────────────────────────────────
function loadSelectedTrade() {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) return;
  const snap = TISStorage.loadTrade(sel.value);
  if (!snap) return;
  applyInputSnapshot(snap);
  if (snap['_tog-ice-hedge'] != null) activateToggle(document.getElementById('tog-ice-hedge'), snap['_tog-ice-hedge'] === 'true');
  if (snap['_tog-fx-hedge']  != null) activateToggle(document.getElementById('tog-fx-hedge'),  snap['_tog-fx-hedge']  === 'true');
  if (snap['_tog-surcharge'] != null) activateToggle(document.getElementById('tog-surcharge'), snap['_tog-surcharge'] === 'true');
  _isSample = snap['_isSample'] === 'true';
  updateLcDisplay(); updateDepotVisibility(); updateCurrencyVisibility();
  updateSurchargeVisibility(); updateHedgeTab(); updateIceRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
}

// ── Delete selected trade ─────────────────────────────────────────────────
function deleteSelectedTrade() {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) return;
  const name = sel.value;
  if (!confirm('Delete saved trade "' + name + '"?')) return;
  TISStorage.deleteTrade(name);
  renderSavedTradesList();
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
  sel.innerHTML = '<option value="">— saved trades —</option>' +
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
window.loadSelectedTrade   = loadSelectedTrade;
window.deleteSelectedTrade = deleteSelectedTrade;
window.saveAsDefaults      = saveAsDefaults;

// ── Boot ───────────────────────────────────────────────────────────────────
updateLcDisplay();
updateDepotVisibility();
updateCurrencyVisibility();
updateSurchargeVisibility();
updateHedgeTab();
updateIceRouteVisibility();
updateHeader();
renderSavedTradesList();
recompute();

})();
</script>

</body>
</html>`;

// ── 11. Write output ─────────────────────────────────────────────────────────
const outPath = path.join(OUT, 'TIS-interactive.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('HTML → ' + path.relative(ROOT, outPath));
