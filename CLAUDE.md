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

## Worktree setup checklist (do this before trusting suite/fingerprint output)

`trades/*.json` is gitignored (`.gitignore` line 2) except for the `sample-*.json` fixtures, which
are force-tracked. `reference-trade-001.json` — used by `scripts/fingerprint.js`'s ALL-USD guard and
by `test/invariants.js`'s LOCAL exact-value guards — is **not** tracked. A fresh `git worktree add`
gets a clean checkout with none of the untracked/ignored files the main worktree has accumulated, so
`reference-trade-001.json` (and any other untracked local trade file) silently won't exist there.

**Symptom:** the suite reports fewer passing tests than expected (e.g. 227/231 instead of 231/231,
missing the 4 LOCAL guards) and/or the fingerprint's ALL-USD guard combined hash comes back different
from the documented baseline — both look like a real regression but are actually just an incomplete
fixture set. (Baseline was 220 as of the `2d094eb` doc sync; commit `49c5be3` added the SC-LADDER check
— "Suite 220 -> 221, all existing tests unchanged" per its own commit message — without updating this
line; commit `d06c341` then reconciled it to 221, but by then `fcb82aa` (same branch) had already added
~10 more checks (HP1, PS1, PS2, verify-report-equivalence additions), so the 221 figure was stale on
arrival too. By the time the `fix/hedge-validation` PR landed on 2026-07-01, the suite had already
drifted to 239/235 (fixture/no-fixture) without a doc update in between — another instance of the same
recurring gap. That PR's own `#7b` regression test (missing-`trade.hedge` guard) then added 6 checks.
Actual as of 2026-07-01 (post `fix/hedge-validation`): **245 passed with the fixture present, 241
without it**. Re-verify this count against `git log -- test/invariants.js` before trusting it long-term
— do not just reconcile it once and move on; **as part of any future PR that touches
`test/invariants.js`, re-run the suite and update this line in the same PR**, since a missing doc
update after a passing test addition is a quiet, recurring failure mode here.)

**Fix — before running `node test/invariants.js` or `node scripts/fingerprint.js` in any new
worktree:** confirm `trades/reference-trade-001.json` is present; if not, copy it in from the main
worktree (`cp /path/to/main-worktree/trades/reference-trade-001.json trades/`) and say explicitly
that you did this. Only trust suite/fingerprint output after that check — otherwise a missing
fixture reads as a false regression and burns a session re-diagnosing it from scratch.

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

## NTA 2025 tax anchors  (authority: ../tax-reference.md — verified, do NOT re-derive)

> `../tax-reference.md` is a **local working copy outside this repo** — it is not tracked here and a
> fresh clone / `git worktree add` will not have it. The anchors below are the in-repo source of record;
> treat them as authoritative when the external file is absent.

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

`computeEquityPartner` is kept untouched as the verified reference-trade path (`flow: "equity-partner"`).
`computeTrade` is the unified flow reusing the same core modules; it reproduces `computeEquityPartner`
**exactly** for {ex-ship, partner, USD, 25%} (asserted: FX1). `straight-exship` / `full-depot-resale`
route into it. The engine is USD-internal; the FX layer converts naira legs at the boundary.

1. **Sale channels** — `channels.exShipPct` + `channels.depotPct` (validated sum = 1). Proceeds pool:
   `standalone = combinedRevenue − combinedCost` (generalizes the baseline revenue−cost identity exactly).
2. **Equity provider** — `partner.equityProvider ∈ {partner, TIS}`. `partner` runs the in-kind / margin-
   foregone / profit-share waterfall; `TIS` self-funded → `standalone = adjusted = TIS net`, partnerTonnes 0,
   annualised return on the **bank LC mobilised** (`financing.lc`) — same base for both providers
   (see *Annualised return* above; RULE 2026-06-23).
3. **Equity ratio** — `financing.lcPctOfCargo` + `partner.bondPct` + `partner.equityPct`, **validated to
   sum to 1.0** (throws otherwise). Default 0.75/0.05/0.20. Change advanceRate → equity/LC/interest/returns re-flow.
