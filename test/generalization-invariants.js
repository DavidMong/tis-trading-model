'use strict';
// Phases 2-5 invariants. Run: node test/generalization-invariants.js  (exit 1 on failure).
const assert = require('node:assert');
const products = require('../engine/core/products');
const jurisdiction = require('../engine/core/jurisdiction');
const { normalizeFreight } = require('../engine/core/cost-buildup');
const { computeBasis } = require('../engine/core/basis');
const { renderDealSheet } = require('../engine/report/html');

let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; console.log(`ok ${pass} - ${n}`); } catch (e) { fail++; console.error(`NOT OK - ${n}\n    ${e.message}`); } };

test('G1 catalog loads; ids unique; getProduct works', () => {
  const cat = require('../engine/config/products.json');
  assert.strictEqual(new Set(cat.products.map((p) => p.id)).size, cat.products.length);
  for (const p of cat.products) products.getProduct(p.id);
});
test('G2 inline product merges over catalog per-field', () => {
  const t = { product: { id: 'AGO_10PPM', conversions: { litresPerMT: 1190 } } };
  assert.strictEqual(products.resolveProduct(t).conversions.litresPerMT, 1190);
  assert.strictEqual(products.resolveProduct(t).conversions.bblPerMT, 7.46);
});
test('G3 jurisdiction NG default is identity; unknown throws', () => {
  const ng = jurisdiction.load(undefined);
  assert.strictEqual(ng.id, 'NG');
  assert.strictEqual(ng.excludeCostLineIds.length, 0);
  assert.throws(() => jurisdiction.load('XX'), /unknown jurisdiction/);
});
test('G4 INTL excludes exactly the NG-specific line ids', () => {
  const intl = jurisdiction.load('INTL');
  const out = jurisdiction.applyToSchema([{ id: '1' }, { id: '7' }, { id: '11' }, { id: '12' }], intl);
  assert.deepStrictEqual(out.map((l) => l.id), ['1']);
});
test('G5 TC freight math unchanged', () => {
  const f = normalizeFreight({ tcRatePerDay: 20000, charterDays: 30, demurrageDays: 2 }, 33000);
  assert.strictEqual(f.freightBase, 20000 * 32);
});
test('G6 voyage lumpsum normalizes', () => {
  const f = normalizeFreight({ mode: 'voyage_lumpsum', lumpsumUsd: 900000 }, 33000);
  assert.strictEqual(f.freightBase, 900000);
});
test('G7 worldscale math: points% x flat x qty; unknown mode throws', () => {
  const f = normalizeFreight({ mode: 'worldscale', wsPoints: 135, flatRateUsdPerMT: 25 }, 33000);
  assert.strictEqual(f.lumpsumUsd, 1.35 * 25 * 33000);
  assert.throws(() => normalizeFreight({ mode: 'banana' }, 1), /unknown freight.mode/);
});
test('G8 basis: paired quotes quantify; proxied flag set', () => {
  const r = computeBasis({
    indexQuotes: { PLATTS_JET_CARGO_NW: 702.25, ICE_GASOIL_FUT: 690 },
    market: { purchasePrice: { components: [{ ref: 'PLATTS_JET_CARGO_NW' }] } },
  });
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].proxied, true);
  assert.ok(r.rows[0].basisUsdPerMt > 0);
});
test('G9 HTML deal sheet renders and escapes', () => {
  const html = renderDealSheet({ meta: { tradeName: '<script>x</script>', tradeId: 'T', lifecycle: 'RECAP' }, cost: { lines: [], allInCost: 1, freight: {} } });
  assert.ok(!html.includes('<script>x'));
  assert.ok(html.includes('&lt;script&gt;'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
