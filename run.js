'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const { computeEquityPartner } = require('./engine/flows/equity-partner');
const { computeStraightExship } = require('./engine/flows/straight-exship');
const { computeFullDepotResale } = require('./engine/flows/full-depot-resale');
const { computeTrade } = require('./engine/flows/trade');
const { runSensitivities } = require('./engine/core/sensitivities');
const { buildHedge } = require('./engine/core/hedge');
const { chooseRate } = require('./engine/core/fx');
const { buildLadder } = require('./engine/core/pricing-ladder');

const FLOWS = {
  'equity-partner': computeEquityPartner,
  'straight-exship': computeStraightExship,
  'full-depot-resale': computeFullDepotResale,
  trade: computeTrade,
};

// ---------------------------------------------------------------- formatting
const usd = (x) => (x == null ? 'n/a' : `$${Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const mt = (x) => (x == null ? 'n/a' : `${Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`);
const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(4).replace(/\.?0+$/, '')}%`);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const hr = (c = '-', n = 92) => c.repeat(n);
const badge = (s) => (!s || s === 'OK' ? '' : `  [${s}]`);

// Terminal polish: subtle ANSI accents when attached to a TTY; plain text when piped/exported.
const TTY = process.stdout.isTTY;
const paint = (s) => {
  if (!TTY || typeof s !== 'string') return s;
  return s
    .replace(/OK(?![A-Za-z])/g, '\x1b[32mOK\x1b[0m')
    .replace(/MISMATCH/g, '\x1b[31mMISMATCH\x1b[0m')
    .replace(/\[(CONFIRM|PENDING[^\]]*)\]/g, '\x1b[33m$&\x1b[0m')
    .replace(/\[(INDICATIVE)\]/g, '\x1b[36m$&\x1b[0m')
    .replace(/\[(PLACEHOLDER[^\]]*)\]/g, '\x1b[35m$&\x1b[0m');
};

// ---------------------------------------------------------------- CLI
function parseCli() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'with-surcharge': { type: 'boolean', default: false },
      'compare-fx': { type: 'boolean', default: false },
      'compare-hedge': { type: 'boolean', default: false },
      ladder: { type: 'boolean', default: false },
      upside: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      export: { type: 'string' }, // 'csv'
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return { flags: values, tradeFile: positionals[0] };
}

