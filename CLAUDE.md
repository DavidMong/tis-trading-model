# TIS Global Trading — petroleum cargo trading model

Financial software for real trades. **Correctness and auditability are the priority; UI is not.**
Everything is computed from inputs; no output is hardcoded. TIS Global Trading is the only constant
entity — partners, suppliers, banks, inspectors are generic per-trade names.

## Architecture (three layers)

```
engine/core/    cost-buildup · tax · fx · fx-hedge · financing · hedge · pricing-ladder · revenue ·
                rounding · sensitivities · storage-collect · validate   (pure, reusable)
                — see engine/core/CLAUDE.md for pricing-ladder, hedge/fx-hedge, settlement ICE,
                  and config-driven cost/tax lines
engine/flows/   trade.js (unified, current) · equity-partner.js (verified reference path) ·
                straight-exship.js (stub) · full-depot-resale.js (stub)
                — see engine/flows/CLAUDE.md for the unified trade model
trades/         per-trade JSON inputs
run.js          CLI: report + --with-surcharge --upside --compare-fx --compare-hedge --ladder --export csv
test/           invariants.js — assertion harness (node test/invariants.js)
scripts/        report/dashboard build tooling — interactive dashboard (build-interactive.js) is
                documented in .claude/rules/build-interactive-*.md (path-scoped, load only when
                that file is touched)
```

Flows are pure compute functions `(trade, opts) -> result`. `run.js` formats; `sensitivities.js`
re-runs the same pure function under perturbed inputs.

## Input -> derivative dependency graph

**TRUE INPUTS (typed):** ICE $/MT (+asOf, feed hook; optional `market.ice.final` settlement ICE), FOB premium, cargo MT, ±5% seller option,
deliveredQty, TC rate/day, charter days, demurrage days, creditRate, lcFeePct, financingDays,
capitalLockupDays, ex-ship price (placeholder), FX (NAFEM+parallel; value/source/asOf/override),
partner terms, hedge terms, flat cost lines, taxableSupplyProportion, surcharge toggle.

**DERIVED (never typed):**
- Cargo (FOB) value = (ICE + FOB premium) × deliveredQty
- Performance bond 5% / Equity 20% / **Partner funding 25%** / Bank LC 75% — all × cargo value
- Freight base = TC hire (rate × charter days) + demurrage (rate × demurrage days)
- All financing interest = drawn principal × rate × days / 365
- Landed cost/MT = Σ(cost lines **excluding** recoverable VAT) / deliveredQty
- Ex-ship placeholder = landed cost/MT × (1 + 6%)  *(until buyer priced)*
- Partner tonnes = partner principal ÷ ex-storage landed cost (economic, exact)

## NTA 2025 tax anchors  (authority: tax-reference.md — verified, do NOT re-derive)

- **VAT 7.5% standard-rated** on domestic gasoil — **s.147**. Gasoil is neither exempt (**s.185**) nor
  zero-rated (**s.186**). Do **NOT** cite s.186(n) (that concerns exports).
- **Input VAT recoverable — s.155(4)**, apportioned by `taxableSupplyProportion` (proviso (a)).
- **Surcharge 5%** base = retail price — **s.158-161**; commences on Gazette date (**s.160**).
- **WHT on freight** — enabling section **TAA 2025 s.51** ("Deduction at source"), which states **no rate**
  (delegated to the Deduction-of-Tax-at-Source Regs, not in the attached statute). So the 5% rate is
  **UNVERIFIED → status CONFIRM**. Treated as a COST, deducted at source, non-recoverable.

## Recoverable-VAT treatment

VAT on freight (line 12) and services (line 13) is **recoverable input VAT (s.155(4))**. It is moved
**out of all-in cost** into a separate *Recoverable VAT (cash-flow timing only)* block — it affects
WC / timing, **not profit**. Apportioned by `taxableSupplyProportion` (default 1.0).

## Surcharge gate

Fossil-fuel surcharge is a **toggle, default OFF**, `commencementGazetted:false`, status PENDING.
Enable with `--with-surcharge` only once a Gazette commencement date exists. Configurable incidence:
`cost` (reduces TIS net) or `pass_through` (buyer absorbs). At 5% of the retail base it is large
(~$0.95M on the first trade) — hence the explicit gate.

## Partner compensation toggle

`trade.partner.mode`: `product_split` | `profit_share` | `combination`.
The first trade is **combination**: principal returned **in-kind** (product), **plus** `profitSharePct`
of TOTAL **adjusted** profit as cash. `profitSharePct` is a **variable input** — change it and all
derivatives re-flow.

