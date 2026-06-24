'use strict';

// Browser bundle entry point — re-exports the pure engine functions the interactive UI needs.
// Bundled by esbuild into an IIFE (window.TISEngine). No Node built-ins are used in any imported file.

const { computeTrade }    = require('../engine/flows/trade');
const { runSensitivities } = require('../engine/core/sensitivities');
const { buildLadder } = require('../engine/core/pricing-ladder');
const { resolveStorageCostLines } = require('../engine/core/storage-collect');
const { generateHtml } = require('./report-renderer');

module.exports = { computeTrade, runSensitivities, buildLadder, resolveStorageCostLines, generateHtml };
