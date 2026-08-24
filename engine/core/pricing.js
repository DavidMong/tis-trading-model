'use strict';

const units = require('./units');

// INDEX & PRICING-FORMULA LAYER (Phase 1).
//
// Replaces the hardcoded "ICE spot + flat premium" convention. A price is either:
//   LEGACY   trade.market.ice.value (+ market.fobPremium.value)          — unchanged math
//   INDEXED  trade.market.purchasePrice = formula object, evaluated against
//            trade.indexQuotes { indexId: quote } and/or averaging observations.
//
// Formula grammar (real contract shapes as DATA, not code):
//   { quotedUnit: 'USD_PER_MT',
//     components: [ { ref: '<indexId>', weight: 1.0, op: '+', observations?: [{date,value}] },
//                   { const: -25, op: '+', weight?: 1 } ],
//     averaging?: { ref: '<indexId>', method: 'arithmetic-mean',
//                   observations: [{ date, value }, ...] },   // overrides that component's value
//     cap?: <number-in-quoted-unit>, floor?: <number-in-quoted-unit> }
//
// Handles: Platts M+1 avg +/- differential, % of Dated Brent, front-month settle + premium, fixed
// price (= single const component), min/max collars. The SAME object prices SALE legs
// (revenueLegs[].priceFormula, any registered unit) — back-to-back floats net naturally.
//
// HEDGE LINKAGE: the first ref-bearing component's RAW resolved level (unweighted, pre-differential)
// becomes floatRefUsdPerMT — the swap reference. Its index's hedgeInstrument (or hedgeProxy chain)
// supplies symbol/lot size — killing the hardcoded 100 MT/lot.

let REGISTRY = null;
try { REGISTRY = require('../config/indexes.json'); } catch (_) { REGISTRY = null; }

function getIndex(indexId) {
  if (!REGISTRY) throw new Error('pricing: engine/config/indexes.json not found');
  const e = REGISTRY.indexes.find((x) => x.id === indexId);
  if (!e) throw new Error(`pricing: unknown index '${indexId}' (known: ${REGISTRY.indexes.map((x) => x.id).join(', ')})`);
  return e;
}

