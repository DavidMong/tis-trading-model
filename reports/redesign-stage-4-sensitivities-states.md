# Redesign Stage 4 — Sensitivities Heat Table, Status Legend, Empty/Pending States

Branch: `redesign/stage-4-sensitivities-states`, branched from `redesign/stage-3-partner-hedge`
tip (`093b683`) — a stacked chain; Stage 0 through Stage 3 all remain unmerged to `main`. This is
the last interactive-app stage; the HTML report and PDF renderer are untouched (later stages).

Scope: the Sensitivities section (heat table + base-case row), the status-flag legend, the empty
state (blank/new trade), and the price-pending card (unpriced revenue legs). No other section
touched.

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

`git diff --stat`: **1 file changed, 47 insertions(+), 23 deletions(-)** —
`scripts/build-interactive.js` only. No other file in the working tree changed except the new
`reports/` additions (this report + screenshots).

**Confirmed untouched**: `engine/core/*`, `engine/flows/*`, `trades/*.json`, `run.js`,
`scripts/report-renderer.js`, `scripts/report-pdf-renderer.js` — zero diff.

**FIGURE/PERTURBATION logic left untouched** (quoted from the diff, confirming what was and
wasn't edited):
- `renderSens()`'s data path — `sens.scenarios`, `sens.baseNet`, `s.deltaVsBase`, `s.tisNet`,
  `maxAbs` (computed as `Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1)`), the sort
  (`Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase)`), and `pairLeverScenarios()` (the +10%/-10%
  grouping shared with the tornado chart) — all read verbatim from `res.sensitivities`, computed
  entirely upstream in `engine/core`, and not touched by this diff. The only function rewritten,
  `heatStyle(delta)` → `heatCls(delta)`, is a pure presentation-layer lookup: same inputs
  (`s.deltaVsBase`, `maxAbs`), same `pct = |delta| / maxAbs` ratio — only the *output* changes,
  from a computed inline-`style` string to a CSS class name. No sensitivity value, lever pairing,
  sort order, or threshold that feeds the engine changed.
- `renderTornado()`, `renderTornadoRow()`, `pairLeverScenarios()` — zero diff; the tornado chart
  above the table is unchanged.
- `badge()`, `esc()`, `fmtUsd()` — zero diff.
- `legPricingStatus()` (the price-pending card's per-leg unpriced-count logic) and
  `showEmptyState()`'s gating condition (`recompute()`'s check on `inp-delivered`) — zero diff;
  only the CSS these two render targets read was touched.

## What was wired onto tokens/classes

- **Sensitivities table chrome** (Step 2): `<table class="cost-table">` → `<table class="cost-table
  data-table">` (the same dual-class pattern Stage 2 used for Cost Build-Up / Tax Block) — the
  table now picks up Stage 2's eyebrow header (`.data-table thead th`: caps, `--fs-label`,
  `--g-text-slate`), hairline rows, and mono tabular numerics (`.data-table tbody td.r`)
  automatically. The `.tbl-wrap`'s inline separator between the tornado and the table
  (`border-top:1.5px solid ...`) was re-sourced from `var(--border)` to `var(--g-hairline)` (same
  underlying value, now token-sourced, matching the rest of the section).
