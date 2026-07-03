# Hedge validation fix — 2026-07-01

Branch: `fix/hedge-validation`, based on `main` @ `b07d63a` (post CSV-export/browser-leak merge).

## Bug

`engine/core/hedge.js`'s `buildHedge()` destructured `trade.hedge` with no fallback:

```js
const h = trade.hedge;
```

Hedging is documented as optional/default-off (`hedge.iceHedged` default OFF per CLAUDE.md's
*Dual-route hedge* section), but `buildHedge()` is called **unconditionally** from both
`equity-partner.js` and `trade.js` — the `iceHedged` flag only gates whether the hedge cost feeds
into P&L, not whether `buildHedge()` runs. So any trade with `trade.hedge` missing entirely (rather
than present-with-`iceHedged:false`) crashed with a raw, unhelpful `TypeError: Cannot read properties
of undefined (reading 'hedgedVolumeMT')` instead of a clean result or validation error.

## Prediction: does this move the fingerprint?

`grep`-checked all six tracked fixtures before touching code:

```
reference-trade-001.json   hedge: {route, hedgedVolumeMT:null, fixedPrice:null, feePerMT:1.5, ...}
sample-both-channels.json  hedge: {iceHedged:false, route:"third_party", feePerMT:1.5, ...}
sample-depot-only.json     hedge: {iceHedged:false, route:"bank_book", feePerMT:1.5, ...}
sample-equity-partner.json hedge: {iceHedged:false, route:"bank_book", feePerMT:1.5, ...}
sample-exship-tis.json     hedge: {iceHedged:false, route:"bank_book", feePerMT:1.5, ...}
sample-trade.json          hedge: {iceHedged:false, route:"bank_book", feePerMT:1.5, ...}
```

**Every tracked fixture already has `trade.hedge` present with all fields set.** Prediction (same
method as the FX override-precedence fix): since no tracked fixture is missing `trade.hedge`, the
fix is a pure no-op for every fixture — the invariant-suite exact-value guards and the fingerprint's
ALL-USD guard hash should be **byte-for-byte unchanged**. Confirmed below.

## Fix

`engine/core/hedge.js` — default `trade.hedge` to `{}` and default the three fields read
unconditionally off it (`route`, `feePerMT`, `initialMarginPct`), mirroring the exact same "hedge
off" shape already produced when a trade **has** `trade.hedge` with `iceHedged:false`:

```diff
 function buildHedge(trade, ctx) {
-  const h = trade.hedge;
+  const h = trade.hedge || {}; // hedging is optional/default-off — missing trade.hedge means unhedged
   const liveIce = trade.market.ice.value;
   const retained = ctx.tisRetainedTonnes;
@@
   const notional = hedgedTonnes * fixedPrice;
-  const swapFee = h.feePerMT * hedgedTonnes;
+  const swapFee = (h.feePerMT || 0) * hedgedTonnes;
@@
-  const route = { type: h.route, ... };
-  if (h.route === 'bank_book') {
+  const routeType = h.route || 'bank_book'; // default route when unconfigured (mirrors build-interactive.js)
+  const route = { type: routeType, ... };
+  if (routeType === 'bank_book') {
     route.bankSpread = (h.bankSpreadPerMT || 0) * hedgedTonnes;
-  } else if (h.route === 'third_party') {
-    const initialMargin = h.initialMarginPct * notional;
+  } else if (routeType === 'third_party') {
+    const initialMargin = (h.initialMarginPct || 0) * notional;
     ...
   } else {
-    throw new Error(`buildHedge: unknown route '${h.route}' ...`);
+    throw new Error(`buildHedge: unknown route '${routeType}' ...`);
   }
   ...
   return {
-    route: h.route,
+    route: routeType,
     ...
```

Full diff: `git diff main fix/hedge-validation -- engine/core/hedge.js` (9 insertions, 8 deletions).

The default route `'bank_book'` mirrors the existing convention already used elsewhere in the
codebase for the same fallback (`scripts/build-interactive.js:2785`:
`(trade.hedge && trade.hedge.route) || 'bank_book'`), and the `trade.hedge || {}` pattern itself
mirrors `engine/core/fx-hedge.js:35` (`const h = trade.fxHedge || {};`) and
`engine/flows/trade.js:257` (`{ ...(trade.hedge || {}), iceHedged: !iceHedged }`) — no new shape was
invented. `iceHedged` computation (`!!(trade.hedge && trade.hedge.iceHedged)`) was already
null-safe and required no change; only `buildHedge()`'s internal destructuring was fixed. Behavior
for any trade that already has `trade.hedge` configured (on or off) is byte-for-byte unchanged,
since every field read off `h` falls back to the exact same value the caller already supplied.

## Engine-guard: before

- `node test/invariants.js` → **239 passed, 0 failed**
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — matches documented baseline.

(This is the same result confirmed on `main` immediately before this branch was cut, via the
`engine-guard` subagent, as part of the CSV-export/browser-leak merge sign-off.)

## Engine-guard: after fix (before adding the new test)

