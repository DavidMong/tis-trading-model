# Redesign Stage 8 — Fix Tornado Value-Label Collision (Both Renderers)

Branch: `redesign/stage-8-tornado-labels`, branched from `redesign/stage-7-report-charts` tip
(`1d5d907`) — a stacked chain; Stage 0 through Stage 7 all remain unmerged to `main`.

Scope: fix a real, user-reported layout bug — a sensitivities tornado-chart value label can be
placed "inside" its bar when the bar clears a fixed percentage threshold, but that threshold
never checked whether the bar was actually wider than the label's own text. When it wasn't, the
label (which grows inward from the bar's outer edge toward the center spine by design) overflowed
past the spine and collided with the opposite label. Fixed in **both** tornado renderers —
`build-interactive.js`'s SVG version and `report-renderer.js`'s CSS-bar version (used by both the
HTML report and, via shared `fmt`/formatting helpers, the same figures the PDF renderer reads).
Display/geometry only — no sensitivity value, `deltaVsBase`, or `maxAbs` touched.

## User report

Screenshot showed the interactive app's Sensitivities tornado with an "FX NAFEM" row whose two
value labels rendered garbled together (`−$28,483.9` overlapping `$222,316.24`), at a trade with
base TIS net ≈ $567,763.38, ICE ≈ ∓$742k/$744k, and FX NAFEM ≈ −$28,483.97 / +$222,316.24.

## Root cause (diagnosed, then confirmed against the actual codebase)

Both renderers use the same two-part model per bar: (1) width as a percentage of the row, driven
by `deltaVsBase / maxAbs`; (2) a boolean "does the label go inside or outside the bar," decided by
comparing that percentage against a **flat constant** (`THRESH=13` in `build-interactive.js`,
`INSIDE_THRESHOLD=13` in `report-renderer.js`). An "inside" label is anchored at the bar's outer
edge and grows text **toward the center spine** (`x=50%`) — correct only if the bar is actually
wide enough to contain the text. Since font size is fixed (a fixed px value; SVG/div width is a
percentage of the container, which varies with viewport), a bar can clear the flat 13% cutoff while
still being narrower than a ~12-13-character currency string. When that happens the inside label's
text runs *past* the spine into the opposite half, directly onto the other label — exactly the
collision in the report.

Confirmed empirically (not just by reading the CSS) with the exact FX NAFEM figures from the
report: for `build-interactive.js`'s basis, the `+10%` bar (`-$28,483.97`) already renders outside
correctly (its bar barely registers), but the `-10%` bar (`+$222,316.24`) computed to `posPct=15.53`
— clearing `THRESH=13` — while requiring roughly 20 (in the same units) to actually hold its own
12-character text. The inside-anchored label consequently ran back across the spine into the
`+10%` label's territory.

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed.

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times. Only `negIn`/`posIn`/`negInside`/`posInside`
booleans and the constants that feed them changed — every `deltaVsBase`, `tisNet`, `maxAbs`, and
formatted value string is untouched (confirmed: the same figures appear in every before/after
screenshot pair below, just relocated).

## Files touched

`git diff --stat`: **2 files changed** — `scripts/build-interactive.js` and
`scripts/report-renderer.js` only. This intentionally changes the interactive app's own tornado
(the byte-lock from Stages 6–7 was specifically "no visual change" for the *default* sample trade;
this stage's fix is scoped to *only* the tornado's label placement and is expected — per the
brief — to move pixels wherever the old threshold was wrong, though as it turns out the default
trade's own interactive rendering wasn't affected — see Verification below).

## Step 1 — Width-aware placement (`build-interactive.js`)

Replaced `const BAR = 52, THRESH = 13;` and the flat `negIn = negPct >= THRESH` / `posIn = posPct
>= THRESH` with:

```js
const CHAR_PCT = 1.5, MARGIN_PCT = 2;
const fitsInside = (val, w) => w >= val.length * CHAR_PCT + MARGIN_PCT;
const negIn = row.neg && fitsInside(negVal, negW);
const posIn = row.pos && fitsInside(posVal, posW);
```

`CHAR_PCT`/`MARGIN_PCT` estimate a currency string's rendered width as a percent of the row's full
width (the same basis `negW`/`posW` already use), calibrated conservatively against the app's own
narrowest supported layout (the 700px "narrow" screenshots used since Stage 5) so the check stays
safe at any wider viewport too — it is a character-count heuristic, not a live DOM measurement, so
no second render pass or canvas text-measurement call was needed. No bar geometry (`negRect`/
`posRect`/`x`/`width`) changed — only which anchor/position the value `<text>` uses.

## Step 2 — Preserve inside labels for genuinely wide bars

Verified directly (not just asserted) against the reported scenario's own numbers: ICE's bars
(≈39.6-52% of row, the widest in every case checked) still satisfy `fitsInside` and keep their
inside placement in both renderers. Confirmed via a computed table across all 9 scenarios of a
real sample trade — `Surcharge ON (5%)` (46% of row, the single widest bar there) also stays
inside; every narrower lever (FOB premium, TC rate, FX NAFEM) correctly moves outside.

## Step 3 — Same rule in the report/PDF tornado (`report-renderer.js`)

Replaced `const INSIDE_THRESHOLD = 13;` and the flat `negInside`/`posInside` booleans with the
same-shaped fix, adjusted for this file's different basis:

```js
const CHAR_PCT = 3, MARGIN_PCT = 4;
const fitsInside = (val, pct) => pct >= val.length * CHAR_PCT + MARGIN_PCT;
const negInside = row.neg && fitsInside(negVal, negPct);
const posInside = row.pos && fitsInside(posVal, posPct);
```

`report-renderer.js`'s `negPct`/`posPct` are already expressed as "% of the HALF row" (the
`.tn-bar`'s `width:X%` is set directly, no further halving happens in this file, unlike
`build-interactive.js`'s SVG version which halves `negPct`/`posPct` into `negW`/`posW` as "% of the
FULL row"). The same underlying per-character estimate (1.5% of the full row per character) is
therefore doubled here (3% of the half row per character) to represent the identical physical
width on this file's different percentage basis. `report-pdf-renderer.js` was confirmed (again,
per Stage 7's own finding) to have its own fully independent waterfall/sensitivities markup with
no shared classes — it reads figures through `report-renderer.js`'s shared `fmt`/`badge` helpers
but has no tornado chart of its own to fix.

## Verification — reproducing the exact reported bug

Rather than reverse-engineering which real trade input produces the user's exact figures, the
demonstration uses a synthetic `sens` object with the **exact** numbers from the screenshot
(`baseNet: 567763.38`, `ICE ∓$742,119.07/$743,987.15`, `FX NAFEM -$28,483.97/+$222,316.24`,
`Surcharge ON (5%): -$738,053.62`, `FOB premium ∓$118,097.06/$118,143.98`, `TC rate
∓$30,571.85/$30,496.11`), injected directly into both renderers' actual render functions (not
approximated or re-derived) — `report-renderer.js`'s `sensitivitiesSection`/`tornadoChart` via a
real `computeTrade()` result with `res.sensitivities` overridden, and `build-interactive.js`'s
`renderSens` via a temporary debug hook (`window.__testRenderSens = renderSens`) added only to a
scratch copy of the built HTML, never to the committed file, purely so a live page could call the
function directly with the exact synthetic data.

