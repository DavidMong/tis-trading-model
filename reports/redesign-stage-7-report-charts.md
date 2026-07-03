# Redesign Stage 7 — HTML Report: Waterfall + Sensitivities Coherence

Branch: `redesign/stage-7-report-charts`, branched from `redesign/stage-6-report-tables` tip
(`5be7f1b`) — a stacked chain; Stage 0 through Stage 6 all remain unmerged to `main`.

Scope: replace the report's old colored-card Profit Waterfall with a report-side reproduction of
`build-interactive.js`'s hand-rolled SVG bridge chart; align the Sensitivities heat cells and
tornado figures to the same tokens/colors the interactive app already uses; and a final
report-vs-interactive coherence pass. Last HTML-report stage — Stage 8 (PDF) is next.

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed.

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times (re-verified after the Step-3 coherence fix too,
not just once). `npm run build:interactive`, `node scripts/build-report.js`, and
`node scripts/build-report-pdf.js` all succeed cleanly before and after (PDF run as a sanity
check only — `scripts/report-pdf-renderer.js` was never edited; its own `profitWaterfall()`/
sensitivities code is entirely independent of `report-renderer.js`'s, confirmed by grep — zero
shared markup or class names).

## Files touched

`git diff --stat`: **1 file changed** — `scripts/report-renderer.js` only. No other file in the
working tree changed except the new `reports/` additions (this report + screenshots).

**Confirmed untouched**: `engine/core/*`, `engine/flows/*`, `trades/*.json`, `run.js`,
`scripts/build-interactive.js` (not touched at all this stage, per the ABSOLUTE instruction —
its bridge-chart/heat-cell logic was read for reference but never edited or extracted),
`scripts/report-pdf-renderer.js`, `scripts/build-report.js`, `scripts/build-report-pdf.js`.

## Shared-CSS + interactive-app safety

All new styling lives in the `REPORT_CSS` constant established in Stage 6 — concatenated only
into `generateHtml`'s own `<style>` tag, never merged into the exported `reportCss` that
`build-interactive.js` imports. The new `.wfsvg-*` bridge-chart classes are brand new names (no
collision with reportCss's existing `.wf-box`/`.wf-standalone`/etc rules, which are left
completely untouched — those are dead code as far as the HTML report is concerned after this
stage, but were deliberately NOT removed since a `build-interactive.js` comment claims
"the PDF's own waterfall still uses them"; grepping `report-pdf-renderer.js` shows its waterfall
actually uses its own independent `.wf-node`/`.wf-label`/`.wf-op` classes from its own `PDF_CSS`,
so that comment is stale — but removing shared CSS for zero benefit is needless risk, so it was
left alone rather than "fixed" as a drive-by, out of this stage's scope).

**Verification:** rendered the interactive app before and after this stage's edits (including
after the Step-3 coherence fix) and diffed its full-page screenshot against Stage 6's own
committed `after-interactive-app.png` — **byte-identical SHA-256**
(`a73b423d6553706ad2fb007b44a214c2471b11cf6d44ec4fdac0dbd4cbdd5028`) both times.

## Step 1 — Profit Waterfall: SVG bridge chart (PRIMARY approach taken)

Reproduced `build-interactive.js`'s `buildWaterfallSteps()` / `renderWaterfallChart()` report-side
as `buildWfSteps()` / `renderWfChart()` — same viewBox (1000×220), same bar/guide/label geometry,
same 5-node (partner-funded) / 3-node (TIS self-funded) step model. `report-renderer.js` cannot
`require` `build-interactive.js` (wrong direction — the interactive app imports from the report
module, not the reverse), so this is a hand-duplicated port, not a shared import.

**Figure identity preserved exactly:** the report's pre-Stage-7 waterfall displayed
`res.profit.tisNetProfit` (not `tisNetAfterSurcharge`, which `build-interactive.js`'s own
TIS-funded reconcile line uses) — `buildWfSteps()` keeps that exact field choice. Nothing about
*which number* is shown changed, only how it is drawn. The reconcile line and annualised-return
line keep the report's own pre-existing value expressions (`res.tisAnnualisedReturnOnCargo ??
res.tisAnnualisedReturn`, `p.reconciliation.ok`, etc.) — only their CSS moved onto
`REPORT_CSS` tokens (`.wf-reconcile` text onto `--g-text-slate`, inline figures onto
`--f-mono` tabular, the `✓ OK` mark onto `--g-positive`).

**Visual result:** neutral white-bordered intermediate/subtotal bars, a single filled terminal
(TIS Net Profit) bar in green (`--g-positive`, or `--g-loss` red if negative), mono tabular value
labels with the leading +/− sign carrying the direction (never color alone), dashed hairline
guides connecting each bar to the next. Colors introduced (`--g-positive: #15803d`) are literal
copies of `build-interactive.js`'s own `--role-positive`/`.wfsvg-bar-terminal` fill — no new hex
value invented.

