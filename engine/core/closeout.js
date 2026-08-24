'use strict';

const { round } = require('./rounding');
const deskMemory = require('./desk-memory');

// DEAL CLOSE-OUT — actuals vs model variance (calibration loop).
//
// After a deal reaches SETTLED, enter what ACTUALLY happened and diff it against the RECAP model
// run. Over time this converts estimated cost lines / FX / prices into YOUR calibrated reality.
//
//   actuals file (JSON):
//     { "tradeId": "TIS-JET-001",
//       "actuals": {
//         "deliveredQtyMT": 33210,
//         "purchasePriceUsdPerMT": 679.50,
//         "avgRealizedPriceUSDperMT": 761.20,
//         "allInCost": 24012000,
//         "freightBase": 1015000,
//         "nafemRate": 1512,
//         "costLineOverrides": { "3": 995000, "11": 48000 }
//       },
//       "notes": "Demurrage waived; supplier gave 210 MT free" }
//
// Variance = actual − model, with % of model and a direction flag. Cost lines compare too when
// the trade's cost build-up ids are supplied via the computed result.

function variance(label, model, actual, unit, opts = {}) {
  if (model == null && actual == null) return null;
  const delta = (actual ?? 0) - (model ?? 0);
  const pctOfModel = model ? (delta / Math.abs(model)) * 100 : null;
  // favorableWhen: 'higher' (revenue-like) or 'lower' (cost-like). Default lower (most lines are costs).
  const favorableWhen = opts.favorableWhen || 'lower';
  let verdict = 'FLAT';
  if (Math.abs(delta) > (opts.tolerance ?? 0)) {
    const good = favorableWhen === 'higher' ? delta > 0 : delta < 0;
    verdict = good ? 'FAVORABLE' : 'UNFAVORABLE';
  }
  return {
    line: label, unit,
    model: model ?? null, actual: actual ?? null,
    delta: round(delta, 4),
    pctOfModel: pctOfModel != null ? Number(pctOfModel.toFixed(2)) : null,
    verdict,
  };
}

function closeOut(modelRes, actuals) {
  const A = actuals.actuals || {};
  const price = modelRes.price || {};
  const cost = modelRes.cost || {};
  const profit = modelRes.profit || {};
  const fx = modelRes.fx || {};

  const rows = [];
  rows.push(variance('Delivered qty', modelRes.meta.deliveredQty, A.deliveredQtyMT, 'MT', { favorableWhen: 'higher', tolerance: 0.01 }));
  rows.push(variance('Purchase price', modelRes.pricing && modelRes.pricing.mode === 'indexed' ? price.purchasePriceUSDperMT : null, A.purchasePriceUsdPerMT, 'USD/MT'));
  rows.push(variance('Avg realized price', price.avgRealizedPriceUSDperMT, A.avgRealizedPriceUSDperMT, 'USD/MT', { favorableWhen: 'higher' }));
  rows.push(variance('All-in landed cost', cost.allInCost, A.allInCost, 'USD'));
  rows.push(variance('Freight base', cost.freight && cost.freight.freightBase, A.freightBase, 'USD'));
  rows.push(variance('NAFEM rate', fx.rates && fx.rates.nafemReference, A.nafemRate, 'NGN/USD', { favorableWhen: 'higher', tolerance: 0.01 }));
  rows.push(variance('TIS net profit', profit.tisNetProfit, A.tisNetProfit, 'USD', { favorableWhen: 'higher' }));

  // Per-cost-line variances (by schema id) — the calibration payload.
  const lineRows = [];
  if (A.costLines) {
    for (const [id, actualAmt] of Object.entries(A.costLines)) {
      const ml = (cost.lines || []).find((l) => String(l.id) === String(id));
      lineRows.push(variance(
        ml ? `#${id} ${ml.label}` : `#${id} (not in model)`,
        ml ? ml.amountUsd : null,
        actualAmt, 'USD'
      ));
    }
  }

  const scorecard = rows.filter(Boolean);
  const unfavorableCount = [...scorecard, ...lineRows].filter((r) => r.verdict === 'UNFAVORABLE').length;

  // DESK MEMORY (best-effort, never blocks the report): actuals feed cost baselines so the
  // NEXT recap starts from real numbers; counterparties get their completed-deal count bumped.
  const memoryUpdates = { baselinesUpdated: [], counterpartiesBumped: [] };
  try {
    const qty = A.deliveredQtyMT ?? modelRes.meta?.deliveredQty;
    if (A.costLines) {
      for (const [id, amt] of Object.entries(A.costLines)) {
        deskMemory.updateBaseline(id, { usd: amt, deliveredQtyMT: qty, fromTrade: actuals.tradeId });
        memoryUpdates.baselinesUpdated.push(id);
      }
    }
    for (const p of [modelRes.meta?.parties?.supplier, modelRes.meta?.parties?.partner]) {
      if (p && deskMemory.recordDealFor(p)) memoryUpdates.counterpartiesBumped.push(p);
    }
  } catch (_) { /* memory is advisory */ }

  return {
    tradeId: actuals.tradeId || (modelRes.meta.tradeId),
    closedAt: new Date().toISOString(),
    notes: actuals.notes || '',
    variances: scorecard.filter(Boolean),
    costLineVariances: lineRows,
    headline: {
      netProfitDelta: (scorecard.find((r) => r.line === 'TIS net profit') || {}).delta ?? null,
      unfavorableLines: unfavorableCount,
    },
    memoryUpdates,
    note: 'Close-out calibrates future estimates. Persist alongside the trade for next-deal reference.',
  };
}

module.exports = { closeOut, variance };
