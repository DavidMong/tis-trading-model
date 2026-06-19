'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

// ── 1. (Re-)bundle the engine ────────────────────────────────────────────────
execSync(
  'npx esbuild scripts/engine-browser-entry.js --bundle --format=iife --global-name=TISEngine --minify --outfile=out/engine.bundle.js',
  { cwd: ROOT, stdio: 'inherit' }
);
const engineBundle = fs.readFileSync(path.join(OUT, 'engine.bundle.js'), 'utf8');

// ── 2. Read sample trade as initial state ────────────────────────────────────
const initialTrade = JSON.parse(fs.readFileSync(path.join(ROOT, 'trades', 'sample-equity-partner.json'), 'utf8'));

// ── 3. Read logo SVG ─────────────────────────────────────────────────────────
const logoSvg = fs.readFileSync(path.join(ROOT, 'assets', 'tis-logo-2.svg'), 'utf8');
// Invert Global Trading text for dark header
const logo = logoSvg.replace(/fill:#242331/g, 'fill:#f0f1f2');

// ── 4. Static report CSS (verbatim from build-report.js) + interactive extras ─
function css() {
  const {reportCss} = require('./build-report');
  return reportCss + `
/* ── Interactive additions ──────────────────────────────────────────────── */
.ctrl-panel {
  background: var(--white);
  border-bottom: 2px solid var(--border);
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
.ctrl-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 32px;
}
.ctrl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.ctrl-title {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
}
.ctrl-toggle-panel {
  font-family: var(--f-body);
  font-size: 11px;
  color: var(--slate);
  cursor: pointer;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 10px;
}
.ctrl-toggle-panel:hover { background: var(--bg); }
.ctrl-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px 16px;
}
.ctrl-grid[hidden] { display: none; }
.ctrl-group {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
}
.ctrl-group-title {
  font-family: var(--f-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border);
}
.ctrl-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 6px;
}
.ctrl-row:last-child { margin-bottom: 0; }
.ctrl-label {
  font-family: var(--f-body);
  font-size: 10px;
  color: var(--slate);
  margin-bottom: 2px;
}
.ctrl-input {
  font-family: var(--f-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 6px;
  width: 100%;
  box-sizing: border-box;
  font-variant-numeric: tabular-nums lining-nums;
}
.ctrl-input:focus {
  outline: none;
  border-color: var(--red);
  box-shadow: 0 0 0 2px rgba(212,29,29,.10);
}
.ctrl-select {
  font-family: var(--f-body);
  font-size: 12px;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 6px;
  width: 100%;
  box-sizing: border-box;
}
.ctrl-select:focus { outline: none; border-color: var(--red); }
.ctrl-toggles { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.ctrl-tog-btn {
  font-family: var(--f-body);
  font-size: 11px;
  font-weight: 600;
  border: 1.5px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  background: var(--bg);
  color: var(--slate);
  text-align: left;
  transition: all .12s;
}
.ctrl-tog-btn.active {
  background: rgba(212,29,29,.06);
  border-color: var(--red);
  color: var(--red);
}
.ctrl-tog-btn.active-green {
  background: #f0fdf4;
  border-color: #15803d;
  color: #15803d;
}
.error-banner {
  background: #fff5f5;
  border: 1.5px solid #fca5a5;
  border-radius: 6px;
  color: #991b1b;
  font-family: var(--f-body);
  font-size: 12px;
  padding: 10px 16px;
  margin-bottom: 16px;
}
.error-banner[hidden] { display: none; }
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
@media (max-width: 1100px) {
  .ctrl-grid { grid-template-columns: repeat(3, 1fr); }
}
`;
}

// ── 5. Generate the HTML ──────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const t = initialTrade;
const shortTitle = esc(t.meta.tradeName.replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi, '').trim());
const fixtureBadge = `<span style="display:inline-block;margin-left:10px;padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:rgba(212,29,29,.20);color:#fca5a5;border:1px solid rgba(212,29,29,.35);border-radius:3px;vertical-align:middle">Fixture</span>`;

// Controls panel HTML
function ctrlGroup(title, rows) {
  return `<div class="ctrl-group">
  <div class="ctrl-group-title">${title}</div>
  ${rows}
</div>`;
}
function ctrlRow(label, inputHtml) {
  return `<div class="ctrl-row"><label class="ctrl-label">${label}</label>${inputHtml}</div>`;
}
function numInput(id, val, step, min) {
  return `<input type="number" id="${id}" class="ctrl-input" value="${val}" step="${step ?? 'any'}" min="${min ?? 0}">`;
}
function selInput(id, options, selected) {
  const opts = options.map(([v,l]) => `<option value="${v}"${v===selected?' selected':''}>${l}</option>`).join('');
  return `<select id="${id}" class="ctrl-select">${opts}</select>`;
}
function togBtn(id, label, active, cls='') {
  return `<button id="${id}" class="ctrl-tog-btn${active ? ' '+(cls||'active') : ''}" data-on="${active}">${active ? '&#10003;' : '&#215;'} ${label}</button>`;
}

const f = t.financing;
const p = t.partner;
const lcPct = +(f.lcPctOfCargo * 100).toFixed(2);
const bondPct = +(p.bondPct * 100).toFixed(2);
const equityPct = +(p.equityPct * 100).toFixed(2);

