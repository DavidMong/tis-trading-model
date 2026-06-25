'use strict';

// ─── McKinsey-grade PDF report renderer ───────────────────────────────────────
// Produces the HTML document that Playwright rasterises to PDF (scripts/build-report-pdf.js).
//
// HARD RULE — this module renders, it does NOT compute. Every figure is read straight
// from the engine `result` object and formatted through report-renderer's shared `fmt`
// helpers (imported below, never re-implemented). No number is re-derived, rounded, or
// altered here; the field accessors mirror report-renderer.js exactly so the PDF and the
// dashboard show byte-identical values.
//
// The stylesheet (PDF_CSS) is intentionally separate from the dashboard @media print CSS:
// it is a print-only document design (A4, cover page, running header, numbered sections,
// hairline tables) with no screen/dashboard concerns.

const {
  esc, fmt, badge, signClass, usdSign, routeLabel, catLabel,
} = require('./report-renderer');
const { FONT_FACE_CSS } = require('./report-fonts');

// ─── Executive-KPI display formatting (PRESENTATION ONLY) ─────────────────────
// CLAUDE.md hard rule: this module renders, it never computes. These helpers
// re-FORMAT (round) the FOUR big Executive-Summary KPI displays into a clean
// executive form — $1.59M, 99.8%, $1,192/MT, 14.9%. They are used ONLY by the
// KPI band; every detail table keeps the full-precision shared fmt.* helpers, so
// no table figure changes value. The underlying numbers are untouched.
function kpiCompactUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '&mdash;';
  n = Number(n);
  const a = Math.abs(n), s = n < 0 ? '&minus;$' : '$';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (a >= 1e4) return s + Math.round(a / 1e3) + 'k';
  return s + Math.round(a).toLocaleString('en-US');
}
function kpiWholeUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '&mdash;';
  return '$' + Math.round(Number(n)).toLocaleString('en-US');
}
function kpiPct1(x) {
  if (x == null || !Number.isFinite(Number(x))) return '&mdash;';
  return (Number(x) * 100).toFixed(1).replace(/\.0$/, '') + '%';
}

// ─── Status pill — 4-state taxonomy (display remap only) ──────────────────────
// CLAUDE.md status-flag taxonomy: the engine/config schemas carry historical strings
// (CONFIRM / PLACEHOLDER / PENDING / EXAMPLE / RECOVERABLE …); they are remapped to the
// four display states at render time (here). This remaps LABELS/STYLES only — the
// underlying status strings on the result are untouched.
//   no badge   → OK / FIXED            (verified vs statute or contract)
//   INDICATIVE → INDICATIVE/PLACEHOLDER/PENDING/EXAMPLE/SUGGESTED  (reasonable estimate)
//   ⚠ UNVERIFIED → CONFIRM/UNVERIFIED   (needs checking before live trading)
//   ✓ OK       → RECOVERABLE            (cash-flow timing only)
function pill(status) {
  if (!status) return '';
  const u = String(status).toUpperCase();
  if (u === 'OK' || u.includes('FIXED')) return '';
  if (u.includes('RECOVERABLE')) return `<span class="pill pill-ok" title="${esc(status)}">&#10003; OK</span>`;
  if (u.includes('UNVERIFIED') || u.includes('CONFIRM')) return `<span class="pill pill-unv" title="${esc(status)}">&#9888; Unverified</span>`;
  // everything else estimate-ish → INDICATIVE
  return `<span class="pill pill-ind" title="${esc(status)}">Indicative</span>`;
}

// Short, deterministic title — strips the parenthetical fixture/dummy caveat (mirrors
// report-renderer's headerSection so the cover title reads the same as the dashboard).
function shortTitle(name) {
  return String(name || '').replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample|EXAMPLE)[^)]*\)/gi, '').trim();
}
function isFixtureName(name) {
  return /REGRESSION|FIXTURE|dummy|EXAMPLE/i.test(String(name || ''));
}

