'use strict';

const { round, roundToLots } = require('./rounding');

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
  const h = trade.hedge;
  const liveIce = trade.market.ice.value;
  const retained = ctx.tisRetainedTonnes;

  const desired = h.hedgedVolumeMT != null ? h.hedgedVolumeMT : retained;
  const { lots, tonnes: hedgedTonnes } = roundToLots(desired, 100);
  const fixedPrice = h.fixedPrice != null ? h.fixedPrice : liveIce; // PLACEHOLDER ~ locked ICE

  // CANONICAL hedged-vs-unhedged comparison: both sides are priced on the SAME volume basis — the
  // physical exposure (TIS retained tonnes). Any hedge beyond retained is a separate speculative
  // position (overHedge) and is NOT folded into the physical-cost comparison, so the delta stays
  // apples-to-apples. (The FX hedge will mirror this pattern.)
  const hedgedPhysical = Math.min(hedgedTonnes, retained); // hedged portion of the physical exposure
  const overHedgeTonnes = round(Math.max(hedgedTonnes - retained, 0), 4); // speculative excess
  const unhedgedTonnes = round(Math.max(retained - hedgedPhysical, 0), 4);

  const notional = hedgedTonnes * fixedPrice; // swap traded on the full hedged volume
  const swapFee = h.feePerMT * hedgedTonnes; // per-MT fee on the full hedged volume, both routes

  const effectiveIceCost = hedgedPhysical * fixedPrice + unhedgedTonnes * liveIce; // on retained basis
  const unhedgedIceCost = retained * liveIce; // same retained basis

  const route = { type: h.route, initialMargin: 0, bankProvidedMargin: 0, marginInterest: 0, thirdPartyFee: 0, bankSpread: 0 };
  if (h.route === 'bank_book') {
    route.bankSpread = (h.bankSpreadPerMT || 0) * hedgedTonnes;
  } else if (h.route === 'third_party') {
    const initialMargin = h.initialMarginPct * notional; // bank-provided, NOT partner equity
    const dayCountBasis = trade.financing.dayCountBasis ?? 365; // mirror financing.js (Actual/365|360)
    const marginInterest = (initialMargin * trade.financing.creditRate * trade.financing.financingDays) / dayCountBasis;
    route.initialMargin = round(initialMargin, 2);
    route.bankProvidedMargin = round(initialMargin, 2);
    route.marginInterest = round(marginInterest, 2);
    route.thirdPartyFee = h.thirdPartyFee || 0;
  } else {
    throw new Error(`buildHedge: unknown route '${h.route}' (expected 'bank_book' or 'third_party')`);
  }

  const extraFinancingCost = round(route.marginInterest + route.thirdPartyFee + route.bankSpread + swapFee, 2);

  return {
    route: h.route,
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
