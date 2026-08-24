#!/usr/bin/env node
'use strict';

// DEPOT POSTING-PRICE CALCULATOR — what ₦/L to post at the depot TODAY.
//
// One screen a trader uses daily: given landed cost, target margin, litres/MT and NAFEM,
// output the exact posting price. Two modes:
//
//   A) from a trade file:  node depot-price.js trades/my-deal.json --margin 135
//        -> uses the model's ALL-IN DEPOT landed cost (storage included)
//   B) manual:             node depot-price.js --cost 728.13 --qty 33000 --nafem 1512 \
//                              [--litres 1183] --margin 135 [--fxmode parallel]
//
//   price = (landedUsdPerMT × nafem / litresPerMT) + marginNgnPerL
//   FX MODE: NAFEM converts naira proceeds to P&L (RULE 1). --fxmode parallel shows what the
//   parallel rate would imply — reference only; it never drives your realized naira P&L.

const fs = require('node:fs');
const { computeTrade } = require('./engine/flows/trade');
const { computeEquityPartner } = require('./engine/flows/equity-partner');

const args = process.argv.slice(2);
const hr = (c = '-', n = 72) => c.repeat(n);
const parseFlags = (rest) => {
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) { f[rest[i].slice(2)] = true; }
      else { f[rest[i].slice(2)] = next; i++; }
    }
  }
  return f;
};

const FLOWS = { trade: computeTrade, 'equity-partner': computeEquityPartner };
let landedPerMT = null, litres = null, nafem = null, sourceLabel = null;
let marginDefault = null;

const tradeFile = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
if (tradeFile) {
  const trade = JSON.parse(fs.readFileSync(tradeFile, 'utf8'));
  const compute = FLOWS[trade.meta.flow];
  if (!compute) { console.error(`Unknown flow '${trade.meta.flow}'`); process.exit(1); }
  const res = compute(trade);
  if (!(res.price && res.price.depotLandedPerMT != null)) {
    console.error('This trade has no depot channel — no depot landed cost to price from.');
    process.exit(1);
  }
  landedPerMT = res.price.depotLandedPerMT; // ALL-IN depot landed (storage included)
  litres = res.revenue.litresPerMT;
  nafem = res.fx.rates.nafemReference;
  sourceLabel = `from trade ${res.meta.tradeId} (all-in depot landed incl storage)`;
  // default margin = recommended depot tier when present
  const tiers = (trade.pricing && trade.pricing.depotTiers) || [];
  const rec = tiers.find((t) => /recommend/i.test(t.name)) || tiers[Math.min(2, tiers.length - 1)];
  if (rec) marginDefault = rec.spreadNgnPerL;
} else {
  const f = parseFlags(args);
  if (!(f.cost && f.nafem)) {
    console.log(`usage:
  node depot-price.js <trade.json> --margin <NGN/L>
  node depot-price.js --cost <usdPerMT> --nafem <rate> --litres <L/MT> --margin <NGN/L> [--fxmode parallel]`);
    process.exit(0);
  }
  landedPerMT = Number(f.cost);
  nafem = Number(f.nafem);
  litres = Number(f.litres || 1183); // AGO default
  sourceLabel = 'manual entry';
}

const flags = parseFlags(args);
const margin = flags.margin != null ? Number(flags.margin) : marginDefault ?? 135;
const fxMode = flags.fxmode || 'nafem';
const fxRate = fxMode === 'parallel' ? (flags.parallel ? Number(flags.parallel) : null) : nafem;
if (!fxRate) {
  console.error('parallel mode needs --parallel <rate>');
  process.exit(1);
}
const atCost = (landedPerMT * fxRate) / litres;
const posting = atCost + margin;

console.log(hr('='));
console.log('DEPOT POSTING PRICE');
console.log(hr('='));
console.log(`  Source           ${sourceLabel}`);
console.log(`  Landed cost      $${landedPerMT.toFixed(2)}/MT (all-in depot${tradeFile ? ', storage included' : ''})`);
console.log(`  Litres/MT        ${litres}`);
console.log(`  FX (${fxMode})     ${fxRate} NGN/USD${fxMode === 'parallel' ? '  ⚠ REFERENCE ONLY — NAFEM drives realized P&L' : ''}`);
console.log(hr('-'));
console.log(`  At-cost ₦/L      ₦${atCost.toFixed(2)}   (= landed × FX ÷ litres)`);
console.log(`  Margin           ₦${Number(margin).toFixed(2)}/L`);
console.log(`  POST AT          ₦${posting.toFixed(2)}/L`);
console.log(hr('='));
// Sensitivity: ±5% on the FX used for the CONVERSION SHOWN (display aid only).
for (const d of [-0.05, 0.05]) {
  const r = fxRate * (1 + d);
  console.log(`  FX ${d > 0 ? '+' : ''}${(d * 100).toFixed(0)}% (${r.toFixed(0)})  → ₦${((landedPerMT * r / litres) + margin).toFixed(2)}/L`);
}
