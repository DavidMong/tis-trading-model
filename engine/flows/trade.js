'use strict';

const { round, money, paperQtyFavorTIS } = require('../core/rounding');
const { buildFinancing } = require('../core/financing');
const { buildCostBuildup } = require('../core/cost-buildup');
const { buildTaxBlock } = require('../core/tax');
const { buildHedge } = require('../core/hedge');
const { resolveFxRates, exShipCurrencyShares } = require('../core/fx');
const { buildFxHedge } = require('../core/fx-hedge');
const { normalizeLegs, computeLegRevenue } = require('../core/revenue');
const { num, positive, nonNegative, proportion, oneOf, sumToOne, computedPositive } = require('../core/validate');

// UNIFIED, fully-configurable trade flow. Sale revenue is a PER-LEG model (engine/core/revenue.js):
// a trade holds a LIST of revenue legs, each priced in ONE unit —
//   { channel: 'ex-ship'|'depot', pricingUnit: 'USD_PER_MT'|'NGN_PER_L', tonnes (or share), price }
// Any MIX is supported: ex-ship-USD ($/MT), ex-ship-NGN (native ₦/L), depot-NGN (₦/L, always — depot is
// never USD). Every NGN_PER_L leg → USD via (ngnPerL × litresPerMT) / parallelPayment (depot-identical;
// ex-ship-NGN reuses the same conversion). Legacy trades (channels.exShipPct/depotPct + sell.currencyMode
// /splitUsdPct) are ADAPTED onto this model and compute byte-for-byte identically — see revenue.js.
//
// Other INDEPENDENT dimensions, every combination computes:
//   - EQUITY PROVIDER: 'partner' (equity-split waterfall) or 'TIS' (self-funded; standalone = TIS net).
//   - EQUITY RATIO   : bond/equity/LC fully configurable; funding stack validated to 100%.
//   - CURRENCY       : per-leg pricing unit (above). PARALLEL drives P&L; NAFEM reference only.
//   - DEPOT          : margin vs ALL-IN DEPOT landed; naira storage costs FX-exposed.
//
// The engine is USD-internal; the FX layer converts naira legs to USD-equivalent at the PARALLEL rate
// and reports FX exposure separately. computeEquityPartner stays the verified reference-trade path; this flow
// reproduces it exactly for {ex-ship, partner, USD, 25%} (see test/invariants.js cross-check).
//
// PARTNER IN-KIND BENCHMARK: the partner's in-kind product is valued in USD — at the USD ex-ship price
// when a USD ex-ship leg exists; otherwise at the USD-equivalent landed cost. Deterministic, no arbitrary
// pick. (The product is lifted ex-ship at the tank farm, so TIS keeps the depot premium it earns by
// taking storage/holding/FX risk.)

function validateTrade(trade, deliveredQty, ch, native) {
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

  // Legacy channel split is validated here; NATIVE per-leg trades validate leg tonnage in normalizeLegs.
  if (!native) {
    proportion(ch.exShipPct, 'channels.exShipPct');
    proportion(ch.depotPct, 'channels.depotPct');
    sumToOne({ exShipPct: ch.exShipPct, depotPct: ch.depotPct }, 'channels');
  }

  const provider = (trade.partner && trade.partner.equityProvider) || 'partner';
  oneOf(provider, ['partner', 'TIS'], 'partner.equityProvider');
  if (provider === 'partner') proportion(trade.partner.profitSharePct, 'partner.profitSharePct');
}

