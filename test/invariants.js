'use strict';

// Verification harness — asserts the model's core invariants. No framework; run: node test/invariants.js
// These are the same reconciliations a human reviewer should eyeball, encoded as hard checks.

const { computeEquityPartner } = require('../engine/flows/equity-partner');

// PRIMARY trade for all structural assertions: a SANITIZED, git-tracked fixture (no real data).
// Same STRUCTURE as the real reference-trade (equity-partner / USD / fixed price / 25% / partner split).
const trade = require('../trades/sample-equity-partner.json');

// The real reference-trade is intentionally gitignored (real margins/prices/names). Load it ONLY if
// present — used solely for LOCAL-ONLY exact-value guards that skip cleanly on a clean clone.
function tryLoad(rel) {
  try { return require(rel); } catch (e) { return null; }
}
const realTrade = tryLoad('../trades/reference-trade-001.json');

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

// Ladder classifies the entered fixed price to the nearest tier by margin-of-sell (structural —
// valid for any trade; the exact "$1,400 -> Stretch" guard is local-only on the real reference-trade).
if (ladder.current) {
  const m = ladder.current.marginPctOfSell;
  let nearestTier = ladder.tiers[0];
  for (const t of ladder.tiers) if (Math.abs(t.marginOfSell - m) < Math.abs(nearestTier.marginOfSell - m)) nearestTier = t;
  check('ladder classifies entered price to nearest tier by margin', ladder.current.nearestTier === nearestTier.name);
}

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

// FX1 — STRUCTURAL REGRESSION (clean-clone runnable): computeTrade reproduces computeEquityPartner
// exactly on the sanitized equity-partner fixture — proving the generalization is faithful without
// any real reference-trade figures in the repo.
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

// FX3 — RULE 1 (2026-06-23): NAFEM drives naira P&L; PARALLEL is pricing-reference only. INVERTED from
// the prior "parallel drives P&L" behavior — the bank funds USD and converts the repaid naira at NAFEM,
// so the NAFEM rate is the live FX lever and parallel no longer moves any P&L number.
const dBase = computeTrade(depotOnly);
const nafemBumped = computeTrade({ ...depotOnly, fx: { ...depotOnly.fx, nafem: { ...depotOnly.fx.nafem, value: depotOnly.fx.nafem.value * 1.5 } } });
check('FX3 NAFEM drives P&L (bump NAFEM 50% -> TIS net changes)', Math.abs(nafemBumped.profit.tisNetProfit - dBase.profit.tisNetProfit) > 1);
const parBumped = computeTrade({ ...depotOnly, fx: { ...depotOnly.fx, parallel: { ...depotOnly.fx.parallel, value: depotOnly.fx.parallel.value * 1.1 } } });
check('FX3 PARALLEL is reference only (bump parallel 10% -> TIS net unchanged)', approx(parBumped.profit.tisNetProfit, dBase.profit.tisNetProfit, 0.01));

// FX4 — depot landed cost > ex-ship landed cost (storage included only for depot).
check('FX4 depot landed > ex-ship landed', dBase.price.depotLandedPerMT > dBase.price.exShipLandedPerMT);
check('FX4 ex-ship-only trade: depot landed == ex-ship landed', approx(exTis.price.depotLandedPerMT, exTis.price.exShipLandedPerMT, 0.0001));

// FX5 — FX sensitivity bites ONLY naira legs. RULE 1 (2026-06-23): the live FX lever is now NAFEM, so
// the FX sensitivity uses fxMode 'nafem' (parallel is reference-only and shows ~0 — see NEW split test).
const usdFx = runSensitivities(exshipTis, (t) => computeTrade(t), { fxMode: 'nafem' }).scenarios.filter((s) => /FX/.test(s.lever));
check('FX5 USD trade: FX sensitivity delta = 0', usdFx.every((s) => Math.abs(s.deltaVsBase) < 0.01));
const depotFx = runSensitivities(depotOnly, (t) => computeTrade(t), { fxMode: 'nafem' }).scenarios.filter((s) => /FX/.test(s.lever));
check('FX5 depot trade: FX sensitivity delta != 0', depotFx.some((s) => Math.abs(s.deltaVsBase) > 1));

// FX6 — naira DEPOT COSTS are FX-exposed. RULE 1 (2026-06-23): they convert at NAFEM, so a weaker
// (higher) NAFEM rate lowers their USD cost; the parallel payment bump no longer moves them.
const stUsd = (res) => res.cost.lines.filter((l) => l.category === 'storage' && l.currency === 'NGN').reduce((s, l) => s + l.amountUsd, 0);
const stBase = stUsd(dBase);
const stBumped = stUsd(computeTrade({ ...depotOnly, fx: { ...depotOnly.fx, nafem: { ...depotOnly.fx.nafem, value: depotOnly.fx.nafem.value * 1.1 } } }));
check('FX6 naira depot costs FX-exposed (weaker NAFEM -> lower USD cost)', stBase > 0 && stBumped < stBase);

// FX7 — depot reconciliations tie; depot-only TIS-funded => standalone = adjusted = TIS net.
check('FX7 depot reconciliation ties', dBase.profit.reconciliation.ok === true);
check('FX7 TIS self-funded: standalone = adjusted = TIS net',
  approx(dBase.profit.standaloneProfit, dBase.profit.tisNetProfit, 0.01) && approx(dBase.profit.adjustedProfit, dBase.profit.tisNetProfit, 0.01));
check('FX7 TIS self-funded: partner tonnes = 0', dBase.quantities.economic.partnerTonnes === 0);
// RULE (2026-06-23): annualised return is measured against the BANK LC TIS MOBILISED (financing.lc) for
// BOTH equity providers — TIS's lever in the deal is the bank financing it brings, not cargo value or the
// equity slot. (Re-pointed from the old 'TIS equity (self-funded)' / 'cargo value (INDICATIVE)' bases.)
check('FX7 TIS self-funded: annualised-return base = bank LC mobilised', dBase.annualReturnBaseLabel === 'bank LC mobilised');
check('FX7 TIS self-funded: annualReturnBase === financing.lc', dBase.annualReturnBase === dBase.financing.lc);
check('FX7 TIS self-funded: annualised return = tisNet / financing.lc × (365/lockup)',
  approx(dBase.tisAnnualisedReturn,
    (dBase.profit.tisNetProfit / dBase.financing.lc) * (365 / dBase.financing.capitalLockupDays), 1e-3));

// FX8 — both-channels pooling + configurable equity ratio (advanceRate 0.80) re-flows.
const both = computeTrade(bothChannels);
check('FX8 both channels pool into one P&L (rev - cost = standalone)',
  approx(both.profit.standaloneProfit, both.revenue.combinedUSD - both.cost.allInCost, 0.02));
check('FX8 equity ratio re-flow: LC = 80% of cargo', approx(both.financing.lc, 0.8 * both.cargoValue, 1));
check('FX8 equity ratio re-flow: partner funding = 20% of cargo', approx(both.financing.partnerFunding, 0.2 * both.cargoValue, 1));
check('FX8 day-count Actual/360 used', both.financing.dayCountBasis === 360);
// RULE (2026-06-23): the annualised-return base is financing.lc for the PARTNER case too — the SAME base
// as the TIS self-funded case (FX7), so the metric is consistent across equity providers. Confirms the
// denominator is the bank LC mobilised, not cargo value (old INDICATIVE base) and not the equity slot.
check('FX8 partner case: annualised-return base = bank LC mobilised', both.annualReturnBaseLabel === 'bank LC mobilised');
check('FX8 partner case: annualReturnBase === financing.lc (consistent with self-funded)', both.annualReturnBase === both.financing.lc);
check('FX8 partner case: annualised return = tisNet / financing.lc × (365/lockup)',
  approx(both.tisAnnualisedReturn,
    (both.profit.tisNetProfit / both.financing.lc) * (365 / both.financing.capitalLockupDays), 1e-3));

// FX9 — RULE 2 (2026-06-23): margin-foregone benchmark = MAX realized price across the channels present
// (TIS forgoes its BEST channel). For both-channels the depot ₦1850/L @ NAFEM (~$1459.03) beats the USD
// ex-ship price ($1300), so the benchmark is now depot @ NAFEM — NOT the ex-ship price.
check('FX9 margin-foregone benchmark = depot @ NAFEM (MAX channel, both channels)',
  approx(both.profit.benchmarkPriceUSD, both.price.depotPriceUSDperMT, 0.01) && both.profit.benchmarkBasis === 'depot price (NAFEM)');
