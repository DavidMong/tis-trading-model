'use strict';

// Straight ex-ship resale flow. Now implemented on the unified engine (engine/flows/trade.js).
// A straight ex-ship trade sets channels.exShipPct = 1 and equityProvider 'TIS' (no partner split).
// Kept as a named entry point so trade.meta.flow = 'straight-exship' routes here.
const { computeTrade } = require('./trade');

function computeStraightExship(trade, opts) {
  return computeTrade(trade, opts);
}

module.exports = { computeStraightExship };