// ─── Dedicated print stylesheet ───────────────────────────────────────────────
const PDF_CSS = `
${FONT_FACE_CSS}
/* ── Page geometry — cover (page 1) is margin-free so the Playwright running
      header/footer have no margin box to draw into and stay off the cover. ── */
@page { size: A4; margin: 20mm 18mm 16mm 18mm; }
@page :first { margin: 0; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --ink:    #242331;   /* body */
  --slate:  #717c89;   /* secondary */
  --hair:   #d7dbe0;   /* hairline rule */
  --hair-2: #eceef1;   /* lightest separators / row tint */
  --shade:  #f4f6f8;   /* subtle table-header shade */
  --accent: #d41d1d;   /* BRAND ACCENT ONLY — never loss */
  --pos:    #15803d;   /* positive / active */
  --loss:   #991b1b;   /* genuine P&L loss / error */
  --amber-bg: #fef3c7; --amber-tx: #92400e;   /* INDICATIVE */
  --unv-bg:   #fed7aa; --unv-tx:   #7c2d12;   /* ⚠ UNVERIFIED */
  --ok-bg:    #dcfce7; --ok-tx:    #166534;   /* ✓ OK / recoverable */
}

html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: 'TIS Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: var(--ink);
  font-size: 10.5pt;
  line-height: 1.5;
  font-feature-settings: 'tnum' 1, 'lnum' 1;   /* tabular, lining figures — all financial columns align */
}

/* ── Type scale ── */
h1, h2, h3 { font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
/* Editorial serif for the cover title + numbered section headers (display only). */
.serif { font-family: 'TIS Serif', Georgia, 'Times New Roman', serif; }
.muted  { color: var(--slate); }
.tnum   { font-variant-numeric: tabular-nums; }

/* ════════ COVER (page 1) ════════ */
.cover {
  box-sizing: border-box;
  min-height: 297mm;
  padding: 56mm 30mm 28mm 30mm;
  display: flex;
  flex-direction: column;
  break-after: page;
}
.cover-eyebrow {
  font-size: 9.5pt; font-weight: 600; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--slate);
}
.cover-rule { height: 2.5px; width: 64px; background: var(--accent); margin: 16px 0 30px; }
.cover-title {
  font-family: 'TIS Serif', Georgia, 'Times New Roman', serif;
  font-size: 31pt; font-weight: 600; letter-spacing: -0.015em; line-height: 1.06;
}
.cover-tradename { font-size: 15pt; font-weight: 400; color: var(--slate); margin-top: 12px; max-width: 150mm; }
.cover-id {
  font-size: 10pt; font-weight: 600; letter-spacing: 0.04em; color: var(--ink);
  margin-top: 22px; font-variant-numeric: tabular-nums;
}
.cover-fixture {
  display: inline-block; margin-left: 10px; padding: 2px 8px; font-size: 8pt; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--amber-tx);
  background: var(--amber-bg); border-radius: 3px; vertical-align: middle;
}
.cover-spacer { flex: 1 1 auto; }
/* Restrained mid-page standfirst — anchors the cover so the empty centre reads
   deliberate. Roman serif with a short brand tick (red = cover accent, allowed). */
.cover-statement {
  display: flex; align-items: baseline; gap: 13px;
  font-family: 'TIS Serif', Georgia, 'Times New Roman', serif;
  font-size: 12.5pt; color: var(--slate); letter-spacing: 0.005em;
}
.cover-statement::before {
  content: ""; flex: 0 0 auto; width: 20px; height: 2px;
  background: var(--accent); transform: translateY(-3px);
}
.cover-parties { border-top: 1px solid var(--hair); padding-top: 22px; display: flex; gap: 0; }
.cover-party { flex: 1; }
.cover-party-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--slate); }
.cover-party-value { font-size: 12pt; font-weight: 500; margin-top: 5px; }
.cover-foot { margin-top: 30px; display: flex; justify-content: space-between; align-items: baseline; font-size: 9.5pt; color: var(--slate); }
.cover-confidential { font-weight: 600; color: var(--ink); letter-spacing: 0.02em; }

/* ════════ FLOW PAGES (page 2+) ════════ */
.body { padding-top: 2mm; }

.section { break-inside: auto; margin-bottom: 16px; }
.section + .section { margin-top: 22px; }
.section-head {
  display: flex; align-items: baseline; gap: 12px;
  border-bottom: 1.5px solid var(--ink);
  padding-bottom: 7px; margin-bottom: 14px;
  break-after: avoid;
}
.section-num {
  font-size: 11pt; font-weight: 700; color: var(--accent);
  font-variant-numeric: tabular-nums; min-width: 16px;
}
.section-title {
  font-family: 'TIS Serif', Georgia, 'Times New Roman', serif;
  font-size: 15.5pt; font-weight: 600; letter-spacing: -0.005em;
}
.section-kicker { margin-left: auto; font-size: 9pt; font-weight: 400; color: var(--slate); letter-spacing: 0; }
.section-intro { font-size: 10pt; color: var(--slate); margin: -4px 0 14px; max-width: 165mm; }
h3.block-head {
  font-size: 11pt; font-weight: 600; color: var(--ink);
  margin: 18px 0 8px; break-after: avoid;
}
h3.block-head:first-child { margin-top: 4px; }

/* ── KPI band ── */
.kpi-band { display: flex; gap: 0; border: 1px solid var(--hair); border-radius: 6px; overflow: hidden; break-inside: avoid; }
.kpi { flex: 1; padding: 16px 16px 14px; border-left: 1px solid var(--hair); }
.kpi:first-child { border-left: none; }
.kpi-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate); }
.kpi-value { font-size: 21pt; font-weight: 600; letter-spacing: -0.02em; margin-top: 7px; font-variant-numeric: tabular-nums; line-height: 1.05; }
.kpi-value.is-loss { color: var(--loss); }
.kpi-value.is-pos  { color: var(--ink); }
.kpi-note { font-size: 8.5pt; color: var(--slate); margin-top: 6px; line-height: 1.35; }

/* ── Deal-at-a-glance strip ── */
.glance { display: flex; flex-wrap: wrap; gap: 0; margin-top: 16px; border-top: 1px solid var(--hair); }
.glance-item { width: 25%; padding: 11px 4px 11px 0; }
.glance-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--slate); }
.glance-value { font-size: 11pt; font-weight: 500; margin-top: 3px; font-variant-numeric: tabular-nums; }
.glance-sub   { font-size: 8pt; color: var(--slate); margin-top: 2px; }

/* ── Tables — minimal, hairline rows, decimal-aligned numerics ── */
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
thead { display: table-header-group; }   /* repeat header across page breaks */
th {
  text-align: left; font-size: 8pt; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--slate);
  background: var(--shade);
  padding: 7px 9px; border-bottom: 1px solid var(--hair);
}
td { padding: 6px 9px; border-bottom: 1px solid var(--hair-2); vertical-align: top; }
tr { break-inside: avoid; }
.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tbl-id { color: var(--slate); font-variant-numeric: tabular-nums; width: 28px; }
.cat { color: var(--slate); font-size: 8.5pt; }
tr.row-total td { border-top: 1.5px solid var(--ink); border-bottom: none; font-weight: 600; padding-top: 9px; }
tr.row-recoverable td { background: #fafbfc; }
tr.row-current td { background: #fbfbf6; font-weight: 600; }
.pos  { color: var(--pos); }
.neg  { color: var(--slate); }   /* structural negatives are slate, never alarm-red */
.loss { color: var(--loss); }
.totline { font-weight: 600; }

/* ── Pills (status badges) ── */
.pill {
  display: inline-block; padding: 1.5px 7px; border-radius: 10px;
  font-size: 7.5pt; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap;
  vertical-align: middle;
}
.pill-ind { background: var(--amber-bg); color: var(--amber-tx); }
.pill-unv { background: var(--unv-bg);   color: var(--unv-tx); }
.pill-ok  { background: var(--ok-bg);    color: var(--ok-tx); }

/* ── Definition lists (key/value blocks) ── */
.dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 18px; font-size: 9.5pt; align-items: baseline; }
.dl dt { color: var(--slate); }
.dl dd { text-align: right; font-variant-numeric: tabular-nums; }
.dl dd b { font-weight: 600; }

/* ── Two-column layout ── */
.cols { display: flex; gap: 26px; align-items: flex-start; }
.col { flex: 1; min-width: 0; }

/* ── Notes / callouts ── */
.note {
  font-size: 8.5pt; color: var(--slate); line-height: 1.45;
  margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--hair-2);
}
.legalref { font-size: 8pt; color: var(--slate); font-style: italic; }
.callout {
  border-left: 2.5px solid var(--hair); padding: 10px 0 10px 14px; margin-top: 12px;
  break-inside: avoid;
}
.callout-title { font-size: 9.5pt; font-weight: 600; margin-bottom: 6px; }
.callout.is-warn { border-left-color: var(--amber-tx); }
.callout.is-ok   { border-left-color: var(--pos); }

/* ── Waterfall (horizontal step bars) ── */
.wf { display: flex; gap: 8px; align-items: stretch; break-inside: avoid; margin: 4px 0 2px; }
.wf-node { flex: 1; border: 1px solid var(--hair); border-radius: 5px; padding: 11px 12px; position: relative; }
.wf-node.is-terminal { border-color: var(--ink); border-width: 1.5px; }
.wf-node.is-loss { border-color: var(--loss); }
.wf-op { align-self: center; color: var(--slate); font-size: 13pt; font-weight: 400; flex: 0 0 auto; }
.wf-label { font-size: 8pt; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--slate); }
.wf-amt { font-size: 13.5pt; font-weight: 600; margin-top: 5px; font-variant-numeric: tabular-nums; }
.wf-amt.is-loss { color: var(--loss); }
.wf-sub { font-size: 8pt; color: var(--slate); margin-top: 4px; line-height: 1.3; }
.reconcile { font-size: 9pt; color: var(--slate); margin-top: 12px; padding-top: 9px; border-top: 1px solid var(--hair-2); }
.reconcile b { color: var(--ink); font-variant-numeric: tabular-nums; }
.ok-mark { color: var(--pos); font-weight: 600; }
.warn-mark { color: var(--loss); font-weight: 600; }

/* ── Toggle chip ── */
.toggle { display: inline-block; font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; padding: 2px 9px; border-radius: 3px; }
.toggle.on  { background: var(--ok-bg);  color: var(--ok-tx); }
.toggle.off { background: var(--hair-2); color: var(--slate); }

/* ── Legend (status taxonomy) ── */
.legend { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 26px; margin-top: 6px; }
.legend-row { display: flex; gap: 10px; align-items: baseline; font-size: 9pt; }
.legend-row .desc { color: var(--slate); }
ul.openitems { list-style: none; font-size: 9.5pt; margin-top: 4px; }
ul.openitems li { padding: 4px 0; border-bottom: 1px solid var(--hair-2); display: flex; gap: 10px; align-items: baseline; }
ul.openitems li .what { font-weight: 500; }
ul.openitems li .why { color: var(--slate); font-size: 8.5pt; }

.disclaimer { font-size: 8pt; color: var(--slate); line-height: 1.5; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--hair); }
`;

