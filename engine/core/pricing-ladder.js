'use strict';

const { round } = require('./rounding');

// Cost-plus margin ladder — ADVISORY price recommendation tool. It SUGGESTS prices; the trader
// always sets the final price. Every P&L figure is produced by re-running the verified flow engine
// at the tier price (runAtPrice -> compute). This module only derives tier PRICES from cost and the
// three display metrics — it never re-implements or approximates the P&L math.
//
// COST BASE (critical):
//   ex-ship margin base = EX-SHIP landed cost      = all-in landed EXCLUDING storage lines
//   depot   margin base = ALL-IN DEPOT landed cost = all-in landed INCLUDING storage/throughput/
//                                                     evaporation/tank insurance
//   NEVER measured against bare FOB Dangote — always full landed cost.
//
// METRICS shown per tier (all three, never one alone):
//   1. margin % OF SELL PRICE   2. markup % ON LANDED COST   3. ABSOLUTE spread/unit ($/MT or NGN/L)

const DEFAULT_EXSHIP_TIERS = [
  { name: 'Floor', marginOfSell: 0.03 },
  { name: 'Conservative', marginOfSell: 0.06 },
  { name: 'Target', marginOfSell: 0.10 },
  { name: 'Stretch', marginOfSell: 0.15 },
  { name: 'Premium', marginOfSell: 0.20 },
];
const DEFAULT_DEPOT_TIERS = [
  { name: 'Floor', spreadNgnPerL: 50 },
  { name: 'Conservative', spreadNgnPerL: 90 },
  { name: 'Recommended', spreadNgnPerL: 135 },
  { name: 'Stretch', spreadNgnPerL: 170 },
  { name: 'Premium', spreadNgnPerL: 220 },
];
const DEFAULT_CONVERSION = { litresPerMT: 1183, fxMarketForDepot: 'parallel' };

const clone = (o) => JSON.parse(JSON.stringify(o));

// Re-run the verified engine at a given ex-ship USD price ($/MT). The ex-ship $/MT ladder governs the
// ex-ship sale regardless of the leg's pricing unit, so EVERY ex-ship leg must reprice to this tier:
//   - USD_PER_MT leg  -> price = tier $/MT directly (SAME path as before; USD trades unchanged).
//   - NGN_PER_L  leg  -> price = tier $/MT converted back to ₦/L (inverse of the leg's USD conversion
//                        in revenue.js: priceUsdPerMT = (ngnPerL × litres) / nafem  =>  ngnPerL =
//                        tier$/MT × nafem / litres), so the leg's USD-equivalent reproduces the tier
//                        $/MT EXACTLY and the per-tier P&L is no longer inert. (No rounding of the
//                        ₦/L value: keep it exact so (ngnPerL × litres)/nafem === the displayed $/MT.)
// LEGACY trades price from sell.exShipPricePerMT (no revenueLegs) and are untouched: identical results.
// Depot legs are NEVER repriced here — the depot ₦/L ladder reprices them in buildDepotLadder.
function runAtPrice(trade, compute, pricePerMT) {
  const t = clone(trade);
  const v = round(pricePerMT, 6);
  t.sell.exShipPricePerMT = { value: v, status: 'SUGGESTED (ladder)' };
  if (Array.isArray(t.revenueLegs) && t.revenueLegs.length) {
    // Resolve NAFEM + litres only when an ex-ship NGN leg actually needs the inverse conversion
    // (USD-only ladders never read them — keeps the all-USD path byte-for-byte unchanged).
    let ngnPerL = null;
    if (t.revenueLegs.some((l) => l.channel === 'ex-ship' && l.pricingUnit === 'NGN_PER_L')) {
      const nafem = resolveFx(t, 'nafem');
      const litres = t.pricing && t.pricing.conversion && t.pricing.conversion.litresPerMT;
      if (!(typeof nafem === 'number' && Number.isFinite(nafem) && nafem > 0)) {
        throw new Error(`runAtPrice: NGN_PER_L ex-ship leg needs a positive NAFEM rate, got ${nafem}`);
      }
      if (!(typeof litres === 'number' && Number.isFinite(litres) && litres > 0)) {
        throw new Error(`runAtPrice: NGN_PER_L ex-ship leg needs a positive pricing.conversion.litresPerMT, got ${litres}`);
      }
      ngnPerL = (v * nafem) / litres; // inverse of (ngnPerL × litres) / nafem = v
    }
    t.revenueLegs = t.revenueLegs.map((l) => {
      if (l.channel !== 'ex-ship') return l; // depot leg priced by buildDepotLadder, not here
      if (l.pricingUnit === 'USD_PER_MT') return { ...l, price: v };
      if (l.pricingUnit === 'NGN_PER_L') return { ...l, price: ngnPerL };
      return l;
    });
  }
  return compute(t);
}

