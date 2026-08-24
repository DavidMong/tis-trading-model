'use strict';

// UNIT NORMALIZATION. Canonical internal unit stays USD_PER_MT — the whole engine is USD/MT and
// remains untouched. Quotes may arrive in any registered unit and are converted ONCE, here, at the
// edge. Factors are PRODUCT properties (never hardcoded per commodity): pass trade.product if
// present, else trade.pricing.conversion (legacy location).
//
// Round-trip invariant (tested): fromUsdPerMt(toUsdPerMt(x)) === x.

const CANONICAL = 'USD_PER_MT';
const KNOWN_UNITS = ['USD_PER_MT', 'USD_PER_BBL', 'USD_PER_L', 'USD_PER_MMBTU'];

// Factors accepted (all optional, required only when the corresponding unit is used):
//   bblPerMT, litresPerMT, mmbtuPerMT
function resolveFactors(ctx) {
  const conv = (ctx && ctx.conversion) || {};
  const prod = (ctx && ctx.product) || {};
  const pc = prod.conversions || {}; // catalog product records nest factors under .conversions
  // Merge: legacy pricing.conversion is the base; product record fields win where present.
  return {
    bblPerMT: pc.bblPerMT ?? prod.bblPerMT ?? conv.bblPerMT,
    litresPerMT: pc.litresPerMT ?? prod.litresPerMT ?? conv.litresPerMT,
    mmbtuPerMT: pc.mmbtuPerMT ?? prod.mmbtuPerMT ?? conv.mmbtuPerMT,
  };
}

function needFactor(factors, key, fromUnit) {
  const v = factors[key];
  if (typeof v !== 'number' || !(v > 0)) {
    throw new Error(`units: converting ${fromUnit} -> ${CANONICAL} requires a positive '${key}' factor on the product record (got ${JSON.stringify(v)})`);
  }
  return v;
}

function toUsdPerMt(value, fromUnit, ctx) {
  if (!KNOWN_UNITS.includes(fromUnit)) {
    throw new Error(`units: unknown quoted unit '${fromUnit}' (known: ${KNOWN_UNITS.join(', ')})`);
  }
  if (typeof value !== 'number' || !(value > 0)) throw new Error(`units: value must be > 0, got ${value}`);
  if (fromUnit === CANONICAL) return value;
  const f = resolveFactors(ctx);
  if (fromUnit === 'USD_PER_BBL') return value * needFactor(f, 'bblPerMT', fromUnit);
  if (fromUnit === 'USD_PER_L') return value * needFactor(f, 'litresPerMT', fromUnit);
  return value * needFactor(f, 'mmbtuPerMT', fromUnit); // USD_PER_MMBTU
}

// Inverse — display / round-trip tests only. Never drives P&L.
function fromUsdPerMt(usdPerMT, toUnit, ctx) {
  if (!KNOWN_UNITS.includes(toUnit)) throw new Error(`units: unknown target unit '${toUnit}'`);
  if (toUnit === CANONICAL) return usdPerMT;
  const f = resolveFactors(ctx);
  if (toUnit === 'USD_PER_BBL') return usdPerMT / needFactor(f, 'bblPerMT', toUnit);
  if (toUnit === 'USD_PER_L') return usdPerMT / needFactor(f, 'litresPerMT', toUnit);
  return usdPerMT / needFactor(f, 'mmbtuPerMT', toUnit);
}

module.exports = { CANONICAL, KNOWN_UNITS, toUsdPerMt, fromUsdPerMt };
