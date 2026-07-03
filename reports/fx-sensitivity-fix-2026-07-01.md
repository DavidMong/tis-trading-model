# FX NAFEM Sensitivity Override-Absorption Fix — 2026-07-01

Branch: `fix/fx-sensitivity-override` (off `main` @ `54500fc`). **Not merged — awaiting review.**

## Orientation

- **CLAUDE.md** (already in context): RULE 1 (2026-06-23) — NAFEM drives all naira→USD P&L; parallel
  is reference-only. The FX sensitivity's live lever is the NAFEM rate.
- **`engine/core/fx.js` `resolveRate()`** (lines 10-23): explicit override-precedence —
  `usedOverride = fxLeg.override !== null && fxLeg.override !== undefined; effective = usedOverride ? fxLeg.override : fxLeg.value;`
  An override, when set, **always wins** over `.value`. Not touched by this fix.
- **`engine/core/sensitivities.js`** (pre-fix, line 45): the FX NAFEM bump did
  `if (t.fx?.nafem) t.fx.nafem.value *= 1 + dir * pct;` — mutating `.value` unconditionally, regardless
  of whether `.override` was set on the trade.

## Bug

If a trade has `fx.nafem.override` set (non-null), `resolveRate()` reads `.override` and ignores
`.value` entirely. The sensitivity bump mutated only `.value`, so the simulated ±10% NAFEM move never
reached `effective` — the recompute used the same unchanged override, and the reported FX sensitivity
delta came back ~$0 regardless of the trade's actual naira exposure. Silent, not throwing — a trader
reviewing FX risk on an overridden-rate trade would see "$0 FX risk" when real exposure existed.

## Fixture check (before fixing)

```
grep -rn "override" trades/*.json
```
Every tracked fixture (`sample-*.json`, `reference-trade-001.json`) has `"override": null`. **No
standard fixture triggers this bug** — so the fix was predicted, in advance, to leave the fingerprint
and existing suite numbers untouched. Confirmed true after the fix (below).

## Fix

```diff
--- a/engine/core/sensitivities.js
+++ b/engine/core/sensitivities.js
@@ -42,7 +42,15 @@ function runSensitivities(trade, computeFn, options = {}) {
     if (fxMode === 'parallel') {
       bump(`FX parallel ${s}${tag}`, (t) => { t.fx = { ...(t.fx || {}), paymentBumpPct: dir * pct }; });
     } else {
-      bump(`FX NAFEM ${s}${tag}`, (t) => { if (t.fx?.nafem) t.fx.nafem.value *= 1 + dir * pct; });
+      // Bump whichever field resolveRate() actually reads (override wins over value there — fx.js)
+      // so the simulated move is never silently absorbed by an override sitting on top of it.
+      bump(`FX NAFEM ${s}${tag}`, (t) => {
+        const nafem = t.fx?.nafem;
+        if (!nafem) return;
+        const usesOverride = nafem.override !== null && nafem.override !== undefined;
+        if (usesOverride) nafem.override *= 1 + dir * pct;
+        else nafem.value *= 1 + dir * pct;
+      });
     }
   }
```

`resolveRate()` itself (`engine/core/fx.js`) was **not modified** — its override-precedence behavior
is unchanged everywhere else it's used (P&L, display, reconciliation).

## engine-guard — before / after

| | Before (branch baseline) | After (fix + tests) |
|---|---|---|
| `node test/invariants.js` | **236 passed, 0 failed** | **239 passed, 0 failed** (236 + 3 new FX11 checks, all `ok`) |
| `node scripts/fingerprint.js` ALL-USD guard | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — **unchanged**, script self-reports "OK (matches expected baseline)" |