const controlsHtml = `
<div class="ctrl-panel">
  <div class="ctrl-inner">
    <div class="ctrl-header">
      <span class="ctrl-title">Trade Inputs <span class="live-badge">Live</span></span>
      <button class="ctrl-toggle-panel" onclick="togglePanel(this)">&#x25B2; Collapse</button>
    </div>
    <div id="ctrl-grid" class="ctrl-grid">
      ${ctrlGroup('Market', [
        ctrlRow('ICE LSGO ($/MT)', numInput('inp-ice', t.market.ice.value, 0.01, 0)),
        ctrlRow('FOB Premium ($/MT)', numInput('inp-fob', t.market.fobPremium.value, 0.01)),
        ctrlRow('FX Parallel (₦/USD)', numInput('inp-fx-parallel', t.fx.parallel.value, 1, 1)),
        ctrlRow('FX NAFEM (₦/USD)', numInput('inp-fx-nafem', t.fx.nafem.value, 1, 1)),
      ].join(''))}
      ${ctrlGroup('Cargo &amp; Price', [
        ctrlRow('Delivered MT', numInput('inp-delivered', t.cargo.deliveredQtyMT, 1, 1)),
        ctrlRow('Ex-Ship Price ($/MT)', numInput('inp-exship-price', t.sell.exShipPricePerMT.value, 0.01, 0)),
        ctrlRow('Ex-ship Channel %', numInput('inp-exship-pct', 100, 1, 0)),
        ctrlRow('Depot Price (₦/L)', `<div id="depot-price-row" hidden>${numInput('inp-depot-price', 1400, 1, 0)}</div><span id="depot-price-na" class="ctrl-label" style="color:var(--border);padding-top:4px">N/A (no depot)</span>`),
      ].join(''))}
      ${ctrlGroup('Freight', [
        ctrlRow('TC Rate ($/day)', numInput('inp-tc-rate', t.freight.tcRatePerDay, 500, 0)),
        ctrlRow('Charter Days', numInput('inp-charter', t.freight.charterDays, 1, 0)),
        ctrlRow('Demurrage Days', numInput('inp-demurrage', t.freight.demurrageDays, 0.5, 0)),
      ].join(''))}
      ${ctrlGroup('Financing', [
        ctrlRow('Credit Rate (%/yr)', numInput('inp-credit-rate', +(f.creditRate*100).toFixed(2), 0.1, 0)),
        ctrlRow('LC Fee (%)', numInput('inp-lc-fee', +(f.lcFeePct*100).toFixed(3), 0.01, 0)),
        ctrlRow('Financing Days', numInput('inp-fin-days', f.financingDays, 1, 1)),
        ctrlRow('Capital Lockup Days', numInput('inp-lockup', f.capitalLockupDays, 1, 1)),
      ].join(''))}
      ${ctrlGroup('Partner &amp; Equity', [
        ctrlRow('Bond % (of cargo)', numInput('inp-bond', bondPct, 0.5, 0)),
        ctrlRow('Equity % (of cargo)', numInput('inp-equity', equityPct, 0.5, 0)),
        ctrlRow('LC % (auto)', `<div id="lc-pct-display" class="ctrl-input" style="background:var(--bg);color:var(--slate);cursor:default">${lcPct.toFixed(2)}%</div>`),
        ctrlRow('Profit Split (partner %)', numInput('inp-profit-split', +(p.profitSharePct*100).toFixed(1), 1, 0)),
      ].join(''))}
      ${ctrlGroup('Currency &amp; Toggles', [
        ctrlRow('Currency Mode', selInput('inp-currency-mode', [['USD','USD (fully USD)'],['NGN','NGN (fully naira)'],['split','Split (USD + NGN)']], 'USD')),
        ctrlRow('Taxable Supply Prop.', numInput('inp-taxable-prop', t.tax.taxableSupplyProportion, 0.05, 0)),
        `<div class="ctrl-row"><label class="ctrl-label">Toggles</label>
          <div class="ctrl-toggles">
            ${togBtn('tog-ice-hedge', 'ICE Hedge', false)}
            ${togBtn('tog-fx-hedge', 'FX Hedge', false)}
            ${togBtn('tog-surcharge', 'Surcharge', false)}
          </div>
        </div>`,
      ].join(''))}
    </div>
  </div>
</div>`;

// ── CSS
let sharedCss;
try { sharedCss = css(); }
catch(e) {
  // If build-report doesn't export reportCss yet, use a placeholder reference
  sharedCss = fs.readFileSync(path.join(__dirname, '_report-css.css'), 'utf8').catch?.() || '';
  if (!sharedCss) throw e;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.meta.tradeId)} — TIS Global Trading (Interactive)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
${sharedCss}
</style>
</head>
<body>

<header class="report-header" role="banner">
  <div class="header-inner">
    <div class="header-logo" aria-label="TIS Global Trading">${logo}</div>
    <div class="header-trade">
      <h1 class="trade-name">${shortTitle}${fixtureBadge}</h1>
      <p class="trade-id">${esc(t.meta.tradeId)}</p>
    </div>
    <div class="header-kpis" role="region" aria-label="Key metrics">
      <div class="kpi-chip kpi-accent">
        <span class="kpi-label">TIS Net Profit</span>
        <span class="kpi-value" id="kpi-tisnet-val">—</span>
        <span class="kpi-sub" id="kpi-tisnet-sub">after partner split</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label">Annualised Return</span>
        <span class="kpi-value" id="kpi-annret-val">—</span>
        <span class="kpi-sub" id="kpi-annret-sub">—</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-label">Ex-Ship Margin</span>
        <span class="kpi-value" id="kpi-margin-val">—</span>
        <span class="kpi-sub" id="kpi-margin-sub">—</span>
      </div>
    </div>
  </div>
  <div class="header-meta-strip">
    <div class="header-meta-inner">
      Flow: <b>equity-partner</b> &nbsp;&middot;&nbsp;
      Partner: <b>${esc((t.parties||{}).partner||'—')}</b> &nbsp;&middot;&nbsp;
      Supplier: ${esc((t.parties||{}).supplier||'—')} &nbsp;&middot;&nbsp;
      Inspector: ${esc((t.parties||{}).inspector||'—')}
    </div>
  </div>
</header>

${controlsHtml}

<div class="container">
  <div id="rpt-error" class="error-banner" hidden></div>
  <div id="sec-params"></div>
  <div id="sec-cost"></div>
  <div id="sec-waterfall"></div>
  <div id="sec-partner-hedge"></div>
  <div id="sec-tax"></div>
  <div id="sec-ladder"></div>
  <div id="sec-sens"></div>