function loadTrade(file) {
  const abs = path.resolve(file);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// ---------------------------------------------------------------- report
function printReport(res, trade, flags) {
  const L = (s = '') => console.log(paint(s));

  L(hr('='));
  L('TIS GLOBAL TRADING — TRADE MODEL REPORT');
  L(res.meta.tradeName);
  L(`Trade ${res.meta.tradeId}   |   Flow: ${res.meta.flow}   |   Entity: ${res.meta.entity}`);
  L(`Partner ${res.meta.parties.partner}  |  Supplier ${res.meta.parties.supplier}  |  Facility ${res.meta.parties.facility}  |  Inspector ${res.meta.parties.inspector}`);
  L(`Delivered qty: ${mt(res.meta.deliveredQty)}${flags.upside ? '   (UPSIDE case +5% seller option)' : ''}`);
  L(hr('='));

  // 1. Funding stack
  const f = res.financing;
  L('\n1. FUNDING STACK  (of cargo FOB value)');
  L(hr());
  L(`  Unit FOB (ICE + premium)        ${padL(usd(res.unitFob) + '/MT', 24)}`);
  L(`  Cargo (FOB) value               ${padL(usd(res.cargoValue), 24)}   = unit FOB x ${mt(res.meta.deliveredQty)}`);
  L(`  Performance bond  ${pct(f.pct.bondPct)} (first-loss) ${padL(usd(f.performanceBond), 18)}`);
  L(`  Equity            ${pct(f.pct.equityPct)}             ${padL(usd(f.equity), 18)}`);
  L(`  Partner funding   ${pct(f.pct.partnerPct)} (bond+equity)${padL(usd(f.partnerFunding), 18)}   <- partner returnable principal`);
  L(`  Bank LC           ${pct(f.pct.lcPct)}             ${padL(usd(f.lc), 18)}`);
  L(`  WC sublimit (non-cargo costs)   ${padL(usd(f.wc), 18)}`);
  L(`  Net advance (LC + WC)           ${padL(usd(f.netAdvance), 18)}`);
  L(`  Funding-stack check (bond+equity+LC = 100% of cargo): ${(f.check.fundingStackPctOfCargo * 100).toFixed(2)}%  ${f.check.fundingStackPctOfCargo === 1 ? 'OK' : 'MISMATCH'}`);

  // 2. Cost build-up
  L('\n2. COST BUILD-UP  (all-in landed cost EXCLUDES recoverable VAT)');
  L(hr());
  L(`  ${pad('#', 3)}${pad('Line', 34)}${pad('Category', 19)}${padL('Amount (USD)', 18)}  Flag`);
  for (const l of res.cost.lines) {
    const flag = l.recoverable ? 'RECOVERABLE' : (l.status === 'OK' ? '' : l.status);
    L(`  ${pad(l.id, 3)}${pad(l.label, 34)}${pad(l.category, 19)}${padL(usd(l.amountUsd), 18)}  ${flag}`);
  }
  L(hr());
  L(`  ${pad('', 3)}${pad('ALL-IN LANDED COST (excl. recoverable VAT)', 53)}${padL(usd(res.cost.allInCost), 18)}`);
  L(`  ${pad('', 3)}${pad('Landed cost / MT', 53)}${padL(usd(res.price.landedCostPerMT) + '/MT', 18)}`);
  L(`  Freight base (TC hire ${usd(res.cost.freight.tcHire)} + demurrage ${usd(res.cost.freight.demurrage)}) = ${usd(res.cost.freight.freightBase)}`);

  // 2b. VAT-services bucket (INFERRED composition)
  const sb = res.cost.servicesBucket;
  L('\n2b. VAT-SERVICES BASE  (line 13 — INFERRED, configurable named bucket)');
  L(hr());
  for (const x of sb.composition) L(`  line ${pad(x.id, 3)} ${pad(x.label, 28)} ${padL(usd(x.amount), 16)}`);
  L(`  ${pad('servicesBucket SUM', 38)} ${padL(usd(sb.sum), 16)}`);
  L(`  VAT on services @ 7.5%  =        ${padL(usd(res.cost.byId[13].amountUsd), 16)}   (recoverable input VAT)`);

  // 3. Recoverable-VAT block
  const rv = res.cost.recoverableVat;
  L('\n3. RECOVERABLE VAT  (cash-flow TIMING only — does NOT affect profit; s.155(4))');
  L(hr());
  for (const l of rv.lines) L(`  line ${pad(l.id, 3)} ${pad(l.label, 36)} ${padL(usd(l.amount), 16)}`);
  L(`  Gross input VAT                         ${padL(usd(rv.grossRecoverable), 16)}`);
  L(`  x taxableSupplyProportion (${pct(rv.taxableSupplyProportion)})         ${padL('', 16)}`);
  L(`  = Recoverable VAT (reclaimed / WC timing)${padL(usd(rv.recoverable), 16)}`);
  if (rv.irrecoverable > 0) L(`  Irrecoverable VAT -> ADDED TO LANDED COST${padL(usd(rv.irrecoverable), 16)}   (s.155(4) proviso (a))`);

  // 4. Tax block
  L('\n4. TAX BLOCK  (authority: tax-reference.md vs Nigeria Tax Act 2025)');
  L(hr());
  L(`  ${pad('#', 3)}${pad('Line', 34)}${padL('Amount', 15)}  Treatment / status`);
  for (const t of res.tax.items) {
    L(`  ${pad(t.id, 3)}${pad(t.label, 34)}${padL(usd(t.amountUsd), 15)}  ${t.treatment}${t.status === 'OK' ? '' : ' [' + t.status + ']'}`);
    L(`      ${t.legalRef}`);
  }
  const sc = res.tax.surcharge;
  L(`\n  Fossil-fuel surcharge (s.158-161): ${sc.enabled ? 'ENABLED' : 'OFF (default)'}   status: ${sc.status}`);
  L(`      rate ${pct(sc.rate)}  base: ${sc.baseDescription}  ${sc.baseAmount != null ? '(' + usd(sc.baseAmount) + ')' : ''}`);
  L(`      incidence: ${sc.incidence}   full statutory: ${usd(sc.amountUsd)}   TIS-borne (retained tonnes only): ${usd(sc.tisBorneUsd)}`);
  L(`      ${sc.legalRef}`);

  // 5. Quantities — paper vs economic
  const q = res.quantities;
  L('\n5. QUANTITIES  (economic drives ALL P&L; paper is documentary, rounded in TIS favour)');
  L(hr());
  L(`  ${pad('', 22)}${padL('ECONOMIC (exact)', 22)}${padL('PAPER (nearest 50)', 22)}`);
  L(`  ${pad('Partner tonnes', 22)}${padL(mt(q.economic.partnerTonnes), 22)}${padL(mt(q.paper.partnerPaper) + ' (down)', 22)}`);
  L(`  ${pad('TIS retained tonnes', 22)}${padL(mt(q.economic.tisRetainedTonnes), 22)}${padL(mt(q.paper.tisPaper) + ' (up)', 22)}`);
  L(`  Partner principal as product: ${usd(q.economic.principalAsProduct)}   as cash: ${usd(q.economic.principalAsCash)}`);
  L(`  Paper partner value ${usd(q.paper.partnerPaperValue)}  ->  settlement cash true-up to par: ${usd(q.paper.cashTrueUp)}`);

  // 6. Price
  L('\n6. PRICE');
  L(hr());
  L(`  Landed cost / MT                ${padL(usd(res.price.landedCostPerMT) + '/MT', 20)}`);
  L(`  Ex-storage landed cost / MT     ${padL(usd(res.price.exStorageLandedPerMT) + '/MT', 20)}`);
  L(`  Ex-ship SELL price / MT         ${padL(usd(res.price.exShipPricePerMT) + '/MT', 20)}${badge(res.price.exShipStatus)}`);
  if (res.price.placeholderMarginPct != null) L(`      (placeholder = landed x (1 + ${pct(res.price.placeholderMarginPct)}))`);
  L(`  Per-MT margin                   ${padL(usd(res.price.perMtMargin) + '/MT', 20)}`);

  // 7. Profit waterfall
  const p = res.profit;
  L('\n7. PROFIT WATERFALL  (standalone <-> adjusted reconciliation — INFERRED)');
  L(hr());
  L(`  Standalone profit  (TIS as 100% owner)     ${padL(usd(p.standaloneProfit), 18)}   = ${mt(res.meta.deliveredQty)} x per-MT margin`);
  L(`  - Margin foregone  (TIS opportunity cost)  ${padL(usd(p.marginForegone), 18)}   = partner tonnes x per-MT margin`);
  L(`  = Adjusted profit                          ${padL(usd(p.adjustedProfit), 18)}   = retained tonnes x per-MT margin`);
  L(`  - Partner cash profit share (${pct(p.profitSharePct)})       ${padL(usd(p.partnerCashProfitShare), 18)}   = share x adjusted`);
  L(`  = TIS net profit                           ${padL(usd(p.tisNetProfit), 18)}   = (1 - share) x adjusted`);
  if (p.tisNetAfterSurcharge !== p.tisNetProfit) L(`    TIS net after surcharge incidence        ${padL(usd(p.tisNetAfterSurcharge), 18)}`);
  L(`  reconciliation: marginForegone + adjusted = standalone -> ${usd(p.reconciliation.lhs)} = ${usd(p.reconciliation.rhs)}  ${p.reconciliation.ok ? 'OK' : 'MISMATCH'}`);
  L(`  TIS annualised return on cargo (lockup ${f.capitalLockupDays}d): ${pct(res.tisAnnualisedReturnOnCargo)}   [TIS-side metric, INDICATIVE]`);

  // 8. Partner deliverables
  const pd = res.partnerDelivers;
  L(`\n8. PARTNER DELIVERABLES — ${res.meta.parties.partner}  (TIS-internal view: only what TIS delivers)`);
  L(hr());
  L(`  (1) Product received: ${mt(pd.productReceived.tonnes)}  valued at landed cost ${usd(pd.productReceived.valuedAtLandedCost)}  (= principal at par)`);
  L(`  (2) Cash received:    profit share ${usd(pd.cashReceived.profitShare)}` + (pd.cashReceived.principalCashPortion > 0 ? `  + principal cash ${usd(pd.cashReceived.principalCashPortion)}` : '') + `  + settlement true-up ${usd(pd.cashReceived.settlementTrueUp)}`);
  L(`  Principal tie-out: owed ${usd(pd.principalTie.owed)} = product ${usd(pd.principalTie.returnedProductValue)} + cash ${usd(pd.principalTie.returnedCash)}  ${pd.principalTie.ok ? 'OK' : 'MISMATCH'}`);
  L(`  (Margin foregone is shown as TIS opportunity cost only — no partner-side upside attributed.)`);

  // 9. Hedge
  const h = res.hedge;
  L('\n9. HEDGE — ICE Gasoil swap  (hedged vs unhedged)');
  L(hr());
  L(`  Route: ${h.route}   lots: ${h.lots} (${mt(h.hedgedTonnes)})   unhedged: ${mt(h.unhedgedTonnes)}   basis: ${mt(h.comparisonBasisTonnes)} retained`);
  if (h.overHedgeTonnes > 0) L(`  Over-hedge (speculative, excluded from physical comparison): ${mt(h.overHedgeTonnes)}`);
  L(`  Fixed price ${usd(h.fixedPrice)}/MT  vs live ICE ${usd(h.liveIce)}/MT   notional ${usd(h.notional)}`);
  L(`  Effective ICE cost (hedged) ${usd(h.effectiveIceCost)}   |   unhedged ${usd(h.unhedgedIceCost)}   |   delta ${usd(h.iceCostDelta)}`);
  L(`  Swap fee ${usd(h.swapFee)}   bank-provided margin ${usd(h.bankProvidedMargin)}   extra financing cost ${usd(h.extraFinancingCost)}`);
  L(`  ${badge(h.status).trim()}`);

  // 10. Sensitivities
  L('\n10. SENSITIVITIES  (+/-10%; change in TIS net profit)');
  L(hr());
  for (const s of res.sensitivities.scenarios) {
    L(`  ${pad(s.lever, 22)} TIS net ${padL(usd(s.tisNet), 18)}   delta ${padL(usd(s.deltaVsBase), 16)}`);
  }
  L(`  FX: ${res.sensitivities.fx.note}`);
  L(`  Hedge: effective ${usd(res.sensitivities.hedge.effectiveIceCost)} vs unhedged ${usd(res.sensitivities.hedge.unhedgedIceCost)} (delta ${usd(res.sensitivities.hedge.delta)})`);
  if (res.sensitivities.depotDownside) L(`  Depot sold at cost: TIS net ${usd(res.sensitivities.depotDownside.tisNet)} (delta ${usd(res.sensitivities.depotDownside.deltaVsBase)})`);
  else L('  Depot sold-at-cost downside: n/a (no depot leg).');

  // 11. Inferred formulas & status flags appendix
  L('\n11. INFERRED FORMULAS & STATUS FLAGS  (eyeball before relying on figures)');
  L(hr());
  L('  INFERRED:');
  L('   - VAT-services base = SGS(15) + port agency(16) + collateral mgr(24); 7.5% applied. [configurable]');
  L('   - Landed cost / MT = sum(all cost lines except recoverable VAT 12,13) / deliveredQty.');
  if (res.price.placeholderMarginPct != null) L(`   - Ex-ship placeholder = landed cost / MT x (1 + ${pct(res.price.placeholderMarginPct)}).`);
  else L('   - Ex-ship price = FIXED input (decoupled from cost; does NOT move with ICE/FOB/TC).');
  L('   - Standalone<->adjusted: adjusted = standalone - marginForegone; TIS = (1-share) x adjusted.');
  L('   - WC draw = full WC sublimit (not actual non-cargo spend).');
  L('   - Evaporation / tank-insurance base = cargo value (depot legs only).');
  L('   - TIS annualised return = (TIS net / cargo value) x (365 / capitalLockupDays).');
  L('  STATUS FLAGS:');
  L('   - WHT freight 5%      CONFIRM  (TAA s.51 enabling; rate in regs, UNVERIFIED).');
  L('   - Surcharge 5%        PENDING  (s.158-161; commencementGazetted=false; default OFF).');
  L(`   - Ex-ship price       ${res.price.exShipStatus}.`);
  L('   - VAT-services base   CONFIRM  (inferred composition).');
  L('   - NIMASA 2%/3%, SPOMO/CVFF 2%   CONFIRM (non-NTA levies).');
  L('   - Marine 0.125%, alloc security 0.029%   INDICATIVE (commercial).');
  L('   - Hedge fee/margin/fixedPrice   PLACEHOLDER (verify before live hedge).');
  L('   - creditRate, lcFeePct, charter/demurrage days, FX   INDICATIVE / overridable.');
  L(`   - day-count basis    Actual/${res.financing.dayCountBasis} (configurable; CONFIRM vs facility — many USD facilities use 360).`);
  L(hr('='));
}

// ---------------------------------------------------------------- unified trade report
const ngn = (x) => (x == null ? 'n/a' : `₦${Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function printTradeReport(res, trade, flags) {
  const L = (s = '') => console.log(s);
  const f = res.financing;
  L(hr('='));
  L('TIS GLOBAL TRADING — UNIFIED TRADE MODEL REPORT');
  L(res.meta.tradeName);
  L(`Trade ${res.meta.tradeId}   |   Flow: ${res.meta.flow}   |   Equity provider: ${res.equityProvider}`);
  L(`Partner ${res.meta.parties.partner}  |  Supplier ${res.meta.parties.supplier}  |  Facility ${res.meta.parties.facility}`);
  L(`Delivered qty: ${mt(res.meta.deliveredQty)}${flags.upside ? '   (UPSIDE case)' : ''}`);
  L(hr('='));

  // Channels
  L('\n1. SALE CHANNELS');
  L(hr());
  L(`  Ex-ship  ${pct(res.channels.exShipPct)}  =>  ${mt(res.channels.exShipTonnes)}`);
  L(`  Ex-depot ${pct(res.channels.depotPct)}  =>  ${mt(res.channels.depotTonnes)}`);

  // Funding stack (configurable equity ratio)
  L('\n2. FUNDING STACK  (of cargo FOB value — configurable equity ratio)');
  L(hr());
  L(`  Cargo (FOB) value               ${padL(usd(res.cargoValue), 20)}`);
  L(`  Performance bond  ${pct(f.pct.bondPct)}            ${padL(usd(f.performanceBond), 18)}`);
  L(`  Equity            ${pct(f.pct.equityPct)}            ${padL(usd(f.equity), 18)}  (provider: ${res.equityProvider})`);
  L(`  Bank LC           ${pct(f.pct.lcPct)}            ${padL(usd(f.lc), 18)}`);
  L(`  Funding-stack check: ${(f.check.fundingStackPctOfCargo * 100).toFixed(2)}%  ${f.check.fundingStackPctOfCargo === 1 ? 'OK' : 'MISMATCH'}`);

  // Cost build-up (compact: total + key bases)
  L('\n3. COST BUILD-UP');
  L(hr());
  L(`  ${pad('#', 3)}${pad('Line', 30)}${pad('Cat', 17)}${padL('Amount (USD)', 16)}  Flag`);
  for (const l of res.cost.lines) {
    const flag = l.recoverable ? 'RECOVERABLE' : (l.status === 'OK' ? '' : l.status);
    const ngnNote = l.ngnAmount != null ? `  (${ngn(l.ngnAmount)})` : '';
    L(`  ${pad(l.id, 3)}${pad(l.label, 30)}${pad(l.category, 17)}${padL(usd(l.amountUsd), 16)}  ${flag}${ngnNote}`);
  }
  L(hr());
  L(`  Base all-in (ex-ship, excl storage) ${padL(usd(res.cost.baseAllIn), 18)}  -> ex-ship landed ${usd(res.price.exShipLandedPerMT)}/MT`);
  L(`  Storage total (depot volume)        ${padL(usd(res.cost.storageTotal), 18)}  -> depot landed   ${usd(res.price.depotLandedPerMT)}/MT`);
  L(`  ALL-IN COMBINED COST                ${padL(usd(res.cost.allInCost), 18)}`);
  if (res.price.depotLandedPerMT > res.price.exShipLandedPerMT) L(`  (depot landed > ex-ship landed by ${usd(res.price.depotLandedPerMT - res.price.exShipLandedPerMT)}/MT — storage/holding)`);

  // FX block
  const fx = res.fx;
  L('\n4. FX  (NAFEM drives naira P&L; PARALLEL reference only)');
  L(hr());
  L(`  Currency mode: ${fx.currencyMode}  (USD share ${pct(fx.usdShare)} / naira share ${pct(fx.nairaShare)})   fxIncidence: ${fx.fxIncidence}`);
  L(`  NAFEM (P&L)        ${fx.rates.nafemReference} NGN/USD  — drives all naira->USD P&L conversion`);
  L(`  PARALLEL (reference) ${fx.rates.parallelPricing} NGN/USD   payment ${fx.rates.parallelPayment} (bump ${pct(fx.rates.paymentBumpPct)})   [${fx.rates.parallelSource || 'n/a'}, ${fx.rates.parallelAsOf || 'n/a'}]  — reference only, never in P&L`);
  L(`  Naira revenue ${ngn(fx.nairaRevenue.ngn)}  =>  P&L @ NAFEM ${usd(fx.nairaRevenue.usdAtNafemReference)}  |  parallel ref ${usd(fx.nairaRevenue.usdAtParallel)}`);
  L(`  Naira cost    ${ngn(fx.nairaCost.ngn)}  =>  P&L @ NAFEM ${usd(fx.nairaCost.usdAtNafemReference)}  |  parallel ref ${usd(fx.nairaCost.usdAtParallel)}`);
  L(`  Net naira exposure @ NAFEM (USD): ${usd(fx.netNairaExposureUsd)}   parallel reconciliation gap: ${usd(fx.nafemReconciliationGapUsd)}`);

  // Revenue & price
  L('\n5. REVENUE & PRICE');
  L(hr());
  L(`  Ex-ship revenue ${padL(usd(res.revenue.exShipUSD), 18)}   ex-ship price ${res.price.exShipPricePerMT != null ? usd(res.price.exShipPricePerMT) + '/MT' : 'n/a'}`);
  L(`  Depot revenue   ${padL(usd(res.revenue.depotUSD), 18)}   depot price   ${res.price.depotPriceNgnPerL != null ? ngn(res.price.depotPriceNgnPerL) + '/L = ' + usd(res.price.depotPriceUSDperMT) + '/MT' : 'n/a'}`);
  L(`  COMBINED revenue${padL(usd(res.revenue.combinedUSD), 18)}   avg realized ${usd(res.price.avgRealizedPriceUSDperMT)}/MT`);
  if (res.pricing && res.pricing.mode === 'indexed') {
    L(`  Purchase [INDEXED]: ${res.pricing.purchaseSummary}`);
    if (res.pricing.instrument) {
      L(`     Hedge instrument: ${res.pricing.instrument.exchange} ${res.pricing.instrument.symbol} (${res.pricing.instrument.viaIndexId}${res.pricing.instrument.proxyFor ? `, proxy for ${res.pricing.instrument.proxyFor}` : ''})`);
    }
    for (const a of res.pricing.saleLegAudits) L(`  Sale leg ${a.legIndex + 1} [INDEXED]: ${a.summary}`);
  }
  for (const p of res.quoteProvenance || []) {
    const flag = p.freshness === 'STALE' ? ' [STALE]' : '';
    L(`  Quote ${p.indexId} = ${p.value}${flag} — ${p.origin}${p.source ? ` · ${p.source}` : ''}${p.asOf ? ` · asOf ${p.asOf}` : ''}${p.warning ? ` ⚠ ${p.warning}` : ''}`);
  }
  if (res.basis && (res.basis.rows.length || res.basis.notes.length)) {
    for (const b of res.basis.rows) L(`  BASIS ${b.physicalIndex} vs ${b.instrument}: ${b.basisUsdPerMt} USD/MT (${b.basisPctOfPhysical}%) — residual NOT in P&L`);
    for (const n of res.basis.notes) L(`  BASIS note: ${n}`);
  }
  if (res.price.depotPremiumPerMT != null) L(`  Depot premium over ex-ship: ${usd(res.price.depotPremiumPerMT)}/MT`);

  // Quantities (partner only)
  const q = res.quantities;
  if (res.equityProvider === 'partner') {
    L('\n6. QUANTITIES  (economic drives P&L; paper documentary)');
    L(hr());
    L(`  Partner tonnes (in-kind): ${mt(q.economic.partnerTonnes)}   TIS retained: ${mt(q.economic.tisRetainedTonnes)}`);
    if (q.paper) L(`  Paper: partner ${mt(q.paper.partnerPaper)} / TIS ${mt(q.paper.tisPaper)}   true-up ${usd(q.paper.cashTrueUp)}`);
  }

  // Profit waterfall
  const p = res.profit;
  L('\n7. PROFIT WATERFALL  (channels pooled into ONE P&L)');
  L(hr());
  L(`  Standalone profit (revenue - cost)         ${padL(usd(p.standaloneProfit), 18)}`);
  if (res.equityProvider === 'partner') {
    L(`  - Margin foregone  (benchmark: ${p.benchmarkBasis})  ${padL(usd(p.marginForegone), 18)}`);
    L(`  = Adjusted profit                          ${padL(usd(p.adjustedProfit), 18)}`);
    L(`  - Partner cash profit share (${pct(p.profitSharePct)})       ${padL(usd(p.partnerCashProfitShare), 18)}`);
    L(`  = TIS net profit                           ${padL(usd(p.tisNetProfit), 18)}`);
  } else {
    L(`  (TIS self-funded: standalone = adjusted = TIS net)`);
    L(`  = TIS net profit                           ${padL(usd(p.tisNetProfit), 18)}`);
  }
  if (p.tisNetAfterSurcharge !== p.tisNetProfit) L(`    TIS net after surcharge incidence        ${padL(usd(p.tisNetAfterSurcharge), 18)}`);
  L(`  reconciliation: ${p.reconciliation.ok ? 'OK' : 'MISMATCH'}  (rev-cost ${usd(p.reconciliation.revenueLessCost)} = standalone ${usd(p.reconciliation.standalone)})`);
  L(`  TIS annualised return: ${pct(res.tisAnnualisedReturn)}  on ${res.annualReturnBaseLabel} (${usd(res.annualReturnBase)})`);

  // Partner deliverables / TIS note
  L('\n8. EQUITY PROVIDER');
  L(hr());
  if (res.equityProvider === 'partner') {
    const pd = res.partnerDelivers;
    L(`  Partner: ${res.meta.parties.partner} (TIS-internal view)`);
    L(`  (1) Product received ${mt(pd.productReceived.tonnes)} valued at ex-ship landed ${usd(pd.productReceived.valuedAtExShipLandedCost)}`);
    L(`  (2) Cash received: profit share ${usd(pd.cashReceived.profitShare)}` + (pd.cashReceived.principalCashPortion > 0 ? ` + principal cash ${usd(pd.cashReceived.principalCashPortion)}` : '') + ` + settlement true-up ${usd(pd.cashReceived.settlementTrueUp)}`);
    L(`  Principal tie-out: ${usd(pd.principalTie.owed)} = product ${usd(pd.principalTie.returnedProductValue)} + cash ${usd(pd.principalTie.returnedCash)}  ${pd.principalTie.ok ? 'OK' : 'MISMATCH'}`);
  } else {
    L(`  ${res.partnerDelivers.note}`);
  }

  // Hedges (two independent toggles; each shows the opposite scenario)
  const h = res.hedge;
  const fh = res.fxHedge;
  const hc = res.hedgeComparison;
  L('\n9. HEDGES  (toggle ON drives realized P&L; opposite scenario shown for comparison)');
  L(hr());
  L(`  Swap [${res.hedges.iceHedged ? 'ON' : 'OFF'}]  ${h.instrument || 'ICE Gasoil'}  route ${h.route}  lots ${h.lots} (${mt(h.hedgedTonnes)})  basis ${mt(h.comparisonBasisTonnes)} retained`);
  L(`     effective ${usd(h.effectiveIceCost)} vs unhedged ${usd(h.unhedgedIceCost)} (delta ${usd(h.iceCostDelta)})   realized P&L impact ${usd(res.hedges.iceHedgeNetImpact)}`);
  if (h.overHedgeTonnes > 0) L(`     over-hedge (speculative, excluded): ${mt(h.overHedgeTonnes)}`);
  if (hc) L(`     TIS net: hedged ${usd(hc.ice.hedgedTisNet)}  vs  unhedged ${usd(hc.ice.unhedgedTisNet)}   (hedging worth ${usd(hc.ice.hedgeWorthItVsUnhedged)})`);
  L(`  FX hedge [${res.hedges.fxHedged ? 'ON' : 'OFF'}]  route ${fh.routeEconomics.type}  benchmark ${fh.benchmark}  bank-repayment base ${ngn(fh.exposureNgn)}`);
  if (fh.hasExposure) {
    L(`     base = bank repayment (LC + WC + interest) ${usd(fh.bankRepaymentUsd)} @ NAFEM ${res.fx.rates.nafemReference}`);
    L(`     FX hedge covers the naira needed to repay the bank's USD facility (principal + interest). Naira profit is retained in naira and not hedged.`);
    L(`     hedged ${ngn(fh.hedgedNgn)} @ forward ${fh.forwardRate} -> ${usd(fh.hedgedUsd)}  vs floating @ NAFEM ${res.fx.rates.nafemReference} -> ${usd(fh.floatingUsd)}   realized P&L impact ${usd(res.hedges.fxHedgeNetImpact)}`);
    if (fh.overHedgeNgn > 0) L(`     over-hedge (speculative, excluded): ${ngn(fh.overHedgeNgn)}`);
    L(`     ⚠ BASIS RISK: ${fh.basis.note}`);
    L(`        benchmark-vs-parallel gap ${fh.basis.gapNgnPerUsd} NGN/USD  ->  residual basis ${usd(fh.basis.residualBasisUsd)} (uncovered)`);
    if (hc) L(`     TIS net: hedged ${usd(hc.fx.hedgedTisNet)}  vs  unhedged ${usd(hc.fx.unhedgedTisNet)}   (hedging worth ${usd(hc.fx.hedgeWorthItVsUnhedged)})`);
  } else {
    L(`     no naira exposure in this trade — FX hedge n/a (no-op).`);
  }
  L(`  All hedge params are PLACEHOLDER — confirm with bank/broker.`);

  // Sensitivities
  L('\n10. SENSITIVITIES  (+/-10%; change in TIS net)');
  L(hr());
  for (const s of res.sensitivities.scenarios) L(`  ${pad(s.lever, 20)} TIS net ${padL(usd(s.tisNet), 18)}   delta ${padL(usd(s.deltaVsBase), 16)}`);
  L(`  FX: ${res.sensitivities.fx.note}`);
  if (res.sensitivities.depotDownside) L(`  Depot sold at cost: TIS net ${usd(res.sensitivities.depotDownside.tisNet)} (delta ${usd(res.sensitivities.depotDownside.deltaVsBase)})`);
  L(hr('='));
}

