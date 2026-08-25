'use strict';

const fs = require('node:fs');
const path = require('node:path');

// FX RATE MEMORY — dated NAFEM/parallel prints with provenance, mirroring the
// quote book's discipline for the desk's single biggest conversion factor.
//
//   STORE  engine/config/fx-book.json
//   ENTRY  { date, nafem, parallel?, source, notes }
//   LATEST = the most recent entry by date (ties broken by insertion order).
//
// Used by: depot-price calculator defaults, trade prefill suggestions, and any
// "what was FX when we priced this?" audit question.

const BOOK_PATH = path.join(__dirname, '..', 'config', 'fx-book.json');

function load() {
  try {
    const b = JSON.parse(fs.readFileSync(BOOK_PATH, 'utf8'));
    return { version: b.version || 1, entries: Array.isArray(b.entries) ? b.entries : [] };
  } catch (_) {
    return { version: 1, entries: [] };
  }
}

function save(book) {
  fs.mkdirSync(path.dirname(BOOK_PATH), { recursive: true });
  fs.writeFileSync(BOOK_PATH, JSON.stringify(book, null, 2) + '\n', 'utf8');
}

function add({ date, nafem, parallel, source, notes }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('fxbook: date must be YYYY-MM-DD');
  if (!(typeof nafem === 'number' && nafem > 0)) throw new Error(`fxbook: nafem must be > 0, got ${nafem}`);
  if (parallel != null && !(typeof parallel === 'number' && parallel > 0)) throw new Error('fxbook: parallel must be > 0 when present');
  const book = load();
  // one print per day — a later same-day entry replaces the earlier one
  const existing = book.entries.findIndex((e) => e.date === date);
  const entry = { date, nafem, parallel: parallel ?? null, source: source || 'unknown', notes: notes || '' };
  if (existing >= 0) book.entries[existing] = entry;
  else book.entries.push(entry);
  book.entries.sort((a, b) => a.date.localeCompare(b.date));
  save(book);
  return entry;
}

function latest() {
  const { entries } = load();
  return entries.length ? entries[entries.length - 1] : null;
}

module.exports = { load, save, add, latest };
