#!/usr/bin/env node
'use strict';

// DEAL CLOSE-OUT CLI — actuals vs model variance report.
//
//   node closeout.js trades/jet-cargo-sample-001.json closeouts/jet-actuals.json
//   node closeout.js --template trades/jet-cargo-sample-001.json   # print a fillable actuals file
//
// Writes the variance report to out/<tradeId>-closeout.json and prints it.

const fs = require('node:fs');
const path = require('node:path');
const { computeTrade } = require('./engine/flows/trade');
const { computeEquityPartner } = require('./engine/flows/equity-partner');
const { computeStraightExship } = require('./engine/flows/straight-exship');
const { computeFullDepotResale } = require('./engine/flows/full-depot-resale');
const { closeOut } = require('./engine/core/closeout');

const FLOWS = {
  'equity-partner': computeEquityPartner,
  'straight-exship': computeStraightExship,
  'full-depot-resale': computeFullDepotResale,
  trade: computeTrade,
};

const args = process.argv.slice(2);
const hr = (c = '-', n = 88) => c.repeat(n);
const usd = (x) => (x == null ? 'n/a' : `$${Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

if (args[0] === '--template') {
  console.log(`{
  "tradeId": "<from trade file>",
  "actuals": {
    "deliveredQtyMT": 0,
    "purchasePriceUsdPerMT": 0,
    "avgRealizedPriceUSDperMT": 0,
    "allInCost": 0,
    "freightBase": 0,
    "nafemRate": 0,
    "tisNetProfit": 0,
    "costLines": { "3": 0, "4": 0, "11": 0 }
  },
  "notes": "what actually happened vs the recap"
}`);
  process.exit(0);
}

const [tradeFile, actualsFile] = args;
if (!tradeFile || !actualsFile) {
  console.error('usage: node closeout.js <trade.json> <actuals.json>   (or --template)');
  process.exit(1);
}

const trade = JSON.parse(fs.readFileSync(path.resolve(tradeFile), 'utf8'));
const actualsDoc = JSON.parse(fs.readFileSync(path.resolve(actualsFile), 'utf8'));
const compute = FLOWS[trade.meta.flow];
if (!compute) { console.error(`Unknown flow '${trade.meta.flow}'`); process.exit(1); }

let res = compute(trade);
res.sensitivities = undefined; // not needed for close-out
const report = closeOut(res, actualsDoc);

console.log(hr('='));
console.log(`CLOSE-OUT — ${report.tradeId}  (${report.closedAt})`);
console.log(hr('='));
const fmt = (r) => `${r.line.padEnd(28)} model ${String(r.model ?? '—').padStart(14)}  actual ${String(r.actual ?? '—').padStart(14)}  Δ ${String(r.delta).padStart(12)}${r.pctOfModel != null ? ` (${r.pctOfModel}%)` : ''}  ${r.verdict}`;
for (const r of report.variances.filter(Boolean)) console.log('  ' + fmt(r));
if (report.costLineVariances.length) {
  console.log(hr('-'));
  console.log('COST LINES:');
  for (const r of report.costLineVariances) console.log('  ' + fmt(r));
}
if (report.notes) console.log(`\nNotes: ${report.notes}`);
console.log(hr('='));

fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const outFile = path.join(__dirname, 'out', `${report.tradeId}-closeout.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
console.log(`\nClose-out saved: ${outFile}`);