// ─── Section renderers ────────────────────────────────────────────────────────

function coverPage(trade, res, generatedAt) {
  const parties = res.meta.parties || {};
  const title = shortTitle(res.meta.tradeName);
  const fixture = isFixtureName(res.meta.tradeName)
    ? `<span class="cover-fixture">Illustrative</span>` : '';
  const party = (label, val) => `
        <div class="cover-party">
          <div class="cover-party-label">${label}</div>
          <div class="cover-party-value">${val ? esc(val) : '&mdash;'}</div>
        </div>`;
  return `
<section class="cover">
  <div class="cover-eyebrow">TIS Global Trading</div>
  <div class="cover-rule"></div>
  <h1 class="cover-title">Commercial Trade Analysis</h1>
  <div class="cover-tradename">${esc(title)}${fixture}</div>
  <div class="cover-id">${esc(res.meta.tradeId)}</div>
  <div class="cover-spacer"></div>
  <div class="cover-statement">Prepared for internal commercial review</div>
  <div class="cover-spacer"></div>
  <div class="cover-parties">
    ${party('Equity Partner', parties.partner)}
    ${party('Supplier', parties.supplier)}
    ${party('Inspector', parties.inspector)}
  </div>
  <div class="cover-foot">
    <span class="cover-confidential">TIS Global Trading &mdash; Confidential</span>
    <span>${esc(generatedAt)}</span>
  </div>
</section>`;
}

function executiveSummary(trade, res) {
  const isTisFunded = res.equityProvider === 'TIS';
  const tisNet      = res.profit.tisNetProfit;
  // The report runs through computeTrade (like the dashboard), which emits the canonical
  // annualised return on the BANK LC MOBILISED (RULE 2026-06-23) natively — read it directly.
  const annRet      = res.tisAnnualisedReturn;
  const annBase     = res.annualReturnBaseLabel || 'bank LC mobilised';
  const lockup      = res.financing.capitalLockupDays;
  const exShipLanded= res.price.exShipLandedPerMT ?? res.price.landedCostPerMT;
  const exShipPrice = res.price.exShipPricePerMT;
  const marginPct   = (exShipPrice && exShipLanded) ? (exShipPrice - exShipLanded) / exShipPrice : null;
  const f           = res.financing;

  const netNote = isTisFunded ? 'self-funded &middot; no partner split' : 'after partner profit split';
  // The FOUR headline KPI displays are rounded to a clean executive form (presentation
  // only — kpiCompactUsd / kpiWholeUsd / kpiPct1). Full precision is retained in every
  // detail table (waterfall, cost build-up, ladder) which use the shared fmt.* helpers.
  const kpis = [
    {
      label: 'TIS Net Profit',
      value: kpiCompactUsd(tisNet),
      cls: tisNet < 0 ? 'is-loss' : 'is-pos',
      note: netNote,
    },
    {
      label: 'Annualised Return',
      value: annRet != null ? kpiPct1(annRet) : '&mdash;',
      cls: 'is-pos',
      note: `on ${esc(annBase)} &middot; ${lockup}d capital lockup`,
    },
    {
      label: 'Landed Cost / MT',
      value: kpiWholeUsd(exShipLanded) + '<span style="font-size:11pt;color:var(--slate)">/MT</span>',
      cls: 'is-pos',
      note: 'all-in, excl. recoverable VAT',
    },
    {
      label: 'Ex-Ship Margin',
      value: marginPct != null ? kpiPct1(marginPct) : '&mdash;',
      cls: 'is-pos',
      note: exShipPrice ? `${fmt.usd(exShipPrice)}/MT sell price` : 'sell price pending',
    },
  ];

  // Red is reserved for the cover/section accent per the colour-semantics palette —
  // no red rule under the TIS Net Profit figure (or any KPI).
  const kpiHtml = kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.cls}">${k.value}</div>
      <div class="kpi-note">${k.note}</div>
    </div>`).join('');

  // Deal-at-a-glance — a compact factual strip (not re-computed; all read from res).
  const fxIn  = trade.fx || {};
  const nafem = fxIn.nafem    ? (fxIn.nafem.override    ?? fxIn.nafem.value)    : null;
  const splitLabel = `${fmt.pct(1 - res.profit.profitSharePct)} TIS`;
  const glance = [
    { label: 'Flow',            value: esc(res.meta.flow) },
    { label: 'Delivered',       value: fmt.mt(res.meta.deliveredQty, 0) },
    { label: 'Unit FOB',        value: fmt.usd(res.unitFob) + '/MT', sub: 'ICE + premium' },
    { label: 'Profit Split',    value: splitLabel, sub: isTisFunded ? 'self-funded' : `partner ${fmt.pct(res.profit.profitSharePct)} cash` },
    { label: 'Partner Funding', value: fmt.usd(f.partnerFunding) },
    { label: 'Bank LC',         value: fmt.usd(f.lc), sub: `${fmt.pct(f.pct.lcPct)} of cargo` },
    { label: 'Credit Rate',     value: fmt.pct(f.creditRate), sub: `${f.financingDays}d financing` },
    { label: 'FX NAFEM',        value: nafem != null ? fmt.num(nafem, 0) + ' &#8358;/$' : 'n/a', sub: nafem != null ? 'drives P&amp;L' : 'all-USD' },
  ];
  const glanceHtml = glance.map(g => `
    <div class="glance-item">
      <div class="glance-label">${g.label}</div>
      <div class="glance-value">${g.value}</div>
      ${g.sub ? `<div class="glance-sub">${g.sub}</div>` : ''}
    </div>`).join('');

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">1</span>
    <span class="section-title">Executive Summary</span>
    <span class="section-kicker">Headline economics for ${esc(res.meta.tradeId)}</span>
  </div>
  <div class="kpi-band">${kpiHtml}</div>
  <div class="glance">${glanceHtml}</div>
</section>`;
}

