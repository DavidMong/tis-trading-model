# Redesign Stage 3 — Partner/Equity + Hedge Analysis

Branch: `redesign/stage-3-partner-hedge`, branched from `redesign/stage-2-result-tables` tip
(`16b7eff`) — a stacked chain; Stage 0, Stage 1, and Stage 2 all remain unmerged to `main`.

Scope: the Partner Deliverables / Equity Structure section, the Hedge Analysis section, and a
single unified summary-strip treatment applied to those sections' summary blocks AND retrofitted
onto `.cost-totals` (the Cost Build-Up footer, explicitly deferred in the Stage 2 report as a
"later pass" open item). Sensitivities, the status legend, empty/pending states, the HTML report,
and the PDF were **not** touched, per brief.

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed
(stated explicitly, per the worktree-setup checklist in root `CLAUDE.md`).

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times (not the truncated shorthand). `npm run
build:interactive` succeeds cleanly before and after.

## Files touched

`git diff --stat`: **1 file changed, 80 insertions(+), 7 deletions(-)** —
`scripts/build-interactive.js` only. No other file in the working tree changed except the new
`reports/` additions (this report + screenshots).

**Confirmed untouched:** `engine/core/*`, `engine/flows/*`, `trades/*.json`, `run.js`,
`scripts/report-renderer.js`, `scripts/report-pdf-renderer.js` — zero diff (same isolation as
Stage 2: the interactive-only CSS additions live inside `build-interactive.js`'s own `css()`
function, which concatenates `reportCss + <interactive-only additions>`; the static HTML report
and PDF renderer read `reportCss` directly and never see this stage's new rules).

**FIGURE/COMPUTATION logic left untouched** (quoted from the diff, confirming what was and wasn't
edited):
- `renderPartner`'s entire data path — `pd.productReceived`, `pd.cashReceived`,
  `res.financing.*`, `q.economic.partnerTonnes`, `q.paper.partnerPaper`, `pp.cashTrueUp`, and the
  `pd.principalTie` reconciliation (`owed = product + cash`, `pd.principalTie.ok` badge selection)
  — not touched. Only `class="tie-out-box"` gained `summary-strip` on the wrapping `<div>`.
- `renderHedge`'s `cmpBlock(comp)` — `comp.hedgedTisNet`, `comp.unhedgedTisNet`,
  `comp.hedgeWorthItVsUnhedged` (the `delta` used for `fmtUsdSign`) are read verbatim from
  `res.hedgeComparison`, computed entirely upstream in `engine/core`. The only new code in
  `cmpBlock` is `hCls`/`uCls` — two local variables that classify the *already-computed* sign of
  `comp.hedgedTisNet` / `comp.unhedgedTisNet` into `'neg'`/`'pos'`/`''` strings purely for a CSS
  class, never altering the number itself. `iceRows`, `fxRows`, `iceRouteRows`, `iceNotional`,
  `settlementNote`, `iceDetail`, `fxWarning` — the entire hedge-detail math/text derivation — is
  byte-for-byte unchanged.
- `renderCost`'s `.cost-totals` figures (`cost.allInCost`, `rv.recoverable`,
  `cost.exShipLandedPerMT`) — not touched. Only `class="cost-totals"` gained `summary-strip`.
- `badge()`, `infoRow()`, `fmtUsd()`, `fmtUsdSign()` — zero diff.

## What was wired onto tokens/classes

