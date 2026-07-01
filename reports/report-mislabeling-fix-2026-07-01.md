# Report Mislabeling Fix — 2026-07-01

Branch: `fix/report-mislabeling` (off `main` @ `66fe5d6`, post-merge of `fix/ladder-labeling-hedge-pctsell`).

## Background: merge of fix/ladder-labeling-hedge-pctsell into main

Before starting this work, `fix/ladder-labeling-hedge-pctsell` (66fe5d6) was fast-forward-merged
into `main` and pushed. Pre-push engine-guard on `main` confirmed byte-identical results to the
branch tip:

- `node test/invariants.js` → **236 passed, 0 failed**
- `node scripts/fingerprint.js` ALL-USD guard → **a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162**

No STOP condition — `git push origin main` completed (`fafe563..66fe5d6 main -> main`).

## CLAUDE.md status-flag taxonomy (read before touching report-renderer.js)

The taxonomy (`CLAUDE.md` line 288) is a **display-layer, 3-state** system (no-badge / `INDICATIVE`
/ `⚠ UNVERIFIED`, plus a separate `✓ OK` for recoverable-VAT) remapped from historical engine
strings via `badge()`/`pip()` in `scripts/build-interactive.js`. It does not directly govern the
two bugs below — those are plain string-literal mislabeling bugs in `scripts/report-renderer.js`,
independent of the badge taxonomy — but confirming this ruled out any taxonomy-label conflict
before editing.

## Findings

### 1. Footer disclaimer hardcoded regardless of `isFixture`

`footerSection()` (`scripts/report-renderer.js:1469`, pre-fix) unconditionally printed
`"All figures DUMMY/EXAMPLE data only. Not a real trade."` for every report — including real
client trades. `headerSection()` already computes an `isFixture` check (`/REGRESSION|FIXTURE|dummy/i.test(res.meta.tradeName)`)
for the header's "Fixture" badge, but `footerSection()` never referenced it — a real trade like
`reference-trade-001.json` ("Profogas / Dangote ex-ship gasoil — equity partner (in-kind split)",
no REGRESSION/FIXTURE/dummy marker in the name) rendered a footer falsely claiming its own figures
were dummy data.

### 2. KPI subtitle hardcoded regardless of `res.equityProvider`

`headerSection()`'s TIS Net Profit KPI chip (`scripts/report-renderer.js:819`, pre-fix)
unconditionally printed `"after partner split"`. `profitWaterfall()` and `partnerAndHedge()`
elsewhere in the same file already correctly branch on `const isTisFunded = res.equityProvider === 'TIS'`
(self-funded trades have no partner and no split) — but `headerSection()` never made the same
check, so a self-funded trade (e.g. `sample-exship-tis.json`, `equityProvider: 'TIS'`) showed a
KPI subtitle describing a partner split that didn't happen.

## Fix

```diff
diff --git a/scripts/report-renderer.js b/scripts/report-renderer.js
index 77fe311..2266100 100644
--- a/scripts/report-renderer.js
+++ b/scripts/report-renderer.js
@@ -786,6 +786,7 @@ function headerSection(logo, trade, res) {
   const marginPct    = (exShipPrice && exShipLanded) ? (exShipPrice - exShipLanded) / exShipPrice : null;

   const parties = res.meta.parties || {};
+  const isTisFunded = res.equityProvider === 'TIS';

   // Short title: strip "(REGRESSION FIXTURE, dummy data)" or similar parenthetical caveats
   const shortTitle = esc(res.meta.tradeName.replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi, '').trim());
@@ -816,7 +817,7 @@ function headerSection(logo, trade, res) {
       <div class="kpi-chip ${tisNet < 0 ? 'kpi-loss' : 'kpi-accent'}">
         <span class="kpi-label">TIS Net Profit</span>
         <span class="kpi-value">${fmt.usd(tisNet)}</span>
-        <span class="kpi-sub">after partner split</span>
+        <span class="kpi-sub">${isTisFunded ? 'self-funded — no partner' : 'after partner split'}</span>
       </div>
       <div class="kpi-chip">
         <span class="kpi-label">Annualised Return</span>
@@ -1467,11 +1468,15 @@ function sensitivitiesSection(sens) {
 }

 function footerSection(generatedAt, res) {
+  const isFixture = /REGRESSION|FIXTURE|dummy/i.test(res.meta.tradeName);
+  const disclaimer = isFixture
+    ? 'All figures DUMMY/EXAMPLE data only. Not a real trade.'
+    : 'Confidential — internal use only.';
   return `
 <footer class="report-footer" role="contentinfo">
   TIS Global Trading &mdash; Internal Trade Model Report &mdash;
   ${esc(res.meta.tradeId)} &mdash; Generated ${generatedAt}
-  &mdash; All figures DUMMY/EXAMPLE data only. Not a real trade.
+  &mdash; ${disclaimer}
 </footer>`;
 }
```

`isFixture` in `footerSection()` intentionally re-derives the same regex `headerSection()` already
uses on `res.meta.tradeName`, rather than threading a param through — matching the existing
file convention (each section function is self-contained given `res`).

## Manual rendering verification (not just engine numbers)

Generated actual HTML via `scripts/build-report.js` for two fixtures spanning both booleans:

| Fixture | tradeName marker | equityProvider | KPI subtitle (after fix) | Footer disclaimer (after fix) |
|---|---|---|---|---|
| `reference-trade-001.json` | none (real name) | `partner` (implicit, via `computeEquityPartner`) | `after partner split` | `Confidential — internal use only.` |
| `sample-exship-tis.json` | `(EXAMPLE, dummy data)` | `TIS` | `self-funded — no partner` | `All figures DUMMY/EXAMPLE data only. Not a real trade.` |

Both confirm the fix branches correctly in each direction — a real trade no longer self-labels as
dummy data, and a self-funded trade no longer claims a partner split that never happened. Generated
`out/` artifacts were removed after inspection (gitignored, not part of the fix).

## engine-guard — before / after

Both bugs are display-string-only; no `engine/core` or `engine/flows` file was touched, so the
suite and fingerprint must be byte-for-byte identical before and after.

| | Before (branch baseline, no edits) | After (both fixes applied) |
|---|---|---|
| `node test/invariants.js` | **236 passed, 0 failed** | **236 passed, 0 failed** — unchanged |
| `node scripts/fingerprint.js` ALL-USD guard | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — unchanged, self-reports "OK (matches expected baseline)" |

No STOP condition at either checkpoint.

## Conclusion

Both mislabeling bugs are fixed: the footer now branches on the existing `isFixture` regex (real
trades get an accurate confidentiality notice, fixtures keep the dummy-data disclaimer), and the
KPI subtitle now branches on `res.equityProvider` (self-funded trades no longer claim a partner
split). Verified in actual rendered HTML output for both branches of each condition, and confirmed
display-only via unchanged engine-guard suite (236/0) and fingerprint hash before and after.
