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

module.exports = { resolveRate, chooseRate, ngnToUsd };