// RULE 2 (2026-06-23): a depot-only PARTNER trade values the in-kind product at the depot price @ NAFEM
// (its only — and therefore best — sell channel), NOT the landed-cost fallback. Supersedes the 2026-06-20
// "USD-equivalent landed cost" fallback ($1037.0449); new expected: depotPriceUSDperMT ($1419.60).
const depotPartner = computeTrade({ ...depotOnly, partner: { ...depotOnly.partner, equityProvider: 'partner', profitSharePct: 0.3, productAllocationPct: 1.0 } });
check('FX9 depot-only partner: benchmark = depot price @ NAFEM (MAX channel)',
  approx(depotPartner.profit.benchmarkPriceUSD, depotPartner.price.depotPriceUSDperMT, 0.01) && depotPartner.profit.benchmarkBasis === 'depot price (NAFEM)');

// FX-TRUEUP — partner rounding cash true-up is ACTUALLY PAID (added to partner cash receipts), so the
// partner ends whole. Paper tonnes round DOWN (TIS favour); the rounded-off shortfall is paid as cash.
// (Regression for the bug where trade.js computed cashTrueUp but omitted it from cashReceived.)
const tuPd = both.partnerDelivers;
const tuPaperValue = both.quantities.paper.partnerPaperValue; // paper tonnes x landed (< principal at par)
const tuTrueUp = both.quantities.paper.cashTrueUp;            // principalAsProduct - partnerPaperValue
check('FX-TRUEUP there IS a rounding shortfall to settle (true-up > 0)', tuTrueUp > 0);
check('FX-TRUEUP cashReceived.settlementTrueUp == rounding shortfall',
  approx(tuPd.cashReceived.settlementTrueUp, tuTrueUp, 0.01));
// Partner total = paper product DELIVERED + true-up + principal cash + profit share = FULL entitlement.
const tuEntitlement = both.financing.partnerFunding + tuPd.cashReceived.profitShare; // principal at par + profit
const tuReceived = tuPaperValue + tuPd.cashReceived.settlementTrueUp
  + tuPd.cashReceived.principalCashPortion + tuPd.cashReceived.profitShare;
check('FX-TRUEUP partner receives full economic entitlement (paper product + true-up + profit = par + profit)',
  approx(tuReceived, tuEntitlement, 0.02));
// principalTie now verifies the REAL settlement identity (paper product + true-up + cash = principal owed),
// not the tautological principalAsProduct + cash = principal.
check('FX-TRUEUP principalTie verifies real identity (paper product + true-up + cash = principal)',
  tuPd.principalTie.ok
  && approx(tuPd.principalTie.returnedProductValue + tuPd.principalTie.returnedCash, both.financing.partnerFunding, 0.02));

// FX11 — regression guard for the override-absorption bug: resolveRate() (fx.js) prefers
// fx.nafem.override over .value whenever an override is set (non-null). Before the fix, the
// sensitivity bump in sensitivities.js mutated .value ONLY, so any trade with a NAFEM override
// configured silently absorbed the bump and reported $0 FX risk regardless of real exposure.
// Uses depotOnly (genuine naira depot exposure, per FX5/FX6 above) with an override layered on
// top — exactly the configuration the old bug went blind on.
const depotOverride = { ...depotOnly, fx: { ...depotOnly.fx, nafem: { ...depotOnly.fx.nafem, override: 1550 } } };
const ovSensFn = (t) => computeTrade(t);
const ovSens = runSensitivities(depotOverride, ovSensFn, { fxMode: 'nafem' });
const ovFxUp = ovSens.scenarios.find((s) => /FX NAFEM \+/.test(s.lever));
const ovFxDown = ovSens.scenarios.find((s) => /FX NAFEM -/.test(s.lever));
check('FX11 override trade: FX NAFEM sensitivity is non-zero (not silently absorbed by the override)',
  Math.abs(ovFxUp.deltaVsBase) > 1 && Math.abs(ovFxDown.deltaVsBase) > 1);

// Independent (non-tautological) re-derivation: bump the OVERRIDE field directly ourselves — written
// here independently of sensitivities.js's own bump helper, mirroring only resolveRate()'s documented
// precedence (fx.js) — and re-run the verified engine. The scenario's reported net must equal this
// direct, hand-constructed rerun (no duplicated math, no calling runSensitivities twice).
const ovUpTrade = { ...depotOverride, fx: { ...depotOverride.fx, nafem: { ...depotOverride.fx.nafem, override: depotOverride.fx.nafem.override * 1.1 } } };
const ovUpDirect = computeTrade(ovUpTrade);
check('FX11 override trade: scenario net == direct engine run with override bumped +10% (hand-derived)',
  approx(ovFxUp.tisNet, ovUpDirect.profit.tisNetProfit, 0.5));

// Counterfactual: confirms the OLD bug pattern (bumping .value alone while override stays fixed)
// would indeed still show ~$0 net movement — proves it was specifically the override field the
// sensitivity check was blind to, not some other cause.
const staleValueTrade = { ...depotOverride, fx: { ...depotOverride.fx, nafem: { ...depotOverride.fx.nafem, value: depotOverride.fx.nafem.value * 1.1 } } };
const staleValueNet = computeTrade(staleValueTrade).profit.tisNetProfit;
const depotOverrideBaseNet = computeTrade(depotOverride).profit.tisNetProfit;
check('FX11 counterfactual: bumping .value alone (old buggy behavior) leaves net ~unchanged (override still wins)',
  approx(staleValueNet, depotOverrideBaseNet, 0.01));

// FX10 — validation throws on bad funding stack / channel split.
expectThrow('FX10 funding stack not summing to 1 throws', () => computeTrade({ ...bothChannels, partner: { ...bothChannels.partner, equityPct: 0.3 } }), 'sum to 1.0');
expectThrow('FX10 channel split not summing to 1 throws', () => computeTrade({ ...depotOnly, channels: { exShipPct: 0.5, depotPct: 0.4 } }), 'channels');
expectThrow('FX10 invalid currencyMode throws', () => computeTrade({ ...exshipTis, sell: { ...exshipTis.sell, currencyMode: 'EUR' } }), 'currencyMode');

// ============================================================================================
// STORAGE UNIT TOGGLE (SU) — Throughput & Storage rental are quoted ₦/L (naira per litre) or $/MT
// (USD per tonne), never ₦/MT. ₦/L converts via density (litresPerMT) at NAFEM; $/MT is direct USD.
// No unit field => legacy ₦/MT (throughput) / ₦ total (rental), byte-for-byte (see SU6).
// ============================================================================================
const suNafem  = depotOnly.fx.nafem.value;                 // 1500
const suLitres = depotOnly.pricing.conversion.litresPerMT; // 1183
const suQty    = depotOnly.cargo.deliveredQtyMT;           // 10000 (depot-only: storageQty = delivered)
const suThru = (rate, unit) =>
  computeTrade({ ...depotOnly, costLines: { ...depotOnly.costLines, throughputUnit: unit, throughputRate: rate } }).cost.byId[25];
const suRent = (rate, unit) =>
  computeTrade({ ...depotOnly, costLines: { ...depotOnly.costLines, storageRentalUnit: unit, storageRentalRate: rate } }).cost.byId[26];

// SU1 — throughput ₦/L: amountUsd = rate × MT × litresPerMT / NAFEM, currency NGN (FX-exposed).
const su1 = suThru(3.5, 'NGN_PER_L');
check('SU1 throughput ₦/L = rate × MT × litresPerMT / NAFEM',
  approx(su1.amountUsd, 3.5 * suQty * suLitres / suNafem, 0.01) && su1.currency === 'NGN' && su1.ngnAmount > 0);

// SU2 — throughput $/MT: amountUsd = rate × MT, no conversion, currency USD, no naira amount.
const su2 = suThru(4, 'USD_PER_MT');
check('SU2 throughput $/MT = rate × MT (no FX conversion)',
  approx(su2.amountUsd, 4 * suQty, 0.01) && su2.currency === 'USD' && su2.ngnAmount === null);

// SU3 — storage rental ₦/L: same density+NAFEM conversion as throughput.
const su3 = suRent(5, 'NGN_PER_L');
check('SU3 storage rental ₦/L = rate × MT × litresPerMT / NAFEM',
  approx(su3.amountUsd, 5 * suQty * suLitres / suNafem, 0.01) && su3.currency === 'NGN' && su3.ngnAmount > 0);

// SU4 — storage rental $/MT: direct USD, no conversion.
const su4 = suRent(3, 'USD_PER_MT');
check('SU4 storage rental $/MT = rate × MT (no FX conversion)',
  approx(su4.amountUsd, 3 * suQty, 0.01) && su4.currency === 'USD' && su4.ngnAmount === null);

// SU5 — toggling the unit at the SAME numeric rate changes the cost (the whole point of the fix:
// a ₦/L quote entered as $/MT, or vice-versa, must NOT silently produce the same number).
check('SU5 toggling unit changes the cost (₦/L != $/MT at same rate)',
  Math.abs(suThru(4, 'NGN_PER_L').amountUsd - suThru(4, 'USD_PER_MT').amountUsd) > 1);

