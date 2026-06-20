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

## Unified trade model (`engine/flows/trade.js`, `flow: "trade"`) — five independent dimensions

`computeEquityPartner` is kept untouched as the verified Profogas path (`flow: "equity-partner"`).
`computeTrade` is the unified flow reusing the same core modules; it reproduces `computeEquityPartner`
**exactly** for {ex-ship, partner, USD, 25%} (asserted: FX1). `straight-exship` / `full-depot-resale`
route into it. The engine is USD-internal; the FX layer converts naira legs at the boundary.

1. **Sale channels** — `channels.exShipPct` + `channels.depotPct` (validated sum = 1). Proceeds pool:
   `standalone = combinedRevenue − combinedCost` (generalizes the baseline revenue−cost identity exactly).
2. **Equity provider** — `partner.equityProvider ∈ {partner, TIS}`. `partner` runs the in-kind / margin-
   foregone / profit-share waterfall; `TIS` self-funded → `standalone = adjusted = TIS net`, partnerTonnes 0,
   annualised return on **TIS equity** (vs cargo value, INDICATIVE, when partner-funded).
3. **Equity ratio** — `financing.lcPctOfCargo` + `partner.bondPct` + `partner.equityPct`, **validated to
   sum to 1.0** (throws otherwise). Default 0.75/0.05/0.20. Change advanceRate → equity/LC/interest/returns re-flow.
4. **Currency** — `sell.currencyMode ∈ {USD, NGN, split}` (+ `splitUsdPct`) on the **ex-ship** leg; depot
   is always ₦/L. **PARALLEL drives all P&L; NAFEM is reference/reconciliation only** (asserted: FX3). FX risk:
   naira receivable fixed at pricing-parallel, revalued at payment-parallel; `fx.paymentBumpPct` (±10% sensitivity)
   bites only naira legs (asserted: FX2/FX5). `fx.fxIncidence` default `TIS`.
5. **Depot channel** — priced ₦/L → USD via parallel × `litresPerMT`. Margin vs **all-in depot landed cost**
   (`depotLanded = exShipLanded + storage/depotTonnes`, > ex-ship landed: FX4). Storage lines go live for depot
   volume; **throughput + tank rental are naira-paid and FX-exposed on the cost side** (asserted: FX6); evaporation
   + tank insurance are USD (% of depot cargo value). Depot ₦/L ladder + ex-ship-vs-depot comparison go live.

**Margin-foregone benchmark = EX-SHIP price** (partner's in-kind product is lifted ex-ship at the tank farm,
so TIS keeps the depot premium it earns by taking storage/holding/FX risk). **Edge case:** a depot-only trade
(no ex-ship channel) falls back to the depot realized (ex-storage) price as the benchmark (asserted: FX9).

Sample trades: `sample-depot-only` (depot/TIS/NGN), `sample-both-channels` (both/partner/split, advanceRate 0.80),
`sample-exship-tis` (ex-ship/TIS/USD), plus `profogas-dangote-001` (the unchanged verified baseline).

## Hedge toggles — ICE + FX (`engine/core/hedge.js`, `engine/core/fx-hedge.js`)

Two **independent** per-trade toggles, both default **OFF**: `hedge.iceHedged` and `fxHedge.fxHedged`.
- **ON → drives realized P&L:** the net hedge impact flows into `standalone → adjusted → TIS net`
  (shared via the partner split when partner-funded). ICE: `−(iceCostDelta + all-in hedge cost)`;
  FX: `+(forward-vs-parallel delta on the hedged naira) − hedge cost`.
- **OFF → no P&L effect** (leg floats at parallel/live, zero hedge cost) — current behavior exactly.
- **Comparison:** `hedgeComparison` always shows the opposite toggle state (hedged vs unhedged TIS net),
  computed by re-running the engine with the toggle flipped, **recursion-guarded** via `opts.skipHedgeCompare`.
- **FX hedge** locks a configurable portion of the **net naira exposure** at a named-benchmark forward
  (NAFEM/NDF); unhedged remainder floats at parallel. Dual route (bank_book spread / third_party
  bank-provided margin + broker fee), apples-to-apples on the net-exposure basis (over-hedge excluded).
- **BASIS RISK (explicit):** the hedge settles against the benchmark, not parallel, so realized P&L carries
  the benchmark↔parallel basis as a surfaced residual (`fxHedge.basis.residualBasisUsd` + ⚠ note). The hedge
  never implies full parallel cover. All hedge params are PLACEHOLDER — confirm with bank/broker.
- Profogas runs on `computeEquityPartner` (toggles n/a) → byte-for-byte unchanged.

## Config-driven cost/tax lines (`engine/config/cost-line-schema.json`)

Policy-change-proofing: **every cost/tax line's structure lives in config, not code.** The schema JSON
defines each line as a self-describing object; `buildCostBuildup` is a generic evaluator that reads
`type` and applies the matching base — **no rate, percentage, or %-vs-fixed assumption is hardcoded in
calculation logic.** A policy change (rate edit, %→fixed flip, base change) is a config edit.

