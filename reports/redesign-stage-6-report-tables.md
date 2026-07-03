# Redesign Stage 6 — HTML Report: Tables, Badges, Parameters, Info-Boxes

Branch: `redesign/stage-6-report-tables`, branched from `redesign/stage-5-font-finalize` tip
(`528134c`) — a stacked chain; Stage 0 through Stage 5 all remain unmerged to `main`.

Scope: migrate the HTML report's (`scripts/report-renderer.js`) header, trade-parameters grid,
Cost Build-Up / Tax Block / Pricing Ladder tables, the recoverable-VAT and fossil-fuel-surcharge
info-boxes, and the Partner Deliverables / Hedges panels onto the redesign system's tokens and
classes (`.data-table`, `.section-block`, `.summary-strip`, `.info-row`, `--fs-*`, `--g-*`,
`--f-mono`, `--g-text-slate`) established in `scripts/build-interactive.js`'s Stage 0/2/3 diffs,
and remap every badge to the 4-state taxonomy (root `CLAUDE.md`, "Batch D — final, 3 states").
The Profit Waterfall and Sensitivities sections are explicitly untouched this stage (Stage 7).

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed.

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times. `npm run build:interactive`,
`node scripts/build-report.js`, and `node scripts/build-report-pdf.js` all succeed cleanly
before and after (the PDF pipeline was run only as a sanity check — `scripts/report-pdf-renderer.js`
itself was never edited; it imports `badge()` directly from `report-renderer.js`, so the taxonomy
remap flows through to the PDF's badges as a side effect of the shared display helper, not a
change to the PDF renderer file).

## Files touched

`git diff --stat`: **1 file changed, 208 insertions(+), 103 deletions(-)** — `scripts/report-renderer.js`
only. No other file in the working tree changed except the new `reports/` additions (this report +
screenshots).

**Confirmed untouched**: `engine/core/*`, `engine/flows/*`, `trades/*.json`, `run.js`,
`scripts/build-interactive.js`, `scripts/report-pdf-renderer.js`, `scripts/build-report.js`,
`scripts/build-report-pdf.js` — zero diff on all of these (confirmed via `git diff --stat`).

## Shared-CSS safety — the core risk this stage

`reportCss` (the `CSS` constant exported from `report-renderer.js`) is imported verbatim by
`build-interactive.js` (`const { reportCss } = require('./report-renderer'); return reportCss + ...`)
and extended with the interactive app's own token/class layer. Any new selector added directly to
`CSS` would leak into the interactive app's cascade.

**Mitigation:** all Stage 6 styling lives in a **new, separate constant, `REPORT_CSS`**, concatenated
only into `generateHtml`'s own `<style>` tag (`<style>${CSS}${REPORT_CSS}</style>`) — it is **not**
part of the exported `reportCss`, so `build-interactive.js` (which imports only `reportCss`) never
sees it. `CSS` itself was not edited except for the one JS logic change to `badge()` (a function, not
a CSS rule — see below).

`REPORT_CSS` duplicates `build-interactive.js`'s `--fs-*` / `--g-*` / `--f-mono` token values by
hand (report-renderer.js is the lower-level module and cannot `require` build-interactive.js), with
a comment noting they must be kept in sync manually if either file's tokens change.

**Verification:** rendered both apps before and after, diffed the interactive app's full-page
screenshot — **byte-identical SHA-256** (`a73b423d...`), confirming zero visual or DOM effect on the
interactive app from this stage's CSS.

## Badge remap (Step 4)

`badge()` in `report-renderer.js` previously implemented its own 10-class taxonomy
(`BADGE_CLASSES`/`SHORT_LABELS`/`badgeLabel()`, e.g. `bdg-confirm`, `bdg-placeholder`, `bdg-pending`,
`bdg-example`, `bdg-fixed`) — never updated when `build-interactive.js` did its own local Batch D
remap. This stage replaces `report-renderer.js`'s `badge()` with the identical 4-state
implementation `build-interactive.js` already uses:

