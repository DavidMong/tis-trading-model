'use strict';

const { round, money, paperQtyFavorTIS } = require('../core/rounding');
const { buildFinancing } = require('../core/financing');
const { buildCostBuildup } = require('../core/cost-buildup');
const { buildTaxBlock } = require('../core/tax');
const { buildHedge } = require('../core/hedge');
const { num, positive, nonNegative, proportion, computedPositive } = require('../core/validate');

// Validate required numeric inputs at the engine boundary — fail loud, never emit NaN/Infinity.
function validateTrade(trade, deliveredQty) {
  positive(deliveredQty, 'cargo.deliveredQtyMT');
  num(trade.market.ice.value, 'market.ice.value');
  num(trade.market.fobPremium.value, 'market.fobPremium.value');
  num(trade.freight.tcRatePerDay, 'freight.tcRatePerDay');
  nonNegative(trade.freight.charterDays, 'freight.charterDays');
  nonNegative(trade.freight.demurrageDays, 'freight.demurrageDays');
  num(trade.financing.creditRate, 'financing.creditRate');
  num(trade.financing.lcFeePct, 'financing.lcFeePct');
  positive(trade.financing.financingDays, 'financing.financingDays');
  nonNegative(trade.financing.wcSublimit, 'financing.wcSublimit');
  num(trade.tax.vatRate, 'tax.vatRate');
  proportion(trade.tax.taxableSupplyProportion, 'tax.taxableSupplyProportion');
  proportion(trade.partner.profitSharePct, 'partner.profitSharePct');
}

// Equity-partner flow. TIS is the only constant entity; the partner is generic per trade.
//
// Compensation toggle (trade.partner.mode): product_split | profit_share | combination.
//   combination = principal returned IN KIND (product), PLUS profitSharePct of TOTAL adjusted
//   profit as cash. profitSharePct is a VARIABLE input — change it and all derivatives re-flow.
//
// Profit waterfall (standalone <-> adjusted reconciliation):
//   standaloneProfit  = deliveredQty x (exShip - landed)      [TIS as 100% owner]
//   marginForegone    = partnerTonnes x (exShip - landed)     [TIS opportunity cost only]
//   adjustedProfit    = standaloneProfit - marginForegone     [= retained x (exShip - landed)]
//   partnerCash       = profitSharePct x adjustedProfit
//   tisNetProfit      = (1 - profitSharePct) x adjustedProfit
//   identity: marginForegone + adjustedProfit = standaloneProfit
//
// Partner reporting (TIS-internal): report ONLY what TIS delivers to the partner —
//   (1) product received (tonnes + landed-cost value = principal at par), and
//   (2) cash received (profit share). No partner-side market-upside / net-return interpretation.
//
// PURE COMPUTE: returns a structured result. Printing / CLI live in run.js.

