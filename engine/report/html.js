'use strict';

// DEAL SHEET RENDERER (UI/UX overhaul). Zero dependencies; single self-contained HTML file suitable
// for email/attachment. Defensive: renders whichever sections exist on `res`.

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v, d = 2) => (v == null || v === '' ? '—' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);

const CHIP = {
  OK: 'chip ok', RECOVERABLE: 'chip ok', SETTLED: 'chip ok',
  CONFIRM: 'chip warn', PENDING: 'chip warn', RECAP: 'chip warn', PERFORMED: 'chip warn', INVOICED: 'chip warn',
  INDICATIVE: 'chip info', INDICATION: 'chip info',
  PLACEHOLDER: 'chip danger', MISMATCH: 'chip danger',
};
const chip = (s) => (!s ? '' : `<span class="${CHIP[s] || 'chip'}">${esc(s)}</span>`);

function table(headers, rows) {
  if (!rows.length) return '';
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function kpi(label, value, sub) {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

function renderDealSheet(res) {
  const m = res.meta || {};
  const f = res.financing || {};
  const p = res.profit || {};
  const parts = [];

  parts.push(`<header>
    <div class="brand">TIS GLOBAL TRADING <span>· DEAL SHEET</span></div>
    <h1>${esc(m.tradeName || m.tradeId || '')}</h1>
    <div class="meta">${esc(m.tradeId || '')} · Flow ${esc(m.flow || '')} · ${Number(m.deliveredQty || 0).toLocaleString('en-US')} MT
      ${chip(m.lifecycle || 'RECAP')}
      ${res.jurisdiction ? chip(res.jurisdiction.id) : ''}
      ${res.pricing && res.pricing.mode === 'indexed' ? '<span class="chip info">INDEXED PRICING</span>' : ''}
      ${res.hedges && res.hedges.iceHedged ? '<span class="chip">SWAP ON</span>' : ''}
      ${res.hedges && res.hedges.fxHedged ? '<span class="chip">FX HEDGE ON</span>' : ''}
    </div>
    ${m.parties ? `<div class="parties">Partner ${esc(m.parties.partner || '—')} · Supplier ${esc(m.parties.supplier || '—')} · Facility ${esc(m.parties.facility || '—')}</div>` : ''}
  </header>`);

  parts.push('<section class="kpis">' +
    kpi('TIS net profit', num(p.tisNetProfit)) +
    kpi('Annualised return', res.tisAnnualisedReturn != null ? (res.tisAnnualisedReturn * 100).toFixed(2) + '%' : '—', res.annualReturnBaseLabel ? `on ${esc(res.annualReturnBaseLabel)}` : '') +
    kpi('Avg realized price', res.price ? num(res.price.avgRealizedPriceUSDperMT) + '/MT' : '—') +
    kpi('All-in cost', res.cost ? num(res.cost.allInCost) : '—') +
    kpi('Net naira exposure @NAFEM', res.fx ? num(res.fx.netNairaExposureUsd) : '—') +
    '</section>');

  if (res.pricing && res.pricing.mode === 'indexed') {
    parts.push(`<section><h2>Pricing</h2>
      <p class="mono">${esc(res.pricing.purchaseSummary || '')}</p>
      ${(res.pricing.saleLegAudits || []).map((a) => `<p class="mono">Sale leg ${a.legIndex + 1}: ${esc(a.summary)}</p>`).join('')}
      ${res.pricing.instrument ? `<p>Hedge instrument: <b>${esc(res.pricing.instrument.exchange)} ${esc(res.pricing.instrument.symbol)}</b> (${esc(res.pricing.instrument.viaIndexId)}${res.pricing.instrument.proxyFor ? ', proxy for ' + esc(res.pricing.instrument.proxyFor) : ''})</p>` : ''}
    </section>`);
  }

  if (res.revenue) {
    parts.push('<section><h2>Revenue legs</h2>' + table(['Channel', 'Unit', 'Tonnes', 'Price', '$/MT', 'USD', 'NGN'],
      res.revenue.legs.map((l) => [esc(l.channel), esc(l.pricingUnit), Number(l.tonnes).toLocaleString('en-US'),
        esc(l.price), l.priceUsdPerMT != null ? num(l.priceUsdPerMT) : '—', num(l.usd), l.ngn != null ? '₦' + Number(l.ngn).toLocaleString('en-US') : '—'])) + '</section>');
  }

  if (res.cost) {
    parts.push('<section><h2>Cost build-up</h2>' + table(['#', 'Line', 'Category', 'Amount', 'Flag'],
      res.cost.lines.map((l) => [esc(l.id), esc(l.label), esc(l.category), num(l.amountUsd),
        l.recoverable ? chip('RECOVERABLE') : chip(l.status)])) +
      `<p class="total">ALL-IN LANDED COST <b>${num(res.cost.allInCost)}</b> · base ${num(res.cost.baseAllIn)} · storage ${num(res.cost.storageTotal)}</p></section>`);
  }

  if (res.cost && res.cost.freight) {
    const fr = res.cost.freight;
    parts.push(`<section><h2>Freight</h2><p>Mode <b>${esc(fr.mode || 'tc')}</b> · base ${num(fr.freightBase)}${fr.perMTUsd != null ? ` · ${num(fr.perMTUsd)}/MT` : ''}${fr.lumpsumUsd != null ? ` · lump-sum ${num(fr.lumpsumUsd)}` : ` · hire ${num(fr.tcHire)} + demurrage ${num(fr.demurrage)}`}</p></section>`);
  }

  if (res.fx) {
    parts.push(`<section><h2>FX</h2>
      <p>Currency mode <b>${esc(res.fx.currencyMode)}</b> · NAFEM ${num(res.fx.rates.nafemReference)} (P&L) · parallel ${num(res.fx.rates.parallelPricing)} (reference only)</p>
      <p>Naira revenue ₦${Number(res.fx.nairaRevenue.ngn).toLocaleString('en-US')} → ${num(res.fx.nairaRevenue.usdAtNafemReference)} · naira cost ₦${Number(res.fx.nairaCost.ngn).toLocaleString('en-US')} → ${num(res.fx.nairaCost.usdAtNafemReference)}</p>
    </section>`);
  }

  if (res.hedge) {
    const hc = res.hedgeComparison;
    parts.push(`<section><h2>Hedges</h2>
      <p>${esc(res.hedge.instrument || 'ICE Gasoil')} swap · route ${esc(res.hedge.route)} · lots ${res.hedge.lots} (${Number(res.hedge.hedgedTonnes).toLocaleString('en-US')} MT)</p>
      <p>Effective ${num(res.hedge.effectiveIceCost)} vs unhedged ${num(res.hedge.unhedgedIceCost)} → realized impact ${num(res.hedges.iceHedgeNetImpact)}</p>
      ${hc ? `<p>Hedging worth ${num(hc.ice.hedgeWorthItVsUnhedged)} (ICE) · ${num(hc.fx.hedgeWorthItVsUnhedged)} (FX)</p>` : ''}
    </section>`);
  }

  if (res.quoteProvenance && res.quoteProvenance.length) {
    parts.push('<section><h2>Quote Provenance</h2>' + table(['Index', 'Value', 'Origin', 'Source', 'Note'],
      res.quoteProvenance.map((p) => [esc(p.indexId), `<span class="num">${Number(p.value).toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>`,
        esc(p.origin), esc((p.source || '') + (p.asOf ? ` · asOf ${p.asOf}` : '')) || '—',
        `${p.freshness === 'STALE' ? '<span style="color:var(--warn)">⚠ STALE</span> ' : ''}${esc(p.warning || p.note || '')}`]))
      + '</section>');
  }

  if (res.basis && (res.basis.rows.length || res.basis.notes.length)) {
    parts.push('<section><h2>Proxy-hedge basis (not in P&L)</h2>' + table(['Physical index', 'Instrument', 'Phys quote', 'Inst quote', 'Basis $/MT', '%'],
      res.basis.rows.map((b) => [esc(b.physicalIndex), `${esc(b.instrument)}${b.proxied ? ' (proxy)' : ''}`, b.physicalQuote, b.instrumentQuote, b.basisUsdPerMt, b.basisPctOfPhysical + '%']))
      + res.basis.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('') + '</section>');
  }

  if (res.tax) {
    parts.push('<section><h2>Tax block</h2>' + table(['#', 'Line', 'Amount', 'Treatment', 'Status'],
      res.tax.items.map((t) => [esc(t.id), esc(t.label), num(t.amountUsd), esc(t.treatment), chip(t.status)]))
      + `<p class="note">Surcharge: ${res.tax.surcharge.enabled ? 'ENABLED' : 'OFF'} · ${esc(res.tax.surcharge.status || '')}</p></section>`);
  }

  if (res.sensitivities) {
    const rows = [...res.sensitivities.scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));
    parts.push('<section><h2>Sensitivities (sorted by impact)</h2>' + table(['Lever', 'TIS net', 'Δ vs base'],
      rows.map((s) => [esc(s.lever), num(s.tisNet), `<span class="${s.deltaVsBase < 0 ? 'neg' : 'pos'}">${num(s.deltaVsBase)}</span>`])) + '</section>');
  }

  const checks = [];
  if (p.reconciliation) checks.push(['Waterfall reconciliation', p.reconciliation.ok]);
  if (res.partnerDelivers && res.partnerDelivers.principalTie) checks.push(['Partner principal tie-out', res.partnerDelivers.principalTie.ok]);
  if (f.check) checks.push([`Funding stack ${(f.check.fundingStackPctOfCargo * 100).toFixed(2)}%`, f.check.fundingStackPctOfCargo === 1]);
  if (checks.length) {
    parts.push('<section><h2>Reconciliation checks</h2>' + table(['Check', 'Result'],
      checks.map(([label, ok]) => [esc(label), ok ? chip('OK') : chip('MISMATCH')])) + '</section>');
  }

  parts.push(`<details><summary>Raw model output (JSON)</summary><pre>${esc(JSON.stringify(res, null, 2))}</pre></details>`);
  parts.push(`<footer>Generated ${new Date().toISOString()} · figures marked CONFIRM/PLACEHOLDER/INDICATIVE are soft — see the appendix of the terminal report.</footer>`);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.tradeName || m.tradeId || 'Deal sheet')}</title>