```js
function badge(status) {
  if (!status || status === 'OK') return '';
  const upper = String(status).toUpperCase();
  if (upper.includes('RECOVERABLE')) return `<span class="bdg bdg-recoverable" ...>&#10003; OK</span>`;
  if (upper.includes('FIXED')) return '';
  if (upper.includes('CONFIRM') || upper.includes('UNVERIFIED'))
    return `<span class="bdg bdg-unverified" ...>&#9888;&#xFE0E;&nbsp;UNVERIFIED</span>`;
  return `<span class="bdg bdg-indicative" ...>INDICATIVE</span>`;
}
```

`BADGE_CLASSES`, `SHORT_LABELS`, and `badgeLabel()` were deleted as dead code (grepped repo-wide —
`badgeLabel` was exported but never imported by `report-pdf-renderer.js` or any other file, so
removing it from `module.exports` is safe). One hardcoded badge span survived the old system
untouched — the Cost Build-Up table's recoverable-row flag rendered literal
`<span class="bdg bdg-recoverable">Recoverable</span>` instead of going through `badge()`; changed
to `badge('RECOVERABLE')` so it renders "✓ OK" like every other recoverable flag in the report.

**Verification — no raw taxonomy label survives:**
```
$ grep -oE '>Recoverable<|>Confirm<|>Example<|>Placeholder<|>Pending<|>Suggested<|>Fixed<' out/TIS-SAMPLE-EQUITY-PARTNER-001.html
(no matches)
$ grep -oE 'bdg bdg-[a-z]+' out/TIS-SAMPLE-EQUITY-PARTNER-001.html | sort | uniq -c
  15 bdg bdg-indicative
   2 bdg bdg-recoverable
   9 bdg bdg-unverified
```
Only the 3 taxonomy classes render (the 4th state, no-badge, covers OK/FIXED) — no engine or config
status string was changed, only the display-layer remap, per root `CLAUDE.md`'s explicit rule.

## Step-by-step changes

1. **Header + Trade Parameters (Step 2):** markup unchanged; `REPORT_CSS` overrides `.kpi-value` /
   `.param-value` to `font-family: var(--f-mono)` with `font-variant-numeric: tabular-nums
   lining-nums`, and `.kpi-label`/`.param-label`/`.kpi-sub`/`.param-sub` to the `--fs-*` token
   scale. Badges (ICE status, FX NAFEM/parallel status) remap automatically via the `badge()`
   change — no markup edit needed there.
2. **Cost Build-Up / Tax Block / Pricing Ladder tables (Step 3):** `class="data-table"` added to
   all 4 result tables (Cost Build-Up, Tax Block, Ex-Ship ladder, Depot ladder) — mirrors
   `build-interactive.js` Stage 2's own scope exactly ("exactly these 4 tables"). Existing
   per-cell classes (`.r`, `.muted`, `.row-total`, `.ladder-current`) were **not** renamed;
   `REPORT_CSS`'s `.data-table` rules layer onto them, same pattern as the interactive app. The
   dark-filled "ALL-IN LANDED COST" `.tbl-footer` row gained `.summary-strip` (compound-selector
   overrides swap it from dark-ink-fill to hairline-top + neutral canvas tint, matching
   `build-interactive.js`'s own `.cost-totals.summary-strip` treatment).
3. **Badge remap (Step 4):** see above — repo-wide, not just these tables.
4. **Recoverable-VAT / fossil-fuel-surcharge info-boxes (Step 5):** both `.vat-block` and
   `.surcharge-block` gained `.summary-strip`, converting their green (`#f0fdf9`/`#6ee7b7`) and
   purple (`--pending-bg`/`#c4b5fd`) fills/borders to the same restrained hairline-top + canvas
   tint. The VAT box's inline paragraph color was moved from `var(--recov-c)` (green) to
   `var(--g-text-slate)`. The `✓ OK` / `INDICATIVE` badges inside both boxes are untouched — the
   rationed color now lives only in the badge chip, not the box.