## Step 2 — Sensitivities: heat cells + tornado + base-case row

**Heat-cell color mismatch found and fixed.** Report's pre-Stage-7 `.sens-neg`/`.sens-neg-strong`
used `#991b1b`/`#7f1d1d` (bright red) — `build-interactive.js` had already moved these to
`#4b5563`/`#374151` (desaturated grey, "C1: Expected negative figures → slate/neutral, not
alarm-red") in an earlier redesign stage, but `report-renderer.js`'s own copy was never updated to
match. Confirmed via live `getComputedStyle()` on the actual interactive HTML (not just reading
the CSS source) before writing the fix — output below — then reproduced the exact same 4 hex
values report-side via compound selectors in `REPORT_CSS`:

```
sens-pos         → rgb(21, 128, 61)   #15803d   (unchanged, matches interactive)
sens-pos-strong  → rgb(20, 83, 45)    #14532d   (unchanged, matches interactive)
sens-neg         → rgb(75, 85, 99)    #4b5563   (report was #991b1b — now matches)
sens-neg-strong  → rgb(55, 65, 81)    #374151   (report was #7f1d1d — now matches)
```

The compound-selector approach (`.data-table tbody td.r.sens-pos { color: #15803d; }`, etc.) was
copied verbatim from `build-interactive.js`'s own Stage 4 fix — that file's own comment documents
the exact cascade bug (`.data-table tbody td.r`'s `color: var(--g-chrome-ink)` at (0,2,2)
specificity beats the bare `.sens-pos`/`.sens-neg` classes at (0,1,0)) and its fix (compound
selectors at (0,3,2)). Adding `class="data-table"` to the report's Sensitivities table (Step 2
also asks this, mirroring `build-interactive.js`'s own Stage 4 scope) would have silently
re-introduced that exact bug in the report had these compound overrides not been added at the
same time — verified this was NOT a live regression by rendering after the change and confirming
computed colors via Playwright, not just reading the CSS.

**Base-case row:** adding `class="data-table"` to the Sensitivities table also pulled in Stage 6's
existing `.data-table tbody tr.row-total td` rule (weight + top hairline, `background: none`) for
free — no new CSS needed. Confirmed via computed style: `background-color: rgba(0,0,0,0)`,
`border-top: 1px rgba(113,124,137,0.18)` (was a solid `var(--bg)` fill before).

**Tornado chart:** kept the report's existing CSS-bar technique (NOT ported to
`build-interactive.js`'s newer SVG tornado — a distinct chart technology change explicitly out of
this stage's scope, since the brief only asked for "tornado bars and figures on tokens + mono
tabular", not a chart-technology port). `.tn-val`/`.tn-val-out`/`.tn-baseline-label b` now render
in `var(--f-mono)` with tabular-nums (confirmed via computed style); `.tn-label`/`.tn-axis-labels`
sizes moved onto the `--fs-*` scale.

## Step 3 — Coherence sweep

Compared the report against the interactive app section by section (header, params, cost, tax,
waterfall, partner, hedge, ladder, sensitivities). One residual drift found: the Partner/Hedge
`subHead()` helper's inline `style="color:var(--slate)"` (`#717c89`) — an inline style, so no
Stage 6 CSS override could reach it — didn't match the AA-fixed `--g-text-slate` (`#64707c`)
token every other label in the Partner/Hedge panels already uses since Stage 6. Fixed by editing
the template literal directly (`color:var(--g-text-slate)`). `ladderSub()`'s `color:var(--ink)`
was left as-is — `--g-chrome-ink` is a byte-identical alias of `--ink`, so there was no actual
value difference to fix there, only a token-naming one not worth touching.

No other drift found: badges, tables, info-rows, and summary-strips all read as one system across
every section in the before/after full-page screenshot comparison.

## Verification — screenshots

Playwright (project's own `devDependency`), local `file://` loads, viewport sized to each page's
natural content height. Committed to `reports/assets/stage-7-report-charts/`:

- `before-crop-waterfall.png` / `after-crop-waterfall.png` — the Profit Waterfall section only.
  Before: 5 colored cards (dark/pink/yellow/pink/green) with chevron arrows. After: the SVG
  bridge chart (neutral bars + single green terminal + mono labels + dashed guides). All 5
  displayed values identical: `$1,929,550.96 → −$418,640.47 → =$1,510,910.49 → −$528,818.67 →
  =$982,091.82`, reconciliation `✓ OK`, annualised return `118.01%` — byte-for-byte unchanged
  from the pre-Stage-7 render.
- `before-crop-sensitivities.png` / `after-crop-sensitivities.png` — the Sensitivities section.
  Base-case row: filled grey background (before) → hairline-top, no fill (after). Heat-cell
  colors corrected per Step 2 above. Every lever/TIS-Net/Δ-vs-Base figure unchanged: e.g.
  `Surcharge ON (5%): $500,523.84, −$481,567.98`, `ICE −10%: $1,399,897.89, +$417,806.07`.
- `after-html-report-full.png` — full report, 1440×5562 (before equivalent: Stage 6's own
  committed `reports/assets/stage-6-report-tables/after-html-report.png`, 1440×5334 — the ~230px
  growth is entirely the waterfall's collabel row + tornado's unchanged height, no section
  height regression elsewhere).
- `after-interactive-app.png` — full interactive app, 1440×4717. **SHA-256 identical** to Stage
  6's own committed `after-interactive-app.png`:
  `a73b423d6553706ad2fb007b44a214c2471b11cf6d44ec4fdac0dbd4cbdd5028` — zero pixel difference.

Hash-distinct before/after report pairs confirmed (crop images differ; full-page hash differs
from Stage 6's own full-page capture as expected, since the waterfall/sensitivities markup
changed).

## Accessibility + contrast audit

No `fixing-accessibility` / `fixing-motion-performance` skill surfaced in the available list this
session — manual audit, computed via the WCAG relative-luminance formula.

**Heat-cell ink-on-tint contrast** (the 4 pairs used by Sensitivities, now identical to the
interactive app):

| Pair | Foreground | Background | Ratio |
|---|---|---|---|
| `sens-pos` | `#15803d` | `#dcfce7` (`--heat-pos`) | **4.57:1** (AA pass) |
| `sens-pos-strong` | `#14532d` | `#bbf7d0` (`--heat-pos-strong`) | **7.52:1** (AAA pass) |
| `sens-neg` | `#4b5563` | `#fee2e2` (`--heat-neg`) | **6.19:1** (AAA pass) |
| `sens-neg-strong` | `#374151` | `#fecaca` (`--heat-neg-strong`) | **7.12:1** (AAA pass) |

All 4 pairs clear WCAG AA (4.5:1 normal text) — these are the same long-established
`--heat-*`/text-color values already verified in the root project's Stage 1 pass (cited range
"4.57–7.52:1" in `.claude/rules/build-interactive-identity-display.md`), not new colors; this
stage only made the report's `sens-neg`/`sens-neg-strong` actually USE the already-vetted values
instead of the stale pre-redesign red.

**Waterfall bridge chart colors:** `.wfsvg-bar-terminal` fill `#15803d` with `#14532d` border, and
`.wfsvg-value` text `var(--g-chrome-ink)` (`#242331`) on `var(--white)` bar fill for neutral bars
— both are pre-existing, already-vetted color pairs reused verbatim from elsewhere in the report
(kpi-accent green, primary ink-on-white body text); no new contrast computation needed.

**Motion:** zero transitions/animations in this stage's changes (static SVG + table markup only).

## Open items / deferred

1. Stage 8 (PDF report) is next — out of this stage's scope; `report-pdf-renderer.js` was
   confirmed independent (own CSS, own waterfall/sensitivities markup) and untouched.
2. `reportCss`'s dead `.wf-box`/`.wf-standalone`/`.wf-deduct`/`.wf-adjusted`/`.wf-share`/`.wf-net`/
   `.wf-loss`/`.waterfall`/`.wf-arrow` rules were left in place (no longer emitted by
   `report-renderer.js`'s own markup after this stage) — a `build-interactive.js` comment claims
   the PDF renderer still depends on them, but grepping `report-pdf-renderer.js` shows it has its
   own independent `.wf-node`/`.wf-label` classes, so that claim looks stale. Not removed this
   stage since deleting shared CSS for zero visible benefit is needless risk — flagging for
   whoever eventually cleans up `build-interactive.js`'s own comment/dead-code inventory.

## Commit

Branch `redesign/stage-7-report-charts`, branched from `redesign/stage-6-report-tables` tip
(`5be7f1b`). Not merged to any earlier stage branch or `main`; not pushed, per instructions.
