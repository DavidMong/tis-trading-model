'use strict';
// Quote-book invariants. Run: node test/quotebook-invariants.js  (exit 1 on failure).
const assert = require('node:assert');
const quotebook = require('../engine/core/quotebook');

let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; console.log(`ok ${pass} - ${n}`); } catch (e) { fail++; console.error(`NOT OK - ${n}\n    ${e.message}`); } };
const NOW = new Date('2026-08-24T15:00:00Z');
const H = (h) => new Date(NOW - h * 36e5).toISOString();

// Work on an isolated in-memory book via the store hook.
let memBook = { version: 1, quotes: [] };
quotebook._useStore(() => JSON.parse(JSON.stringify(memBook)), (b) => { memBook = JSON.parse(JSON.stringify(b)); });
function addMem(entry) {
  const n = memBook.quotes.length + 1;
  const e = {
    id: `Q-${String(n).padStart(4, '0')}`, status: 'ACTIVE', method: 'test', notes: '',
    source: { name: 'unknown', org: '', tier: 'B' }, capturedAt: H(1),
    ...entry,
  };
  memBook.quotes.push(e);
  return e;
}

test('QB1 staleness: fresh within tier cap, stale beyond', () => {
  const fresh = quotebook.withStaleness({ asOf: '2026-08-24', capturedAt: H(2), status: 'ACTIVE', source: { tier: 'B' } }, NOW);
  assert.strictEqual(fresh.freshness, 'FRESH');
  const stale = quotebook.withStaleness({ asOf: '2026-08-24', capturedAt: H(20), status: 'ACTIVE', source: { tier: 'B' } }, NOW);
  assert.strictEqual(stale.freshness, 'STALE'); // B cap = 18h
  const aFresh = quotebook.withStaleness({ asOf: '2026-08-24', capturedAt: H(20), status: 'ACTIVE', source: { tier: 'A' } }, NOW);
  assert.strictEqual(aFresh.freshness, 'FRESH'); // A cap = 30h
});

test('QB2 latest(): picks newest ACTIVE per index; retired excluded', () => {
  addMem({ indexId: 'IDX_X', value: 100, asOf: '2026-08-23' });
  addMem({ indexId: 'IDX_X', value: 105, asOf: '2026-08-24' });
  addMem({ indexId: 'IDX_Y', value: 50, asOf: '2026-08-24', status: 'RETIRED' });
  const l = quotebook.latest(['IDX_X', 'IDX_Y'], NOW);
  assert.strictEqual(l.IDX_X.value, 105);
  assert.ok(!l.IDX_Y); // retired -> absent, caller decides policy
});
memBook = { version: 1, quotes: [] };

test('QB3 resolveForTrade: pinned quotes WIN over the book; provenance says so', () => {
  memBook = { version: 1, quotes: [
    { id: 'Q-0001', indexId: 'ICE_GASOIL_FUT', value: 690, asOf: '2026-08-24', capturedAt: H(1), status: 'ACTIVE', source: { name: 'desk', tier: 'A' }, method: 'm' },
  ] };
  const trade = { indexQuotes: { ICE_GASOIL_FUT: 700 }, market: { purchasePrice: { components: [{ ref: 'ICE_GASOIL_FUT' }] } } };
  const r = quotebook.resolveForTrade(trade, ['ICE_GASOIL_FUT']);
  assert.strictEqual(r.quotes.ICE_GASOIL_FUT, 700);
  assert.strictEqual(r.provenance[0].origin, 'TRADE-PINNED');
});

test('QB4 resolveForTrade: fills missing refs from the book with provenance', () => {
  const trade = { market: { purchasePrice: { components: [{ ref: 'ICE_GASOIL_FUT' }] } } }; // nothing pinned
  const r = quotebook.resolveForTrade(trade);
  assert.strictEqual(r.quotes.ICE_GASOIL_FUT, 690);
  assert.match(r.provenance[0].origin, /^BOOK Q-/);
  assert.strictEqual(r.provenance[0].source.includes('desk'), true);
});

test('QB5 consensus: median across sources; wide-spread flag', () => {
  memBook = { version: 1, quotes: [] };
  addMem({ indexId: 'JET', value: 701, asOf: '2026-08-24' });
  addMem({ indexId: 'JET', value: 702, asOf: '2026-08-24' });
  addMem({ indexId: 'JET', value: 703, asOf: '2026-08-24' });
  let c = quotebook.consensus('JET');
  assert.strictEqual(c.median, 702);
  assert.strictEqual(c.count, 3);
  assert.strictEqual(c.wideSpread, false); // 2/702 ≈ 0.28% < 2%
  addMem({ indexId: 'JET', value: 725, asOf: '2026-08-24' }); // outlier
  c = quotebook.consensus('JET');
  assert.strictEqual(c.median, 702.5);
  assert.strictEqual(c.wideSpread, true); // 24/702.5 > 2%
});

test('QB6 validation: bad value / tier / missing asOf throw', () => {
  assert.throws(() => quotebook.add({ indexId: 'X', value: -1, asOf: '2026-01-01' }), /value must be > 0/);
  assert.throws(() => quotebook.add({ indexId: 'X', value: 5, asOf: '2026-01-01', source: { name: 'a', tier: 'Z' } }), /tier/);
  assert.throws(() => quotebook.add({ indexId: 'X', value: 5, source: { tier: 'B' } }), /asOf/);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