**Screenshots** (Playwright, project's own `devDependency`), committed to
`reports/assets/stage-8-tornado-labels/`:

- `before-interactive-desktop.png` / `after-interactive-desktop.png` (1440px) and
  `before-interactive-narrow.png` / `after-interactive-narrow.png` (700px) — the interactive app's
  tornado with the synthetic FX NAFEM data. Before: `−$28,483.97` and `+$222,316.24` render
  jammed together (narrow width: garbled into `-$28,4$$222,316.24`). After: cleanly separated,
  the tiny green bar visible between them, no label crossing the spine. ICE's inside labels
  unaffected in both widths.
- `before-report-desktop.png` / `after-report-desktop.png` (1440px) and
  `before-report-narrow.png` / `after-report-narrow.png` (700px) — same synthetic data through the
  static HTML report's `tornadoChart()`. Before: `+$222,316.` visibly truncated/clipped by the
  bar's `overflow:hidden` at desktop width, worse at narrow width (`+$22` clipped to almost
  nothing). After: `+$222,316.24` fully visible outside the bar at both widths.

**Every figure identical** in both before/after pairs — `−$742,119.07`, `+$743,987.15`,
`−$738,053.62`, `−$28,483.97`, `+$222,316.24`, `−$118,097.06`, `+$118,143.98`, `−$30,571.85`,
`+$30,496.11`, base `$567,763.38` — confirmed by inspection of all 8 screenshots.