// ---------------------------------------------------------------- comparisons
function printFxComparison(trade, res) {
  console.log('\nFX COMPARISON (NAFEM vs parallel)');
  console.log(hr());
  const nafem = chooseRate(trade.fx, 'nafem');
  const parallel = chooseRate(trade.fx, 'parallel');
  console.log(`  NAFEM    ${padL(nafem.effective, 10)} NGN/USD  (${nafem.source}, ${nafem.status})`);
  console.log(`  Parallel ${padL(parallel.effective, 10)} NGN/USD  (${parallel.source}, ${parallel.status})`);
  const hasNgn = !!(res && ((res.fx && res.fx.nairaShare > 0)
    || (res.cost && Array.isArray(res.cost.lines) && res.cost.lines.some((l) => l.currency === 'NGN'))));
  console.log(hasNgn
    ? '  Note: this trade HAS naira exposure — NAFEM drives the naira P&L conversion (parallel = reference only).'
    : '  Note: no NGN legs detected — FX choice does not change P&L.');
}

function printHedgeComparison(trade, res) {
  console.log('\nHEDGE ROUTE COMPARISON (A bank_book vs B third_party)');
  console.log(hr());
  const ctx = { tisRetainedTonnes: res.quantities.economic.tisRetainedTonnes };
  const a = buildHedge({ ...trade, hedge: { ...trade.hedge, route: 'bank_book' } }, ctx);
  const b = buildHedge({ ...trade, hedge: { ...trade.hedge, route: 'third_party' } }, ctx);
  console.log(`  Route A bank_book   : extra cost ${usd(a.extraFinancingCost)} (spread ${usd(a.routeEconomics.bankSpread)} + fee ${usd(a.swapFee)}); bank margin ${usd(a.bankProvidedMargin)}`);
  console.log(`  Route B third_party : extra cost ${usd(b.extraFinancingCost)} (margin int ${usd(b.routeEconomics.marginInterest)} + 3p fee ${usd(b.routeEconomics.thirdPartyFee)} + fee ${usd(b.swapFee)}); bank margin ${usd(b.bankProvidedMargin)}`);
  console.log('  In both routes swap margin is bank-provided, never partner equity.');
}

