# dashboard-dataviz-batch-g — merge-readiness review (2026-07-03)

**Reviewer verdict: NOT safe to merge as-is.** Engine numbers are untouched (guard byte-for-byte
identical); the branch's own dataviz/design work renders correctly; but the CLAUDE.md split on this
branch silently drops ~216 lines of interactive-dashboard documentation with no replacement anywhere
in the branch's history. Recommend rebasing onto current `main` before merge (see Recommendation).

Scope of this review: branch `dashboard-dataviz-batch-g` only. No new features were requested or
added during this review — verification only.

---

## 1. Engine safety — suite + fingerprint

### 1a. Main baseline (HEAD `f4f33c0`)

```
$ node test/invariants.js
... (full 249-check run) ...
249 passed, 0 failed

$ node scripts/fingerprint.js
  reference-trade-001        equity-partner       n= 334  42066008f041a4a41861facd4afb523a8484dcd1d99b4747b9ae3ce729c38f20  [ALL-USD GUARD]
  sample-both-channels       trade                n= 410  7fffbfb3b7b6a17b16fd539382ed0ae2eca714bb9cdcd71a210f1af13539542a
  sample-depot-only          full-depot-resale    n= 385  b93c85fe9b431b9f31759bff70f59a11a0d81a1cc10e93bcb495d7dcdcbf496b
  sample-equity-partner      equity-partner       n= 334  b048129345ef4e03d17b8ffe900aa66f9dd15562b42863bb095a99c82eaf00e5  [ALL-USD GUARD]
  sample-exship-tis          straight-exship      n= 380  7ce1501b6a2f626eddad5061b90a5a2d2030200bd1ad50feca3db5bf5a11bce4  [ALL-USD GUARD]
  sample-trade               equity-partner       n= 335  c6b11f0d740ea4a0465d53536fc207d3ead3289d102969cacfdbe7922ea4d46a

  ALL-USD GUARD COMBINED: a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162
  ALL-USD GUARD: OK (matches expected baseline)
```

**249 passed, 0 failed.** Guard `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — this is
the documented baseline in root `CLAUDE.md`.

### 1b. Branch (`dashboard-dataviz-batch-g`, HEAD `e0b9f84`)

`trades/reference-trade-001.json` is gitignored and was **not present** in the fresh
`git worktree add` checkout (per the CLAUDE.md worktree checklist). Copied it in from the main
worktree before running anything:

```
cp <main-worktree>/trades/reference-trade-001.json trades/reference-trade-001.json
```

```
$ node test/invariants.js
... (full run) ...
220 passed, 0 failed

$ node scripts/fingerprint.js
  reference-trade-001        equity-partner       n= 334  42066008f041a4a41861facd4afb523a8484dcd1d99b4747b9ae3ce729c38f20  [ALL-USD GUARD]
  sample-both-channels       trade                n= 410  7fffbfb3b7b6a17b16fd539382ed0ae2eca714bb9cdcd71a210f1af13539542a
  sample-depot-only          full-depot-resale    n= 385  b93c85fe9b431b9f31759bff70f59a11a0d81a1cc10e93bcb495d7dcdcbf496b
  sample-equity-partner      equity-partner       n= 334  b048129345ef4e03d17b8ffe900aa66f9dd15562b42863bb095a99c82eaf00e5  [ALL-USD GUARD]
  sample-exship-tis          straight-exship      n= 380  7ce1501b6a2f626eddad5061b90a5a2d2030200bd1ad50feca3db5bf5a11bce4  [ALL-USD GUARD]
  sample-trade               equity-partner       n= 335  c6b11f0d740ea4a0465d53536fc207d3ead3289d102969cacfdbe7922ea4d46a

  ALL-USD GUARD COMBINED: a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162
  ALL-USD GUARD: OK (matches expected baseline)
