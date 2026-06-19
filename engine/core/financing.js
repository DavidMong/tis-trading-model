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

  const performanceBond = bondPct * cargoValue; // first-loss, to supplier
  const equity = equityPct * cargoValue;
  const partnerFunding = partnerPct * cargoValue; // returnable principal (bond + equity)
  const lc = lcPct * cargoValue; // bank letter of credit
  const wc = f.wcSublimit; // working-capital sublimit (non-cargo costs)
  const netAdvance = lc + wc;

  const rate = f.creditRate;
  const days = f.financingDays;
  const lcFee = f.lcFeePct * lc; // cost line 18
  const creditInterest = (lc * rate * days) / 365; // cost line 19
  const wcInterest = (wc * rate * days) / 365; // cost line 20

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
    capitalLockupDays: f.capitalLockupDays,
    advanceRate: f.advanceRate,
    check: {
      fundingStackPctOfCargo: bondPct + equityPct + lcPct, // must equal 1.0
    },
  };
}

module.exports = { buildFinancing };