// SU6 — BACKWARD-COMPAT: no unit field => legacy ₦/MT (throughput) / ₦ total (rental), byte-for-byte.
const suLegacy = computeTrade(depotOnly);
check('SU6 backward-compat throughput (no unit) = legacy ₦/MT: rate × MT / NAFEM',
  approx(suLegacy.cost.byId[25].amountUsd, (depotOnly.costLines.throughputNgnPerMT * suQty) / suNafem, 0.01));
check('SU6 backward-compat storage rental (no unit) = legacy ₦ total / NAFEM',
  approx(suLegacy.cost.byId[26].amountUsd, depotOnly.costLines.storageRentalNgn / suNafem, 0.01));

// SU7 — a $/MT storage line is NOT FX-exposed (currency USD); a ₦/L line IS (currency NGN).
check('SU7 $/MT storage line not FX-exposed, ₦/L is',
  suThru(4, 'USD_PER_MT').currency === 'USD' && suThru(4, 'NGN_PER_L').currency === 'NGN');

// ============================================================================================
// STORAGE-COLLECT BACKWARD-COMPAT (SC) — the dashboard's collectTrade path. The UI defaulted a LOADED
// old-format trade's storage unit to NGN_PER_L, reinterpreting a per-MT throughput rate (₦4,000/MT) and a
// ₦ LUMP rental (₦50,000,000) as per-litre — running them through the density×NAFEM path and inflating
// storage ~1,183× (≈$394B). resolveStorageCostLines (TISEngine, shared with the browser) emits the
// ORIGINAL old keys for legacy lines so the engine's backward-compat branch (SU6) reproduces the correct
// cost; new / trader-edited lines still emit the ₦/L|$/MT unit schema.
// ============================================================================================
const { resolveStorageCostLines } = require('../engine/core/storage-collect');

// Simulate collectTrade for a LOADED OLD-FORMAT depot trade: the form holds the legacy ₦/MT throughput
// rate and the ₦ lump rental (the load path put them there), both flagged legacy.
const collectStorage = (flags) => resolveStorageCostLines({
  depotOn: true,
  throughput:    { unit: 'NGN_PER_L', rate: depotOnly.costLines.throughputNgnPerMT, legacy: flags.throughput },
  storageRental: { unit: 'NGN_PER_L', rate: depotOnly.costLines.storageRentalNgn,   legacy: flags.storageRental },
});
// collectTrade rebuilds costLines from scratch (storage fields come ONLY from resolveStorageCostLines),
// so model the collected trade by stripping the old keys and spreading the resolver's output back in.
const scBaseCL = (() => { const c = { ...depotOnly.costLines }; delete c.throughputNgnPerMT; delete c.storageRentalNgn; return c; })();
const scCollected = (storageFields) => computeTrade({ ...depotOnly, costLines: { ...scBaseCL, ...storageFields } });

// SC1 — legacy resolve emits the ORIGINAL old keys and OMITS the unit fields (drives engine backward-compat).
const scLegacy = collectStorage({ throughput: true, storageRental: true });
check('SC1 legacy collect emits old keys (throughputNgnPerMT / storageRentalNgn), no unit fields',
  scLegacy.throughputNgnPerMT === depotOnly.costLines.throughputNgnPerMT &&
  scLegacy.storageRentalNgn === depotOnly.costLines.storageRentalNgn &&
  !('throughputUnit' in scLegacy) && !('storageRentalUnit' in scLegacy));

// SC2 — old-format depot trade through the UI-collect path computes storage CORRECTLY (matches node run.js
// / SU6): throughput ₦40M ⇒ $26,666.67, rental ₦50M ⇒ $33,333.33; depot landed sane, NOT billions.
const scRes = scCollected(scLegacy);
check('SC2 collect throughput = legacy ₦/MT (not ₦/L): rate × MT / NAFEM ≈ $26,666.67',
  approx(scRes.cost.byId[25].amountUsd, (depotOnly.costLines.throughputNgnPerMT * suQty) / suNafem, 0.01));
check('SC2 collect storage rental = legacy ₦ lump (not ₦/L): ₦50M / NAFEM ≈ $33,333.33',
  approx(scRes.cost.byId[26].amountUsd, depotOnly.costLines.storageRentalNgn / suNafem, 0.01));
check('SC2 collect storage total ≈ $75,750 and depot landed sane (< $2,000/MT, not billions)',
  approx(scRes.cost.storageTotal, 75750, 1) && scRes.cost.depotLandedPerMT < 2000);

// SC3 — REGRESSION: the OLD bug (legacy defaulted to ₦/L) reinterprets the per-MT rate and the ₦ lump as
// per-litre, inflating storage past a BILLION dollars. The fix must NOT reproduce that.
const scBug = scCollected(collectStorage({ throughput: false, storageRental: false }));
check('SC3 buggy ₦/L reinterpretation would inflate storage > $1B; the fix keeps it < $1M',
  scBug.cost.storageTotal > 1e9 && scRes.cost.storageTotal < 1e6);

// SC4 — NEW-format trade (trader picked ₦/L, a real per-litre rate) is unaffected: emits the unit schema
// and computes the ₦/L density×NAFEM path (matches SU1/SU3).
const scNew = resolveStorageCostLines({
  depotOn: true,
  throughput:    { unit: 'NGN_PER_L', rate: 3.5, legacy: false },
  storageRental: { unit: 'NGN_PER_L', rate: 5,   legacy: false },
});
const scNewRes = scCollected(scNew);
check('SC4 new-format ₦/L unaffected: unit schema emitted, throughput = rate × MT × litres / NAFEM',
  scNew.throughputUnit === 'NGN_PER_L' && scNew.throughputRate === 3.5 &&
  approx(scNewRes.cost.byId[25].amountUsd, 3.5 * suQty * suLitres / suNafem, 0.01));

// SC5 — no depot leg => storage rates zeroed (parity with the prior collectTrade `depotOn ? … : 0` gate).
const scOff = resolveStorageCostLines({
  depotOn: false,
  throughput:    { unit: 'NGN_PER_L', rate: 4000,     legacy: true },
  storageRental: { unit: 'NGN_PER_L', rate: 50000000, legacy: false },
});
check('SC5 depotOn=false zeroes storage rates (legacy lump and new rate alike)',
  scOff.throughputNgnPerMT === 0 && scOff.storageRentalRate === 0);

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

// HX3 — FX-ON drives realized P&L. RULE 1 (2026-06-23): unhedged naira floats at NAFEM (was parallel);
// only the hedged portion locks at the benchmark forward.
const fxOn = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true } });
const nafemHX = fxOn.fx.rates.nafemReference;
check('HX3 FX-ON impact = fxRealizedDelta - hedge cost', approx(fxOn.hedges.fxHedgeNetImpact, fxOn.fxHedge.fxRealizedDeltaUsd - fxOn.fxHedge.extraFinancingCost, 0.02));
check('HX3 hedged portion locks at FORWARD, unhedged floats at NAFEM', approx(fxOn.fxHedge.hedgedUsd, fxOn.fxHedge.hedgedNgn / fxOn.fxHedge.forwardRate + fxOn.fxHedge.unhedgedNgn / nafemHX, 0.5));
check('HX3 floating USD = net naira / NAFEM', approx(fxOn.fxHedge.floatingUsd, fxOn.fxHedge.exposureNgn / nafemHX, 0.5));
const fxHalf = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, hedgeRatio: 0.5 } });
check('HX3 hedgeRatio 0.5: unhedged half floats at NAFEM', approx(fxHalf.fxHedge.unhedgedNgn, 0.5 * fxHalf.fxHedge.exposureNgn, 1));

// HX4 — RULE 1 (2026-06-23): the FX hedge protects against NAFEM (the settlement rate), so the surfaced
// basis residual is forward<->NAFEM, NOT forward<->parallel. Parallel is reference/display only and drives
// nothing in the hedge. Residual is non-zero when the benchmark forward != NAFEM, and ~0 when they match.
check('HX4 basis gap = forward - NAFEM', approx(fxOn.fxHedge.basis.gapNgnPerUsd, fxOn.fxHedge.forwardRate - nafemHX, 0.01));
check('HX4 basis residual = hedgedNgn × (1/forward − 1/NAFEM)',
  approx(fxOn.fxHedge.basis.residualBasisUsd, fxOn.fxHedge.hedgedNgn * (1 / fxOn.fxHedge.forwardRate - 1 / nafemHX), 0.5));
