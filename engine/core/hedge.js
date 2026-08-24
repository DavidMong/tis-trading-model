'use strict';

const { round, roundToLots } = require('./rounding');

// PHASE 1: hedge instrument comes from the index REGISTRY (via trade.hedge.indexId or the purchase
// price's floating reference passed as ctx.instrumentId), NOT hardcoded. Falls back to the legacy
// ICE Gasoil 100 MT/lot so existing trades stay byte-for-byte identical.
let REGISTRY = null;
try { REGISTRY = require('../config/indexes.json'); } catch (_) { REGISTRY = null; }

function resolveInstrumentSpec(instrumentId) {
  if (!REGISTRY || !instrumentId) return { lotSize: 100, lotUnit: 'MT', label: 'ICE Gasoil swap (legacy default)' };
  const e = REGISTRY.indexes.find((x) => x.id === instrumentId);
  const instr = e && (e.hedgeInstrument
    || (e.hedgeProxy && (() => { const p = REGISTRY.indexes.find((q) => q.id === e.hedgeProxy); return p && p.hedgeInstrument; })()));
  return instr
    ? { lotSize: instr.lotSize, lotUnit: instr.lotUnit,
        label: `${instr.exchange} ${instr.symbol} (${e.id}${e.hedgeProxy ? `, proxy for ${e.id}` : ''}, ${instr.lotSize} ${instr.lotUnit}/lot)` }
    : { lotSize: 100, lotUnit: 'MT', label: 'ICE Gasoil swap (legacy default)' };
}

// Conversion factor from MT into a lot unit (BBL/L/MMBTU), sourced from the product record.
function lotUnitFactor(lotUnit, trade) {
  if (lotUnit === 'MT') return 1;
  const resolved = (trade.product && trade.product.id && require('./products').resolveProduct(trade)) || trade.product || {};
  const c = resolved.conversions || (trade.pricing && trade.pricing.conversion) || {};
  const k = { BBL: 'bblPerMT', L: 'litresPerMT', MMBTU: 'mmbtuPerMT' }[lotUnit];
  return k ? c[k] : undefined;
}

// ICE Gasoil swap hedge — dual route, configurable. Contract = 100 MT/lot, USD/MT.
//
//   Route A 'bank_book'   : bank books the swap in-house -> NO extra capital / margin.
//                           Cost = bank spread only (+ per-MT swap fee).
//   Route B 'third_party' : bank PROVIDES the swap margin as part of financing (alongside LC+WC,
//                           NOT partner equity) -> adds to the bank advance + interest, plus a
//                           third-party fee.
//   In BOTH routes the swap margin is bank-provided, never partner equity.
//
//   Effective ICE cost = hedged tonnes x fixedPrice + unhedged tonnes x live ICE.
//   hedgedVolume default = TIS retained ex-ship tonnes (rounded to whole lots).
//
// PLACEHOLDERS (flag + verify before any live hedge): feePerMT, initialMarginPct, fixedPrice (~ locked ICE).