<style>
:root{--bg:#0e1116;--card:#161b23;--line:rgba(139,148,158,.16);--tx:#e6edf3;--dim:#9da7b3;--acc:#f0554f;--ok:#3fb950;--warn:#d29922;--info:#79c0ff;--danger:#f85149;--sunken:#10151c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.55 'IBM Plex Sans','Helvetica Neue',-apple-system,'Segoe UI',sans-serif;padding:32px;color-scheme:dark}
header{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:22px}
.brand{color:var(--acc);font-weight:700;letter-spacing:.12em;font-size:12px}.brand span{color:var(--dim);letter-spacing:.08em}
h1{margin:10px 0 6px;font-size:24px}.meta{color:var(--dim)}.parties{color:var(--dim);font-size:13px;margin-top:4px}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 9px;margin-left:6px;font-size:11px;color:var(--dim)}
.chip.ok{color:var(--ok);border-color:var(--ok)}.chip.warn{color:var(--warn);border-color:var(--warn)}.chip.info{color:var(--info);border-color:var(--info)}.chip.danger{color:var(--danger);border-color:var(--danger)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:26px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi-label{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.kpi-value{font-size:20px;font-weight:700;margin-top:4px;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums lining-nums}.kpi-sub{color:var(--dim);font-size:12px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:16px}
h2{margin:0 0 10px;font-size:15px;color:var(--acc);text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--dim);font-weight:600;border-bottom:1px solid var(--line);padding:6px 8px}td{border-bottom:1px solid var(--line);padding:6px 8px}
tbody tr:hover td{background:rgba(139,148,158,.06)}
tr:last-child td{border-bottom:none}td:nth-child(n+3),th:nth-child(n+3){text-align:right}
td.r,th.r{text-align:right}td.num{font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums lining-nums}
.total{margin-top:10px;text-align:right}.note,.mono{color:var(--dim);font-size:12.5px}.mono{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace}
.pos{color:var(--ok)}.neg{color:var(--danger)}
details{margin-top:18px}summary{cursor:pointer;color:var(--dim)}pre{max-height:420px;overflow:auto;background:var(--sunken);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:12px}
footer{color:var(--dim);font-size:12px;margin-top:22px;text-align:center}
@media print{body{background:#fff;color:#111;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif}section,header{border-color:#ddd;background:#fff}:root{--tx:#111;--dim:#555}}
</style></head><body>${parts.join('\n')}</body></html>`;
}

module.exports = { renderDealSheet };
