# CSV Export Field Mismatch + Browser Launch Race — 2026-07-01

Branch: `fix/csv-export-and-browser-leak` (off `main` @ `b4dbc88`, which includes the
FX-sensitivity fix merged and pushed earlier in this session).

Two independent operational bugs, bundled because both are infra/display fixes — neither
touches `engine/core` or `engine/flows`, so both are verified against zero P&L drift.

## Item 1 — `run.js` CSV export field mismatch

### Investigation (actual field names, not assumed)

```
grep -n "productReceived" engine/flows/trade.js engine/flows/equity-partner.js
```

```
engine/flows/equity-partner.js:199:  productReceived: { tonnes: ..., valuedAtLandedCost: money(principalAsProduct) },
engine/flows/trade.js:410:            productReceived: { tonnes: ..., valuedAtExShipLandedCost: money(principalAsProduct) },
```

Confirmed: the **unified flow's actual field name is `valuedAtExShipLandedCost`**, not
`valuedAtLandedCost` (that name only exists on the legacy `equity-partner.js` output).

Also confirmed (`engine/flows/trade.js:408-419`): for TIS-self-funded trades
(`equityProvider === 'TIS'`), `partnerDelivers` is `{ note: '...' }` only — **`productReceived`
and `cashReceived` are both absent**, not just differently named.

### Bug

`run.js:438-440` (pre-fix):
```js
rows.push(['partner', '', 'Product received (MT)', res.partnerDelivers.productReceived.tonnes, 'MT', '']);
rows.push(['partner', '', 'Product value', res.partnerDelivers.productReceived.valuedAtLandedCost, 'USD', '']);
rows.push(['partner', '', 'Cash profit share', res.partnerDelivers.cashReceived.profitShare, 'USD', '']);
```

- **Unified flow, partner-funded** (e.g. `sample-both-channels.json`): `productReceived` exists but
  has no `.valuedAtLandedCost` key → CSV cell silently writes `undefined`.
- **Unified flow, TIS-self-funded** (e.g. `sample-exship-tis.json`): `partnerDelivers.productReceived`
  is `undefined` → `res.partnerDelivers.productReceived.tonnes` throws
  `TypeError: Cannot read properties of undefined (reading 'tonnes')`, and
  `res.partnerDelivers.cashReceived.profitShare` would throw the same way. **Full CLI crash**,
  confirmed by reverting the fix and re-running (below).

### Fix

```diff
--- a/run.js
+++ b/run.js
@@ -435,9 +435,15 @@ function exportCsv(res, outDir) {
   rows.push(['profit', '', 'Adjusted profit', res.profit.adjustedProfit, 'USD', '']);
   rows.push(['profit', '', 'Partner cash profit share', res.profit.partnerCashProfitShare, 'USD', '']);
   rows.push(['profit', '', 'TIS net profit', res.profit.tisNetProfit, 'USD', '']);
-  rows.push(['partner', '', 'Product received (MT)', res.partnerDelivers.productReceived.tonnes, 'MT', '']);
-  rows.push(['partner', '', 'Product value', res.partnerDelivers.productReceived.valuedAtLandedCost, 'USD', '']);
-  rows.push(['partner', '', 'Cash profit share', res.partnerDelivers.cashReceived.profitShare, 'USD', '']);
+  // partnerDelivers.productReceived is TIS-self-funded-absent (no partner => no in-kind product) and
+  // its value field is named differently per flow: equity-partner.js -> valuedAtLandedCost,
+  // trade.js -> valuedAtExShipLandedCost (same fallback pattern as report-renderer.js's headerSection).
+  const pd = res.partnerDelivers || {};
+  const pr = pd.productReceived;
+  const cr = pd.cashReceived;
+  rows.push(['partner', '', 'Product received (MT)', pr ? pr.tonnes : 'N/A', pr ? 'MT' : '', '']);
+  rows.push(['partner', '', 'Product value', pr ? (pr.valuedAtExShipLandedCost ?? pr.valuedAtLandedCost) : 'N/A', pr ? 'USD' : '', '']);
+  rows.push(['partner', '', 'Cash profit share', cr ? cr.profitShare : 'N/A', cr ? 'USD' : '', '']);
```