check('HX4 basis residual non-zero (benchmark != NAFEM)', Math.abs(fxOn.fxHedge.basis.residualBasisUsd) > 1);
check('HX4 basis note flags incomplete NAFEM cover', /does NOT fully cover NAFEM/.test(fxOn.fxHedge.basis.note));
const nafemSettle = computeTrade(bothChannels).fx.rates.nafemReference;
const fxNoBasis = computeTrade({ ...bothChannels, fxHedge: { ...bothChannels.fxHedge, fxHedged: true, forwardRate: nafemSettle } });
check('HX4 basis residual ~0 when benchmark == NAFEM', Math.abs(fxNoBasis.fxHedge.basis.residualBasisUsd) < 0.5);

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

// ============================================================================================
// HP1 — computeEquityPartner ICE-hedge wiring (bug fix): buildHedge() was already called and its
// result attached to the output, but iceCostDelta/extraFinancingCost were NEVER subtracted into the
// profit chain — toggling trade.hedge.iceHedged had ZERO P&L effect (dead code). Assert against an
// INDEPENDENTLY computed expected value (hedge cost x partner split), not a tautology re-derived from
// the flow's own output — this is what would have caught the original bug (under the bug, hpOn and
// hpOff were exactly equal regardless of the toggle).
// ============================================================================================
const hpOff = computeEquityPartner({ ...trade, hedge: { ...trade.hedge, iceHedged: false } });
const hpOn = computeEquityPartner({ ...trade, hedge: { ...trade.hedge, iceHedged: true } });
// Independently-known hedge economics (buildHedge itself was always correct — only its wiring into
// the profit chain was missing) and the trade's own profit-share input, NOT hpOn's own tisNetProfit.
const hpAllInCost = hpOn.hedge.iceCostDelta + hpOn.hedge.extraFinancingCost;
const hpExpectedTisNetOn = hpOff.profit.tisNetProfit - (1 - hpOff.profit.profitSharePct) * hpAllInCost;
check('HP1 ICE hedge OFF is a no-op (byte-identical to base run)', approx(hpOff.profit.tisNetProfit, r.profit.tisNetProfit));
check('HP1 ICE hedge ON reduces TIS net by EXACTLY (1-share) x all-in hedge cost (independently computed)',
  approx(hpOn.profit.tisNetProfit, hpExpectedTisNetOn, 0.5));
check('HP1 ICE hedge ON strictly reduces TIS net vs OFF (real cost — proves the toggle is wired, not dead code)',
  hpOn.profit.tisNetProfit < hpOff.profit.tisNetProfit);
check('HP1 reconciliation still holds with hedge ON', hpOn.profit.reconciliation.ok === true);
check('HP1 hedge result still attached to output (unchanged shape)', hpOn.hedge && typeof hpOn.hedge.iceCostDelta === 'number');

// ============================================================================================
// PS1/PS2 — cost-buildup ctx.sellValue wiring (bug fix): baseFor.pct_of_sell read ctx.sellValue, but
// NEITHER flow passed it, so any costLineOverride flipping a line to pct_of_sell silently evaluated
// to $0. sellValue is now sourced from the SAME value each flow already uses for revenue — no second
// source of truth. Expected values below are computed directly from raw trade inputs (rate x sell
// value), NOT read back from the engine's own output — a tautological "was it wired" check would
// pass even if the wrong number were wired in.
// ============================================================================================
// PS1 (equity-partner.js): sell price is a FIXED input (sell.exShipPricePerMT.value), so
// sellValue = price x deliveredQty is knowable before cost build-up runs, no circular dependency.
const ps1RateOverride = 0.01;
const ps1SellValueExpected = trade.sell.exShipPricePerMT.value * trade.cargo.deliveredQtyMT;
const ps1 = computeEquityPartner({ ...trade, costLineOverrides: { 7: { type: 'pct_of_sell', rate: ps1RateOverride } } });
check('PS1 equity-partner pct_of_sell line = rate x (fixed sell price x deliveredQty), not $0',
  approx(ps1.cost.byId[7].amountUsd, ps1RateOverride * ps1SellValueExpected, 0.01));
check('PS1 equity-partner pct_of_sell line is non-zero (was exactly 0 under the original bug)',
  ps1.cost.byId[7].amountUsd > 0);

// PS2 (trade.js / computeTrade): combinedRevenue (ex-ship + depot USD revenue) is the correct
// absolute-dollar base for "% of sell" — consistent with pct_of_freight/pct_of_cargo_value/pct_of_LC
// all being absolute-dollar bases, never per-unit rates. Re-derived here from raw trade inputs
// (legacy adapter's USD-price round-trip + depot NGN/L->USD at NAFEM), NOT from the engine's own
// revenue.combinedUSD.
const ps2RateOverride = 0.01;
const ps2ExShipTonnes = bothChannels.cargo.deliveredQtyMT * bothChannels.channels.exShipPct;
const ps2DepotTonnes = bothChannels.cargo.deliveredQtyMT * bothChannels.channels.depotPct;
// USD price round-trips exactly regardless of currencyMode split (revenue.js legacyLegs backward map).
const ps2ExShipRevenue = bothChannels.sell.exShipPricePerMT.value * ps2ExShipTonnes;
const ps2DepotRevenue = (bothChannels.sell.depotPriceNgnPerL.value * bothChannels.pricing.conversion.litresPerMT * ps2DepotTonnes) / bothChannels.fx.nafem.value;
const ps2SellValueExpected = ps2ExShipRevenue + ps2DepotRevenue;
const ps2 = computeTrade({ ...bothChannels, costLineOverrides: { 7: { type: 'pct_of_sell', rate: ps2RateOverride } } });
check('PS2 computeTrade pct_of_sell line = rate x combinedRevenue (independently re-derived), not $0',
  approx(ps2.cost.byId[7].amountUsd, ps2RateOverride * ps2SellValueExpected, 1));
check('PS2 computeTrade pct_of_sell line is non-zero (was exactly 0 under the original bug)',
  ps2.cost.byId[7].amountUsd > 0);
check('PS2 independently re-derived sellValue matches engine combinedUSD (sanity cross-check)',
  approx(ps2SellValueExpected, ps2.revenue.combinedUSD, 1));

// ============================================================================================
// PER-LEG REVENUE MODEL (Stage 1) — native trade.revenueLegs: ex-ship-USD / ex-ship-NGN / depot-NGN mix,
// the shared NGN→USD conversion, N-leg NGN aggregation into the FX hedge, the partner-benchmark fallback,
// and per-leg validation. Legacy trades are covered byte-for-byte by FX1–FX10 above (same engine, adapter).
// ============================================================================================
const LITRES = bothChannels.pricing.conversion.litresPerMT; // 1183

// PL1 — a NATIVE ex-ship leg priced ₦/L uses the SAME conversion as a depot ₦/L leg (identical price/tonnes).
const exNgn1 = computeTrade({ ...depotOnly, revenueLegs: [{ channel: 'ex-ship', pricingUnit: 'NGN_PER_L', tonnes: 10000, price: 1800 }] });
const depNgn1 = computeTrade({ ...depotOnly, revenueLegs: [{ channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: 10000, price: 1800 }] });
const exLeg = exNgn1.revenue.legs[0];
const depLeg = depNgn1.revenue.legs[0];
// PL1 — RULE 1 (2026-06-23): NGN legs convert at NAFEM (was parallelPayment); the conversion is still
// shared identically between native ex-ship-NGN and depot-NGN legs.
const nafem1 = exNgn1.fx.rates.nafemReference;
check('PL1 ex-ship-NGN leg classified as ex-ship channel', exLeg.channel === 'ex-ship' && exNgn1.channels.exShipTonnes === 10000);
check('PL1 ex-ship-NGN priceUsdPerMT = (ngnPerL × litres) / nafemRate', approx(exLeg.priceUsdPerMT, (1800 * LITRES) / nafem1, 0.001));
check('PL1 ex-ship-NGN USD = depot-NGN USD (same conversion)', exLeg.usd === depLeg.usd);
check('PL1 ex-ship-NGN priceUsdPerMT = depot-NGN priceUsdPerMT', exLeg.priceUsdPerMT === depLeg.priceUsdPerMT);
check('PL1 ex-ship-NGN naira amount = ngnPerL × litres × tonnes', approx(exLeg.ngn, 1800 * LITRES * 10000, 0.01) && exLeg.ngn === depLeg.ngn);

