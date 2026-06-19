'use strict';

const { round } = require('./rounding');

// Tax block — AUTHORITY: tax-reference.md (verified against Nigeria Tax Act 2025).
// Do NOT re-derive the VAT / surcharge treatment here.
//
//  - VAT on domestic gasoil: standard-rated 7.5% (s.147). Gasoil is neither exempt (s.185)
//    nor zero-rated (s.186). Do NOT cite s.186(n) — that concerns exports.
//  - Input VAT on freight (12) and services (13) is RECOVERABLE (s.155(4)), apportioned by
//    taxableSupplyProportion (s.155(4) proviso (a)). It is cash-flow timing only, not a cost.
//  - WHT on freight (11) is a COST, deducted at source. TAA 2025 s.51 is the enabling section
//    but states NO rate (delegated to regs) -> status CONFIRM.
//  - NIMASA 2%/3%, SPOMO/CVFF 2% (7,8,9), marine 0.125% (14) are COSTS (non-NTA / commercial).
//  - Fossil-fuel surcharge 5% (s.158), base = retail price (s.159(2)), commences on the Gazette
//    date (s.160): toggle, default OFF, commencementGazetted:false. Gasoil NOT exempt (s.161).
//
// This module reads the already-computed amounts from cost-buildup and presents the audit view;
// each line carries rate / base / legalRef / status / recoverable.

function buildTaxBlock(trade, ctx, costBuildup) {
  const tax = trade.tax;
  const byId = costBuildup.byId;

  const taxLineIds = [7, 8, 9, 11, 12, 13, 14];
  const items = taxLineIds.map((id) => {
    const l = byId[id];
    return {
      id,
      label: l.label,
      rate: l.rate,
      base: l.base,
      amountUsd: l.amountUsd,
      recoverable: l.recoverable,
      status: l.status,
      legalRef: l.legalRef,
      treatment: l.recoverable ? 'RECOVERABLE input VAT (cash-flow timing only)' : 'COST',
    };
  });

  // Recoverable VAT block (does NOT affect profit)
  const recoverableVat = costBuildup.recoverableVat;

  // Fossil-fuel surcharge (Chapter Seven, s.158-161) — gated until Gazette commencement (s.160).
  const sc = tax.surcharge;
  const retailBase = ctx.exShipPricePerMT != null ? ctx.exShipPricePerMT * ctx.deliveredQty : null;
  const amount = sc.enabled && retailBase != null ? sc.rate * retailBase : 0;

  const surcharge = {
    enabled: sc.enabled,
    commencementGazetted: sc.commencementGazetted,
    rate: sc.rate,
    baseDescription: 'retail price of chargeable fossil-fuel products (s.159(2))',
    baseAmount: retailBase != null ? round(retailBase, 2) : null,
    incidence: sc.incidence, // 'cost' | 'pass_through'
    amountUsd: round(amount, 2),
    status: sc.commencementGazetted ? 'OK' : 'PENDING (not yet gazetted — s.160)',
    legalRef: 'Nigeria Tax Act 2025 s.158-161; gasoil NOT exempt (s.161)',
    note: 'Default OFF. Enable with --with-surcharge once a Gazette commencement date exists.',
  };

  return { items, recoverableVat, surcharge };
}

module.exports = { buildTaxBlock };
