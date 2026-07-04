# Redesign Stage 10 — Cleanup Sweep + Final Coherence/Pagination QA

Branch: `redesign/stage-10-cleanup-coherence`, branched from `redesign/stage-9-pdf-fonts-structure`
tip (`f40a06c`) — a stacked chain; Stage 0 through Stage 9 all remain unmerged to `main`. Last
build stage before merge.

Scope: safe, grep-proven dead-code removal in `scripts/build-interactive.js`, a stale-comment fix,
and a final cross-surface coherence + PDF-pagination QA pass. Conservative cleanup, not a refactor —
nothing was removed without a grep proving zero live usage, and no engine/figure/copy was touched.

## 1. Stale `.wf-box` comment fix (`scripts/build-interactive.js`)

The multi-line comment above `.wf-reconcile` (~line 1085) claimed *"The underlying .wf-box/
.wf-deduct/etc classes in reportCss are untouched — **the PDF's own waterfall still uses them**."*
That's wrong: `report-pdf-renderer.js` has always had its own independent `PDF_CSS` and its own
waterfall markup (`.wf-node`/`.wf-op`/`.wf-amt`/`.wf-sub`/`.wf-label`, added Stage 9's predecessor
work), never importing or emitting `reportCss`'s `.wf-box` family at all. Confirmed by grep:

```
$ grep -n "wf-box\|wf-deduct\|wf-row" scripts/report-pdf-renderer.js scripts/report-renderer.js scripts/build-interactive.js
scripts/build-interactive.js:46:   .sb-footer / .wf-box overrides below.       (unrelated — cascade-pattern example, not a PDF claim)
scripts/build-interactive.js:1101-1108: (the stale comment being fixed)
scripts/report-renderer.js:442-485: .wf-box / .wf-deduct / .wf-standalone / .wf-adjusted / .wf-share / .wf-net rule definitions
```

No `class="wf-box"` (or any sibling class) appears in any HTML-emitting template literal anywhere in
the repo — `report-pdf-renderer.js`, `report-renderer.js`, and `build-interactive.js` were all
grepped for the literal markup string; zero hits. So `.wf-box` is provably dead CSS **everywhere**,
not just unconsumed by the PDF specifically. Fixing the comment to state that fact plainly; the
actual dead `.wf-box` rule block lives in `report-renderer.js`, not `build-interactive.js`, and
wasn't a named removal candidate for this stage — left in place as an explicitly flagged item for a
future cleanup pass, per the "conservative, not a refactor" scope.

## 2. Dead-code removal: `.field-row-*` (`scripts/build-interactive.js`)

Removed `.field-row`, `.field-row-top`, `.field-row-label`, `.field-row-unit` (declared ~line 229,
with its own comment self-admitting *"Reference definition only this stage — not yet applied"*) and
trimmed `.field-row`/`.field-row *` out of the adjacent `prefers-reduced-motion` media query (the
only other place referencing the class).

**Proof of zero usage** — grepped the full file for the literal markup string; every hit is a CSS
declaration or a comment, none is inside a template-literal `class="..."` attribute:

```
$ grep -n "field-row" scripts/build-interactive.js   (before removal)
229:/* field-row grammar: ... */
233:.field-row { ... }
234:.field-row-top { ... }
235:.field-row-label { ... }
242:.field-row-unit { ... }
249-250: (prefers-reduced-motion selector list, includes .field-row / .field-row *)
1521, 1529, 1535: descriptive prose ("field-row heights", "field-row grammar") — not selectors
```

Every field the Deal/Costs/Hedge tabs actually render goes through the single `ir()` helper
(`scripts/build-interactive.js` ~line 1779), confirmed by reading it:

```js
function ir(id, label, inputHtml, status, primary) {
  const pr = primary ? ' pri' : '';
  return `<div class="ir${pr}">
  <label class="ir-lbl" for="${id}">${pip(status)}${esc(label)}</label>
  ${inputHtml}
</div>`;
}
```

— which emits `.ir`/`.ir-lbl`, never `.field-row*`. Post-removal grep confirms only the three
descriptive-prose comments remain (lines renumbered ~1510/1518/1524), no selector:

```
$ grep -n "field-row" scripts/build-interactive.js   (after removal)
1510:   only font-size moves onto the Stage 0 scale, so field-row heights shift by
1518:/* ── Left rail: Stage 1 field-row grammar ───────────────────────────────
1524:   block re-skins those existing classes onto the Stage 0 field-row grammar
```

No shadowed-but-live rule was touched — this removal took whole, fully-orphaned selector blocks
only.

## 3. Coherence QA — sensitivities negative-value coloring

Compared the three surfaces' treatment of a negative sensitivity delta (e.g. "ICE +10%" swinging
TIS net down):

| Surface | Negative-delta color (before) | Class used |
|---|---|---|
| Interactive dashboard | `#4b5563` / `#374151` (two-tier, magnitude-based) | `.data-table tbody td.r.sens-neg[-strong]` (Batch C override) |
| HTML report | `#4b5563` / `#374151` (same override — its sensitivities table also carries `class="data-table"`, so the same higher-specificity Batch C rule applies) | same |
| PDF report | `var(--slate)` = `#717c89` — the generic structural-negative color also used for unrelated things like the hedge ICE-cost-delta | `.neg` |

