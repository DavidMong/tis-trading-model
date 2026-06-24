'use strict';

const { round } = require('./rounding');
const SCHEMA = require('../config/cost-line-schema.json');

// Cost-line build-up — fully CONFIG-DRIVEN. The per-line structure (type / base / rate-source /
// recoverable / status / legalRef) lives in engine/config/cost-line-schema.json, NOT in this code.
// This module is a generic evaluator: it reads each line's `type` and applies the matching base.
// NO rate, percentage, or %-vs-fixed assumption is hardcoded in the calculation logic — a policy
// change (rate edit, or a line flipping from "% of freight" to "fixed", or a base change) is a
// config edit. A trade may override any field per line via trade.costLineOverrides[id].
//
//   type: pct_of_freight | pct_of_cargo_value | pct_of_services | pct_of_LC | pct_of_sell | fixed | derived
//   derived derivation: per_mt | tc_hire | demurrage | credit_interest | wc_interest |
//                       ngn_per_mt | ngn_fixed | pct_of_depot_cargo_value | storage_unit_rate
//
// storage_unit_rate (Throughput, Storage rental): real terminal quoting is ONLY ₦/L (naira per litre)
// or $/MT (USD per tonne) — never ₦/MT. The line reads a per-line UNIT from the trade (e.unitFrom) and
// the rate from e.rateFromUnit:
//   NGN_PER_L  -> amountUsd = rate × storageQtyMT × litresPerMT / nafemRate   (₦/L → USD via density at NAFEM)
//   USD_PER_MT -> amountUsd = rate × storageQtyMT                              (direct USD, no conversion)
// BACKWARD-COMPAT: when no unit is set (existing fixtures / saved trades), the line falls back to its
// e.legacyDerivation (ngn_per_mt | ngn_fixed) using the legacy rate/amount path, computing byte-for-byte
// identically to before this toggle existed. New trades default to NGN_PER_L (set by the dashboard).
//
// Recoverable input VAT is EXCLUDED from landed cost (cash-flow timing only, s.155(4)); the
// irrecoverable proportion (1 - taxableSupplyProportion) IS a cost (s.155(4) proviso (a)).

