'use strict';
// Standalone Phase 1 invariants. Run: node test/pricing-invariants.js  (exit 1 on failure).
const assert = require('node:assert');
const units = require('../engine/core/units');
const pricing = require('../engine/core/pricing');
const { roundToLots } = require('../engine/core/rounding');

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log(`ok ${pass} - ${name}`); } catch (e) { fail++; console.error(`NOT OK - ${name}\n    ${e.message}`); } };
const JET = { conversion: { litresPerMT: 1250 }, product: { bblPerMT: 7.83, litresPerMT: 1250 } };

test('U1 unit round-trip USD/BBL <-> USD/MT', () => {
  const mtv = units.toUsdPerMt(80, 'USD_PER_BBL', JET);
  assert.ok(Math.abs(units.fromUsdPerMt(mtv, 'USD_PER_BBL', JET) - 80) < 1e-9);
});
test('U2 unit round-trip USD/L <-> USD/MT', () => {
  const mtv = units.toUsdPerMt(1.1, 'USD_PER_L', JET);
  assert.ok(Math.abs(units.fromUsdPerMt(mtv, 'USD_PER_L', JET) - 1.1) < 1e-9);
});
test('U3 missing conversion factor -> explicit error', () => {
  assert.throws(() => units.toUsdPerMt(3, 'USD_PER_MMBTU', {}), /mmbtuPerMT/);
});
test('P1 M+1 arithmetic-mean minus differential', () => {
  const f = { quotedUnit: 'USD_PER_MT', components: [{ ref: 'PLATTS_JET_CARGO_NW' }, { const: -25 }],
    averaging: { ref: 'PLATTS_JET_CARGO_NW', observations: [{ date: 'd1', value: 705.25 }, { date: 'd2', value: 700 }, { date: 'd3', value: 708.5 }, { date: 'd4', value: 699.75 }, { date: 'd5', value: 702.5 }] } };
  const r = pricing.evaluateFormula(f, { quotes: {} });
  assert.ok(Math.abs(r.usdPerMT - (705.25 + 700 + 708.5 + 699.75 + 702.5) / 5 + 25) < 1e-9);
});
test('P2 weighted component (98% of Brent)', () => {
  const r = pricing.evaluateFormula(
    { quotedUnit: 'USD_PER_BBL', components: [{ ref: 'PLATTS_DATED_BRENT', weight: 0.98 }] },
    { quotes: { PLATTS_DATED_BRENT: 80 }, product: { bblPerMT: 7.45 } });
  assert.ok(Math.abs(r.usdPerMT - 80 * 7.45 * 0.98) < 1e-9);
});
test('P3 floor collar clamps', () => {
  const r = pricing.evaluateFormula({ quotedUnit: 'USD_PER_MT', components: [{ ref: 'PLATTS_JET_CARGO_NW' }, { const: -25 }], floor: 700 }, { quotes: { PLATTS_JET_CARGO_NW: 690 } });
  assert.strictEqual(r.quotedValue, 700);
});
test('P4 legacy desugar == ice + premium', () => {
  const r = pricing.resolvePurchasePrice({ market: { ice: { value: 703 }, fobPremium: { value: 12 } } });
  assert.strictEqual(r.usdPerMT, 715);
  assert.strictEqual(r.legacy, true);
});
test('P5 roundToLots honors an explicit 1000-unit lot size', () => {
  assert.deepStrictEqual(roundToLots(12500, 1000), { lots: 13, tonnes: 13000 });
});
test('P6 hedge-proxy resolution Jet -> ICE Gasoil (100 MT lots)', () => {
  const i = pricing.resolveInstrument('PLATTS_JET_CARGO_NW');
  assert.strictEqual(i.symbol, 'G');
  assert.strictEqual(i.lotSize, 100);
});
test('P7 missing quote -> named-index error', () => {
  assert.throws(() => pricing.evaluateFormula({ quotedUnit: 'USD_PER_MT', components: [{ ref: 'NOPE' }] }, { quotes: {} }), /'NOPE'/);
});
test('P8 sale-leg formula injects price; depot formula rejected', () => {
  const ok = pricing.resolveSaleLegPrices([{ channel: 'ex-ship', priceFormula: { quotedUnit: 'USD_PER_MT', components: [{ ref: 'ICE_GASOIL_FUT' }] } }], { quotes: { ICE_GASOIL_FUT: 500 }, conversion: JET.conversion });
  assert.strictEqual(ok.legs[0].price, 500);
  assert.throws(() => pricing.resolveSaleLegPrices([{ channel: 'depot', priceFormula: { quotedUnit: 'USD_PER_MT', components: [{ ref: 'ICE_GASOIL_FUT' }] } }], { quotes: { ICE_GASOIL_FUT: 500 } }), /depot/);
});
test('R1 registry ids unique', () => {
  const reg = require('../engine/config/indexes.json');
  assert.strictEqual(new Set(reg.indexes.map((x) => x.id)).size, reg.indexes.length);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
