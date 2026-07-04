# Redesign Stage 9 — PDF Report: Type System + Structure

Branch: `redesign/stage-9-pdf-fonts-structure`, branched from `redesign/stage-8-tornado-labels`
tip (`a9fc82f`) — a stacked chain; Stage 0 through Stage 8 all remain unmerged to `main`.

Scope: self-host IBM Plex Sans and repoint `scripts/report-pdf-renderer.js`'s print stylesheet
(`PDF_CSS`) onto the Plex superfamily — Plex Sans for display/body, Plex Mono for data figures —
dropping Inter and Source Serif 4. Migrate the PDF header, trade-parameters, cost/tax/pricing-ladder
tables, badges, VAT/surcharge info-boxes, and partner/hedge panels onto that type system. Does
**not** touch the PDF's waterfall, tornado, or sensitivities charts (there are none yet in the PDF —
confirmed by inspection; Stage 10 adds them) — and does not touch `build-interactive.js` or
`report-renderer.js`.

## What changed

**1. Font pipeline (`scripts/build-report-fonts.sh` + `scripts/report-fonts.js`)**

- Removed the Inter and Source Serif 4 downloads/instancing steps (both were self-hosted since
  Stage 0/5 respectively, but `report-pdf-renderer.js` never actually consumed either — the PDF
  was rendering on Chromium's system-font fallback the whole time, which is *why* this stage
  needed its own font work rather than just a CSS repoint).
- Added IBM Plex Sans, instanced from Google Fonts' variable `IBMPlexSans[wdth,wght].ttf`
  (axes `wght`/`wdth`, no `opsz` — unlike Inter/Source-Serif4) at `wght=400/500/600/700`,
  `wdth=100` (Normal), subset to the same glyph set as before (Basic Latin + `₦` U+20A6 + the
  HTML-entity symbol set), embedded as `'TIS Sans'`.
- Kept IBM Plex Mono unchanged (`'TIS Mono'`, weights 400/500/600 — added Stage 0, this is the
  first stage that actually wires it into the PDF).
- Regenerated `scripts/report-fonts.js` — now emits exactly 7 `@font-face` rules (`TIS Sans` ×4,
  `TIS Mono` ×3), confirmed by grep; zero references to Inter/Source Serif remain.

**2. `PDF_CSS` repoint (`scripts/report-pdf-renderer.js`)**

- `.serif`, `.cover-title`, `.cover-statement`, `.section-title` — previously
  `font-family: 'TIS Serif', Georgia, 'Times New Roman', serif` — now
  `font-family: 'TIS Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif`, bumped to `font-weight:
  700` on the two headline roles (cover title, section titles) so Plex Sans carries the display
  hierarchy the serif face used to (Plex Sans has no self-hosted italic, so `.cover-statement`
  drops the italic-serif treatment for medium-weight sans instead — a deliberate, visible but
  minor style change, not a structural one).
- Applied `font-family: 'TIS Mono', 'SF Mono', Menlo, monospace` to every class the file's own
  pre-existing code comment already named as the tabular-figure set: `.r`, `.kpi-value`,
  `.glance-value`, `.wf-amt`, `.dl dd`, `.reconcile b`, `.tbl-id`, `.section-num`, `.tnum`. Added a
  `.glance-value.is-text` escape hatch (was an inline `style="font-variant-numeric:normal"`
  override before) for the one glance item that's text, not a figure (`Flow`), so it stays in Plex
  Sans rather than being pulled into Mono.
- Left `.cover-id` (the trade ID, e.g. `TIS-PROFOGAS-DANGOTE-001`) in Plex Sans, unchanged — it's
  an identifier, not a numeric column, matching the file's own pre-existing rationale comment.
- No hex color values changed anywhere in the diff (verified via `git diff | grep -iE
  "#[0-9a-f]{3,6}|color:"` — only `font-family`/`font-weight` additions, all reusing the existing
  `--ink`/`--slate` custom properties) — so print contrast is unaffected by this stage.
