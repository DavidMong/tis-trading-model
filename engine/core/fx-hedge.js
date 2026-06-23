'use strict';

const { round } = require('./rounding');

// FX hedge on the naira leg(s) — mirrors the ICE hedge (engine/core/hedge.js).
// Hedges a configurable portion of the NET naira exposure (naira revenue - naira cost, in NGN) at a
// locked forward USD/NGN rate tied to a NAMED BENCHMARK (NAFEM forward / offshore NDF). The unhedged
// remainder floats at NAFEM (RULE 1, 2026-06-23): naira proceeds settle to USD at NAFEM, so the
// unhedged economic baseline is the NAFEM rate (the parallel rate is reference / display only).
//
//   Route A 'bank_book'   : bank books it -> cost = spread only (+ per-USD fee).
//   Route B 'third_party' : bank PROVIDES margin as financing (margin = initialMarginPct x USD notional)
//                           -> margin interest + broker fee. Bank-provided, never partner equity.
//   Comparison is apples-to-apples on the NET naira exposure basis; hedge beyond exposure is a separate
//   speculative position (overHedge), excluded from the comparison.
//
// BASIS RISK (explicit, never hidden): the economic exposure settles at NAFEM (RULE 1), and the hedge
// settles against the BENCHMARK forward (NAFEM/NDF). A benchmark-based hedge does NOT perfectly offset the
// NAFEM settlement; the benchmark<->NAFEM basis is a residual that is surfaced and flagged. Parallel is
// reference/display only and drives nothing in the hedge.
//
// PLACEHOLDERS (flag + verify before any live hedge): forwardRate, benchmark, feePerUsd, initialMarginPct,
// tenorDays, brokerFee, spreadPerUsd.

