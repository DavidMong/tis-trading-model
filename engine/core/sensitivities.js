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

// PHASE 1 helpers — generic index sensitivity. Collect every index referenced by formula pricing
// (purchase + sale legs); bump ALL matching quotes/observations together. Empty for legacy trades
// -> zero new scenarios -> legacy output byte-for-byte.
function forEachFormula(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => forEachFormula(n, fn)); return; }
  if (node.components) fn(node);
  Object.values(node).forEach((v) => forEachFormula(v, fn));
}
function collectIndexRefs(trade) {
  const ids = new Set();
  forEachFormula({ m: trade.market && trade.market.purchasePrice, l: trade.revenueLegs }, (f) => {
    (f.components || []).forEach((c) => { if (c.ref) ids.add(c.ref); });
    if (f.averaging && f.averaging.ref) ids.add(f.averaging.ref);
  });
  return [...ids];
}
function bumpQuotes(t, mult) {
  if (t.indexQuotes) for (const k of Object.keys(t.indexQuotes)) t.indexQuotes[k] *= mult;
  forEachFormula({ m: t.market && t.market.purchasePrice, l: t.revenueLegs }, (f) => {
    if (f.averaging) (f.averaging.observations || []).forEach((o) => { o.value *= mult; });
    (f.components || []).forEach((c) => { if (c.ref && Array.isArray(c.observations)) c.observations.forEach((o) => { o.value *= mult; }); });
  });
}

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
  // PHASE 1 SHAPE GUARDS: legacy levers exist only for their pricing/freight shapes. Indexed trades
  // get the generic index-basket lever below instead; non-TC freight skips the TC lever.
  const legacyMarket = !!(trade.market && trade.market.ice);
  const tcMode = !trade.freight || !trade.freight.mode || trade.freight.mode === 'tc';
  for (const dir of [1, -1]) {
    const s = dir > 0 ? '+' : '-';
    if (legacyMarket) {
      bump(`ICE ${s}${tag}`, (t) => { t.market.ice.value *= 1 + dir * pct; });
      bump(`FOB premium ${s}${tag}`, (t) => { t.market.fobPremium.value *= 1 + dir * pct; });
    }
    if (tcMode) bump(`TC rate ${s}${tag}`, (t) => { t.freight.tcRatePerDay *= 1 + dir * pct; });
    if (fxMode === 'parallel') {
      bump(`FX parallel ${s}${tag}`, (t) => { t.fx = { ...(t.fx || {}), paymentBumpPct: dir * pct }; });
    } else {
      // Bump whichever field resolveRate() actually reads (override wins over value there — fx.js)
      // so the simulated move is never silently absorbed by an override sitting on top of it.
      bump(`FX NAFEM ${s}${tag}`, (t) => {
        const nafem = t.fx?.nafem;
        if (!nafem) return;
        const usesOverride = nafem.override !== null && nafem.override !== undefined;
        if (usesOverride) nafem.override *= 1 + dir * pct;
        else nafem.value *= 1 + dir * pct;
      });
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
    const litres = trade.pricing && trade.pricing.conversion && trade.pricing.conversion.litresPerMT;
    const litresFallback = (trade.product && trade.product.conversions && trade.product.conversions.litresPerMT) || litres;
    const nafem = base.fx.rates.nafemReference;
    const atCostNgnPerL = (base.price.depotLandedPerMT * nafem) / litresFallback;
    const t = clone(trade);
    if (Array.isArray(t.revenueLegs)) {
      // NATIVE legs: rewrite the depot leg price directly (legacy t.sell.* is ignored by native trades).
      t.revenueLegs = t.revenueLegs.map((leg) => (leg.channel === 'depot' ? { ...leg, price: atCostNgnPerL } : leg));
    } else {
      t.sell.depotPriceNgnPerL = { value: atCostNgnPerL, status: 'DOWNSIDE: depot sold at cost' };
    }
    const r = computeFn(t);
    depotDownside = { tisNet: r.profit.tisNetProfit, deltaVsBase: round(r.profit.tisNetProfit - baseNet, 2) };
  }

  // PHASE 1: generic index-basket sensitivity (indexed trades only — empty for legacy).
  const indexRefs = collectIndexRefs(trade);
  if (indexRefs.length) {
    for (const dir of [1, -1]) {
      const s = dir > 0 ? '+' : '-';
      const mult = 1 + dir * pct;
      bump(`Index basket ${s}${tag} (${indexRefs.join(', ')})`, (t) => bumpQuotes(t, mult));
    }
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
