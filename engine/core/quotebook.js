'use strict';

const fs = require('node:fs');
const path = require('node:path');

// QUOTE BOOK — provenance-tracked index quotes for informally-sourced market data.
//
// A small desk sources Platts/Argus/ICE prints from human contacts. That is fine — but the
// provenance (WHO, HOW, WHEN, reliability tier) must travel WITH the quote so any priced deal
// can be audited later. This module is the single store + resolver:
//
//   STORE   : engine/config/quote-book.json  { quotes: [entry...] }
//   ENTRY   : { id, indexId, value, unit, asOf, capturedAt,
//               source: { name, org?, tier: 'A'|'B'|'C' }, method, notes?, status }
//   RESOLVE : latest ACTIVE quote per indexId (asOf desc, then capturedAt desc).
//             Trades may still pin explicit trade.indexQuotes — those ALWAYS win, and the
//             report shows both so a stale hand-typed quote vs book is visible.
//
// STALENESS: maxAgeHours per tier at resolve time (A 30h, B 18h, C 8h — informal sources go
// stale faster). Stale quotes resolve but carry status:'STALE' + ageHours; the report flags them.

const BOOK_PATH = path.join(__dirname, '..', 'config', 'quote-book.json');
const TIERS = ['A', 'B', 'C'];
const MAX_AGE_HOURS = { A: 30, B: 18, C: 8 };

// Store indirection (test hook): tests swap these to run against an in-memory book.
let STORE_LOAD = null; // () => book
let STORE_SAVE = null; // (book) => void

function load() {
  if (STORE_LOAD) return STORE_LOAD();
  let book;
  try {
    book = JSON.parse(fs.readFileSync(BOOK_PATH, 'utf8'));
  } catch (_) {
    return { version: 1, quotes: [] };
  }
  return { version: book.version || 1, quotes: Array.isArray(book.quotes) ? book.quotes : [] };
}

function save(book) {
  if (STORE_SAVE) return STORE_SAVE(book);
  fs.mkdirSync(path.dirname(BOOK_PATH), { recursive: true });
  fs.writeFileSync(BOOK_PATH, JSON.stringify(book, null, 2) + '\n', 'utf8');
}

// Test hook: pass fns or null to restore defaults.
function _useStore(loadFn, saveFn) { STORE_LOAD = loadFn; STORE_SAVE = saveFn; }

function nextId(book) {
  const nums = book.quotes
    .map((q) => /^Q-(\d+)$/.exec(q.id))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `Q-${String(n).padStart(4, '0')}`;
}

// Add a quote. Returns the stored entry. value>0, known tier required.
function add({ indexId, value, asOf, capturedAt, source, method, notes }) {
  if (!indexId || typeof indexId !== 'string') throw new Error('quotebook: indexId required');
  if (!(typeof value === 'number' && value > 0)) throw new Error(`quotebook: value must be > 0, got ${value}`);
  const tier = source && String(source.tier || 'B').toUpperCase();
  if (!TIERS.includes(tier)) throw new Error(`quotebook: source.tier must be A|B|C, got ${JSON.stringify(tier)}`);
  if (!asOf) throw new Error('quotebook: asOf (YYYY-MM-DD) required');

  const book = load();
  const entry = {
    id: nextId(book),
    indexId,
    value,
    unit: null, // resolved against indexes.json at use time; kept null to avoid duplication drift
    asOf,
    capturedAt: capturedAt || new Date().toISOString(),
    source: { name: (source && source.name) || 'unknown', org: (source && source.org) || '', tier },
    method: method || 'unspecified',
    notes: notes || '',
    status: 'ACTIVE',
  };
  book.quotes.push(entry);
  save(book);
  return entry;
}

function retire(id) {
  const book = load();
  const q = book.quotes.find((x) => x.id === id);
  if (!q) throw new Error(`quotebook: no quote '${id}'`);
  q.status = 'RETIRED';
  save(book);
  return q;
}

function ageHours(entry, now = new Date()) {
  const t = entry.capturedAt ? new Date(entry.capturedAt) : new Date(`${entry.asOf}T23:59:59Z`);
  return Math.max(0, (now - t) / 36e5);
}

