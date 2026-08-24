'use strict';

// JURISDICTION PLUGIN (Phase 4). Nigeria-specific VAT/WHT/levy/surcharge treatment becomes DATA in
// engine/config/jurisdictions/<id>.json. Default (missing/undefined trade.jurisdiction) is 'NG',
// whose excludeCostLineIds=[] and forceSurchargeOff=false make every existing number byte-for-byte
// identical. 'INTL' models an offshore B2B supply: NG-specific cost lines are excluded and the
// fossil-fuel surcharge is forced OFF. Line ids refer to cost-line-schema.json.

const DEFAULT_ID = 'NG';
const CACHE = {};

function load(id) {
  const jid = id || DEFAULT_ID;
  if (CACHE[jid]) return CACHE[jid];
  let cfg;
  try {
    cfg = require(`../config/jurisdictions/${jid}.json`);
  } catch (_) {
    throw new Error(`jurisdiction: unknown jurisdiction '${jid}' (expected engine/config/jurisdictions/${jid}.json)`);
  }
  cfg.excludeCostLineIds = (cfg.excludeCostLineIds || []).map(String);
  CACHE[jid] = cfg;
  return cfg;
}

// Schema-level gate: drop jurisdiction-excluded lines BEFORE evaluation (policy as data).
function applyToSchema(lines, j) {
  if (!j.excludeCostLineIds.length) return lines;
  const excl = new Set(j.excludeCostLineIds);
  return lines.filter((e) => !excl.has(String(e.id)));
}

module.exports = { load, applyToSchema, DEFAULT_ID };
