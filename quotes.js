#!/usr/bin/env node
'use strict';

// QUOTE BOOK CLI — capture and inspect provenance-tracked index quotes.
//
//   node quotes.js add PLATTS_JET_CARGO_NW 702.25 --asof 2026-08-24 --source "Kola" --org "Mercuria desk" --tier B --method "WhatsApp voice"
//   node quotes.js list [indexId] [--all]
//   node quotes.js show PLATTS_JET_CARGO_NW          # consensus view (median/spread/outliers)
//   node quotes.js retire Q-0007
//
// Trades resolve against the latest ACTIVE quote per index unless they pin trade.indexQuotes.

const quotebook = require('./engine/core/quotebook');
const REGISTRY = require('./engine/config/indexes.json');

const args = process.argv.slice(2);
const cmd = args[0];

const hr = (c = '-', n = 88) => c.repeat(n);
const knownIds = () => REGISTRY.indexes.map((x) => x.id);

function parseFlags(rest) {
  const f = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) { f[key] = true; }
      else { f[key] = next; i++; }
    }
  }
  return f;
}

function checkIndex(id) {
  if (!knownIds().includes(id)) {
    console.error(`Unknown index '${id}'. Known: ${knownIds().join(', ')}`);
    process.exit(1);
  }
}

if (cmd === 'add') {
  const [indexId, valueStr] = args.slice(1);
  checkIndex(indexId);
  const value = Number(valueStr);
  const f = parseFlags(args.slice(3));
  try {
    const e = quotebook.add({
      indexId, value,
      asOf: f.asof || new Date().toISOString().slice(0, 10),
      capturedAt: f.at,
      source: { name: f.source || 'unknown', org: f.org || '', tier: f.tier || 'B' },
      method: f.method,
      notes: f.notes,
    });
    console.log(`captured ${e.id}: ${e.indexId} = ${e.value} (${e.asOf}, ${e.source.name}, tier ${e.source.tier})`);
  } catch (err) { console.error(err.message); process.exit(1); }
} else if (cmd === 'list') {
  const filter = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const all = args.includes('--all');
  const book = quotebook.load();
  const rows = book.quotes
    .filter((q) => (!filter || q.indexId === filter) && (all || q.status === 'ACTIVE'))
    .sort((a, b) => (a.asOf + a.capturedAt).localeCompare(b.asOf + b.capturedAt));
  if (!rows.length) { console.log('no quotes'); process.exit(0); }
  console.log(hr());
  for (const q of rows.reverse()) {
    const d = quotebook.withStaleness(q);
    console.log(`${q.id}  ${q.indexId.padEnd(32)} ${String(q.value).padStart(10)}  asOf ${q.asOf}  ${q.source.name}${q.source.org ? ` (${q.source.org})` : ''} tier ${q.source.tier} · ${q.method}${d.freshness !== 'FRESH' ? ` [${d.freshness}]` : ''}`);
  }
  console.log(hr()); console.log(`${rows.length} quote(s)${all ? '' : ' (ACTIVE only — --all to include retired)'}`);
} else if (cmd === 'show' || cmd === 'consensus') {
  const indexId = args[1];
  checkIndex(indexId);
  const c = quotebook.consensus(indexId);
  if (!c.count) { console.log(`no active quotes for ${indexId}`); process.exit(0); }
  console.log(hr('='));
  console.log(`CONSENSUS ${c.indexId}  asOf ${c.asOf}`);
  console.log(hr('='));
  for (const q of c.quotes) {
    console.log(`  ${String(q.value).padStart(10)}  ${q.source} (tier ${q.tier}, ${q.method})${q.freshness !== 'FRESH' ? ` [${q.freshness}]` : ''}`);
  }
  console.log(hr('-'));
  console.log(`  n=${c.count}  median ${c.median}  range ${c.min}–${c.max}  spread ${c.spread} (${c.spreadPct}%)${c.wideSpread ? '  ⚠ WIDE SPREAD — verify before pricing' : ''}`);
} else if (cmd === 'retire') {
  try {
    const q = quotebook.retire(args[1]);
    console.log(`retired ${q.id} (${q.indexId} = ${q.value})`);
  } catch (err) { console.error(err.message); process.exit(1); }
} else {
  console.log(`usage:
  node quotes.js add <indexId> <value> --asof YYYY-MM-DD --source NAME [--org ORG] [--tier A|B|C] [--method HOW] [--notes ...]
  node quotes.js list [indexId] [--all]
  node quotes.js show <indexId>       # consensus: median / spread / outliers
  node quotes.js retire <id>
known indexes: ${knownIds().join(', ')}`);
}
