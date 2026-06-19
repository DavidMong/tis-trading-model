'use strict';

const { round, money, paperQtyFavorTIS } = require('../core/rounding');
const { buildFinancing } = require('../core/financing');
const { buildCostBuildup } = require('../core/cost-buildup');
const { buildTaxBlock } = require('../core/tax');
const { buildHedge } = require('../core/hedge');
const { resolveFxRates, exShipCurrencyShares } = require('../core/fx');
const { buildFxHedge } = require('../core/fx-hedge');
const { num, positive, nonNegative, proportion, oneOf, sumToOne, computedPositive } = require('../core/validate');

// UNIFIED, fully-configurable trade flow. Five INDEPENDENT dimensions — every combination computes:
//   1. SALE CHANNELS  : ex-ship (USD) and/or ex-depot (NGN); split of tonnes; proceeds POOL into one P&L.
//   2. EQUITY PROVIDER: 'partner' (equity-split waterfall) or 'TIS' (self-funded; standalone = TIS net).
//   3. EQUITY RATIO   : bond/equity/LC fully configurable; funding stack validated to 100%.
//   4. CURRENCY       : ex-ship USD/NGN/split; depot always NGN. PARALLEL drives P&L; NAFEM reference only.
//   5. DEPOT          : priced NGN/L; margin vs ALL-IN DEPOT landed; naira storage costs FX-exposed.
//
// The engine is USD-internal; the FX layer converts naira legs to USD-equivalent at the PARALLEL rate
// and reports FX exposure separately. computeEquityPartner stays the verified Profogas path; this flow
// reproduces it exactly for {ex-ship, partner, USD, 25%} (see test/invariants.js cross-check).
//
// MARGIN-FOREGONE BENCHMARK: the partner's in-kind product is delivered EX-SHIP at the tank farm, so
// margin-foregone is benchmarked on the EX-SHIP price (TIS keeps the depot premium it earns by taking
// storage/holding/FX risk). EDGE CASE: a depot-only trade (no ex-ship channel) falls back to the depot
// realized (ex-storage) price as the benchmark.

function validateTrade(trade, deliveredQty, ch) {
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

  proportion(ch.exShipPct, 'channels.exShipPct');
  proportion(ch.depotPct, 'channels.depotPct');
  sumToOne({ exShipPct: ch.exShipPct, depotPct: ch.depotPct }, 'channels');

  const provider = (trade.partner && trade.partner.equityProvider) || 'partner';
  oneOf(provider, ['partner', 'TIS'], 'partner.equityProvider');
  if (provider === 'partner') proportion(trade.partner.profitSharePct, 'partner.profitSharePct');
}

