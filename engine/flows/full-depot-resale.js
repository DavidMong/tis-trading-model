'use strict';

// Full depot-resale flow — STUB (not built).
// Planned: cargo discharged to depot then resold ex-storage.
// Enables depot (trade.depot.enabled = true) so storage cost lines 25-28 become active and
// ex-storage landed cost > ex-ship landed cost. Adds the "depot sold at cost" downside sensitivity.
// Reuses the same core: financing, cost-buildup, tax, hedge, sensitivities.

function computeFullDepotResale() {
  throw new Error(
    "full-depot-resale flow not implemented yet (stub). Planned: enable depot; storage lines 25-28 active; ex-storage landed > ex-ship; depot-sold-at-cost downside."
  );
}

module.exports = { computeFullDepotResale };