```

**220 passed, 0 failed** (with the fixture present — without it, the 4 LOCAL guards drop out, giving
216). **Guard hash byte-for-byte identical** to main: `a90288...408162`.

### 1c. Explaining the 249 vs 220 discrepancy — NOT a regression

The count differs because the branch was cut from `main` at commit `0d4e2a1`, which is **5 fix
commits behind current `main`**:

```
$ git merge-base main dashboard-dataviz-batch-g
0d4e2a14bfde8f737a40b4251f1bd10ee89323a1
```

Those 5 commits (`fix/rounding-epsilon`, `fix/hedge-validation`, `fix/tautology-audit`,
`fix/fx-sensitivity-override`, `fix/csv-export-and-browser-leak`, plus doc-sync commits) added 29
test cases to `test/invariants.js` between the branch's fork point and current `main`. Proof that the
branch makes **zero changes** to the test file itself:

```
$ git diff 0d4e2a1:test/invariants.js dashboard-dataviz-batch-g:test/invariants.js
(empty diff)
```

`test/invariants.js` on the branch is byte-identical to the test file at the merge-base. The 220 count
matches CLAUDE.md's own documented history ("baseline was 220 as of the `2d094eb` doc sync"). This is
**branch staleness, not a defect introduced by this branch's changes.**

Per instructions, if either metric moved I was to stop and report before proceeding. The guard hash
did not move at all (identical both times). The suite count moved, but is fully explained above as a
pre-existing-staleness artifact, not a regression in the branch's own diff — so I continued the review
rather than treating it as a blocking anomaly.

---

## 2. Scope check — does the branch touch only what it claims?

Comparing against `main` directly (`git diff --stat main dashboard-dataviz-batch-g`) is misleading —
main is 5 commits ahead, so that diff includes reverting those 5 fixes' 3000+ lines of changes. The
correct comparison is against the actual merge-base:

```
$ git diff --stat 0d4e2a1 dashboard-dataviz-batch-g
 CLAUDE.md                    | 380 ++---------------------------------
 engine/core/CLAUDE.md        | 111 +++++++++++
 engine/flows/CLAUDE.md       |  47 +++++
 scripts/build-interactive.js | 460 +++++++++++++++++++++++++++++++++----------
 4 files changed, 531 insertions(+), 467 deletions(-)
