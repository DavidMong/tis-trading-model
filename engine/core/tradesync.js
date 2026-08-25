'use strict';

const fs = require('node:fs');
const path = require('node:path');

// TRADE SYNC STORE — server-side mirror of the browser localStorage trades, so a
// phone and a laptop see the same deal list. Same shape as TISStorage payloads:
//   { version: 1, trades: { name: { snap, savedAt } }, defaults }
// Merge semantics match importTradesFromFile: same-name overwrite, rest kept.

const FILE = path.join(__dirname, '..', 'config', 'cloud-trades.json');

function load() {
  try {
    const b = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!b || typeof b !== 'object') throw new Error('shape');
    return { version: 1, trades: b.trades && typeof b.trades === 'object' ? b.trades : {}, defaults: b.defaults || null };
  } catch (_) {
    return { version: 1, trades: {}, defaults: null };
  }
}

function save(book) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(book, null, 2) + '\n', 'utf8');
}

// payload: { version:1, trades:{name:{snap,savedAt}}, defaults? }
// mode: 'merge' (default — same-name overwrite) | 'replace' (full replace)
function merge(payload, mode = 'merge') {
  const book = load();
  const incoming = payload.trades || {};
  if (mode === 'replace') book.trades = {};
  let added = 0, updated = 0;
  for (const [name, entry] of Object.entries(incoming)) {
    if (!entry || typeof entry !== 'object' || !entry.snap) continue;
    if (book.trades[name]) updated++; else added++;
    book.trades[name] = { snap: entry.snap, savedAt: entry.savedAt || Date.now() };
  }
  if (payload.defaults && typeof payload.defaults === 'object') book.defaults = payload.defaults;
  save(book);
  return { added, updated, total: Object.keys(book.trades).length };
}

module.exports = { load, save, merge };
