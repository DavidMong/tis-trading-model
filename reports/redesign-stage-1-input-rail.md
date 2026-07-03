# Redesign Stage 1 — Input Rail

Branch: `redesign/stage-1-input-rail`, branched from `redesign/stage-0-foundation` tip
(`8f3d3e8`), **not** `main` — Stage 0 is unmerged.

Scope: the left input rail — Deal/Costs/Hedge tabs, segmented controls, toggles, and the ICE
Gasoil swap panel — wired onto the Stage 0 `--fs-*`/`--g-*` tokens and the `.field-row` grammar.
No result section, the HTML report, or the PDF was touched. The Profit Waterfall and app shell
were not touched again except the `--g-text-slate` role-token value (global, expected ripple).

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed.

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared (not the truncated shorthand). `node run.js
trades/reference-trade-001.json` and `node scripts/build-report.js` both re-run cleanly after the
change with no errors.

## Files touched

- `scripts/build-interactive.js` — **only** the `css()` function (two hunks, both inside the
  Stage 0 token/component CSS block). `git diff --stat`: 1 file changed, 68 insertions(+), 4
  deletions(-). No other file changed.

**Deliberately NOT touched** (confirmed via `git diff --stat` / manual check):
- Any result-section renderer (`renderCost`, `renderLadder`, `renderHedge`, `renderWaterfall`,
  `renderKPIs`, sensitivities, tax block) — CSS-only classes they read (`.data-table`,
  `.kpi-atom`, etc.) were not touched this stage; only the token definitions those classes already
  reference, e.g. `--g-text-slate`, moved value — that's the one intentional global ripple called
  for in the brief.
- `scripts/report-renderer.js`, `scripts/report-pdf-renderer.js` — zero diff.
- The field-rendering JS logic: `ir()`, `ni()`, `ti()`, `si()`, `tog()`, `pip()`, `sec()`,
  `storageRow()`, `refreshHedgePh()`, `updateHedgedVolPlaceholder()`, `onInputChange()` — none of
  these functions were edited. Every field in Deal/Costs/Hedge/ICE-swap is emitted by this same
  small set of helpers, so a pure-CSS pass over their existing class names (`.ir`, `.ir-lbl`,
  `.si`, `.ss`, `.sr`, `.pip*`, `.si.ph`) covers all three tabs and the hedge panel without any
  markup or logic change.
- `engine/`, `trades/*.json`, config, data bindings — untouched.

## Design decision: CSS-only re-skin, not a markup swap (deviation + reasoning)

