'use strict';

// Straight ex-ship resale flow — STUB (not built).
// Planned: no equity partner. TIS buys the full cargo and resells it ex-ship.
// Reuses the same core: financing, cost-buildup, tax, hedge, sensitivities.
// Differences vs equity-partner: no partner principal / no in-kind split / no margin-foregone;
// full deliveredQty is TIS-retained, so adjustedProfit == standaloneProfit.

function computeStraightExship() {
  throw new Error(
    "straight-exship flow not implemented yet (stub). Planned: no partner; full cargo sold ex-ship by TIS; reuse cost-buildup/tax/hedge/sensitivities core."
  );
}

module.exports = { computeStraightExship };
