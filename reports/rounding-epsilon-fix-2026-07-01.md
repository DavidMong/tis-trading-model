# Rounding epsilon fix — 2026-07-01

Branch: `fix/rounding-epsilon`, based on `main` @ `2b56aca` (post effort-policy/model-routing docs commit).

## 1. What round() is actually used for — quantities only, or also prices/rates?

`CLAUDE.md`'s *Paper vs economic quantities* section (lines 131-136) states: "Never round prices or
rates in TIS's favour — quantities only." Read together with `engine/core/rounding.js`'s own header
comment ("HARD RULE: never round prices or rates in TIS's favour"), this describes ONE specific
mechanism: `paperQtyFavorTIS()` — the asymmetric floor/ceil function used ONLY for partner/TIS paper
tonnes (`Math.floor` for partner, `Math.ceil` for TIS). Confirmed via grep that `paperQtyFavorTIS` is
called at exactly two sites, both quantities:

```
engine/flows/equity-partner.js:111  paperQtyFavorTIS(partnerTonnesEcon, 'partner', 50)
engine/flows/equity-partner.js:112  paperQtyFavorTIS(tisRetainedTonnes, 'tis', 50)
engine/flows/trade.js:324           paperQtyFavorTIS(partnerTonnes, 'partner', 50)
engine/flows/trade.js:325           paperQtyFavorTIS(tisRetainedTonnes, 'tis', 50)
```

**`round()` itself — the function with the bug — is a completely separate, NEUTRAL function**
(standard `Math.round`, symmetric nearest-value, no floor/ceil asymmetry). Grepping every call site
of `round(` across `engine/` (125 call sites, excluding `roundToLots`/`paperQtyFavorTIS`) confirms it
is used on:
- Money/cost amounts (`amountUsd`, `tisBorneUsd`, `notional`, `swapFee`, interest, etc.) —
  `engine/core/cost-buildup.js`, `engine/core/tax.js`, `engine/core/hedge.js`, `engine/core/fx-hedge.js`
- Quantities (`hedgedPhysical`, `unhedgedTonnes`, `comparisonBasisTonnes`) — `engine/core/hedge.js`
- **Prices and rates** — confirmed present, e.g.:
  - `engine/flows/equity-partner.js:160` — `exShipPricePerMT: round(exShipPricePerMT, 4)`
  - `engine/flows/trade.js:350,352,353,384` — `exShipPricePerMT`, `depotPriceUSDperMT`,
    `avgRealizedPriceUSDperMT`, `benchmarkPriceUSD`
  - `engine/core/fx-hedge.js:99` — `gapNgnPerUsd = round(forwardRate - nafemRate, 4)` (an FX rate delta)