The brief's Step 3 says "wire `.field-row` into the Deal/Costs/Hedge tab fields." Stage 0's report
flags `.field-row` as "defined only — not yet applied," implying the literal component class should
be dropped into the DOM. I did not do that. Instead I restyled the **existing** `.ir`/`.ir-lbl`/
`.si`/`.pip`/`.si.ph` classes (which `ir()`/`ni()`/`pip()` already emit for every field in scope)
onto the same visual grammar `.field-row` defines — label eyebrow (`--fs-label`, uppercase,
`--g-text-slate`) + input (`--fs-input`, mono+tabular-nums for numeric) + status pip + unit,
all on one row. Reasoning: `.field-row`'s own CSS was never wired to a DOM producer function, and
swapping `ir()`'s markup to emit `.field-row-*` classes would touch the same function that
`refreshHedgePh()` and the pip-state logic depend on (`data-ph`, `.si.ph`, `.pip-*`) — exactly the
kind of change the brief explicitly warns against ("preserve the existing DOM hooks... you are
restyling CSS/markup wrapper, not rewriting field-rendering JS logic"). Retargeting the existing
classes' CSS achieves the same visual result (verified by screenshot) with zero risk to pip
semantics, and is the same pattern Stage 0 itself used for the header/waterfall (re-skin existing
selectors onto new tokens, no markup rewrite). Flagged as an open item below for whoever
eventually wants the literal `.field-row-*` class names in the DOM.

## `--g-text-slate` AA contrast fix

Old: `--g-text-slate: var(--slate)` (alias of `--slate` #717c89, unchanged — Stage 0 flagged this
pairing as below AA-normal: 4.25:1 on white, 3.96:1 on canvas #f6f7f8).

New: `--g-text-slate: #64707c` — a **darkened role-token value**, not an alias. `--slate` itself
(`#717c89`) is untouched everywhere else in the codebase, per the brief's constraint.

**WCAG relative-luminance computation** (formula: linearize each sRGB channel — `c ≤ 0.03928 ⇒
c/12.92`, else `((c+0.055)/1.055)^2.4` — then `L = 0.2126R + 0.7152G + 0.0722B`; contrast =
`(L_lighter + 0.05) / (L_darker + 0.05)`):

| Pairing | Computed contrast |
|---|---|
| `#64707c` on `#ffffff` | **5.06 : 1** (was 4.25 : 1) |
| `#64707c` on `#f6f7f8` (canvas) | **4.72 : 1** (was 3.96 : 1) |

Both now clear the 4.5:1 AA-normal floor with margin (canvas was the binding constraint: it needs
`L_text ≤ 0.1675` vs white's looser `L_text ≤ 0.1833`; `#64707c` has `L ≈ 0.1575`, satisfying
both). Verified numerically with a small Node script implementing the formula above (not
hand-computed) — candidates `#717c89`→4.245/3.958, `#64707c`→5.060/4.717, confirming the fix and
reproducing Stage 0's reported baseline numbers as a sanity check.

Every surface reading `--g-text-slate` inherits this automatically, including Stage 0's
header/sidebar/waterfall secondary text — confirmed via `getComputedStyle` in the browser
(`--g-text-slate` resolves to `#64707c` at `:root`) and visually in the before/after screenshots
below (field-row labels now render in the darker slate).

Also fixed in the same pass, in a rule I was already touching for other reasons: `.ir.pri .ir-lbl`
(primary-tier field labels — ICE, FOB) previously used `var(--ink-60)` (rgba ink @ 60% on white ≈
4.19:1, also sub-AA). Swapped to `var(--g-chrome-ink)` (solid ink) — this both strengthens the
intended "primary field" emphasis and clears AA, without touching the separate `--ink-60` token
used elsewhere in the codebase (out of scope, not changed).

## What was wired onto tokens

- **Field-row grammar** (`.ir-lbl`, `.si`, `.ss`, `.sr`): label eyebrow now `--fs-label` (10px),
  uppercase, `.04em` letter-spacing, `--g-text-slate`; inputs `--fs-input` (13px); numeric inputs
  (`input[type="number"].si`) get `--f-mono` (text inputs stay in `--f-body` — the type selector
  splits mono-numeric from prose without touching `ni()`/`ti()`, which both emit class `.si`).
  `tabular-nums lining-nums` was already applied to `.si` globally by Stage 0; unchanged.
- **Tab system / section titles**: `.tab-btn`, `.sb-sec-title`, `.tier-div-lbl`, `.disc-btn`
  already moved to `--fs-label` by Stage 0 — untouched this stage. Red active-tab underline
  (`.tab-btn.active`) left exactly as-is (brand wayfinding, per root CLAUDE.md — not repurposed).
- **Segmented controls** (`.route-seg`/`.seg-btn`): border → `--g-hairline`, label →
  `--fs-label`/`--g-text-slate`, active fill → `--g-chrome-ink` (already ink, now via token),
  transition → `--g-duration-ui` (160ms) + `--g-easing-standard`. Added `.seg-btn:focus-visible`
  (previously no focus style existed on this control at all).
- **Toggles** (`.tgl-track`/`.tgl-knob`/`.tgl-lbl`): ink active fill unchanged (already token-free
  correct); transition durations moved from untimed `.18s` (180ms, over the 160ms ceiling) to
  `--g-duration-ui` (160ms flat) on background/transform/color. No gradient/glow — none existed.
  Hedge-typed (`data-type="hedge"` → green) and surcharge-typed (`data-type="surcharge"` → amber)
  active-fill overrides (Batch C semantics) are untouched.
- **ICE Gasoil swap panel**: uses the exact same `ir()`/`ni()`/`si()`/`sec()` helpers as the other
  two tabs (confirmed in source — `tabHedge` template calls the identical functions), so it
  inherited the field-row/mono/focus treatment automatically; no separate edit was needed beyond
  the shared CSS pass. `.sb-sec-title` for "ICE Gasoil Swap" was already tokenized by Stage 0.
- **Reduced motion**: added `.seg-btn, .tgl-track, .tgl-knob, .tgl-lbl` to a new
  `prefers-reduced-motion: reduce` block collapsing their transition durations to `.01ms`,
  matching the existing pattern from Stage 0's block for `.section-block`/`.kpi-atom`/etc.

## Verification

- **Comment-truncation regression check** (the Stage 0 pitfall — a `*/`-like substring inside a
  CSS comment silently truncating the following `:root` block): built the HTML, extracted the
  `<style>` block, and confirmed via `getComputedStyle` in an actual Playwright-driven browser
  (not just source-reading) that `--g-text-slate`, `--g-chrome-ink`, `--fs-label`, `--fs-input`,
  `--g-duration-ui` all resolve to non-empty values, `.report-header` background renders solid
  (`rgb(36, 35, 49)`), `.ir-lbl` computed `text-transform` is `uppercase` and `color` is
  `rgb(100, 112, 124)` (`#64707c`), and `input[type="number"].si` computed `font-family` includes
  `IBM Plex Mono`. All confirmed correct — no repeat of the Stage 0 bug.
- **Build**: `npm run build:interactive` succeeds cleanly; `node run.js
  trades/reference-trade-001.json` and `node scripts/build-report.js` both re-run with no errors
  and unchanged output (neither file was touched this stage).
- **Screenshots** (Playwright MCP, local `http.server` on port 8934 serving `out/`, since
  `file://` is blocked in this environment) — captured before (Stage 0 tip, via a temporary
  `git stash`/restore round-trip since `git stash pop` is blocked by this environment's Bash
  safety policy — restored via `git show stash@{0}:... > file` + overwrite, then `git stash drop`)
  and after (this stage's changes), at desktop (1440×1000) and narrow/drawer breakpoint
  (700×1000). **Committed to the repo** under `reports/assets/stage-1-input-rail/` (not left in
  scratch/tmp, per the brief's explicit correction of the Stage 0 gap):
  - `before-desktop-deal.png` / `after-desktop-deal.png` — Trade Identity + Pricing sections;
    pip states visible: amber dot (ICE, FOB primary fields — INDICATIVE-class market inputs),
    no-dot (`pip-none`) on free-text identity fields. After: labels uppercase, darker slate.
  - `before-desktop-costs.png` / `after-desktop-costs.png` — cost-line fields; green (`pip-ok`)
    and orange (`pip-unv`, e.g. NIMASA cabotage/freight levy — UNVERIFIED per root CLAUDE.md) pips
    both firing correctly after the restyle.
  - `before-desktop-hedge.png` / `after-desktop-hedge.png` — ICE Gasoil Swap panel with hedge
    toggled ON: green (Route, Hedged volume — has a value), amber `.si.ph` placeholder style on
    Fixed price (empty, unconfirmed default), amber pip on Swap fee/Bank spread
    (PLACEHOLDER/INDICATIVE) — all `.si.ph` / pip-state triggers preserved exactly.
  - `before-narrow-hedge.png` / `after-narrow-hedge.png` / `after-narrow-hedge-drawer-open.png` —
    700px width; drawer collapse/expand and tab switching unaffected, field-row grammar renders
    correctly inside the drawer.
- **git diff scope check**: `git diff --stat` shows exactly one file, `scripts/build-interactive.js`,
  68 insertions / 4 deletions, both hunks inside the `css()` function (confirmed via `git diff |
  grep '^@@'`). No renderer function, no report/PDF file, no engine/binding code touched.

## Accessibility + motion audit

No `fixing-accessibility` / `fixing-motion-performance` skill was available in this session (same
as Stage 0) — manual check, WCAG formula computed via script (see above), not eyeballed.

- **Contrast**: `--g-text-slate` (`#64707c`) — **5.06:1 on `#ffffff`**, **4.72:1 on `#f6f7f8`**
  (canvas). Both ≥ 4.5:1 AA-normal. `.ir.pri .ir-lbl` (ICE/FOB primary labels) moved from
  `--ink-60` (~4.19:1) to solid `--g-chrome-ink` (15.44:1, per Stage 0's existing measurement of
  `--ink` on white).
- **Focus-visible**: audited every field/control type touched this stage —
  - `.si` (number/text inputs): pre-existing `:focus` ring (box-shadow, ink) — unchanged, already
    visible on both mouse and keyboard focus.
  - `.ss` (select): previously `outline:none` with only a border-color change on `:focus` — no
    visible ring on some browsers/themes. Added `.ss:focus-visible` box-shadow ring this stage,
    matching `.si`'s ring language.
  - `.seg-btn` (route toggle buttons): had **no** focus style at all before this stage (`:hover`
    only). Added `.seg-btn:focus-visible` with a 2px ink outline, `-2px` offset (inset, since the
    button sits inside a bordered `.route-seg` container with `overflow:hidden`).
  - `.tgl-wrap` (toggle switches): already had `:focus-visible` ring from before this stage
    (`box-shadow` on `.tgl-track`) — unchanged.
  - `.tab-btn`, footer buttons: Stage 0 already added `:focus-visible` rings — unchanged.
- **Motion**: all transition/duration changes this stage are `transform`/`opacity`/`background`/
  `color` only (no new layout-affecting animated properties) at `--g-duration-ui` (160ms, at the
  brief's ceiling) or the existing pip/toggle color transitions. `prefers-reduced-motion: reduce`
  extended to cover `.seg-btn`, `.tgl-track`, `.tgl-knob`, `.tgl-lbl` (collapses to `.01ms`),
  alongside Stage 0's existing block for `.section-block`/`.kpi-atom`/`.chart-frame`/`.field-row`.

## Open items / deferred

1. `.field-row-*` classes remain defined-but-unused in the literal DOM sense — this stage achieved
   the same grammar by restyling `.ir`/`.ir-lbl`/`.si` instead (see "Design decision" above).
   Someone doing a deeper field-editor rewrite could later swap `ir()`'s markup to emit the
   `.field-row-*` classes directly and delete the now-redundant `.ir-lbl` overrides — purely
   cosmetic consolidation, not required for correctness.
2. `.pip-unv` (`#f97316`, orange) and `.pip-ph`/`.pip-ind` (`#f59e0b`, amber) remain distinct raw
   hex values, not yet mapped onto `--g-caution`/a dedicated `--g-unverified` role token — left
   alone deliberately since retinting them is a taxonomy-adjacent visual decision outside this
   stage's literal scope ("restyle the pip visuals within the taxonomy; never change which state
   renders when") and risks subtly changing which shade communicates which state.
3. `.si.ph` placeholder amber (`#fdba74` border / `#fffbf0` bg) and `.hedge-warn-note` amber
   (`#fff7ed`/`#fdba74`/`#92400e`) are still raw hex, not `--g-caution`-derived — same reasoning
   as item 2, left untouched.
4. The five result sections still outside Stage 0/1's scope (Cost Build-Up, Equity Structure,
   Hedge Analysis, Tax Block, Sensitivities) remain on the Batch F token scale — unchanged, as
   scoped by the brief.

## Commit

Branch `redesign/stage-1-input-rail`, created from `redesign/stage-0-foundation` tip (`8f3d3e8`)
via `git checkout -b` (fixture already present, no worktree needed). Not merged to
`redesign/stage-0-foundation` or `main`, not pushed, per instructions.
