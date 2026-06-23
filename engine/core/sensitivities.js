'use strict';

const { round } = require('./rounding');

// Sensitivities (default +/-10%). Each scenario clones the trade, perturbs ONE input, and re-runs
// the full compute, reporting the change in TIS net profit.
//   Levers: ICE, FOB premium, TC rate, FX, surcharge on/off.
//   FX bites only on naira/depot legs -> all-USD trades show $0 FX sensitivity.
//   Plus: hedged-vs-unhedged ICE cost, and "depot sold at cost" downside (depot legs only).
//
// options.fxMode (RULE 1, 2026-06-23 — NAFEM now drives naira P&L):
//   'nafem'    (default) -> FX scenario bumps the NAFEM rate. This is the LIVE FX lever: it moves naira
//                            P&L in the unified trade flow. For all-USD trades (incl. the equity-partner
//                            / reference path, which has no naira legs) it is still a $0 no-op, so that
//                            output stays byte-for-byte unchanged.
//   'parallel'           -> FX scenario moves the PAYMENT parallel rate (paymentBumpPct). Parallel is now
//                            reference-only, so this is ~$0 on P&L (kept for the reference/exposure view).

const clone = (o) => JSON.parse(JSON.stringify(o));

function runSensitivities(trade, computeFn, options = {}) {
  const pct = options.pct ?? 0.1;
  const fxMode = options.fxMode ?? 'nafem';
  const base = computeFn(trade);
  const baseNet = base.profit.tisNetProfit;

  const scenarios = [];
  const bump = (lever, mutate, netSelector = (r) => r.profit.tisNetProfit) => {
    const t = clone(trade);
    mutate(t);
    const r = computeFn(t);
    const net = netSelector(r);
    scenarios.push({ lever, tisNet: net, deltaVsBase: round(net - baseNet, 2) });
  };

  const tag = `${(pct * 100).toFixed(0)}%`;
  for (const dir of [1, -1]) {
    const s = dir > 0 ? '+' : '-';
    bump(`ICE ${s}${tag}`, (t) => { t.market.ice.value *= 1 + dir * pct; });
    bump(`FOB premium ${s}${tag}`, (t) => { t.market.fobPremium.value *= 1 + dir * pct; });
    bump(`TC rate ${s}${tag}`, (t) => { t.freight.tcRatePerDay *= 1 + dir * pct; });
    if (fxMode === 'parallel') {
      bump(`FX parallel ${s}${tag}`, (t) => { t.fx = { ...(t.fx || {}), paymentBumpPct: dir * pct }; });
    } else {
      bump(`FX NAFEM ${s}${tag}`, (t) => { if (t.fx?.nafem) t.fx.nafem.value *= 1 + dir * pct; });
    }
  }

  // Surcharge on/off (uses net AFTER surcharge incidence)
  bump('Surcharge ON (5%)', (t) => { t.tax.surcharge.enabled = true; }, (r) => r.profit.tisNetAfterSurcharge);

  // FX exposure note — naira legs come from currency mode (revenue) and/or depot (revenue + cost).
  const hasNairaLegs = (base.fx && (base.fx.nairaShare > 0 || (base.channels && base.channels.depotTonnes > 0)))
    || base.cost.lines.some((l) => l.currency === 'NGN');

  // Depot sold-at-cost downside (depot legs only)
  let depotDownside = null;
  if (base.channels && base.channels.depotTonnes > 0) {
    // Unified trade flow: set the depot NGN/L price so depot revenue = depot landed cost. Depot
    // revenue now converts at NAFEM (RULE 1), so the break-even ₦/L is derived at NAFEM, not parallel.
    const litres = trade.pricing.conversion.litresPerMT;
    const nafem = base.fx.rates.nafemReference;
    const atCostNgnPerL = (base.price.depotLandedPerMT * nafem) / litres;
    const t = clone(trade);
    t.sell.depotPriceNgnPerL = { value: atCostNgnPerL, status: 'DOWNSIDE: depot sold at cost' };
    const r = computeFn(t);
    depotDownside = { tisNet: r.profit.tisNetProfit, deltaVsBase: round(r.profit.tisNetProfit - baseNet, 2) };
  } else if (trade.depot && trade.depot.enabled && base.price && base.price.exStorageLandedPerMT != null) {
    const t = clone(trade);
    t.sell.exShipPricePerMT = { value: base.price.exStorageLandedPerMT, status: 'DOWNSIDE: depot sold at cost' };
    const r = computeFn(t);
    depotDownside = { tisNet: r.profit.tisNetProfit, deltaVsBase: round(r.profit.tisNetProfit - baseNet, 2) };
  }

  return {
    pct,
    baseNet,
    scenarios,
    fx: {
      hasNgnLegs: hasNairaLegs,
      note: hasNairaLegs
        ? 'FX applies to naira legs (currency mode and/or depot revenue + naira costs).'
        : 'No NGN legs in this trade — FX sensitivity = $0 (all-USD ex-ship trade).',
    },
    hedge: {
      note: 'Hedged vs unhedged effective ICE cost (TIS retained tonnes).',
      effectiveIceCost: base.hedge.effectiveIceCost,
      unhedgedIceCost: base.hedge.unhedgedIceCost,
      delta: base.hedge.iceCostDelta,
    },
    depotDownside,
  };
}

module.exports = { runSensitivities };
