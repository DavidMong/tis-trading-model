# marginBasis Contradiction — Resolved with Primary Evidence (2026-07-01)

Branch: `fix/ladder-labeling-hedge-pctsell`

## 1. Git-log forensic: was `marginBasis` ever hardcoded to `'parallel'`?

```
git log -p --follow -- engine/core/pricing-ladder.js | grep -n "marginBasis\|fxBasis\|^commit "
```

Only **one** commit in this file's entire history touches `marginBasis`/`fxBasis`:

```
commit fcb82aa677987faf4e82c37db3ae8a2697b25870
Author: DavidMong <mongdavid@outlook.com>
Date:   Wed Jul 1 15:57:25 2026 +0100

    Relabel depot ladder margin/markup as INDICATIVE (parallel) vs NAFEM P&L; wire ICE hedge cost and pct_of_sell into ctx
```

Full diff hunk (exact, from `git log -p`, this repo):

```diff
@@ -206,7 +210,14 @@ function buildDepotLadder(trade, compute, baseResult) {

   const rows = tiers.map((t) => {
     const priceNgnPerL = depotLandedNgnPerL + t.spreadNgnPerL;
-    const priceUsdPerMT = (priceNgnPerL * conv.litresPerMT) / fx;
+    const priceUsdPerMT = (priceNgnPerL * conv.litresPerMT) / fx; // PARALLEL-basis conversion — matches the tier pricing basis, INDICATIVE
+    const priceUsdPerMTAtNafem = (typeof nafem === 'number' && Number.isFinite(nafem) && nafem > 0)
+      ? round((priceNgnPerL * conv.litresPerMT) / nafem, 2)
+      : null;
     let tisNetProfit = null;
     let tisNetAfterSurcharge = null;
     let adjustedProfit = null;
@@ -230,12 +241,27 @@ function buildDepotLadder(trade, compute, baseResult) {
       spreadNgnPerL: t.spreadNgnPerL, // metric 3 (absolute, headline)
       priceNgnPerL: round(priceNgnPerL, 4),
       priceUsdPerMT: round(priceUsdPerMT, 2),
-      marginPctOfSell: round(t.spreadNgnPerL / priceNgnPerL, 6), // metric 1 (reference)
-      markupPctOnCost: round(t.spreadNgnPerL / depotLandedNgnPerL, 6), // metric 2
+      marginPctOfSell: round(t.spreadNgnPerL / priceNgnPerL, 6), // metric 1 (reference) — tier-pricing FX basis
+      markupPctOnCost: round(t.spreadNgnPerL / depotLandedNgnPerL, 6), // metric 2 — tier-pricing FX basis
+      marginBasis: conv.fxMarketForDepot, // display only: DERIVED from the trade's actual pricing basis (config-driven, default 'parallel' — never hardcoded, since it's an overridable input)
+      marginStatus: 'INDICATIVE', // status-flag taxonomy — reasonable estimate, NOT reconciled to P&L
       tisNetProfit,
       tisNetAfterSurcharge,
       adjustedProfit,
+      pnlBasis: 'nafem', // depot P&L is UNCONDITIONALLY NAFEM-settled (RULE 1, revenue.js) regardless of the ladder's pricing basis config — this literal is structurally guaranteed, not a live variable
       pnlStatus,
+      reconciliation: { ... },
     };
   });

@@ -246,6 +272,8 @@ function buildDepotLadder(trade, compute, baseResult) {
     costBasePerMT: round(depotLandedPerMT, 4),
     costBaseNgnPerL: round(depotLandedNgnPerL, 4),
     fxUsed: fx,
+    fxBasis: conv.fxMarketForDepot, // DERIVED label for fxUsed — never hardcoded, since fxMarketForDepot is a per-trade config input
+    nafemUsed: nafem,
     litresPerMT: conv.litresPerMT,
     tiers: rows,
   };
```

**Verdict: the stand-in's claim was incorrect from the start.** Every line touching `marginBasis`/`fxBasis` in this diff is a **`+` (addition) line** — there is no `-` (removal) line anywhere in this file's history that ever assigned a hardcoded string literal `'parallel'` to `marginBasis`. The field did not exist before commit `fcb82aa`; it was **born already correctly derived** from `conv.fxMarketForDepot` (itself sourced from `DEFAULT_CONVERSION.fxMarketForDepot` or a per-trade `trade.pricing.conversion` override — both config, never a hardcoded engine constant on a specific value). The only appearance of the literal string `'parallel'` in this diff is inside a **comment** describing what the *default config value* happens to be ("default `'parallel'`") — not a code assignment. There was never a "hardcoding bug" to fix in this commit; the invariants-reviewer's CONTRADICTED verdict on this point is upheld by primary evidence, not just re-review narration.

## 2. CLAUDE.md baseline doc fix

Updated `CLAUDE.md` (worktree setup checklist section, lines ~28-34):
- Symptom example count corrected: `217/221` → `227/231`.
- Added the missing chain of custody: `2d094eb` (220) → `49c5be3` (→221, undocumented) → `d06c341` (reconciled to 221, but by then `fcb82aa` on this same branch had already added ~10 more checks, making 221 stale on arrival too) → actual as of 2026-07-01: **231 passed with fixture / 227 without**.
- Added a durable process instruction: *"as part of any future PR that touches `test/invariants.js`, re-run the suite and update this line in the same PR"* — not a one-time reconciliation, per the user's request.

## 3. New label-pinning assertions in `test/invariants.js`

Added 5 assertions (prefixed `LBL`) directly after the existing PL6 native-depot-ladder block, using the existing `nativeDepot`/`ladDep` fixture. This fixture already satisfies "parallel != NAFEM" without any new fixture needed: `trade.fx.parallel.value = 1600` vs `trade.fx.nafem.value = 1500` (from `trades/sample-equity-partner.json`), and `trade.pricing.conversion.fxMarketForDepot = 'parallel'` (explicit, matching the engine default) — a real reconciling case, not a coincidental no-op.

Assertions added:
1. `tier.marginBasis === 'parallel'`
2. `tier.marginStatus === 'INDICATIVE'`
3. `tier.pnlBasis === 'nafem'`
4. top-level `fxBasis === 'parallel'`
5. `tier.reconciliation.note` names both the NAFEM and parallel bases when they differ

All 5 pass locally (`node test/invariants.js`) and via engine-guard (below). A future regression that flips any of these literal label values (e.g. hardcoding `marginBasis` to some fixed market, or dropping the `INDICATIVE`/`nafem` status strings) will now fail the suite instead of requiring manual inspection.

## 4. engine-guard — before / after

| | Before (baseline) | After (doc + test edits) |
|---|---|---|
| `node test/invariants.js` | **231 passed, 0 failed** | **236 passed, 0 failed** (231 + 5 new LBL checks, all `ok`) |
| `node scripts/fingerprint.js` ALL-USD guard | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — **unchanged**, script self-reports "OK (matches expected baseline)" |

No `engine/core` or `engine/flows` files were touched (only `CLAUDE.md` doc text and `test/invariants.js` assertions) — the byte-for-byte-unchanged fingerprint is exactly the expected outcome, not a coincidence.

## Conclusion

- **marginBasis "hardcoding" claim: CONTRADICTED with primary git-log evidence** — never existed as a hardcoded literal at any commit; the invariants-reviewer's earlier verdict holds up under direct diff inspection.
- **Doc baseline: fixed** (221 → 231/227) with a standing process instruction to prevent recurrence.
- **Label regression coverage: added** (5 new `LBL` assertions), verified passing both locally and via the registered `engine-guard` subagent, with the ALL-USD fingerprint confirmed unchanged before and after.