Profit waterfall (standalone ↔ adjusted reconciliation — INFERRED, self-checked):
```
standaloneProfit = deliveredQty   × (exShip − landed)      [TIS as 100% owner]
marginForegone   = partnerTonnes  × (exShip − landed)      [TIS opportunity cost only]
adjustedProfit   = standalone − marginForegone             [= retained × (exShip − landed)]
partnerCash      = profitSharePct × adjustedProfit
tisNetProfit     = (1 − profitSharePct) × adjustedProfit
identity: marginForegone + adjustedProfit = standaloneProfit
```
**Partner reporting is TIS-internal:** report ONLY what TIS delivers — (1) product (tonnes + landed-cost
value = principal at par) and (2) cash (profit share). Margin foregone is shown only as TIS's opportunity
cost; no partner-side market-upside / cost-of-capital / net-return interpretation is attributed.
`capitalLockupDays` drives a **TIS-side** annualised return, not a partner metric.

## Annualised return (RULE, 2026-06-23)

```
tisAnnualisedReturn = tisNetProfit / financing.lc × (365 / capitalLockupDays)
annualReturnBaseLabel = "bank LC mobilised"   (BOTH equity providers — consistent)
```

The base is the **bank LC mobilised** (`financing.lc`) for **both** the partner and the TIS self-funded
case — **not** cargo value and **not** the equity slot. **Rationale:** TIS's lever in the deal is the bank
financing it brings (via TIS's banking relationship); the partner brings the equity. So TIS's return is
measured against the facility TIS actually mobilised. Absolute **TIS Net Profit** remains the headline KPI;
the annualised return is the secondary efficiency metric. (Old base: `cargo value (INDICATIVE)` for partner
/ `TIS equity (self-funded)` for self-funded — re-pointed on 2026-06-23; asserted FX7/FX8. The change moves
naira/partner annualised-return NUMBERS by design but leaves all-USD **profit** byte-for-byte unchanged —
only the metric moves there too; all-USD fingerprint guard re-baselined to `a90288…408162` in
`scripts/fingerprint.js`, old `b622d3cb…c398`.)

## Paper vs economic quantities

- **Economic** tonnes are exact (partner tonnes = principal ÷ ex-storage landed) and **drive ALL P&L**.
- **Paper** tonnes are documentary: nearest 50 MT, rounded in **TIS's favour** (partner down, TIS up).
- A **cash true-up** at settlement ties the partner's principal to par exactly.
- **Never** round prices or rates in TIS's favour — quantities only. **Never** compute P&L on paper tonnes.

## Dual-route hedge (ICE Gasoil swap, 100 MT/lot)

- **Route A `bank_book`:** bank books in-house → no extra capital/margin; cost = bank spread (+ fee).
- **Route B `third_party`:** bank **provides** the swap margin as financing (alongside LC+WC, **not**
  partner equity) → adds to advance + interest, plus a third-party fee.
- In both routes swap margin is **bank-provided, never partner equity**.
- hedgedVolume default = TIS retained tonnes (rounded to whole lots). Effective ICE = hedged×fixed +
  unhedged×live. Placeholders (verify before live hedge): feePerMT, initialMarginPct, fixedPrice.

(Detailed ICE/FX hedge mechanics, including the bank-repayment-obligation base and basis-risk surfacing,
are in `engine/core/CLAUDE.md`.)

## Status-flag taxonomy (Batch D — final, 3 states)

Display layer only — engine/config schemas still carry historical strings (CONFIRM, PLACEHOLDER, etc.)
which are remapped at render time in `badge()` and `pip()`. Do not change engine schemas.

| Display label | Badge style | Pip | Absorbs | Meaning |
|---|---|---|---|---|
| *(no badge)* | — | green `pip-ok` | OK, FIXED | Verified vs statute or contract |
| `INDICATIVE` | amber `#fef3c7 / #92400e` | amber `pip-ind` | INDICATIVE, PLACEHOLDER, PENDING, EXAMPLE | Reasonable estimate; fine to model, not contractual |
| `⚠ UNVERIFIED` | deeper amber `#fed7aa / #7c2d12` | orange `pip-unv` | CONFIRM, UNVERIFIED | Needs checking before live trading |
| `✓ OK` | green `bdg-recoverable` | — | RECOVERABLE | Cash-flow timing only (e.g. input VAT) |

`bdg-confirm` class is still used for the live MISMATCH reconciliation error — not a status flag.

**UNVERIFIED lines (open items):** NIMASA cabotage, NIMASA freight levy, SPOMO/CVFF, WHT on freight 5%
(TAA 2025 s.51 — rate unverified), VAT on services (INFERRED base composition).

## Module documentation

- `engine/core/CLAUDE.md` — pricing ladder, ICE/FX hedge mechanics, settlement ICE, config-driven cost/tax lines
- `engine/flows/CLAUDE.md` — the unified `trade.js` flow (five independent dimensions)
- `.claude/rules/build-interactive-*.md` — interactive dashboard (`scripts/build-interactive.js`)
  behavior and gotchas; path-scoped so they only load when that file is in play
