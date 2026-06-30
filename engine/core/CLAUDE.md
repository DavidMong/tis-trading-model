# engine/core/ — pure, reusable compute modules

Builds on the root `CLAUDE.md` (architecture, input→derivative graph, tax anchors, status-flag
taxonomy). Read that first. Modules in this directory: `cost-buildup.js`, `financing.js`, `fx.js`,
`fx-hedge.js`, `hedge.js`, `pricing-ladder.js`, `revenue.js`, `rounding.js`, `sensitivities.js`,
`storage-collect.js`, `tax.js`, `validate.js`. Detailed behavior for the non-obvious ones follows.

## Pricing ladder (advisory — `pricing-ladder.js`, `--ladder`)

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

## Hedge toggles — ICE + FX (`hedge.js`, `fx-hedge.js`)

Two **independent** per-trade toggles, both default **OFF**: `hedge.iceHedged` and `fxHedge.fxHedged`.
- **ON → drives realized P&L:** the net hedge impact flows into `standalone → adjusted → TIS net`
  (shared via the partner split when partner-funded). ICE: `−(iceCostDelta + all-in hedge cost)`;
  FX: `+(forward-vs-parallel delta on the hedged naira) − hedge cost`.
- **OFF → no P&L effect** (leg floats at NAFEM/live, zero hedge cost) — current behavior exactly.
- **Comparison:** `hedgeComparison` always shows the opposite toggle state (hedged vs unhedged TIS net),
  computed by re-running the engine with the toggle flipped, **recursion-guarded** via `opts.skipHedgeCompare`.
- **FX hedge BASE = BANK REPAYMENT OBLIGATION** (RULE 3, 2026-06-23): the base is the bank's USD facility
  repayment — `(financing.lc + financing.wc + financing.creditInterest + financing.wcInterest) × NAFEM`,
  surfaced as `fxHedge.exposureNgn` (naira) + `fxHedge.bankRepaymentUsd` (USD). **Rationale:** the trader is
  Nigeria-based and retains profit in naira, so the ONLY naira TIS is *forced* to convert to USD — the only
  FX risk — is the naira needed to repay the bank's USD facility (principal + interest). The naira profit
  above that is kept in naira and is NOT hedged; hedging the full net naira position (revenue − naira cost)
  would **over-hedge by the naira profit** (~2× the real liability on the depot sample) and waste the FX
  premium. `hedgeRatio` controls what fraction of the bank obligation to cover (1.0 = full repayment),
  overridable per trade. **GATE:** a trade with no naira revenue repays the bank from USD proceeds (no
  conversion, no FX risk) → base 0 → hedge inert, so **all-USD trades stay byte-for-byte unchanged**
  (`bankRepaymentUsd` is omitted from their output; guard hash unchanged). The net naira *position* is still
  reported in the FX block (`fx.netNairaExposureUsd`) for exposure/reconciliation — it just no longer sizes
  the hedge. A configurable portion of the base locks at a named-benchmark forward (NAFEM/NDF); unhedged
  remainder floats at **NAFEM** (RULE 1, 2026-06-23 — the economic settlement rate; asserted: HX3, PL4b).
  Dual route (bank_book spread / third_party bank-provided margin + broker fee), apples-to-apples on the
  bank-repayment base (over-hedge excluded).
- **BASIS RISK (explicit):** the hedge settles against the benchmark forward, which differs from the
  **NAFEM settlement rate** the unhedged naira actually books at, so the benchmark↔NAFEM gap is a surfaced
  residual (`fxHedge.basis.residualBasisUsd` + ⚠ note; asserted: HX4) — measured against NAFEM because that
  is the rate the hedge protects (RULE 1). Parallel is reference/display only and drives nothing in the
  hedge. The hedge never implies full NAFEM cover. All hedge params are PLACEHOLDER — confirm with bank/broker.
- The reference-trade runs on `computeEquityPartner` (toggles n/a) → byte-for-byte unchanged.

## Final / settlement ICE (`market.ice.final`)

Optional single value. The physical FOB purchase **FLOATS** at ICE (it is not locked — that is *why* TIS
hedges), so the settled ICE at payment must drive BOTH landed cost AND the swap reference. Resolved ONCE
at the top of `computeTrade` / `computeEquityPartner` (`engine/flows/`):

```
effectiveIce = market.ice.final ?? market.ice.value
```

`effectiveIce` is substituted at EVERY site that reads `market.ice.value` — the two `unitFob` reads, the
hedge's `liveIce` reference (`buildHedge`), and cost line 1 "ICE LSGO" (`rateFrom: market.ice.value`,
resolved against an `effTrade` clone). It is **one shared value, never a second ICE reference on the same
tonnes** — so the swap and the physical offset cleanly. Result:

- **(a)** landed cost recomputes at the settled ICE (purchase floats);
- **(b)** swap gain/loss = `hedgedPhysical × (effectiveIce − fixedPrice)`, scoped to **RETAINED tonnes only**
  (`iceCostDelta`, never full cargo, never partner tonnes);
- **(c)** partner principal (∝ cargo value) and partner tonnes (÷ landed) recompute at the new landed cost —
  **self-offsetting at par**, so the swap must NOT cover them (it doesn't: default hedged volume = retained).

**SAFETY RULE — BLANK ⇒ live ⇒ byte-for-byte unchanged.** When `final` is absent, `effectiveIce === liveIce`
and `effTrade === trade` *by reference*: zero structural change, every existing number identical. No new
result fields are emitted (the UI reads the input + existing hedge fields). Guarded by the full suite
(reference/Profogas trade byte-for-byte) plus the **FI0–FI8** tests (settled-ICE behavior + net stability:
hedged TIS net stays ~stable across the ICE range while unhedged swings widely). UI: "Final ICE $/MT
(settlement)" in the Pricing section (placeholder = live ICE); the ICE hedge card relabels "Live ICE" →
"Settlement ICE (final)" and surfaces a **Realized hedge P&L** row + realized-outcome note when set.

## Config-driven cost/tax lines (`engine/config/cost-line-schema.json`, evaluated by `cost-buildup.js`)

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
  (CFG3), config is the sole rate source (CFG4), tax-block membership is config-driven (CFG5). The
  reference-trade is byte-for-byte unchanged with current defaults.