- Badges were already on the 4-state taxonomy (`pill()` mirrors `badge()` — no badge / `Indicative`
  / `⚠ Unverified` / `✓ OK`) from before this stage; confirmed no raw `CONFIRM`/`EXAMPLE`/
  `RECOVERABLE` label survives in the rendered PDF (see verification below). Tables (eyebrow
  uppercase headers, mono tabular numerics right-aligned, hairline rows, weight+hairline totals
  rows) and VAT/surcharge/partner/hedge info-boxes were likewise already built to this pattern
  pre-stage — this stage's job there was applying the Mono face to their figures, not restructuring
  markup.

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed.

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times. Only font/CSS files touched — no `engine/` file was
edited.

## Scope check

```
 scripts/build-report-fonts.sh  | 54 +++++++++++++++++++-----------------------
 scripts/report-fonts.js        | 29 ++++++++++-------------
 scripts/report-pdf-renderer.js | 48 +++++++++++++++++++++----------------
 3 files changed, 64 insertions(+), 67 deletions(-)
```

`build-interactive.js` and `report-renderer.js` are untouched (not in the diff) — confirmed by
`git status`/`git diff --stat` above listing only the three files above.

## Rendered PDF verification

Generated via `node scripts/build-report-pdf.js trades/reference-trade-001.json
out/stage9-reference-trade.pdf` (5 pages, 115 KB), rasterised page-by-page with `pdftoppm` and
inspected visually. Screenshots committed to `reports/assets/stage-9-pdf-fonts-structure/`:

- `page-1-cover.png` — cover: Plex Sans display title ("Commercial Trade Analysis") at 700 weight,
  no hyphen-widening artifact on the trade name or trade ID, brand-accent rule intact.
- `page-2-exec-cost.png` — Executive Summary KPI band + cost build-up table: KPI figures and
  cost-table numerics in Plex Mono tabular, badges rendering as `Indicative`/`⚠ Unverified`/`✓ OK`
  pills (no raw status strings), eyebrow uppercase table headers, hairline rows, weight+hairline
  totals row (no dark-filled totals row anywhere).
- `page-3-tax-waterfall.png` — tax block, VAT/surcharge summary-strips, profit waterfall cards,
  partner deliverables, sensitivities table — all figures in Mono, reconciliation identities render
  with `✓ OK` marks, no clipped text.
- `page-4-ladder-fx-hedge.png` — pricing ladder, FX & settlement, hedge analysis panels — dl/dd
  info-row grammar in Mono figures, toggle chips (`Hedged`/`Unhedged`) unaffected, no pagination
  breaks despite the font-metric change from Inter to Plex Sans.
- `page-5-status.png` — flag legend + open items: all four legend states render distinctly.
  Actually rendered the reference trade's full HTML (not just the PDF screenshot) and grepped it
  for `CONFIRM|EXAMPLE|RECOVERABLE`: the only 9 hits are all `title="CONFIRM"` attributes inside
  `pill()`'s own `<span class="pill pill-unv" title="${esc(status)}">&#9888; Unverified</span>` —
  a hover tooltip carrying the raw engine status, not visible text (Chromium's print/PDF path does
  not render `title` tooltips). The visible label at every one of those 9 sites is `⚠ Unverified`.
  No raw taxonomy string appears as rendered, visible text anywhere in the document.

No broken pagination or clipped content was observed anywhere in the 5 pages from the Inter→Plex
Sans font-metrics change. Running header/footer (Playwright chrome, rendered separately from
`PDF_CSS`) is unaffected — out of this stage's scope per the orientation notes, since it isn't part
of the document's own type system.

The PDF has no waterfall/tornado/sensitivities *charts* to preserve — `report-pdf-renderer.js`'s
`profitWaterfall()` renders text/number summary cards (`.wf-node`) and its "Sensitivities" section
renders a plain table, not an SVG/chart (confirmed by grep for `svg`/`chart` in the file, zero
hits outside comments). Stage 10 will add the actual charts; nothing chart-shaped existed here to
break.

## Print contrast

No color tokens were added or changed this stage (see diff-grep above) — every touched rule only
gained `font-family`/`font-weight`, reusing the existing `--ink: #242331` / `--slate: #717c89` /
badge-background/text pairs already in place and already print-tested in prior stages. Contrast is
unchanged.

## Not done here (explicitly out of scope)

- PDF waterfall/tornado/sensitivities charts — Stage 10.
- `build-interactive.js`, `report-renderer.js` — untouched, confirmed.
- Playwright running-header/footer templates in `scripts/build-report-pdf.js` — a separate
  Chromium print-margin box outside `PDF_CSS`; left on its system-font fallback.
