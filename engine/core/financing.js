'use strict';

// Funding & financing. Every amount is derived from cargo value and rate inputs — none hardcoded.
//
// Funding stack (of CARGO FOB value):
//   performance bond 5%  (to supplier, first-loss)
// + equity            20%
// + bank LC           75%
// = 100%
// Partner total funding = bond + equity = 25%  (this is the partner's returnable principal).
// Non-cargo costs are funded by the WC sublimit (bank-provided), NOT partner equity.
// Bank also provides any swap margin (third-party hedge route) — never partner equity.
//
// All financing interest = drawn principal x rate x days / 365.

function buildFinancing(trade, cargoValue) {
  const f = trade.financing;
  const p = trade.partner;

  const bondPct = p.bondPct ?? 0.05;
  const equityPct = p.equityPct ?? 0.20;
  const partnerPct = p.totalFundingPct ?? bondPct + equityPct; // 25%
  const lcPct = f.lcPctOfCargo ?? 0.75;

  // Equity ratio is fully configurable; the funding stack must close to 100% of cargo value.
  // A change in bank terms (e.g. advanceRate 0.75 -> 0.80) re-flows equity, LC, interest and returns.
  if (Math.abs(bondPct + equityPct + lcPct - 1) > 1e-9) {
    throw new Error(
      `Invalid funding stack: bondPct (${bondPct}) + equityPct (${equityPct}) + lcPctOfCargo (${lcPct}) must sum to 1.0, got ${bondPct + equityPct + lcPct}`
    );
  }

  const performanceBond = bondPct * cargoValue; // first-loss, to supplier
  const equity = equityPct * cargoValue;
  const partnerFunding = partnerPct * cargoValue; // returnable principal (bond + equity)
  const lc = lcPct * cargoValue; // bank letter of credit
  const wc = f.wcSublimit; // working-capital sublimit (non-cargo costs)
  const netAdvance = lc + wc;

  const rate = f.creditRate;
  const days = f.financingDays;
  const dayCountBasis = f.dayCountBasis ?? 365; // Actual/365 (default) vs Actual/360 — configurable
  const lcFee = f.lcFeePct * lc; // cost line 18
  const creditInterest = (lc * rate * days) / dayCountBasis; // cost line 19
  const wcInterest = (wc * rate * days) / dayCountBasis; // cost line 20

  return {
    pct: { bondPct, equityPct, partnerPct, lcPct },
    performanceBond,
    equity,
    partnerFunding,
    lc,
    wc,
    netAdvance,
    lcFee,
    creditInterest,
    wcInterest,
    creditRate: rate,
    financingDays: days,
    dayCountBasis,
    capitalLockupDays: f.capitalLockupDays,
    advanceRate: f.advanceRate,
    check: {
      fundingStackPctOfCargo: bondPct + equityPct + lcPct, // must equal 1.0
    },
  };
}

module.exports = { buildFinancing };
