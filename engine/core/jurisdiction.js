'use strict';

// JURISDICTION PLUGIN (Phase 4). Nigeria-specific VAT/WHT/levy/surcharge treatment becomes DATA in
// engine/config/jurisdictions/<id>.json. Default (missing/undefined trade.jurisdiction) is 'NG',
// whose excludeCostLineIds=[] and forceSurchargeOff=false make every existing number byte-for-byte
// identical. 'INTL' models an offshore B2B supply: NG-specific cost lines are excluded and the
// fossil-fuel surcharge is forced OFF. Line ids refer to cost-line-schema.json.
//
// BUNDLING NOTE: configs are required STATICALLY (one explicit require per jurisdiction), never
// via a dynamic template-string path — esbuild cannot follow dynamic requires, which broke every
// trade in the browser bundle ("unknown jurisdiction 'NG'"). Adding a jurisdiction = add its JSON
// + one require + one map entry.

const DEFAULT_ID = 'NG';
const CACHE = {};

const REGISTRY = {
  NG: require('../config/jurisdictions/ng.json'),
  INTL: require('../config/jurisdictions/intl.json'),
};

function load(id) {
  const jid = id || DEFAULT_ID;
  if (CACHE[jid]) return CACHE[jid];
  const cfg = REGISTRY[String(jid).toUpperCase()];
  if (!cfg) {
    throw new Error(`jurisdiction: unknown jurisdiction '${jid}' (known: ${Object.keys(REGISTRY).join(', ')})`);
  }
  const out = { ...cfg, excludeCostLineIds: (cfg.excludeCostLineIds || []).map(String) };
  CACHE[jid] = out;
  return out;
}

// Schema-level gate: drop jurisdiction-excluded lines BEFORE evaluation (policy as data).
function applyToSchema(lines, j) {
  if (!j.excludeCostLineIds.length) return lines;
  const excl = new Set(j.excludeCostLineIds);
  return lines.filter((e) => !excl.has(String(e.id)));
}

module.exports = { load, applyToSchema, DEFAULT_ID };