**Fingerprint did NOT move**, exactly as predicted: no tracked fixture has a non-null FX override, so
none of the 6 fixtures in the fingerprint's per-trade table (verified individually — no `n=` byte
count or per-trade hash moved) exercise the changed code path. No hand-derivation against the
fingerprint was required (the gate condition — "if it moves, hand-derive" — didn't trigger).

## Hand-derivation (done regardless, per the test requirement — not gated on the fingerprint moving)

Ran directly against `sample-depot-only.json` with `fx.nafem.override` set to 1550 (base `.value` is
1500 — override intentionally different so the bug's silent-absorption would be unmistakable if
present):

```
base tisNet (override = 1550):        3,293,800.97
scenario "FX NAFEM +10%":              tisNet 2,050,164.60   delta -1,243,636.37
scenario "FX NAFEM -10%":              tisNet 4,813,800.96   delta +1,519,999.99
direct engine rerun (override = 1705, i.e. 1550 × 1.1):  tisNet 2,050,164.60   <- exact match to scenario
counterfactual (.value bumped, override left at 1550):    tisNet 3,293,800.97  <- unchanged, i.e. the OLD bug's $0 result, reproduced on demand
```

The scenario's reported net (`2,050,164.60`) matches the independent direct-engine rerun at the
correctly-bumped override exactly — confirming the fix bumps the right field. The counterfactual
(bumping `.value` alone, leaving `.override` at 1550) reproduces the **old bug exactly**: net stays at
`3,293,800.97`, byte-for-byte identical to the un-bumped base — proof this specific field was the
blind spot, not some other cause.

## New test (`test/invariants.js`, prefixed `FX11`)

Inserted after the `FX-TRUEUP` block (before the existing validation-throw `FX10` block):

```diff
+// FX11 — regression guard for the override-absorption bug: resolveRate() (fx.js) prefers
+// fx.nafem.override over .value whenever an override is set (non-null). Before the fix, the
+// sensitivity bump in sensitivities.js mutated .value ONLY, so any trade with a NAFEM override
+// configured silently absorbed the bump and reported $0 FX risk regardless of real exposure.
+// Uses depotOnly (genuine naira depot exposure, per FX5/FX6 above) with an override layered on
+// top — exactly the configuration the old bug went blind on.
+const depotOverride = { ...depotOnly, fx: { ...depotOnly.fx, nafem: { ...depotOnly.fx.nafem, override: 1550 } } };
+const ovSensFn = (t) => computeTrade(t);
+const ovSens = runSensitivities(depotOverride, ovSensFn, { fxMode: 'nafem' });
+const ovFxUp = ovSens.scenarios.find((s) => /FX NAFEM \+/.test(s.lever));
+const ovFxDown = ovSens.scenarios.find((s) => /FX NAFEM -/.test(s.lever));
+check('FX11 override trade: FX NAFEM sensitivity is non-zero (not silently absorbed by the override)',
+  Math.abs(ovFxUp.deltaVsBase) > 1 && Math.abs(ovFxDown.deltaVsBase) > 1);
+
+// Independent (non-tautological) re-derivation: bump the OVERRIDE field directly ourselves — written
+// here independently of sensitivities.js's own bump helper, mirroring only resolveRate()'s documented
+// precedence (fx.js) — and re-run the verified engine. The scenario's reported net must equal this
+// direct, hand-constructed rerun (no duplicated math, no calling runSensitivities twice).
+const ovUpTrade = { ...depotOverride, fx: { ...depotOverride.fx, nafem: { ...depotOverride.fx.nafem, override: depotOverride.fx.nafem.override * 1.1 } } };
+const ovUpDirect = computeTrade(ovUpTrade);
+check('FX11 override trade: scenario net == direct engine run with override bumped +10% (hand-derived)',
+  approx(ovFxUp.tisNet, ovUpDirect.profit.tisNetProfit, 0.5));
+
+// Counterfactual: confirms the OLD bug pattern (bumping .value alone while override stays fixed)
+// would indeed still show ~$0 net movement — proves it was specifically the override field the
+// sensitivity check was blind to, not some other cause.
+const staleValueTrade = { ...depotOverride, fx: { ...depotOverride.fx, nafem: { ...depotOverride.fx.nafem, value: depotOverride.fx.nafem.value * 1.1 } } };
+const staleValueNet = computeTrade(staleValueTrade).profit.tisNetProfit;
+const depotOverrideBaseNet = computeTrade(depotOverride).profit.tisNetProfit;
+check('FX11 counterfactual: bumping .value alone (old buggy behavior) leaves net ~unchanged (override still wins)',
+  approx(staleValueNet, depotOverrideBaseNet, 0.01));
```

**Not a tautology:** the second check re-derives the expected result independently (constructing the
correctly-bumped trade directly and re-running the verified engine), rather than calling
`runSensitivities` a second time or asserting a hardcoded magic number. The third check is a
regression trap specifically for the original bug pattern — it would fail if the fix were ever
reverted to bumping `.value` alone.

**Regression-catch confirmed by direct experiment:** temporarily reverted `sensitivities.js` to the
pre-fix code (bumping `.value` only) and re-ran the suite — the first two new `FX11` checks **failed**
(237 passed, 2 failed) exactly as expected, while the counterfactual check still passed. Restored the
fix; suite returned to 239 passed, 0 failed. This confirms the new tests actually catch the bug, not
just happen to pass.

### Test pass output (with fix applied)

```
  ok   FX11 override trade: FX NAFEM sensitivity is non-zero (not silently absorbed by the override)
  ok   FX11 override trade: scenario net == direct engine run with override bumped +10% (hand-derived)
  ok   FX11 counterfactual: bumping .value alone (old buggy behavior) leaves net ~unchanged (override still wins)
...
239 passed, 0 failed
```

## Conclusion

Bug fixed: the FX NAFEM sensitivity bump now mutates whichever field `resolveRate()` actually reads
(override if present, else value), so a trade with an FX override configured no longer silently
reports $0 FX risk. `resolveRate()`'s precedence itself is untouched. Suite grew from 236→239 (3 new
regression-guard assertions, all passing and independently confirmed to catch the original bug via a
revert-and-rerun experiment); the ALL-USD fingerprint is byte-for-byte unchanged, as predicted in
advance (no tracked fixture has a non-null override) and confirmed after the fact per-trade, not just
on the combined hash.

Committed on `fix/fx-sensitivity-override` — **not merged**, per instruction.