function buildFxHedge(trade, ctx) {
  const h = trade.fxHedge || {};
  const exposureNgn = ctx.netNairaNgn || 0; // net naira receivable (revenue - naira cost), in NGN
  const parallelPricing = ctx.parallelPricing; // reference / display only — drives no P&L
  const parallelPayment = ctx.parallelPayment; // reference / display only — drives no P&L
  const nafemRate = ctx.nafemRate; // economic conversion of unhedged naira proceeds (RULE 1)

  const enabled = !!h.fxHedged;
  const hasExposure = Math.abs(exposureNgn) > 1e-6 && nafemRate > 0;

  // Benchmark forward rate (placeholder ~ NAFEM/NDF forward). When unset for a real (exposed) hedge it
  // defaults to the NAFEM settlement rate — never the parallel rate, so parallel drives nothing in the
  // hedge (RULE 1). For a no-exposure trade the hedge is inert; the default stays at the parallel
  // reference there purely so all-USD output stays byte-for-byte unchanged.
  const benchmark = h.benchmark || 'NAFEM forward';
  const forwardRate = h.forwardRate != null ? h.forwardRate : (hasExposure ? nafemRate : parallelPricing);

  const ratio = h.hedgeRatio != null ? h.hedgeRatio : 1; // fraction of exposure hedged (default full)
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) {
    throw new Error(`Invalid fxHedge.hedgeRatio: must be >= 0, got ${JSON.stringify(ratio)}`);
  }

  const requestedNgn = ratio * exposureNgn;
  // Apples-to-apples: hedge at most the exposure; excess is speculative over-hedge.
  const hedgedNgn = hasExposure ? Math.min(requestedNgn, exposureNgn) : 0;
  const overHedgeNgn = round(Math.max(requestedNgn - exposureNgn, 0), 2);
  const unhedgedNgn = round(exposureNgn - hedgedNgn, 2);

  if (hasExposure && !(typeof forwardRate === 'number' && Number.isFinite(forwardRate) && forwardRate > 0)) {
    throw new Error(`Invalid fxHedge.forwardRate: must be > 0, got ${JSON.stringify(forwardRate)}`);
  }

  // USD outcomes on the net naira exposure basis. Unhedged naira converts at NAFEM (RULE 1, the
  // economic settlement rate); only the hedged portion locks at the benchmark forward.
  const floatingUsd = hasExposure ? exposureNgn / nafemRate : 0; // all unhedged -> floats at NAFEM
  const hedgedUsd = hasExposure ? hedgedNgn / forwardRate + unhedgedNgn / nafemRate : 0;
  const fxRealizedDeltaUsd = round(hedgedUsd - floatingUsd, 2); // realized P&L difference from hedging
  const usdNotional = hasExposure ? hedgedNgn / forwardRate : 0; // USD amount hedged

  // Route economics (mirror ICE hedge)
  const route = { type: h.route || 'bank_book', initialMargin: 0, bankProvidedMargin: 0, marginInterest: 0, brokerFee: 0, spread: 0 };
  const feeUsd = (h.feePerUsd || 0) * usdNotional; // per-USD fee, both routes
  if (route.type === 'bank_book') {
    route.spread = (h.spreadPerUsd || 0) * usdNotional;
  } else if (route.type === 'third_party') {
    const initialMargin = (h.initialMarginPct || 0) * usdNotional; // bank-provided, NOT partner equity
    const dayCountBasis = (trade.financing && trade.financing.dayCountBasis) || 365;
    const tenorDays = h.tenorDays || (trade.financing && trade.financing.financingDays) || 0;
    route.initialMargin = round(initialMargin, 2);
    route.bankProvidedMargin = round(initialMargin, 2);
    route.marginInterest = round((initialMargin * (trade.financing ? trade.financing.creditRate : 0) * tenorDays) / dayCountBasis, 2);
    route.brokerFee = h.brokerFee || 0;
  } else {
    throw new Error(`buildFxHedge: unknown route '${route.type}' (expected 'bank_book' or 'third_party')`);
  }
  const extraFinancingCost = round(route.marginInterest + route.brokerFee + route.spread + feeUsd, 2);

  // BASIS RISK — benchmark forward vs the NAFEM settlement rate (RULE 1, 2026-06-23). NAFEM is the rate
  // the unhedged naira proceeds actually settle at and the rate the hedge is meant to protect, so the
  // uncovered basis is the forward<->NAFEM gap on the hedged notional — NOT forward<->parallel. Parallel
  // is reference/display only and drives nothing here. The gap is gated on exposure so a no-naira trade
  // (no FX exposure) shows a zero basis (forwardRate there defaults to a reference rate, not a real hedge).
  const gapNgnPerUsd = hasExposure ? round(forwardRate - nafemRate, 4) : 0;
  const residualBasisUsd = hasExposure
    ? round(hedgedNgn * (1 / forwardRate - 1 / nafemRate), 2)
    : 0;

  return {
    enabled,
    benchmark,
    hasExposure,
    exposureNgn: round(exposureNgn, 2),
    hedgeRatio: ratio,
    hedgedNgn: round(hedgedNgn, 2),
    unhedgedNgn,
    overHedgeNgn,
    forwardRate,
    parallelPricing,
    parallelPayment,
    usdNotional: round(usdNotional, 2),
    floatingUsd: round(floatingUsd, 2),
    hedgedUsd: round(hedgedUsd, 2),
    fxRealizedDeltaUsd, // hedged - floating (the realized P&L effect when toggle is ON)
    routeEconomics: route,
    bankProvidedMargin: route.bankProvidedMargin,
    extraFinancingCost,
    basis: {
      benchmark,
      forwardRate,
      // basis is measured against the NAFEM settlement rate (RULE 1); read it from fx.rates.nafemReference.
      // No nafemRate field is added here — that would change the output shape of all-USD trades, which must
      // stay byte-for-byte identical. parallelRate stays as a street-reference display value (drives nothing).
      parallelRate: parallelPricing, // street reference, display only — drives nothing
      gapNgnPerUsd, // forward (benchmark) - NAFEM (settlement)
      residualBasisUsd, // uncovered benchmark<->NAFEM basis on the hedged notional
      note: `Hedge settles against ${benchmark}, NOT the NAFEM settlement rate. The benchmark<->NAFEM basis `
        + `(${gapNgnPerUsd} NGN/USD) is residual and uncovered — the hedge does NOT fully cover NAFEM exposure.`,
    },
    placeholders: {
      forwardRate: { value: forwardRate, note: 'PLACEHOLDER ~ NAFEM/NDF forward — confirm with bank/broker' },
      feePerUsd: h.feePerUsd ?? null,
      initialMarginPct: h.initialMarginPct ?? null,
      tenorDays: h.tenorDays ?? null,
    },
    status: 'PLACEHOLDER (verify forward / benchmark / fee / margin / tenor before live hedge)',
  };
}

module.exports = { buildFxHedge };