function resolveInstrument(indexId) {
  const entry = getIndex(indexId);
  if (entry.hedgeInstrument) return { ...entry.hedgeInstrument, viaIndexId: entry.id };
  if (entry.hedgeProxy) {
    const p = getIndex(entry.hedgeProxy);
    if (!p.hedgeInstrument) throw new Error(`pricing: proxy '${entry.hedgeProxy}' has no hedgeInstrument`);
    return { ...p.hedgeInstrument, viaIndexId: entry.hedgeProxy, proxyFor: entry.id };
  }
  return null;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

function componentValue(comp, evalCtx) {
  // Resolution order: averaging override (when comp.ref matches) -> inline observations -> quote -> const.
  if (comp.ref) {
    if (evalCtx.averaging && evalCtx.averaging.ref === comp.ref) {
      const obs = evalCtx.averaging.observations || [];
      if (!obs.length) throw new Error(`pricing: averaging for '${comp.ref}' has no observations`);
      return { value: mean(obs.map((o) => o.value)), source: `avg(${obs.length} obs)`, rawLevel: true };
    }
    if (Array.isArray(comp.observations) && comp.observations.length) {
      return { value: mean(comp.observations.map((o) => o.value)), source: `avg(${comp.observations.length} obs)`, rawLevel: true };
    }
    const q = evalCtx.quotes ? evalCtx.quotes[comp.ref] : undefined;
    if (typeof q !== 'number' || !(q > 0)) {
      throw new Error(`pricing: missing quote for index '${comp.ref}' — add it to trade.indexQuotes`);
    }
    return { value: q, source: 'quote', rawLevel: true };
  }
  if (typeof comp.const === 'number') return { value: comp.const, source: 'const', rawLevel: false };
  throw new Error('pricing: component needs either ref or const');
}

function validateComponents(components) {
  if (!Array.isArray(components) || components.length === 0) {
    throw new Error('pricing: formula.components must be a non-empty array');
  }
  const ids = components.filter((c) => c.ref).map((c) => c.ref);
  if (new Set(ids).size !== ids.length) throw new Error('pricing: duplicate ref in components');
  return ids;
}

// Evaluate a formula object -> { quotedUnit, quotedValue, usdPerMT, floatRefUsdPerMT, audit }
function evaluateFormula(formula, ctx = {}) {
  if (!formula || typeof formula !== 'object') throw new Error('pricing: formula object required');
  const refs = validateComponents(formula.components);
  if (formula.cap != null && formula.floor != null && formula.cap < formula.floor) {
    throw new Error('pricing: cap < floor');
  }

  const evalCtx = { quotes: ctx.quotes || {}, averaging: formula.averaging || null };
  const breakdown = [];
  let acc = 0;
  let floatRaw = null;   // raw resolved level of the FIRST ref component (unweighted) — hedge anchor
  let floatRefQuoted = null;

  for (const comp of formula.components) {
    const r = componentValue(comp, evalCtx);
    const weight = comp.weight != null ? comp.weight : 1;
    const op = comp.op === '-' ? '-' : '+';
    const term = weight * r.value;
    acc += op === '-' ? -term : term;
    breakdown.push({
      label: comp.ref || 'fixed differential',
      resolved: r.value, weight, op, source: r.source,
      contributes: Number((op === '-' ? -term : term).toFixed(6)),
    });
    if (r.rawLevel && floatRaw === null) { floatRaw = r.value; floatRefQuoted = comp.ref; }
  }

  let quotedValue = acc;
  if (formula.floor != null && quotedValue < formula.floor) quotedValue = formula.floor;
  if (formula.cap != null && quotedValue > formula.cap) quotedValue = formula.cap;

  const usdPerMT = units.toUsdPerMt(quotedValue, formula.quotedUnit, ctx);
  const floatRefUsdPerMT = floatRaw != null && floatRefQuoted
    ? units.toUsdPerMt(floatRaw, getIndex(floatRefQuoted).unit, ctx)
    : null;

  return {
    quotedUnit: formula.quotedUnit,
    quotedValue: Number(quotedValue.toFixed(6)),
    usdPerMT: Number(usdPerMT.toFixed(6)),
    floatRefUsdPerMT: floatRefUsdPerMT != null ? Number(floatRefUsdPerMT.toFixed(6)) : null,
    floatRefIndexId: floatRefQuoted,
    refsUsed: refs,
    audit: {
      summary: `${formula.quotedUnit} [${breakdown.map((b) => `${b.op}${b.weight !== 1 ? b.weight + 'x' : ''}${b.label}@${b.resolved}${b.source === 'quote' ? '' : '(' + b.source + ')'}`).join(' ')}] => ${Number(quotedValue.toFixed(4))} ${formula.quotedUnit.replace('USD_PER_', '$/')}`,
      components: breakdown,
      cap: formula.cap ?? null,
      floor: formula.floor ?? null,
    },
  };
}

// LEGACY desugar — proves the old convention is just a special case (tested for equality).
function evaluateLegacy(trade) {
  const ice = trade.market.ice.value;
  const prem = trade.market.fobPremium ? trade.market.fobPremium.value : 0;
  return { usdPerMT: ice + prem, floatRefUsdPerMT: ice, floatRefIndexId: 'ICE_GASOIL_FUT', hedgeIndexId: 'ICE_GASOIL_FUT', audit: null, legacy: true };
}

function resolvePurchasePrice(trade) {
  if (trade.market && trade.market.purchasePrice) {
    const f = trade.market.purchasePrice;
    const ctx = { quotes: trade.indexQuotes || {}, product: require('./products').resolveProduct(trade) || trade.product, conversion: trade.pricing && trade.pricing.conversion };
    const ev = evaluateFormula(f, ctx);
    const inst = ev.floatRefIndexId ? resolveInstrument(ev.floatRefIndexId) : null;
    return {
      legacy: false,
      usdPerMT: ev.usdPerMT,
      floatRefUsdPerMT: ev.floatRefUsdPerMT,
      floatRefIndexId: ev.floatRefIndexId,
      hedgeIndexId: inst ? inst.viaIndexId : null,
      instrument: inst,
      audit: ev.audit,
    };
  }
  return evaluateLegacy(trade);
}

// SALE legs: inject formula-priced legs BEFORE normalizeLegs (which demands a positive numeric
// price). Any registered quotedUnit converts via the product record; depot retail stays trader-set.
function resolveSaleLegPrices(rawLegs, ctx = {}) {
  const legs = [];
  const audits = [];
  for (let i = 0; i < rawLegs.length; i++) {
    const leg = rawLegs[i];
    if (!leg || !leg.priceFormula) { legs.push(leg); continue; }
    if (leg.channel === 'depot') {
      throw new Error(`revenueLegs[${i}]: depot legs cannot be index-formula priced (retail is trader-set NGN/L)`);
    }
    const conv = { product: ctx.product, conversion: ctx.conversion };
    const ev = evaluateFormula(leg.priceFormula, { ...conv, quotes: ctx.quotes });
    legs.push({ ...leg, price: ev.usdPerMT });
    audits.push({ legIndex: i, summary: ev.audit.summary, usdPerMT: ev.usdPerMT });
  }
  return { legs, audits };
}

module.exports = { evaluateFormula, resolvePurchasePrice, resolveSaleLegPrices, resolveInstrument, getIndex };