So the interactive dashboard and the HTML report were **already coherent** with each other (both
route through the same `.data-table` override); the actual drift was the PDF alone, one shade
lighter/less-saturated than the other two, and conflated with an unrelated generic class. Fixed by
giving the PDF's sensitivities row a dedicated `.sens-neg` class at the exact same `#4b5563` used
elsewhere, scoped to that table only — `.neg` itself is untouched, so the hedge ICE-cost-delta and
other structural negatives elsewhere in the PDF keep their existing slate color unaffected. Did
**not** replicate the interactive/report's two-tier magnitude-based "-strong" darkening in the PDF —
the PDF has no equivalent two-tier system on the positive side either (`.pos` is flat), so adding a
lone negative-only tier would itself be a new inconsistency; a flat, correctly-colored `.sens-neg`
is the one-tier equivalent already present for positives.

```css
.sens-neg { color: #4b5563; }
```

```js
const cls = s.deltaVsBase >= 0 ? 'pos' : 'sens-neg';   // was: 'pos' : 'neg'
```

Sign (`+`/`−`) still carries direction on its own regardless of color, per the instruction.

No other coherence drift was found in type, badges, or spacing across the three surfaces during
this pass — badges (4-state), table structure (eyebrow headers, mono tabular figures, hairline
rows), and the KPI/info-box grammar were already aligned as of Stage 9.

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed.

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times. No `engine/` file was touched — only
`scripts/build-interactive.js` (comment fix + dead-CSS removal) and `scripts/report-pdf-renderer.js`
(one-class coherence fix).

```
 scripts/build-interactive.js   | 33 +++++++++++----------------------
 scripts/report-pdf-renderer.js | 11 ++++++++++-
 2 files changed, 21 insertions(+), 23 deletions(-)
```

## Re-render + byte comparison against Stage 9 baselines

Built all three surfaces at this stage's tip and at the Stage 9 tip (`f40a06c`, via a throwaway
`git worktree`), then diffed:

- **Interactive dashboard** (`out/TIS-interactive.html`) — hash differs from Stage 9 (expected: the
  dead CSS + comment text are part of the served file). Full diff shows **exactly** the two edits
  above and nothing else: the removed `.field-row-*` block/media-query entries, and the corrected
  `.wf-box` comment prose. No rendering-affecting rule changed.
- **HTML report** (`out/TIS-SAMPLE-EQUITY-PARTNER-001.html`, via `build-report.js`) — hash differs
  from Stage 9 by exactly one line: the embedded `generatedAt` timestamp
  (`2026-07-04 08:44 UTC` vs `08:43 UTC`, one minute apart from re-running the build a minute
  later). `report-renderer.js` itself was not touched this stage, confirming the HTML report is
  otherwise byte-identical to Stage 9.
- **PDF report** — not byte-comparable (Playwright's PDF stream isn't reproducible byte-for-byte
  run to run even with no source change — confirmed already true for Stage 9), so verified visually
  instead (below), which is the same method Stage 9 used.

## PDF pagination/print QA — two trades

Generated the PDF for two different trades and rasterised every page with `pdftoppm`:

- `trades/reference-trade-001.json` (equity-partner, ex-ship only, all-USD) — 5 pages, 115 KB.
- `trades/sample-both-channels.json` (unified `trade` flow, both ex-ship + depot channels, split
  USD/naira currency — the densest fixture available, with both pricing ladders, storage cost
  lines, and naira FX exposure all present) — 5 pages, 120 KB.

Screenshots committed to `reports/assets/stage-10-cleanup-coherence/`:

- `reference-trade-page3-sensitivities.png` — confirms the sensitivities-table negative deltas
  (e.g. `ICE +10%: −$693,017.76`) now render in the darker `#4b5563` grey, matching the
  interactive/HTML-report shade, while the unrelated Hedge Analysis "ICE cost delta" stays on the
  lighter `.neg` slate (page 4, unaffected by design).
- `reference-trade-page4-ladder-fx-hedge.png` — pricing ladder, FX & settlement, hedge panels;
  confirms `.neg` (hedge ICE cost delta `−$0.04`) is intentionally untouched.
- `both-channels-page1-cover.png` through `page5-hedge-status.png` — the denser fixture: both
  ex-ship *and* depot pricing ladders on one page (page 4) with no clipping; the 28-line cost
  build-up table breaks cleanly across the page 2/3 boundary with the header row (`# / Line Item /
  Basis / Amount / Flag`) repeating correctly (`thead { display: table-header-group }`) and no
  orphaned row or heading; sensitivities, tax block, waterfall, and both hedge panels all render
  complete with no broken breaks.

No clipped content, no orphaned section headings, and no broken page breaks were observed on either
trade from the Stage 9 Inter→Plex Sans font-metrics change carrying forward into this stage's
edits.

## Not done here (explicitly out of scope)

- Removing the actually-dead `.wf-box`/`.wf-deduct`/etc. CSS block itself from `report-renderer.js`
  — flagged as a genuine dead-code finding (zero HTML consumers anywhere in the repo) but not a
  named candidate for this stage; left in place per the conservative-cleanup scope.
- Engine, figures, or em-dash product copy — untouched, per instruction.
- Merge to `main` — this branch stops at review, per instruction.