// ---------------------------------------------------------------- pricing ladder
function printLadder(ladder, trade) {
  const L = (s = '') => console.log(s);
  L('\n' + hr('='));
  L('PRICING LADDER  (cost-plus margin guidance)');
  L(`*** ${ladder.disclaimer} ***`);
  L(hr('='));

  // EX-SHIP ladder
  const ex = ladder.exShip;
  L(`\nEX-SHIP LADDER (USD cargo sale)   cost base = ex-ship landed ${usd(ex.costBasePerMT)}/MT  (ex-storage)`);
  L(hr());
  L(`  ${pad('Tier', 14)}${padL('Margin%sell', 13)}${padL('Price $/MT', 14)}${padL('Spread $/MT', 14)}${padL('Markup%cost', 13)}${padL('Spread N/L', 12)}${padL('TIS net', 16)}`);
  for (const t of ex.tiers) {
    const here = ex.current && Math.abs(t.pricePerMT - ex.current.pricePerMT) < 0.01;
    L(`  ${pad((here ? '> ' : '') + t.name, 14)}${padL(pct(t.marginOfSell), 13)}${padL(usd(t.pricePerMT), 14)}${padL(usd(t.spreadPerMT), 14)}${padL(pct(t.markupPctOnCost), 13)}${padL(t.spreadNgnPerL != null ? '₦' + t.spreadNgnPerL.toFixed(2) : 'n/a', 12)}${padL(usd(t.tisNetProfit), 16)}`);
  }
  if (ex.current) {
    const c = ex.current;
    L(hr('.'));
    L(`  YOUR ENTERED PRICE: ${usd(c.pricePerMT)}/MT  [${c.status}]`);
    L(`    margin ${pct(c.marginPctOfSell)} of sell  |  markup ${pct(c.markupPctOnCost)} on cost  |  spread ${usd(c.spreadPerMT)}/MT (₦${c.spreadNgnPerL}/L)`);
    L(`    sits between tiers: ${c.between}   ->   nearest tier: ${c.nearestTier}`);
  }

  // DEPOT ladder
  const dp = ladder.depot;
  L('\nDEPOT LADDER (naira downstream resale)');
  L(hr());
  if (!dp.applicable) {
    L(`  ${dp.note}`);
  } else {
    L(`  cost base = all-in depot landed ₦${dp.costBaseNgnPerL}/L  (${usd(dp.costBasePerMT)}/MT incl. storage; FX ${dp.fxUsed}, ${dp.litresPerMT} L/MT)`);
    L(`  ${pad('Tier', 14)}${padL('Spread N/L', 13)}${padL('Price N/L', 14)}${padL('Price $/MT', 14)}${padL('Margin%sell', 13)}${padL('TIS net', 18)}`);
    for (const t of dp.tiers) {
      L(`  ${pad(t.name, 14)}${padL('₦' + t.spreadNgnPerL.toFixed(2), 13)}${padL('₦' + t.priceNgnPerL.toFixed(2), 14)}${padL(usd(t.priceUsdPerMT), 14)}${padL(pct(t.marginPctOfSell), 13)}${padL(t.tisNetProfit != null ? usd(t.tisNetProfit) : t.pnlStatus, 18)}`);
    }
  }

  // PRIMARY comparison
  const cmp = ladder.comparison;
  L('\nPRIMARY COMPARISON — absolute spread (cross-leg headline)');
  L(hr());
  if (!cmp.applicable) {
    L(`  ${cmp.note}`);
    L(`  Ex-ship representative (${cmp.exShipRepresentative.tier}): spread ${usd(cmp.exShipRepresentative.spreadPerMT)}/MT  (= ₦${cmp.exShipRepresentative.spreadNgnPerL}/L)`);
  } else {
    L(`  Ex-ship (${cmp.exShip.tier}):  ${usd(cmp.exShip.spreadPerMT)}/MT   = ₦${cmp.exShip.spreadNgnPerL}/L`);
    L(`  Depot   (${cmp.depot.tier}):  ₦${cmp.depot.spreadNgnPerL}/L   = ${usd(cmp.depot.spreadPerMT)}/MT`);
    L(`  Depot earns larger absolute spread: ${cmp.depotEarnsMoreAbsolute ? 'YES' : 'NO'}   (${cmp.rationale})`);
  }
  L(hr('='));
}

