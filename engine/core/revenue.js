'use strict';

const { positive, oneOf } = require('./validate');
const jurisdiction = require('./jurisdiction');
const products = require('./products');

// PER-LEG REVENUE MODEL. A trade's sale is a LIST of revenue legs, each priced in ONE unit:
//
//   { channel: 'ex-ship' | 'depot', pricingUnit: 'USD_PER_MT' | 'NGN_PER_L', tonnes (or share), price }
//
//   - ex-ship legs may be USD_PER_MT (priced $/MT) or NGN_PER_L (native ₦/L pricing).
//   - depot   legs are NGN_PER_L ONLY — you cannot retail USD in Nigeria (USD depot is rejected).
//
// CONVERSION (the ONE place a leg becomes USD): every NGN_PER_L leg → USD via
//   priceUsdPerMT = (ngnPerL × litresPerMT) / nafemRate        (depot-identical; ex-ship-NGN reuses it)
//   usdRevenue    = tonnes × priceUsdPerMT
//   nairaNgn      = ngnPerL × litresPerMT × tonnes             (fixed in NGN — drives FX exposure)
// A USD_PER_MT leg carries no naira exposure (usdRevenue = price × tonnes, nairaNgn = 0).
// RULE 1 (2026-06-23): naira→USD P&L conversion is at NAFEM (the bank converts repaid naira at NAFEM),
// NOT the parallel rate. Parallel stays resolved for the reference / exposure blocks only.
//
// BACKWARD MAP: legacy trades (channels.exShipPct/depotPct + sell.currencyMode/splitUsdPct + prices)
// are adapted onto this model. A USD-priced/naira-SETTLED ex-ship share (currencyMode NGN/split) maps
// to a native NGN_PER_L leg with
//   ngnPerL = exShipUSD × nafemRate / litresPerMT
// so the converter (which divides by the SAME nafemRate) round-trips the leg's USD revenue back to the
// original USD price exactly (the USD amount is invariant to the rate; only the fixed NGN exposure
// amount tracks NAFEM). The USD price is retained as `usdPriceRef` for display/back-compat only — it is
// NOT a USD leg, so it does not satisfy the partner-benchmark USD-leg rule.

const VALID_CHANNELS = ['ex-ship', 'depot'];
const VALID_UNITS = ['USD_PER_MT', 'NGN_PER_L'];

// Resolve litresPerMT once, only when a naira leg actually needs it (USD-only trades never read it).
function resolveLitresPerMT(trade) {
  const explicit = trade.pricing && trade.pricing.conversion && trade.pricing.conversion.litresPerMT;
  if (explicit != null) return positive(explicit, 'pricing.conversion.litresPerMT');
  const fromCatalog = products.catalogueLitresPerMT(trade);
  return positive(fromCatalog, 'product.conversions.litresPerMT (catalog)');
}

// NATIVE per-leg input (trade.revenueLegs). Each leg validated and resolved to absolute tonnage.
function nativeLegs(trade, { deliveredQty }) {
  const raw = trade.revenueLegs;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Invalid input: trade.revenueLegs must be a non-empty array of revenue legs');
  }
  const hasNgn = raw.some((l) => l && l.pricingUnit === 'NGN_PER_L');
  const litresPerMT = hasNgn ? resolveLitresPerMT(trade) : null;

  const legs = raw.map((leg, i) => {
    const at = `revenueLegs[${i}]`;
    oneOf(leg.channel, VALID_CHANNELS, `${at}.channel`);
    oneOf(leg.pricingUnit, VALID_UNITS, `${at}.pricingUnit`);
    // Depot is never USD — cannot retail USD in NG.
    if (leg.channel === 'depot' && leg.pricingUnit !== 'NGN_PER_L') {
      const J = jurisdiction.load(trade.jurisdiction);
      const allowed = J.allowedDepotCurrencies || ['NGN'];
      if (!allowed.includes(leg.pricingUnit)) {
        if (J.id === 'NG') throw new Error(`Invalid input: '${at}' depot legs must be priced NGN_PER_L (cannot retail USD in NG), got ${JSON.stringify(leg.pricingUnit)}`);
        throw new Error(`Invalid input: '${at}' depot leg currency ${JSON.stringify(leg.pricingUnit)} not allowed in jurisdiction ${J.id} (allowed: ${allowed.join(', ')})`);
      }
    }
    const tonnes = leg.tonnes != null ? leg.tonnes : (leg.share != null ? leg.share * deliveredQty : leg.tonnes);
    positive(tonnes, leg.tonnes != null ? `${at}.tonnes` : `${at}.share`);
    // Per-leg missing/non-positive price → throw (symmetric across every leg).
    positive(leg.price, `${at}.price`);
    return { channel: leg.channel, pricingUnit: leg.pricingUnit, tonnes, price: leg.price, usdPriceRef: null };
  });
  return { legs, litresPerMT };
}

