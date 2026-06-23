'use strict';

const { round } = require('./rounding');

// FX hedge on the naira leg(s) — mirrors the ICE hedge (engine/core/hedge.js).
// Hedges a configurable portion of the NET naira exposure (naira revenue - naira cost, in NGN) at a
// locked forward USD/NGN rate tied to a NAMED BENCHMARK (NAFEM forward / offshore NDF). The unhedged
// remainder floats at NAFEM (RULE 1, 2026-06-23): naira proceeds settle to USD at NAFEM, so the
// unhedged economic baseline is the NAFEM rate (the parallel rate is reference / basis only).
//
//   Route A 'bank_book'   : bank books it -> cost = spread only (+ per-USD fee).
//   Route B 'third_party' : bank PROVIDES margin as financing (margin = initialMarginPct x USD notional)
//                           -> margin interest + broker fee. Bank-provided, never partner equity.
//   Comparison is apples-to-apples on the NET naira exposure basis; hedge beyond exposure is a separate
//   speculative position (overHedge), excluded from the comparison.
//
// BASIS RISK (explicit, never hidden): the economic exposure is on PARALLEL, but the hedge settles
// against the BENCHMARK (NAFEM/NDF). A benchmark-based hedge does NOT perfectly offset parallel-rate
// exposure; the benchmark<->parallel basis is a residual that is surfaced and flagged.
//
// PLACEHOLDERS (flag + verify before any live hedge): forwardRate, benchmark, feePerUsd, initialMarginPct,
// tenorDays, brokerFee, spreadPerUsd.

function buildFxHedge(trade, ctx) {
  const h = trade.fxHedge || {};
  const exposureNgn = ctx.netNairaNgn || 0; // net naira receivable (revenue - naira cost), in NGN
  const parallelPricing = ctx.parallelPricing; // reference / basis-risk rate only
  const parallelPayment = ctx.parallelPayment; // reference / basis-risk rate only
  const nafemRate = ctx.nafemRate; // economic conversion of unhedged naira proceeds (RULE 1)

  const enabled = !!h.fxHedged;
  const hasExposure = Math.abs(exposureNgn) > 1e-6 && nafemRate > 0;

  // Benchmark forward rate (placeholder ~ NAFEM/NDF forward). Defaults to parallel pricing if absent.
  const benchmark = h.benchmark || 'NAFEM forward';
  const forwardRate = h.forwardRate != null ? h.forwardRate : parallelPricing;

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

  // BASIS RISK — benchmark forward vs the PARALLEL street reference. Surfaced as an explicit residual:
  // the hedge settles at the benchmark forward, which differs from the parallel street rate. (P&L now
  // books unhedged naira at NAFEM per RULE 1; this benchmark<->parallel basis is the separately-shown
  // street residual, kept on the parallel reference so the desk still sees the forward-vs-street gap.)
  const gapNgnPerUsd = round(forwardRate - parallelPricing, 4);
  const residualBasisUsd = hasExposure
    ? round(hedgedNgn * (1 / forwardRate - 1 / parallelPricing), 2)
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
      parallelRate: parallelPricing,
      gapNgnPerUsd, // forward (benchmark) - parallel
      residualBasisUsd, // uncovered benchmark<->parallel basis on the hedged notional
      note: `Hedge settles against ${benchmark}, NOT the parallel rate. The benchmark<->parallel basis `
        + `(${gapNgnPerUsd} NGN/USD) is residual and uncovered — the hedge does NOT fully cover parallel exposure.`,
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