// Derive the two cost bases from ONE verified engine run (no recomputation of cost math).
// Prefer the engine-exposed bases (unified trade flow); fall back for the equity-partner result shape.
function costBases(baseResult) {
  const qty = baseResult.meta.deliveredQty;
  if (baseResult.price && typeof baseResult.price.exShipLandedPerMT === 'number') {
    return {
      qty,
      exShipLandedPerMT: baseResult.price.exShipLandedPerMT,
      depotLandedPerMT: baseResult.price.depotLandedPerMT ?? baseResult.price.exShipLandedPerMT,
    };
  }
  const allIn = baseResult.cost.allInCost;
  const storage = baseResult.storageTotal || 0;
  return {
    qty,
    exShipLandedPerMT: (allIn - storage) / qty, // EXCLUDES storage
    depotLandedPerMT: allIn / qty, // INCLUDES storage
  };
}

function resolveFx(trade, market) {
  const leg = trade.fx && trade.fx[market];
  if (!leg) return null;
  return leg.override ?? leg.value;
}

// Bounds-check a margin-of-sell tier: must be a finite number strictly within (0, 1).
// Reject m >= 1 (Infinity/negative price) and m <= 0 (no/negative margin) with a clear error.
function assertMarginOfSell(t) {
  if (typeof t.marginOfSell !== 'number' || !Number.isFinite(t.marginOfSell) || t.marginOfSell <= 0 || t.marginOfSell >= 1) {
    throw new Error(`Invalid ex-ship tier '${t.name}': marginOfSell must be within (0,1), got ${JSON.stringify(t.marginOfSell)}`);
  }
}

// EX-SHIP ladder (USD cargo sale). Tier margin is OF SELL PRICE -> price = landed / (1 - m).
function buildExShipLadder(trade, compute, baseResult) {
  const tiers = (trade.pricing && trade.pricing.exShipTiers) || DEFAULT_EXSHIP_TIERS;
  const conv = { ...DEFAULT_CONVERSION, ...((trade.pricing && trade.pricing.conversion) || {}) };
  const { exShipLandedPerMT } = costBases(baseResult);
  if (!(typeof exShipLandedPerMT === 'number' && Number.isFinite(exShipLandedPerMT) && exShipLandedPerMT > 0)) {
    throw new Error(`Invalid ladder cost base: ex-ship landed cost must be > 0, got ${exShipLandedPerMT}`);
  }
  const fx = resolveFx(trade, conv.fxMarketForDepot);

  const rows = tiers.map((t) => {
    assertMarginOfSell(t);
    // Round the suggested price to the cent FIRST, then run THAT price through the engine, so the
    // displayed price reproduces the displayed profit exactly (auditable WYSIWYG).
    const price = round(exShipLandedPerMT / (1 - t.marginOfSell), 2);
    const r = runAtPrice(trade, compute, price); // <- verified engine, at the shown price
    const spreadPerMT = price - exShipLandedPerMT;
    return {
      name: t.name,
      marginOfSell: t.marginOfSell,
      pricePerMT: price,
      spreadPerMT: round(spreadPerMT, 2), // metric 3 (absolute, $/MT)
      marginPctOfSell: round(spreadPerMT / price, 6), // metric 1
      markupPctOnCost: round(spreadPerMT / exShipLandedPerMT, 6), // metric 2
      spreadNgnPerL: fx != null ? round((spreadPerMT * fx) / conv.litresPerMT, 4) : null, // common-currency
      tisNetProfit: r.profit.tisNetProfit, // from engine
      tisNetAfterSurcharge: r.profit.tisNetAfterSurcharge, // from engine
      adjustedProfit: r.profit.adjustedProfit, // from engine
    };
  });

  return {
    leg: 'ex-ship',
    currency: 'USD',
    costBasePerMT: round(exShipLandedPerMT, 4),
    tiers: rows,
    current: currentPriceContext(trade, exShipLandedPerMT, tiers, fx, conv),
    conversion: conv,
    fxUsed: fx,
  };
}