// ---------------------------------------------------------------- CSV export
function exportCsv(res, outDir) {
  const rows = [['section', 'id', 'label', 'value', 'unit', 'flag']];
  for (const l of res.cost.lines) rows.push(['cost', l.id, l.label, l.amountUsd, 'USD', l.recoverable ? 'RECOVERABLE' : l.status]);
  rows.push(['summary', '', 'All-in landed cost', res.cost.allInCost, 'USD', '']);
  rows.push(['summary', '', 'Landed cost/MT', res.price.landedCostPerMT, 'USD/MT', '']);
  rows.push(['summary', '', 'Ex-ship price/MT', res.price.exShipPricePerMT, 'USD/MT', res.price.exShipStatus]);
  rows.push(['summary', '', 'Recoverable VAT', res.cost.recoverableVat.recoverable, 'USD', 'timing only']);
  rows.push(['profit', '', 'Standalone profit', res.profit.standaloneProfit, 'USD', '']);
  rows.push(['profit', '', 'Margin foregone', res.profit.marginForegone, 'USD', '']);
  rows.push(['profit', '', 'Adjusted profit', res.profit.adjustedProfit, 'USD', '']);
  rows.push(['profit', '', 'Partner cash profit share', res.profit.partnerCashProfitShare, 'USD', '']);
  rows.push(['profit', '', 'TIS net profit', res.profit.tisNetProfit, 'USD', '']);
  // partnerDelivers.productReceived is TIS-self-funded-absent (no partner => no in-kind product) and
  // its value field is named differently per flow: equity-partner.js -> valuedAtLandedCost,
  // trade.js -> valuedAtExShipLandedCost (same fallback pattern as report-renderer.js's headerSection).
  const pd = res.partnerDelivers || {};
  const pr = pd.productReceived;
  const cr = pd.cashReceived;
  rows.push(['partner', '', 'Product received (MT)', pr ? pr.tonnes : 'N/A', pr ? 'MT' : '', '']);
  rows.push(['partner', '', 'Product value', pr ? (pr.valuedAtExShipLandedCost ?? pr.valuedAtLandedCost) : 'N/A', pr ? 'USD' : '', '']);
  rows.push(['partner', '', 'Cash profit share', cr ? cr.profitShare : 'N/A', cr ? 'USD' : '', '']);

  const csv = rows.map((r) => r.map((c) => (typeof c === 'string' && c.includes(',') ? `"${c}"` : c)).join(',')).join('\n');
  const file = path.join(outDir, `${res.meta.tradeId}.csv`);
  fs.writeFileSync(file, csv, 'utf8');
  console.log(`\nCSV exported (Excel-compatible): ${file}`);
}