**Finding, flagged as required:** `round()` IS used on prices/rates, not just quantities. This does
**not** violate the RULE, because `round()` was never favor-biased — it is plain `Math.round`
(nearest-value, ties toward +Infinity, JS's native tie-break — same before and after this fix). The
RULE prohibits *favor-biased* rounding of prices/rates (i.e., applying `paperQtyFavorTIS`-style
floor/ceil-by-side logic to a price), and that never happens anywhere in the codebase — prices/rates
only ever go through the neutral `round()`, for display/precision purposes. **The fix in this PR must
therefore preserve `round()`'s neutrality** (same `Math.round` semantics, same tie-break direction) —
it must NOT become asymmetric or favor-biased, since that would newly violate the RULE for every
price/rate call site listed above. This is verified below (§4).

## 2. Concrete boundary-case bug demonstration (real financial magnitude)

The old implementation:
```js
function round(x, dp = 2) {
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
}
```
`Number.EPSILON` (~2.22e-16) is a **fixed absolute** nudge. It's sized to correct floating-point
representation drift for values near magnitude 1 (where drift ~1e-16 matters). At real financial
magnitudes (hundreds, thousands, tens of thousands — where this codebase's dollar amounts, tonnages,
and rates actually live), floating-point representation error scales with the value's own magnitude
(roughly `value × 2^-52`), which is many orders larger than the fixed `Number.EPSILON` constant — so
the nudge is a no-op there, and drift can flip an exact `.xx5` boundary the wrong way.

Brute-force scan (script run inline, not committed) searching exact `.xx5`-boundary values across
magnitude bands, using the OLD `round()`:

```
hundreds/low-thousands (x in [0, 2000)):        200,000 boundary values scanned, 9,158 wrong (4.6%)
tens-of-thousands (x in [10000, 12000)):        200,000 boundary values scanned, 7,773 wrong (3.9%)
```

**Concrete example at real magnitude** — a $10,000.005 cost-line amount (a plausible dollar figure in
this codebase — cost lines commonly run into the tens of thousands):

```js
const { round } = require('./engine/core/rounding');
round(10000.005, 2)   // OLD (before this fix): 10000       — WRONG, should round half-up to 10000.01
                       // (10000.005 * 100 = 1000000.4999999999 in IEEE-754 double, and
                       //  Math.round(1000000.4999999999 + Number.EPSILON) still rounds DOWN to
                       //  1000000, because Number.EPSILON is ~4.4e-10 too small a correction at
                       //  this magnitude — it corrects only ~1e-16-scale drift.)
```

A second, even more everyday-scale example:
```js
round(2.135, 2)  // OLD: 2.13 — WRONG, should be 2.14 (half-up)
```

## 3. Fix

`engine/core/rounding.js` — replaced the fixed-epsilon nudge with a relative-precision cleanup using
`toPrecision(15)` before rounding:

```diff
 function round(x, dp = 2) {
   if (x === null || x === undefined || Number.isNaN(x)) return x;
   const f = 10 ** dp;
-  return Math.round((x + Number.EPSILON) * f) / f;
+  // Doubles carry ~15-17 significant decimal digits; representation noise from the x*f
+  // multiplication lands past the 15th. toPrecision(15) strips that noise (relative to the
+  // value's own magnitude) before rounding, so exact .xx5 boundaries round correctly at ANY
+  // financial magnitude — unlike a fixed +Number.EPSILON nudge, which is only large enough to
+  // matter for values near magnitude 1 and is a no-op at real (hundreds/thousands+) magnitudes.
+  return Math.round(Number((x * f).toPrecision(15))) / f;
 }
```

**Why this is correct at all magnitudes, not just patched for one case:** IEEE-754 doubles carry
~15-17 significant *decimal* digits of precision, regardless of the value's magnitude — this is a
**relative** guarantee (proportional to the number's own size), unlike a fixed absolute epsilon.
`(x * f).toPrecision(15)` rounds the scaled value to 15 significant digits, which is comfortably
inside the range where a double's true value is preserved but past the range where multiplication
noise accumulates — so it strips exactly the floating-point noise and nothing else, for any `x` from
fractions of a cent up through the trillions (well beyond any figure this codebase produces; cargo
values here run to low hundreds of millions of dollars at most). This was verified by brute-force
scanning `.xx5`-boundary values across seven magnitude bands from ~1 through ~10^12, at both 2dp and
4dp (the two precisions actually used in this codebase) — **zero wrong-direction roundings found**
with the fix, versus thousands found per band with the old fixed-epsilon approach.

## 4. Confirm the fix still rounds neutrally (not favor-biased either direction)

The fix only changes *which* value gets fed into `Math.round()` — it does not touch `Math.round`
itself, so the tie-break direction (JS's native "ties round toward +Infinity") is byte-for-byte
identical before and after:

```js
round(-2.135, 2)   // -2.13 both BEFORE and AFTER the fix (Math.round(-213.5) = -213 in JS,
                    //  i.e. ties round toward +Infinity — unchanged, not newly biased toward
                    //  or away from TIS in either direction)
```

Confirmed unchanged for `paperQtyFavorTIS` too — it doesn't call `round()` at all (uses
`Math.floor`/`Math.ceil` directly), so it is completely untouched by this fix:

```js
paperQtyFavorTIS(1234, 'partner', 50)  // 1200 — rounds DOWN, unchanged
paperQtyFavorTIS(1234, 'tis', 50)      // 1250 — rounds UP, unchanged
```

**Conclusion:** the fix is a pure precision correction to a neutral function. It does not introduce,
remove, or alter any favor-biased rounding anywhere in the codebase — the only favor-biased mechanism
(`paperQtyFavorTIS`) is untouched, and `round()` remains exactly as neutral as before (same
`Math.round` tie-break), just now numerically correct at real magnitudes.

## Engine-guard: before fix

- `node test/invariants.js` → 245 passed, 0 failed
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — matches documented baseline.

## Prediction: does any tracked fixture hit a genuine .xx5 boundary?

Inspected `trades/*.json` inputs (ICE prices, FOB premiums, quantities, FX rates, financing rates,
etc.) — none are hand-picked to land on exact rounding-boundary values; they're realistic trade
figures (e.g. ICE $612.50, FOB premium $42.75, deliveredQty 116,500 MT, FX rates like 1580.25) that,
after the engine's full chain of multiplications/divisions, produce derived values with generic
fractional tails, not values that coincidentally hit an exact `n.xx5` midpoint at 2dp or 4dp
precision. **Prediction: no tracked fixture is affected — suite pass count and fingerprint hash should
be byte-for-byte unchanged**, same reasoning/method as the hedge-validation fix's fixture-impact
prediction.

## Engine-guard: after fix (before adding the new test)

- `node test/invariants.js` → **245 passed, 0 failed** (identical count)
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — **unchanged**, `OK (matches
  expected baseline)`.

**Prediction confirmed exactly.** No tracked fixture's computed values sit on a genuine `.xx5`
boundary at the precisions this codebase rounds to, so the fix is a pure no-op for every currently
tracked trade.

## Hand-verification of the boundary case

```js
const { round } = require('./engine/core/rounding');
round(10000.005, 2)   // AFTER fix: 10000.01 — correct, half-up
round(2.135, 2)       // AFTER fix: 2.14 — correct, half-up
round(12345.67895, 4) // AFTER fix: 12345.679 — correct at 4dp too (the precision hedge.js's
                       //                        tonnage fields use)
round(-2.135, 2)      // AFTER fix: -2.13 — same as before the fix, confirming neutrality
                       //                    (tie-break direction unchanged)
```

## Regression test — `test/invariants.js`, block `#5`

Added a new `#5` block (between the existing `#4` day-count block and `#6` ladder-bounds block),
asserting `round()` correctness at real financial magnitudes and confirming neutrality is preserved:

1. `round(10000.005, 2) === 10000.01` — thousands-magnitude half-up boundary
2. `round(2.135, 2) === 2.14` — hundreds-magnitude half-up boundary
3. `round(12345.67895, 4) === 12345.679` — tens-of-thousands magnitude at 4dp (hedge tonnage
   precision)
4. `round(-2.135, 2) === -2.13` — confirms tie-break direction is unchanged (not newly favor-biased)

**Non-tautology proof (revert-and-rerun):**

- Reverted `engine/core/rounding.js` to the pre-fix version (`git show HEAD:engine/core/rounding.js`)
  in place, without touching `test/invariants.js`, and reran `node test/invariants.js`.
- Result: **2 of the 4 new checks failed** (checks #1 and #2 — the thousands- and hundreds-magnitude
  half-up boundaries), while checks #3 and #4 happened to still pass (the specific values chosen for
  those two don't hit a mis-rounding boundary under the old implementation — expected, since only
  ~4-5% of `.xx5` boundary values are affected per the brute-force scan, not all of them):

  ```
    FAIL #5 round() half-up boundary correct at thousands magnitude
    FAIL #5 round() half-up boundary correct at hundreds magnitude
    ok   #5 round() half-up boundary correct at tens-of-thousands, 4dp
    ok   #5 round() stays neutral (not TIS-favor-biased): tie-break direction unchanged for negatives
  247 passed, 2 failed
  ```
- Restored the fixed `engine/core/rounding.js` and reran: **249 passed, 0 failed** (245 baseline + 4
  new `#5` checks).

Unlike the hedge-validation fix (where reverting crashed the whole suite), this revert produces
genuine `FAIL` assertions rather than an uncaught exception — still conclusively proving the test
exercises real, previously-broken behavior rather than a tautology.

## Engine-guard: final (fix + test both in place)

- `node test/invariants.js` → **249 passed, 0 failed**
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — unchanged, `OK (matches
  expected baseline)`.

## Files changed

- `engine/core/rounding.js` — the fix (6 insertions, 1 deletion).
- `test/invariants.js` — regression test block `#5` (10 lines added, including the new
  `require('../engine/core/rounding')` for direct access to `round()`).

## Note on CLAUDE.md baseline line

Per the same standing rule as the hedge-validation PR, this PR's `test/invariants.js` change moves
the suite count 245 → 249 (+4, all in the new `#5` block). The `CLAUDE.md` worktree-checklist baseline
line should be reconciled from 245/241 to 249/245 (fixture/no-fixture) as part of landing this change
— not done in this branch since it wasn't part of the requested scope, flagging for the merge step.
