'use strict';

const { round } = require('./rounding');

// Cost-line build-up. Rebuilt from inputs every run — NO amount is hardcoded.
// Each line: { id, label, category, base, rate, currency, amountUsd, recoverable, status, legalRef }
//
// Categories (drivers):
//   per_mt            : rate x deliveredQty
//   derived_freight   : TC rate x days
//   pct_of_freight    : rate x freightBase (TC hire + demurrage)
//   pct_of_cargo_value: rate x cargo FOB value
//   pct_of_services   : rate x servicesBucket (configurable named line ids)
//   pct_of_LC         : rate x bank LC
//   derived_financing : drawn principal x rate x days/365
//   flat              : fixed amount (does NOT scale with deliveredQty)
//   storage           : depot legs only (=0 when no depot)
//
// Recoverable input VAT (lines 12 freight, 13 services) is EXCLUDED from landed cost — it is a
// cash-flow timing item only (Nigeria Tax Act 2025 s.155(4)), surfaced in the recoverable-VAT block.

function buildCostBuildup(trade, ctx) {
  const { cargoValue, deliveredQty, financing } = ctx;
  const c = trade.costLines;
  const tax = trade.tax;
  // Storage is active for DEPOT volume only. Channel-driven (ctx.depotTonnes) with a legacy
  // trade.depot.enabled fallback. Depot operational costs (throughput, tank rental) are naira-paid
  // and converted to USD-equivalent at the PARALLEL payment rate, carrying their own FX exposure.
  const depotTonnes = ctx.depotTonnes || 0;
  const storageActive = depotTonnes > 0 || !!(trade.depot && trade.depot.enabled);
  const storageQty = depotTonnes > 0 ? depotTonnes : storageActive ? deliveredQty : 0;
  const unitFob = cargoValue / deliveredQty;
  const depotCargoValue = unitFob * storageQty;
  const parPay = ctx.parallelPayment;
  const ngnStorageToUsd = (ngn) => {
    if (!storageActive || !ngn) return 0;
    if (!(typeof parPay === 'number' && Number.isFinite(parPay) && parPay > 0)) {
      throw new Error(`buildCostBuildup: parallelPayment must be > 0 to convert naira depot costs, got ${parPay}`);
    }
    return ngn / parPay;
  };

  // Derived freight (3, 4) and freight base
  const tcHire = trade.freight.tcRatePerDay * trade.freight.charterDays; // 3
  const demurrage = trade.freight.tcRatePerDay * trade.freight.demurrageDays; // 4
  const freightBase = tcHire + demurrage;

  const L = (
    id,
    label,
    category,
    { base = null, rate = null, amount = null, currency = 'USD', recoverable = false, status = 'OK', legalRef = null, ngnAmount = null }
  ) => ({ id, label, category, base, rate, currency, amountUsd: round(amount, 2), ngnAmount: ngnAmount == null ? null : round(ngnAmount, 2), recoverable, status, legalRef });

  const lines = [];

  // 1,2 per_mt product
  lines.push(L(1, 'ICE LSGO', 'per_mt', {
    rate: trade.market.ice.value, base: deliveredQty, amount: trade.market.ice.value * deliveredQty,
    status: trade.market.ice.status || 'OK',
  }));
  lines.push(L(2, 'FOB premium', 'per_mt', {
    rate: trade.market.fobPremium.value, base: deliveredQty, amount: trade.market.fobPremium.value * deliveredQty,
  }));

  // 3,4 derived freight
  lines.push(L(3, 'TC hire', 'derived_freight', {
    rate: trade.freight.tcRatePerDay, base: trade.freight.charterDays, amount: tcHire,
    status: trade.freight.status || 'INDICATIVE',
  }));
  lines.push(L(4, 'Demurrage', 'derived_freight', {
    rate: trade.freight.tcRatePerDay, base: trade.freight.demurrageDays, amount: demurrage,
    status: trade.freight.status || 'INDICATIVE',
  }));

  // 5 per_mt
  lines.push(L(5, 'NPA cargo dues', 'per_mt', {
    rate: c.npaCargoDuesPerMT, base: deliveredQty, amount: c.npaCargoDuesPerMT * deliveredQty,
  }));

  // 6 flat
  lines.push(L(6, 'Port disbursement (DAs)', 'flat', { amount: c.portDAs }));

  // 7,8,9 pct_of_freight — maritime levies (non-NTA, COST)
  lines.push(L(7, 'NIMASA cabotage 2%', 'pct_of_freight', {
    rate: c.nimasaCabotagePct, base: freightBase, amount: c.nimasaCabotagePct * freightBase,
    status: 'CONFIRM', legalRef: 'NIMASA cabotage surcharge (non-NTA maritime levy)',
  }));
  lines.push(L(8, 'NIMASA gross freight levy 3%', 'pct_of_freight', {
    rate: c.nimasaFreightLevyPct, base: freightBase, amount: c.nimasaFreightLevyPct * freightBase,
    status: 'CONFIRM', legalRef: 'NIMASA gross freight levy (non-NTA maritime levy)',
  }));
  lines.push(L(9, 'SPOMO / CVFF 2%', 'pct_of_freight', {
    rate: c.spomoCvffPct, base: freightBase, amount: c.spomoCvffPct * freightBase,
    status: 'CONFIRM', legalRef: 'Cabotage Act CVFF 2% (non-NTA)',
  }));

  // 10 flat
  lines.push(L(10, 'NCS documentation', 'flat', { amount: c.ncsDocs }));

  // 11 WHT freight — COST, NOT recoverable. Rate status CONFIRM.
  // TAA 2025 s.51 ("Deduction at source") is the enabling section but states NO rate; the rate
  // lives in the Deduction-of-Tax-at-Source (Withholding) Regulations, which are not in the
  // attached statute. So 5% is INDICATIVE/unverified.
  lines.push(L(11, 'WHT on freight 5%', 'pct_of_freight', {
    rate: tax.whtFreightRate, base: freightBase, amount: tax.whtFreightRate * freightBase,
    recoverable: false, status: 'CONFIRM',
    legalRef: 'TAA 2025 s.51 (Deduction at source); rate per Deduction-of-Tax-at-Source Regs — UNVERIFIED',
  }));

  // 12 VAT freight — RECOVERABLE input VAT (timing only)
  lines.push(L(12, 'VAT on freight 7.5% (recoverable)', 'pct_of_freight', {
    rate: tax.vatRate, base: freightBase, amount: tax.vatRate * freightBase,
    recoverable: true, status: 'OK',
    legalRef: 'Nigeria Tax Act 2025 s.147; recoverable input VAT s.155(4)',
  }));

  // 14 pct_of_cargo_value
  lines.push(L(14, 'Marine insurance ICC(A) 0.125%', 'pct_of_cargo_value', {
    rate: c.marineIccPct, base: cargoValue, amount: c.marineIccPct * cargoValue,
    status: 'INDICATIVE', legalRef: 'Commercial cover (not statutory)',
  }));

  // 15,16 flat (services that feed the VAT-services bucket)
  lines.push(L(15, 'SGS inspection', 'flat', { amount: c.sgsInspection }));
  lines.push(L(16, 'Port agency', 'flat', { amount: c.portAgency }));

  // 17 pct_of_cargo_value
  lines.push(L(17, 'Allocated security 0.029%', 'pct_of_cargo_value', {
    rate: c.allocSecurityPct, base: cargoValue, amount: c.allocSecurityPct * cargoValue,
    status: 'INDICATIVE',
  }));

  // 18 pct_of_LC
  lines.push(L(18, 'LC issuance fee', 'pct_of_LC', {
    rate: trade.financing.lcFeePct, base: financing.lc, amount: financing.lcFee, status: 'INDICATIVE',
  }));

  // 19,20 derived_financing
  lines.push(L(19, 'Credit interest (LC)', 'derived_financing', {
    rate: financing.creditRate, base: financing.lc, amount: financing.creditInterest, status: 'INDICATIVE',
  }));
  lines.push(L(20, 'WC interest', 'derived_financing', {
    rate: financing.creditRate, base: financing.wc, amount: financing.wcInterest, status: 'INDICATIVE',
  }));

  // 21,22,23,24 flat
  lines.push(L(21, 'Bank charges', 'flat', { amount: c.bankCharges }));
  lines.push(L(22, 'Overhead', 'flat', { amount: c.overhead }));
  lines.push(L(23, 'Contingency', 'flat', { amount: c.contingency }));
  lines.push(L(24, 'Collateral manager', 'flat', { amount: c.collateralManager }));

  // 25-28 storage (depot volume only; =0 otherwise).
  // 25 throughput, 26 tank/storage rental: NAIRA-paid -> converted to USD at parallel (FX-exposed).
  // 27 evaporation, 28 tank insurance: USD, % of depot cargo value (INFERRED base).
  const throughputNgn = storageActive ? (c.throughputNgnPerMT || 0) * storageQty : 0;
  const rentalNgn = storageActive ? c.storageRentalNgn || 0 : 0;
  lines.push(L(25, 'Throughput', 'storage', {
    rate: c.throughputNgnPerMT, base: storageActive ? storageQty : 0, currency: storageActive ? 'NGN' : 'USD',
    amount: ngnStorageToUsd(throughputNgn), ngnAmount: storageActive ? throughputNgn : null,
    status: storageActive ? 'NGN->USD @ parallel (FX-exposed)' : 'OK',
  }));
  lines.push(L(26, 'Storage rental', 'storage', {
    currency: storageActive ? 'NGN' : 'USD', amount: ngnStorageToUsd(rentalNgn), ngnAmount: storageActive ? rentalNgn : null,
    status: storageActive ? 'NGN->USD @ parallel (FX-exposed)' : 'OK',
  }));
  lines.push(L(27, 'Evaporation 0.125%', 'storage', {
    rate: c.evaporationPct, base: storageActive ? depotCargoValue : 0, amount: storageActive ? c.evaporationPct * depotCargoValue : 0,
    status: storageActive ? 'INFERRED base' : 'OK',
  }));
  lines.push(L(28, 'Tank insurance 0.05%', 'storage', {
    rate: c.tankInsurancePct, base: storageActive ? depotCargoValue : 0, amount: storageActive ? c.tankInsurancePct * depotCargoValue : 0,
    status: storageActive ? 'INFERRED base' : 'OK',
  }));

  // 13 VAT services — base = configurable servicesBucket (named line ids). INFERRED composition.
  const byIdPre = Object.fromEntries(lines.map((l) => [l.id, l]));
  const bucketIds = trade.servicesBucket;
  const bucketComposition = bucketIds.map((id) => ({ id, label: byIdPre[id].label, amount: byIdPre[id].amountUsd }));
  const servicesBucketSum = bucketComposition.reduce((s, x) => s + x.amount, 0);
  lines.push(L(13, 'VAT on services 7.5% (recoverable)', 'pct_of_services', {
    rate: tax.vatRate, base: servicesBucketSum, amount: tax.vatRate * servicesBucketSum,
    recoverable: true, status: 'CONFIRM',
    legalRef: 'Nigeria Tax Act 2025 s.147; recoverable s.155(4); INFERRED base composition',
  }));

  lines.sort((a, b) => a.id - b.id);
  const byId = Object.fromEntries(lines.map((l) => [l.id, l]));

  // Input VAT apportionment (s.155(4) proviso (a)): only the taxable-supply proportion is recoverable.
  const recoverableLines = lines.filter((l) => l.recoverable);
  const grossRecoverable = recoverableLines.reduce((s, l) => s + l.amountUsd, 0);
  const recoverableVat = round(grossRecoverable * tax.taxableSupplyProportion, 2);
  // The NON-recoverable proportion of input VAT is irrecoverable -> it is a real COST.
  const irrecoverableVat = round(grossRecoverable * (1 - tax.taxableSupplyProportion), 2);

  // Landed cost EXCLUDES the recoverable proportion of input VAT (timing only) but INCLUDES the
  // irrecoverable proportion (a genuine cost when taxableSupplyProportion < 1).
  // Split base (cargo/freight/levies/financing) from storage so we can expose two landed bases:
  //   ex-ship landed (base, EXCLUDES storage) and depot landed (base + storage / depot tonnes).
  const storageTotal = round(lines.filter((l) => l.category === 'storage').reduce((s, l) => s + l.amountUsd, 0), 2);
  const baseNonRecoverable = lines
    .filter((l) => !l.recoverable && l.category !== 'storage')
    .reduce((s, l) => s + l.amountUsd, 0);
  const baseAllIn = round(baseNonRecoverable + irrecoverableVat, 2);
  const allInCost = round(baseAllIn + storageTotal, 2);
  const landedCostPerMT = allInCost / deliveredQty; // kept for computeEquityPartner compatibility
  const exShipLandedPerMT = baseAllIn / deliveredQty; // EXCLUDES storage
  const depotLandedPerMT = depotTonnes > 0 ? exShipLandedPerMT + storageTotal / depotTonnes : exShipLandedPerMT;

  return {
    lines,
    byId,
    freight: { tcHire: round(tcHire, 2), demurrage: round(demurrage, 2), freightBase: round(freightBase, 2) },
    servicesBucket: { ids: bucketIds, composition: bucketComposition, sum: round(servicesBucketSum, 2) },
    recoverableVat: {
      lines: recoverableLines.map((l) => ({ id: l.id, label: l.label, amount: l.amountUsd })),
      taxableSupplyProportion: tax.taxableSupplyProportion,
      grossRecoverable: round(grossRecoverable, 2),
      recoverable: recoverableVat,
      irrecoverable: irrecoverableVat, // added to landed cost (s.155(4) proviso (a))
    },
    allInCost,
    landedCostPerMT,
    baseAllIn,
    storageTotal,
    exShipLandedPerMT, // base landed, EXCLUDES storage
    depotLandedPerMT, // base + storage / depot tonnes (INCLUDES storage)
    depotTonnes,
    storageActive,
  };
}

module.exports = { buildCostBuildup };