function costBuildup(trade, res) {
  const cost = res.cost;
  const exShipLanded = cost.exShipLandedPerMT ?? cost.landedCostPerMT;

  // Suppress the storage lines (throughput / rental / evaporation / tank insurance)
  // when there is no depot leg — they are structurally $0.00 with nothing to show.
  // When a depot leg IS present they carry real cost and are always kept. Display
  // only: the engine's all-in total is unchanged (these rows sum to 0 when hidden).
  const hasDepot = !!(res.channels && res.channels.depotPct > 0);
  const visibleLines = cost.lines.filter(
    l => hasDepot || !(l.category === 'storage' && Number(l.amountUsd) === 0)
  );

  const costRows = visibleLines.map(l => {
    const flag = l.recoverable
      ? `<span class="pill pill-ok" title="Recoverable input VAT">&#10003; OK</span>`
      : pill(l.status);
    return `
      <tr class="${l.recoverable ? 'row-recoverable' : ''}">
        <td class="tbl-id">${l.id}</td>
        <td>${esc(l.label)}</td>
        <td class="cat">${esc(catLabel(l.category))}</td>
        <td class="r">${fmt.usd(l.amountUsd)}</td>
        <td>${flag}</td>
      </tr>`;
  }).join('');

  const costTable = `
    <h3 class="block-head">Cost build-up &mdash; ${fmt.mt(res.meta.deliveredQty, 0)} delivered</h3>
    <table aria-label="Cost build-up">
      <thead><tr><th>#</th><th>Line item</th><th>Basis</th><th class="r">Amount (USD)</th><th>Flag</th></tr></thead>
      <tbody>
        ${costRows}
        <tr class="row-total">
          <td></td><td>All-in landed cost</td>
          <td class="cat">excl. recoverable VAT</td>
          <td class="r">${fmt.usd(cost.allInCost)}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="note">
      Freight base: TC hire ${fmt.usd(cost.freight.tcHire)} + demurrage ${fmt.usd(cost.freight.demurrage)}
      = <b>${fmt.usd(cost.freight.freightBase)}</b>.
      Landed cost <b>${fmt.usd(exShipLanded)}/MT</b>.
      Services-VAT base: ${cost.servicesBucket.composition.map(c => `${esc(c.label)} (${fmt.usd(c.amount)})`).join(', ')}
      = ${fmt.usd(cost.servicesBucket.sum)}.
    </div>`;

  // Tax block
  const tx = res.tax;
  const rv = cost.recoverableVat;
  const sc = tx.surcharge;
  const taxRows = (tx.items || []).map(t => `
    <tr>
      <td class="tbl-id">${t.id}</td>
      <td>${esc(t.label)}<div class="legalref">${esc(t.legalRef || '')}</div></td>
      <td class="r">${fmt.usd(t.amountUsd)}</td>
      <td>${pill(t.status)}</td>
    </tr>`).join('');

  const vatBlock = `
    <div class="callout is-ok">
      <div class="callout-title">&#10003; Recoverable VAT &mdash; cash-flow timing only (NTA 2025 s.155(4))</div>
      <div class="dl">
        ${rv.lines.map(l => `<dt>Line ${l.id} ${esc(l.label)}</dt><dd>${fmt.usd(l.amount)}</dd>`).join('')}
        <dt>Gross input VAT</dt><dd>${fmt.usd(rv.grossRecoverable)}</dd>
        <dt>Taxable-supply proportion</dt><dd>${fmt.pct(rv.taxableSupplyProportion)}</dd>
        <dt><b>Recoverable (reclaim / WC timing)</b></dt><dd><b>${fmt.usd(rv.recoverable)}</b></dd>
        ${rv.irrecoverable > 0 ? `<dt>Irrecoverable &rarr; added to landed cost</dt><dd>${fmt.usd(rv.irrecoverable)}</dd>` : ''}
      </div>
      <div class="note" style="border:0;padding:0;margin-top:7px">Does not affect profit &mdash; working-capital timing item only.</div>
    </div>`;

  const surchargeBlock = `
    <div class="callout is-warn">
      <div class="callout-title">&#9888; Fossil-fuel surcharge (NTA 2025 s.158&ndash;161) ${pill('PENDING')}</div>
      <div class="dl">
        <dt>Status</dt><dd>${sc.enabled ? '<b>ENABLED</b>' : 'Off (default &mdash; not gazetted)'}</dd>
        <dt>Rate</dt><dd>${fmt.pct(sc.rate)} of retail price</dd>
        <dt>Incidence</dt><dd>${esc(sc.incidence)}</dd>
        <dt>Full statutory amount</dt><dd>${fmt.usd(sc.amountUsd)}</dd>
        <dt>TIS-borne (retained tonnes)</dt><dd>${fmt.usd(sc.tisBorneUsd)}</dd>
      </div>
    </div>`;

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">2</span>
    <span class="section-title">Cost Build-Up</span>
    <span class="section-kicker">all figures USD &middot; config-driven cost/tax lines</span>
  </div>
  ${costTable}
  <h3 class="block-head">Tax block</h3>
  <table aria-label="Tax items">
    <thead><tr><th>#</th><th>Item &amp; legal reference</th><th class="r">Amount (USD)</th><th>Status</th></tr></thead>
    <tbody>${taxRows}</tbody>
  </table>
  <div class="cols" style="margin-top:14px">
    <div class="col">${vatBlock}</div>
    <div class="col">${surchargeBlock}</div>
  </div>
</section>`;
}

function profitWaterfall(res) {
  const p = res.profit;
  const isTisFunded = res.equityProvider === 'TIS';

  const nodes = isTisFunded
    ? [
        { label: 'Revenue',        amt: res.revenue.combinedUSD, sub: 'combined channels', op: '' },
        { label: 'All-in Cost',    amt: res.cost.allInCost,      sub: 'incl. irrecoverable VAT', op: '&minus;' },
        { label: 'TIS Net Profit', amt: p.tisNetProfit, sub: 'self-funded &mdash; no partner', op: '=', terminal: true },
      ]
    : [
        { label: 'Standalone Profit', amt: p.standaloneProfit, sub: 'TIS as 100% owner', op: '' },
        { label: 'Margin Foregone',   amt: p.marginForegone,   sub: `${fmt.mt(res.quantities.economic.partnerTonnes, 2)} partner tonnes`, op: '&minus;' },
        { label: 'Adjusted Profit',   amt: p.adjustedProfit,   sub: 'TIS retained-tonnes share', op: '=' },
        { label: 'Partner Cash Share',amt: p.partnerCashProfitShare, sub: `${fmt.pct(p.profitSharePct)} of adjusted`, op: '&minus;' },
        { label: 'TIS Net Profit',    amt: p.tisNetProfit, sub: `${fmt.pct(1 - p.profitSharePct)} of adjusted`, op: '=', terminal: true },
      ];

  const wfHtml = nodes.map((n, i) => {
    const loss = n.terminal && n.amt < 0;
    const op = i > 0 ? `<div class="wf-op">${n.op}</div>` : '';
    // The operator is shown ONCE, between cards (wf-op); no in-card prefix on the
    // amount — that doubled "&minus;"/"=" read as ambiguous above the figure.
    return `${op}
      <div class="wf-node ${n.terminal ? 'is-terminal' : ''} ${loss ? 'is-loss' : ''}">
        <div class="wf-label">${n.label}</div>
        <div class="wf-amt ${loss ? 'is-loss' : ''}">${fmt.usd(n.amt)}</div>
        <div class="wf-sub">${n.sub}</div>
      </div>`;
  }).join('');

  const hedges = res.hedges || {};
  const hedgeNote = (hedges.iceHedgeNetImpact || hedges.fxHedgeNetImpact)
    ? `ICE hedge impact <b>${usdSign(hedges.iceHedgeNetImpact)}</b> &middot; FX hedge <b>${usdSign(hedges.fxHedgeNetImpact)}</b>. ` : '';

  const reconcile = isTisFunded
    ? `${hedgeNote}Revenue &minus; cost = TIS net: <b>${fmt.usd(res.revenue.combinedUSD)} &minus; ${fmt.usd(res.cost.allInCost)} = ${fmt.usd(p.tisNetProfit)}</b>.`
    : `${hedgeNote}Identity: marginForegone + adjusted = standalone &nbsp;
       <b>${fmt.usd(p.marginForegone)} + ${fmt.usd(p.adjustedProfit)} = ${fmt.usd(p.standaloneProfit)}</b>
       <span class="${p.reconciliation.ok ? 'ok-mark' : 'warn-mark'}">${p.reconciliation.ok ? '&#10003; OK' : '&#9888; MISMATCH'}</span>`;

  // Partner deliverables / equity structure
  const pd = res.partnerDelivers || {};
  const f  = res.financing;
  const partnerBlock = isTisFunded ? `
    <h3 class="block-head">Equity structure</h3>
    <div class="dl">
      <dt>Cargo value</dt><dd>${fmt.usd(res.cargoValue)}</dd>
      <dt>Partner funding (self)</dt><dd>${fmt.usd(f.partnerFunding)}</dd>
      <dt><b>Standalone = adjusted = TIS net</b></dt><dd><b>${fmt.usd(p.tisNetProfit)}</b></dd>
    </div>` : `
    <h3 class="block-head">Partner deliverables &mdash; what TIS delivers</h3>
    <div class="cols">
      <div class="col">
        <div class="glance-label" style="margin-bottom:6px">(1) Product received</div>
        <div class="dl">
          <dt>Tonnes (economic)</dt><dd>${fmt.mt(pd.productReceived ? pd.productReceived.tonnes : null)}</dd>
          <dt>Valued at ex-ship landed</dt><dd>${fmt.usd(pd.productReceived ? (pd.productReceived.valuedAtExShipLandedCost ?? pd.productReceived.valuedAtLandedCost) : null)}</dd>
          <dt><b>= Principal at par</b></dt><dd><b>${fmt.usd(f.partnerFunding)}</b></dd>
        </div>
      </div>
      <div class="col">
        <div class="glance-label" style="margin-bottom:6px">(2) Cash received</div>
        <div class="dl">
          <dt>Profit share (${fmt.pct(res.profit.profitSharePct)})</dt><dd>${fmt.usd(pd.cashReceived ? pd.cashReceived.profitShare : null)}</dd>
          ${pd.cashReceived && pd.cashReceived.principalCashPortion > 0 ? `<dt>Principal (cash portion)</dt><dd>${fmt.usd(pd.cashReceived.principalCashPortion)}</dd>` : ''}
          <dt>Settlement true-up</dt><dd>${fmt.usd(pd.cashReceived ? pd.cashReceived.settlementTrueUp : null)}</dd>
        </div>
      </div>
    </div>
    ${pd.principalTie ? `<div class="note">Principal tie-out: owed <b>${fmt.usd(f.partnerFunding)}</b> = product <b>${fmt.usd(pd.principalTie.returnedProductValue)}</b> + cash <b>${fmt.usd(pd.principalTie.returnedCash)}</b> <span class="${pd.principalTie.ok ? 'ok-mark' : 'warn-mark'}">${pd.principalTie.ok ? '&#10003; OK' : '&#9888; MISMATCH'}</span></div>` : ''}`;

  // Sensitivities — compact top-levers table (read from res.sensitivities; not recomputed).
  let sensBlock = '';
  const sens = res.sensitivities;
  if (sens && sens.scenarios && sens.scenarios.length) {
    const sorted = [...sens.scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase)).slice(0, 6);
    const rows = sorted.map(s => {
      const sign = s.deltaVsBase >= 0 ? '+' : '';
      const cls  = s.deltaVsBase >= 0 ? 'pos' : 'neg';
      return `<tr><td>${esc(s.lever)}</td><td class="r">${fmt.usd(s.tisNet)}</td><td class="r ${cls}">${sign}${fmt.usd(s.deltaVsBase)}</td></tr>`;
    }).join('');
    sensBlock = `
    <h3 class="block-head">Sensitivities &mdash; TIS net at &plusmn;10% (top drivers)</h3>
    <table aria-label="Sensitivities">
      <thead><tr><th>Lever</th><th class="r">TIS Net</th><th class="r">&Delta; vs base</th></tr></thead>
      <tbody>
        <tr class="row-total"><td>Base case</td><td class="r">${fmt.usd(sens.baseNet)}</td><td class="r muted">&mdash;</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="note">FX: ${esc(sens.fx.note)}${sens.depotDownside ? ` &middot; Depot sold-at-cost downside: TIS net ${fmt.usd(sens.depotDownside.tisNet)} (&Delta; ${fmt.usd(sens.depotDownside.deltaVsBase)})` : ''}</div>`;
  }

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">3</span>
    <span class="section-title">Profit Waterfall</span>
    <span class="section-kicker">${isTisFunded ? 'TIS-funded &mdash; 3-node' : 'standalone &harr; adjusted reconciliation'}</span>
  </div>
  <div class="wf">${wfHtml}</div>
  <div class="reconcile">${reconcile}</div>
  ${partnerBlock}
  ${sensBlock}
</section>`;
}