function computeEquityPartner(trade, opts = {}) {
  const deliveredQty = opts.deliveredQtyOverride ?? trade.cargo.deliveredQtyMT;
  validateTrade(trade, deliveredQty);

  // 0. Effective ICE. The physical FOB purchase FLOATS at ICE; `market.ice.final` is the
  //    SETTLEMENT/at-payment print. When set, it is the single ICE that drives BOTH the landed
  //    cost AND the swap reference — one shared value, never a second reference on the same tonnes,
  //    so the swap (on hedged tonnes) and the physical (full cargo) offset cleanly. When BLANK it
  //    is exactly the live value, so `effTrade === trade` by reference and every number is unchanged.
  const liveIce = trade.market.ice.value;
  const finalIce = trade.market.ice.final != null ? trade.market.ice.final : null;
  const effectiveIce = finalIce != null ? finalIce : liveIce;
  if (finalIce != null) num(finalIce, 'market.ice.final');
  const effTrade = effectiveIce === liveIce
    ? trade
    : { ...trade, market: { ...trade.market, ice: { ...trade.market.ice, value: effectiveIce } } };

  // 1. Cargo FOB value (derived)
  const unitFob = effectiveIce + trade.market.fobPremium.value;
  const cargoValue = unitFob * deliveredQty;

  // 2. Financing & funding stack
  const financing = buildFinancing(effTrade, cargoValue);

  // 3. Cost build-up (recoverable VAT excluded from landed cost). effTrade => cost line 1
  //    ("ICE LSGO", rateFrom market.ice.value) resolves to the effective ICE. pct_of_sell cost lines
  //    (config-driven — trade.costLineOverrides) base off the SAME sell value the flow uses for
  //    revenue below: the fixed-price input, when set. When the sell price is a placeholder (derived
  //    FROM landed cost at step 5), no sell value can exist yet without a circular dependency, so
  //    pct_of_sell lines resolve to $0 in that case — same as before this fix, not a new gap.
  const sellCfg = trade.sell.exShipPricePerMT;
  const sellValue = sellCfg.value != null ? sellCfg.value * deliveredQty : undefined;
  const cost = buildCostBuildup(effTrade, { cargoValue, deliveredQty, financing, sellValue });
  const landedCostPerMT = cost.landedCostPerMT;

  // 4. Ex-storage landed cost. Storage lines (=0 unless depot) are already inside allInCost,
  //    so ex-storage landed == landed here; depot legs raise it via lines 25-28.
  const storageTotal = cost.lines
    .filter((l) => l.category === 'storage')
    .reduce((s, l) => s + l.amountUsd, 0);
  const exStorageLandedPerMT = landedCostPerMT;

  // 5. Ex-ship sell price (placeholder = landed x (1 + margin) until the buyer is priced)
  let exShipPricePerMT;
  let exShipStatus;
  let placeholderMarginPct = null;
  if (sellCfg.value != null) {
    exShipPricePerMT = sellCfg.value;
    exShipStatus = sellCfg.status || 'OK';
  } else {
    placeholderMarginPct = sellCfg.placeholderMarginPct ?? 0.06;
    exShipPricePerMT = exStorageLandedPerMT * (1 + placeholderMarginPct);
    exShipStatus = 'PLACEHOLDER — confirm buyer price';
  }

  // 6. Quantities — economic (exact, drives all P&L) vs paper (documentary)
  computedPositive(exStorageLandedPerMT, 'ex-storage landed cost / MT'); // guard the divisor below
  const partnerPrincipal = financing.partnerFunding; // 25% incl. bond
  const productAllocationPct = proportion(trade.partner.productAllocationPct ?? 1.0, 'partner.productAllocationPct');
  const principalAsProduct = partnerPrincipal * productAllocationPct;
  const principalAsCash = partnerPrincipal - principalAsProduct;
  const partnerTonnesEcon = principalAsProduct / exStorageLandedPerMT; // exact
  const tisRetainedTonnes = deliveredQty - partnerTonnesEcon;

  const partnerPaper = paperQtyFavorTIS(partnerTonnesEcon, 'partner', 50);
  const tisPaper = paperQtyFavorTIS(tisRetainedTonnes, 'tis', 50);
  const partnerPaperValue = partnerPaper * exStorageLandedPerMT;
  const cashTrueUp = principalAsProduct - partnerPaperValue; // +ve => owed to partner in cash

  // 7. Hedge. effTrade => hedge's liveIce reference resolves to the effective (settlement) ICE, so
  //    iceCostDelta = hedgedPhysical x (fixedPrice - effectiveIce) is the realized swap outcome on
  //    the RETAINED tonnes only (never full cargo, never partner tonnes). Computed BEFORE the profit
  //    waterfall so the toggle (trade.hedge.iceHedged) can flow into standaloneProfit below, mirroring
  //    computeTrade's ICE-hedge wiring exactly.
  const hedge = buildHedge(effTrade, { tisRetainedTonnes });
  const iceHedged = !!(trade.hedge && trade.hedge.iceHedged);
  const iceHedgeAllInCost = round(hedge.iceCostDelta + hedge.extraFinancingCost, 2);
  const iceHedgeNetImpact = iceHedged ? round(-iceHedgeAllInCost, 2) : 0;

  // 8. Profit waterfall (realized, post-hedge standalone — ON drives P&L, OFF is a no-op: current
  //    behavior exactly, per CLAUDE.md's Hedge toggles rule).
  const perMtMargin = exShipPricePerMT - exStorageLandedPerMT;
  const standaloneProfit = round(deliveredQty * perMtMargin + iceHedgeNetImpact, 2);
  const marginForegone = partnerTonnesEcon * perMtMargin; // TIS opportunity cost only
  const adjustedProfit = standaloneProfit - marginForegone;
  const profitSharePct = trade.partner.profitSharePct;
  const partnerCashProfitShare = profitSharePct * adjustedProfit;
  const tisNetProfit = adjustedProfit - partnerCashProfitShare;

  // 9. Tax block + surcharge incidence. TIS bears surcharge on its RETAINED tonnes only (the
  //    partner's in-kind product share is not TIS's cost) — see tax.js surcharge.tisBorneUsd.
  const taxBlock = buildTaxBlock(trade, { exShipPricePerMT, deliveredQty, tisRetainedTonnes }, cost);
  let tisNetAfterSurcharge = tisNetProfit;
  if (taxBlock.surcharge.enabled && taxBlock.surcharge.incidence === 'cost') {
    tisNetAfterSurcharge = tisNetProfit - taxBlock.surcharge.tisBorneUsd;
  }

  // 10. TIS-side annualised return (NOT a partner metric). On cargo value, annualised by lockup.
  const tisAnnualisedReturnOnCargo =
    financing.capitalLockupDays && cargoValue > 0
      ? (tisNetProfit / cargoValue) * (365 / financing.capitalLockupDays)
      : null;

  return {
    meta: { ...trade.meta, parties: trade.parties, deliveredQty },
    cargoValue,
    unitFob,
    financing,
    cost,
    storageTotal: round(storageTotal, 2),
    price: {
      landedCostPerMT: round(landedCostPerMT, 4),
      exStorageLandedPerMT: round(exStorageLandedPerMT, 4),
      exShipPricePerMT: round(exShipPricePerMT, 4),
      exShipStatus,
      placeholderMarginPct,
      perMtMargin: round(perMtMargin, 4),
    },
    quantities: {
      deliveredQty,
      economic: {
        partnerTonnes: round(partnerTonnesEcon, 4),
        tisRetainedTonnes: round(tisRetainedTonnes, 4),
        principalAsProduct: money(principalAsProduct),
        principalAsCash: money(principalAsCash),
      },
      paper: {
        partnerPaper,
        tisPaper,
        step: 50,
        partnerPaperValue: money(partnerPaperValue),
        cashTrueUp: money(cashTrueUp),
        note: 'Paper tonnes are documentary only (rounded in TIS favour). P&L uses economic tonnes.',
      },
    },
    profit: {
      standaloneProfit: money(standaloneProfit),
      marginForegone: money(marginForegone),
      adjustedProfit: money(adjustedProfit),
      profitSharePct,
      partnerCashProfitShare: money(partnerCashProfitShare),
      tisNetProfit: money(tisNetProfit),
      tisNetAfterSurcharge: money(tisNetAfterSurcharge),
      reconciliation: {
        identity: 'marginForegone + adjustedProfit = standaloneProfit',
        lhs: money(marginForegone + adjustedProfit),
        rhs: money(standaloneProfit),
        ok: Math.abs(marginForegone + adjustedProfit - standaloneProfit) < 0.01,
      },
    },
    partnerDelivers: {
      note: 'TIS-internal view: only what TIS delivers. No partner-side upside / net-return interpretation.',
      productReceived: { tonnes: round(partnerTonnesEcon, 4), valuedAtLandedCost: money(principalAsProduct) },
      cashReceived: { profitShare: money(partnerCashProfitShare), principalCashPortion: money(principalAsCash), settlementTrueUp: money(cashTrueUp) },
      principalTie: {
        owed: money(partnerPrincipal),
        returnedProductValue: money(principalAsProduct),
        returnedCash: money(principalAsCash),
        ok: Math.abs(principalAsProduct + principalAsCash - partnerPrincipal) < 0.01,
      },
    },
    tax: taxBlock,
    hedge,
    tisAnnualisedReturnOnCargo: tisAnnualisedReturnOnCargo != null ? round(tisAnnualisedReturnOnCargo, 4) : null,
  };
}

module.exports = { computeEquityPartner };
