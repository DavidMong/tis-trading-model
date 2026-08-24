#!/usr/bin/env node
'use strict';

// DESK MEMORY CLI — counterparties + cost baselines.
//
//   node desk.js cp add "Example Supplier Co" --role supplier --terms "30d LC" --notes "fast docs"
//   node desk.js cp list
//   node desk.js baseline set <lineId> <usd> [--qty 33000] [--from TIS-JET-001]
//   node desk.js baseline list
//   node desk.js suggest --qty 33000          # costLineOverrides block from your last actuals

const deskMemory = require('./engine/core/desk-memory');
const SCHEMA = require('./engine/config/cost-line-schema.json');

const args = process.argv.slice(2);
const hr = (c = '-', n = 88) => c.repeat(n);
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

const [cmd, sub, ...rest] = args;

if (cmd === 'cp' && sub === 'add') {
  const name = rest[0];
  const f = parseFlags(rest.slice(1));
  const e = deskMemory.upsertCounterparty({ name, role: f.role, paymentTerms: f.terms, notes: f.notes });
  console.log(`saved ${e.name} (${e.role}, ${e.deals || 0} deals)`);
} else if (cmd === 'cp' && (sub === 'list' || !sub)) {
  const cps = deskMemory.loadCounterparties().counterparties;
  if (!cps.length) { console.log('no counterparties yet — node desk.js cp add "Name" --role supplier'); process.exit(0); }
  console.log(hr());
  for (const c of cps) {
    console.log(`  ${c.name.padEnd(28)} ${c.role.padEnd(9)} deals:${String(c.deals || 0).padStart(3)}  terms: ${c.paymentTerms || '—'}${c.notes ? `  · ${c.notes}` : ''}`);
  }
  console.log(hr()); console.log(`${cps.length} counterparty(ies)`);
} else if (cmd === 'baseline' && sub === 'set') {
  const e = deskMemory.updateBaseline(rest[0], { usd: Number(rest[1]), deliveredQtyMT: Number(parseFlags(rest.slice(2)).qty || 0), fromTrade: parseFlags(rest.slice(2)).from });
  console.log(`baseline #${rest[0]} = $${e.usd}${e.perMT != null ? ` ($${e.perMT}/MT)` : ''}`);
} else if (cmd === 'baseline' && (sub === 'list' || !sub)) {
  const b = deskMemory.loadBaselines().baselines;
  const ids = Object.keys(b);
  if (!ids.length) { console.log('no baselines yet — they fill automatically when you run a close-out'); process.exit(0); }
  console.log(hr());
  for (const id of ids.sort((x, y) => Number(x) - Number(y))) {
    const line = SCHEMA.lines.find((l) => String(l.id) === id);
    const v = b[id];
    console.log(`  #${String(id).padEnd(3)} ${(line ? line.label : '(unknown)').padEnd(34)} $${String(v.usd).padStart(12)}${v.perMT != null ? `  ($${v.perMT}/MT)` : ''}  from ${v.from || '?'} @ ${v.updatedAt.slice(0, 10)}`);
  }
  console.log(hr());
} else if (cmd === 'suggest') {
  const f = parseFlags(rest);
  const qty = Number(f.qty || 0) || null;
  const ov = deskMemory.suggestedOverrides(qty);
  if (!Object.keys(ov).length) { console.log('no baselines yet'); process.exit(0); }
  console.log('// paste into your trade JSON:');
  console.log(JSON.stringify({ costLineOverrides: Object.fromEntries(Object.entries(ov).map(([id, usd]) => [id, { amount: usd }] )) }, null, 2));
} else {
  console.log(`usage:
  node desk.js cp add "<name>" --role supplier|partner|buyer|bank|other [--terms "30d LC"] [--notes ...]
  node desk.js cp list
  node desk.js baseline set <costLineId> <usd> [--qty MT] [--from tradeId]
  node desk.js baseline list
  node desk.js suggest --qty <MT>     # costLineOverrides from last-deal actuals`);
}
