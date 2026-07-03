# Redesign Stage 2 — Result Tables

Branch: `redesign/stage-2-result-tables`, branched from `redesign/stage-1-input-rail` tip
(`d1d6ea3`) — a stacked chain; Stage 0 and Stage 1 are both still unmerged to `main`.

Scope: the result-figure tables — Pricing Ladder (ex-ship $/MT table, depot ₦/L table, and the
shared ladder scale bar), Cost Build-Up, and Tax Block — wired onto the Stage 0 `.data-table` /
`.chart-frame` component classes and `--fs-*`/`--g-*` tokens. Partner/Equity, Hedge Analysis,
Sensitivities, the HTML report, and the PDF renderer were **not** touched, per brief.

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed
(stated explicitly, per the worktree-setup checklist in root CLAUDE.md).

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times (not the truncated shorthand). `npm run
build:interactive` succeeds cleanly before and after.

## Files touched

`git diff --stat`: **1 file changed, 61 insertions(+), 16 deletions(-)** —
`scripts/build-interactive.js` only. No other file in the working tree changed except the new
`reports/` additions (this report + screenshots) and the transient `.playwright-mcp/` snapshot
directory (not committed).

**Confirmed untouched** (`git status` / `git diff --stat` show zero diff on):
- `scripts/report-renderer.js`, `scripts/report-pdf-renderer.js` — the HTML report and PDF each
  use `reportCss` directly from `report-renderer.js`; `build-interactive.js`'s `css()` function
  concatenates `reportCss + <interactive-only additions>` for the **interactive DOM only**, so the
  new Stage 2 rules (also appended inside that same `css()` function) never reach the static
  report or PDF output. Verified by reading `report-renderer.js`'s own `module.exports` (exports
  `generateHtml` + `reportCss` as its own public surface, independent of `build-interactive.js`).
- `engine/core/*`, `engine/flows/*`, `trades/*.json`, `run.js` — zero diff.

**FIGURE/FLAG computation logic left untouched** (quoted from the diff, confirming what was and
wasn't edited):
- `renderLadder`'s tier-derivation math (`ladder.exShip.tiers`, `ladder.depot.tiers`, the
  `curPrice`/`isCur` comparison at `Math.abs(tier.pricePerMT - curPrice) < 0.005`) — not touched;
  only the `<table>` tag gained `class="data-table"` and the `tr` gained no class change (still
  `class="${isCur ? 'ladder-current' : ''}"`, same conditional, same string).
- `ladderScale()`'s marker/pip position math (`const pos = ((v - lo) / range * 80 + 10).toFixed(1)`
  and the analogous tick-position line) — byte-for-byte unchanged; only the returned wrapper div's
  class attribute gained `chart-frame` (`class="ladder-scale-wrap chart-frame"`).
- `renderCost`'s cost-line iteration (`cost.lines.map(...)`), category-label lookup (`catLabel`),
  and the `l.recoverable ? ... : badge(l.status)` flag-selection ternary — not touched. Only the
  `<table>` tag's class list changed (`class="cost-table"` → `class="cost-table data-table"`) and
  three `<tr>`/`<td>` template literals (`vatBase`, `recRows`) had their **inline
  `style="background:var(--bg)"` removed** (never a math/logic change — those inline styles only
  painted a background fill) and `vatBase`'s `<tr>` gained `class="total"` to pick up the existing
  `.data-table tbody tr.total td { font-weight:600; border-top:1px solid var(--g-hairline);
  background:none }` rule (already defined by Stage 0, unchanged this stage).
- `renderTax`'s `taxLines = cost.lines.filter(l => l.taxLine)` filter and the `badge(l.status)` /
  `sur.enabled` conditionals that decide which flag renders on which row — not touched. Same
  inline-`background` removal + `class="total"` treatment applied to `recBox` (the recoverable-VAT
  callout row); `surRow`'s inline `border-top` color token swapped from `var(--border)` to
  `var(--g-hairline)` (same visual hairline, now token-sourced) — no change to `sur.enabled` or the
  `fmtUsd(sur.tisBorneUsd || 0)` value it renders.
- `badge()` itself (the function deciding no-badge / INDICATIVE / ⚠ UNVERIFIED / ✓ OK from the raw
  status string) — zero diff. Only its CSS-rendered shape changed (see below).