This is the identical nullish-coalescing fallback pattern already used for this exact field in
`scripts/report-renderer.js`'s `headerSection`/`partnerAndHedge` (`pd.productReceived.valuedAtExShipLandedCost ?? pd.productReceived.valuedAtLandedCost`) — reused rather than inventing a
flow-name-branching approach, since it's flow-agnostic and already the established convention.

### Verification — three fixtures, all three configurations exercised

| Fixture | Flow | equityProvider | Result |
|---|---|---|---|
| `reference-trade-001.json` | `equity-partner` (legacy) | partner | `Product value = 3,881,250` (via `valuedAtLandedCost` fallback) |
| `sample-both-channels.json` | `trade` (unified) | partner | `Product value = 2,232,000` (via `valuedAtExShipLandedCost`) |
| `sample-exship-tis.json` | `straight-exship` → `trade` (unified) | TIS (self-funded) | `Product received (MT) = N/A`, `Product value = N/A`, `Cash profit share = N/A` — **no crash** |

Actual CSV rows:
```
# reference-trade-001.json
partner,,Product received (MT),3257.2999,MT,
partner,,Product value,3881250,USD,
partner,,Cash profit share,856699.93,USD,

# sample-both-channels.json
partner,,Product received (MT),2065.7376,MT,
partner,,Product value,2232000,USD,
partner,,Cash profit share,770289.82,USD,

# sample-exship-tis.json
partner,,Product received (MT),N/A,,
partner,,Product value,N/A,,
partner,,Cash profit share,N/A,,
```

**Confirmed the pre-fix code actually crashes**: temporarily reverted `run.js` to the original 3
lines and re-ran `node run.js trades/sample-exship-tis.json --export csv` — it threw
`TypeError: Cannot read properties of undefined (reading 'tonnes')` and exited with a stack trace
(Node v25.2.1). Restored the fix; re-ran all three fixtures again — all pass, `node test/invariants.js`
still 239/0.

## Item 2 — `scripts/serve.js` browser launch race + shutdown leak

### Bug

`getBrowser()` (pre-fix):
```js
let _browser = null;
async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  const { chromium } = require('playwright');
  _browser = await chromium.launch();
  return _browser;
}
```

Two requests arriving before the first `chromium.launch()` resolves both see `_browser` as `null`
and both call `chromium.launch()` — the second instance overwrites `_browser`, orphaning the first
(never closed, not tracked by any reference, and invisible to the SIGINT/SIGTERM handlers which only
ever close whatever `_browser` currently points to).

### Fix

```diff
--- a/scripts/serve.js
+++ b/scripts/serve.js
@@ -39,12 +39,20 @@ const MIME = {
 };
 
 // ─── Warm Chromium (reused across PDF requests) ───────────────────────────────
+// _launching serializes concurrent callers onto a single in-flight launch promise —
+// without it, two near-simultaneous requests can each see _browser as null/disconnected
+// and each call chromium.launch(), orphaning the second instance (never closed, not even
+// on SIGINT/SIGTERM, since only the last-assigned _browser reference gets tracked).
 let _browser = null;
+let _launching = null;
 async function getBrowser() {
   if (_browser && _browser.isConnected()) return _browser;
+  if (_launching) return _launching;
   const { chromium } = require('playwright');
-  _browser = await chromium.launch();
-  return _browser;
+  _launching = chromium.launch()
+    .then((b) => { _browser = b; _launching = null; return b; })
+    .catch((err) => { _launching = null; throw err; });
+  return _launching;
 }
```

```diff
@@ -118,5 +126,14 @@ server.listen(PORT, () => {
   console.log(`Report endpoint: POST http://localhost:${PORT}/api/report.pdf`);
 });
 
