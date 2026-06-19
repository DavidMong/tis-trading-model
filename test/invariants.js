'use strict';

// Verification harness — asserts the model's core invariants. No framework; run: node test/invariants.js
// These are the same reconciliations a human reviewer should eyeball, encoded as hard checks.

const path = require('node:path');
const { computeEquityPartner } = require('../engine/flows/equity-partner');

const trade = require('../trades/profogas-dangote-001.json');

let pass = 0;
let fail = 0;
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const r = computeEquityPartner(trade);

console.log('Invariant checks — equity-partner / first trade');

// 1. Funding stack closes to 100% of cargo value
check('funding stack (bond+equity+LC) = 100% of cargo', r.financing.check.fundingStackPctOfCargo === 1);
check('partner funding = 25% of cargo value', approx(r.financing.partnerFunding, 0.25 * r.cargoValue));
check('bank LC = 75% of cargo value', approx(r.financing.lc, 0.75 * r.cargoValue));

// 2. Recoverable VAT excluded from landed cost
const recoverableInCost = r.cost.lines.filter((l) => l.recoverable).reduce((s, l) => s + l.amountUsd, 0);
const sumNonRecoverable = r.cost.lines.filter((l) => !l.recoverable).reduce((s, l) => s + l.amountUsd, 0);
check('all-in landed cost excludes recoverable VAT', approx(r.cost.allInCost, sumNonRecoverable));
check('recoverable VAT = lines 12+13 x taxableSupplyProportion',
  approx(r.cost.recoverableVat.recoverable, recoverableInCost * trade.tax.taxableSupplyProportion));

// 3. Ex-ship price: fixed value when set, else cost-plus placeholder
const sell = trade.sell.exShipPricePerMT;
if (sell.value != null) {
  check('ex-ship price = fixed input value (decoupled from cost)', approx(r.price.exShipPricePerMT, sell.value));
} else {
  check('ex-ship placeholder = landed x (1 + margin)',
    approx(r.price.exShipPricePerMT, r.price.landedCostPerMT * (1 + (sell.placeholderMarginPct ?? 0.06)), 0.001));
}

// 4. Partner economic tonnes x landed = principal-as-product
// (recomputed from 4dp-rounded display values -> allow ~$1 presentation-rounding tolerance)
check('partner tonnes x ex-storage landed = principal as product',
  approx(r.quantities.economic.partnerTonnes * r.price.exStorageLandedPerMT, r.quantities.economic.principalAsProduct, 1));

// 5. Profit waterfall reconciliation identity
check('marginForegone + adjusted = standalone',
  approx(r.profit.marginForegone + r.profit.adjustedProfit, r.profit.standaloneProfit));
check('adjusted = retained tonnes x per-MT margin',
  approx(r.profit.adjustedProfit, r.quantities.economic.tisRetainedTonnes * r.price.perMtMargin, 1));
check('partner cash + TIS net = adjusted profit',
  approx(r.profit.partnerCashProfitShare + r.profit.tisNetProfit, r.profit.adjustedProfit));
check('TIS net = (1 - share) x adjusted',
  approx(r.profit.tisNetProfit, (1 - r.profit.profitSharePct) * r.profit.adjustedProfit));

// 6. Partner principal tie-out
check('partner principal tie: product + cash = principal owed', r.partnerDelivers.principalTie.ok);

// 7. profitSharePct reflow — sum is invariant to the split
for (const s of [0, 0.35, 0.5, 1]) {
  const rr = computeEquityPartner({ ...trade, partner: { ...trade.partner, profitSharePct: s } });
  check(`reflow share=${s}: partner cash + TIS net = adjusted`,
    approx(rr.profit.partnerCashProfitShare + rr.profit.tisNetProfit, rr.profit.adjustedProfit, 0.02));
}