// PL2 — a 3-leg mix (ex-ship-USD + ex-ship-NGN + depot-NGN) pools into one P&L; channels/currency derive.
const mixLegs = [
  { channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: 5000, price: 1300 },
  { channel: 'ex-ship', pricingUnit: 'NGN_PER_L', tonnes: 3000, price: 1850 },
  { channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: 4000, price: 1850 },
];
const mix = computeTrade({ ...bothChannels, revenueLegs: mixLegs });
const mixLegUsdSum = mix.revenue.legs.reduce((s, l) => s + l.usd, 0);
check('PL2 3-leg mix: combinedUSD = Σ leg USD', approx(mix.revenue.combinedUSD, mixLegUsdSum, 0.02));
check('PL2 3-leg mix: exShipUSD = USD leg + ex-ship-NGN leg', approx(mix.revenue.exShipUSD, mix.revenue.legs[0].usd + mix.revenue.legs[1].usd, 0.02));
check('PL2 3-leg mix: depotUSD = depot leg', approx(mix.revenue.depotUSD, mix.revenue.legs[2].usd, 0.02));
check('PL2 3-leg mix pools into one P&L (standalone = rev − cost)', approx(mix.profit.standaloneProfit, mix.revenue.combinedUSD - mix.cost.allInCost, 0.02) && mix.profit.reconciliation.ok === true);
check('PL2 3-leg mix: channels derive from legs (ex-ship 8000 / depot 4000)', mix.channels.exShipTonnes === 8000 && mix.channels.depotTonnes === 4000);
check('PL2 3-leg mix: currency view = split (usdShare 5000/8000)', mix.fx.currencyMode === 'split' && approx(mix.fx.usdShare, 5000 / 8000, 1e-9));
// PL2 — RULE 2 (2026-06-23): benchmark = MAX channel present. Depot ₦1850/L @ NAFEM (~$1459.03) beats
// the USD ex-ship leg ($1300), so the depot channel wins the MAX (was: USD ex-ship price $1300).
check('PL2 3-leg mix partner benchmark = depot @ NAFEM (MAX channel)',
  approx(mix.profit.benchmarkPriceUSD, (1850 * LITRES) / mix.fx.rates.nafemReference, 0.01) && mix.profit.benchmarkBasis === 'depot price (NAFEM)');

// PL3 — RULE 2 (2026-06-23): an all-naira trade (no USD ex-ship leg) values the in-kind product at the
// MAX of its NGN channels @ NAFEM (here ex-ship-NGN and depot-NGN are both ₦1850/L -> ~$1459.03; depot
// wins the tie). Supersedes the 2026-06-20 USD-equivalent-landed-cost fallback ($1080.4857).
const allNairaLegs = [
  { channel: 'ex-ship', pricingUnit: 'NGN_PER_L', tonnes: 7000, price: 1850 },
  { channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: 5000, price: 1850 },
];
const allNaira = computeTrade({ ...bothChannels, revenueLegs: allNairaLegs });
check('PL3 all-naira partner: benchmark = MAX NGN channel @ NAFEM',
  approx(allNaira.profit.benchmarkPriceUSD, (1850 * LITRES) / allNaira.fx.rates.nafemReference, 0.01));
check('PL3 all-naira partner: benchmark basis names a NAFEM channel', /NAFEM/.test(allNaira.profit.benchmarkBasis));
check('PL3 all-naira partner: no USD ex-ship price reported', allNaira.price.exShipPricePerMT === null);
check('PL3 all-naira reconciliation holds', allNaira.profit.reconciliation.ok === true);

// PL4 — NGN AGGREGATION across >2 legs (two ex-ship-NGN + one depot-NGN) sums into the FX EXPOSURE-
// REPORTING block (fx.nairaRevenue / fx.netNairaExposureUsd), generalizing the old two-bucket sum to N
// arbitrary legs. NOTE (RULE 3, 2026-06-23): this aggregated net naira position is NO LONGER the FX hedge
// base — the hedge base is the bank repayment obligation (see PL4b). The aggregation test stays; only the
// hedge-base assertion is re-pointed.
const aggLegs = [
  { channel: 'ex-ship', pricingUnit: 'NGN_PER_L', tonnes: 3000, price: 1800 },
  { channel: 'ex-ship', pricingUnit: 'NGN_PER_L', tonnes: 4000, price: 1900 },
  { channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: 5000, price: 1850 },
];
const agg = computeTrade({ ...bothChannels, revenueLegs: aggLegs, fxHedge: { ...bothChannels.fxHedge, fxHedged: true } });
const expectedNgnSum = 1800 * LITRES * 3000 + 1900 * LITRES * 4000 + 1850 * LITRES * 5000;
check('PL4 >2 NGN legs: total naira revenue = Σ of all NGN legs', approx(agg.fx.nairaRevenue.ngn, expectedNgnSum, 0.5));
check('PL4 >2 NGN legs: all three legs carry a naira amount', agg.revenue.legs.length === 3 && agg.revenue.legs.every((l) => l.ngn > 0));
check('PL4 net naira exposure (REPORTING) = Σ NGN revenue − naira cost', approx(agg.fx.netNairaExposureUsd, agg.fx.nairaRevenue.usdAtNafemReference - agg.fx.nairaCost.usdAtNafemReference, 0.5));
check('PL4 FX hedge consumes its base (hedged ≈ base at ratio 1)', agg.fxHedge.hasExposure === true && approx(agg.fxHedge.hedgedNgn, agg.fxHedge.exposureNgn, 1));

// PL4b — FX HEDGE BASE = BANK REPAYMENT OBLIGATION, not gross/net naira revenue (RULE 3, 2026-06-23).
// The hedge protects ONLY the naira TIS is FORCED to convert to USD to repay the bank's USD facility
// (LC principal + WC drawn + credit/WC interest), converted at NAFEM. The naira PROFIT above the bank
// obligation is retained in naira (TIS is Nigeria-based) and is excluded from the hedge — hedging it
// would over-hedge by the profit margin. Asserts: (1) base = (LC+WC+interest)×NAFEM; (2) base equals
// bankRepaymentUsd×NAFEM; (3) base is STRICTLY LESS than both gross naira revenue and the net naira
// position (profit excluded); (4) the excluded naira profit is positive on this trade.
const aggNafem = agg.fx.rates.nafemReference;
const aggBankUsd = agg.financing.lc + agg.financing.wc + agg.financing.creditInterest + agg.financing.wcInterest;
const aggNetNairaNgn = agg.fx.nairaRevenue.ngn - agg.fx.nairaCost.ngn;
// Proven in two exact steps (the engine rounds bankRepaymentUsd to cents BEFORE ×NAFEM, so a single
// unrounded (LC+WC+interest)×NAFEM comparison would drift by up to NAFEM×0.005 ≈ a few naira):
//   (i) the surfaced USD obligation = LC + WC + credit/WC interest;  (ii) base = that obligation × NAFEM.
check('PL4b bankRepaymentUsd = LC + WC + credit interest + WC interest', approx(agg.fxHedge.bankRepaymentUsd, aggBankUsd, 0.01));
check('PL4b hedge base = bankRepaymentUsd × NAFEM (= (LC+WC+interest)×NAFEM)', approx(agg.fxHedge.exposureNgn, agg.fxHedge.bankRepaymentUsd * aggNafem, 1));
check('PL4b hedge base is NOT gross naira revenue (strictly less)', agg.fxHedge.exposureNgn < agg.fx.nairaRevenue.ngn - 1);
check('PL4b hedge base is NOT the net naira position (strictly less — profit excluded)', agg.fxHedge.exposureNgn < aggNetNairaNgn - 1);
check('PL4b excluded naira profit (net position − hedge base) is positive', aggNetNairaNgn - agg.fxHedge.exposureNgn > 1);

// PL5 — per-leg validation (#1 tonnage sum, #5 missing/non-positive price, depot-never-USD).
expectThrow('PL5 depot leg priced USD is rejected', () => computeTrade({ ...bothChannels, revenueLegs: [{ channel: 'depot', pricingUnit: 'USD_PER_MT', tonnes: 12000, price: 1300 }] }), 'depot legs must be priced NGN_PER_L');
expectThrow('PL5 leg tonnage must sum to delivered quantity', () => computeTrade({ ...bothChannels, revenueLegs: [{ channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: 5000, price: 1300 }] }), 'sum to delivered quantity');
expectThrow('PL5 missing/non-positive leg price throws (positive, per leg)', () => computeTrade({ ...bothChannels, revenueLegs: [{ channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: 12000, price: 0 }] }), 'price');
expectThrow('PL5 invalid leg channel throws', () => computeTrade({ ...bothChannels, revenueLegs: [{ channel: 'wholesale', pricingUnit: 'USD_PER_MT', tonnes: 12000, price: 1300 }] }), 'channel');

// PL6 — LADDER per-tier P&L must VARY across tiers for a NATIVE per-leg trade. Regression guard:
// native trades price from revenueLegs and ignore sell.exShipPricePerMT, so the ladder must reprice
// the relevant leg per tier. Before the fix every tier returned the same leg-priced net (all equal).
const { buildLadder } = require('../engine/core/pricing-ladder');
const fnCT = (t) => computeTrade(t, { skipHedgeCompare: true });