function exportHtml(res, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const { renderDealSheet } = require('./engine/report/html');
  const file = path.join(outDir, `${res.meta.tradeId}.html`);
  fs.writeFileSync(file, renderDealSheet(res), 'utf8');
  console.log(`\nHTML deal sheet: ${file}`);
}

function exportTermSheet(res, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const { buildTermSheet } = require('./engine/report/termsheet');
  const file = path.join(outDir, `${res.meta.tradeId}-termsheet.html`);
  fs.writeFileSync(file, buildTermSheet(res), 'utf8');
  console.log(`\nTerm sheet: ${file} (open in browser to print/save as PDF)`);
}

// ---------------------------------------------------------------- help
function printHelp() {
  console.log(`TIS trading model
Usage: node run.js [tradeFile.json] [flags]

  default tradeFile: trades/reference-trade-001.json

Flags:
  --with-surcharge   enable the 5% fossil-fuel surcharge (default OFF, pending Gazette)
  --upside           use deliveredQtyUpsideMT (+5% seller option)
  --compare-fx       print NAFEM vs parallel FX comparison
  --compare-hedge    print hedge route A vs B comparison
  --ladder           print the cost-plus pricing ladder (advisory price guidance)
  --export csv       write an Excel-compatible CSV to out/
  -h, --help         this help`);
}