// 8. Zero product allocation => zero margin foregone => adjusted == standalone
const rNoProduct = computeEquityPartner({ ...trade, partner: { ...trade.partner, productAllocationPct: 0 } });
check('productAllocationPct=0 => marginForegone = 0', approx(rNoProduct.profit.marginForegone, 0));
check('productAllocationPct=0 => adjusted = standalone',
  approx(rNoProduct.profit.adjustedProfit, rNoProduct.profit.standaloneProfit));

// 9. WHT freight is a COST (not recoverable) and flagged CONFIRM
const wht = r.cost.byId[11];
check('WHT freight is non-recoverable COST', wht.recoverable === false);
check('WHT freight status = CONFIRM', wht.status === 'CONFIRM');

// 10. Surcharge OFF by default, amount 0, status PENDING
check('surcharge OFF by default', r.tax.surcharge.enabled === false);
check('surcharge amount = 0 when OFF', r.tax.surcharge.amountUsd === 0);

// 11. Fixed-price baseline: cost-up must REDUCE TIS net (proves price is NOT coupled to cost)
if (sell.value != null) {
  const base = r.profit.tisNetProfit;
  const bumped = (m) => { const t2 = JSON.parse(JSON.stringify(trade)); m(t2); return computeEquityPartner(t2).profit.tisNetProfit; };
  check('fixed price: ICE +10% reduces TIS net', bumped((t) => { t.market.ice.value *= 1.1; }) < base);
  check('fixed price: FOB +10% reduces TIS net', bumped((t) => { t.market.fobPremium.value *= 1.1; }) < base);
  check('fixed price: TC +10% reduces TIS net', bumped((t) => { t.freight.tcRatePerDay *= 1.1; }) < base);
}

// 12. Pricing ladder — must reconcile with the engine; tier prices must be cost-derived.
const { buildExShipLadder } = require('../engine/core/pricing-ladder');
const ladder = buildExShipLadder(trade, (t) => computeEquityPartner(t), r);
const exLanded = ladder.costBasePerMT;

for (const t of ladder.tiers) {
  // tier price solves margin-of-sell = (price - landed)/price  ->  price = landed/(1-m)
  check(`ladder ${t.name}: price = landed / (1 - marginOfSell)`,
    approx(t.pricePerMT, exLanded / (1 - t.marginOfSell), 0.01));
  // three metrics internally consistent
  check(`ladder ${t.name}: spread = price - landed`, approx(t.spreadPerMT, t.pricePerMT - exLanded, 0.01));
  check(`ladder ${t.name}: margin%ofSell = spread/price`, approx(t.marginPctOfSell, t.spreadPerMT / t.pricePerMT, 1e-4));
}

// Target tier TIS net must equal an independent engine run at that price (no duplicated math).
const target = ladder.tiers.find((t) => t.name === 'Target');
const directAtTarget = computeEquityPartner({ ...trade, sell: { exShipPricePerMT: { value: target.pricePerMT } } });
check('ladder Target TIS net == direct engine run at Target price',
  approx(target.tisNetProfit, directAtTarget.profit.tisNetProfit, 0.5));
check('ladder Target adjusted == direct engine run at Target price',
  approx(target.adjustedProfit, directAtTarget.profit.adjustedProfit, 0.5));

// Entered $1,400 should classify nearest to Stretch.
check('entered $1,400 nearest tier = Stretch', ladder.current && ladder.current.nearestTier === 'Stretch');

// Ladder re-derives off landed cost: bump ICE -> ex-ship landed base moves.
const ladderHiIce = buildExShipLadder({ ...trade, market: { ...trade.market, ice: { ...trade.market.ice, value: trade.market.ice.value * 1.1 } } }, (t) => computeEquityPartner(t), computeEquityPartner({ ...trade, market: { ...trade.market, ice: { ...trade.market.ice, value: trade.market.ice.value * 1.1 } } }));
check('ladder cost base re-derives when ICE moves', ladderHiIce.costBasePerMT > exLanded);

