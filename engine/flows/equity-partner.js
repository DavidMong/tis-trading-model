'use strict';

const { round, money, paperQtyFavorTIS } = require('../core/rounding');
const { buildFinancing } = require('../core/financing');
const { buildCostBuildup } = require('../core/cost-buildup');
const { buildTaxBlock } = require('../core/tax');
const { buildHedge } = require('../core/hedge');

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

  // 1. Cargo FOB value (derived)
  const unitFob = trade.market.ice.value + trade.market.fobPremium.value;
  const cargoValue = unitFob * deliveredQty;

  // 2. Financing & funding stack
  const financing = buildFinancing(trade, cargoValue);

  // 3. Cost build-up (recoverable VAT excluded from landed cost)
  const cost = buildCostBuildup(trade, { cargoValue, deliveredQty, financing });
  const landedCostPerMT = cost.landedCostPerMT;

  // 4. Ex-storage landed cost. Storage lines (=0 unless depot) are already inside allInCost,
  //    so ex-storage landed == landed here; depot legs raise it via lines 25-28.
  const storageTotal = cost.lines
    .filter((l) => l.category === 'storage')
    .reduce((s, l) => s + l.amountUsd, 0);
  const exStorageLandedPerMT = landedCostPerMT;

  // 5. Ex-ship sell price (placeholder = landed x (1 + margin) until the buyer is priced)
  const sellCfg = trade.sell.exShipPricePerMT;
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
  const partnerPrincipal = financing.partnerFunding; // 25% incl. bond
  const productAllocationPct = trade.partner.productAllocationPct ?? 1.0;
  const principalAsProduct = partnerPrincipal * productAllocationPct;
  const principalAsCash = partnerPrincipal - principalAsProduct;
  const partnerTonnesEcon = principalAsProduct / exStorageLandedPerMT; // exact
  const tisRetainedTonnes = deliveredQty - partnerTonnesEcon;

  const partnerPaper = paperQtyFavorTIS(partnerTonnesEcon, 'partner', 50);
  const tisPaper = paperQtyFavorTIS(tisRetainedTonnes, 'tis', 50);
  const partnerPaperValue = partnerPaper * exStorageLandedPerMT;
  const cashTrueUp = principalAsProduct - partnerPaperValue; // +ve => owed to partner in cash

  // 7. Profit waterfall
  const perMtMargin = exShipPricePerMT - exStorageLandedPerMT;
  const standaloneProfit = deliveredQty * perMtMargin;
  const marginForegone = partnerTonnesEcon * perMtMargin; // TIS opportunity cost only
  const adjustedProfit = standaloneProfit - marginForegone;
  const profitSharePct = trade.partner.profitSharePct;
  const partnerCashProfitShare = profitSharePct * adjustedProfit;
  const tisNetProfit = adjustedProfit - partnerCashProfitShare;

  // 8. Tax block + surcharge incidence (needs ex-ship for the surcharge retail base)
  const taxBlock = buildTaxBlock(trade, { exShipPricePerMT, deliveredQty }, cost);
  let tisNetAfterSurcharge = tisNetProfit;
  if (taxBlock.surcharge.enabled && taxBlock.surcharge.incidence === 'cost') {
    tisNetAfterSurcharge = tisNetProfit - taxBlock.surcharge.amountUsd;
  }

  // 9. Hedge
  const hedge = buildHedge(trade, { tisRetainedTonnes });

  // 10. TIS-side annualised return (NOT a partner metric). On cargo value, annualised by lockup.
  const tisAnnualisedReturnOnCargo = financing.capitalLockupDays
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