function resolvePath(obj, pathStr) {
  if (!pathStr) return undefined;
  return pathStr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Legacy display category (preserves the existing report wording) derived from the config type.
function displayCategory(e) {
  if (e.group === 'storage') return 'storage';
  if (e.type === 'fixed') return 'flat';
  if (e.type === 'derived') {
    if (e.derivation === 'per_mt') return 'per_mt';
    if (e.derivation === 'tc_hire' || e.derivation === 'demurrage') return 'derived_freight';
    if (e.derivation === 'credit_interest' || e.derivation === 'wc_interest') return 'derived_financing';
    return 'derived';
  }
  return e.type; // pct_of_freight | pct_of_cargo_value | pct_of_services | pct_of_LC | pct_of_sell
}

function buildCostBuildup(trade, ctx) {
  const { cargoValue, deliveredQty, financing } = ctx;
  const tax = trade.tax;

  // Storage is active for DEPOT volume only (channel-driven, legacy depot.enabled fallback). Naira
  // depot costs convert to USD at NAFEM (RULE 1, 2026-06-23) — the same rate the naira proceeds settle
  // at — so the naira cost side is FX-exposed to NAFEM, not the parallel rate.
  const depotTonnes = ctx.depotTonnes || 0;
  const storageActive = depotTonnes > 0 || !!(trade.depot && trade.depot.enabled);
  const storageQty = depotTonnes > 0 ? depotTonnes : storageActive ? deliveredQty : 0;
  const unitFob = cargoValue / deliveredQty;
  const depotCargoValue = unitFob * storageQty;
  const nafemRate = ctx.nafemRate;
  const ngnStorageToUsd = (ngn) => {
    if (!storageActive || !ngn) return 0;
    if (!(typeof nafemRate === 'number' && Number.isFinite(nafemRate) && nafemRate > 0)) {
      throw new Error(`buildCostBuildup: nafemRate must be > 0 to convert naira depot costs, got ${nafemRate}`);
    }
    return ngn / nafemRate;
  };
  // Density (litres per MT) — needed ONLY to convert a ₦/L storage rate to USD. Sourced from the trade's
  // pricing conversion (already used for naira revenue legs); validated lazily so a $/MT or legacy-unit
  // line never requires it.
  const litresPerMT = ctx.litresPerMT != null
    ? ctx.litresPerMT
    : (trade.pricing && trade.pricing.conversion ? trade.pricing.conversion.litresPerMT : null);
  const requireLitresPerMT = () => {
    if (!(typeof litresPerMT === 'number' && Number.isFinite(litresPerMT) && litresPerMT > 0)) {
      throw new Error(`buildCostBuildup: litresPerMT must be > 0 to convert ₦/L storage costs, got ${litresPerMT}`);
    }
    return litresPerMT;
  };

  const tcRate = trade.freight.tcRatePerDay;
  const tcHire = tcRate * trade.freight.charterDays;
  const demurrage = tcRate * trade.freight.demurrageDays;
  const freightBase = tcHire + demurrage;

  // Default schema merged with per-trade overrides (policy edits without code change).
  const overrides = trade.costLineOverrides || {};
  const schema = SCHEMA.lines.map((e) => ({ ...e, ...(overrides[e.id] || overrides[String(e.id)] || {}) }));

  // Base resolver — the ONLY place a type maps to its base. Pure data, no per-line assumption.
  const baseFor = { pct_of_freight: freightBase, pct_of_cargo_value: cargoValue, pct_of_LC: financing.lc, pct_of_sell: ctx.sellValue || 0 };

  const rateOf = (e) => (e.rate != null ? e.rate : resolvePath(trade, e.rateFrom));
  const amountOf = (e) => (e.amount != null ? e.amount : resolvePath(trade, e.amountFrom));
  const statusOf = (e) => {
    if (e.statusFrom) { const s = resolvePath(trade, e.statusFrom); if (s) return s; }
    return e.status || 'OK';
  };

  function buildLine(e, servicesBucketSum) {
    const out = {
      id: e.id, label: e.label, type: e.type, derivation: e.derivation || null,
      category: displayCategory(e), base: null, rate: null, currency: 'USD',
      amountUsd: 0, ngnAmount: null, recoverable: !!e.recoverable, taxLine: !!e.taxLine, status: statusOf(e), legalRef: e.legalRef || null,
    };
    const isStorage = e.group === 'storage';

    if (isStorage && !storageActive) {
      // Inactive storage line: zero, USD, no FX status. (rate retained for display parity.)
      // A lump-sum line (ngn_fixed, or storage_unit_rate falling back to it) carries no per-unit rate.
      const lumpSum = e.derivation === 'ngn_fixed'
        || (e.derivation === 'storage_unit_rate' && e.legacyDerivation === 'ngn_fixed');
      out.rate = lumpSum ? null : (rateOf(e) ?? null);
      out.base = 0; out.amountUsd = 0; out.status = 'OK';
      return out;
    }
    if (isStorage) out.status = e.activeStatus || out.status;

    switch (e.type) {
      case 'fixed':
        out.amountUsd = round(amountOf(e), 2);
        break;
      case 'pct_of_freight':
      case 'pct_of_cargo_value':
      case 'pct_of_LC':
      case 'pct_of_sell': {
        const rate = rateOf(e);
        out.rate = rate; out.base = baseFor[e.type]; out.amountUsd = round(rate * baseFor[e.type], 2);
        break;
      }
      case 'pct_of_services': {
        const rate = rateOf(e);
        out.rate = rate; out.base = servicesBucketSum; out.amountUsd = round(rate * servicesBucketSum, 2);
        break;
      }
      case 'derived':
        switch (e.derivation) {
          case 'per_mt': { const rate = rateOf(e); out.rate = rate; out.base = deliveredQty; out.amountUsd = round(rate * deliveredQty, 2); break; }
          case 'tc_hire': out.rate = tcRate; out.base = trade.freight.charterDays; out.amountUsd = round(tcHire, 2); break;
          case 'demurrage': out.rate = tcRate; out.base = trade.freight.demurrageDays; out.amountUsd = round(demurrage, 2); break;
          case 'credit_interest': out.rate = financing.creditRate; out.base = financing.lc; out.amountUsd = round(financing.creditInterest, 2); break;
          case 'wc_interest': out.rate = financing.creditRate; out.base = financing.wc; out.amountUsd = round(financing.wcInterest, 2); break;
          case 'ngn_per_mt': { const rate = rateOf(e); const ngn = (rate || 0) * storageQty; out.rate = rate; out.base = storageQty; out.currency = 'NGN'; out.ngnAmount = round(ngn, 2); out.amountUsd = round(ngnStorageToUsd(ngn), 2); break; }
          case 'ngn_fixed': { const ngn = amountOf(e) || 0; out.currency = 'NGN'; out.ngnAmount = round(ngn, 2); out.amountUsd = round(ngnStorageToUsd(ngn), 2); break; }
          case 'storage_unit_rate': {
            const unit = resolvePath(trade, e.unitFrom);
            if (unit === 'NGN_PER_L' || unit === 'USD_PER_MT') {
              const rate = resolvePath(trade, e.rateFromUnit);
              out.rate = rate != null ? rate : null;
              out.base = storageQty;
              if (unit === 'NGN_PER_L') {
                const lpm = requireLitresPerMT();
                const ngn = (rate || 0) * storageQty * lpm; // ₦/L × MT × L/MT = NGN total
                out.currency = 'NGN'; out.ngnAmount = round(ngn, 2); out.amountUsd = round(ngnStorageToUsd(ngn), 2);
              } else { // USD_PER_MT — direct, no FX conversion
                out.currency = 'USD'; out.ngnAmount = null; out.amountUsd = round((rate || 0) * storageQty, 2);
              }
            } else {
              // BACKWARD-COMPAT: no unit set -> legacy derivation, byte-for-byte identical to pre-toggle.
              if (e.legacyDerivation === 'ngn_per_mt') {
                const rate = rateOf(e); const ngn = (rate || 0) * storageQty;
                out.rate = rate; out.base = storageQty; out.currency = 'NGN';
                out.ngnAmount = round(ngn, 2); out.amountUsd = round(ngnStorageToUsd(ngn), 2);
              } else if (e.legacyDerivation === 'ngn_fixed') {
                const ngn = amountOf(e) || 0; out.currency = 'NGN';
                out.ngnAmount = round(ngn, 2); out.amountUsd = round(ngnStorageToUsd(ngn), 2);
              } else {
                throw new Error(`buildCostBuildup: storage_unit_rate line ${e.id} has no unit and unknown legacyDerivation '${e.legacyDerivation}'`);
              }
            }
            break;
          }
          case 'pct_of_depot_cargo_value': { const rate = rateOf(e); out.rate = rate; out.base = depotCargoValue; out.amountUsd = round(rate * depotCargoValue, 2); break; }
          default: throw new Error(`buildCostBuildup: unknown derivation '${e.derivation}' for line ${e.id}`);
        }
        break;
      default:
        throw new Error(`buildCostBuildup: unknown type '${e.type}' for line ${e.id}`);
    }
    return out;
  }

  // Pass 1: everything except pct_of_services (which needs the services bucket).
  const lines = schema.filter((e) => e.type !== 'pct_of_services').map((e) => buildLine(e, 0));

  // Services bucket = sum of named line ids (configurable composition).
  const byIdPre = Object.fromEntries(lines.map((l) => [l.id, l]));
  const bucketIds = trade.servicesBucket;
  const bucketComposition = bucketIds.map((id) => ({ id, label: byIdPre[id].label, amount: byIdPre[id].amountUsd }));
  const servicesBucketSum = bucketComposition.reduce((s, x) => s + x.amount, 0);

  // Pass 2: pct_of_services lines.
  for (const e of schema.filter((e) => e.type === 'pct_of_services')) lines.push(buildLine(e, servicesBucketSum));

  lines.sort((a, b) => a.id - b.id);
  const byId = Object.fromEntries(lines.map((l) => [l.id, l]));

  // Input VAT apportionment (s.155(4) proviso (a)).
  const recoverableLines = lines.filter((l) => l.recoverable);
  const grossRecoverable = recoverableLines.reduce((s, l) => s + l.amountUsd, 0);
  const recoverableVat = round(grossRecoverable * tax.taxableSupplyProportion, 2);
  const irrecoverableVat = round(grossRecoverable * (1 - tax.taxableSupplyProportion), 2);

  // Landed cost: EXCLUDES the recoverable VAT proportion (timing only), INCLUDES the irrecoverable
  // proportion. Split base (excl storage) from storage to expose ex-ship vs depot landed.
  const storageTotal = round(lines.filter((l) => l.category === 'storage').reduce((s, l) => s + l.amountUsd, 0), 2);
  const baseNonRecoverable = lines.filter((l) => !l.recoverable && l.category !== 'storage').reduce((s, l) => s + l.amountUsd, 0);
  const baseAllIn = round(baseNonRecoverable + irrecoverableVat, 2);
  const allInCost = round(baseAllIn + storageTotal, 2);
  const landedCostPerMT = allInCost / deliveredQty;
  const exShipLandedPerMT = baseAllIn / deliveredQty;
  const depotLandedPerMT = depotTonnes > 0 ? exShipLandedPerMT + storageTotal / depotTonnes : exShipLandedPerMT;

  return {
    lines,
    byId,
    freight: { tcHire: round(tcHire, 2), demurrage: round(demurrage, 2), freightBase: round(freightBase, 2) },
    servicesBucket: { ids: bucketIds, composition: bucketComposition, sum: round(servicesBucketSum, 2) },
    recoverableVat: {
      lines: recoverableLines.map((l) => ({ id: l.id, label: l.label, amount: l.amountUsd })),
      taxableSupplyProportion: tax.taxableSupplyProportion,
      grossRecoverable: round(grossRecoverable, 2),
      recoverable: recoverableVat,
      irrecoverable: irrecoverableVat,
    },
    allInCost,
    landedCostPerMT,
    baseAllIn,
    storageTotal,
    exShipLandedPerMT,
    depotLandedPerMT,
    depotTonnes,
    storageActive,
  };
}

module.exports = { buildCostBuildup };