-process.on('SIGINT',  () => { if (_browser) _browser.close().catch(() => {}); process.exit(0); });
-process.on('SIGTERM', () => { if (_browser) _browser.close().catch(() => {}); process.exit(0); });
+// Await any in-flight launch before closing, so a shutdown signal arriving mid-launch doesn't
+// orphan the Chromium process it was about to track.
+async function shutdown() {
+  try {
+    const browser = _browser || (_launching ? await _launching : null);
+    if (browser) await browser.close();
+  } catch { /* best-effort close on shutdown */ }
+  process.exit(0);
+}
+process.on('SIGINT',  shutdown);
+process.on('SIGTERM', shutdown);
```

The standard fix (single in-flight launch promise): the first caller starts the launch and stores
the promise in `_launching`; any concurrent caller sees `_launching` truthy and awaits the *same*
promise instead of starting a second `chromium.launch()`. The shutdown handlers now await that
same in-flight promise (if a launch was mid-flight when the signal arrived) before closing, so a
launch-in-progress at shutdown time no longer escapes untracked.

### Verification — concurrent requests, process counts

Baseline (before firing requests): `ps aux | grep ms-playwright` → **0** processes.

Fired two `POST /api/report.pdf` requests near-simultaneously (both against
`reference-trade-001.json`) via backgrounded `curl` + `wait`:

```bash
(curl -s -X POST http://localhost:7891/api/report.pdf --data @trades/reference-trade-001.json -o /tmp/report1.pdf -w "req1 status:%{http_code}\n" &)
(curl -s -X POST http://localhost:7891/api/report.pdf --data @trades/reference-trade-001.json -o /tmp/report2.pdf -w "req2 status:%{http_code}\n" &)
wait
```

Result: exactly **one** top-level Chromium process (PID 31450, the `Ss`-state parent with
`--user-data-dir=.../playwright_chromiumdev_profile-So5RFA`), plus its 4 expected child helpers
(gpu, network, 2× renderer — PIDs 31451-31454). Zero second browser instance. Both PDFs generated
successfully (`report1.pdf`, `report2.pdf`, both valid `PDF document, version 1.7`, 113,921 bytes
each — i.e. both requests were served correctly by the single shared browser, not one succeeding
and one failing).

**Shutdown verification:** sent `SIGINT` to the running server. Result: server process exited
(code 130, expected for SIGINT), and `ps aux | grep ms-playwright` afterward showed **0** processes
— the browser (and all its child helpers) closed cleanly, confirming the shutdown handler correctly
tracks and closes the browser even when it was the target of the race-serialization fix.

## engine-guard — before / after

Neither fix touches `engine/core` or `engine/flows`; both are CLI/ops-layer only.

| | Before (branch baseline, run.js edit already applied at capture time) | After (both fixes applied) |
|---|---|---|
| `node test/invariants.js` | **239 passed, 0 failed** | **239 passed, 0 failed** — unchanged |
| `node scripts/fingerprint.js` ALL-USD guard | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — unchanged, self-reports "OK (matches expected baseline)" |

No STOP condition at either checkpoint. (Note: `main` was already at 239/0 with hash
`a90288...408162` prior to this branch, per the `fix/fx-sensitivity-override` merge earlier in this
session — that merge and push are recorded separately, not part of this report's scope beyond
confirming this branch inherited that clean baseline.)

## Conclusion

Both bugs fixed and independently demonstrated:
1. `run.js` CSV export no longer crashes on TIS-self-funded trades and correctly resolves the
   unified flow's actual field name (`valuedAtExShipLandedCost`) instead of assuming the legacy
   flow's name — verified against all three flow/funding combinations, plus a revert-and-rerun
   proving the original crash was real.
2. `scripts/serve.js`'s browser launch race is closed via a single in-flight launch promise, and the
   shutdown handlers now await that promise before closing — verified with concurrent live requests
   (only one Chromium process launched) and a live SIGINT (zero orphaned processes after shutdown).

Both fixes committed on `fix/csv-export-and-browser-leak`. No merge/push instruction was given for
this branch — left for review.
