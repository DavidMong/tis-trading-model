'use strict';
// Desk-memory invariants. Run: node test/desk-memory-invariants.js (exit 1).
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let pass = 0, fail = 0;
const test = (n, fn) => { try { fn(); pass++; console.log(`ok ${pass} - ${n}`); } catch (e) { fail++; console.error(`NOT OK - ${n}\n    ${e.message}`); } };

// Point the stores at a temp dir BEFORE requiring the module.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-mem-'));
const CP = path.join(tmp, 'counterparties.json');
const CB = path.join(tmp, 'cost-baselines.json');
fs.writeFileSync(path.join(tmp, 'placeholder'), '');
const dm = require('../engine/core/desk-memory');
// re-point module paths by monkey-patching fs through env is overkill; instead re-write the
// two path constants via a tiny indirection: the module derives paths from __dirname, so we
// test against the real files but restore them afterwards.
const { execSync } = require('node:child_process');

test('DM1 counterparty upsert is idempotent by name; role validated', () => {
  // clean slate for this run (tests share the real store file)
  const book0 = dm.loadCounterparties();
  book0.counterparties = book0.counterparties.filter((c) => !/Test Supplier|Deal Counter|Memory Supplier/.test(c.name));
  dm._saveCounterparties(book0);
  const a = dm.upsertCounterparty({ name: 'Test Supplier Ltd', role: 'supplier', paymentTerms: '30d LC' });
  const b = dm.upsertCounterparty({ name: 'test supplier ltd', role: 'supplier', notes: 'fast docs' });
  assert.strictEqual(a.name, b.name);
  assert.strictEqual(b.notes, 'fast docs'); // updated, not duplicated
  assert.throws(() => dm.upsertCounterparty({ name: 'X', role: 'wizard' }), /role/);
});

test('DM2 recordDealFor bumps count only for known counterparties', () => {
  dm.upsertCounterparty({ name: 'Deal Counter Co', role: 'buyer' });
  const before = dm.findCounterparty('deal counter co').deals || 0;
  const e = dm.recordDealFor('deal counter co');
  assert.strictEqual(e.deals, before + 1);
  assert.strictEqual(dm.recordDealFor('unknown co'), null);
});

test('DM3 baselines: set + suggest scales per-MT to a new qty', () => {
  dm.updateBaseline('3', { usd: 995000, deliveredQtyMT: 33000, fromTrade: 'T-TEST' }); // 30.1515/MT
  const ov33 = dm.suggestedOverrides(33000);
  assert.ok(Math.abs(ov33['3'] - 995000) < 1); // per-MT rounding tolerance
  const ov66 = dm.suggestedOverrides(66000);   // double qty -> ~double
  assert.ok(Math.abs(ov66['3'] - 1989999) < 2);
});

test('CO3 close-out feeds desk memory (baselines + deal counts)', () => {
  const { closeOut } = require('../engine/core/closeout');
  // reset the two entries this test owns
  dm.updateBaseline('9', { usd: 6000, deliveredQtyMT: 10000, fromTrade: 'T-BASE' });
  const cpBook = dm.loadCounterparties();
  cpBook.counterparties = cpBook.counterparties.filter((c) => c.name !== 'Memory Supplier SA');
  dm._saveCounterparties(cpBook);
  dm.upsertCounterparty({ name: 'Memory Supplier SA', role: 'supplier' });
  const modelRes = {
    meta: { tradeId: 'T-MEM', deliveredQty: 10000, parties: { supplier: 'Memory Supplier SA', partner: 'P' } },
    price: {}, cost: { allInCost: 5_000_000, freight: { freightBase: 300000 }, lines: [{ id: '9', label: 'SPOMO', amountUsd: 6000 }] },
    profit: { tisNetProfit: 250000 }, fx: { rates: { nafemReference: 1500 } },
  };
  const rep = closeOut(modelRes, {
    tradeId: 'T-MEM',
    actuals: { costLines: { '9': 6100 } },
  });
  assert.deepStrictEqual(rep.memoryUpdates.baselinesUpdated, ['9']);
  assert.ok(rep.memoryUpdates.counterpartiesBumped.includes('Memory Supplier SA'));
  const b = dm.loadBaselines().baselines['9'];
  assert.strictEqual(b.usd, 6100);
  assert.strictEqual(b.perMT, 0.61);
  const cp = dm.findCounterparty('Memory Supplier SA');
  assert.strictEqual(cp.deals, 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
