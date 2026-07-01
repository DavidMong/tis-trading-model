# Tautology audit — test/invariants.js (+ test/verify-report-equivalence.js) — 2026-07-01

Branch: `fix/tautology-audit`, based on `main` @ `0d1ec2c` (post `.gitignore`/`.claude` tracking commit).

## Scope and method

Read every one of `test/invariants.js`'s ~249 `check()`/`expectThrow()` calls (all ~984 lines) plus
the three named "known suspects." For each, classified the construction method:

- **Independently grounded** — expected value derived from raw trade config or a hardcoded ratio/
  formula stated directly in the test, not read back from the same engine computation being verified
  (e.g. `0.25 * r.cargoValue`, `trade.costLines.nimasaCabotagePct * freightBaseV`). This is what makes
  a check able to catch a real bug.
- **Structural cross-check** — compares two DIFFERENT engine-exposed output fields against each other
  (e.g. ladder tier price vs. a direct engine rerun at that price; `principalTie.returnedProductValue`
  vs. `financing.partnerFunding`). Legitimate — a wiring/derivation bug breaking the relationship
  between the two fields would be caught, even though both sides come from the engine.
- **Tautological** — expected value re-derived from the SAME local variables / SAME defining formula
  as what's being asserted, inside the SAME function scope, so the assertion is guaranteed true by
  algebra regardless of any bug elsewhere. This is the anti-pattern being hunted.
- **Hardcoded pass** — `assert(x, true)` or equivalent: passes unconditionally, checks nothing at
  runtime.

For every confirmed tautology, fixed it to assert against an independently-derived value, then proved
the fix non-tautological via **synthetic counter-example** (constructing the exact buggy scenario the
old check would have missed, showing old-check-passes / new-check-fails side by side) — the method the
task instructions explicitly allow alongside git-history revert-and-rerun, used here because these are
bugs in the *test's own assertion logic* rather than bugs with a prior buggy commit in git history to
revert to.

## Known suspect #1 — hardcoded `assert(..., true)`

Grepped `test/invariants.js` programmatically (parsing every `check(...)` call and checking whether its
condition argument is the literal `true`) — **zero matches**. The pattern does not exist in
`test/invariants.js`.

It DOES exist in the sibling harness `test/verify-report-equivalence.js` (not `invariants.js`, but
named explicitly by the user as a known suspect from "the original full-codebase review," so chased
down and fixed here too) — **two instances**:

1. **`checkNoMutation()`, line 86** (before fix): after looping through every snapshotted key and
   asserting individually on any mismatch, it unconditionally asserted `res not mutated` as `true` —
   this final assertion added nothing beyond the per-key loop above it, and would even pass vacuously
   if the snapshot were empty (0 keys compared, "0 mismatches out of 0" reads as success).
   **Fixed:** now asserts `mismatches === 0 && Object.keys(before).length > 0` — an actual derived
   boolean, and additionally guards against the vacuous empty-snapshot case.

2. **No-sell-price gating check, line 135** (before fix):
   `assert('...download button gated...', true)` — a hardcoded claim justified only by "verified by
   code review" in a comment, not a runtime check. If the `hasSellPrice` gate around `_lastRes` were
   later removed from `scripts/build-interactive.js`, this assertion would keep passing forever.
   **Fixed:** now `fs.readFileSync`s `scripts/build-interactive.js` and regex-matches the actual
   gating pattern (`if (hasSellPrice) { ... _lastRes = res ... }`) every run, so a regression there
   fails the suite instead of silently drifting from the source.

**Non-tautology proof (synthetic counter-example)** — for both:

```
Synthetic empty snapshot (simulates cloneNumbers() silently returning {}):
OLD check (hardcoded true) result: true   <-- MISSES the vacuous case (always true)
NEW check (mismatches===0 && length>0) result: false   <-- CATCHES the vacuous case (correctly fails)

Synthetic regressed source (gate removed from build-interactive.js):
OLD check (hardcoded true) result: true   <-- MISSES the regression unconditionally (always true)
NEW check (re-verified against source) result: false   <-- CATCHES the regression (correctly fails)
```

## Known suspect #2 — NaN-detection check misses the NGN formatting pattern

Confirmed exactly as described, in `test/verify-report-equivalence.js` (two instances, lines 132 and
256 before fix):

```js
assert('No "NaN" in HTML', !html.includes('>NaN<') && !html.includes('$NaN') && !html.includes('NaN%'));
```