// ---------------------------------------------------------------- main
function main() {
  const { flags, tradeFile } = parseCli();
  if (flags.help) return printHelp();

  const file = tradeFile || path.join(__dirname, 'trades', 'reference-trade-001.json');
  const trade = loadTrade(file);

  // Apply flags to the trade object
  if (flags['with-surcharge']) trade.tax.surcharge.enabled = true;
  const opts = {};
  if (flags.upside) opts.deliveredQtyOverride = trade.cargo.deliveredQtyUpsideMT;

  const compute = FLOWS[trade.meta.flow];
  if (!compute) throw new Error(`Unknown flow '${trade.meta.flow}'. Known: ${Object.keys(FLOWS).join(', ')}`);

  let res;
  try {
    res = compute(trade, opts);
  } catch (err) {
    console.error(`\n[flow '${trade.meta.flow}' error] ${err.message}\n`);
    process.exit(1);
  }

  // FX sensitivity runs on the NAFEM lever (RULE 1, 2026-06-23): NAFEM drives naira P&L, so a NAFEM bump
  // is the live FX move. For all-USD trades (incl. the equity-partner / reference path, which has no naira
  // legs) it is a $0 no-op, preserving the verified reference-trade output byte-for-byte.
  const isUnified = res.channels !== undefined && res.revenue !== undefined;
  const sensOptions = isUnified ? { fxMode: 'nafem' } : {};
  res.sensitivities = runSensitivities(trade, (t) => compute(t, opts), sensOptions);

  if (isUnified) printTradeReport(res, trade, flags);
  else printReport(res, trade, flags);
  if (flags['compare-fx']) printFxComparison(trade, res);
  if (flags['compare-hedge']) printHedgeComparison(trade, res);
  if (flags.ladder) printLadder(buildLadder(trade, (t) => compute(t, opts), res), trade);
  if (flags.export === 'csv') exportCsv(res, path.join(__dirname, 'out'));
  if (flags.export === 'html') exportHtml(res, path.join(__dirname, 'out'));
  if (flags.export === 'termsheet') exportTermSheet(res, path.join(__dirname, 'out'));
}

main();