## What was wired onto tokens/classes

- **`class="data-table"` added to 4 `<table>` tags**: the ex-ship $/MT ladder table, the depot ₦/L
  ladder table, the Cost Build-Up table (`class="cost-table data-table"`, keeping the pre-existing
  `cost-table` class for any other selectors that key off it), and the Tax Block table (same
  dual-class treatment). No other `<table>` in the interactive DOM (e.g. the Sensitivities table)
  carries this class — confirmed by grep, out of scope this stage.
- **New CSS block** (inserted after the Stage 0/1 reduced-motion media query, before the
  `INTERACTIVE: full-viewport sidebar layout` section) layers `.data-table`-scoped overrides on top
  of `reportCss`'s generic unscoped `table`/`thead th`/`tbody tr`/`tbody td` rules (which otherwise
  paint a `var(--bg)` header fill and a `rgba(212,29,29,.025)` row-hover tint) and re-targets the
  **existing** per-cell classes the renderers already emit (`class="r"` for numerics, `class="muted"`
  for secondary text) — no cell class was renamed:
  - `thead th` → no background fill (was a flat `var(--bg)` wash), CAPS eyebrow via the existing
    Stage 0 `.data-table thead th` rule (`--fs-label`, `--g-text-slate`, uppercase).
  - `tbody td.r` → `--f-mono`, `--fs-data`, `tabular-nums lining-nums`, `--g-chrome-ink` (right-aligned
    numerics in mono tabular figures).
  - `tbody td.muted` → `--g-text-slate` (was the report's raw `var(--slate)` alias).
  - `tbody tr` hairline separators via `--g-hairline`; no zebra striping; row hover tint removed
    (`background: none`) so the tables read as calm static figures, not an interactive grid.
- **Entered/highlighted ladder tier** (`.ladder-current`, driven by the untouched `isCur` boolean
  above): removed the report's 6%-opacity red background wash. Kept the existing thin left accent
  border and the existing bold row weight (both are `reportCss`'s own `.ladder-current` /
  `.ladder-current td` rules — untouched, still fire) — net effect: weight + a slim hairline accent,
  not a heavy fill, per the brief's explicit instruction.
- **Status/flag badges** (`.bdg`): tightened corner radius (`border-radius: 3px`, was 4px) inside
  `.data-table` scope only — colors and which class (`bdg-indicative` / `bdg-unverified` /
  `bdg-recoverable`) renders per status string are entirely `badge()`'s decision, untouched.
- **Ladder scale bar** (`ladderScale()`'s returned wrapper div): added `chart-frame` class alongside
  the existing `ladder-scale-wrap` class. New rule `.ladder-scale-wrap.chart-frame { border-top:
  1px solid var(--g-hairline); border-bottom: 1px solid var(--g-hairline); }` adds only top/bottom
  guide hairlines — deliberately does **not** touch the wrapper's existing horizontal/vertical
  padding (both control the pip/tick `left:X%` visual reference box and vertical label headroom),
  so the tier-pip and current-price-marker position math is visually unaffected.
- **Cost/Tax subtotal-style rows** (`vatBase` in Cost Build-Up, `recBox` in Tax Block): removed
  their inline `background:var(--bg)` fills; `vatBase` and `recBox` both gained `class="total"` to
  pick up Stage 0's existing `.data-table tbody tr.total td { font-weight:600; border-top:1px solid
  var(--g-hairline); background:none }` rule — weight + top hairline, never a fill, exactly per the
  brief. `recRows` (indented recoverable-VAT sub-annotation lines) and `surRow` (the surcharge
  divider row) had their inline background fills / border color tokens cleaned up the same way but
  were not given `class="total"` (they are annotations/dividers, not totals).

## Deliberately NOT touched (explicit decision, not an oversight)

- The separate `.cost-totals` div (the "All-in cost" / "Recoverable VAT" / "Landed cost/MT" summary
  block rendered **below**, not inside, the Cost Build-Up `<table>`) still carries its own
  `background: var(--bg)` fill. This is a card-footer-style summary section, not a table row —
  the brief's "totals/subtotal rows... never a background fill" language is about rows *within* the
  data table (addressed above via `vatBase`/`class="total"`); re-styling this separate footer block
  is left for a later pass since it's a different UI primitive, not literally a `<tr>`.
- The ladder scale bar's own `linear-gradient(to right, #fee2e2 ... #bbf7d0)` fill (Floor→Premium
  color scale) was **not** removed under "no gradient/glow on any table surface" — this is a chart
  visualization element (the tier color scale itself is the informational content), not a table row
  background; removing it would delete the ladder's core visual encoding. The "no gradient on table
  surfaces" instruction is read here as applying to the `.data-table` rows, which have none.
- `.ladder-current`'s existing `border-left: 3px solid var(--red) !important` (thin accent border,
  `--red` === `--g-brand-red`) was left exactly as-is — the `!important` guard was not fought;
  only the background fill (no `!important`) was overridden, which was sufficient to satisfy
  "weight + hairline, not a heavy fill."

