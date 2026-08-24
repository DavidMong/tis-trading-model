'use strict';
// Close-out + consensus-pricing invariants. Run: node test/closeout-invariants.js (exit 1).
const assert = require('node:assert');
const { closeOut, variance } = require('../engine/core/closeout');
const quotebook = require('../engine/core/quotebook');

let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; console.log(`ok ${pass} - ${n}`); } catch (e) { fail++; console.error(`NOT OK - ${n}\n    ${e.message}`); } };
const NOW = new Date('2026-08-24T15:00:00Z');
const H = (h) => new Date(NOW - h * 36e5).toISOString();

let memBook = { version: 1, quotes: [] };
quotebook._useStore(() => JSON.parse(JSON.stringify(memBook)), (b) => { memBook = JSON.parse(JSON.stringify(b)); });

test('CO1 variance direction: costs lower=favorable, revenue higher=favorable', () => {
  const c = variance('cost line', 1000, 900, 'USD'); // actual below model -> favorable
  assert.strictEqual(c.verdict, 'FAVORABLE');
  const r = variance('revenue', 1000, 1100, 'USD', { favorableWhen: 'higher' });
  assert.strictEqual(r.verdict, 'FAVORABLE');
  const rBad = variance('revenue', 1000, 950, 'USD', { favorableWhen: 'higher' });
  assert.strictEqual(rBad.verdict, 'UNFAVORABLE');
});

test('CO2 close-out: headline rows + per-cost-line variances + unfavorable count', () => {
  const modelRes = {
    meta: { tradeId: 'T' }, price: { avgRealizedPriceUSDperMT: 765 },
    cost: { allInCost: 1000000, freight: { freightBase: 200000 }, lines: [{ id: '3', label: 'TC hire', amountUsd: 150000 }] },
    profit: { tisNetProfit: 50000 }, fx: { rates: { nafemReference: 1500 } },
  };
  const rep = closeOut(modelRes, {
    tradeId: 'T',
    actuals: { deliveredQtyMT: 33000, avgRealizedPriceUSDperMT: 770, allInCost: 1010000, freightBase: 195000, nafemRate: 1512, tisNetProfit: 48000, costLines: { '3': 148000 } },
  });
  assert.strictEqual(rep.variances.length >= 6, true);
  const net = rep.variances.find((r) => r.line === 'TIS net profit');
  assert.strictEqual(net.delta, -2000);
  assert.strictEqual(net.verdict, 'UNFAVORABLE');
  const tc = rep.costLineVariances[0];
  assert.strictEqual(tc.delta, -2000);
  assert.match(tc.line, /#3 TC hire/);
  assert.ok(rep.headline.unfavorableLines >= 1);
});

test('QB7 consensus mode: unpinned index resolves to MEDIAN when >1 source', () => {
  memBook = { version: 1, quotes: [
    { id: 'Q-0001', indexId: 'JET', value: 701, asOf: '2026-08-24', capturedAt: H(2), status: 'ACTIVE', source: { name: 'a', tier: 'B' }, method: 'm' },
    { id: 'Q-0002', indexId: 'JET', value: 705, asOf: '2026-08-24', capturedAt: H(1), status: 'ACTIVE', source: { name: 'b', tier: 'C' }, method: 'm' },
  ] };
  // consensus OFF -> newest single quote
  let r = quotebook.resolveForTrade({ market: {} }, ['JET']);
  assert.strictEqual(r.quotes.JET, 705);
  // consensus ON -> median
  r = quotebook.resolveForTrade({ pricing: { consensus: true }, market: {} }, ['JET']);
  assert.strictEqual(r.quotes.JET, 703);
  assert.match(r.provenance[0].origin, /CONSENSUS \(2 sources\)/);
  // single-source index falls back to the single quote even in consensus mode
  memBook.quotes.pop();
  r = quotebook.resolveForTrade({ pricing: { consensus: true }, market: {} }, ['JET']);
  assert.strictEqual(r.quotes.JET, 701);
  assert.strictEqual(r.provenance[0].origin.startsWith('BOOK Q-'), true);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