function pricingLadder(ladder, res) {
  const ch = (res && res.channels) || null;
  const hasExShip = ch ? ch.exShipPct > 0 : true;
  const depotApplicable = !!(ladder.depot && ladder.depot.applicable && ladder.depot.tiers && ladder.depot.tiers.length);
  const bothLadders = hasExShip && depotApplicable;
  const depotNote = depotApplicable ? null : (ladder.depot && ladder.depot.note);

  let exShipBlock = '';
  const ex = ladder.exShip;
  const current = ex && ex.current;
  if (hasExShip && ex && ex.tiers && ex.tiers.length) {
    const rows = ex.tiers.map(t => {
      const isCurrent = current && Math.abs(t.pricePerMT - current.pricePerMT) < 0.01;
      return `
      <tr class="${isCurrent ? 'row-current' : ''}">
        <td>${isCurrent ? '&#9658; ' : ''}${esc(t.name)}</td>
        <td class="r">${fmt.pct(t.marginOfSell)}</td>
        <td class="r"><b>${fmt.usd(t.pricePerMT)}</b></td>
        <td class="r">${fmt.usd(t.spreadPerMT)}</td>
        <td class="r">${fmt.pct(t.markupPctOnCost)}</td>
        <td class="r ${t.tisNetProfit >= 0 ? 'pos' : 'loss'}">${fmt.usd(t.tisNetProfit)}</td>
      </tr>`;
    }).join('');
    exShipBlock = `
    ${bothLadders ? '<h3 class="block-head">Ex-ship $/MT ladder</h3>' : ''}
    <table aria-label="Ex-ship pricing ladder">
      <thead><tr><th>Tier</th><th class="r">Margin % sell</th><th class="r">Price $/MT</th><th class="r">Spread $/MT</th><th class="r">Markup % cost</th><th class="r">TIS Net</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${current ? `<div class="note"><b>Trader's price:</b> ${fmt.usd(current.pricePerMT)}/MT [${esc(current.status)}] &middot; margin ${fmt.pct(current.marginPctOfSell)} of sell &middot; markup ${fmt.pct(current.markupPctOnCost)} on cost &middot; nearest tier <b>${esc(current.nearestTier)}</b>.</div>` : ''}`;
  }

  let depotBlock = '';
  if (depotApplicable) {
    const curDepot = (res && res.price) ? res.price.depotPriceNgnPerL : null;
    const depotRows = ladder.depot.tiers.map(t => {
      const isCur = curDepot != null && isFinite(curDepot) && Math.abs(t.priceNgnPerL - curDepot) < 0.005;
      const net = (t.tisNetProfit == null) ? '<span class="muted">pending</span>'
        : `<span class="${t.tisNetProfit >= 0 ? 'pos' : 'loss'}">${fmt.usd(t.tisNetProfit)}</span>`;
      return `
      <tr class="${isCur ? 'row-current' : ''}">
        <td>${isCur ? '&#9658; ' : ''}${esc(t.name)}</td>
        <td class="r"><b>&#8358;${fmt.num(t.priceNgnPerL, 2)}</b></td>
        <td class="r">&#8358;${fmt.num(t.spreadNgnPerL, 0)}</td>
        <td class="r">${fmt.pct(t.marginPctOfSell)}</td>
        <td class="r">${fmt.pct(t.markupPctOnCost)}</td>
        <td class="r">${net}</td>
      </tr>`;
    }).join('');
    depotBlock = `
    <h3 class="block-head">Depot &#8358;/L ladder</h3>
    <table aria-label="Depot pricing ladder">
      <thead><tr><th>Tier</th><th class="r">Price &#8358;/L</th><th class="r">Spread &#8358;/L</th><th class="r">Margin %</th><th class="r">Markup % cost</th><th class="r">TIS Net</th></tr></thead>
      <tbody>${depotRows}</tbody>
    </table>`;
  }

  let compBlock = '';
  const cmp = ladder.comparison;
  if (bothLadders && cmp && cmp.applicable && cmp.exShip && cmp.depot) {
    const winner = cmp.depotEarnsMoreAbsolute ? 'Depot' : 'Ex-ship';
    compBlock = `<div class="note"><b>Cross-leg spread</b> (common &#8358;/L): ex-ship <b>${esc(cmp.exShip.tier)}</b> ${fmt.num(cmp.exShip.spreadNgnPerL, 1)} vs depot <b>${esc(cmp.depot.tier)}</b> ${fmt.num(cmp.depot.spreadNgnPerL, 1)} &mdash; <b>${winner}</b> earns the larger absolute spread.${cmp.rationale ? ` ${esc(cmp.rationale)}` : ''}</div>`;
  }

  const footerParts = [];
  if (hasExShip && ex) footerParts.push(`Ex-ship landed <b>${fmt.usd(ex.costBasePerMT)}/MT</b> (excl. storage)`);
  if (depotApplicable && ladder.depot.costBaseNgnPerL != null) footerParts.push(`Depot landed <b>${fmt.num(ladder.depot.costBaseNgnPerL, 2)} &#8358;/L</b>`);
  if (depotNote) footerParts.push(esc(depotNote));

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">4</span>
    <span class="section-title">Pricing Ladder</span>
    <span class="section-kicker">advisory only &mdash; trader sets final price</span>
  </div>
  <div class="section-intro">&#9888; ${esc(ladder.disclaimer)}</div>
  ${exShipBlock}
  ${depotBlock}
  ${compBlock}
  ${footerParts.length ? `<div class="note">${footerParts.join(' &middot; ')}</div>` : ''}
</section>`;
}

function fxAndSettlement(trade, res) {
  const fxIn  = trade.fx || {};
  const nafem    = fxIn.nafem    ? (fxIn.nafem.override    ?? fxIn.nafem.value)    : null;
  const parallel = fxIn.parallel ? (fxIn.parallel.override ?? fxIn.parallel.value) : null;
  const fx = res.fx || null;

  const iceMark  = trade.market && trade.market.ice ? trade.market.ice.value : null;
  const iceFinal = trade.market && trade.market.ice ? trade.market.ice.final : null;

  // FX rate / role block — NAFEM drives P&L, parallel is reference-only (RULE 1).
  const rateBlock = `
    <h3 class="block-head">Exchange rates &mdash; role-labelled</h3>
    <div class="dl">
      <dt>NAFEM &mdash; drives P&amp;L (settlement)</dt><dd>${nafem != null ? fmt.num(nafem, 0) + ' &#8358;/$' : 'n/a'} ${nafem != null ? pill((fxIn.nafem || {}).status) : ''}</dd>
      <dt>Parallel &mdash; reference / reconciliation only</dt><dd>${parallel != null ? fmt.num(parallel, 0) + ' &#8358;/$' : 'n/a'} ${parallel != null ? pill((fxIn.parallel || {}).status) : ''}</dd>
    </div>
    <div class="note">NAFEM is the economic settlement rate at which naira revenue/cost lands in P&amp;L &mdash; the bank funds USD, TIS repays naira proceeds converted at NAFEM. Parallel stays fully resolved for exposure/reconciliation display but feeds zero P&amp;L.</div>`;

  // Naira exposure (unified flows only)
  const exposureBlock = fx ? `
    <h3 class="block-head">Naira exposure &amp; reconciliation</h3>
    <div class="dl">
      <dt>Currency mode</dt><dd>${esc(fx.currencyMode)}${fx.usdShare != null ? ` (${fmt.pct(fx.usdShare)} USD / ${fmt.pct(fx.nairaShare)} naira)` : ''}</dd>
      <dt>Net naira exposure</dt><dd>${fmt.usd(fx.netNairaExposureUsd)}</dd>
      ${fx.nafemReconciliationGapUsd != null ? `<dt>NAFEM reconciliation gap</dt><dd>${fmt.usd(fx.nafemReconciliationGapUsd)}</dd>` : ''}
      <dt>FX incidence</dt><dd>${esc(fx.fxIncidence)}</dd>
    </div>
    ${fx.note ? `<div class="note">${esc(fx.note)}</div>` : ''}`
    : `<h3 class="block-head">Naira exposure</h3>
       <div class="note" style="border:0;padding:0">All-USD trade &mdash; no naira legs. FX does not enter P&amp;L; NAFEM/parallel shown for reference only.</div>`;

  // Settlement ICE
  const settlementBlock = `
    <h3 class="block-head">ICE settlement</h3>
    <div class="dl">
      <dt>ICE mark</dt><dd>${fmt.usd(iceMark)}/MT ${pill(trade.market && trade.market.ice ? trade.market.ice.status : '')}</dd>
      <dt>Final / settlement ICE</dt><dd>${iceFinal != null ? `${fmt.usd(iceFinal)}/MT ${pill('SETTLEMENT')}` : 'not yet settled (floats at mark)'}</dd>
    </div>
    <div class="note">The physical FOB purchase floats at ICE; the settled ICE at payment drives both landed cost and the swap reference (one shared value, never a second ICE reference on the same tonnes).</div>`;

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">5</span>
    <span class="section-title">FX &amp; Settlement</span>
    <span class="section-kicker">NAFEM drives P&amp;L &middot; parallel = reference</span>
  </div>
  ${rateBlock}
  <div class="cols" style="margin-top:6px">
    <div class="col">${exposureBlock}</div>
    <div class="col">${settlementBlock}</div>
  </div>
</section>`;
}