- `node test/invariants.js` → **239 passed, 0 failed** (identical count)
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — **unchanged**, matches
  prediction that no tracked fixture would move.
- All 6 individual fixture hashes (not just the combined ALL-USD guard) confirmed byte-for-byte
  identical before/after via a temporary before/after swap of `engine/core/hedge.js` in the same
  worktree.

## Hand-verification: configured-hedge fixture unaffected

`node run.js trades/reference-trade-001.json` (real reference trade, `trade.hedge` present,
`route: bank_book`), post-fix:

```
Standalone profit  (TIS as 100% owner)          $3,126,683.88
- Margin foregone  (TIS opportunity cost)         $678,969.80
= Adjusted profit                               $2,447,714.08
= TIS net profit                                $1,591,014.15
reconciliation: marginForegone + adjusted = standalone -> $3,126,683.88 = $3,126,683.88  OK
Hedge Route: bank_book   lots: 117 (11,700.00 MT)   unhedged: 42.70 MT   basis: 11,742.70 MT retained
Effective ICE cost (hedged) $10,392,289.59   |   unhedged $10,392,289.63   |   delta $-0.04
```

Matches the `LOCAL reference-trade standalone = $3,126,683.88` / `LOCAL reference-trade TIS net =
$1,591,014.15` invariant guards exactly and matches the fingerprint's unchanged reference-trade
hash. No P&L number moved for the configured-hedge case.

## Missing-`trade.hedge` fixture: no longer crashes

Built a scratch fixture (reference-trade-001 clone with the `hedge` key deleted entirely) and called
`computeEquityPartner` directly:

```
trade.hedge present: false
SUCCESS: no throw
hedge.route: "bank_book"   (defaulted)
hedge.swapFee: 0            (feePerMT defaulted to 0)
hedge.fixedPrice: 885       (fell back to liveIce)
routeEconomics.initialMargin: 0 (initialMarginPct default only matters for third_party route)
profit.tisNetProfit: 1591014.15
```

No throw, no NaN. Scratch fixture deleted after use; `git status --short trades/` confirmed clean.

## Regression test — `test/invariants.js`, block `#7b`

Added directly after the existing `#7` hedge block (`test/invariants.js`), asserting:
1. missing `trade.hedge` does not throw;
2. it defaults `route` to `bank_book`;
3. `swapFee` / `extraFinancingCost` come out zero (fee defaulted to 0);
4. `fixedPrice` falls back to live ICE;
5. `tisNetProfit` for the missing-key case is identical to an explicit `iceHedged:false` trade with
   `trade.hedge` present (proves the output shape/behavior genuinely matches the existing "off" case,
   not an invented one);
6. the `hedge` object's key set is identical between the two cases (proves same shape, not just same
   numbers).

**Non-tautology proof (revert-and-rerun):**

- Reverted `engine/core/hedge.js` to the pre-fix version (`git show HEAD:engine/core/hedge.js`) in
  place, without touching `test/invariants.js`, and reran `node test/invariants.js`.
- Result: the suite **crashed entirely** (uncaught exception, not a `FAIL` line — proving the new
  test genuinely exercises the crash path, not a checked assertion that could pass by accident):

  ```
  /Users/davidmong/tis-trading-model/engine/core/hedge.js:24
    const desired = h.hedgedVolumeMT != null ? h.hedgedVolumeMT : retained;
                      ^
  TypeError: Cannot read properties of undefined (reading 'hedgedVolumeMT')
      at buildHedge (/Users/davidmong/tis-trading-model/engine/core/hedge.js:24:21)
      at computeEquityPartner (/Users/davidmong/tis-trading-model/engine/flows/equity-partner.js:121:17)
      at Object.<anonymous> (/Users/davidmong/tis-trading-model/test/invariants.js:203:21)
  ```
- Restored the fixed `engine/core/hedge.js` and reran: **245 passed, 0 failed** (239 baseline + 6
  new `#7b` checks).

## Engine-guard: final (fix + test both in place)

- `node test/invariants.js` → **245 passed, 0 failed**
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — unchanged, `OK (matches
  expected baseline)`.

## Files changed

- `engine/core/hedge.js` — the fix (9 insertions, 8 deletions).
- `test/invariants.js` — regression test block `#7b` (13 lines added).

## Note on stale baseline doc

CLAUDE.md's worktree-checklist section currently cites 220/221 as the historical baseline and flags
itself as possibly stale. Actual count observed throughout this task (on `main` and on this branch
pre-test-addition) was 239 passed/0 failed with `reference-trade-001.json` present — consistent with
the doc's own caveat that 220/221 predates several since-added checks (HP1, PS1, PS2, FI-series,
verify-report-equivalence additions, etc.). This PR's own change moves the count 239 → 245 (+6, all
in the new `#7b` block) — per CLAUDE.md's own instruction ("as part of any future PR that touches
`test/invariants.js`, re-run the suite and update this line in the same PR"), the baseline line in
CLAUDE.md should be reconciled from 220/221 to 245 as part of landing this change.