function computeTrade(trade, opts = {}) {
  const deliveredQty = opts.deliveredQtyOverride ?? trade.cargo.deliveredQtyMT;
  const ch = trade.channels || { exShipPct: 1, depotPct: 0 };
  validateTrade(trade, deliveredQty, ch);

  const exShipTonnes = deliveredQty * ch.exShipPct;
  const depotTonnes = deliveredQty * ch.depotPct;

  // 1. Cargo FOB value & funding stack (equity ratio configurable, validated to 100%)
  const unitFob = trade.market.ice.value + trade.market.fobPremium.value;
  const cargoValue = unitFob * deliveredQty;
  const financing = buildFinancing(trade, cargoValue);

  // 2. FX rates. PARALLEL = economic (P&L); NAFEM = reference only. fxBump = payment-vs-pricing parallel.
  const fxBump = opts.fxBump ?? (trade.fx && trade.fx.paymentBumpPct) ?? 0;
  const fx = resolveFxRates(trade, fxBump);
  const exShares = exShipCurrencyShares(trade);
  const needNaira = depotTonnes > 0 || exShares.nairaShare > 0;
  if (needNaira) {
    computedPositive(fx.parallelPricing, 'parallel (pricing) rate');
    computedPositive(fx.parallelPayment, 'parallel (payment) rate');
  }

  // 3. Cost build-up (storage active for depot tonnes; naira storage converted at parallel payment)
  const cost = buildCostBuildup(trade, {
    cargoValue, deliveredQty, depotTonnes, financing, parallelPayment: fx.parallelPayment,
  });
  const exShipLandedPerMT = cost.exShipLandedPerMT; // base, excl storage
  const depotLandedPerMT = cost.depotLandedPerMT; // base + storage/depotTonnes
  computedPositive(exShipLandedPerMT, 'ex-ship landed cost / MT');

  // 4. Revenue per channel (PARALLEL-driven; naira legs revalued pricing->payment via fxBump)
  // Ex-ship leg: USD share has no FX risk; naira share is fixed in NGN at pricing, revalued at payment.
  let exShipPriceUSD = null;
  let exShipRevenueUSD = 0;
  let exShipNairaUsdAtPricing = 0;
  let exShipNairaNgn = 0;
  if (exShipTonnes > 0) {
    exShipPriceUSD = positive(trade.sell.exShipPricePerMT.value, 'sell.exShipPricePerMT.value');
    const usdPart = exShares.usdShare * exShipPriceUSD * exShipTonnes;
    exShipNairaUsdAtPricing = exShares.nairaShare * exShipPriceUSD * exShipTonnes; // USD-equiv fixed at pricing
    exShipNairaNgn = exShipNairaUsdAtPricing * (fx.parallelPricing || 0);
    const nairaUsdAtPayment = fx.parallelPayment ? exShipNairaNgn / fx.parallelPayment : exShipNairaUsdAtPricing;
    exShipRevenueUSD = usdPart + nairaUsdAtPayment;
  }
  // Depot leg: priced NGN/L, always naira. Converted to USD at parallel payment.
  let depotPriceUSDperMT = null;
  let depotRevenueUSD = 0;
  let depotRevenueNgn = 0;
  if (depotTonnes > 0) {
    const ngnPerL = positive(trade.sell.depotPriceNgnPerL.value, 'sell.depotPriceNgnPerL.value');
    const litresPerMT = positive(trade.pricing.conversion.litresPerMT, 'pricing.conversion.litresPerMT');
    depotRevenueNgn = ngnPerL * litresPerMT * depotTonnes;
    depotPriceUSDperMT = (ngnPerL * litresPerMT) / fx.parallelPayment;
    depotRevenueUSD = depotTonnes * depotPriceUSDperMT;
  }

  // Naira cost (storage, naira-paid) -> needed for net exposure + FX exposure block + FX hedge.
  const nairaCostLines = cost.lines.filter((l) => l.category === 'storage' && l.currency === 'NGN');
  const nairaCostUsd = round(nairaCostLines.reduce((s, l) => s + l.amountUsd, 0), 2);
  const nairaCostNgn = round(nairaCostLines.reduce((s, l) => s + (l.ngnAmount || 0), 0), 2);
  const totalNairaRevenueNgn = round(exShipNairaNgn + depotRevenueNgn, 2);
  const netNairaNgn = totalNairaRevenueNgn - nairaCostNgn;
  const nairaRevenueUsd = round((fx.parallelPayment ? exShipNairaNgn / fx.parallelPayment : 0) + depotRevenueUSD, 2);

  // FLOATING (unhedged) baseline: all naira at parallel payment, ICE at marked.
  const combinedRevenue = exShipRevenueUSD + depotRevenueUSD;
  const combinedCost = cost.allInCost; // baseAllIn + storageTotal
  const standaloneFloat = combinedRevenue - combinedCost;
  const avgRealizedPriceUSDperMT = combinedRevenue / deliveredQty;

  // 5. Equity provider — partner tonnes / retained (independent of standalone; needed before hedges).
  const equityProvider = (trade.partner && trade.partner.equityProvider) || 'partner';
  let partnerPrincipal = 0;
  let principalAsProduct = 0;
  let principalAsCash = 0;
  let partnerTonnes = 0;
  let profitSharePct = 0;
  let benchmarkPriceUSD = null;
  let benchmarkBasis = null;
  if (equityProvider === 'partner') {
    partnerPrincipal = financing.partnerFunding;
    const productAllocationPct = proportion(trade.partner.productAllocationPct ?? 1.0, 'partner.productAllocationPct');
    principalAsProduct = partnerPrincipal * productAllocationPct;
    principalAsCash = partnerPrincipal - principalAsProduct;
    partnerTonnes = principalAsProduct / exShipLandedPerMT; // in-kind valued at EX-SHIP landed
    if (exShipTonnes > 0) { benchmarkPriceUSD = exShipPriceUSD; benchmarkBasis = 'ex-ship price'; }
    else { benchmarkPriceUSD = depotPriceUSDperMT; benchmarkBasis = 'depot realized price (ex-ship channel absent)'; }
    profitSharePct = trade.partner.profitSharePct;
  }
  const tisRetainedTonnes = deliveredQty - partnerTonnes;

  // 6. Hedges — two INDEPENDENT toggles. buildHedge is unchanged (shared with computeEquityPartner).
  const iceHedged = !!(trade.hedge && trade.hedge.iceHedged);
  const fxHedged = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const hedge = buildHedge(trade, { tisRetainedTonnes });
  const fxHedge = buildFxHedge(trade, { netNairaNgn, parallelPricing: fx.parallelPricing, parallelPayment: fx.parallelPayment });

  // Realized hedge impacts on standalone — only when the toggle is ON.
  //   ICE ON  : lock retained ICE at fixed (iceCostDelta) + all-in hedge cost -> reduces profit.
  //   FX  ON  : hedged naira at forward vs parallel (fxRealizedDeltaUsd, +/-) - hedge cost.
  const iceHedgeAllInCost = round(hedge.iceCostDelta + hedge.extraFinancingCost, 2);
  const iceHedgeNetImpact = iceHedged ? round(-iceHedgeAllInCost, 2) : 0;
  const fxHedgeNetImpact = fxHedged ? round(fxHedge.fxRealizedDeltaUsd - fxHedge.extraFinancingCost, 2) : 0;

  // 7. Profit waterfall on the REALIZED (post-hedge) standalone.
  const standaloneProfit = round(standaloneFloat + iceHedgeNetImpact + fxHedgeNetImpact, 2);
  let marginForegone = 0;
  let adjustedProfit = standaloneProfit;
  let partnerCashProfitShare = 0;
  let tisNetProfit = standaloneProfit;
  if (equityProvider === 'partner') {
    marginForegone = partnerTonnes * (benchmarkPriceUSD - exShipLandedPerMT);
    adjustedProfit = standaloneProfit - marginForegone;
    partnerCashProfitShare = profitSharePct * adjustedProfit;
    tisNetProfit = adjustedProfit - partnerCashProfitShare;
  }

  // 8. Tax + surcharge (surcharge base = avg realized retail; TIS bears retained-tonnes share)
  const taxBlock = buildTaxBlock(trade, { exShipPricePerMT: avgRealizedPriceUSDperMT, deliveredQty, tisRetainedTonnes }, cost);
  let tisNetAfterSurcharge = tisNetProfit;
  if (taxBlock.surcharge.enabled && taxBlock.surcharge.incidence === 'cost') {
    tisNetAfterSurcharge = tisNetProfit - taxBlock.surcharge.tisBorneUsd;
  }

  // 9. Hedge comparison — always show the OPPOSITE toggle state (recursion-guarded).
  let hedgeComparison = null;
  if (!opts.skipHedgeCompare) {
    const flip = (extra) => computeTrade({ ...trade, ...extra }, { ...opts, skipHedgeCompare: true }).profit.tisNetProfit;
    const iceOpp = flip({ hedge: { ...(trade.hedge || {}), iceHedged: !iceHedged } });
    const fxOpp = flip({ fxHedge: { ...(trade.fxHedge || {}), fxHedged: !fxHedged } });
    hedgeComparison = {
      ice: {
        state: iceHedged ? 'ON' : 'OFF',
        tisNetThisState: money(tisNetProfit),
        tisNetOppositeState: money(iceOpp),
        hedgedTisNet: money(iceHedged ? tisNetProfit : iceOpp),
        unhedgedTisNet: money(iceHedged ? iceOpp : tisNetProfit),
        hedgeWorthItVsUnhedged: money((iceHedged ? tisNetProfit : iceOpp) - (iceHedged ? iceOpp : tisNetProfit)),
      },
      fx: {
        state: fxHedged ? 'ON' : 'OFF',
        tisNetThisState: money(tisNetProfit),
        tisNetOppositeState: money(fxOpp),
        hedgedTisNet: money(fxHedged ? tisNetProfit : fxOpp),
        unhedgedTisNet: money(fxHedged ? fxOpp : tisNetProfit),
        hedgeWorthItVsUnhedged: money((fxHedged ? tisNetProfit : fxOpp) - (fxHedged ? fxOpp : tisNetProfit)),
      },
    };
  }
  const nafem = fx.nafemReference;
  const fxBlock = {
    currencyMode: exShares.mode,
    usdShare: exShares.usdShare,
    nairaShare: exShares.nairaShare,
    rates: {
      parallelPricing: fx.parallelPricing,
      parallelPayment: fx.parallelPayment,
      paymentBumpPct: fxBump,
      nafemReference: nafem,
      parallelSource: fx.parallel ? fx.parallel.source : null,
      parallelAsOf: fx.parallel ? fx.parallel.asOf : null,
    },
    fxIncidence: fx.fxIncidence,
    nairaRevenue: { ngn: totalNairaRevenueNgn, usdAtParallel: nairaRevenueUsd, usdAtNafemReference: nafem ? round(totalNairaRevenueNgn / nafem, 2) : null },
    nairaCost: { ngn: nairaCostNgn, usdAtParallel: nairaCostUsd, usdAtNafemReference: nafem ? round(nairaCostNgn / nafem, 2) : null },
    netNairaExposureUsd: round(nairaRevenueUsd - nairaCostUsd, 2),
    nafemReconciliationGapUsd:
      nafem != null ? round((nairaRevenueUsd - nairaCostUsd) - ((totalNairaRevenueNgn - nairaCostNgn) / nafem), 2) : null,
    note: 'PARALLEL drives all P&L; NAFEM shown for bank reconciliation only (never in P&L).',
  };

  // 9. Annualised return — base depends on funding source
  let tisAnnualisedReturn = null;
  let annualReturnBase = null;
  let annualReturnBaseLabel = null;
  if (financing.capitalLockupDays) {
    if (equityProvider === 'TIS') { annualReturnBase = financing.partnerFunding; annualReturnBaseLabel = 'TIS equity (self-funded)'; }
    else { annualReturnBase = cargoValue; annualReturnBaseLabel = 'cargo value (INDICATIVE)'; }
    if (annualReturnBase > 0) tisAnnualisedReturn = round((tisNetProfit / annualReturnBase) * (365 / financing.capitalLockupDays), 4);
  }

  // Paper vs economic quantities (partner only)
  let paper = null;
  if (equityProvider === 'partner' && partnerTonnes > 0) {
    const partnerPaper = paperQtyFavorTIS(partnerTonnes, 'partner', 50);
    const tisPaper = paperQtyFavorTIS(tisRetainedTonnes, 'tis', 50);
    const partnerPaperValue = partnerPaper * exShipLandedPerMT;
    paper = {
      partnerPaper, tisPaper, step: 50,
      partnerPaperValue: money(partnerPaperValue),
      cashTrueUp: money(principalAsProduct - partnerPaperValue),
      note: 'Paper tonnes documentary only (rounded in TIS favour). P&L uses economic tonnes.',
    };
  }

  return {
    meta: { ...trade.meta, parties: trade.parties, deliveredQty },
    equityProvider,
    cargoValue,
    unitFob,
    financing,
    cost,
    channels: {
      exShipPct: ch.exShipPct, depotPct: ch.depotPct,
      exShipTonnes: round(exShipTonnes, 4), depotTonnes: round(depotTonnes, 4),
    },
    price: {
      exShipLandedPerMT: round(exShipLandedPerMT, 4),
      depotLandedPerMT: round(depotLandedPerMT, 4),
      exShipPricePerMT: exShipPriceUSD != null ? round(exShipPriceUSD, 4) : null,
      depotPriceNgnPerL: depotTonnes > 0 ? trade.sell.depotPriceNgnPerL.value : null,
      depotPriceUSDperMT: depotPriceUSDperMT != null ? round(depotPriceUSDperMT, 4) : null,
      avgRealizedPriceUSDperMT: round(avgRealizedPriceUSDperMT, 4),
      depotPremiumPerMT: depotPriceUSDperMT != null && exShipPriceUSD != null ? round(depotPriceUSDperMT - exShipPriceUSD, 4) : null,
    },
    revenue: {
      exShipUSD: money(exShipRevenueUSD),
      depotUSD: money(depotRevenueUSD),
      combinedUSD: money(combinedRevenue),
    },
    quantities: {
      deliveredQty,
      economic: {
        partnerTonnes: round(partnerTonnes, 4),
        tisRetainedTonnes: round(tisRetainedTonnes, 4),
        principalAsProduct: money(principalAsProduct),
        principalAsCash: money(principalAsCash),
      },
      paper,
    },
    profit: {
      standaloneProfit: money(standaloneProfit),
      marginForegone: money(marginForegone),
      benchmarkPriceUSD: benchmarkPriceUSD != null ? round(benchmarkPriceUSD, 4) : null,
      benchmarkBasis,
      adjustedProfit: money(adjustedProfit),
      profitSharePct,
      partnerCashProfitShare: money(partnerCashProfitShare),
      tisNetProfit: money(tisNetProfit),
      tisNetAfterSurcharge: money(tisNetAfterSurcharge),
      reconciliation: {
        identity: '(revenue - cost) + hedge impacts = standalone;  marginForegone + adjusted = standalone',
        revenueLessCost: money(standaloneFloat),
        iceHedgeNetImpact: money(iceHedgeNetImpact),
        fxHedgeNetImpact: money(fxHedgeNetImpact),
        standalone: money(standaloneProfit),
        marginForegonePlusAdjusted: money(marginForegone + adjustedProfit),
        ok: Math.abs(standaloneFloat + iceHedgeNetImpact + fxHedgeNetImpact - standaloneProfit) < 0.01 &&
            Math.abs(marginForegone + adjustedProfit - standaloneProfit) < 0.01,
      },
    },
    hedges: {
      iceHedged,
      fxHedged,
      iceHedgeNetImpact: money(iceHedgeNetImpact),
      fxHedgeNetImpact: money(fxHedgeNetImpact),
    },
    partnerDelivers: equityProvider === 'partner' ? {
      note: 'TIS-internal view: only what TIS delivers. No partner-side upside / net-return interpretation.',
      productReceived: { tonnes: round(partnerTonnes, 4), valuedAtExShipLandedCost: money(principalAsProduct) },
      cashReceived: { profitShare: money(partnerCashProfitShare), principalCashPortion: money(principalAsCash) },
      principalTie: {
        owed: money(partnerPrincipal),
        returnedProductValue: money(principalAsProduct),
        returnedCash: money(principalAsCash),
        ok: Math.abs(principalAsProduct + principalAsCash - partnerPrincipal) < 0.01,
      },
    } : { note: 'TIS self-funded — no partner. standalone = adjusted = TIS net; no in-kind / profit-share.' },
    fx: fxBlock,
    tax: taxBlock,
    hedge,
    fxHedge,
    hedgeComparison,
    tisAnnualisedReturn,
    annualReturnBase: annualReturnBase != null ? money(annualReturnBase) : null,
    annualReturnBaseLabel,
  };
}

module.exports = { computeTrade };