// LEGACY adapter: derive legs from channels + sell.currencyMode/splitUsdPct + prices.
function legacyLegs(trade, { deliveredQty, ch, exShares, nafemRate }) {
  const exShipTonnes = deliveredQty * ch.exShipPct;
  const depotTonnes = deliveredQty * ch.depotPct;
  const hasNgn = depotTonnes > 0 || (exShipTonnes > 0 && exShares.nairaShare > 0);
  const litresPerMT = hasNgn ? resolveLitresPerMT(trade) : null;

  const legs = [];
  if (exShipTonnes > 0) {
    const P = positive(trade.sell.exShipPricePerMT.value, 'sell.exShipPricePerMT.value');
    if (exShares.usdShare > 0) {
      legs.push({ channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: exShares.usdShare * exShipTonnes, price: P, usdPriceRef: P });
    }
    if (exShares.nairaShare > 0) {
      // USD-priced/naira-settled share → native NGN_PER_L leg (backward map at NAFEM; see header).
      legs.push({
        channel: 'ex-ship', pricingUnit: 'NGN_PER_L',
        tonnes: exShares.nairaShare * exShipTonnes,
        price: (P * nafemRate) / litresPerMT,
        usdPriceRef: P, // display/back-compat only — NOT a USD leg for the benchmark rule
      });
    }
  }
  if (depotTonnes > 0) {
    const ngnPerL = positive(trade.sell.depotPriceNgnPerL.value, 'sell.depotPriceNgnPerL.value');
    legs.push({ channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: depotTonnes, price: ngnPerL, usdPriceRef: null });
  }
  return { legs, litresPerMT };
}

// Normalize a trade onto the per-leg model. NATIVE (trade.revenueLegs) wins; otherwise legacy adapter.
// Validates: channel/unit enums, depot-never-USD, per-leg positive price, leg tonnage sums to delivered.
function normalizeLegs(trade, ctx) {
  const { deliveredQty } = ctx;
  const native = Array.isArray(trade.revenueLegs) && trade.revenueLegs.length > 0;
  const { legs, litresPerMT } = native ? nativeLegs(trade, ctx) : legacyLegs(trade, ctx);

  // Leg tonnage shares must sum to delivered quantity.
  const totalTonnes = legs.reduce((s, l) => s + l.tonnes, 0);
  const tol = 1e-6 * Math.max(1, deliveredQty);
  if (Math.abs(totalTonnes - deliveredQty) > tol) {
    throw new Error(`Invalid input: revenue leg tonnage (${totalTonnes}) must sum to delivered quantity (${deliveredQty})`);
  }
  return { legs, litresPerMT, native };
}

// The ONE place a leg becomes USD. NGN legs use the depot-identical conversion, at NAFEM (RULE 1).
function computeLegRevenue(leg, { nafemRate, litresPerMT }) {
  if (leg.pricingUnit === 'USD_PER_MT') {
    return { usdRevenue: leg.price * leg.tonnes, nairaNgn: 0, priceUsdPerMT: leg.price };
  }
  // NGN_PER_L (depot or native ex-ship-NGN) — identical conversion at NAFEM: the bank converts the
  // naira proceeds it is repaid to USD at NAFEM, so NAFEM (not parallel) drives this leg's P&L.
  const priceUsdPerMT = (leg.price * litresPerMT) / nafemRate;
  return {
    usdRevenue: leg.tonnes * priceUsdPerMT,
    nairaNgn: leg.price * litresPerMT * leg.tonnes,
    priceUsdPerMT,
  };
}

module.exports = { normalizeLegs, computeLegRevenue, VALID_CHANNELS, VALID_UNITS };
