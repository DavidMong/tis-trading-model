'use strict';

// TERM SHEET EXPORT (2026-08) — one-page clean printable deal summary, generated
// from the live engine result. Rams discipline: parties, quantity, price, terms,
// profit. Nothing decorative. Opens in a new tab ready to print/save-as-PDF.

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildTermSheet(res) {
  const m = res.meta || {};
  const p = res.parties || m.parties || {};
  const price = res.price || {};
  const cost = res.cost || {};
  const fx = res.fx || {};
  const fmt = (v, d = 0) => v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (v) => v == null ? '—' : '$' + fmt(v);
  const rows = [
    ['Commodity / Trade', esc(m.tradeName || m.tradeId || '')],
    ['Seller (Supplier)', esc(p.supplier || '—')],
    ['Buyer channel', (res.revenue?.legs || []).map(l => `${esc(l.channel)} ${fmt(l.tonnes, 0)} MT @ ${esc(l.pricingUnit)}`).join(' + ') || '—'],
    ['Partner (funding)', esc(p.partner || '—')],
    ['Facility', esc(p.facility || '—')],
    ['Inspection', esc(p.inspector || '—')],
    ['', ''],
    ['Delivery quantity', fmt(m.deliveredQty, 0) + ' MT'],
    ['Purchase price (effective)', price.purchasePriceUSDperMT != null ? usd(price.purchasePriceUSDperMT) + '/MT' : (price.exShipLandedPerMT != null ? 'indexed — see model audit' : '—')],
    ['All-in landed cost', usd(cost.allInCost) + `  (${usd(price.landedCostPerMT)}/MT)`],
    ['Ex-ship landed (ex-storage)', price.exShipLandedPerMT != null ? usd(price.exShipLandedPerMT) + '/MT' : '—'],
    ['', ''],
    ['Avg realized sale price', price.avgRealizedPriceUSDperMT != null ? usd(price.avgRealizedPriceUSDperMT) + '/MT' : '—'],
    ['FX settlement rate (NAFEM)', fx.rates?.nafemReference ? fmt(fx.rates.nafemReference, 1) + ' ₦/$' : '—'],
    ['', ''],
    ['TIS NET PROFIT', `<b>${usd((res.profit || {}).tisNetProfit)}</b>`],
    ['Annualised return', res.tisAnnualisedReturn != null ? (res.tisAnnualisedReturn * 100).toFixed(2) + '%' : '—'],
  ];

  return `<!doctype html><html><head><meta charset="utf-8"><title>Term Sheet — ${esc(m.tradeId || '')}</title>
<style>
@page { size: A4; margin: 22mm 20mm; }
body{margin:0;color:#242331;font:11pt/1.6 'IBM Plex Sans','Helvetica Neue',Arial,sans-serif}
.wrap{max-width:180mm;margin:0 auto;padding:10mm 0}
.brand{font-size:8.5pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#d41d1d}
h1{font-size:19pt;margin:6pt 0 2pt}
.sub{color:#64707c;font-size:9.5pt;margin-bottom:14pt}
hr{border:none;border-top:2px solid #242331;margin:0 0 12pt}
dl{display:grid;grid-template-columns:52mm 1fr;gap:5pt 12pt;font-size:10.5pt}
dt{color:#64707c}dd{margin:0;font-weight:500;text-align:right}
dd b{font-size:12pt}
.net dd{color:#15803d}
.net dt{font-weight:700;color:#242331}
.foot{margin-top:16pt;font-size:8pt;color:#8a94a0;text-align:center}
@media print{ .wrap{padding:0} }
</style></head><body><div class="wrap">
<div class="brand">TIS Global Trading · Term Sheet</div>
<h1>${esc(m.tradeName || m.tradeId || '')}</h1>
<div class="sub">${esc(m.tradeId || '')} · Indicative — subject to contract · Generated ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
<hr>
<dl>${rows.map(([k, v]) => k === '' ? '<span></span><span></span>' : `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
<div class="foot">All figures computed by the TIS verified engine from the stated inputs. Pricing guidance only — the trader sets the final price.</div>
</div></body></html>`;
}

module.exports = { buildTermSheet };