// ============================================================================================
// Code-review fix coverage (#1 VAT apportionment, #2 validation, #3 surcharge, #4 day-count,
// #6 ladder bounds, #7 hedge comparison)
// ============================================================================================
const clone = (o) => JSON.parse(JSON.stringify(o));
function expectThrow(name, fn, frag) {
  try { fn(); check(`${name} (expected throw)`, false); }
  catch (e) { check(name, frag ? e.message.includes(frag) : true); }
}

// #1 — irrecoverable input VAT becomes a cost when taxableSupplyProportion < 1
const r10 = computeEquityPartner({ ...trade, tax: { ...trade.tax, taxableSupplyProportion: 1.0 } });
const r08 = computeEquityPartner({ ...trade, tax: { ...trade.tax, taxableSupplyProportion: 0.8 } });
const grossVat = r10.cost.recoverableVat.grossRecoverable; // VAT lines 12 + 13
const irr = grossVat * 0.2; // ~25,155.75
check('#1 irrecoverable VAT reported (tsp=0.8)', approx(r08.cost.recoverableVat.irrecoverable, irr, 0.01));
check('#1 allInCost rises by EXACTLY the irrecoverable VAT', approx(r08.cost.allInCost - r10.cost.allInCost, irr, 0.01));
check('#1 standalone profit drops by EXACTLY the irrecoverable VAT', approx(r10.profit.standaloneProfit - r08.profit.standaloneProfit, irr, 0.01));
check('#1 tsp=1.0 has zero irrecoverable VAT (no regression)', approx(r10.cost.recoverableVat.irrecoverable, 0, 0.001));
check('#1 TIS net drops at tsp<1 (diluted by profit share, not full irr)', r08.profit.tisNetProfit < r10.profit.tisNetProfit);

// #2 — input validation at the engine boundary (no NaN/Infinity)
expectThrow('#2 zero deliveredQty throws', () => computeEquityPartner({ ...trade, cargo: { ...trade.cargo, deliveredQtyMT: 0 } }), 'deliveredQtyMT');
expectThrow('#2 negative deliveredQty throws', () => computeEquityPartner({ ...trade, cargo: { ...trade.cargo, deliveredQtyMT: -100 } }), 'deliveredQtyMT');
expectThrow('#2 missing charterDays throws (no NaN)', () => { const d = clone(trade); delete d.freight.charterDays; computeEquityPartner(d); }, 'charterDays');
expectThrow('#2 taxableSupplyProportion>1 throws', () => computeEquityPartner({ ...trade, tax: { ...trade.tax, taxableSupplyProportion: 1.5 } }), 'taxableSupplyProportion');
expectThrow('#2 zero landed cost throws (divisor guard)', () => {
  const d = clone(trade);
  d.market.ice.value = 0; d.market.fobPremium.value = 0; d.freight.tcRatePerDay = 0;
  d.financing.creditRate = 0; d.financing.lcFeePct = 0;
  for (const k of Object.keys(d.costLines)) d.costLines[k] = 0;
  computeEquityPartner(d);
}, 'ex-storage landed cost');

// #3 — surcharge charges TIS for retained tonnes only (gated OFF by default)
const sON = computeEquityPartner({ ...trade, tax: { ...trade.tax, surcharge: { ...trade.tax.surcharge, enabled: true } } });
const expectedBorne = 0.05 * sON.price.exShipPricePerMT * sON.quantities.economic.tisRetainedTonnes;
check('#3 TIS-borne surcharge = rate x exShip x RETAINED tonnes', approx(sON.tax.surcharge.tisBorneUsd, expectedBorne, 1));
check('#3 TIS-borne < full statutory (partner share excluded)', sON.tax.surcharge.tisBorneUsd < sON.tax.surcharge.amountUsd);
check('#3 tisNetAfterSurcharge = tisNet - TIS-borne (retained only)', approx(sON.profit.tisNetAfterSurcharge, sON.profit.tisNetProfit - sON.tax.surcharge.tisBorneUsd, 0.01));
check('#3 surcharge OFF by default', computeEquityPartner(trade).tax.surcharge.enabled === false);