function hedgeAnalysis(trade, res) {
  const h  = res.hedge;
  const iceOn = !!(trade.hedge && trade.hedge.iceHedged);
  const fxOn  = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const hc    = res.hedgeComparison || null;
  const hedges = res.hedges || {};
  const finalSet = !!(trade.market && trade.market.ice && trade.market.ice.final != null);
  const effIce   = h ? (h.liveIce || (trade.market && trade.market.ice ? trade.market.ice.value : null)) : null;

  const iceBlock = h ? `
    <div class="col">
      <h3 class="block-head">ICE gasoil swap <span class="toggle ${iceOn ? 'on' : 'off'}">${iceOn ? '&#10003; Hedged' : '&times; Unhedged'}</span></h3>
      <div class="dl">
        <dt>Route</dt><dd>${esc(routeLabel(h.route, false))}</dd>
        <dt>Lots</dt><dd>${h.lots || 0} (${fmt.mt(h.hedgedTonnes)})</dd>
        <dt>Comparison basis</dt><dd>${fmt.mt(h.comparisonBasisTonnes)} retained</dd>
        <dt>Fixed price</dt><dd>${h.fixedPrice ? fmt.usd(h.fixedPrice) + '/MT' : '&mdash;'} ${pill('PLACEHOLDER')}</dd>
        <dt>${finalSet ? 'Settlement ICE (final)' : 'Live ICE'}</dt><dd>${fmt.usd(effIce)}/MT</dd>
        <dt>Effective ICE cost</dt><dd>${fmt.usd(h.effectiveIceCost)}</dd>
        <dt>ICE cost delta</dt><dd class="${signClass(-h.iceCostDelta)}">${fmt.usd(h.iceCostDelta)}</dd>
        ${finalSet ? `<dt>Realized hedge P&amp;L</dt><dd>${usdSign(hedges.iceHedgeNetImpact)}${iceOn ? '' : ' (off)'}</dd>` : ''}
        <dt>Swap fee</dt><dd>${fmt.usd(h.swapFee)} ${pill('PLACEHOLDER')}</dd>
        <dt>Extra financing cost</dt><dd>${fmt.usd(h.extraFinancingCost)}</dd>
      </div>
      ${hc && hc.ice ? `<div class="note">Hedged vs unhedged: TIS net hedged ${fmt.usd(hc.ice.hedgedTisNet)} &middot; unhedged ${fmt.usd(hc.ice.unhedgedTisNet)} &middot; hedge worth <b>${usdSign(hc.ice.hedgeWorthItVsUnhedged)}</b>.</div>` : ''}
    </div>` : '<div class="col"><div class="note" style="border:0;padding:0">No ICE hedge in this trade flow.</div></div>';

  const fh = res.fxHedge;
  const fxBlock = `
    <div class="col">
      <h3 class="block-head">FX hedge (naira exposure) <span class="toggle ${fxOn ? 'on' : 'off'}">${fxOn ? '&#10003; Hedged' : '&times; Unhedged'}</span></h3>
      ${!fh ? `<div class="note" style="border:0;padding:0">No FX hedge in this trade flow &mdash; no naira legs.</div>`
        : fh.noHedgeReason ? `<div class="dl"><dt>Note</dt><dd>${esc(fh.noHedgeReason)}</dd></div>`
        : `<div class="dl">
            <dt>Benchmark</dt><dd>${esc(fh.benchmark || '&mdash;')}</dd>
            <dt>Route</dt><dd>${esc(routeLabel((trade.fxHedge || {}).route, true))}</dd>
            <dt>Bank-repayment base</dt><dd>${fmt.num(fh.exposureNgn, 0)} &#8358;${fh.bankRepaymentUsd ? ` (= ${fmt.usd(fh.bankRepaymentUsd)})` : ''}</dd>
            <dt>Hedge ratio</dt><dd>${fmt.pct(fh.hedgeRatio || 0)}</dd>
            <dt>Forward rate</dt><dd>${fh.forwardRate ? fmt.num(fh.forwardRate, 0) + ' &#8358;/$' : pill('PLACEHOLDER')}</dd>
            <dt>FX realized delta</dt><dd>${usdSign(fh.fxRealizedDeltaUsd || 0)}${fxOn ? '' : ' (off)'}</dd>
            <dt>FX hedge cost</dt><dd>${fmt.usd(fh.extraFinancingCost || 0)}</dd>
            ${fh.basis ? `<dt>Basis (benchmark vs NAFEM)</dt><dd>${fmt.num(fh.basis.gapNgnPerUsd, 2)} &#8358;/$</dd>` : ''}
          </div>
          ${fh.basis ? `<div class="note">&#9888; ${esc(fh.basis.note || '')}</div>` : ''}`}
    </div>`;

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">6</span>
    <span class="section-title">Hedge Analysis</span>
    <span class="section-kicker">ICE + FX &mdash; both independent toggles</span>
  </div>
  <div class="cols">${iceBlock}${fxBlock}</div>
  <div class="note">All hedge parameters are placeholders &mdash; confirm with bank/broker before any live hedge. The hedge settles against the benchmark forward, which differs from the NAFEM settlement rate the unhedged naira books at; that benchmark&harr;NAFEM gap is a surfaced residual basis.</div>
</section>`;
}

function statusAndAssumptions(trade, res, generatedAt) {
  const legend = [
    { pill: '', label: 'No badge', desc: 'Verified vs statute or contract (OK / FIXED).' },
    { pill: '<span class="pill pill-ind">Indicative</span>', label: '', desc: 'Reasonable estimate &mdash; fine to model, not contractual.' },
    { pill: '<span class="pill pill-unv">&#9888; Unverified</span>', label: '', desc: 'Needs checking before live trading.' },
    { pill: '<span class="pill pill-ok">&#10003; OK</span>', label: '', desc: 'Cash-flow timing only (e.g. recoverable input VAT).' },
  ];
  const legendHtml = legend.map(l => `
    <div class="legend-row">
      <span>${l.pill || '<span class="muted" style="font-size:8.5pt">(none)</span>'}</span>
      <span class="desc">${l.label ? `<b style="color:var(--ink)">${l.label}.</b> ` : ''}${l.desc}</span>
    </div>`).join('');

  const openItems = [
    { what: 'WHT on freight (5%)', why: 'TAA 2025 s.51 sets deduction-at-source but delegates the rate; treated as cost, non-recoverable.' },
    { what: 'NIMASA cabotage &amp; freight levy', why: 'Maritime levies &mdash; confirm applicable rate and base.' },
    { what: 'SPOMO / CVFF', why: 'Cabotage vessel financing fund &mdash; confirm liability.' },
    { what: 'VAT on services', why: 'Inferred base composition &mdash; confirm constituent lines.' },
    { what: 'Hedge parameters', why: 'Fee, margin, fixed/forward prices are placeholders &mdash; confirm with bank/broker.' },
  ];
  const openHtml = openItems.map(o => `<li><span class="what">${o.what}</span><span class="why">${o.why}</span></li>`).join('');

  const fixtureNote = isFixtureName(res.meta.tradeName)
    ? ' This report is generated from an illustrative sample trade; all figures are example data, not a live transaction.'
    : '';

  return `
<section class="section">
  <div class="section-head">
    <span class="section-num">7</span>
    <span class="section-title">Status &amp; Assumptions</span>
    <span class="section-kicker">four-state flag taxonomy</span>
  </div>
  <h3 class="block-head">Flag legend</h3>
  <div class="legend">${legendHtml}</div>
  <h3 class="block-head">Open items &mdash; unverified before live trading</h3>
  <ul class="openitems">${openHtml}</ul>
  <div class="disclaimer">
    TIS Global Trading &mdash; Confidential. Trade ${esc(res.meta.tradeId)} &middot; ${esc(res.meta.flow)} flow &middot; generated ${esc(generatedAt)}.
    Every figure is produced by the verified compute engine and reproduced here without alteration; the pricing ladder is advisory pricing
    guidance only and the trader sets the final price.${fixtureNote}
  </div>
</section>`;
}

// ─── Full document assembly ───────────────────────────────────────────────────
function generatePdfHtml(trade, res, ladder, generatedAt) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(res.meta.tradeId)} — TIS Global Trading — Commercial Trade Analysis</title>
  <style>${PDF_CSS}</style>
</head>
<body>
${coverPage(trade, res, generatedAt)}
<main class="body">
  ${executiveSummary(trade, res)}
  ${costBuildup(trade, res)}
  ${profitWaterfall(res)}
  ${pricingLadder(ladder, res)}
  ${fxAndSettlement(trade, res)}
  ${hedgeAnalysis(trade, res)}
  ${statusAndAssumptions(trade, res, generatedAt)}
</main>
</body>
</html>`;
}

// Cover-only document — rendered as a SEPARATE one-page PDF with NO Playwright
// header/footer, then spliced in front of the body pages by build-report-pdf.js.
// Chromium draws its header/footer band even when @page:first margin is 0, so the
// clean cover cannot be produced in the same pass as the running header — hence the
// two-pass + merge. The cover HTML is byte-identical to page 1 of the full document.
function generateCoverHtml(trade, res, generatedAt) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(res.meta.tradeId)} — Cover</title>
  <style>${PDF_CSS}</style>
</head>
<body>
${coverPage(trade, res, generatedAt)}
</body>
</html>`;
}

module.exports = { generatePdfHtml, generateCoverHtml, pdfReportCss: PDF_CSS };