## Verification — the default sample trade

Per the brief's ask to "confirm the rest of the interactive app is unchanged except the tornado
label positions": computed the actual `negIn`/`posIn` (old vs new) decision for every scenario of
`trades/sample-equity-partner.json` (the trade both apps ship with by default) directly, rather
than assuming:

- **`build-interactive.js`'s own basis**: zero decisions changed for this trade — ICE, Surcharge
  all stay inside in both old and new logic; FOB premium/TC rate/FX NAFEM stay outside in both.
  Confirmed by a full-page screenshot hash of `out/TIS-interactive.html`: **byte-identical** to
  Stage 7's own committed `reports/assets/stage-7-report-charts/after-interactive-app.png`
  (`a73b423d6553706ad2fb007b44a214c2471b11cf6d44ec4fdac0dbd4cbdd5028`) — this default trade never
  actually triggered the bug in the interactive app, so this stage's fix has **zero visible effect**
  there. Committed as `after-interactive-full-app.png`.
- **`report-renderer.js`'s own basis** (different calibration — see Step 3): ICE's two labels
  *do* change for this same default trade — before, `−$414,915.54`/`+$417,806.07` sat cramped
  tight against their bars' own edges (borderline, though not yet overlapping the spine); after,
  they render cleanly outside with margin. This is a legitimate secondary catch by the more
  rigorous width-aware check, not a regression — screenshotted as `before-report-default-trade.png`
  / `after-report-default-trade.png`.

## Accessibility + motion audit

No `fixing-accessibility` / `fixing-motion-performance` skill surfaced in the available list this
session — manual audit.

**Colors**: zero color values touched this stage (confirmed by grep — only the threshold
constants and the two boolean expressions that read them changed). **One pre-existing gap found
during the audit, out of this stage's scope**: `build-interactive.js`'s `.tnsvg-val-neg` (the
"outside" negative-label color, `var(--role-slate)` = `#717c89`) computes to **4.25:1** on white —
just under the WCAG AA 4.5:1 floor for normal text. This color/usage already existed before this
stage (any negative lever whose bar was already below the old `THRESH=13` already rendered
outside in this color — e.g. FOB premium, TC rate in the default trade, both before and after this
fix); this stage's change doesn't introduce any *new* instance of it for the trades checked here
(zero decision changes on the interactive's own basis for the default trade, confirmed above), but
flagging it since a color-value fix was out of this stage's declared "display/geometry only,
label placement only" mandate. Left untouched, noted for a future stage.

**Motion**: zero transitions/animations in this stage's changes (label position/anchor logic
only).

## Open items / deferred

1. The pre-existing `--role-slate` (`#717c89`) on-white contrast gap for outside-positioned
   negative tornado labels (4.25:1, just under AA) — flagged above, not fixed this stage.
2. Stage 7's own flagged item (dead `.wf-box`/etc CSS in `reportCss`, a stale
   `build-interactive.js` comment claiming the PDF still needs it) remains open, untouched again
   this stage.

## Commit

Branch `redesign/stage-8-tornado-labels`, branched from `redesign/stage-7-report-charts` tip
(`1d5d907`). Not merged to any earlier stage branch or `main`; not pushed, per instructions.