// #4 — configurable day-count basis (Actual/365 default vs Actual/360)
const ci365 = computeEquityPartner({ ...trade, financing: { ...trade.financing, dayCountBasis: 365 } }).cost.byId[19].amountUsd;
const ci360 = computeEquityPartner({ ...trade, financing: { ...trade.financing, dayCountBasis: 360 } }).cost.byId[19].amountUsd;
check('#4 Actual/360 yields higher interest than Actual/365', ci360 > ci365);
check('#4 interest ratio matches 365/360', approx(ci360 / ci365, 365 / 360, 1e-4));
const dNoBasis = clone(trade); delete dNoBasis.financing.dayCountBasis;
check('#4 missing dayCountBasis defaults to 365', computeEquityPartner(dNoBasis).financing.dayCountBasis === 365);

// #6 — pricing-ladder tier bounds (buildExShipLadder is in scope from the #12 block above)
const baseR = computeEquityPartner(trade);
const badTier = (m) => ({ ...trade, pricing: { ...trade.pricing, exShipTiers: [{ name: 'Bad', marginOfSell: m }] } });
expectThrow('#6 tier marginOfSell=1 throws (not Infinity)', () => buildExShipLadder(badTier(1), (t) => computeEquityPartner(t), baseR), 'marginOfSell');
expectThrow('#6 tier marginOfSell=1.2 throws (not negative)', () => buildExShipLadder(badTier(1.2), (t) => computeEquityPartner(t), baseR), 'marginOfSell');
expectThrow('#6 tier marginOfSell=0 throws', () => buildExShipLadder(badTier(0), (t) => computeEquityPartner(t), baseR), 'marginOfSell');

// #7 — hedged-vs-unhedged comparison stays apples-to-apples when over-hedged
const rOver = computeEquityPartner({ ...trade, hedge: { ...trade.hedge, hedgedVolumeMT: trade.cargo.deliveredQtyMT } });
check('#7 over-hedge flagged as overHedgeTonnes', rOver.hedge.overHedgeTonnes > 0);
check('#7 over-hedge comparison stays apples-to-apples (delta ~0 at fixed=live)', Math.abs(rOver.hedge.iceCostDelta) < 1);
check('#7 effective ICE priced on retained basis, not hedged volume', approx(rOver.hedge.effectiveIceCost, rOver.hedge.comparisonBasisTonnes * rOver.hedge.liveIce, 1));

// ============================================================================================
// FX engine + depot channel (unified computeTrade flow)
// ============================================================================================
const { computeTrade } = require('../engine/flows/trade');
const { runSensitivities } = require('../engine/core/sensitivities');
const depotOnly = require('../trades/sample-depot-only.json');
const bothChannels = require('../trades/sample-both-channels.json');
const exshipTis = require('../trades/sample-exship-tis.json');

// FX1 — REGRESSION: computeTrade reproduces computeEquityPartner exactly on the Profogas trade.
const ctP = computeTrade(trade);
check('FX1 computeTrade == computeEquityPartner: standalone', approx(ctP.profit.standaloneProfit, r.profit.standaloneProfit, 0.01));
check('FX1 computeTrade == computeEquityPartner: marginForegone', approx(ctP.profit.marginForegone, r.profit.marginForegone, 0.01));
check('FX1 computeTrade == computeEquityPartner: TIS net', approx(ctP.profit.tisNetProfit, r.profit.tisNetProfit, 0.01));
check('FX1 computeTrade == computeEquityPartner: partner tonnes', approx(ctP.quantities.economic.partnerTonnes, r.quantities.economic.partnerTonnes, 0.01));