5. **Partner Deliverables / Hedges (Step 6):** every `.dl`/`<dt>`/`<dd>` pair in `partnerAndHedge()`
   converted to the `.info-row` grammar via a new `infoRow(label, value, cls)` helper (mirrors
   `build-interactive.js`'s own `infoRow()` signature) — label left in `--g-text-slate`, figure
   right in `--f-mono` tabular. The Partner principal tie-out box and the ICE hedge
   "Hedged vs Unhedged" comparison box both gained `.summary-strip`. The VAT/surcharge boxes'
   internal `.dl` markup was deliberately left as-is (Step 5's scope names only the
   box-level treatment, not their internal grammar).

## Verification — screenshots

Playwright (project's own `devDependency`, `chromium.launch()`), local `file://` loads, viewport
sized to each page's natural content height (`.results` panel's `scrollHeight` for the interactive
app — matching the Stage 5 methodology exactly — and `document.body.scrollHeight` for the static
report). Committed to `reports/assets/stage-6-report-tables/`:

- `before-interactive-app.png` / `after-interactive-app.png` — full interactive app, 1440×4717.
  **SHA-256 identical**: `a73b423d6553706ad2fb007b44a214c2471b11cf6d44ec4fdac0dbd4cbdd5028` both
  before and after — zero pixel difference, confirming `REPORT_CSS`'s isolation from the interactive
  DOM.
- `before-html-report.png` (1440×5321) / `after-html-report.png` (1440×5334) — full HTML report.
  Hash-distinct: `709b5250...` (before) vs `8a746813...` (after).
- `after-crop-summary-strip.png` — the "ALL-IN LANDED COST" row, now a flat hairline-top strip
  instead of the old dark-ink fill.
- `after-crop-partner-hedge.png` — Partner Deliverables / Hedges panels in `.info-row` grammar.
- `after-crop-vat-surcharge.png` — the Recoverable-VAT and Fossil-Fuel-Surcharge boxes, now
  restrained canvas-tint strips with no green/purple wash, badges intact.

Waterfall and Sensitivities sections confirmed visually unchanged in the before/after report
screenshots (same bar geometry, same tornado chart, same table) — untouched this stage, per scope.

## Accessibility + contrast audit

No `fixing-accessibility` / `fixing-motion-performance` skill surfaced in the available list this
session — manual audit.

**Colors**: every text/background pairing introduced this stage reuses previously-vetted tokens —
no new hex value was introduced. `--g-text-slate` (`#64707c`) on white/canvas backgrounds was
already verified 5.06:1 / 4.72:1 (AA pass) in the Stage 1 pass documented in
`.claude/rules/build-interactive-identity-display.md`; `--g-chrome-ink` (`= --ink`, `#242331`) is the
existing 15.44:1 primary-text token. The `.summary-strip` canvas tint (`var(--g-canvas)` =
`var(--bg)` = `#f6f7f8`) is the report's existing page background color, already the base contrast
surface for body text throughout the report — no new surface/text combination was created. Badge
chip colors (`bdg-recoverable`/`bdg-unverified`/`bdg-indicative`) are unchanged CSS (already
AA-compliant per the root Batch D taxonomy work) — only which badge fires for a given status
string changed (display remap), not any color value.

**Motion**: zero transitions/animations touched — this stage is pure static-HTML table/box/row
markup and CSS, no interactive states.

## Open items / deferred

1. Stage 7 (Profit Waterfall + Sensitivities onto the redesign system) is next — this stage
   deliberately left both untouched, confirmed visually identical in the before/after report
   screenshots.
2. `REPORT_CSS`'s hand-duplicated `--fs-*`/`--g-*`/`--f-mono` tokens must be kept in sync with
   `build-interactive.js`'s own copies if either changes — flagged in-code with a comment; no
   shared-import path exists between the two files (report-renderer.js is the lower-level module).

## Commit

Branch `redesign/stage-6-report-tables`, branched from `redesign/stage-5-font-finalize` tip
(`528134c`). Not merged to any earlier stage branch or `main`; not pushed, per instructions.