// Decorate an entry with staleness info for its tier.
function withStaleness(entry, now = new Date()) {
  const hours = ageHours(entry, now);
  const cap = MAX_AGE_HOURS[entry.source && entry.source.tier] || MAX_AGE_HOURS.B;
  return {
    ...entry,
    ageHours: Number(hours.toFixed(1)),
    maxAgeHours: cap,
    freshness: entry.status !== 'ACTIVE' ? entry.status : (hours <= cap ? 'FRESH' : 'STALE'),
  };
}

// Latest ACTIVE quote per index. Returns { [indexId]: decoratedEntry } for the ids requested
// (or all present when ids omitted). Missing ids are simply absent — callers decide policy.
function latest(ids, now = new Date()) {
  const book = load();
  const want = ids ? new Set(ids) : null;
  const best = {};
  for (const q of book.quotes) {
    if (q.status !== 'ACTIVE') continue;
    if (want && !want.has(q.indexId)) continue;
    const cur = best[q.indexId];
    if (!cur || q.asOf > cur.asOf || (q.asOf === cur.asOf && q.capturedAt > cur.capturedAt)) {
      best[q.indexId] = withStaleness(q, now);
    }
  }
  return best;
}

// Multi-source consensus for one index: all ACTIVE quotes for asOf (or the latest date that has
// >=1 quote), median + spread + outlier flags. Guards a $2M decision against one bad number.
function consensus(indexId, { asOf, maxSpreadPct = 2 } = {}) {
  const book = load();
  const pool = book.quotes.filter((q) => q.status === 'ACTIVE' && q.indexId === indexId && (!asOf || q.asOf === asOf));
  if (!pool.length) return { indexId, count: 0 };
  const dates = [...new Set(pool.map((q) => q.asOf))].sort();
  const date = asOf || dates[dates.length - 1];
  const rows = pool.filter((q) => q.asOf === date).map((q) => withStaleness(q)).sort((a, b) => a.value - b.value);
  const vals = rows.map((r) => r.value);
  const n = vals.length;
  const median = n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
  const spread = vals[n - 1] - vals[0];
  const spreadPct = (spread / median) * 100;
  return {
    indexId, asOf: date, count: n,
    median: Number(median.toFixed(6)),
    min: vals[0], max: vals[n - 1],
    spread: Number(spread.toFixed(6)),
    spreadPct: Number(spreadPct.toFixed(4)),
    wideSpread: spreadPct > maxSpreadPct,
    quotes: rows.map((r) => ({ id: r.id, value: r.value, source: r.source.name, tier: r.source.tier, method: r.method, freshness: r.freshness })),
  };
}

// Resolve quotes FOR A TRADE: explicit trade.indexQuotes win; missing ones fill from the book.
// Returns { quotes, provenance } where provenance lists where every consumed number came from.
function resolveForTrade(trade, refIds) {
  const needed = new Set(refIds || []);
  const explicit = trade.indexQuotes || {};
  for (const k of Object.keys(explicit)) needed.add(k);
  // also collect formula refs so the report can show provenance even when the trade pins nothing
  const walkFormula = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walkFormula); return; }
    if (Array.isArray(node.components)) node.components.forEach((c) => { if (c.ref) needed.add(c.ref); });
    if (node.averaging && node.averaging.ref) needed.add(node.averaging.ref);
    Object.values(node).forEach(walkFormula);
  };
  walkFormula(trade.market && trade.market.purchasePrice);
  walkFormula(trade.revenueLegs);

  const fromBook = latest([...needed]);
  const quotes = {};
  const provenance = [];
  for (const id of needed) {
    if (typeof explicit[id] === 'number') {
      quotes[id] = explicit[id];
      provenance.push({ indexId: id, value: explicit[id], origin: 'TRADE-PINNED', note: 'pinned in trade file — overrides quote book' });
    } else if (fromBook[id]) {
      const e = fromBook[id];
      quotes[id] = e.value;
      provenance.push({
        indexId: id, value: e.value, origin: `BOOK ${e.id}`,
        source: `${e.source.name}${e.source.org ? ` (${e.source.org})` : ''} · tier ${e.source.tier} · ${e.method}`,
        asOf: e.asOf, ageHours: e.ageHours, freshness: e.freshness,
        warning: e.freshness === 'STALE' ? `older than ${e.maxAgeHours}h tier cap — re-verify before pricing` : null,
      });
    }
    // absent -> engine/pricing.js throws its named-index error downstream; nothing invented here.
  }
  return { quotes, provenance };
}

module.exports = { add, retire, load, latest, consensus, resolveForTrade, withStaleness, _useStore, MAX_AGE_HOURS };
