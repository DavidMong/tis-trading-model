'use strict';

const fs = require('node:fs');
const path = require('node:path');

// DESK MEMORY — counterparties + cost baselines.
//
// Two small stores that make every new trade start from history instead of a blank file:
//
//   COUNTERPARTIES  engine/config/counterparties.json
//     { counterparties: [ { name, role, paymentTerms, notes, deals } ] }
//     roles: supplier | partner | buyer | bank | other. `deals` counts completed trades
//     (incremented at close-out). Pure reference data — the engine never hardcodes names.
//
//   COST BASELINES  engine/config/cost-baselines.json
//     { baselines: { "<costLineId>": { usd, perMT, from, updatedAt } } }
//     Fed automatically by close-out: each actuals entry updates the running baseline for
//     that line so the NEXT recap starts from your last real number, not a guess.

const CP_PATH = path.join(__dirname, '..', 'config', 'counterparties.json');
const CB_PATH = path.join(__dirname, '..', 'config', 'cost-baselines.json');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

// ---- counterparties ----

const ROLES = ['supplier', 'partner', 'buyer', 'bank', 'other'];

function loadCounterparties() {
  return readJson(CP_PATH, { version: 1, counterparties: [] });
}

function _saveCounterparties(book) { writeJson(CP_PATH, book); } // test hook

function upsertCounterparty({ name, role, paymentTerms, notes }) {
  if (!name || typeof name !== 'string') throw new Error('desk-memory: name required');
  const r = String(role || 'other').toLowerCase();
  if (!ROLES.includes(r)) throw new Error(`desk-memory: role must be ${ROLES.join('|')}, got ${role}`);
  const book = loadCounterparties();
  const norm = name.trim().toLowerCase();
  let e = book.counterparties.find((c) => c.name.toLowerCase() === norm);
  if (!e) {
    e = { name: name.trim(), role: r, paymentTerms: '', notes: '', deals: 0 };
    book.counterparties.push(e);
  }
  if (r) e.role = r;
  if (paymentTerms != null) e.paymentTerms = paymentTerms;
  if (notes != null) e.notes = notes;
  writeJson(CP_PATH, book);
  return e;
}

function findCounterparty(name) {
  const norm = String(name || '').trim().toLowerCase();
  return loadCounterparties().counterparties.find((c) => c.name.toLowerCase() === norm) || null;
}

function recordDealFor(name) {
  const book = loadCounterparties();
  const norm = String(name || '').trim().toLowerCase();
  const e = book.counterparties.find((c) => c.name.toLowerCase() === norm);
  if (!e) return null;
  e.deals = (e.deals || 0) + 1;
  writeJson(CP_PATH, book);
  return e;
}

// ---- cost baselines ----

function loadBaselines() {
  return readJson(CB_PATH, { version: 1, _comment: 'Auto-updated at close-out. Baseline per cost-line id: the LAST ACTUAL amount — use as the starting estimate for the next deal.', baselines: {} });
}

function updateBaseline(lineId, { usd, deliveredQtyMT, fromTrade }) {
  if (!(typeof usd === 'number' && usd >= 0)) throw new Error('desk-memory: baseline usd must be >= 0');
  const book = loadBaselines();
  book.baselines[String(lineId)] = {
    usd,
    perMT: deliveredQtyMT > 0 ? Number((usd / deliveredQtyMT).toFixed(4)) : null,
    from: fromTrade || null,
    updatedAt: new Date().toISOString(),
  };
  writeJson(CB_PATH, book);
  return book.baselines[String(lineId)];
}

// Baseline table formatted for a new trade's costLineOverrides: per-MT actuals scaled to a
// delivered quantity (or raw USD when no qty given). Lines without baselines are absent.
function suggestedOverrides(deliveredQtyMT) {
  const book = loadBaselines();
  const out = {};
  for (const [id, b] of Object.entries(book.baselines)) {
    out[id] = deliveredQtyMT > 0 && b.perMT != null ? Number((b.perMT * deliveredQtyMT).toFixed(2)) : b.usd;
  }
  return out;
}

module.exports = {
  ROLES, loadCounterparties, _saveCounterparties, upsertCounterparty, findCounterparty, recordDealFor,
  loadBaselines, updateBaseline, suggestedOverrides,
};
