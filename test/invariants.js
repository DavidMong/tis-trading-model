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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