function computeTrade(trade, opts = {}) {
  const deliveredQty = opts.deliveredQtyOverride ?? trade.cargo.deliveredQtyMT;
  const native = Array.isArray(trade.revenueLegs) && trade.revenueLegs.length > 0;
  const ch = trade.channels || { exShipPct: 1, depotPct: 0 };
  validateTrade(trade, deliveredQty, ch, native);

  // 0. Effective ICE. The physical FOB purchase FLOATS at ICE; `market.ice.final` is the
  //    SETTLEMENT/at-payment print. When set, it is the single ICE that drives BOTH the landed cost
  //    AND the swap reference — one shared value, never a second reference on the same tonnes, so the
  //    swap (hedged tonnes) and the physical (full cargo) offset cleanly, and partner principal/tonnes
  //    recompute at the new landed cost (self-offset at par). When BLANK it is exactly the live value,
  //    so `effTrade === trade` by reference and every existing number is byte-for-byte unchanged.
  const liveIce = trade.market.ice.value;
  const finalIce = trade.market.ice.final != null ? trade.market.ice.final : null;
  const effectiveIce = finalIce != null ? finalIce : liveIce;
  if (finalIce != null) num(finalIce, 'market.ice.final');
  const effTrade = effectiveIce === liveIce
    ? trade
    : { ...trade, market: { ...trade.market, ice: { ...trade.market.ice, value: effectiveIce } } };

  // 1. Cargo FOB value & funding stack (equity ratio configurable, validated to 100%)
  const unitFob = effectiveIce + trade.market.fobPremium.value;
  const cargoValue = unitFob * deliveredQty;
  const financing = buildFinancing(effTrade, cargoValue);

  // 2. FX rates. PARALLEL = economic (P&L); NAFEM = reference only. fxBump = payment-vs-pricing parallel.
  const fxBump = opts.fxBump ?? (trade.fx && trade.fx.paymentBumpPct) ?? 0;
  const fx = resolveFxRates(trade, fxBump);
  // Legacy currency split only applies to the legacy adapter (native trades carry per-leg pricing units).
  const exShares = native ? null : exShipCurrencyShares(trade);

  // 3. Per-leg revenue model (native trade.revenueLegs, else legacy channels+currencyMode adapter).
  const { legs, litresPerMT } = normalizeLegs(trade, {
    deliveredQty, ch, exShares, parallelPricing: fx.parallelPricing,
  });
  const exShipTonnes = legs.filter((l) => l.channel === 'ex-ship').reduce((s, l) => s + l.tonnes, 0);
  const depotTonnes = legs.filter((l) => l.channel === 'depot').reduce((s, l) => s + l.tonnes, 0);

  const needNaira = legs.some((l) => l.pricingUnit === 'NGN_PER_L');
  if (needNaira) {
    computedPositive(fx.parallelPricing, 'parallel (pricing) rate');
    computedPositive(fx.parallelPayment, 'parallel (payment) rate');
  }

  // 4. Cost build-up (storage active for depot tonnes; naira storage converted at parallel payment).
  //    effTrade => cost line 1 ("ICE LSGO", rateFrom market.ice.value) resolves to the effective ICE.
  const cost = buildCostBuildup(effTrade, {
    cargoValue, deliveredQty, depotTonnes, financing, parallelPayment: fx.parallelPayment,
  });
  const exShipLandedPerMT = cost.exShipLandedPerMT; // base, excl storage
  const depotLandedPerMT = cost.depotLandedPerMT; // base + storage/depotTonnes
  computedPositive(exShipLandedPerMT, 'ex-ship landed cost / MT');

  // 5. Revenue — sum the legs. USD_PER_MT legs carry no FX risk; every NGN_PER_L leg (depot OR native
  // ex-ship-NGN) converts identically: (ngnPerL × litresPerMT) / parallelPayment, naira fixed for exposure.
  const legResults = legs.map((l) => ({ leg: l, rev: computeLegRevenue(l, { parallelPayment: fx.parallelPayment, litresPerMT }) }));
  let exShipRevenueUSD = 0;
  let depotRevenueUSD = 0;
  let totalNairaRevenueNgnRaw = 0;
  for (const { leg, rev } of legResults) {
    if (leg.channel === 'ex-ship') exShipRevenueUSD += rev.usdRevenue;
    else depotRevenueUSD += rev.usdRevenue;
    totalNairaRevenueNgnRaw += rev.nairaNgn; // 0 for USD legs
  }
  // Representative per-channel prices (display + benchmark). exShipPriceUSD = the USD ex-ship leg price
  // (or a legacy naira-settled leg's retained USD ref); depot from the depot leg's USD-equivalent.
  const exShipUsdLeg = legs.find((l) => l.channel === 'ex-ship' && l.pricingUnit === 'USD_PER_MT');
  const exShipAnyLeg = legs.find((l) => l.channel === 'ex-ship');
  const exShipPriceUSD = exShipUsdLeg ? exShipUsdLeg.price : (exShipAnyLeg ? exShipAnyLeg.usdPriceRef : null);
  const depotLegResult = legResults.find((x) => x.leg.channel === 'depot');
  const depotPriceUSDperMT = depotLegResult ? depotLegResult.rev.priceUsdPerMT : null;
  const depotPriceNgnPerL = depotLegResult ? depotLegResult.leg.price : null;

  // Channel split + ex-ship currency view for the output. Legacy preserves the exShipCurrencyShares
  // values byte-for-byte; native derives them from the resolved legs (ex-ship USD vs NGN tonnage).
  const exShipPct = native ? exShipTonnes / deliveredQty : ch.exShipPct;
  const depotPct = native ? depotTonnes / deliveredQty : ch.depotPct;
  let currencyView;
  if (native) {
    const usdT = legs.filter((l) => l.channel === 'ex-ship' && l.pricingUnit === 'USD_PER_MT').reduce((s, l) => s + l.tonnes, 0);
    const usdShare = exShipTonnes > 0 ? usdT / exShipTonnes : 0;
    const mode = usdShare === 1 ? 'USD' : usdShare === 0 ? 'NGN' : 'split';
    currencyView = { mode, usdShare, nairaShare: 1 - usdShare };
  } else {
    currencyView = { mode: exShares.mode, usdShare: exShares.usdShare, nairaShare: exShares.nairaShare };
  }

  // Naira cost (storage, naira-paid) -> needed for net exposure + FX exposure block + FX hedge.
  const nairaCostLines = cost.lines.filter((l) => l.category === 'storage' && l.currency === 'NGN');
  const nairaCostUsd = round(nairaCostLines.reduce((s, l) => s + l.amountUsd, 0), 2);
  const nairaCostNgn = round(nairaCostLines.reduce((s, l) => s + (l.ngnAmount || 0), 0), 2);
  // NGN AGGREGATION: sum N arbitrary NGN legs (not two named buckets) minus naira cost -> FX exposure.
  const totalNairaRevenueNgn = round(totalNairaRevenueNgnRaw, 2);
  const netNairaNgn = totalNairaRevenueNgn - nairaCostNgn;
  const nairaRevenueUsd = round(legResults.reduce((s, x) => s + (x.leg.pricingUnit === 'NGN_PER_L' ? x.rev.usdRevenue : 0), 0), 2);

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
    // PARTNER IN-KIND BENCHMARK (#4): USD ex-ship price when a USD ex-ship leg exists; otherwise the
    // USD-equivalent landed cost. Deterministic — never an arbitrary pick of a naira leg's realized price.
    if (exShipUsdLeg) { benchmarkPriceUSD = exShipUsdLeg.price; benchmarkBasis = 'ex-ship price'; }
    else { benchmarkPriceUSD = exShipLandedPerMT; benchmarkBasis = 'USD-equivalent landed cost (no USD ex-ship leg)'; }
    profitSharePct = trade.partner.profitSharePct;
  }
  const tisRetainedTonnes = deliveredQty - partnerTonnes;

  // 6. Hedges — two INDEPENDENT toggles. buildHedge is unchanged (shared with computeEquityPartner).
  const iceHedged = !!(trade.hedge && trade.hedge.iceHedged);
  const fxHedged = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const hedge = buildHedge(effTrade, { tisRetainedTonnes }); // effTrade => liveIce ref = effective (settlement) ICE
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
    currencyMode: currencyView.mode,
    usdShare: currencyView.usdShare,
    nairaShare: currencyView.nairaShare,
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
      exShipPct, depotPct,
      exShipTonnes: round(exShipTonnes, 4), depotTonnes: round(depotTonnes, 4),
    },
    price: {
      exShipLandedPerMT: round(exShipLandedPerMT, 4),
      depotLandedPerMT: round(depotLandedPerMT, 4),
      exShipPricePerMT: exShipPriceUSD != null ? round(exShipPriceUSD, 4) : null,
      depotPriceNgnPerL: depotPriceNgnPerL,
      depotPriceUSDperMT: depotPriceUSDperMT != null ? round(depotPriceUSDperMT, 4) : null,
      avgRealizedPriceUSDperMT: round(avgRealizedPriceUSDperMT, 4),
      depotPremiumPerMT: depotPriceUSDperMT != null && exShipPriceUSD != null ? round(depotPriceUSDperMT - exShipPriceUSD, 4) : null,
    },
    revenue: {
      exShipUSD: money(exShipRevenueUSD),
      depotUSD: money(depotRevenueUSD),
      combinedUSD: money(combinedRevenue),
      // Per-leg breakdown (per-leg revenue model). NGN legs carry their fixed naira amount (FX exposure).
      legs: legResults.map(({ leg, rev }) => ({
        channel: leg.channel,
        pricingUnit: leg.pricingUnit,
        tonnes: round(leg.tonnes, 4),
        price: leg.price,
        priceUsdPerMT: round(rev.priceUsdPerMT, 4),
        usd: money(rev.usdRevenue),
        ngn: leg.pricingUnit === 'NGN_PER_L' ? round(rev.nairaNgn, 2) : null,
      })),
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