// FX2 — USD mode is an FX no-op: no naira share, and a parallel bump does not move P&L.
const exTis = computeTrade(exshipTis);
check('FX2 USD mode: naira share = 0', exTis.fx.nairaShare === 0);
check('FX2 USD mode: parallel payment bump does not change TIS net',
  approx(computeTrade({ ...exshipTis, fx: { ...exshipTis.fx, paymentBumpPct: 0.1 } }).profit.tisNetProfit, exTis.profit.tisNetProfit, 0.01));

// FX3 — PARALLEL drives P&L; NAFEM is reference only.
const dBase = computeTrade(depotOnly);
const nafemBumped = computeTrade({ ...depotOnly, fx: { ...depotOnly.fx, nafem: { ...depotOnly.fx.nafem, value: depotOnly.fx.nafem.value * 1.5 } } });
check('FX3 NAFEM is reference only (bump NAFEM 50% -> TIS net unchanged)', approx(nafemBumped.profit.tisNetProfit, dBase.profit.tisNetProfit, 0.01));
const parBumped = computeTrade({ ...depotOnly, fx: { ...depotOnly.fx, parallel: { ...depotOnly.fx.parallel, value: depotOnly.fx.parallel.value * 1.1 } } });
check('FX3 PARALLEL drives P&L (bump parallel 10% -> TIS net changes)', Math.abs(parBumped.profit.tisNetProfit - dBase.profit.tisNetProfit) > 1);

// FX4 — depot landed cost > ex-ship landed cost (storage included only for depot).
check('FX4 depot landed > ex-ship landed', dBase.price.depotLandedPerMT > dBase.price.exShipLandedPerMT);
check('FX4 ex-ship-only trade: depot landed == ex-ship landed', approx(exTis.price.depotLandedPerMT, exTis.price.exShipLandedPerMT, 0.0001));

// FX5 — FX sensitivity bites ONLY naira legs.
const usdFx = runSensitivities(exshipTis, (t) => computeTrade(t), { fxMode: 'parallel' }).scenarios.filter((s) => /FX/.test(s.lever));
check('FX5 USD trade: FX sensitivity delta = 0', usdFx.every((s) => Math.abs(s.deltaVsBase) < 0.01));
const depotFx = runSensitivities(depotOnly, (t) => computeTrade(t), { fxMode: 'parallel' }).scenarios.filter((s) => /FX/.test(s.lever));
check('FX5 depot trade: FX sensitivity delta != 0', depotFx.some((s) => Math.abs(s.deltaVsBase) > 1));

// FX6 — naira DEPOT COSTS are FX-exposed (parallel payment bump moves naira storage USD).
const stUsd = (res) => res.cost.lines.filter((l) => l.category === 'storage' && l.currency === 'NGN').reduce((s, l) => s + l.amountUsd, 0);
const stBase = stUsd(dBase);
const stBumped = stUsd(computeTrade({ ...depotOnly, fx: { ...depotOnly.fx, paymentBumpPct: 0.1 } }));
check('FX6 naira depot costs FX-exposed (weaker naira -> lower USD cost)', stBase > 0 && stBumped < stBase);

// FX7 — depot reconciliations tie; depot-only TIS-funded => standalone = adjusted = TIS net.
check('FX7 depot reconciliation ties', dBase.profit.reconciliation.ok === true);
check('FX7 TIS self-funded: standalone = adjusted = TIS net',
  approx(dBase.profit.standaloneProfit, dBase.profit.tisNetProfit, 0.01) && approx(dBase.profit.adjustedProfit, dBase.profit.tisNetProfit, 0.01));
check('FX7 TIS self-funded: partner tonnes = 0', dBase.quantities.economic.partnerTonnes === 0);
check('FX7 TIS self-funded: annualised return on TIS equity', dBase.annualReturnBaseLabel.includes('TIS equity'));

// FX8 — both-channels pooling + configurable equity ratio (advanceRate 0.80) re-flows.
const both = computeTrade(bothChannels);
check('FX8 both channels pool into one P&L (rev - cost = standalone)',
  approx(both.profit.standaloneProfit, both.revenue.combinedUSD - both.cost.allInCost, 0.02));
