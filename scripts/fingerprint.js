'use strict';

// NUMERIC FINGERPRINT over every sample/reference trade. For each trade we run its declared flow
// (engine/flows via meta.flow) and recursively extract EVERY finite number in the result, keyed by
// its dotted path, into a stable-sorted list, then sha256 the serialization. This isolates numeric
// drift from cosmetic string changes (notes/labels), which is exactly what the nafem-and-max-foregone
// safety rule needs: the all-USD ex-ship trades (reference / straight-exship) MUST be byte-for-byte
// identical on NUMBERS before vs after the change; naira/depot trades are expected to move.
//
//   node scripts/fingerprint.js            -> prints per-trade hashes + the all-USD guard set
//   node scripts/fingerprint.js --full     -> also dumps every (path = value) line per trade

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { computeEquityPartner } = require('../engine/flows/equity-partner');
const { computeStraightExship } = require('../engine/flows/straight-exship');
const { computeFullDepotResale } = require('../engine/flows/full-depot-resale');
const { computeTrade } = require('../engine/flows/trade');

const FLOWS = {
  'equity-partner': computeEquityPartner,
  'straight-exship': computeStraightExship,
  'full-depot-resale': computeFullDepotResale,
  trade: computeTrade,
};

// All-USD ex-ship trades (no naira legs) — these MUST NOT move numerically.
const ALL_USD = new Set(['reference-trade-001', 'sample-equity-partner', 'sample-exship-tis']);

// Expected combined hash of the all-USD guard set. The run exits non-zero on mismatch, so this baseline
// is enforced, not tribal. RE-BASELINED 2026-06-23: the annualised-return denominator changed from cargo
// value / equity slot to the bank LC mobilised (financing.lc) for both equity providers. This is the
// ONLY all-USD movement, and it moved ONLY the metric — verified profit/cost/tax byte-for-byte identical:
//   sample-exship-tis: annualReturnBase 2,287,500 -> 6,862,500 ; tisAnnualisedReturn 6.749 -> 2.2497
//   (reference-trade-001 and sample-equity-partner run computeEquityPartner, untouched -> hash unchanged)
//   OLD guard: b622d3cbdc8e53915687aa0403dd37d4d1b4c5280d1bd2dffc3ade1b0cafc398
const EXPECTED_GUARD = 'a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162';

function collectNumbers(obj, prefix, out) {
  if (obj == null) return;
  if (typeof obj === 'number') {
    if (Number.isFinite(obj)) out.push(`${prefix}=${obj}`);
    else out.push(`${prefix}=${String(obj)}`); // surface NaN/Infinity if any leaks
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectNumbers(v, `${prefix}[${i}]`, out));
    return;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj).sort()) collectNumbers(obj[k], prefix ? `${prefix}.${k}` : k, out);
  }
}

function fingerprintTrade(file) {
  const trade = require(path.resolve(__dirname, '..', 'trades', file));
  const flowName = trade.meta && trade.meta.flow;
  const compute = FLOWS[flowName];
  if (!compute) throw new Error(`${file}: unknown flow '${flowName}'`);
  // skipHedgeCompare keeps the recursion-guarded comparison out (it re-runs the engine and just
  // mirrors the same numbers); the fingerprint is over the primary result only.
  const res = compute(trade, { skipHedgeCompare: true });
  const lines = [];
  collectNumbers(res, '', lines);
  lines.sort();
  const hash = crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
  return { name: file.replace(/\.json$/, ''), flow: flowName, count: lines.length, hash, lines };
}

const files = fs.readdirSync(path.resolve(__dirname, '..', 'trades')).filter((f) => f.endsWith('.json')).sort();
const full = process.argv.includes('--full');

console.log('NUMERIC FINGERPRINT (sha256 over all finite numbers in each flow result)\n');
const all = [];
for (const f of files) {
  const fp = fingerprintTrade(f);
  all.push(fp);
  const guard = ALL_USD.has(fp.name) ? '  [ALL-USD GUARD]' : '';
  console.log(`  ${fp.name.padEnd(26)} ${fp.flow.padEnd(20)} n=${String(fp.count).padStart(4)}  ${fp.hash}${guard}`);
  if (full) for (const l of fp.lines) console.log(`      ${l}`);
}

// Combined hash of ONLY the all-USD guard set — the single number the safety rule turns on.
const guardHash = crypto.createHash('sha256')
  .update(all.filter((a) => ALL_USD.has(a.name)).map((a) => `${a.name}:${a.hash}`).join('|'))
  .digest('hex');
console.log(`\n  ALL-USD GUARD COMBINED: ${guardHash}`);

if (guardHash === EXPECTED_GUARD) {
  console.log('  ALL-USD GUARD: OK (matches expected baseline)');
} else {
  console.error(`  ALL-USD GUARD: MISMATCH — expected ${EXPECTED_GUARD}`);
  console.error('  All-USD trades moved numerically. If unintended, STOP and investigate before committing.');
  process.exit(1);
}
