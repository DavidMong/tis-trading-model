'use strict';

// FX resolution. Two markets: NAFEM (official) + parallel. Each leg carries
// value / source / asOf / override. An explicit override always wins over the marked value.
//
// FX bites ONLY on naira-denominated legs (and depot legs priced in NGN). A trade whose
// cost lines are all USD has ZERO FX exposure — see cost-buildup.js (line.currency) and
// sensitivities.js (FX scenario returns $0 when there are no NGN legs).

function resolveRate(fxLeg) {
  if (!fxLeg) return null;
  const usedOverride = fxLeg.override !== null && fxLeg.override !== undefined;
  const effective = usedOverride ? fxLeg.override : fxLeg.value;
  return {
    effective,
    value: fxLeg.value,
    source: fxLeg.source,
    asOf: fxLeg.asOf,
    override: fxLeg.override ?? null,
    usedOverride,
    status: fxLeg.status || 'INDICATIVE',
  };
}

// Choose a market (default NAFEM) and optionally bump it (for sensitivities).
function chooseRate(fx, market = 'nafem', bump = 0) {
  const r = resolveRate(fx?.[market]);
  if (!r) return null;
  return { ...r, market, effective: r.effective * (1 + bump) };
}

// Convert an NGN amount to USD at a chosen NGN/USD rate.
function ngnToUsd(amountNgn, ratePerUsd) {
  if (!ratePerUsd) throw new Error('ngnToUsd: missing FX rate');
  return amountNgn / ratePerUsd;
}

// Resolve the economic (PARALLEL) and reference (NAFEM) rates for a trade.
//   - PARALLEL drives ALL P&L conversions.
//   - NAFEM is reference / reconciliation only — never used in P&L.
// fxBump models the PAYMENT-date parallel rate deviating from the PRICING-date parallel rate
// (the +/-10% FX sensitivity). A naira receivable/payable fixed at pricing is revalued at payment.
function resolveFxRates(trade, fxBump = 0) {
  const parallel = resolveRate(trade.fx && trade.fx.parallel);
  const nafem = resolveRate(trade.fx && trade.fx.nafem);
  const parallelPricing = parallel ? parallel.effective : null;
  const parallelPayment = parallelPricing != null ? parallelPricing * (1 + fxBump) : null;
  return {
    parallel,
    nafem,
    parallelPricing,
    parallelPayment,
    nafemReference: nafem ? nafem.effective : null,
    fxBump,
    fxIncidence: (trade.fx && trade.fx.fxIncidence) || 'TIS',
  };
}

// Ex-ship leg currency split. The depot leg is ALWAYS naira and handled separately.
function exShipCurrencyShares(trade) {
  const mode = (trade.sell && trade.sell.currencyMode) || 'USD';
  let usdShare;
  if (mode === 'USD') usdShare = 1;
  else if (mode === 'NGN') usdShare = 0;
  else if (mode === 'split') {
    usdShare = trade.sell.splitUsdPct;
    if (typeof usdShare !== 'number' || !Number.isFinite(usdShare) || usdShare < 0 || usdShare > 1) {
      throw new Error(`Invalid sell.splitUsdPct for split mode: must be within [0,1], got ${JSON.stringify(usdShare)}`);
    }
  } else throw new Error(`Invalid sell.currencyMode '${mode}' (expected USD | NGN | split)`);
  return { mode, usdShare, nairaShare: 1 - usdShare };
}

module.exports = { resolveRate, chooseRate, ngnToUsd, resolveFxRates, exShipCurrencyShares };
