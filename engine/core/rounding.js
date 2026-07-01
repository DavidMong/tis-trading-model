'use strict';

// Rounding helpers.
// HARD RULE: never round prices or rates in TIS's favour. Quantities only.
// All P&L is computed in full precision; rounding is applied at presentation/cash-settlement.

function round(x, dp = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return x;
  const f = 10 ** dp;
  // Doubles carry ~15-17 significant decimal digits; representation noise from the x*f
  // multiplication lands past the 15th. toPrecision(15) strips that noise (relative to the
  // value's own magnitude) before rounding, so exact .xx5 boundaries round correctly at ANY
  // financial magnitude — unlike a fixed +Number.EPSILON nudge, which is only large enough to
  // matter for values near magnitude 1 and is a no-op at real (hundreds/thousands+) magnitudes.
  return Math.round(Number((x * f).toPrecision(15))) / f;
}

// Money rounded to 2 dp for display / cash settlement.
const money = (x) => round(x, 2);

// Paper (documentary) quantities: nearest `step` MT, rounded in TIS's favour.
//   partner -> rounds DOWN, TIS -> rounds UP.
// Documentary only. NEVER used to drive P&L (economic tonnes do that).
function paperQtyFavorTIS(qty, side, step = 50) {
  if (side === 'partner') return Math.floor(qty / step) * step;
  if (side === 'tis') return Math.ceil(qty / step) * step;
  throw new Error(`paperQtyFavorTIS: side must be 'partner' or 'tis', got '${side}'`);
}

// Round a hedged volume to whole ICE Gasoil lots (default 100 MT/lot).
function roundToLots(volumeMT, lotSize = 100) {
  const lots = Math.round(volumeMT / lotSize);
  return { lots, tonnes: lots * lotSize };
}

module.exports = { round, money, paperQtyFavorTIS, roundToLots };