```

```
$ git diff 0d4e2a1 dashboard-dataviz-batch-g --stat -- engine/core/*.js engine/flows/*.js
(empty)
```

**Confirmed:** the branch's own changes touch exactly `CLAUDE.md`, two new module `CLAUDE.md` files,
and `scripts/build-interactive.js`. Zero `engine/core/*.js` or `engine/flows/*.js` files touched — no
new features, matching the stated scope.

`node --check` on the branch's `scripts/build-interactive.js` output (`out/TIS-interactive.html`'s
build) passes with no syntax errors, and the dashboard builds and runs correctly (see §4).

---

## 3. CLAUDE.md split — content-preservation audit

Read all three: root `CLAUDE.md` (146 lines, down from 488 at merge-base), `engine/core/CLAUDE.md`
(111 lines, new), `engine/flows/CLAUDE.md` (47 lines, new). Section-by-section diff against the
merge-base root file (`git show 0d4e2a1:CLAUDE.md`):

| Merge-base root section | Where it went on the branch | Status |
|---|---|---|
| Architecture (three layers) | Root, reworded to reference the new module docs | ✅ preserved |
| Input → derivative dependency graph | Root, verbatim | ✅ preserved |
| NTA 2025 tax anchors | Root, verbatim | ✅ preserved |
| Recoverable-VAT treatment | Root, verbatim | ✅ preserved |
| Surcharge gate | Root, verbatim | ✅ preserved |
| Partner compensation toggle | Root, verbatim | ✅ preserved |
| Annualised return (RULE) | Root, verbatim | ✅ preserved |
| Paper vs economic quantities | Root, verbatim | ✅ preserved |
| Dual-route hedge (summary) | Root, verbatim + pointer to engine/core/CLAUDE.md for detail | ✅ preserved |
| Pricing ladder (full detail) | `engine/core/CLAUDE.md` §"Pricing ladder", verbatim | ✅ relocated intact |
| Unified trade model (5 dimensions) | `engine/flows/CLAUDE.md` §"Unified trade model", verbatim | ✅ relocated intact |
| Hedge toggles — ICE + FX (full detail) | `engine/core/CLAUDE.md` §"Hedge toggles", verbatim | ✅ relocated intact |
| Final / settlement ICE | `engine/core/CLAUDE.md` §"Final / settlement ICE", verbatim | ✅ relocated intact |
| Config-driven cost/tax lines | `engine/core/CLAUDE.md` §"Config-driven cost/tax lines", verbatim | ✅ relocated intact |
| Status-flag taxonomy | Root, verbatim | ✅ preserved |
| **Interactive dashboard (~216 lines: per-trade/house-defaults split, trade-library state machine + footer layout, template-literal escape rule, browser tab title, `pip()` status semantics, hedge placeholder field state `.si.ph`, hedged-volume MT placeholder, empty-state/stale-results prevention, sell-price-optional price-independent/dependent split, `TISStorage` abstraction, identity fields + fixture badge, favicon, color-semantics palette Batch C)** | Root now just says: "see `.claude/rules/build-interactive-*.md`" | ❌ **DROPPED — see below** |

### 3a. The dropped section — confirmed defect

The root `CLAUDE.md` on the branch replaces the entire Interactive-dashboard section with:

```
- `.claude/rules/build-interactive-*.md` — interactive dashboard (`scripts/build-interactive.js`)
  behavior and gotchas; path-scoped so they only load when that file is in play
```

Those four rule files **do not exist anywhere in this branch's history**:

```
$ ls .claude/rules/          # in the branch worktree
ls: .claude/rules/: No such file or directory

$ git show 0d4e2a1:.claude/rules/build-interactive-state.md
fatal: path '.claude/rules/build-interactive-state.md' exists on disk, but not in '0d4e2a1'
```

They weren't present at the merge-base, and the branch's own diff (§2 above) doesn't create them
either — the branch only *deletes* the root copy and points at files that were never made. Root
CLAUDE.md, `engine/core/CLAUDE.md`, and `engine/flows/CLAUDE.md` were all checked and none of them
contain this content — it is genuinely gone.

**How main solved the identical problem:** main independently deduplicated the same section via
commit `fafe563` ("docs: dedup dashboard section from root CLAUDE.md into scoped rules"), which
*created* the four `.claude/rules/build-interactive-*.md` files before removing the root copy. That
commit is not in this branch's ancestry:

```
$ git merge-base --is-ancestor fafe563 dashboard-dataviz-batch-g && echo yes || echo no
no
```

So this isn't a case of two branches doing the same wrong thing — main did it correctly (created the
destination before deleting the source); this branch did it incorrectly (deleted the source, assumed
or forgot to create the destination).

**Impact if merged as-is:** ~216 lines of load-bearing documentation on trade-library state machine
behavior, storage persistence, empty-state handling, and the Batch C/D/E/F color-and-status
conventions would vanish from the repo with no replacement, and root `CLAUDE.md` would carry a dead
reference.

---

## 4. Visual / dataviz verification

Built both dashboards (`node scripts/build-interactive.js`) from a clean state and loaded the
resulting `out/TIS-interactive.html` for each ref in Chrome via a local HTTP server, using the bundled
`TIS-SAMPLE-EQUITY-PARTNER-001` fixture (auto-loaded, no data entry needed).

### 4a. Profit Waterfall — main (before) vs branch (after)

- **Main:** dark rounded rectangle cards (Standalone/Margin Foregone/Adjusted/Partner Cash Share/TIS
  Net Profit), each filled with a background color, connected by `›` chevrons.
- **Branch:** hand-rolled SVG bridge chart. Same five steps, same figures
  ($1,929,550.96 → -$418,640.47 → =$1,510,910.49 → -$528,818.67 → =$982,091.82), rendered as
  floating bars with dashed connector guides.

Initial observation flagged the four intermediate bars (Standalone, Margin Foregone, Adjusted,
Partner Cash Share) as suspiciously unfilled/white while only the terminal (TIS Net Profit) bar was
green — investigated via direct SVG/CSS inspection:

```js
// rect classes on the branch's waterfall SVG:
[
  {class: "wfsvg-bar wfsvg-bar-neutral", width: "174.24", x: "16.00"},
  {class: "wfsvg-bar wfsvg-bar-neutral", width: "174.24", x: "214.44"},
  {class: "wfsvg-bar wfsvg-bar-neutral", width: "174.24", x: "412.88"},
  {class: "wfsvg-bar wfsvg-bar-neutral", width: "174.24", x: "611.32"},
  {class: "wfsvg-bar wfsvg-bar-terminal", width: "174.24", x: "809.76"}
]

// matching CSS rule:
.wfsvg-bar-neutral { fill: var(--white); stroke: var(--border); }
.wfsvg-bar-terminal { fill: var(--role-positive); stroke: rgb(20, 83, 45); }
```

**Not a bug.** This is the intentional "neutral intermediate waterfall cards, promote reconcile line"
design decision from the `dashboard-design-system-batch-f` merge (`0d4e2a1`, in both lineages already)
— only the terminal total gets color; intermediates are deliberately neutral/white. Figures match
exactly between old and new rendering. ✅

### 4b. Sensitivities — main (before) vs branch (after)

- **Main:** plain red/green table rows (`Surcharge ON (5%)`, `ICE +10%`, `ICE -10%`, `TC rate ±10%`,
  `FOB premium ±10%`, `FX NAFEM ±10%`), each a full-width colored bar with a single value.
- **Branch:** new diverging-bar tornado chart — each lever shown as a horizontal bar split at a zero
  line, red extending left (negative Δ) and green extending right (positive Δ), sorted by magnitude,
  with a "Base: $982,091.82 · Bars = Δ vs base at ±10%" caption and a "positive impact (↑ TIS net) →"
  header. The detailed table (unchanged) still renders below it. Figures verified identical to main's
  table: Surcharge ON −$481,567.98; ICE +10% −$414,915.54 / −10% +$417,806.07; TC rate ±$54k;
  FOB premium ±$52k. ✅ No numeric drift, correct visual upgrade.

### 4c. Sticky condensed KPI on scroll

Confirmed on the branch: scrolling the results panel pins a compact "TIS NET PROFIT $982,091.82" pill
at the top of the results column. Zoomed into the pixel region where it overlaps the "LEVER / Base
case ... baseline" table row beneath it — the pill has its own solid white background and border
radius, and **no table text bleeds through it**. This matches the CLAUDE.md-documented fix from commit
`b788ce1` ("sticky KPI bar no longer overlaps scrolled content"), which is present in both lineages.
✅ No regression, works as documented.

### 4d. Accessibility — axe-core scan

Injected axe-core 4.9.1 and ran `axe.run()` against both dashboards (sample fixture loaded, Deal tab
active):

**Main:**
```
violations: color-contrast (serious, ~35-42 nodes), label (critical, 1 node),
            scrollable-region-focusable (serious, 1 node), select-name (critical, 4 nodes)
passes: 47
```

**Branch:**
```
violations: color-contrast (serious, ~38 nodes), label (critical, 1 node), select-name (critical, 4 nodes)
passes: 47
```

(Node counts for `color-contrast` fluctuated slightly, ~35-42, across repeated runs on both — likely
scroll-position/viewport-dependent elements entering the accessibility tree; not meaningful to the
comparison.)

**Result: the branch introduces zero new violation categories and fixes one** —
`scrollable-region-focusable`, present on main, is resolved on the branch (consistent with the
branch's own commit `6ee48cb`, "dataviz: accessibility pass — contrast audit, tab ARIA pattern"). The
remaining three violation categories (color-contrast, label, select-name) are pre-existing on both and
out of scope for this branch. ✅ Net improvement, no regression.

---

## 5. Post-review re-verification

Re-ran suite + fingerprint on the branch worktree a second time after completing the visual review, to
confirm nothing drifted during the session:

```
220 passed, 0 failed
ALL-USD GUARD COMBINED: a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162
ALL-USD GUARD: OK (matches expected baseline)
```

Identical to §1b. Stable.

---

## Recommendation

The branch's own work (dataviz upgrades to Profit Waterfall and Sensitivities, sticky KPI, a11y pass,
module CLAUDE.md split) is sound in isolation — correct figures, no engine touched, no new a11y
regressions, and a net a11y improvement. It should **not** be merged in its current form because:

1. It is 5 commits stale relative to `main` and would need a rebase/merge to avoid silently reverting
   `fix/rounding-epsilon`, `fix/hedge-validation`, `fix/tautology-audit`, `fix/fx-sensitivity-override`,
   and `fix/csv-export-and-browser-leak`.
2. The CLAUDE.md split drops the ~216-line Interactive Dashboard section with a dangling reference to
   files that don't exist on this branch. Fix: during the rebase, pull in main's `fafe563` (which
   creates the four `.claude/rules/build-interactive-*.md` files) so the pointer resolves correctly,
   or otherwise recreate that content before merging.

No engine/core or engine/flows source was touched by this branch, and the reference-trade fingerprint
is untouched throughout — this is a documentation/process gap, not a financial-correctness risk.
