'use strict';

// PRODUCT CATALOG LOADER (Phase 2). A trade names a product by id (or supplies an inline record);
// conversions/density resolve catalog-first-with-inline-override. Absent product => the engine
// behaves exactly as before (conversion comes from trade.pricing.conversion) — legacy fixtures
// are untouched.

let CATALOG = null;
try { CATALOG = require('../config/products.json'); } catch (_) { CATALOG = null; }

function getProduct(id) {
  if (!CATALOG) throw new Error('products: engine/config/products.json not found');
  const p = CATALOG.products.find((x) => x.id === id);
  if (!p) throw new Error(`products: unknown product '${id}' (known: ${CATALOG.products.map((x) => x.id).join(', ')})`);
  return p;
}

function validateConversions(conv, at) {
  for (const k of Object.keys(conv)) {
    if (!(typeof conv[k] === 'number' && conv[k] > 0)) {
      throw new Error(`products: ${at}.${k} must be a positive number, got ${JSON.stringify(conv[k])}`);
    }
  }
}

// Effective product record for a trade: inline trade.product wins PER-FIELD over the catalog entry
// (a one-off grade ships without editing the catalog). Returns null when the trade declares nothing.
function resolveProduct(trade) {
  const declared = trade && trade.product;
  if (!declared) return null;
  if (declared.id) {
    const base = getProduct(declared.id);
    const merged = {
      ...base,
      ...declared,
      conversions: { ...(base.conversions || {}), ...(declared.conversions || {}) },
    };
    validateConversions(merged.conversions || {}, `product(${merged.id})`);
    return merged;
  }
  // Fully-inline one-off grade (no id): validated as-is.
  validateConversions(declared.conversions || {}, 'product(inline)');
  return declared;
}

// Litres-per-MT resolution: EXPLICIT trade.pricing.conversion (trader override) > catalog > null.
function catalogueLitresPerMT(trade) {
  const p = resolveProduct(trade);
  return p && p.conversions && p.conversions.litresPerMT != null ? p.conversions.litresPerMT : null;
}

module.exports = { getProduct, resolveProduct, catalogueLitresPerMT };