// (a) Native ex-ship USD trade — $/MT ladder.
const nativeEx = { ...trade, revenueLegs: [{ channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: trade.cargo.deliveredQtyMT, price: 1230 }] };
const ladEx = buildLadder(nativeEx, fnCT, computeTrade(nativeEx, { skipHedgeCompare: true })).exShip;
const exNets = ladEx.tiers.map((t) => t.tisNetProfit);
check('PL6 native ex-ship ladder: per-tier TIS net VARIES (not all equal)', new Set(exNets.map((n) => Math.round(n))).size === exNets.length);
check('PL6 native ex-ship ladder: TIS net strictly increases with tier price', exNets.every((n, i) => i === 0 || n > exNets[i - 1]));
// WYSIWYG: each tier net equals a direct engine run with the ex-ship USD leg repriced to the tier price.
check('PL6 native ex-ship ladder: tier net == direct engine run at repriced leg (no duplicated math)',
  ladEx.tiers.every((t) => {
    const direct = computeTrade({ ...nativeEx, revenueLegs: nativeEx.revenueLegs.map((l) => ({ ...l, price: t.pricePerMT })) }, { skipHedgeCompare: true });
    return approx(t.tisNetProfit, direct.profit.tisNetProfit, 0.5);
  }));
// Native all-USD ladder reproduces the LEGACY ladder exactly (fix changed nothing for the equivalent trade).
const ladLegacyEx = buildExShipLadder(trade, (t) => computeEquityPartner(t), r);
check('PL6 native all-USD ladder nets == legacy ladder nets (byte-for-byte)',
  ladEx.tiers.every((t, i) => approx(t.tisNetProfit, ladLegacyEx.tiers[i].tisNetProfit, 0.5)));

// (b) Native depot trade — ₦/L ladder reprices the depot leg per tier.
const nativeDepot = { ...trade, depot: { enabled: true }, revenueLegs: [
  { channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: 5000, price: 1230 },
  { channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: 5000, price: 1400 },
] };
const ladDep = buildLadder(nativeDepot, fnCT, computeTrade(nativeDepot, { skipHedgeCompare: true })).depot;
const depNets = ladDep.tiers.map((t) => t.tisNetProfit);
check('PL6 native depot ladder applicable + per-tier TIS net present', ladDep.applicable === true && depNets.every((n) => n != null));
check('PL6 native depot ladder: per-tier TIS net VARIES (not all equal)', new Set(depNets.map((n) => Math.round(n))).size === depNets.length);
check('PL6 native depot ladder: tier net == direct engine run at repriced depot leg',
  ladDep.tiers.every((t) => {
    const direct = computeTrade({ ...nativeDepot, revenueLegs: nativeDepot.revenueLegs.map((l) => (l.channel === 'depot' ? { ...l, price: t.priceNgnPerL } : l)) }, { skipHedgeCompare: true });
    return approx(t.tisNetProfit, direct.profit.tisNetProfit, 0.5);
  }));

// LBL — pin the depot ladder's label fields themselves (marginBasis/fxBasis/marginStatus/pnlBasis),
// not just the numeric values they gate. nativeDepot inherits trade.pricing.conversion.fxMarketForDepot
// = 'parallel' (1600) while trade.fx.nafem = 1500 — parallel != NAFEM here, so this is a real reconciling
// case, not a no-op where the two bases coincide. Regression guard: a future change that flips these
// literals (e.g. hardcodes 'nafem' as the margin basis, or drops the INDICATIVE/nafem status literals)
// must fail the suite instead of only being catchable by manual inspection (fcb82aa re-review finding).
check('LBL depot ladder tier.marginBasis == the configured fxMarketForDepot ("parallel", not hardcoded to some other market)',
  ladDep.tiers.every((t) => t.marginBasis === 'parallel'));
check('LBL depot ladder tier.marginStatus == "INDICATIVE" (advisory, not reconciled to P&L)',
  ladDep.tiers.every((t) => t.marginStatus === 'INDICATIVE'));
check('LBL depot ladder tier.pnlBasis == "nafem" (P&L is unconditionally NAFEM-settled per RULE 1, regardless of the parallel tier-pricing basis)',
  ladDep.tiers.every((t) => t.pnlBasis === 'nafem'));
check('LBL depot ladder top-level fxBasis == the configured fxMarketForDepot ("parallel")',
  ladDep.fxBasis === 'parallel');
check('LBL depot ladder tier.reconciliation.note names the parallel-vs-NAFEM gap when the bases differ',
  ladDep.tiers.every((t) => t.reconciliation.tierBasis === 'parallel' && /NAFEM/.test(t.reconciliation.note) && /PARALLEL|parallel/i.test(t.reconciliation.note)));

// PL7 — LADDER per-tier P&L must VARY for a NATIVE ex-ship leg priced in ₦/L (NGN_PER_L). REGRESSION
// GUARD for the runAtPrice fix: before it, runAtPrice only repriced USD_PER_MT ex-ship legs, so an
// ex-ship-₦/L leg stayed at its original price and every tier returned the SAME (inert/identical) net.
// The $/MT ladder now reprices the NGN leg too (inverse conversion: tier$/MT × nafem / litres -> ₦/L).
const PL7_NAFEM = trade.fx.nafem.value; // 1500
const PL7_USDREF = 1230;
const PL7_NGNREF = (PL7_USDREF * PL7_NAFEM) / LITRES;
const nativeExNgn = { ...trade, channels: { exShipPct: 1, depotPct: 0 },
  sell: { ...trade.sell, currencyMode: 'NGN', exShipPricePerMT: { value: PL7_USDREF, status: 'EXAMPLE' } },
  revenueLegs: [{ channel: 'ex-ship', pricingUnit: 'NGN_PER_L', tonnes: trade.cargo.deliveredQtyMT, price: PL7_NGNREF }] };
const ladExNgn = buildLadder(nativeExNgn, fnCT, computeTrade(nativeExNgn, { skipHedgeCompare: true })).exShip;
const exNgnNets = ladExNgn.tiers.map((t) => t.tisNetProfit);
check('PL7 native ex-ship ₦/L ladder: per-tier TIS net VARIES (not inert/identical)', new Set(exNgnNets.map((n) => Math.round(n))).size === exNgnNets.length);
check('PL7 native ex-ship ₦/L ladder: TIS net strictly increases with tier price', exNgnNets.every((n, i) => i === 0 || n > exNgnNets[i - 1]));
// WYSIWYG: each tier net == a direct engine run with the NGN leg repriced to the inverse-converted ₦/L.
check('PL7 native ex-ship ₦/L ladder: tier net == direct engine run at inverse-converted ₦/L leg',
  ladExNgn.tiers.every((t) => {
    const ngnAtTier = (t.pricePerMT * PL7_NAFEM) / LITRES;
    const direct = computeTrade({ ...nativeExNgn, revenueLegs: nativeExNgn.revenueLegs.map((l) => ({ ...l, price: ngnAtTier })) }, { skipHedgeCompare: true });
    return approx(t.tisNetProfit, direct.profit.tisNetProfit, 0.5);
  }));
// The ₦/L ladder reproduces the LEGACY-equivalent (USD-priced/NGN-settled) ladder spread EXACTLY:
// same per-tier USD-equivalent leg price -> same net (proves no inertia AND correct magnitude).
const legacyExNgn = { ...trade, channels: { exShipPct: 1, depotPct: 0 },
  sell: { ...trade.sell, currencyMode: 'NGN', exShipPricePerMT: { value: PL7_USDREF, status: 'EXAMPLE' } } };
const ladLegacyNgn = buildLadder(legacyExNgn, fnCT, computeTrade(legacyExNgn, { skipHedgeCompare: true })).exShip;
check('PL7 native ₦/L ladder nets == legacy-equivalent NGN ladder nets (spread matches, byte-for-byte)',
  ladExNgn.tiers.every((t, i) => approx(t.tisNetProfit, ladLegacyNgn.tiers[i].tisNetProfit, 0.5)));