function buildHedge(trade, ctx) {
  const h = trade.hedge || {}; // hedging is optional/default-off — missing trade.hedge means unhedged
  // Hedge reference: explicit ctx override (indexed purchases) else legacy market.ice.value.
  const liveIce = ctx.liveRef != null ? ctx.liveRef
    : (trade.market && trade.market.ice && trade.market.ice.value != null ? trade.market.ice.value
      : (() => { throw new Error('buildHedge: no hedge reference (indexed trades pass ctx.liveRef; legacy trades set market.ice.value)'); })());
  const retained = ctx.tisRetainedTonnes;

  const desired = h.hedgedVolumeMT != null ? h.hedgedVolumeMT : retained;
  const spec = resolveInstrumentSpec(h.indexId || ctx.instrumentId || null);
  // Lot-unit awareness: MT-lotted instruments round MT directly; BBL/L/MMBTU-lotted instruments
  // convert desired tonnage into lot units first (product conversions), then back to MT.
  let lots, hedgedTonnes;
  const luf = lotUnitFactor(spec.lotUnit, trade);
  if (spec.lotUnit === 'MT') ({ lots, tonnes: hedgedTonnes } = roundToLots(desired, spec.lotSize));
  else {
    if (!(typeof luf === 'number' && luf > 0)) {
      throw new Error(`buildHedge: instrument lot unit '${spec.lotUnit}' needs a positive product conversion factor`);
    }
    lots = Math.ceil((desired * luf) / spec.lotSize);
    hedgedTonnes = (lots * spec.lotSize) / luf;
  }
  const fixedPrice = h.fixedPrice != null ? h.fixedPrice : liveIce; // PLACEHOLDER ~ locked ICE

  // CANONICAL hedged-vs-unhedged comparison: both sides are priced on the SAME volume basis — the
  // physical exposure (TIS retained tonnes). Any hedge beyond retained is a separate speculative
  // position (overHedge) and is NOT folded into the physical-cost comparison, so the delta stays
  // apples-to-apples. (The FX hedge will mirror this pattern.)
  const hedgedPhysical = Math.min(hedgedTonnes, retained); // hedged portion of the physical exposure
  const overHedgeTonnes = round(Math.max(hedgedTonnes - retained, 0), 4); // speculative excess
  const unhedgedTonnes = round(Math.max(retained - hedgedPhysical, 0), 4);

  const notional = hedgedTonnes * fixedPrice; // swap traded on the full hedged volume
  const swapFee = (h.feePerMT || 0) * hedgedTonnes; // per-MT fee on the full hedged volume, both routes

  const effectiveIceCost = hedgedPhysical * fixedPrice + unhedgedTonnes * liveIce; // on retained basis
  const unhedgedIceCost = retained * liveIce; // same retained basis

  const routeType = h.route || 'bank_book'; // default route when unconfigured (mirrors build-interactive.js)
  const route = { type: routeType, initialMargin: 0, bankProvidedMargin: 0, marginInterest: 0, thirdPartyFee: 0, bankSpread: 0 };
  if (routeType === 'bank_book') {
    route.bankSpread = (h.bankSpreadPerMT || 0) * hedgedTonnes;
  } else if (routeType === 'third_party') {
    const initialMargin = (h.initialMarginPct || 0) * notional; // bank-provided, NOT partner equity
    const dayCountBasis = trade.financing.dayCountBasis ?? 365; // mirror financing.js (Actual/365|360)
    const marginInterest = (initialMargin * trade.financing.creditRate * trade.financing.financingDays) / dayCountBasis;
    route.initialMargin = round(initialMargin, 2);
    route.bankProvidedMargin = round(initialMargin, 2);
    route.marginInterest = round(marginInterest, 2);
    route.thirdPartyFee = h.thirdPartyFee || 0;
  } else {
    throw new Error(`buildHedge: unknown route '${routeType}' (expected 'bank_book' or 'third_party')`);
  }

  const extraFinancingCost = round(route.marginInterest + route.thirdPartyFee + route.bankSpread + swapFee, 2);

  return {
    route: routeType,
    instrument: spec.label,
    lotSize: spec.lotSize,
    lotUnit: spec.lotUnit,
    lots,
    hedgedTonnes,
    hedgedPhysical: round(hedgedPhysical, 4),
    overHedgeTonnes,
    unhedgedTonnes,
    comparisonBasisTonnes: round(retained, 4),
    fixedPrice,
    liveIce,
    notional: round(notional, 2),
    swapFee: round(swapFee, 2),
    effectiveIceCost: round(effectiveIceCost, 2),
    unhedgedIceCost: round(unhedgedIceCost, 2),
    iceCostDelta: round(effectiveIceCost - unhedgedIceCost, 2),
    routeEconomics: route,
    bankProvidedMargin: route.bankProvidedMargin,
    extraFinancingCost,
    placeholders: {
      feePerMT: h.feePerMT,
      initialMarginPct: h.initialMarginPct,
      fixedPrice: { value: fixedPrice, note: 'PLACEHOLDER ~ locked ICE — verify before live hedge' },
    },
    status: 'PLACEHOLDER (verify fee / margin / fixedPrice before live hedge)',
  };
}

module.exports = { buildHedge };
