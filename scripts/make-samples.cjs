'use strict';

// SAMPLE TRADE GENERATOR. Clones trades/reference-trade-001.json and applies documented deltas,
// producing two showcase trades that exercise the generalization layers:
//   trades/jet-cargo-sample-001.json  — Platts Jet NWE, M+1 avg - $25, TC freight, NG depot leg
//   trades/intl-crude-sample-001.json — 98% Dated Brent, WorldScale freight, INTL jurisdiction
// Run: node scripts/make-samples.cjs

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'trades', 'reference-trade-001.json'), 'utf8'));

// Deep-merge plain objects (arrays/scalars replace); then delete listed dot-paths.
function merge(t, s) {
  for (const k of Object.keys(s)) {
    if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) merge(t[k], s[k]);
    else t[k] = s[k];
  }
  return t;
}
function del(o, dotPath) {
  const ks = dotPath.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) { cur = cur[ks[i]]; if (!cur) return; }
  delete cur[ks[ks.length - 1]];
}
function make(name, delta, deletes) {
  const t = merge(JSON.parse(JSON.stringify(base)), delta);
  (deletes || []).forEach((d) => del(t, d));
  const file = path.join(ROOT, 'trades', name);
  fs.writeFileSync(file, JSON.stringify(t, null, 2) + '\n', 'utf8');
  console.log('wrote', file);
}

make(
  'jet-cargo-sample-001.json',
  {
    meta: { tradeName: 'Jet A-1 NWE cargo — Platts M+1 indexed', tradeId: 'TIS-JET-001', lifecycle: 'RECAP', flow: 'trade' },
    jurisdiction: 'NG',
    product: { id: 'JET_A1' },
    pricing: { conversion: { litresPerMT: 1250 } },
    cargo: { deliveredQtyMT: 33000, deliveredQtyUpsideMT: 34650 },
    indexQuotes: { PLATTS_JET_CARGO_NW: 702.25 },
    market: {
      fobPremium: { value: 0 },
      purchasePrice: {
        quotedUnit: 'USD_PER_MT',
        components: [
          { ref: 'PLATTS_JET_CARGO_NW', weight: 1.0, op: '+' },
          { const: -25, op: '+' },
        ],
        averaging: {
          ref: 'PLATTS_JET_CARGO_NW', method: 'arithmetic-mean',
          observations: [
            { date: '2026-07-01', value: 705.25 }, { date: '2026-07-02', value: 700.00 },
            { date: '2026-07-03', value: 708.50 }, { date: '2026-07-04', value: 699.75 },
            { date: '2026-07-05', value: 702.50 },
          ],
        },
      },
    },
    revenueLegs: [
      { channel: 'ex-ship', pricingUnit: 'USD_PER_MT', share: 0.8,
        priceFormula: { quotedUnit: 'USD_PER_MT', components: [{ ref: 'PLATTS_JET_CARGO_NW', op: '+' }, { const: 15, op: '+' }] } },
      { channel: 'depot', pricingUnit: 'NGN_PER_L', share: 0.2, price: 1150 },
    ],
  },
  ['market.ice']
);

make(
  'intl-crude-sample-001.json',
  {
    meta: { tradeName: 'Brent crude CFR NW Europe — offshore B2B', tradeId: 'TIS-CRUDE-001', lifecycle: 'RECAP', flow: 'trade' },
    jurisdiction: 'INTL',
    product: { id: 'BRENT_CRUDE' },
    cargo: { deliveredQtyMT: 130000, deliveredQtyUpsideMT: 136500 },
    indexQuotes: { PLATTS_DATED_BRENT: 82.40, ICE_BRENT_FUT: 81.95 },
    depot: { enabled: false },
    freight: { mode: 'worldscale', wsPoints: 48.5, flatRateUsdPerMT: 21.70, demurrageUsd: 180000 },
    market: {
      fobPremium: { value: 0 },
      purchasePrice: {
        quotedUnit: 'USD_PER_BBL',
        components: [{ ref: 'PLATTS_DATED_BRENT', weight: 0.98, op: '+' }],
      },
    },
    revenueLegs: [
      { channel: 'ex-ship', pricingUnit: 'USD_PER_MT', share: 1.0,
        priceFormula: { quotedUnit: 'USD_PER_BBL', components: [{ ref: 'ICE_BRENT_FUT', op: '+' }, { const: 9.5, op: '+' }] } },
    ],
  },
  ['market.ice', 'freight.tcRatePerDay', 'freight.charterDays', 'freight.demurrageDays']
);
