'use strict';

// Storage cost-line collector — shared by the interactive dashboard (TISEngine.resolveStorageCostLines)
// and the test harness. Emits the `costLines` storage fields for ONE collected trade, handling BOTH the
// new per-line unit schema (throughputUnit/throughputRate, storageRentalUnit/storageRentalRate) AND
// legacy old-format data (throughputNgnPerMT = ₦/MT, storageRentalNgn = ₦ lump total, no unit fields).
//
// THE BUG THIS FIXES: the dashboard's collectTrade defaulted a loaded trade's storage unit to NGN_PER_L.
// Old-format fixtures / saved trades store a per-MT throughput rate (e.g. ₦4,000/MT) and a LUMP storage
// rental (e.g. ₦50,000,000) — neither of which is per-litre. Reinterpreting them as ₦/L runs them through
// the engine's `₦/L → USD via density at NAFEM` path (× litresPerMT), inflating storage ~1,183×
// (≈$394B on the depot sample). When a line is flagged `legacy` (loaded old-format, not yet edited by the
// trader) we emit ONLY its original old key and OMIT the unit fields, so engine/core/cost-buildup.js takes
// its backward-compat branch (legacyDerivation: ngn_per_mt / ngn_fixed) and reproduces the node engine's
// correct result byte-for-byte. New / blank / trader-edited lines emit the unit schema exactly as before.
//
// Input shape (all fields from the live form):
//   { depotOn: bool,
//     throughput:    { unit: 'NGN_PER_L'|'USD_PER_MT', rate: Number, legacy: bool },   // legacy rate = ₦/MT
//     storageRental: { unit: 'NGN_PER_L'|'USD_PER_MT', rate: Number, legacy: bool } }  // legacy rate = ₦ lump

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function unitOf(u) { return u === 'USD_PER_MT' ? 'USD_PER_MT' : 'NGN_PER_L'; }

function resolveStorageCostLines(input) {
  input = input || {};
  const depotOn = !!input.depotOn;
  const tp = input.throughput || {};
  const sr = input.storageRental || {};
  const out = {};

  // Throughput — legacy is ₦/MT (engine legacyDerivation: ngn_per_mt, key costLines.throughputNgnPerMT).
  if (tp.legacy) {
    out.throughputNgnPerMT = depotOn ? num(tp.rate) : 0;
  } else {
    out.throughputUnit = unitOf(tp.unit);
    out.throughputRate = depotOn ? num(tp.rate) : 0;
  }

  // Storage rental — legacy is a ₦ LUMP total (engine legacyDerivation: ngn_fixed, key storageRentalNgn).
  if (sr.legacy) {
    out.storageRentalNgn = depotOn ? num(sr.rate) : 0;
  } else {
    out.storageRentalUnit = unitOf(sr.unit);
    out.storageRentalRate = depotOn ? num(sr.rate) : 0;
  }
  return out;
}

module.exports = { resolveStorageCostLines };
