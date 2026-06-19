# TIS Global Trading — petroleum cargo trading model

Financial software for real trades. **Correctness and auditability are the priority; UI is not.**
Everything is computed from inputs; no output is hardcoded. TIS Global Trading is the only constant
entity — partners, suppliers, banks, inspectors are generic per-trade names.

## Architecture (three layers)

```
engine/core/    cost-buildup · tax · fx · financing · hedge · rounding · sensitivities   (pure, reusable)
engine/flows/   equity-partner (built) · straight-exship (stub) · full-depot-resale (stub)
trades/         per-trade JSON inputs
run.js          CLI: report + --with-surcharge --upside --compare-fx --compare-hedge --export csv
test/           invariants.js — assertion harness (node test/invariants.js)
```

Flows are pure compute functions `(trade, opts) -> result`. `run.js` formats; `sensitivities.js`
re-runs the same pure function under perturbed inputs.

## Input -> derivative dependency graph

**TRUE INPUTS (typed):** ICE $/MT (+asOf, feed hook), FOB premium, cargo MT, ±5% seller option,
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

## NTA 2025 tax anchors  (authority: ../tax-reference.md — verified, do NOT re-derive)

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

## Pricing ladder (advisory — `engine/core/pricing-ladder.js`, `--ladder`)

Cost-plus price-recommendation tool. **Suggests** prices; the trader always sets the final price
("SUGGESTED — pricing guidance only"). Every P&L figure is produced by re-running the verified flow
engine at the tier price (`runAtPrice -> compute`) — no math is duplicated or approximated. The tier
price is rounded to the cent **before** the engine run, so the displayed price reproduces the displayed
profit exactly (auditable WYSIWYG).

- **Cost base:** ex-ship margin is measured against **ex-ship landed cost** (all-in excluding storage);
  depot margin against **all-in depot landed cost** (including storage/throughput/evaporation/tank ins.).
  Never against bare FOB.
- **Three metrics per tier (always all three):** margin % of sell price · markup % on landed cost ·
  absolute spread per unit ($/MT ex-ship, ₦/L depot).
- **Ex-ship ladder (USD):** tiers are margin-of-sell → price = landed / (1 − m). Defaults Floor 3% /
  Conservative 6% / Target 10% / Stretch 15% / Premium 20%. Configurable via `trade.pricing.exShipTiers`.
- **Depot ladder (₦/L):** tiers are absolute ₦/L spread over all-in depot landed cost. Defaults Floor 50 /
  Conservative 90 / Recommended 135 / Stretch 170 / Premium 220. Configurable via `trade.pricing.depotTiers`.
  **Applies only when a depot leg exists**; P&L per tier is `PENDING` until the full-depot-resale flow is built.
- **Primary comparison:** ex-ship vs depot **absolute spread** in a common currency (₦/L headline + $/MT),
  via `pricing.conversion` (litresPerMT, depot FX market). Reports which leg earns the larger absolute spread.
- Re-derives automatically when landed cost moves (ICE/FOB/freight/FX). The trader's entered price is
  highlighted and classified to the nearest tier.

## Status-flag taxonomy (carried into every report)

`OK` · `INDICATIVE` (overridable assumption) · `CONFIRM` (needs external confirmation) ·
`PLACEHOLDER` (fill before live) · `PENDING` (gated, e.g. surcharge) · `RECOVERABLE` (timing only).
