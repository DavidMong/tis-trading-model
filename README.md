# tis-trading-model

Reusable petroleum cargo trading model for **TIS Global Trading**. Pure Node.js, **zero dependencies**
(uses only `node:fs`, `node:path`, `node:util`). Correctness and auditability first; UI is not a concern.

## Requirements
Node.js >= 20 (developed on v25). No `npm install` needed.

## Run

```bash
node run.js                                  # first trade (Profogas/Dangote) — full report
node run.js trades/profogas-dangote-001.json # explicit trade file
node run.js --with-surcharge                 # enable 5% fossil-fuel surcharge (default OFF, pending Gazette)
node run.js --upside                         # +5% seller option (deliveredQtyUpsideMT)
node run.js --compare-fx                      # NAFEM vs parallel FX (no NGN legs here -> no P&L impact)
node run.js --compare-hedge                   # hedge route A (bank_book) vs B (third_party)
node run.js --ladder                          # cost-plus pricing ladder (advisory price guidance)
node run.js --export csv                      # write Excel-compatible CSV to out/
node run.js --help

node test/invariants.js                       # verification harness (22 assertions)
```

## What the report shows
Funding stack · cost build-up · VAT-services bucket · recoverable-VAT block · tax block (with surcharge
gate) · paper vs economic quantities + reconciliation · price · profit waterfall (standalone↔adjusted) ·
partner deliverables · hedged-vs-unhedged · sensitivities (±10%) · inferred-formulas & status-flags appendix.

## Layout

```
engine/core/   cost-buildup.js  tax.js  fx.js  financing.js  hedge.js  rounding.js  sensitivities.js
engine/flows/  equity-partner.js (built)  straight-exship.js (stub)  full-depot-resale.js (stub)
trades/        profogas-dangote-001.json
run.js         CLI + report + CSV export
test/          invariants.js
CLAUDE.md      model spec: dependency graph, NTA 2025 tax anchors, partner toggle, hedge, quantities
```

## Adding a trade
Copy `trades/profogas-dangote-001.json`, edit the **inputs only** (never type a derived amount), set
`meta.flow`, and run `node run.js trades/<your-trade>.json`. Leave `sell.exShipPricePerMT.value` as
`null` to use the cost-plus-6% placeholder until the buyer is priced.

## Authority
Tax treatment follows `../tax-reference.md` (verified against the Nigeria Tax Act 2025). See `CLAUDE.md`
for citations. The WHT-on-freight **rate** is unverified (status CONFIRM) — TAA 2025 s.51 delegates it
to regulations not in the attached statute.