check('FX8 equity ratio re-flow: LC = 80% of cargo', approx(both.financing.lc, 0.8 * both.cargoValue, 1));
check('FX8 equity ratio re-flow: partner funding = 20% of cargo', approx(both.financing.partnerFunding, 0.2 * both.cargoValue, 1));
check('FX8 day-count Actual/360 used', both.financing.dayCountBasis === 360);

// FX9 — margin-foregone benchmark = EX-SHIP price (both channels); depot-only partner falls back.
check('FX9 margin-foregone benchmark = ex-ship price (both channels)',
  approx(both.profit.benchmarkPriceUSD, bothChannels.sell.exShipPricePerMT.value, 0.01));
const depotPartner = computeTrade({ ...depotOnly, partner: { ...depotOnly.partner, equityProvider: 'partner', profitSharePct: 0.3, productAllocationPct: 1.0 } });
check('FX9 depot-only partner: benchmark falls back to depot realized price',
  approx(depotPartner.profit.benchmarkPriceUSD, depotPartner.price.depotPriceUSDperMT, 0.01));

// FX10 — validation throws on bad funding stack / channel split.
expectThrow('FX10 funding stack not summing to 1 throws', () => computeTrade({ ...bothChannels, partner: { ...bothChannels.partner, equityPct: 0.3 } }), 'sum to 1.0');
expectThrow('FX10 channel split not summing to 1 throws', () => computeTrade({ ...depotOnly, channels: { exShipPct: 0.5, depotPct: 0.4 } }), 'channels');
expectThrow('FX10 invalid currencyMode throws', () => computeTrade({ ...exshipTis, sell: { ...exshipTis.sell, currencyMode: 'EUR' } }), 'currencyMode');

// ============================================================================================
// FX hedge + ICE hedge toggles (realized-P&L, comparison, basis risk)
// ============================================================================================
const bOff = computeTrade(bothChannels); // sample has both toggles OFF by default

// HX1 — toggles OFF = no-op (realized P&L == floating).
check('HX1 toggles OFF: no ICE/FX P&L impact', bOff.hedges.iceHedgeNetImpact === 0 && bOff.hedges.fxHedgeNetImpact === 0);
check('HX1 toggles OFF: standalone == revenue - cost', approx(bOff.profit.standaloneProfit, bOff.revenue.combinedUSD - bOff.cost.allInCost, 0.02));

// HX2 — ICE-ON drives realized P&L: impact = -(iceCostDelta + all-in hedge cost); base-case = hedge cost.
const iceOn = computeTrade({ ...bothChannels, hedge: { ...bothChannels.hedge, iceHedged: true } });
check('HX2 ICE-ON impact = -(iceCostDelta + hedge cost)', approx(iceOn.hedges.iceHedgeNetImpact, -(iceOn.hedge.iceCostDelta + iceOn.hedge.extraFinancingCost), 0.02));
check('HX2 ICE-ON: standalone = float + ICE impact', approx(iceOn.profit.standaloneProfit, bOff.profit.standaloneProfit + iceOn.hedges.iceHedgeNetImpact, 0.02));
check('HX2 ICE-ON: TIS net < OFF (cost of hedging)', iceOn.profit.tisNetProfit < bOff.profit.tisNetProfit);

// HX3 — FX-ON drives realized P&L: hedged naira at forward, unhedged floats at parallel.
const fxOn = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true } });
check('HX3 FX-ON impact = fxRealizedDelta - hedge cost', approx(fxOn.hedges.fxHedgeNetImpact, fxOn.fxHedge.fxRealizedDeltaUsd - fxOn.fxHedge.extraFinancingCost, 0.02));
check('HX3 hedged portion locks at FORWARD rate', approx(fxOn.fxHedge.hedgedUsd, fxOn.fxHedge.hedgedNgn / fxOn.fxHedge.forwardRate + fxOn.fxHedge.unhedgedNgn / fxOn.fxHedge.parallelPayment, 0.5));
check('HX3 floating USD = net naira / parallel', approx(fxOn.fxHedge.floatingUsd, fxOn.fxHedge.exposureNgn / fxOn.fxHedge.parallelPayment, 0.5));
const fxHalf = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, hedgeRatio: 0.5 } });
check('HX3 hedgeRatio 0.5: unhedged half floats at parallel', approx(fxHalf.fxHedge.unhedgedNgn, 0.5 * fxHalf.fxHedge.exposureNgn, 1));