- **Base-case row**: `class="sens-base"` → `class="sens-base total"`, reusing Stage 2's established
  `.data-table tbody tr.total td { font-weight:600; border-top:1px solid var(--g-hairline);
  background:none }` convention — weight + top hairline, never a fill. The third cell's inline
  `style="background:var(--bg);color:var(--slate);font-style:italic;font-size:11px"` was replaced
  with `class="r muted"` (Stage 2's existing muted-cell convention, `--g-text-slate`) plus a single
  remaining inline `style="font-style:italic"` (no dedicated italic class exists elsewhere in the
  stylesheet, and adding a one-property `.italic` utility class for a single call site felt like
  more indirection than the inline style it would replace).
- **Heat map — discrete tiers** (Step 3): replaced the old continuous-alpha inline-`style`
  computation (`rgba(16,185,129,alpha)` / `rgba(239,68,68,alpha)`, alpha scaling linearly
  0.08–0.50 with magnitude) with a discrete two-tier class lookup (`heatCls()`) that mirrors the
  **existing reference implementation** already in the static HTML report
  (`scripts/report-renderer.js`'s `sensitivitiesSection()`, lines 1424–1440): same `pct =
  |delta|/maxAbs` ratio, same `pct > 0.6` "strong" threshold, resolving to
  `sens-pos`/`sens-pos-strong`/`sens-neg`/`sens-neg-strong` — all four already backed by the fixed
  `--heat-pos`/`--heat-pos-strong`/`--heat-neg`/`--heat-neg-strong` tokens (`report-renderer.js`
  `:root`, `#dcfce7`/`#bbf7d0`/`#fee2e2`/`#fecaca`). This satisfies the brief's "drive them from the
  existing `--heat-*` tokens ... discrete cell fills only" directly by porting the report's own
  proven tiering instead of inventing a new one. Direction is still reinforced by the `+`/`−` sign
  on every Δ value (unchanged), so the tint remains a redundant, not sole, channel.
- **Status legend** (Step 4): `.status-legend`'s own text → `var(--fs-label)`/`var(--g-text-slate)`
  (was raw `10px`/`#717c89`); `.sl-key` → `var(--g-chrome-ink)` (was `#4b5563`); border-top →
  `var(--g-hairline)`. The two inline `style="font-size:9px;padding:1px 5px"` overrides on the
  `INDICATIVE`/`⚠ UNVERIFIED` legend chips were replaced with a new scoped rule
  `.status-legend .bdg { font-size: var(--fs-label); padding: 1px 5px; border-radius: 3px; }` —
  same 3px radius Stage 2 applied to in-table badges (`.data-table .bdg`), now matched here too, so
  the legend chips read as the same shape as the badges they key. `.sl-check`'s green (`#10b981`)
  was deliberately **not** retinted (see "Deliberately NOT touched" below).
- **Empty state / price-pending card** (Step 5): `.empty-state-title` → `var(--fs-value)` /
  `var(--g-chrome-ink)` (was raw `14px`/`#4b5563`); `.empty-state-sub` → `var(--fs-caption)` /
  `var(--g-text-slate)` (was raw `11px`/`#94a3b8`, a low-contrast grey — now the AA-fixed slate
  token). Both `showEmptyState()`'s markup and `renderPricePending()`'s markup share these two
  classes, so both states pick up the fix from one CSS edit; neither function's own markup/logic
  needed changing.

## Bug caught and fixed during verification (not just asserted from source)

Adding `class="data-table"` to the Sensitivities table (Step 2) pulled in Stage 2's
`.data-table tbody td.r { color: var(--g-chrome-ink) }` rule — at specificity (0,2,2), it beat the
bare `.sens-pos`/`.sens-neg`/`-strong` classes (0,1,0), silently overriding every heat cell's text
color to flat ink regardless of direction or magnitude. This was **not** visible from reading the
CSS source in isolation (both rules look independently correct); it was caught by checking
`getComputedStyle()` on a live Playwright page — all four heat classes reported `rgb(36, 35, 49)`
(ink) instead of their expected colors. Fixed with compound selectors at specificity (0,3,2) —
`.data-table tbody td.r.sens-pos` etc. — that beat the data-table rule while reproducing the exact
pre-existing color values (no color invented; `#15803d`/`#14532d` from `reportCss`, `#4b5563`/
`#374151` from the existing Batch C desaturation override). Re-checked via `getComputedStyle()`
after the fix: all four now report their correct RGB values (confirmed in the Verification section
below). Suite + fingerprint re-run clean after the fix, before any screenshot was taken.

## Deliberately NOT touched (explicit decision, not an oversight)

- `.sl-check`'s green (`#10b981`, the "No badge = Verified" checkmark) was left raw, not aliased to
  any `--g-positive`/`--role-positive` token — those tokens resolve to `#15803d` (Tailwind
  green-700), a visibly different shade from `#10b981` (emerald-500). Aliasing would silently shift
  a genuine displayed color, which Stage 1/2's own precedent explicitly avoids (Stage 2's report,
  open item #2: "`.bdg` colors themselves remain raw ... deferred to avoid any risk of shifting
  which shade communicates which status"). Same reasoning applied here.
  `.status-legend .sl-check` is the sole reference to `#10b981` in the file — confirmed by grep.
- `bdg-indicative`/`bdg-unverified` background/text hex values (`#fef3c7`/`#92400e`,
  `#fed7aa`/`#7c2d12`) — untouched, exact taxonomy colors preserved; only the chip *shape*
  (font-size/padding/radius) was restyled, per the brief's explicit "restyle chips ... keep wording
  and taxonomy exactly."
- `--heat-pos`/`--heat-neg`/`-strong` token *values* themselves (`#dcfce7`/`#bbf7d0`/`#fee2e2`/
  `#fecaca`, defined in `report-renderer.js`, shared with the static report) — not touched; this
  stage only changed *how* the interactive table selects between them (discrete class vs continuous
  alpha), never the tokens' own definitions, and `report-renderer.js` itself was not opened for
  editing (read-only, to confirm the reference pattern to port).
- The `pos-light` heat tint (`#15803d` on `#dcfce7`, 4.57:1) clears the 4.5:1 AA floor but by a
  thin margin (0.07). Per the brief, a fix is only mandated "if any **strong** tint fails" — none
  of the four tints fail, so no color was darkened/lightened. Flagged here for visibility since the
  margin is thin, not because it's out of compliance.

## Verification

- **Build**: `npm run build:interactive` succeeds cleanly, `out/TIS-interactive.html` regenerates,
  both before and after every edit in this stage (including the mid-stage cascade-bug fix above).
- **Heat-cell color fix confirmed live** (`getComputedStyle()` on the built page,
  `SAMPLE-EQUITY-PARTNER-001` fixture):

  | Class | Text color (after fix) | Expected |
  |---|---|---|
  | `sens-neg-strong` | `rgb(55, 65, 81)` | `#374151` ✓ |
  | `sens-pos-strong` | `rgb(20, 83, 45)` | `#14532d` ✓ |
  | `sens-neg` | `rgb(75, 85, 99)` | `#4b5563` ✓ |
  | `sens-pos` | `rgb(21, 128, 61)` | `#15803d` ✓ |

- **States exercised**: the empty state was triggered via `newTrade()` (clears the form,
  `inp-delivered` goes blank, `recompute()`'s gate calls `showEmptyState()` — no confirm() dialog
  fired since the page had no unsaved changes yet). The price-pending card was triggered by
  clearing the single revenue leg's price field and dispatching `input`/`change` events (the
  fixture's `1230`-priced ex-ship leg → blank), which flips `hasSellPrice` to `false` in
  `recompute()` and renders `renderPricePending()` in the waterfall slot per the documented
  price-independent/price-dependent split in
  `.claude/rules/build-interactive-results-flow.md`.
- **Screenshots** (Playwright, local `http.server` instances on ports 8940 (after, this branch) and
  8941 (before, a temporary `git worktree add` at Stage 3 tip `093b683`, fixture copied in, built,
  and torn down after capture) — committed to
  `reports/assets/stage-4-sensitivities-states/`:
  - `before/after-desktop-{sens,legend,empty,pending}.png` (1440×2200 viewport, element-clipped via
    `section[aria-labelledby="sens-h"]` / `.status-legend` / `#sec-waterfall`) and the matching
    `narrow-*` set (700×1200 viewport) — 8 pairs total.
  - The Sensitivities table exercises both heat tiers in both directions (Surcharge ON / ICE ±10%
    are the two "strong" cells at `pct > 0.6`; TC rate / FOB premium ±10% are "light"; FX NAFEM
    ±10% shows `+$0.00` with no tint, confirming the zero-delta guard still short-circuits). The
    status legend exercises all 3 non-"no-badge" states shown together. Empty state and
    price-pending are each genuinely distinct DOM (not just a CSS toggle) confirmed via the actual
    `innerHTML` swap in `recompute()`.
  - **SHA-256 hashes, before vs after, all 8 pairs confirmed different**:

    | Pair | before (sha256) | after (sha256) |
    |---|---|---|
    | desktop-sens | `b9f2bc5b97e3907ef751ab32f657b821a653446594ba3495e644872e47fc35cb` | `b6a25a7b81d1ad0b39d79edee472d7e5cd6f1ae951ff0d7a9c30dfa959249713` |
    | desktop-legend | `c85ea686bb808477c86758057ab1fbaf22ac3b1b03c44f92944166f3dbf646b7` | `a7c1cb33fa2802a18f97e24f0394d4b71264da18ba0541ce194a5b856edb0afc` |
    | desktop-empty | `c4fc78dddb92c5557bb188dff09a22d1bd783f8fbeb0aeb56fd34a15aed0de4f` | `37da2fe260f134249ea5ecbb73b77f14123cabbb659580f7ef9e38dd04d38cf8` |
    | desktop-pending | `42d252c6879e68725ebbffa3724f6a5254e8aed456319a5b02474392e7beadf3` | `2b9a540647ec2873282c3ada873ddd1b05b30121ba2790d9a578554b235ffc06` |
    | narrow-sens | `065638f370e8089d31c45e1763c6d6927510767b1275271b8bfa62649ace1f9c` | `ff2de039c15f78b32e565717d669722e96377914510c46cca7ca62ac5a13bad6` |
    | narrow-legend | `28f267baa7aa94d3386ec8516fbab5afdc22b6f676fbc01482e629844d1deebc` | `b97fe6e0a7c85da616803f6125c365268a3684d801a2c98067f88a27858289b7` |
    | narrow-empty | `ef32e82250bcac56aa43770db7d29f880d62360fcbdb12fda843abe0aaeb30d6` | `9158b89ea060dd8a79e43fff23a2dc10e719fd601cfd6660dbbb2b45fbccd5ed` |
    | narrow-pending | `7e89578cbbae25d3ba3c1d9d6cab0bab6064376804c467e3605cb37907f8e491` | `ef671916b626ae2803cea34808745d38148f2f97c628d0c54d1a968343d08912` |

    (Full 64-char hashes via `shasum -a 256` on the actual committed files.)

## Accessibility + motion audit

No `fixing-accessibility` / `fixing-motion-performance` skill surfaced in the available list this
session either — manual check, WCAG relative-luminance/contrast-ratio formula computed via a small
Node script (sanity-checked against black-on-white = 21.00, the WCAG-spec exact value):

| Pairing | Contrast |
|---|---|
| **Heat tints (ink text on tint background):** | |
| `sens-pos` `#15803d` on `--heat-pos` `#dcfce7` | **4.57 : 1** (clears AA floor; thinnest margin, see note above) |
| `sens-pos-strong` `#14532d` on `--heat-pos-strong` `#bbf7d0` | **7.52 : 1** |
| `sens-neg` `#4b5563` on `--heat-neg` `#fee2e2` | **6.19 : 1** |
| `sens-neg-strong` `#374151` on `--heat-neg-strong` `#fecaca` | **7.12 : 1** |
| **Info-row / label text:** | |
| `--g-text-slate` `#64707c` (status legend, empty-state-sub) on `#ffffff` | **5.06 : 1** |
| `--g-text-slate` `#64707c` on `#f6f7f8` (canvas, where the empty-state card sits) | **4.72 : 1** |
| `--g-chrome-ink` `#242331` (empty-state-title, sl-key) on `#ffffff`/`#f6f7f8` | **15.44 : 1** / **14.40 : 1** |

All four heat tints and both text tokens comfortably clear the 4.5:1 AA-normal floor (this
section's text — legend labels, empty-state copy, sensitivity Δ figures — is all well above the
"large text" 3:1 threshold anyway, so the stricter normal-text bar is the one that applies and the
one reported). `--g-text-slate`/`--g-chrome-ink` values are unchanged from Stage 1–3 (reused, not
re-derived).

**Motion**: this stage added zero new transitions/animations and modified zero existing ones —
confirmed by grepping the diff for `transition`/`animation`/`@keyframes` (no matches). Every change
in this diff is a static color/font-size/border/class value or a markup class swap — no element in
the Sensitivities table, status legend, empty state, or price-pending card animates, so there is
nothing new to gate behind `prefers-reduced-motion`.

## Open items / deferred

1. `.sl-check`'s green (`#10b981`) and the `.bdg-indicative`/`.bdg-unverified` taxonomy hexes remain
   un-tokenized raw values — same deferred item carried forward from Stage 1/2/3, still out of this
   stage's literal "shape only" scope.
2. The `pos-light` heat tint's AA margin (4.57:1) is thin. It passes the stated bar (≥4.5:1) so no
   change was made this stage, but a future pass could lighten `--heat-pos` or darken `#15803d`
   slightly for more headroom if this ever becomes a concern (e.g. under different font rendering).
3. This closes the interactive-app redesign (Stages 0–4). The HTML report (`report-renderer.js`)
   and PDF renderer (`report-pdf-renderer.js`) remain entirely on their pre-redesign look, as scoped
   — later stages.

## Commit

Branch `redesign/stage-4-sensitivities-states`, branched from `redesign/stage-3-partner-hedge` tip
(`093b683`). Not merged to any earlier stage branch or `main`; not pushed, per instructions.