## Verification

- **Build**: `npm run build:interactive` succeeds cleanly, `out/TIS-interactive.html` regenerates.
- **Comment-truncation regression check** (the Stage 0 pitfall — a `*/`-like substring inside a CSS
  comment silently truncating a following block): the new CSS block was written with plain `--`
  (em-dash-style) separators instead of `*/`-adjacent characters, and every token referenced in it
  (`--g-hairline`, `--g-text-slate`, `--g-chrome-ink`, `--fs-data`, `--f-mono`) was confirmed
  rendering correctly in the live Playwright screenshots below (mono numerics, slate secondary
  text, hairline separators all visibly present) — not just verified in source.
- **Screenshots** (Playwright, local `http.server` instances on ports 8934 (after, this branch) and
  8935 (before, a temporary `git worktree add` at Stage 1 tip `d1d6ea3`, fixture copied in,
  built, and torn down after capture) — committed to
  `reports/assets/stage-2-result-tables/` in the repo:
  - `before/after-desktop-{ladder,cost,tax}.png` and `before/after-narrow-{ladder,cost,tax}.png` —
    1440×1000 and 700×1000 viewport-clipped element screenshots of each section (top portion; the
    Cost Build-Up section is taller than one viewport at normal window height).
  - `before/after-desktop-{ladder-top,cost-full,tax-full}.png` — same three sections captured with
    a taller (2000px) browser window scrolled to each section, so the **entire** table including
    totals/sub-rows/status-legend is visible in one shot (used for the visual QA below).
  - The bundled `SAMPLE-EQUITY-PARTNER-001` fixture trade renders by default and exercises every
    Flag/badge state present in this trade: `INDICATIVE` (amber, e.g. ICE, TC hire, marine
    insurance), `⚠ UNVERIFIED` (deeper amber, e.g. NIMASA cabotage/freight levy, SPOMO/CVFF, WHT on
    freight), `✓ OK` (green, recoverable VAT on freight/services), no-badge (verified lines like FOB
    premium, NPA cargo dues), and the Tax Block's surcharge-OFF `INDICATIVE` state — all confirmed
    rendering with the correct color/text after the restyle.
  - **SHA-256 hashes, before vs after, all 9 pairs confirmed different** (i.e. a real visual change
    was captured, not an accidental duplicate):

    | Pair | before (sha256) | after (sha256) |
    |---|---|---|
    | desktop-ladder | `7b2f77406467c4e423d1517dcb6cd508510f82bfe01da59830a7608822264aba` | `829ec4e49349ed7918160aab5d3d3ae71f6b750dd2cf4d9a3c01e2513318d42f` |
    | narrow-ladder | `28f5a9fa28e7b54d7737664dcd4f5d608914216dc4e8e6e3fcc48ee61c5238d4` | `834741ace3e1068b96aa5c59dd904d55c4abab586b3c3f83ef57a3eaebf2dbbe` |
    | desktop-cost | `21d5a000569e20eb57eb30c7064335d0d2143bc0d73b7f3bbe39eee873c64144` | `d6b9b9ee01f5594cd0a232fce5f6a0e92701199b5a08d553865eec6ddbcb33b2` |
    | narrow-cost | `9301a48ff4ddcb518f0bff8efd322622bfd2ea62f0d7437260f0533c41a98c8a` | `48f79c163ee9dd6cb8a08c0b59cfa3d7c843ddbf9ce44f79b67a458c6a92d85c` |
    | desktop-tax | `2278a1616a21da55b292b5e96aa913195467db8b104cd42c85ebab4848c688a7` | `0fe93907e69d429fa8b1db4dfd32dfcf5462333978242f404808693163f30b5b` |
    | narrow-tax | `79e884bed342ba04e6d073f58bb6f2f3172324238a93e064695bddb9824dc5a9` | `6a46294326ea62df6bf8fee997236205fae01c932a94426cfd87705cb0bb5f02` |
    | ladder-top (full) | `a56b109699c6c6ce54926754a97c76323110b66d36fbe9108a49cb3c34697afd` | `de4124e3ddf34acc9cedf773b1ffbbb1c606401e1d2dff754506f4b1a9a422fc` |
    | cost-full (full) | `4f126ccdee3b7e5c18c638f7465f24a8f5353f6768546b6b15394c4fe34db8f4` | `6c10a19011f4917436496bde5a2b499dc5fc186e749e9382630405389778cf7a` |
    | tax-full (full) | `ef09e626cc4b70b793f43e134d1cb11a0ba2b5d827f5d85dca149fd92b5db721` | `fc2852e983158db19e603768ddb4467efe3df0539b97aa23a4417b05f749200b` |

    (Full 64-char hashes computed via `shasum -a 256` on the actual committed files — every pair
    verified different, none reused.)

## Accessibility + motion audit

No `fixing-accessibility` / `fixing-motion-performance` skill was invoked (not a fresh check this
session, but no skill by those names surfaced in the available list either) — manual check, WCAG
formula computed via a small Node script (relative-luminance + contrast-ratio formula per WCAG 2.x),
not eyeballed:

| Pairing | Contrast |
|---|---|
| `--g-text-slate` `#64707c` (header eyebrow row + secondary/sub table cells) on `#ffffff` | **5.06 : 1** |
| `--g-chrome-ink` `#242331` (numeric table cells) on `#ffffff` | **15.44 : 1** |
| `.bdg-indicative` text `#92400e` on bg `#fef3c7` | **6.37 : 1** |
| `.bdg-unverified` text `#7c2d12` on bg `#fed7aa` | **6.92 : 1** |
| `.bdg-recoverable` text `#065f46` on bg `#d1fae5` | **6.78 : 1** |

All comfortably clear the 4.5:1 AA-normal floor (the smallest text in these tables, `--fs-label`
10px header eyebrows and `--fs-data`/`--fs-body` 13px numeric/secondary cells, is well above the
"large text" 3:1 threshold that would even apply a looser bar). `--g-text-slate`'s value is
unchanged from Stage 1's fix (`#64707c`, not re-touched this stage).

**Motion**: this stage added zero new transitions/animations. The one motion-adjacent change
(`.data-table tbody tr:hover { background: none; }`) *removes* an existing instant background-color
hover response (report's `rgba(212,29,29,.025)` tint) rather than adding one — there was no
transition duration on that hover rule to begin with (instant color swap on `:hover`), so there is
nothing new to gate behind `prefers-reduced-motion`. No `transform`/`opacity` animation was touched
or added in this stage's scope.

## Open items / deferred

1. `.cost-totals` summary block (Cost Build-Up footer, outside the `<table>`) still carries its own
   `background: var(--bg)` fill — left alone as a distinct card-footer UI primitive, not a table
   row; a future pass could re-skin it onto `--g-canvas`/hairline-only chrome for full consistency
   with the rest of Stage 2.
2. `.bdg` colors themselves (amber/orange/green hexes) remain raw, not yet mapped onto dedicated
   `--g-caution`/`--g-unverified`/`--g-positive` role tokens at the badge level — same reasoning as
   Stage 1's open item 2/3: retinting is a taxonomy-adjacent decision outside this stage's literal
   "shape only" scope, deferred to avoid any risk of shifting which shade communicates which status.
3. Partner/Equity, Hedge Analysis, and Sensitivities tables remain on the pre-Stage-0 look —
   unchanged, as scoped by the brief (later stages).

## Commit

Branch `redesign/stage-2-result-tables`, branched from `redesign/stage-1-input-rail` tip
(`d1d6ea3`). Not merged to `redesign/stage-1-input-rail`, `redesign/stage-0-foundation`, or `main`;
not pushed, per instructions.
