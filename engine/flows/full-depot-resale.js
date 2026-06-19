'use strict';

// Full depot-resale flow. Now implemented on the unified engine (engine/flows/trade.js).
// A depot trade simply sets channels.depotPct > 0 (and typically equityProvider 'TIS', currencyMode 'NGN').
// Kept as a named entry point so trade.meta.flow = 'full-depot-resale' routes here.
const { computeTrade } = require('./trade');

function computeFullDepotResale(trade, opts) {
  return computeTrade(trade, opts);
}

module.exports = { computeFullDepotResale };