4. **Currency** — `sell.currencyMode ∈ {USD, NGN, split}` (+ `splitUsdPct`) on the **ex-ship** leg; depot
   is always ₦/L. **NAFEM drives all naira→USD P&L; PARALLEL is pricing-reference/reconciliation only**
   (RULE 1, 2026-06-23; asserted: FX3). Business reality: the bank funds USD, TIS repays naira proceeds, and
   the bank converts those naira to USD at NAFEM — so NAFEM is the rate at which naira revenue/cost lands in
   P&L (naira costs are naira-funded, Option B). Parallel stays fully resolved and shown for the display /
   exposure / reconciliation blocks but feeds **zero** P&L. The live FX sensitivity lever is the **NAFEM**
   rate (`fxMode: 'nafem'`); `fx.paymentBumpPct` now moves only the parallel reference (≈0 P&L). FX bites only
   naira legs (asserted: FX2/FX5). `fx.fxIncidence` default `TIS`.
5. **Depot channel** — priced ₦/L → USD via **NAFEM** × `litresPerMT` (RULE 1). Margin vs **all-in depot
   landed cost** (`depotLanded = exShipLanded + storage/depotTonnes`, > ex-ship landed: FX4). Storage lines go
   live for depot volume; **throughput + tank rental are naira-paid and FX-exposed at NAFEM on the cost side**
   (asserted: FX6); evaporation + tank insurance are USD (% of depot cargo value). Depot ₦/L ladder +
   ex-ship-vs-depot comparison go live.

**Margin-foregone benchmark = MAX channel** (RULE 2, 2026-06-23): TIS forgoes the **BEST** alternative use of
the partner's tonnes, so the in-kind product is valued in USD at the **highest realized price across the
channels actually present** — ex-ship USD price, depot @ NAFEM (`depotNgnPerL × litres / nafem`), or ex-ship-NGN
@ NAFEM, whichever is greater. Solely ex-ship → ex-ship price; solely depot → depot @ NAFEM; split → the
higher-margin channel (`benchmarkBasis` names the winner, e.g. `"depot price (NAFEM)"` / `"ex-ship price"`).
**Edge case:** no sell channel at all → falls back to ex-ship landed cost (asserted: FX9, PL2, PL3, MX).

Sample trades: `sample-depot-only` (depot/TIS/NGN), `sample-both-channels` (both/partner/split, advanceRate 0.80),
`sample-exship-tis` (ex-ship/TIS/USD), plus `reference-trade-001` (the unchanged verified baseline).

## Hedge toggles — ICE + FX (`engine/core/hedge.js`, `engine/core/fx-hedge.js`)

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
at the top of `computeTrade` / `computeEquityPartner`:

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
  (CFG3), config is the sole rate source (CFG4), tax-block membership is config-driven (CFG5). The
  reference-trade is byte-for-byte unchanged with current defaults.

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

## Interactive dashboard — real-trade features (`scripts/build-interactive.js`)

Documented in **path-scoped rules** that auto-load only when editing `scripts/build-interactive.js`
(kept out of this always-loaded root file to save context — do not copy them back here):

- `.claude/rules/build-interactive-state.md` — per-trade vs house-defaults split, trade-library
  state machine + footer layout, `TISStorage` persistence.
- `.claude/rules/build-interactive-results-flow.md` — empty-state / stale-results prevention,
  optional sell price (price-independent vs price-dependent outputs).
- `.claude/rules/build-interactive-field-status.md` — `pip()` status semantics, `.si.ph`
  placeholder state, hedged-volume MT placeholder.
- `.claude/rules/build-interactive-identity-display.md` — browser tab title, identity fields +
  fixture badge, favicon, Batch C color-semantics palette.


## Effort policy
- Default to medium effort for normal work.
- Use high effort only for: tricky debugging, multi-file
  refactors, architecture decisions.
- Use low effort for: formatting, renames, simple edits,
  boilerplate.

Match the effort to the task. Don't burn high effort on trivial work.

## Model routing
Default: Claude Sonnet 5. Use it for coding, tool use,
refactors, and day-to-day work.

Escalate to Opus 4.8 only when:
- Sonnet 5 has failed the same task twice, or
- the task needs the deepest reasoning (complex system
  design, subtle correctness proofs).

Start on Sonnet 5. Escalate on evidence, not by default.
