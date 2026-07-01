---
paths:
  - "scripts/build-interactive.js"
---

# Results rendering & pricing flow

## Empty state / stale-results prevention

`recompute()` gates on `inp-delivered` being non-empty before calling the engine. If blank (New Trade
or first load with no data), it calls `showEmptyState()` which:
1. Wipes all 7 result `<div>` sections (`sec-waterfall` through `sec-sens`) to empty HTML.
2. Sets all header KPI values and subs to `—`.
3. Clears the error banner.
4. Renders a calm "Enter trade data to see results" prompt in `sec-waterfall`.

If the engine throws on partial inputs (delivered MT filled but other fields invalid), `clearResults()`
wipes the sections + KPIs and the red error banner shows — no stale prior-trade numbers remain.
House defaults (Costs tab: tax rates, cost-line rates, hedge bank terms) are NOT cleared by this; they
persist through New Trade as intended and rehydrate from saved house defaults.

## Sell price is OPTIONAL (price-independent vs price-dependent outputs)

Sell pricing is **per leg** via the revenue-leg editor (`_legs` / `trade.revenueLegs`, S2.1) — there is
no longer a single scalar sell-price field (the old `inp-exship-price` id only survives as a read in
legacy-snapshot migration, for trades saved before the leg editor existed). A trade is priced once
**every** leg has a positive price; until then the trader prices *from* the ladder, so the cost
build-up and pricing ladder must be visible before any price is chosen.

**Price-INDEPENDENT** (compute/render without every leg priced):
- Cost Build-Up (`renderCost`) — `buildCostBuildup` never receives `sellValue` in the unified
  `engine/flows/trade.js` path, so `pct_of_sell` lines resolve to 0; landed cost is pure cost-side.
- Pricing Ladder (`renderLadder`) — each tier derives its own price from `exShipLandedPerMT` and runs
  the engine at that price (`runAtPrice`); the ladder base never needs the entered sell price.

**Price-DEPENDENT** (need every leg priced; shown as a calm PENDING state until then):
- Profit Waterfall, TIS Net Profit KPI, Annualised Return KPI, Ex-Ship Margin KPI,
  Partner Deliverables (cash share), Hedge Analysis comparison, Tax surcharge, Sensitivities.

**How `recompute()` handles it** (no engine math changed):
- Detects `hasSellPrice = legsAll.length > 0 && legsAll.every(l => isFinite(l.price) && l.price > 0)`
  — every leg must carry a positive price.
- The engine *throws* if the ex-ship channel is active and the price isn't positive. So when any leg
  is unpriced, it runs the engine once with **synthetic per-leg placeholder prices** filled in
  (`(ice+fob)*1.25` USD, fallback 1000, converted to a ₦/L equivalent for NGN-unit legs) purely to
  extract the price-independent outputs. Those synthetic values are **never displayed** — confirmed:
  `renderLadder`'s current-price marker only adopts a leg's price when the *real* (non-synthetic)
  `trade.revenueLegs[].price` is finite, falling back through `res.price.exShipPricePerMT`
  (explicitly nulled below) otherwise.
- After the run, `res.price.exShipPricePerMT` and `res.price.depotPriceNgnPerL` are both set to
  `null` so neither ladder shows a fake current-price marker, and sensitivities are skipped.
- `renderAll(trade, res, ladder, hasSellPrice)` then renders cost + ladder + a pending card in the
  waterfall slot and clears the P&L-dependent sections; `renderKPIs(res, false)` shows `—` with an
  "enter leg prices" sub. Pricing every leg re-runs normally and everything computes; clearing any
  leg's price returns to pending with the ladder intact.

The 220 invariant tests exercise the engine directly (with a real sell price), so they are unaffected.