This enumerates three specific surface patterns (`>NaN<`, `$NaN`, `NaN%`) but never checks for `₦NaN`
— and this codebase's own NGN formatter (both the test's local `fmtNgn()` at line 32-37 and the
production `fmt.ngn()` in `scripts/report-renderer.js:20-26`) prefixes negative-safe output with `₦`,
never `$`, for naira amounts. A NaN leaking through the NGN path (`'₦' + 'NaN'` when `n < 0` is false
for `NaN`) would render as `₦NaN` in the HTML and slip past every one of the three old patterns
undetected. (Production `fmt.ngn`/`fmt.usd`/`fmt.pct` in `report-renderer.js` do guard against this
with an `Number.isFinite` check before formatting — so there is no LIVE bug today — but the test's
defensive sweep is supposed to catch any FUTURE leak regardless of source, and as written it structurally
cannot catch a ₦-prefixed one.)

**Fixed:** replaced the enumerated list with a blanket substring check, `!html.includes('NaN')`.
Verified via grep that the literal string "NaN" does not otherwise appear anywhere in
`report-renderer.js`'s static labels/copy, so this has no false-positive risk.

**Non-tautology proof (synthetic counter-example):**

```
Synthetic HTML with a leaked ₦NaN: "<div>Some report text</div><dd>₦NaN</dd><p>All good</p>"
OLD check (enumerated $NaN/>NaN</NaN%) result: true   <-- MISSES the leak (false pass)
NEW check (blanket NaN substring) result: false   <-- CATCHES the leak (correctly fails)
```

## Known suspect #3 — general sweep for same-formula-as-tested tautologies (in `test/invariants.js`)

Grepped every `.ok` field usage (`principalTie.ok`, `reconciliation.ok`) since these are the suite's
own internal "self-check" flags computed by the engine and merely read back by the test — the highest-
risk pattern for exactly this anti-pattern (the flag and the thing it's supposed to validate are
computed from the same local variables in the same function). Found **two confirmed families**, 8
individual check sites total:

### 3a. `r.partnerDelivers.principalTie.ok` (equity-partner.js) — 1 site (line 68, "#6")

`engine/flows/equity-partner.js` computes:
```js
const principalAsCash = partnerPrincipal - principalAsProduct;  // RESIDUAL, by definition
// ...
principalTie: { ok: Math.abs(principalAsProduct + principalAsCash - partnerPrincipal) < 0.01 }
```
Since `principalAsCash` is *defined* as the residual `partnerPrincipal - principalAsProduct`, the sum
`principalAsProduct + principalAsCash` equals `partnerPrincipal` **algebraically, always** — this can
never be false regardless of any bug (e.g. a bug that miscomputes `partnerPrincipal` itself, such as a
wrong equity-ratio read in `financing.js`, leaves the residual identity fully intact, since the residual
just re-derives from whatever `partnerPrincipal` turns out to be).

**Fixed:** grounded in the independent `0.25 × cargoValue` formula (same method as the funding-stack
check at the top of the file, which independently validates the equity-ratio chain from raw config).

**Non-tautology proof (synthetic counter-example — a funding-ratio bug):**
```
Synthetic funding-ratio bug: engine computed partnerPrincipal = $200,000 instead of the correct
$250,000 (25% of $1,000,000 cargo value)
OLD check (definitional identity): true   <-- MISSES the funding-ratio bug (always true by construction)
NEW check (grounded in independent 25% x cargoValue): false   <-- CATCHES it ($200,000 != $250,000)
```

### 3b. `tuPd.principalTie.ok` (trade.js FX-TRUEUP block) — 1 site

Same algebraic pattern, in the OTHER flow (`computeTrade` / `trade.js`):
```js
cashTrueUp = principalAsProduct - partnerPaperValue;      // residual
principalAsCash = partnerPrincipal - principalAsProduct;   // residual
principalTie: { ok: Math.abs(partnerPaperValue + cashTrueUp + principalAsCash - partnerPrincipal) < 0.01 }
```
The existing in-repo comment at this test site explicitly claimed this was "the REAL settlement
identity... not the tautological principalAsProduct + cash = principal" (from an earlier fix, commit
history around the FX-TRUEUP regression). **That claim is incorrect** — the same residual-by-definition
argument applies, just one level deeper (`cashTrueUp` and `principalAsCash` are BOTH residuals of
`principalAsProduct`/`partnerPrincipal`), so `.ok` here is equally tautological. The check as originally
written combined `.ok` with a second, genuinely meaningful clause
(`approx(returnedProductValue + returnedCash, financing.partnerFunding, 0.02)` — comparing EXPOSED
output fields against a SEPARATE engine field, which does catch a wiring disconnect) — the `.ok` clause
contributed nothing to that compound check.