</div>

<footer class="report-footer" role="contentinfo">
  TIS Global Trading &mdash; Interactive Trade Model &mdash;
  ${esc(t.meta.tradeId)} &mdash; All figures DUMMY/EXAMPLE data only. Not a real trade.
</footer>

<script>
// ── Engine bundle ─────────────────────────────────────────────────────────────
${engineBundle}
</script>
<script>
(function() {
'use strict';

// ── Initial trade (frozen as baseline) ───────────────────────────────────────
const INIT = ${JSON.stringify(initialTrade)};

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtUsd(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  return (v < 0 ? '−$' : '$') + s;
}
function fmtUsdSign(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  return (v < 0 ? '−$' : '+$') + s;
}
function fmtPct(v, d=2) {
  if (v == null || !isFinite(v)) return '—';
  return (v * 100).toFixed(d) + '%';
}
function fmtMt(v, d=2) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d}) + ' MT';
}
function fmtNum(v, d=0) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
}
function badge(s) {
  if (!s || s === 'OK') return '';
  const cls = {CONFIRM:'bdg-confirm', PLACEHOLDER:'bdg-placeholder', INDICATIVE:'bdg-indicative',
    PENDING:'bdg-pending', RECOVERABLE:'bdg-ok', EXAMPLE:'bdg-indicative', 'EXAMPLE (dummy mark)':'bdg-indicative'}[s] || 'bdg-indicative';
  return \`<span class="bdg \${cls}">\${esc(s.split('(')[0].trim())}</span>\`;
}

// ── Input collection ─────────────────────────────────────────────────────────
function gf(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; }
function gi(id) { const el = document.getElementById(id); return el ? parseInt(el.value, 10) : NaN; }
function gs(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function isOn(id) { const el = document.getElementById(id); return el ? el.dataset.on === 'true' : false; }

function collectTrade() {
  const bondPct    = gf('inp-bond')    / 100;
  const equityPct  = gf('inp-equity')  / 100;
  const lcPct      = Math.round((1 - bondPct - equityPct) * 1e10) / 1e10;
  const exShipPct  = Math.min(1, Math.max(0, gf('inp-exship-pct') / 100));
  const depotPct   = Math.round((1 - exShipPct) * 1e10) / 1e10;
  const currMode   = gs('inp-currency-mode') || 'USD';
  const depotEnabled = depotPct > 0;

  const sell = {
    ...INIT.sell,
    exShipPricePerMT: { ...INIT.sell.exShipPricePerMT, value: gf('inp-exship-price') },
    currencyMode: currMode,
  };
  if (currMode === 'split') sell.splitUsdPct = gf('inp-split-usd') / 100;
  if (depotEnabled) sell.depotPriceNgnPerL = { value: gf('inp-depot-price'), status: 'INDICATIVE' };

  return {
    ...INIT,
    market: {
      ice:        { ...INIT.market.ice,        value: gf('inp-ice') },
      fobPremium: { ...INIT.market.fobPremium, value: gf('inp-fob') },
    },
    cargo: { ...INIT.cargo, deliveredQtyMT: gf('inp-delivered') },
    freight: { ...INIT.freight, tcRatePerDay: gf('inp-tc-rate'), charterDays: gi('inp-charter'), demurrageDays: gi('inp-demurrage') },
    financing: { ...INIT.financing, creditRate: gf('inp-credit-rate') / 100, lcFeePct: gf('inp-lc-fee') / 100, financingDays: gi('inp-fin-days'), capitalLockupDays: gi('inp-lockup'), lcPctOfCargo: lcPct },
    sell,
    fx: {
      parallel: { ...INIT.fx.parallel, value: gf('inp-fx-parallel'), override: null },
      nafem:    { ...INIT.fx.nafem,    value: gf('inp-fx-nafem'),    override: null },
    },
    channels: { exShipPct, depotPct },
    partner: { ...INIT.partner, bondPct, equityPct, totalFundingPct: bondPct + equityPct, profitSharePct: gf('inp-profit-split') / 100 },
    tax: { ...INIT.tax, taxableSupplyProportion: gf('inp-taxable-prop'), surcharge: { ...INIT.tax.surcharge, enabled: isOn('tog-surcharge') } },
    hedge:   { ...INIT.hedge,   iceHedged: isOn('tog-ice-hedge') },
    fxHedge: { ...INIT.fxHedge, fxHedged: isOn('tog-fx-hedge') },
    depot: { enabled: depotEnabled },
  };
}

// ── Update LC display ────────────────────────────────────────────────────────
function updateLcDisplay() {
  const b = gf('inp-bond') / 100, e = gf('inp-equity') / 100;
  const lc = Math.round((1 - b - e) * 10000) / 100;
  const el = document.getElementById('lc-pct-display');
  if (el) { el.textContent = lc.toFixed(2) + '%'; el.style.color = lc < 0 ? 'var(--red)' : 'var(--slate)'; }
}

// ── Depot price row visibility ───────────────────────────────────────────────
function updateDepotVisibility() {
  const pct = gf('inp-exship-pct');
  const hasDepot = pct < 100;
  const dpRow = document.getElementById('depot-price-row');
  const dpNa  = document.getElementById('depot-price-na');
  if (dpRow) dpRow.hidden = !hasDepot;
  if (dpNa)  dpNa.hidden  = hasDepot;
}

// ── Render helpers ────────────────────────────────────────────────────────────
function statusBadge(s) { return badge(s); }

function wfBox(cls, label, prefix, amount, sub, extra='') {
  return \`<div class="wf-box \${cls}">
    <div class="wf-box-label">\${label}</div>
    <div class="wf-box-amount">\${prefix}\${fmtUsd(amount)}</div>
    <div class="wf-box-sub">\${sub}</div>
    \${extra}
  </div>\`;
}

// ── KPI chips ────────────────────────────────────────────────────────────────
function renderKPIs(res) {
  const p = res.profit;
  const tisNet = p.tisNetProfit;
  document.getElementById('kpi-tisnet-val').textContent = fmtUsd(tisNet);
  document.getElementById('kpi-tisnet-sub').textContent = 'after partner split';

  const ann = res.tisAnnualisedReturn;
  document.getElementById('kpi-annret-val').textContent = ann != null ? fmtPct(ann) : '—';
  document.getElementById('kpi-annret-sub').textContent =
    \`on cargo value · \${res.financing.capitalLockupDays}d lockup\`;

  const exShipLanded = res.price.exShipLandedPerMT;
  const exShipPrice  = res.price.exShipPricePerMT;
  const marginPct    = (exShipPrice && exShipLanded) ? (exShipPrice - exShipLanded) / exShipPrice : null;
  document.getElementById('kpi-margin-val').textContent = marginPct != null ? fmtPct(marginPct) : '—';
  document.getElementById('kpi-margin-sub').textContent = exShipPrice ? fmtUsd(exShipPrice) + '/MT sell' : '—';
}

// ── Trade Parameters ─────────────────────────────────────────────────────────
function renderParams(trade, res) {
  const f = res.financing;
  const fx = (trade.fx || {});
  const nafem    = fx.nafem    ? (fx.nafem.override    ?? fx.nafem.value)    : null;
  const parallel = fx.parallel ? (fx.parallel.override ?? fx.parallel.value) : null;
  const cards = [
    {label:'ICE Mark',        value: fmtUsd(trade.market.ice.value) + '/MT',    sub: badge(trade.market.ice.status)},
    {label:'FOB Premium',     value: fmtUsd(trade.market.fobPremium.value)+'/MT',sub:''},
    {label:'Unit FOB',        value: fmtUsd(res.unitFob)+'/MT',                  sub:'ICE + premium'},
    {label:'Cargo Size',      value: fmtMt(trade.cargo.deliveredQtyMT, 0),      sub:'Delivered qty'},
    {label:'Ex-Ship Price',   value: fmtUsd(res.price.exShipPricePerMT)+'/MT',  sub: badge(trade.sell.exShipPricePerMT.status)},
    {label:'Landed/MT',       value: fmtUsd(res.price.exShipLandedPerMT)+'/MT', sub:'excl. recoverable VAT'},
    {label:'FX Parallel',     value: parallel != null ? fmtNum(parallel,0)+' ₦/USD' : '—', sub:'drives P&amp;L'},
    {label:'FX NAFEM',        value: nafem    != null ? fmtNum(nafem,0)   +' ₦/USD' : '—', sub:'reference only'},
    {label:'Equity Stack',    value: fmtPct(f.pct.bondPct)+' + '+fmtPct(f.pct.equityPct), sub:'Partner '+fmtPct(f.pct.partnerPct)+' · LC '+fmtPct(f.pct.lcPct)},
    {label:'Partner Principal',value:fmtUsd(f.partnerFunding), sub:'Bond '+fmtUsd(f.performanceBond)+' + Equity '+fmtUsd(f.equity)},
    {label:'Credit Rate',     value: fmtPct(f.creditRate), sub:f.financingDays+'d financing'},
    {label:'Profit Split',    value: fmtPct(1-res.profit.profitSharePct)+' TIS', sub:'Partner '+fmtPct(res.profit.profitSharePct)+' cash share'},
  ];
  return \`<section class="section" aria-labelledby="params-heading">
  <h2 class="section-heading" id="params-heading">Trade Parameters</h2>
  <div class="param-grid">
    \${cards.map(c => \`<div class="param-card">
      <span class="param-label">\${c.label}</span>
      <span class="param-value">\${c.value}</span>
      \${c.sub ? \`<span class="param-sub">\${c.sub}</span>\` : ''}
    </div>\`).join('')}
  </div>
</section>\`;
}

// ── Cost Build-Up ─────────────────────────────────────────────────────────────
function renderCost(res) {
  const cost = res.cost;
  const lines = cost.lines;
  function catLabel(c) {
    return {per_mt:'Per MT', pct_of_freight:'% of freight', pct_of_cargo_value:'% of cargo', pct_of_LC:'% of LC',
      pct_of_services:'% of services', pct_of_sell:'% of sell', fixed:'Fixed fee', derived_freight:'Freight',
      derived_financing:'Financing', storage:'Storage'}[c] || c;
  }
  const rows = lines.map((l, i) => {
    const isCost = !l.recoverable;
    return \`<tr>
      <td class="tc-num">\${l.id}</td>
      <td>\${esc(l.label)}\${l.legalRef ? \`<div class="legal-ref">\${esc(l.legalRef)}</div>\` : ''}</td>
      <td class="muted">\${catLabel(l.category)}</td>
      <td class="tc-amt">\${l.amountUsd === 0 && l.category==='storage' ? '<span class="muted">—</span>' : fmtUsd(l.amountUsd)}</td>
      <td>\${statusBadge(l.status)}</td>
    </tr>\`;
  }).join('');

  const rv = cost.recoverableVat;
  const sb = cost.servicesBucket;
  const vatRow = \`<tr style="border-top:2px solid var(--border)">
    <td colspan="2"><b>VAT base (services bucket)</b><div class="legal-ref">\${sb.composition.map(x=>esc(x.label)).join(', ')}</div></td>
    <td class="muted">% of services</td>
    <td class="tc-amt">\${fmtUsd(sb.sum)}</td>
    <td></td>
  </tr>\`;

  const recRows = rv.lines.map(l => \`<tr class="tc-rec-row">
    <td colspan="2" class="muted" style="padding-left:24px">↩ \${esc(l.label)} (recoverable s.155(4))</td>
    <td></td><td class="tc-amt muted">\${fmtUsd(l.amount)}</td><td></td>
  </tr>\`).join('');

  const depotNote = cost.storageActive ? 'Storage active — depot leg' : '';
  return \`<section class="section" aria-labelledby="cost-heading">
  <h2 class="section-heading" id="cost-heading">Cost Build-Up</h2>
  <div class="card">
    <table class="cost-table">
      <thead><tr>
        <th class="tc-num">#</th><th>Line Item</th><th>Category</th><th class="tc-amt">Amount (USD)</th><th>Flag</th>
      </tr></thead>
      <tbody>\${rows}\${vatRow}\${recRows}</tbody>
    </table>
    <div class="cost-totals">
      <div class="cost-total-row"><span>All-in cost (incl. irrecoverable VAT):</span><b>\${fmtUsd(cost.allInCost)}</b></div>
      <div class="cost-total-row"><span>Recoverable VAT (timing only, s.155(4)):</span><b>\${fmtUsd(rv.recoverable)}</b></div>
      <div class="cost-total-row"><span>Landed cost / MT (ex-ship, excl. storage):</span><b>\${fmtUsd(cost.exShipLandedPerMT)}/MT</b></div>
    </div>
    <div class="card-footer" style="border-top:1px solid var(--border)">
      Cost base: \${fmtUsd(cost.exShipLandedPerMT)}/MT (ex-ship landed, excl. storage)
      \${depotNote ? '&nbsp;&middot;&nbsp; ' + esc(depotNote) : ''}
    </div>
  </div>
</section>\`;
}

// ── Profit Waterfall ──────────────────────────────────────────────────────────
function renderWaterfall(res) {
  const p   = res.profit;
  const qty = res.quantities;
  const rec = p.reconciliation;

  const okMark  = rec.ok ? \`<span class="bdg bdg-ok">&#10003; OK</span>\` : \`<span class="bdg bdg-confirm">MISMATCH</span>\`;
  const recLine = \`Reconciliation: marginForegone + adjusted = standalone
    <b>\${fmtUsd(p.marginForegone)} + \${fmtUsd(p.adjustedProfit)} = \${fmtUsd(p.standaloneProfit)}</b> \${okMark} &nbsp;&nbsp;
    Annualised return: <b>\${fmtPct(res.tisAnnualisedReturn)}</b> on cargo value (INDICATIVE) · \${res.financing.capitalLockupDays}d lockup\`;

  return \`<section class="section" aria-labelledby="waterfall-heading">
  <h2 class="section-heading" id="waterfall-heading">Profit Waterfall</h2>
  <div class="card">
    <div class="wf-row">
      \${wfBox('wf-standalone','STANDALONE PROFIT','',   p.standaloneProfit, 'TIS as 100% owner')}
      <div class="wf-arrow" aria-hidden="true">&#8250;</div>
      \${wfBox('wf-deduct',   'MARGIN FOREGONE',  '−',  p.marginForegone,   fmtMt(qty.economic.partnerTonnes,2)+' partner tonnes')}
      <div class="wf-arrow" aria-hidden="true">&#8250;</div>
      \${wfBox('wf-adjusted', 'ADJUSTED PROFIT',  '=',  p.adjustedProfit,   'TIS retained tonnes share')}
      <div class="wf-arrow" aria-hidden="true">&#8250;</div>
      \${wfBox('wf-share',    'PARTNER CASH SHARE','−', p.partnerCashProfitShare, fmtPct(p.profitSharePct)+' of adjusted')}
      <div class="wf-arrow" aria-hidden="true">&#8250;</div>
      \${wfBox('wf-net',      'TIS NET PROFIT',   '=',  p.tisNetProfit,     fmtPct(1-p.profitSharePct)+' of adjusted')}
    </div>
    <div class="wf-reconcile">\${recLine}</div>
  </div>
</section>\`;
}

// ── Partner Deliverables + Hedges ─────────────────────────────────────────────
function renderPartnerHedge(trade, res) {
  const pd = res.partnerDelivers;
  const q  = res.quantities;
  const h  = res.hedge;
  const fxh= res.fxHedge;
  const hc = res.hedgeComparison;
  const iceOn = trade.hedge && trade.hedge.iceHedged;
  const fxOn  = trade.fxHedge && trade.fxHedge.fxHedged;
  const pp  = q.paper;

  const partnerSection = \`
  <div class="two-col-card">
    <h3 style="font-family:var(--f-display);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--slate);margin-bottom:12px">Partner Deliverables</h3>
    <p class="muted" style="font-size:11px;margin-bottom:10px">\${esc(pd.note)}</p>
    <div class="info-block">
      <div class="info-sub">(1) Product Received</div>
      <div class="info-row"><span>Tonnes (economic)</span><b>\${fmtMt(q.economic.partnerTonnes,2)}</b></div>
      <div class="info-row"><span>Valued at ex-ship landed</span><b>\${fmtUsd(pd.productReceived?.valuedAtExShipLandedCost)}</b></div>
      <div class="info-row"><span>= Principal at par</span><b>\${fmtUsd(res.financing.partnerFunding)}</b></div>
    </div>
    <div class="info-block">
      <div class="info-sub">(2) Cash Received</div>
      <div class="info-row"><span>Profit share (\${fmtPct(res.profit.profitSharePct)})</span><b>\${fmtUsd(pd.cashReceived?.profitShare)}</b></div>
    </div>
    \${pp ? \`<div class="info-block">
      <div class="info-sub">Paper vs Economic Quantities</div>
      <div class="info-row"><span>Partner (economic)</span><b>\${fmtMt(q.economic.partnerTonnes,2)}</b></div>
      <div class="info-row"><span>Partner (paper, nearest 50)</span><b>\${fmtMt(pp.partnerPaper,0)} &darr; (TIS favour)</b></div>
      <div class="info-row"><span>TIS retained (economic)</span><b>\${fmtMt(q.economic.tisRetainedTonnes,2)}</b></div>
      <div class="info-row"><span>Settlement cash true-up</span><b>\${fmtUsd(pp.cashTrueUp)}</b></div>
    </div>\` : ''}
    <div class="tie-out-box\${pd.principalTie?.ok?' tie-ok':' tie-warn'}">
      Principal tie-out: owed <b>\${fmtUsd(res.financing.partnerFunding)}</b> = product <b>\${fmtUsd(pd.productReceived?.valuedAtExShipLandedCost)}</b> + cash <b>\${fmtUsd(pd.cashReceived?.principalCashPortion)}</b>
      \${pd.principalTie?.ok ? ' <span class="bdg bdg-ok">&#10003; OK</span>' : ' <span class="bdg bdg-confirm">MISMATCH</span>'}
    </div>
  </div>\`;

  function hedgeBlock(title, on, details, comp, compLabel) {
    const toggleCls = on ? 'hedge-toggle hedge-on' : 'hedge-toggle hedge-off';
    const toggleTxt = on ? '&#10003; HEDGED &mdash; Toggle ON' : '&#215; UNHEDGED &mdash; Toggle OFF';
    const rows = Object.entries(details).map(([k,v]) => \`<div class="info-row"><span>\${esc(k)}</span><b>\${esc(String(v??'—'))}</b></div>\`).join('');
    const compBlock = comp ? \`<div class="hedge-compare">
      <div class="info-row"><span>Hedged TIS Net</span><b>\${fmtUsd(comp.hedgedTisNet)}</b></div>
      <div class="info-row"><span>Unhedged TIS Net</span><b>\${fmtUsd(comp.unhedgedTisNet)}</b></div>
      <div class="info-row"><span>Hedge worth it?</span><b>\${fmtUsdSign(comp.hedgeWorthItVsUnhedged)}</b></div>
    </div>\` : '';
    return \`<div class="hedge-block">
      <div class="hedge-title">\${esc(title)}</div>
      <div class="\${toggleCls}">\${toggleTxt}</div>
      \${rows ? \`<div class="info-block">\${rows}</div>\` : ''}
      \${compBlock}
    </div>\`;
  }

  const iceDetails = {
    Route: h.route || '—',
    Lots: \`\${h.lots} (\${fmtNum(h.hedgedVolumeMT,2)} MT)\`,
    'Comparison basis': \`\${fmtNum(h.tisRetainedTonnes,2)} MT TIS retained\`,
    'Fixed price': fmtUsd(h.fixedPrice)+'/MT '+badge('PLACEHOLDER'),
    'Live ICE': fmtUsd(trade.market.ice.value)+'/MT',
    'ICE cost delta': fmtUsdSign(h.iceCostDelta),
    'Swap fee': fmtUsd(h.swapFee)+' '+badge('PLACEHOLDER'),
    'Bank-provided margin': fmtUsd(h.bankProvidedMargin),
    'Extra financing cost': fmtUsd(h.extraFinancingCost),
  };

  const fxDetails = fxh.noHedgeReason
    ? { Note: fxh.noHedgeReason }
    : {
        'Net NGN exposure': fmtNum(fxh.netNairaNgn,0)+' ₦',
        'Hedged ratio': fmtPct(fxh.hedgeRatio||0),
        'Forward rate': fxh.forwardRate ? fmtNum(fxh.forwardRate,0)+' ₦/USD' : 'PLACEHOLDER',
        'FX realized delta': fmtUsdSign(fxh.fxRealizedDeltaUsd||0),
        'FX hedge cost': fmtUsd(fxh.extraFinancingCost||0),
      };

  const hedgesSection = \`<div class="two-col-card">
    \${hedgeBlock('ICE Gasoil Swap', iceOn, iceDetails, hc?.ice, 'ICE')}
    \${hedgeBlock('FX Hedge (Naira Exposure)', fxOn, fxDetails, hc?.fx, 'FX')}
  </div>\`;

  return \`<section class="section">
  <div class="two-col-grid">
    \${partnerSection}
    \${hedgesSection}
  </div>
</section>\`;
}

// ── Tax Block ─────────────────────────────────────────────────────────────────
function renderTax(res) {
  const tb = res.tax;
  const sur = tb.surcharge;
  const rows = tb.lines ? tb.lines.map(l => \`<tr>
    <td>\${esc(l.label)}</td>
    <td class="tc-amt">\${fmtUsd(l.amount)}</td>
    <td>\${statusBadge(l.status)}</td>
  </tr>\`).join('') : '';
  const surRow = \`<tr style="border-top:2px solid var(--border)">
    <td><b>Fossil-fuel surcharge (5%)</b></td>
    <td class="tc-amt">\${sur.enabled ? fmtUsd(sur.tisBorneUsd||0) : '<span class="muted">OFF (toggled)</span>'}</td>
    <td>\${sur.enabled ? '' : badge('PENDING')}</td>
  </tr>\`;
  return \`<section class="section" aria-labelledby="tax-heading">
  <h2 class="section-heading" id="tax-heading">Tax Block</h2>
  <div class="card">
    <table class="cost-table">
      <thead><tr><th>Tax Line</th><th class="tc-amt">Amount</th><th>Flag</th></tr></thead>
      <tbody>\${rows}\${surRow}</tbody>
    </table>
    \${sur.enabled ? \`<div class="cost-total-row" style="padding:12px 0 0"><span>TIS Net after surcharge:</span><b>\${fmtUsd(res.profit.tisNetAfterSurcharge)}</b></div>\` : ''}
  </div>
</section>\`;
}

// ── Pricing Ladder ────────────────────────────────────────────────────────────
function renderLadder(trade, res, ladder) {
  if (!ladder || !ladder.exShip) return '';
  const exShipLanded  = res.price.exShipLandedPerMT;
  const currentPrice  = res.price.exShipPricePerMT;
  const exShip        = ladder.exShip;
  const tiers         = exShip.tiers || [];
  const currentTier   = exShip.current || {};

  const tierRows = tiers.map(tier => {
    const isCurrent = currentTier.nearestTier === tier.name ||
      (currentPrice != null && Math.abs(tier.pricePerMT - currentPrice) < 0.005);
    const rowCls = isCurrent ? 'ladder-current' : '';
    return \`<tr class="\${rowCls}">
      <td><b>\${esc(tier.name)}</b></td>
      <td class="tc-amt">\${fmtUsd(tier.pricePerMT)}/MT</td>
      <td class="tc-amt">\${fmtPct(tier.marginPctOfSell)}</td>
      <td class="tc-amt">\${fmtPct(tier.markupPctOnCost)}</td>
      <td class="tc-amt">\${fmtUsd(tier.spreadPerMT)}/MT</td>
      <td class="tc-amt \${tier.tisNetProfit >= 0 ? 'pos' : 'neg'}">\${fmtUsd(tier.tisNetProfit)}</td>
    </tr>\`;
  }).join('');

  const depotTiers = (ladder.depot && ladder.depot.tiers) || [];
  const depotSection = depotTiers.length > 0 ? \`
  <h3 style="font-family:var(--f-display);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--slate);margin:16px 0 8px">Depot &#8358;/L Ladder</h3>
  <table class="cost-table">
    <thead><tr><th>Tier</th><th class="tc-amt">&#8358;/L Price</th><th class="tc-amt">Margin %</th><th class="tc-amt">Markup on Landed</th><th class="tc-amt">TIS Net</th></tr></thead>
    <tbody>\${depotTiers.map(tier => \`<tr>
      <td><b>\${esc(tier.name)}</b></td>
      <td class="tc-amt">\${fmtNum(tier.ngnPricePerL || tier.priceNgnPerL || 0, 2)} &#8358;/L</td>
      <td class="tc-amt">\${fmtPct(tier.marginPctOfSell)}</td>
      <td class="tc-amt">\${fmtPct(tier.markupPctOnCost)}</td>
      <td class="tc-amt \${tier.tisNetProfit >= 0 ? 'pos' : 'neg'}">\${fmtUsd(tier.tisNetProfit)}</td>
    </tr>\`).join('')}</tbody>
  </table>\` : '';

  const compNote = ladder.comparison && ladder.comparison.summary ? \` &nbsp;&middot;&nbsp; \${esc(ladder.comparison.summary)}\` : '';

  return \`<section class="section" aria-labelledby="ladder-heading">
  <h2 class="section-heading" id="ladder-heading">Pricing Ladder <span class="muted" style="font-size:12px;font-weight:400;letter-spacing:0;text-transform:none">— advisory guide only</span></h2>
  <div class="card">
    <table class="cost-table">
      <thead><tr><th>Tier</th><th class="tc-amt">Price/MT</th><th class="tc-amt">Margin of Sell</th><th class="tc-amt">Markup on Landed</th><th class="tc-amt">Spread/MT</th><th class="tc-amt">TIS Net</th></tr></thead>
      <tbody>\${tierRows}</tbody>
    </table>
    \${depotSection}
    <div class="card-footer" style="border-top:1px solid var(--border)">
      Ex-ship landed: <b>\${fmtUsd(exShipLanded)}/MT</b> &nbsp;&middot;&nbsp; Current price: <b>\${fmtUsd(currentPrice)}/MT</b>\${compNote}
    </div>
  </div>
</section>\`;
}

// ── Sensitivities ─────────────────────────────────────────────────────────────
function renderTornado(sens) {
  const scenarios = sens.scenarios;
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);
  const sorted = [...scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));

  const seen = new Set();
  const rows = [];
  for (const s of sorted) {
    if (seen.has(s.lever)) continue;
    const baseName = s.lever.replace(/\\s*[+\\-]\\s*10%$/i, '').trim();
    const partner = sorted.find(p => !seen.has(p.lever) && p !== s && p.lever.replace(/\\s*[+\\-]\\s*10%$/i,'').trim() === baseName);
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
    rows.push({label, pos, neg, impact});
  }
  rows.sort((a,b) => b.impact - a.impact);

  const BAR_PCT = 46, THRESH = 13;
  const rowHtml = rows.filter(r => r.impact > 1).map(row => {
    const negPct = row.neg ? +(Math.abs(row.neg.deltaVsBase)/maxAbs*BAR_PCT).toFixed(1) : 0;
    const posPct = row.pos ? +(Math.abs(row.pos.deltaVsBase)/maxAbs*BAR_PCT).toFixed(1) : 0;
    const negVal = row.neg ? fmtUsd(row.neg.deltaVsBase) : '';
    const posVal = row.pos ? (row.pos.deltaVsBase >= 0 ? '+' : '') + fmtUsd(row.pos.deltaVsBase) : '';
    const negIn = negPct >= THRESH, posIn = posPct >= THRESH;
    const negBar = row.neg ? \`<div class="tn-bar tn-neg" style="width:\${negPct}%">\${negIn ? \`<span class="tn-val">\${esc(negVal)}</span>\` : ''}</div>\` : '';
    const posBar = row.pos ? \`<div class="tn-bar tn-pos" style="width:\${posPct}%">\${posIn ? \`<span class="tn-val">\${esc(posVal)}</span>\` : ''}</div>\` : '';
    return \`<div class="tn-row">
      <div class="tn-label">\${esc(row.label)}</div>
      <div class="tn-bars">
        <div class="tn-half tn-left">
          \${!negIn && row.neg ? \`<span class="tn-val-out tn-neg-val">\${esc(negVal)}</span>\` : ''}
          \${negBar}
        </div>
        <div class="tn-spine" aria-hidden="true"></div>
        <div class="tn-half tn-right">
          \${posBar}
          \${!posIn && row.pos ? \`<span class="tn-val-out tn-pos-val">\${esc(posVal)}</span>\` : ''}
        </div>
      </div>
    </div>\`;
  }).join('');

  return \`<div class="tn-wrap" role="img" aria-label="Sensitivity tornado chart">
    <div class="tn-axis-labels">
      <span class="tn-axis-left">&larr; Negative impact (&darr; TIS Net)</span>
      <span class="tn-axis-right">Positive impact (&uarr; TIS Net) &rarr;</span>
    </div>
    \${rowHtml}
    <div class="tn-baseline-label">Base case: <b>\${fmtUsd(sens.baseNet)}</b> &nbsp;&middot;&nbsp; Bars show &Delta; vs base at &plusmn;10% of each input</div>
  </div>\`;
}

function renderSens(res) {
  if (!res.sensitivities) return '';
  const sens = res.sensitivities;
  const scenarios = [...sens.scenarios].sort((a,b) => Math.abs(b.deltaVsBase)-Math.abs(a.deltaVsBase));
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);

  const tableRows = [
    \`<tr class="sens-base"><td><b>Base case</b></td><td class="tc-amt"><b>\${fmtUsd(sens.baseNet)}</b></td><td class="tc-amt">&mdash;</td></tr>\`,
    ...scenarios.map(s => {
      const pct = Math.abs(s.deltaVsBase) / maxAbs;
      let dcls = s.deltaVsBase > 0 ? (pct > 0.6 ? 'sens-pos-strong' : 'sens-pos') : (pct > 0.6 ? 'sens-neg-strong' : (pct > 0.2 ? 'sens-neg' : ''));
      return \`<tr>
        <td>\${esc(s.lever)}</td>
        <td class="tc-amt">\${fmtUsd(s.tisNet)}</td>
        <td class="tc-amt \${dcls}">\${s.deltaVsBase >= 0 ? '+' : ''}\${fmtUsd(s.deltaVsBase)}</td>
      </tr>\`;
    }),
  ].join('');

  const fxNote = !sens.hasNairaLegs ? \`<div class="card-footer muted" style="border-top:1px solid var(--border)">FX: No NGN legs in this trade — FX sensitivity = $0 (all-USD ex-ship trade).</div>\` : '';

  return \`<section class="section" aria-labelledby="sens-heading">
  <h2 class="section-heading" id="sens-heading">Sensitivities (&plusmn;10%)</h2>
  <div class="card">
    \${renderTornado(sens)}
    <table class="cost-table" style="margin-top:16px">
      <thead><tr><th>Lever</th><th class="tc-amt">TIS Net</th><th class="tc-amt">&Delta; vs Base</th></tr></thead>
      <tbody>\${tableRows}</tbody>
    </table>
    \${fxNote}
  </div>
</section>\`;
}

// ── Master render ─────────────────────────────────────────────────────────────
function renderAll(trade, res, ladder) {
  renderKPIs(res);
  document.getElementById('sec-params').innerHTML       = renderParams(trade, res);
  document.getElementById('sec-cost').innerHTML         = renderCost(res);
  document.getElementById('sec-waterfall').innerHTML    = renderWaterfall(res);
  document.getElementById('sec-partner-hedge').innerHTML= renderPartnerHedge(trade, res);
  document.getElementById('sec-tax').innerHTML          = renderTax(res);
  document.getElementById('sec-ladder').innerHTML       = renderLadder(trade, res, ladder);
  document.getElementById('sec-sens').innerHTML         = renderSens(res);
}

// ── Error UI ──────────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('rpt-error');
  el.textContent = '⚠ ' + msg;
  el.hidden = false;
}
function clearError() {
  const el = document.getElementById('rpt-error');
  el.textContent = '';
  el.hidden = true;
}

// ── Recompute ─────────────────────────────────────────────────────────────────
let lastTrade = null, lastRes = null;

function recompute() {
  let trade;
  try { trade = collectTrade(); }
  catch(e) { showError('Input error: ' + e.message); return; }

  let res;
  try {
    res = TISEngine.computeTrade(trade);
  } catch(e) {
    showError(e.message);
    return;
  }

  // Sensitivities (re-run engine N times — fine for local use)
  try {
    const computeFn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
    res.sensitivities = TISEngine.runSensitivities(trade, computeFn, { fxMode: 'parallel' });
  } catch(e) {
    res.sensitivities = null;
  }

  // Pricing ladder
  let ladder = null;
  try {
    const computeFn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
    ladder = TISEngine.buildLadder(trade, computeFn, res);
  } catch(e) {
    ladder = null;
  }

  lastTrade = trade; lastRes = res;
  clearError();
  renderAll(trade, res, ladder);
}

// ── Input listeners ───────────────────────────────────────────────────────────
document.querySelectorAll('.ctrl-input').forEach(el => el.addEventListener('input', () => {
  updateLcDisplay();
  updateDepotVisibility();
  recompute();
}));
document.querySelectorAll('.ctrl-select').forEach(el => el.addEventListener('change', recompute));

['inp-bond','inp-equity'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateLcDisplay);
});

document.getElementById('inp-exship-pct').addEventListener('input', updateDepotVisibility);

// ── Toggle buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.ctrl-tog-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const on = btn.dataset.on === 'true';
    btn.dataset.on = (!on).toString();
    if (!on) {
      btn.classList.add('active');
      btn.innerHTML = '&#10003; ' + btn.textContent.replace(/^[×✓] /, '');
    } else {
      btn.classList.remove('active');
      btn.innerHTML = '&#215; ' + btn.textContent.replace(/^[×✓] /, '');
    }
    recompute();
  });
});

// ── Collapse panel ────────────────────────────────────────────────────────────
window.togglePanel = function(btn) {
  const grid = document.getElementById('ctrl-grid');
  const hidden = grid.hidden;
  grid.hidden = !hidden;
  btn.textContent = hidden ? '▲ Collapse' : '▼ Expand';
};

// ── Boot ──────────────────────────────────────────────────────────────────────
updateLcDisplay();
updateDepotVisibility();
recompute();

})();
</script>
</body>
</html>`;

// Write out
const outPath = path.join(OUT, 'TIS-interactive.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('HTML → ' + path.relative(ROOT, outPath));