// Where the trader's currently-entered fixed price sits on the ladder.
function currentPriceContext(trade, exShipLandedPerMT, tiers, fx, conv) {
  const sell = trade.sell.exShipPricePerMT;
  if (sell.value == null) return null;
  const price = sell.value;
  const spread = price - exShipLandedPerMT;
  const marginOfSell = spread / price;

  let nearest = tiers[0];
  for (const t of tiers) {
    if (Math.abs(t.marginOfSell - marginOfSell) < Math.abs(nearest.marginOfSell - marginOfSell)) nearest = t;
  }
  const sorted = [...tiers].sort((a, b) => a.marginOfSell - b.marginOfSell);
  let below = null;
  let above = null;
  for (const t of sorted) {
    if (t.marginOfSell <= marginOfSell) below = t;
    if (t.marginOfSell >= marginOfSell && !above) above = t;
  }
  return {
    pricePerMT: round(price, 2),
    spreadPerMT: round(spread, 2),
    spreadNgnPerL: fx != null ? round((spread * fx) / conv.litresPerMT, 4) : null,
    marginPctOfSell: round(marginOfSell, 6),
    markupPctOnCost: round(spread / exShipLandedPerMT, 6),
    nearestTier: nearest.name,
    between: below && above ? `${below.name}-${above.name}` : below ? `>=${below.name}` : `<=${above ? above.name : ''}`,
    status: sell.status || 'FIXED',
  };
}

// DEPOT ladder (naira downstream resale). Tier = ABSOLUTE NGN/L spread over ALL-IN depot landed cost.
// Applies ONLY when a depot leg exists. P&L per tier comes from the depot flow when it is built.
function buildDepotLadder(trade, compute, baseResult) {
  // Active when the trade has a depot channel (unified flow) or the legacy depot.enabled flag.
  const hasDepot = (baseResult.channels && baseResult.channels.depotTonnes > 0) || (trade.depot && trade.depot.enabled);
  if (!hasDepot) {
    return { leg: 'depot', applicable: false, note: 'No depot leg in this trade — depot ladder not applicable.' };
  }
  const tiers = (trade.pricing && trade.pricing.depotTiers) || DEFAULT_DEPOT_TIERS;
  const conv = { ...DEFAULT_CONVERSION, ...((trade.pricing && trade.pricing.conversion) || {}) };
  const { depotLandedPerMT } = costBases(baseResult);
  const fx = resolveFx(trade, conv.fxMarketForDepot);
  if (!(typeof fx === 'number' && Number.isFinite(fx) && fx > 0)) {
    throw new Error(`Invalid depot FX rate ('${conv.fxMarketForDepot}'): must be > 0, got ${fx}`);
  }
  if (!(typeof conv.litresPerMT === 'number' && Number.isFinite(conv.litresPerMT) && conv.litresPerMT > 0)) {
    throw new Error(`Invalid pricing.conversion.litresPerMT: must be > 0, got ${conv.litresPerMT}`);
  }
  const depotLandedNgnPerL = (depotLandedPerMT * fx) / conv.litresPerMT;

  // P&L per tier runs the verified engine at the tier's NGN/L price (when the unified flow exposes
  // a depot channel). No duplicated math — tisNet/adjusted come straight from compute().
  const depotFlowLive = !!(baseResult.channels && baseResult.channels.depotTonnes > 0) && typeof compute === 'function';

  const rows = tiers.map((t) => {
    const priceNgnPerL = depotLandedNgnPerL + t.spreadNgnPerL;
    const priceUsdPerMT = (priceNgnPerL * conv.litresPerMT) / fx;
    let tisNetProfit = null;
    let tisNetAfterSurcharge = null;
    let adjustedProfit = null;
    let pnlStatus = 'PENDING (no depot channel in this trade)';
    if (depotFlowLive) {
      const tt = clone(trade);
      const v = round(priceNgnPerL, 6);
      tt.sell = { ...tt.sell, depotPriceNgnPerL: { value: v, status: 'SUGGESTED (ladder)' } };
      // Native per-leg trades price from revenueLegs — reprice the depot leg(s) (always ₦/L) too.
      if (Array.isArray(tt.revenueLegs) && tt.revenueLegs.length) {
        tt.revenueLegs = tt.revenueLegs.map((l) => (l.channel === 'depot') ? { ...l, price: v } : l);
      }
      const r = compute(tt);
      tisNetProfit = r.profit.tisNetProfit;
      tisNetAfterSurcharge = r.profit.tisNetAfterSurcharge;
      adjustedProfit = r.profit.adjustedProfit;
      pnlStatus = 'engine';
    }
    return {
      name: t.name,
      spreadNgnPerL: t.spreadNgnPerL, // metric 3 (absolute, headline)
      priceNgnPerL: round(priceNgnPerL, 4),
      priceUsdPerMT: round(priceUsdPerMT, 2),
      marginPctOfSell: round(t.spreadNgnPerL / priceNgnPerL, 6), // metric 1 (reference)
      markupPctOnCost: round(t.spreadNgnPerL / depotLandedNgnPerL, 6), // metric 2
      tisNetProfit,
      tisNetAfterSurcharge,
      adjustedProfit,
      pnlStatus,
    };
  });

  return {
    leg: 'depot',
    applicable: true,
    currency: 'NGN/L',
    costBasePerMT: round(depotLandedPerMT, 4),
    costBaseNgnPerL: round(depotLandedNgnPerL, 4),
    fxUsed: fx,
    litresPerMT: conv.litresPerMT,
    tiers: rows,
  };
}