**Fixed:** dropped the tautological `.ok` clause; kept only the genuinely meaningful wiring check, and
corrected the misleading comment.

**Non-tautology proof (synthetic counter-example — same funding-ratio bug class, trade.js path):**
```
OLD tuPd.principalTie.ok (definitional): true   <-- MISSES a partnerPrincipal wiring bug (always true)
NEW check (tied to financing.partnerFunding): false   <-- CATCHES it ($300,000 delivered != $400,000 owed)
```

### 3c. `.profit.reconciliation.ok` used as the SOLE condition — 6 sites

Both flows compute `reconciliation.ok` the same tautological way:
```js
// equity-partner.js
const adjustedProfit = standaloneProfit - marginForegone;                 // defined this way
reconciliation.ok = Math.abs(marginForegone + adjustedProfit - standaloneProfit) < 0.01;  // always true

// trade.js
adjustedProfit = standaloneProfit - marginForegone;   // (or = standaloneProfit when no partner)
reconciliation.ok = Math.abs(standaloneFloat + iceHedgeNetImpact + fxHedgeNetImpact - standaloneProfit) < 0.01
                  && Math.abs(marginForegone + adjustedProfit - standaloneProfit) < 0.01;  // always true
```
`adjustedProfit` is *literally computed* as `standaloneProfit − marginForegone` in both flows, so
"`marginForegone + adjustedProfit = standaloneProfit`" is guaranteed by substitution, not by any actual
correctness of the underlying numbers. A bug that drops a term from `standaloneProfit`'s own formula
(e.g. forgetting to add the ICE hedge impact) leaves `reconciliation.ok` completely unaffected, because
`adjustedProfit` just re-derives from whatever `standaloneProfit` happens to be.

Grepped all 7 usages of `.reconciliation.ok` in the suite. **1 of the 7 was already fine** (`PL2`, line
642, already combines it with an independent `approx(standaloneProfit, combinedUSD − allInCost)` check
in the same `&&` expression — this is the correct pattern, used as the template for the other 6 fixes).
**6 were the sole condition** and genuinely tautological:

| Site | Trade / scenario |
|---|---|
| `FX7` | depot-only, TIS self-funded |
| `HX9` | both-channels, ICE+FX hedges both ON |
| `HP1` | equity-partner, ICE hedge ON |
| `PL3` | all-naira revenue legs |
| `CFG2` | cost-line type-flip override |
| `FI7` | settled final ICE + ICE hedge ON, both hi/lo scenarios |

**Fixed all 6**, each grounded in an independent recompute of `standaloneProfit` from
`revenue.combinedUSD − cost.allInCost` (+ hedge impacts where applicable, or
`deliveredQty × perMtMargin − hedge cost` for the equity-partner-flow case, HP1, which doesn't expose a
`revenue` block) — mirroring PL2's already-correct pattern exactly, so no new construction style was
invented.

**Non-tautology proof (synthetic counter-example — representative of all 6, same underlying pattern):**
```
Synthetic bug: standaloneProfit computed WITHOUT the ICE hedge impact term (dropped -$50,000)
OLD check (reconciliation.ok, definitional): true   <-- MISSES the dropped-term bug (always true by
                                                          construction, regardless of what standalone
                                                          actually equals)
NEW check (standalone == revenue-cost+iceImpact+fxImpact, independent recompute): false   <-- CATCHES
                                                          the dropped-term bug ($1,000,000 != $950,000)
```

## Full section-by-section review (all other check groups — cleared, no fix needed)

Every remaining group was read and classified. None showed the same-formula-as-tested pattern:

- **Funding stack (lines 31-34)** — `0.25 * r.cargoValue` / `0.75 * r.cargoValue`: independently
  grounded (hardcoded ratios matching the trade's own config, not read back from `financing.pct`).
  `fundingStackPctOfCargo === 1` is *weak* (financing.js already `throw`s if the ratios don't sum to 1,
  so this re-checks the same guard's own condition) but not fully vacuous — it protects against the
  `throw` guard itself being weakened or removed in the future, a different and real risk class from
  the reconciliation/principalTie pattern. Left as-is; noted here for visibility rather than "fixed"
  since converting it wouldn't add coverage beyond what's already independently checked at 33/34.
- **Recoverable VAT (36-41)** — sums `r.cost.lines` (raw line array) independently by `.recoverable`
  flag; a genuine aggregate cross-check, not circular.
- **Ex-ship price (43-50), partner tonnes×landed (52-55), profit waterfall identities (57-65)** —
  cross-check DIFFERENT engine-exposed fields against each other (structural cross-check, legitimate).
- **profitSharePct reflow (70-75), zero-allocation (77-81), WHT/surcharge status (83-90)** — grounded in
  raw config/schema passthrough, not computed identities.
- **Fixed-price cost-bump directionality (92-99)** — checks `<`/`>` direction after independently
  bumping raw inputs (ICE/FOB/TC), not re-deriving a formula.
- **Pricing ladder #12 block, PL6/PL7/SC-LADDER "WYSIWYG" checks** — all explicitly compare ladder
  output against a SEPARATE, independent direct-engine rerun at the same price. This is the strongest
  pattern in the suite (any divergence between the ladder's internal math and a real engine run fails
  it) — confirmed non-circular by construction, no fix needed.
- **`#1`-`#5`, `#7`/`#7b`, FX1-FX11, SU1-SU7, SC1-SC5, HX1-HX8, PS1/PS2, PL1/PL2/PL4/PL4b/PL5, LBL, MX,
  CFG0/CFG1/CFG3/CFG4/CFG5, FI0-FI8** — all independently grounded in raw trade config, hardcoded
  formulas, or genuine cross-field structural checks (several — FX11, HP1, PS1/PS2, hedge `#7b`,
  rounding `#5` — were already explicitly proven non-tautological via revert-and-rerun in prior PRs on
  this branch history; re-confirmed their construction here rather than re-running the full revert
  procedure again, since nothing about those checks changed in this pass).
- **`expectThrow()` calls** — verify an exception is actually thrown (and, where a `frag` is given, that
  the message contains a specific substring); this is a different, non-numeric-tautology risk class
  (could theoretically pass on the WRONG exception if no `frag` is given) but is a pre-existing, accepted
  design choice throughout the suite, not a same-formula circularity — out of scope for this pass.

No other `.ok`-style internal-flag reads, and no other `check(x, true)`-style hardcoded passes, exist
anywhere else in `test/invariants.js`.

## Engine-guard: before the audit

- `node test/invariants.js` → 249 passed, 0 failed
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — matches documented baseline.

## Engine-guard: after the audit

- `node test/invariants.js` → **249 passed, 0 failed** (same count — every fix was a 1:1 replacement of
  an existing check, not an addition; no engine files were touched by this pass, only test assertions)
- `node test/verify-report-equivalence.js` → **77 passed, 0 failed** (same count, same reasoning)
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — **unchanged**.
- Without-fixture count re-verified: **245 passed** (unchanged; same LOCAL-guard diff of 4).

**CLAUDE.md baseline line: no update needed.** This pass changed check *quality*, not check *count* —
`test/invariants.js` stays at 249/245 (fixture/no-fixture), identical to the count already documented
after the rounding-epsilon PR. `test/verify-report-equivalence.js` is not covered by that baseline line
(it has no LOCAL-guard split).

## Files changed

- `test/invariants.js` — 1 principalTie fix (#6), 1 FX-TRUEUP principalTie fix, 6 reconciliation.ok
  fixes (FX7, HX9, HP1, PL3, CFG2, FI7). Net: 58 insertions, 14 deletions (comments + replaced
  assertions); check count unchanged at 249 (1:1 replacements).
- `test/verify-report-equivalence.js` — 2 hardcoded-`true` fixes (`checkNoMutation`, no-sell-price
  gating), 2 NaN-pattern-gap fixes (priced-trade block, no-sell-price block). Net: 31 insertions, 5
  deletions; check count unchanged at 77 (1:1 replacements, one new `fs` import).

## Note on scope not covered

This pass was a full read-through and targeted fix of `test/invariants.js` plus the two named-but-
elsewhere suspects. It did **not** re-run the exhaustive revert-and-rerun procedure on the ~230 checks
already classified as independently grounded or structural cross-checks — those were verified by
reading their construction (does the expected-value side reference raw config / a different exposed
field, or the exact same local variables as the assertion), which is sufficient to rule out the specific
same-formula-as-tested anti-pattern this audit targeted. A more exhaustive campaign (synthetic bug
injection against every check individually) would be a substantially larger undertaking and was not
what this pass's scope — "confirm or clear the named suspects, plus a general sweep for the same
anti-pattern" — called for.
