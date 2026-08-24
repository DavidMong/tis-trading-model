'use strict';

const { getIndex, resolveInstrument } = require('./pricing');
const units = require('./units');

// PROXY-HEDGE BASIS QUANTIFICATION (Phase 5 companion). A Platts assessment has no futures of its
// own; the desk hedges it with a correlated exchange contract (registry hedgeProxy). The difference
// between the physical paper quote and the futures-equivalent quote is a REAL, UNCOVERED residual —
// surfaced here exactly the way fx-hedge.js surfaces forward-vs-parallel basis. Level reporting
// only; deliberately NOT folded into P&L (no invented hedge-effectiveness assumption).

function forEachFormula(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => forEachFormula(n, fn)); return; }
  if (node.components) fn(node);
  Object.values(node).forEach((v) => forEachFormula(v, fn));
}

function referencedIndexes(trade) {
  const ids = [];
  const seen = new Set();
  forEachFormula({ m: trade.market && trade.market.purchasePrice, l: trade.revenueLegs }, (f) => {
    (f.components || []).forEach((c) => { if (c.ref && !seen.has(c.ref)) { seen.add(c.ref); ids.push(c.ref); } });
  });
  return ids;
}

function computeBasis(trade) {
  const quotes = trade.indexQuotes || {};
  const conv = { product: require('./products').resolveProduct(trade) || trade.product, conversion: trade.pricing && trade.pricing.conversion };
  const rows = [];
  const notes = [];

  for (const refId of referencedIndexes(trade)) {
    const entry = getIndex(refId);
    const inst = resolveInstrument(refId); // null when the index has no native/proxy futures
    if (!inst) {
      notes.push(`${refId}: no native or proxy hedge instrument in registry — exchange-unhedgeable`);
      continue;
    }
    const physQ = quotes[refId];
    const instQ = quotes[inst.viaIndexId];
    if (typeof physQ !== 'number' || typeof instQ !== 'number') {
      notes.push(`${refId}: basis needs BOTH ${refId} and ${inst.viaIndexId} in trade.indexQuotes — residual not quantified`);
      continue;
    }
    // Convert BOTH quotes to USD/MT and subtract — the residual lives in the engine's canonical unit.
    const physUsdPerMt = units.toUsdPerMt(physQ, entry.unit, conv);
    const instUsdPerMt = units.toUsdPerMt(instQ, getIndex(inst.viaIndexId).unit, conv);
    const basisUsdPerMt = physUsdPerMt - instUsdPerMt;
    rows.push({
      physicalIndex: refId,
      instrument: `${inst.exchange}:${inst.symbol}`,
      instrumentIndexId: inst.viaIndexId,
      proxied: !!inst.proxyFor,
      physicalQuote: physQ,
      instrumentQuote: instQ,
      unit: entry.unit,
      basisUsdPerMt: Number(basisUsdPerMt.toFixed(4)),
      basisPctOfPhysical: Number(((basisUsdPerMt / physUsdPerMt) * 100).toFixed(4)),
      status: 'OK',
    });
  }

  return {
    rows,
    notes,
    note: 'Proxy-hedge basis = physical paper quote minus correlated futures-equivalent (USD/MT). This residual is NOT covered by the swap and is NOT in P&L — monitor like the FX basis block.',
    coveredByPnl: false,
  };
}

module.exports = { computeBasis };