- **type** (editable): `pct_of_freight | pct_of_cargo_value | pct_of_services | pct_of_LC | pct_of_sell
  | fixed | derived`. `derived` names a structural `derivation` (per_mt, tc_hire, demurrage,
  credit_interest, wc_interest, ngn_per_mt, ngn_fixed, pct_of_depot_cargo_value).
- **rate** (inline) or **rateFrom** (path into the trade) for percentage types; **amount**/**amountFrom**
  for `fixed`. `statusFrom`, `legalRef`, `recoverable`, `taxLine` (tax-block membership), `group`
  (`storage`) are all config fields.
- **Per-trade overrides:** `trade.costLineOverrides[id] = { ... }` overrides any field for one trade —
  e.g. flip a 2% levy to a fixed fee, or move a line to a different base, with zero code change.
- Editing a **rate** (VAT 7.5%→10%): edit `trade.tax.vatRate` (or the line's `rate`). Editing a **type**:
  edit the schema or a per-trade override. Both are config edits; the engine re-flows everything.
- Verified: rate change propagates (CFG1), type flip computes + reconciles (CFG2), base change recomputes
  (CFG3), config is the sole rate source (CFG4), tax-block membership is config-driven (CFG5). Profogas
  byte-for-byte unchanged with current defaults.

## Status-flag taxonomy (carried into every report)

`OK` · `INDICATIVE` (overridable assumption) · `CONFIRM` (needs external confirmation) ·
`PLACEHOLDER` (fill before live) · `PENDING` (gated, e.g. surcharge) · `RECOVERABLE` (timing only).

## Interactive dashboard — real-trade features (`scripts/build-interactive.js`)

### Per-trade vs house-defaults split

Two named arrays in the client script control which inputs are cleared/reloaded on **New Trade**:

- **`PER_TRADE_IDS`** — identity (name/partner/supplier/inspector), market prices, FX, freight,
  financing, partner terms, toggles. Cleared on New Trade.
- **`DEFAULT_IDS`** — cost-line rates/flat fees, tax rates, storage rates, density, hedge bank
  terms. Persist across trades; loaded from saved house defaults on New Trade.

### Professional trade library — state machine + footer layout

Three-state badge (`#trade-state-badge`) driven by `_currentTradeName` (null = new) and `_modified`:
- **New · unsaved** — slate/grey; `_currentTradeName === null`
- **{name} · saved** — blue-grey; loaded/saved, no pending edits
- **{name} · modified** — amber; any `onInputChange()` or toggle click since last save/load

Footer is a three-row column layout (requires `display:flex; flex-direction:column` on `.sb-footer`
— parent sidebar uses flex:row, which is why the explicit direction is needed):
1. **Row 1** — New Trade · Save · Save As…
2. **State row** — three-state badge (full width)
3. **Row 2** — dropdown · ↓ (force-load) · ✎ (rename) · ✕ (delete)

Key behaviours:
- **Smart Save** (`saveTrade()`): if `_currentTradeName !== null`, updates in place ("Updated: {name}");
  otherwise reads `inp-trade-name`, prompts duplicate-check, saves as new.
- **Save As…** (`saveAsTrade()`): always `prompt()`s for name; default is "{current} (copy)" or typed name.
  Switches `_currentTradeName` to the new name on success.
- **Rename** (`renameTrade()`): `prompt()`s; moves storage key; updates badge if renaming current trade.
- **Delete** (`deleteSelectedTrade()`): confirm includes "(This is the trade currently in your form.)"
  when deleting the current trade; sets `_currentTradeName = null` so badge reverts to "New · unsaved";
  form inputs are **not** wiped.
- **Load** (`loadSelectedTrade(explicit?)`): auto-loads on dropdown `onchange`; `↓` passes `explicit=true`
  to surface "Select a saved trade first" on empty. Unsaved-changes confirm on either path.
- **New Trade** (`newTrade()`): confirm if `_modified`; resets `_currentTradeName = null` + dropdown.

**Template-literal escape rule:** `\n` inside the Node.js template literal emits a literal newline into
the browser JS string, breaking single-quoted strings. Never use `\n` in string literals within the
client JS block — use concatenation or omit newlines entirely.

### Storage abstraction (`TISStorage`)

All persistence is routed through `TISStorage` (an IIFE in the client script). Current backend:
**`localStorage`** (`tis_saved_trades_v1`, `tis_house_defaults_v1`). To swap to a hosted backend,
replace only the four methods: `saveTrade`, `loadTrade`, `loadTrades`, `deleteTrade`,
`saveDefaults`, `loadDefaults`. The rest of the UI is backend-agnostic.

### Identity fields + Fixture badge

Trade name, Partner, Supplier, Inspector are editable text fields in the **Trade Identity** section
of the Deal tab. They update the header live (`updateHeader()`). The **Fixture** badge is shown only
when `_isSample === true`; this is set from `INIT_IS_SAMPLE` (derived from the initial trade's
`meta.tradeName`) and cleared to `false` on New Trade or when a real saved trade is loaded.

### Favicon

Embedded as a data URI in `<head>` — the TIS mark (`tis-logo-4.svg` viewBox, red #d41d1d) rendered
as a minimal inline SVG. No external request; works from `file://` and `localhost` equally.