// HX4 — basis residual surfaced; non-zero when benchmark != parallel; ~0 when equal.
check('HX4 basis gap = forward - parallel', approx(fxOn.fxHedge.basis.gapNgnPerUsd, fxOn.fxHedge.forwardRate - fxOn.fxHedge.parallelPricing, 0.01));
check('HX4 basis residual non-zero (benchmark != parallel)', Math.abs(fxOn.fxHedge.basis.residualBasisUsd) > 1);
check('HX4 basis note flags incomplete parallel cover', /does NOT fully cover parallel/.test(fxOn.fxHedge.basis.note));
const par = computeTrade(bothChannels).fx.rates.parallelPricing;
const fxNoBasis = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, forwardRate: par } });
check('HX4 basis residual ~0 when benchmark == parallel', Math.abs(fxNoBasis.fxHedge.basis.residualBasisUsd) < 0.5);

// HX5 — route A (bank_book) vs B (third_party) cost difference; bank-provided margin only on B.
const fxA = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, route: 'bank_book' } });
const fxB = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, route: 'third_party' } });
check('HX5 FX route A vs B extra cost differs', Math.abs(fxA.fxHedge.extraFinancingCost - fxB.fxHedge.extraFinancingCost) > 0.5);
check('HX5 FX third_party margin is bank-provided (A has none)', fxB.fxHedge.bankProvidedMargin > 0 && fxA.fxHedge.bankProvidedMargin === 0);

// HX6 — apples-to-apples: over-hedge excess flagged, hedged capped at exposure.
const fxOver = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, hedgeRatio: 1.5 } });
check('HX6 FX over-hedge flagged, hedged capped at exposure', fxOver.fxHedge.overHedgeNgn > 0 && approx(fxOver.fxHedge.hedgedNgn, fxOver.fxHedge.exposureNgn, 1));

// HX7 — comparison shows opposite scenario; recursion guard works.
check('HX7 comparison shows opposite ICE state', bOff.hedgeComparison.ice.state === 'OFF' && typeof bOff.hedgeComparison.ice.hedgedTisNet === 'number');
check('HX7 comparison shows opposite FX state', bOff.hedgeComparison.fx.state === 'OFF' && typeof bOff.hedgeComparison.fx.hedgedTisNet === 'number');
check('HX7 recursion guard: skipHedgeCompare -> no comparison', computeTrade(bothChannels, { skipHedgeCompare: true }).hedgeComparison === null);

// HX8 — USD trade: FX hedge n/a (no naira exposure) -> no-op even when toggled ON.
const exFxOn = computeTrade({ ...exshipTis, fxHedge: { ...exshipTis.fxHedge, fxHedged: true } });
check('HX8 USD trade: FX hedge no-op (no exposure)', exFxOn.fxHedge.hasExposure === false && exFxOn.hedges.fxHedgeNetImpact === 0);
check('HX8 USD trade: FX-ON TIS net == OFF', approx(exFxOn.profit.tisNetProfit, computeTrade(exshipTis).profit.tisNetProfit, 0.01));

// HX9 — reconciliation still holds with both hedges ON.
const bothOn = computeTrade({ ...bothChannels, hedge: { ...bothChannels.hedge, iceHedged: true }, fxHedge: { ...bothChannels.fxHedge, fxHedged: true } });
check('HX9 reconciliation holds with ICE+FX both ON', bothOn.profit.reconciliation.ok === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