// SC-LADDER — LADDER-LEVEL surcharge threading (regression guard for the a1e7cf0 change that threads
// r.profit.tisNetAfterSurcharge into every ex-ship AND depot ladder tier row). The engine-level field is
// covered at #3; this locks the LADDER passthrough across BOTH flows (equity-partner + unified trade) and
// BOTH toggle states. Self-deriving — recomputes at each tier's rounded price, no hardcoded expected value
// (so it cannot move the ALL-USD guard). One compound check over every tier:
//   ON  -> tier.tisNetAfterSurcharge == direct engine recompute at the tier price  AND  < tier.tisNetProfit
//   OFF -> tier.tisNetAfterSurcharge == tier.tisNetProfit  (no-op case proofed too)
const scOnTax = (tt) => ({ ...tt, tax: { ...tt.tax, surcharge: { ...tt.tax.surcharge, enabled: true, incidence: 'cost' } } });
// (i) Ex-ship leg via the equity-partner flow + buildExShipLadder.
const scExOn = scOnTax(trade);
const scLadExOn = buildExShipLadder(scExOn, (t) => computeEquityPartner(t), computeEquityPartner(scExOn));
const scLadExOff = buildExShipLadder(trade, (t) => computeEquityPartner(t), computeEquityPartner(trade));
const scExOnOk = scLadExOn.tiers.every((t) => {
  const direct = computeEquityPartner({ ...scExOn, sell: { exShipPricePerMT: { value: t.pricePerMT } } });
  return approx(t.tisNetAfterSurcharge, direct.profit.tisNetAfterSurcharge, 0.5) && t.tisNetAfterSurcharge < t.tisNetProfit;
});
const scExOffOk = scLadExOff.tiers.every((t) => approx(t.tisNetAfterSurcharge, t.tisNetProfit, 0.01));
// (ii) Depot leg via the unified trade flow + buildLadder().depot (native both-legs trade -> depot live).
const scDepOn = scOnTax(nativeDepot);
const scLadDepOn = buildLadder(scDepOn, fnCT, computeTrade(scDepOn, { skipHedgeCompare: true })).depot;
const scLadDepOff = buildLadder(nativeDepot, fnCT, computeTrade(nativeDepot, { skipHedgeCompare: true })).depot;
const scDepOnOk = scLadDepOn.tiers.every((t) => {
  const direct = computeTrade({ ...scDepOn, revenueLegs: scDepOn.revenueLegs.map((l) => (l.channel === 'depot' ? { ...l, price: t.priceNgnPerL } : l)) }, { skipHedgeCompare: true });
  return approx(t.tisNetAfterSurcharge, direct.profit.tisNetAfterSurcharge, 0.5) && t.tisNetAfterSurcharge < t.tisNetProfit;
});
const scDepOffOk = scLadDepOff.tiers.every((t) => approx(t.tisNetAfterSurcharge, t.tisNetProfit, 0.01));
check('SC-LADDER tier.tisNetAfterSurcharge threads engine value (ex-ship+depot): ON == recompute & < net, OFF == net',
  scExOnOk && scExOffOk && scDepOnOk && scDepOffOk);

// ============================================================================================
// MX — NEW (2026-06-23): RULE 1 + RULE 2 together on a SPLIT trade (ex-ship USD + depot). Confirms the
// MAX-channel margin-foregone benchmark and that NAFEM (not parallel) is the live FX P&L lever.
// ============================================================================================
// Split: a high USD ex-ship price ($1600) deliberately BEATS the depot ₦1850/L @ NAFEM (~$1459.03), so
// the MAX benchmark must pick the EX-SHIP channel here (proves the MAX actually selects, isn't always-depot).
const splitTrade = { ...bothChannels, revenueLegs: [
  { channel: 'ex-ship', pricingUnit: 'USD_PER_MT', tonnes: 6000, price: 1600 },
  { channel: 'depot', pricingUnit: 'NGN_PER_L', tonnes: 6000, price: 1850 },
] };
const split = computeTrade(splitTrade, { skipHedgeCompare: true });
const mxDepotAtNafem = (1850 * LITRES) / split.fx.rates.nafemReference;
check('MX split benchmark = MAX(ex-ship USD, depot @ NAFEM)',
  approx(split.profit.benchmarkPriceUSD, Math.max(1600, mxDepotAtNafem), 0.01));
check('MX split: MAX picks the higher ex-ship USD channel (1600 > ~1459 depot @ NAFEM)',
  approx(split.profit.benchmarkPriceUSD, 1600, 0.01) && split.profit.benchmarkBasis === 'ex-ship price');
check('MX split: margin foregone = partnerTonnes × (benchmark − ex-ship landed)',
  approx(split.profit.marginForegone, split.quantities.economic.partnerTonnes * (split.profit.benchmarkPriceUSD - split.price.exShipLandedPerMT), 1));
const mxFn = (t) => computeTrade(t, { skipHedgeCompare: true });
const mxPar = runSensitivities(splitTrade, mxFn, { fxMode: 'parallel' }).scenarios.filter((s) => /FX/.test(s.lever));
const mxNafem = runSensitivities(splitTrade, mxFn, { fxMode: 'nafem' }).scenarios.filter((s) => /FX/.test(s.lever));
check('MX split: PARALLEL FX sensitivity ≈ 0 (reference only)', mxPar.length > 0 && mxPar.every((s) => Math.abs(s.deltaVsBase) < 0.01));
check('MX split: NAFEM FX sensitivity is the live lever (≠ 0)', mxNafem.some((s) => Math.abs(s.deltaVsBase) > 1));

// ============================================================================================
// Config-driven cost/tax lines (policy-change-proofing) — type/rate/base editable via config only.
// ============================================================================================
const cfgBase = computeEquityPartner(trade);
const freightBaseV = cfgBase.cost.freight.freightBase;

// CFG0 — lines are self-describing (type/derivation surfaced) and config-sourced.
check('CFG0 line 7 self-describes type pct_of_freight', cfgBase.cost.byId[7].type === 'pct_of_freight');
check('CFG0 line 6 self-describes type fixed', cfgBase.cost.byId[6].type === 'fixed');
check('CFG0 line 1 self-describes derived/per_mt', cfgBase.cost.byId[1].type === 'derived' && cfgBase.cost.byId[1].derivation === 'per_mt');

// CFG1 — a RATE change (VAT 7.5% -> 10%) propagates correctly (no hardcoded rate in engine).
const v075 = computeEquityPartner({ ...trade, tax: { ...trade.tax, vatRate: 0.075 } });
const v100 = computeEquityPartner({ ...trade, tax: { ...trade.tax, vatRate: 0.10 } });
check('CFG1 VAT 7.5%->10% scales VAT-freight line by 10/7.5',
  approx(v100.cost.byId[12].amountUsd / v075.cost.byId[12].amountUsd, 0.10 / 0.075, 1e-4));
check('CFG1 VAT 7.5%->10% scales VAT-services line by 10/7.5',
  approx(v100.cost.byId[13].amountUsd / v075.cost.byId[13].amountUsd, 0.10 / 0.075, 1e-4));
check('CFG1 VAT change moves the recoverable-VAT block', v100.cost.recoverableVat.grossRecoverable > v075.cost.recoverableVat.grossRecoverable);

// CFG2 — a TYPE FLIP (2% levy -> fixed fee) computes correctly, via config override alone.
const defLevy = cfgBase.cost.byId[7].amountUsd; // 2% of freight
check('CFG2 default line 7 = 2% of freight', approx(defLevy, trade.costLines.nimasaCabotagePct * freightBaseV, 0.01));
const flip = computeEquityPartner({ ...trade, costLineOverrides: { 7: { type: 'fixed', amount: 500000 } } });
check('CFG2 type flip pct->fixed: line 7 now fixed $500,000', approx(flip.cost.byId[7].amountUsd, 500000, 0.01));
check('CFG2 type flip: display category now flat', flip.cost.byId[7].category === 'flat');
check('CFG2 type flip moves allInCost by (fixed - pct)', approx(flip.cost.allInCost - cfgBase.cost.allInCost, 500000 - defLevy, 0.02));
check('CFG2 reconciliation holds after type flip', computeTrade({ ...trade, costLineOverrides: { 7: { type: 'fixed', amount: 500000 } } }).profit.reconciliation.ok === true);

// CFG3 — a BASE change (% of freight -> % of cargo value) recomputes against the new base.
const baseFlip = computeEquityPartner({ ...trade, costLineOverrides: { 7: { type: 'pct_of_cargo_value' } } });
check('CFG3 base flip: line 7 now 2% of cargo value', approx(baseFlip.cost.byId[7].amountUsd, trade.costLines.nimasaCabotagePct * baseFlip.cargoValue, 0.5));

// CFG4 — config is the source: zeroing a config rate zeroes the line (no hardcoded fallback rate).
const zeroed = computeEquityPartner({ ...trade, costLines: { ...trade.costLines, nimasaCabotagePct: 0 } });
check('CFG4 zeroing config rate zeroes the line', zeroed.cost.byId[7].amountUsd === 0);

// CFG5 — tax-block membership is config-driven (schema taxLine flag), not a hardcoded id list.
check('CFG5 tax block built from config taxLine flag', cfgBase.cost.byId[7].taxLine === true && cfgBase.cost.byId[6].taxLine === false);