// PRIMARY cross-leg comparison: ABSOLUTE spread in a common currency (NGN/L headline + $/MT).
function buildLegComparison(exShip, depot, conv) {
  const exRep = exShip.tiers.find((t) => /target/i.test(t.name)) || exShip.tiers[Math.floor(exShip.tiers.length / 2)];
  if (!depot.applicable) {
    return {
      applicable: false,
      note: 'Depot leg not present — cross-leg comparison activates when a depot leg exists.',
      exShipRepresentative: { tier: exRep.name, spreadPerMT: exRep.spreadPerMT, spreadNgnPerL: exRep.spreadNgnPerL },
    };
  }
  const depRep = depot.tiers.find((t) => /recommend/i.test(t.name)) || depot.tiers[Math.floor(depot.tiers.length / 2)];
  const depSpreadPerMT = (depRep.spreadNgnPerL * conv.litresPerMT) / depot.fxUsed;
  return {
    applicable: true,
    common: 'NGN/L (headline) and USD/MT',
    exShip: { tier: exRep.name, spreadPerMT: exRep.spreadPerMT, spreadNgnPerL: exRep.spreadNgnPerL },
    depot: { tier: depRep.name, spreadNgnPerL: depRep.spreadNgnPerL, spreadPerMT: round(depSpreadPerMT, 2) },
    depotEarnsMoreAbsolute: depRep.spreadNgnPerL > exRep.spreadNgnPerL,
    rationale: 'Depot spread should exceed ex-ship spread to compensate for storage / holding / FX risk.',
  };
}

function buildLadder(trade, compute, baseResult) {
  const exShip = buildExShipLadder(trade, compute, baseResult);
  const depot = buildDepotLadder(trade, compute, baseResult);
  const comparison = buildLegComparison(exShip, depot, exShip.conversion);
  return {
    disclaimer: 'SUGGESTED — pricing guidance only; final price is the trader\'s decision.',
    exShip,
    depot,
    comparison,
  };
}

module.exports = {
  buildLadder,
  buildExShipLadder,
  buildDepotLadder,
  buildLegComparison,
  runAtPrice,
  costBases,
  DEFAULT_EXSHIP_TIERS,
  DEFAULT_DEPOT_TIERS,
  DEFAULT_CONVERSION,
};