- **New `.summary-strip` class** (one shared rule, `compound-selector`'d per surface so it wins
  the cascade regardless of position relative to each block's own pre-existing rule): `border:
  none; border-top: 1px solid var(--g-hairline); background: var(--g-canvas);` (plus
  `border-radius: 0` where the target previously had a rounded corner). Added to 3 markup sites:
  - `renderPartner`'s `<div class="tie-out-box">` → `class="tie-out-box summary-strip"`. Previously
    a full `1.5px solid var(--border)` box with `border-radius: 8px`; now hairline-top only — the
    reconciliation math and the `✓ OK` / `MISMATCH` badge (`pd.principalTie.ok`, untouched) are
    unaffected, only the wrapping chrome flattens.
  - `renderHedge`'s `cmpBlock()` `<div class="h-cmp">` → `class="h-cmp summary-strip"` (both the
    "Comparison not available" fallback and the populated-data path).
  - `renderCost`'s `<div class="cost-totals">` → `class="cost-totals summary-strip"` — the Stage 2
    report's explicitly deferred open item #1, closed this stage. `.cost-totals` already had a
    top-border-only treatment (no full box), so the visible change here is narrower than for
    `.tie-out-box`: border-width `2px → 1px` and the color re-sourced through `--g-hairline` (which
    itself aliases the same `var(--border)` value `.cost-totals` used before) — same underlying
    hairline color, now token-sourced and thinner, consistent with the other two surfaces. Screenshot
    hashes below confirm this is a real (if visually subtle) pixel change, not a no-op.
- **Partner/Hedge info-row grammar**: `.h-detail .info-row span` / `.two-col-grid .info-row span` /
  `.h-cmp .info-row span` → `color: var(--g-text-slate)` (was `var(--slate)`, the un-fixed base
  slate `#717c89`); the matching `b` selectors → `font-family: var(--f-mono); font-size:
  var(--fs-data); font-variant-numeric: tabular-nums lining-nums; color: var(--g-chrome-ink)`.
  These selectors already matched every `infoRow()`-generated row across Partner's two-column card
  and Hedge's ICE/FX detail rows (both call sites were already using the shared `infoRow()`
  helper) — so most of Step 2/3's "onto the info-row grammar" requirement was satisfied purely by
  fixing the CSS these existing rows already read, no markup change needed there. The Hedge
  comparison block (`cmpBlock`) previously used its own bespoke `.h-cmp-row`/`.h-cmp-lbl` markup
  instead of `.info-row` — that markup was switched to `.info-row` (see diff), which is the one
  actual markup change in this stage (label/value structure identical: `<span>`/`<b>`, only the
  class names moved to the shared grammar). `.h-cmp-val`/`.h-cmp-delta` classes are kept
  *alongside* `.info-row`'s `b` for the direction-coloring hook below.
- **Semantic direction (Step 4)**: scoped, compound-selector'd rules —
  `.h-cmp .info-row b.h-cmp-val.neg` / `.h-cmp-delta.neg` → `var(--g-loss)` (`#991b1b`);
  `...pos` → `var(--g-chrome-ink)` (ink, not the reportCss default green `.pos`). Applied to all
  three comparison figures (Hedged TIS Net, Unhedged TIS Net, Hedge value vs unhedged) via new
  `hCls`/`uCls`/`dcls` sign classification in `cmpBlock()`. Deliberately does **not** touch the
  page-wide unscoped `.pos`/`.neg`/`.loss` classes used elsewhere (ladder cells, sensitivity
  deltas) — those carry a documented, different semantic (Batch C: `.neg` = "expected structural
  negative" → slate, not a loss) that is out of this stage's scope. The sign glyph is always
  present regardless of color: `fmtUsd()` prefixes negatives with `−$`, `fmtUsdSign()` prefixes
  every value with `+$`/`−$` — confirmed by reading both formatters (`scripts/build-interactive.js`
  lines 2066–2075), unchanged this stage.
- **`.h-card-title`**: `font-size: 11px` → `var(--fs-label)` (10px), `color: var(--slate)` →
  `var(--g-text-slate)` — same eyebrow-label token pair as the Stage 2 data-table headers / Stage 0
  section-block eyebrow.
- **Route segmented control** (`.route-seg`/`.seg-btn`): found already fully on the `--g-*`/`--fs-*`
  token scale from an earlier pass (hairline border, `--fs-label`, `--g-text-slate`,
  `--g-chrome-ink` active fill, `--g-duration-ui` transition) — confirmed by reading the existing
  rules at `scripts/build-interactive.js:1556-1567`; no further change needed or made.
- **Basis-risk / hedge detail note text**: `.hedge-cards .defaults-note` → `font-size:
  var(--fs-caption)`, `color: var(--g-text-slate)` (was a raw `10px`/`#94a3b8` pair). Scoped to
  `.hedge-cards` specifically (not the base `.defaults-note` class, which is also used by ~10 other
  unrelated sidebar field-notes across the Deal/Costs/Hedge input tabs — Stage 1 territory, out of
  this stage's scope) so only the three `defaults-note` instances inside Hedge Analysis
  (settlement-ICE note, FX-hedge-base note, the `cmpBlock` cost/benefit explainer) pick up the
  fix.

## Deliberately NOT touched (explicit decision, not an oversight)

- `.h-cmp-row`/`.h-cmp-lbl` CSS rules (lines 866–876 in the pre-existing stylesheet) are now
  orphaned dead CSS — `cmpBlock()`'s markup moved to `.info-row`, but the old rule declarations
  were left in place rather than deleted, since removing unused CSS wasn't asked for and doing so
  risks missing another call site. `.h-cmp-val`/`.h-cmp-delta` (the two classes still actually used,
  for direction coloring) are untouched aside from the new scoped `.neg`/`.pos` overrides above.
- `.h-lock-warn` (amber "fixed price / forward rate not set" warning boxes) — left exactly as-is;
  this is a genuine caution-status color (Batch C taxonomy), not plain route/basis-risk prose, so
  it's outside the "onto tokens" instruction's intent.
- The base (unscoped) `.defaults-note` rule and its ~10 other call sites across the Deal/Costs/
  Hedge sidebar tabs — Stage 1's territory; only the Hedge-Analysis-scoped instances were touched
  (see above).

## Verification

- **Build**: `npm run build:interactive` succeeds cleanly, `out/TIS-interactive.html` regenerates,
  both before and after every edit in this stage.
- **Cascade-specificity bug caught and fixed during verification** (not just asserted from source):
  the first pass wrote the direction-coloring rule as bare `.h-cmp-val.neg, .h-cmp-delta.neg`
  (specificity 0,2,0), which lost to the info-row grammar rule `.h-cmp .info-row b` (specificity
  0,2,1) that also sets `color`. Caught by checking `getComputedStyle()` in a live Playwright page
  (`color: rgb(36, 35, 49)` — ink, not loss-red — on a value that should have been red) rather than
  trusting the CSS source read. Fixed by raising specificity to `.h-cmp .info-row
  b.h-cmp-val.neg`/`.h-cmp-delta.neg` (0,3,2); re-checked via the same live computed-style query,
  confirmed `rgb(153, 27, 27)` (`#991b1b` = `--g-loss`) before taking any screenshots. Suite +
  fingerprint re-run clean after the fix.
- **Negative hedge-delta scenario**: no synthetic input needed — the bundled
  `SAMPLE-EQUITY-PARTNER-001` fixture's default state already produces a negative "Hedge value vs
  unhedged" (`−$10,140.00`) on the ICE Gasoil Swap card, because `hedgeComparison` computes the
  hedged-vs-unhedged outcome unconditionally (independent of whether the ICE toggle is currently
  on), and this fixture's fee/financing cost exceeds its (zero, since no settlement ICE entered)
  realized swap gain. Confirmed via live computed style (`color: rgb(153, 27, 27)`) before
  screenshotting.
- **Screenshots** (Playwright, local `http.server` instances on ports 8940 (after, this branch) and
  8941 (before, a temporary `git worktree add` at Stage 2 tip `16b7eff`, fixture copied in, built,
  and torn down after capture) — committed to `reports/assets/stage-3-partner-hedge/`:
  - `before/after-desktop-{partner,hedge,cost-totals}.png` (1440×2200 viewport, element-clipped via
    `section[aria-labelledby="partner-h"]` / `section[aria-labelledby="hedge-h"]` / `.cost-totals`)
    and the matching `narrow-*` set (700×1200 viewport).
  - The bundled `SAMPLE-EQUITY-PARTNER-001` fixture trade renders by default; both hedge toggles
    (ICE Gasoil Hedge, FX Hedge) are OFF in this fixture (`● Off` pill on both cards), which is
    itself useful evidence — the comparison block renders correctly and the negative delta shows
    in loss-red *without* the hedge being active, exercising the "what-if-hedged" comparison path
    independent of the live toggle state. The Partner card exercises the `✓ OK` tie-out badge, the
    "↓ TIS favour" paper-rounding indicator, and the full two-column funding-stack grammar.
  - **SHA-256 hashes, before vs after, all 6 pairs confirmed different**:

    | Pair | before (sha256) | after (sha256) |
    |---|---|---|
    | desktop-partner | `079ecbc437e27ce0df192fbfd6a048d2bc6858eb50cade5ca739237906efaa4a` | `65c85365b580961f876e3678bdaff13ed47abe6f7df43d4734c1b217e7f2ce93` |
    | desktop-hedge | `0f752ae45cb6feade0f8fb55a015e344a480e40cfe4b6a9c6b96b457dc7753e6` | `6484845bb39c87c486c3772a644bd9d200608bd56bf6e658032a3124d30a77b0` |
    | desktop-cost-totals | `f1a31400e27ec3dd65babce4c0093062cfc4806181c7424054f63e5d607071af` | `79c5d37e60bcdb92cf56593cf11a482900bdec1ac0c161905a81d95d2e326d06` |
    | narrow-partner | `625d6fb530b987bc9a0b09a8085fd553d4d6ffb7684a4e4fd758092c6cf23ea2` | `c189e974796911d83e1099704d2571fe049408beff3cda5c15bf0ce48b9a82a8` |
    | narrow-hedge | `36a39a211707513e7b00f9c707d1436c6d5aa1bed7b4e59da8228638c169fc8f` | `22cdcca962bde660761f80c76bf5fd019d2e1d2599f63681691d8e7558ed470b` |
    | narrow-cost-totals | `c6b9c7d1a8e64b42faaf329caf51b076307ecdaa23ede979061955b4d70ddee4` | `888409203baa81e490a9c68853405fda891bae31a1b958300420c52806cc3f30` |

    (Full 64-char hashes via `shasum -a 256` on the actual committed files.)

## Accessibility + motion audit

No `fixing-accessibility` / `fixing-motion-performance` skill surfaced in the available list this
session either — manual check again, WCAG relative-luminance/contrast-ratio formula computed via a
small Node script (not eyeballed):

| Pairing | Contrast |
|---|---|
| `--g-text-slate` `#64707c` (info-row labels) on `#ffffff` card background | **5.06 : 1** |
| `--g-text-slate` `#64707c` on `#f6f7f8` (`--g-canvas`, the summary-strip tint) | **4.72 : 1** |
| `--g-chrome-ink` `#242331` (info-row figures, positive TIS net) on `#ffffff` | **15.44 : 1** |
| `--g-loss` `#991b1b` (negative TIS net / hedge delta) on `#ffffff` | **8.31 : 1** |
| `--g-loss` `#991b1b` on `#f6f7f8` (`--g-canvas`) | **7.75 : 1** |

All comfortably clear the 4.5:1 AA-normal floor, including on the summary-strip's tinted
background, not just the white card. `--g-text-slate`'s value is unchanged from Stage 1/2 (`#64707c`,
not re-touched this stage) — reused here, not re-derived.

**Motion**: this stage added zero new transitions/animations and touched zero existing ones. Every
change in this diff is a static color/font/border/class value — no `transition`, `animation`, or
`@keyframes` rule was added, removed, or modified. The `prefers-reduced-motion` block from Stage 0
(unchanged) continues to cover `.section-block`/`.kpi-atom`/`.chart-frame`/`.field-row`; nothing
new needs adding to that list since nothing new animates.

## Open items / deferred

1. `.h-cmp-row`/`.h-cmp-lbl` CSS rules are now dead code (superseded by `.info-row`'s markup+CSS)
   — left in place rather than deleted this stage; a future cleanup pass could remove them once
   confirmed no other call site references them.
2. `.bdg` colors (amber/orange/green hexes on the Partner tie-out and elsewhere) remain raw, not
   yet mapped onto dedicated `--g-caution`/`--g-unverified`/`--g-positive` role tokens at the badge
   level — same deferred item carried forward from Stage 1/2, still out of this stage's literal
   scope.
3. Sensitivities and the status legend remain on the pre-Stage-0 look — unchanged, as scoped by the
   brief (later stage).

## Commit

Branch `redesign/stage-3-partner-hedge`, branched from `redesign/stage-2-result-tables` tip
(`16b7eff`). Not merged to any earlier stage branch or `main`; not pushed, per instructions.

## Fix — hedge info-row justification

**Bug**: `.h-cmp .info-row` (the Hedge comparison block's rows, converted onto the shared
`.info-row` markup earlier in this stage) was never added to the flex/`justify-content:
space-between` selector list at `scripts/build-interactive.js:819` — that rule only listed
`.h-detail .info-row` and `.two-col-grid .info-row`. Result: the hedge comparison rows (Hedged
TIS Net, Unhedged TIS Net, Hedge value vs unhedged) rendered as unstyled block-level `<div>`s —
label and value stacked/collided with no gap or right-alignment. Partner's `.two-col-grid` rows
were unaffected; only the Hedge cards.

**Fix**: extended the existing selector list (no duplicated rule, no new properties) —
```css
.h-detail .info-row,
.two-col-grid .info-row,
.h-cmp .info-row,
.info-block .info-row {
```
Pure CSS, one selector-list edit. No JS, no figure, no `pos`/`neg`/`neg`-class sign logic touched.

**Step 2 — swept for other ungoverned `.info-row` usage**: grepped every `infoRow()` call site.
Found one more instance of the identical gap: `renderPartner`'s `ep === 'TIS'` branch (the
self-funded "Equity Structure" card, `scripts/build-interactive.js:3249-3260`) renders its three
`infoRow()` calls (Cargo value / Partner funding (self) / Standalone = Adjusted = TIS net) inside
`<div class="card card-body"><div class="info-block">`, not under `.h-detail`, `.two-col-grid`,
or `.h-cmp` — same missing-flex symptom. This is squarely partner-family (the other branch of the
same `renderPartner` function), so per the brief's "fix only if it is a hedge/partner-family row"
instruction, `.info-block .info-row` was added to the same selector list (see diff above).
`.info-block` is used exclusively inside `renderPartner` and `renderHedge`'s `h-detail-inner`
(confirmed by grep — no other section uses it), so this addition is precise: it closes the gap on
the previously-orphaned TIS branch and is a harmless no-op duplicate everywhere else it already
matched via `.h-detail`/`.two-col-grid`.

No other `.info-row` call site was found outside these four governed ancestors.

**Not fixed (noted, not in scope for this low-effort pass)**: the TIS-branch's three rows still
don't pick up the Stage 3 color/mono-font token treatment (`--g-text-slate` label / `--f-mono`
`--fs-data` figure) that `.h-detail`/`.two-col-grid`/`.h-cmp` rows get from the separate rule at
line ~1651 — that rule's selector list was intentionally left untouched here since the reported
defect was specifically the layout/justification gap, not typography. Flagged as a possible
follow-up, not fixed in this pass.

### Engine safety — baseline vs after (this fix)

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, as expected for a pure-CSS fix.

### Re-screenshots

`after/desktop-hedge.png` and `after/narrow-hedge.png` were overwritten in place (the `before/`
pair is untouched — it still reflects Stage 2's pre-Stage-3 look, unaffected by this fix). Hashes
confirmed to differ from the previous (broken-justification) versions:

| File | Old `after/` sha256 (broken justification) | New `after/` sha256 (fixed) |
|---|---|---|
| `desktop-hedge.png` | `6484845bb39c87c486c3772a644bd9d200608bd56bf6e658032a3124d30a77b0` | `e64cd599a34061f8be61b8f1a2f7af6578764bb3e9afc776565605a26fb4f9e9` |
| `narrow-hedge.png` | `22cdcca962bde660761f80c76bf5fd019d2e1d2599f63681691d8e7558ed470b` | `07a6fdd84ddd65e956f25224c3886cbd5117e10fd7948b7cd915f52c0538b660` |

Both confirmed visually: label left / value right with proper gap, and the negative "Hedge value
vs unhedged" (`−$10,140.00`) still renders in loss-red (`--g-loss`), unaffected by the layout fix.