// ============================================================================================
// FINAL / SETTLEMENT ICE (market.ice.final) — the physical FOB purchase FLOATS at ICE, so a settled
// ICE flows into BOTH landed cost AND the swap reference (ONE shared value, never a second reference
// on the same tonnes). The ICE swap — scoped to RETAINED tonnes — offsets the landed-cost move on
// TIS's exposure; partner tonnes self-offset at par. BLANK => live ICE => byte-for-byte unchanged
// (proven suite-wide by /tmp fingerprint; here we exercise the SETTLED behavior).
// ============================================================================================
const fiCT = (overrides) => computeTrade({ ...trade, ...overrides }, { skipHedgeCompare: true });
const fiLive = trade.market.ice.value; // 800
const fiHedgeOn = { ...trade.hedge, iceHedged: true, fixedPrice: fiLive }; // lock = original live ICE; vol default = retained
const fiHedgeOff = { ...trade.hedge, iceHedged: false };
const setFinal = (fin, hedge) => fiCT({ hedge, market: { ...trade.market, ice: { ...trade.market.ice, final: fin } } });
const fiBlank = setFinal(undefined, fiHedgeOn);  // final blank (=> effective live)
const fiAtLive = setFinal(fiLive, fiHedgeOn);    // final == live exactly
const fiHi = setFinal(fiLive * 1.2, fiHedgeOn);  // final > fixed (+20%)
const fiLo = setFinal(fiLive * 0.8, fiHedgeOn);  // final < fixed (-20%)
const uBlank = setFinal(undefined, fiHedgeOff);  // unhedged counterparts (the exposure the hedge removes)
const uHi = setFinal(fiLive * 1.2, fiHedgeOff);
const uLo = setFinal(fiLive * 0.8, fiHedgeOff);
const fixedLock = fiLive;
const dIce = fiLive * 0.2;

// FI0 — final ICE == live == blank (effectiveIce identity; the SETTLEMENT-equals-live no-op).
check('FI0 final ICE == live reproduces blank exactly (effectiveIce identity)',
  approx(fiAtLive.profit.tisNetProfit, fiBlank.profit.tisNetProfit, 0.001) &&
  approx(fiAtLive.price.exShipLandedPerMT, fiBlank.price.exShipLandedPerMT, 0.001));

// FI1 — (a) landed cost recomputes at final ICE (purchase floats ≥ 1:1 per MT, + pct/financing lines).
check('FI1 (a) landed cost rises with higher final ICE, falls with lower',
  fiHi.price.exShipLandedPerMT > fiBlank.price.exShipLandedPerMT && fiLo.price.exShipLandedPerMT < fiBlank.price.exShipLandedPerMT);
check('FI1 (a) landed-cost move ≈ ICE move per MT (floats ≥ 1:1, < 1.08× incl pct + financing)',
  (fiHi.price.exShipLandedPerMT - fiBlank.price.exShipLandedPerMT) >= dIce - 0.01 &&
  (fiHi.price.exShipLandedPerMT - fiBlank.price.exShipLandedPerMT) < dIce * 1.08);

// FI2 — (b) swap gain/loss = hedgedPhysical × (final − fixed), scoped to RETAINED tonnes ONLY.
check('FI2 (b) iceCostDelta = hedgedPhysical × (fixed − final) [exact formula]',
  approx(fiHi.hedge.iceCostDelta, fiHi.hedge.hedgedPhysical * (fixedLock - fiLive * 1.2), 0.5) &&
  approx(fiLo.hedge.iceCostDelta, fiLo.hedge.hedgedPhysical * (fixedLock - fiLive * 0.8), 0.5));
check('FI2 (b) realized swap impact = hedgedPhysical × (final − fixed) − hedge fee/financing',
  approx(fiHi.hedges.iceHedgeNetImpact, fiHi.hedge.hedgedPhysical * (fiLive * 1.2 - fixedLock) - fiHi.hedge.extraFinancingCost, 0.5));
check('FI2 (b) swap scoped to RETAINED (≤ retained, < full cargo, within 1 lot of retained)',
  fiHi.hedge.hedgedPhysical <= fiHi.quantities.economic.tisRetainedTonnes + 1e-6 &&
  fiHi.hedge.hedgedPhysical < fiHi.meta.deliveredQty &&
  Math.abs(fiHi.hedge.hedgedPhysical - fiHi.quantities.economic.tisRetainedTonnes) < 100);
check('FI2 (b) partner tonnes EXCLUDED from the swap (hedged + partner ≈ delivered, within 1 lot)',
  Math.abs(fiHi.hedge.hedgedPhysical + fiHi.quantities.economic.partnerTonnes - fiHi.meta.deliveredQty) < 100);

// FI3 — (c) partner principal/tonnes recompute at the new landed cost, self-offsetting at par.
check('FI3 (c) partner principal = 25% of cargo value AT final ICE (moves with ICE)',
  approx(fiHi.quantities.economic.principalAsProduct, 0.25 * fiHi.cargoValue, 1) && fiHi.cargoValue > fiBlank.cargoValue);
check('FI3 (c) partner tonnes × landed = principal (par holds at the NEW landed cost, both directions)',
  approx(fiHi.quantities.economic.partnerTonnes * fiHi.price.exShipLandedPerMT, fiHi.quantities.economic.principalAsProduct, 1) &&
  approx(fiLo.quantities.economic.partnerTonnes * fiLo.price.exShipLandedPerMT, fiLo.quantities.economic.principalAsProduct, 1));

// FI4 — directional offset: the landed-cost move and the swap move have OPPOSITE signs on the exposure.
check('FI4 final > fixed: unhedged net FALLS (cost up), swap GAINS (impact > 0)',
  uHi.profit.tisNetProfit < uBlank.profit.tisNetProfit && fiHi.hedges.iceHedgeNetImpact > 0);
check('FI4 final < fixed: unhedged net RISES (cost down), swap LOSES (impact < 0)',
  uLo.profit.tisNetProfit > uBlank.profit.tisNetProfit && fiLo.hedges.iceHedgeNetImpact < 0);

// FI5 — NET STABILITY (proves the hedge works): hedged TIS net barely moves across the ICE range while
// unhedged swings widely; hedged net margin stays ~flat.
const fiHedgedSpread = Math.abs(fiHi.profit.tisNetProfit - fiLo.profit.tisNetProfit);
const fiUnhedgedSpread = Math.abs(uHi.profit.tisNetProfit - uLo.profit.tisNetProfit);
check('FI5 hedged net FAR more stable than unhedged (hedged spread < 15% of unhedged)',
  fiHedgedSpread < 0.15 * fiUnhedgedSpread);
check('FI5 hedged net margin stays ~stable across final ICE (< 1 pt drift)',
  Math.abs(fiHi.profit.tisNetProfit / fiHi.revenue.combinedUSD - fiLo.profit.tisNetProfit / fiLo.revenue.combinedUSD) < 0.01);

// FI6 — BLANK final reverts to the pre-existing base case: no settlement move => iceCostDelta ≈ 0,
// realized impact = the hedge fee/financing only (current behavior, exactly).
check('FI6 blank final: iceCostDelta ≈ 0 (no settlement move)', Math.abs(fiBlank.hedge.iceCostDelta) < 0.5);
check('FI6 blank final: realized impact = -(fee/financing) only (pre-existing base case)',
  approx(fiBlank.hedges.iceHedgeNetImpact, -fiBlank.hedge.extraFinancingCost, 0.5));

// FI7 — reconciliation identity still holds with a settled ICE + the ICE hedge ON.
check('FI7 reconciliation holds with final ICE + ICE hedge ON',
  fiHi.profit.reconciliation.ok === true && fiLo.profit.reconciliation.ok === true);

// FI8 — invalid final ICE is rejected at the boundary (no NaN/Infinity leak).
expectThrow('FI8 non-numeric final ICE throws', () => computeTrade({ ...trade, market: { ...trade.market, ice: { ...trade.market.ice, final: 'oops' } } }), 'market.ice.final');

// ============================================================================================
// LOCAL-ONLY exact-value guards — run only when the real (gitignored) reference-trade is present.
// These keep the exact real-number baseline as a local guard; they SKIP cleanly on a clean clone,
// so real figures never enter the repo.
// ============================================================================================
if (realTrade) {
  console.log('  -- local-only exact-value guards (real reference-trade present) --');
  const rp = computeEquityPartner(realTrade);
  check('LOCAL reference-trade standalone = $3,126,683.88', approx(rp.profit.standaloneProfit, 3126683.88, 0.01));
  check('LOCAL reference-trade TIS net = $1,591,014.15', approx(rp.profit.tisNetProfit, 1591014.15, 0.01));
  const lp = buildExShipLadder(realTrade, (t) => computeEquityPartner(t), rp);
  check('LOCAL reference-trade entered $1,400 nearest tier = Stretch', !!lp.current && lp.current.nearestTier === 'Stretch');
  check('LOCAL structural regression on real trade: computeTrade == computeEquityPartner (TIS net)',
    approx(computeTrade(realTrade).profit.tisNetProfit, rp.profit.tisNetProfit, 0.01));
} else {
  console.log('  -- skipped local-only reference-trade exact-value guards (real file absent — clean clone) --');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
