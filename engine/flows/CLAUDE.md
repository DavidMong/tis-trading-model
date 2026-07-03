# engine/flows/ — trade compute entrypoints

Builds on the root `CLAUDE.md`. Flows are pure compute functions `(trade, opts) -> result`; `run.js`
formats, `sensitivities.js` re-runs the same pure function under perturbed inputs.

- `trade.js` — the unified flow (current, see below).
- `equity-partner.js` — kept untouched as the verified reference-trade path.
- `straight-exship.js`, `full-depot-resale.js` — stubs (12 lines each), route into `trade.js`.

## Unified trade model (`trade.js`, `flow: "trade"`) — five independent dimensions

`computeEquityPartner` is kept untouched as the verified reference-trade path (`flow: "equity-partner"`).
`computeTrade` is the unified flow reusing the same core modules; it reproduces `computeEquityPartner`
**exactly** for {ex-ship, partner, USD, 25%} (asserted: FX1). `straight-exship` / `full-depot-resale`
route into it. The engine is USD-internal; the FX layer converts naira legs at the boundary.

1. **Sale channels** — `channels.exShipPct` + `channels.depotPct` (validated sum = 1). Proceeds pool:
   `standalone = combinedRevenue − combinedCost` (generalizes the baseline revenue−cost identity exactly).
2. **Equity provider** — `partner.equityProvider ∈ {partner, TIS}`. `partner` runs the in-kind / margin-
   foregone / profit-share waterfall; `TIS` self-funded → `standalone = adjusted = TIS net`, partnerTonnes 0,
   annualised return on the **bank LC mobilised** (`financing.lc`) — same base for both providers
   (see root *Annualised return*; RULE 2026-06-23).
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
