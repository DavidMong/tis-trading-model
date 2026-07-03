# Redesign Stage 5 — Finalize the Plex Superfamily

Branch: `redesign/stage-5-font-finalize`, branched from `redesign/stage-4-sensitivities-states`
tip (`5c1a752`) — a stacked chain; Stage 0 through Stage 4 all remain unmerged to `main`.

Scope: repoint `--f-display` from Space Grotesk to IBM Plex Sans in the shared `reportCss` token
(used by both the interactive view and the HTML report), and remove Space Grotesk from both CDN
font `<link>` tags. This finalizes the type system to the single approved Plex superfamily (Plex
Sans for display/UI/body, Plex Mono for data) across every surface that reads `--f-display`. No
layout, component, or token-scale migration — that is Stage 6 (the HTML report's own layout
rebuild).

## Engine safety — baseline vs after

Fixture (`trades/reference-trade-001.json`) confirmed present before starting — no copy needed
(stated explicitly, per the worktree-setup checklist in root `CLAUDE.md`).

| | Suite (`node test/invariants.js`) | All-USD guard (`node scripts/fingerprint.js`) |
|---|---|---|
| **Baseline** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |
| **After** | `249 passed, 0 failed` | `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` |

Byte-identical, full hash compared both times (not the truncated shorthand). `npm run
build:interactive` and `node scripts/build-report.js` both succeed cleanly before and after.

## Files touched

`git diff --stat`: **2 files changed, 11 insertions(+), 6 deletions(-)** —
`scripts/report-renderer.js` and `scripts/build-interactive.js` only (one CSS token + one CDN
`<link>` in each, plus one stale comment corrected). No other file in the working tree changed
except the new `reports/` additions (this report + screenshots).

**Confirmed untouched**: `engine/core/*`, `engine/flows/*`, `trades/*.json`, `run.js`,
`scripts/report-pdf-renderer.js` — zero diff (confirmed via `git diff --stat`, empty output).

## Diff

```diff
--- a/scripts/report-renderer.js
+++ b/scripts/report-renderer.js
@@ -155,8 +155,10 @@ body {
   --heat-pos: #dcfce7; --heat-pos-strong: #bbf7d0;
   --heat-neg: #fee2e2; --heat-neg-strong: #fecaca;

-  /* Font stacks */
-  --f-display: 'Space Grotesk', 'Helvetica Neue', sans-serif;
+  /* Font stacks — Stage 5: single Plex superfamily (Plex Sans for
+     display+UI+body by weight/size, Plex Mono for data); Space Grotesk
+     dropped, per-heading weight 600 at call sites left as-is. */
+  --f-display: 'IBM Plex Sans', 'Helvetica Neue', sans-serif;
   --f-body:    'IBM Plex Sans', 'Helvetica Neue', sans-serif;
 }

@@ -1493,7 +1495,7 @@ function generateHtml(logo, trade, res, ladder, generatedAt) {
   <title>${esc(res.meta.tradeId)} — TIS Global Trading</title>
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
-  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
+  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
   <style>${CSS}</style>
 </head>
```

```diff
--- a/scripts/build-interactive.js
+++ b/scripts/build-interactive.js
@@ -90,8 +90,11 @@ function css() {
   /* Font stacks — --f-mono is new (Plex Mono, CDN-loaded + self-hosted via
      report-fonts.js's 'TIS Mono' face for the PDF pipeline, not yet wired
      into report-pdf-renderer.js this stage). --f-display/--f-body are NOT
-     repointed here — reportCss's existing Space Grotesk/IBM Plex Sans values
-     stay exactly as they are; only the report-stage diff moves those. */
+     repointed here — this Stage 0 diff left reportCss's Space Grotesk/IBM
+     Plex Sans values as they were; Stage 5 later repointed --f-display to
+     IBM Plex Sans and dropped Space Grotesk entirely (see reportCss's own
+     :root, scripts/report-renderer.js). Comment kept as historical record
+     of the original Stage 0 scope decision, not current state. */
   --f-mono: 'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace;

@@ -2051,7 +2054,7 @@ const html = `<!DOCTYPE html>
 <link rel="icon" type="image/svg+xml" href="${faviconDataUri}">
 <link rel="preconnect" href="https://fonts.googleapis.com">
 <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
-<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
+<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
 <style>
 ${sharedCss}
 </style>
```

`--f-body` was already `'IBM Plex Sans', ...` before this stage — unchanged, confirming Plex Sans
now serves both roles from one `<link>` weight set, no duplicate/competing font family.
Every call site of `font-family: var(--f-display)` (30 occurrences across both files, checked by
grep) is untouched — none needed editing since they all read the token, not a literal family name.
Per-heading `font-weight` values (e.g. 600 at most `.section-heading`/`.h-card-title`/`.kpi-label`
call sites) were left exactly as-is, per the brief.

## Step 3 — grep confirmation

```
$ grep -rn "Space Grotesk\|Space+Grotesk" scripts/
scripts/report-renderer.js:159:     display+UI+body by weight/size, Plex Mono for data); Space Grotesk
scripts/build-interactive.js:93:     repointed here — this Stage 0 diff left reportCss's Space Grotesk/IBM
scripts/build-interactive.js:95:     IBM Plex Sans and dropped Space Grotesk entirely (see reportCss's own
```

All three remaining hits are inside comments explaining the removal (one new comment documenting
the Stage 5 change itself, two words inside the corrected Stage 0 historical-record comment) — zero
live CSS declarations, zero CDN `<link>` references. Also grepped `scripts/report-pdf-renderer.js`
and `scripts/report-fonts.js` (the PDF font-embedding module) — no `Grotesk` hits in either, so the
PDF pipeline never referenced Space Grotesk to begin with and needed no change.

## Verification — THE KEY CHECK: full interactive app, no layout break

Confirmed live via `getComputedStyle()` on the built pages before any screenshot:

| Surface | `.section-heading` computed `font-family` |
|---|---|
| Interactive app (`out/TIS-interactive.html`) | `"IBM Plex Sans", "Helvetica Neue", sans-serif` |
| HTML report (`out/TIS-SAMPLE-EQUITY-PARTNER-001.html`) | `"IBM Plex Sans", "Helvetica Neue", sans-serif` |
| HTML report, Stage 4 tip (`before`, for comparison) | `"Space Grotesk", "Helvetica Neue", sans-serif` |

**Layout comparison** (before = Stage 4 tip `5c1a752`, after = this branch, same fixture, same
viewport sizes): the full-page desktop screenshots (1440×5000, `.results` panel's natural
`scrollHeight` confirmed to fit inside 5000px with no internal scroll clipping, both before —
4757px — and after) are structurally pixel-identical in section positions and heights — same KPI
strip, same waterfall box widths, same Cost Build-Up 23-row table (no row count change, no column
truncation), same Sensitivities table and legend. The only visible difference on close inspection
is the heading typeface (Plex Sans replacing Space Grotesk); no heading wraps to an extra line, no
text clips, no section grows or shrinks in a way that shifts the sections below it. Same result at
narrow width (700×6500) and for the two sidebar tabs not visible in the Deal-tab default (Costs,
Hedge) — both render full-height with no clipped labels or overflowing inputs.

No heading shifted line count or clipped in either app or report, at either width.

## Screenshots

Playwright, local `http.server` instances on ports 8940 (after, this branch) and 8941 (before, a
temporary `git worktree add` at Stage 4 tip `5c1a752`, fixture copied in, both `npm run
build:interactive` and `node scripts/build-report.js` re-run, torn down after capture) — committed
to `reports/assets/stage-5-font-finalize/`:

- `desktop-full-app.png` / `narrow-full-app.png` — the full interactive app (shell, KPI strip,
  Deal tab, Waterfall, Pricing Ladder, Cost Build-Up, Partner Deliverables, Hedge Analysis, Tax
  Block, Sensitivities, status legend), 1440×5000 and 700×6500 viewports sized to fit the entire
  `.results` panel with zero internal scroll clipping (verified via `scrollHeight` vs viewport
  height before capture, both before and after).
- `desktop-costs-tab.png` / `desktop-hedge-tab.png` — the sidebar with the Costs and Hedge tabs
  active respectively (not visible in the Deal-tab default full-app shot).
- `desktop-empty.png` / `narrow-empty.png` — the empty state, triggered via `newTrade()` (no
  `confirm()` dialog fired — the page had no unsaved changes yet, so `_modified` was `false`).
- `desktop-pending.png` / `narrow-pending.png` — the price-pending card, triggered by clearing the
  single revenue leg's price field and dispatching `input`/`change` events.
- `html-report-full.png` — the static HTML report (`node scripts/build-report.js` output),
  1200×5330 full page. Confirms headings now render in Plex Sans; the layout itself is
  unchanged (still the pre-Stage-6 report layout), exactly as scoped.

**SHA-256 hashes, before vs after, all 9 pairs confirmed different:**

| Pair | before (sha256) | after (sha256) |
|---|---|---|
| desktop-full-app | `0854337c2da50e884b2fda73fca069ac856f0ae19daab80588295622b17b3e58` | `7913bb07d6a7aefe9cc6d9b028ca33c7a377a087cf2b5ee169a30245f7cabe86` |
| narrow-full-app | `c4d7976100ec2d074e2612b7a03dfe46aabcc05e73e5680cbbec2d69394a91b9` | `c3e12abc4740346b80186f9a3b17a7dc11b0504259be6954b2f25d089532af1d` |
| desktop-costs-tab | `d758cc7a2de74673246e2d78c6e567a56193ad2671249c936c29d084d943a6c2` | `3cff0f563e20326a572cbaad055e217a86b65dc43554dd267330387fcb93c460` |
| desktop-hedge-tab | `51fe58870ac7c0ca18ff150191a525f950d1f7bb7ef3ff0763658656eb83bc8b` | `c36f845ff7d42ac13426ffb7158b2450a92b497d0508f5cb14d1538bd94efef3` |
| desktop-empty | `37da2fe260f134249ea5ecbb73b77f14123cabbb659580f7ef9e38dd04d38cf8` | `2c8ec850a43818dfc1d921a4fd7a56a6978320fba3b5a7b6c11b94cf4ae853e3` |
| desktop-pending | `b230eeeacc704c0686a2a1a3fd5424e425c341e0ae1cd37575f92fedc9c072db` | `ff8c9178fb33b11402b3fed654edcbd2e583bc7fbf86a00371d8cba7d08b1317` |
| narrow-empty | `9158b89ea060dd8a79e43fff23a2dc10e719fd601cfd6660dbbb2b45fbccd5ed` | `464d83be0d3fe4004a1aeaadd4eded0b681efe00c591a906b884be4c73012438` |
| narrow-pending | `ef671916b626ae2803cea34808745d38148f2f97c628d0c54d1a968343d08912` | `7caaeb683f5a11b57a4693f374be2e05cd6b6292c6b1887a07cd0b15527112a1` |
| html-report-full | `da4bc2404a6e4cea2c7cfbb3d9abc6e9ad0f8f137e6126b5f69b225277ad30b2` | `f35ca2e5fac4c5ee7f9c50833e27556652017bc63c8de07621ef5fd5480588db` |

(`desktop-empty`/`desktop-pending` hashes differ from the Stage 4 report's own before/after pair
since those were re-captured fresh against Stage 4's tip for this stage's comparison, not reused —
the underlying Stage 4 state is identical, only this stage's font change differs.)

(Full 64-char hashes via `shasum -a 256` on the actual committed files.)

## Accessibility + motion audit

No `fixing-accessibility` / `fixing-motion-performance` skill surfaced in the available list this
session either — manual audit.

**Colors**: zero color values were touched this stage (confirmed by the diff above — only
`font-family` values and two CDN URLs changed). Every contrast pairing reported in Stages 1–4
(`--g-text-slate` 5.06:1, `--g-chrome-ink` 15.44:1, the four heat tints 4.57–7.52:1, the badge
taxonomy colors) is unaffected — a font-family swap does not change color, so there is no new
contrast computation needed this stage. No regression possible on this axis.

**Motion**: zero transitions/animations touched — confirmed by grepping the diff for
`transition`/`animation`/`@keyframes` (no matches; the diff is two `font-family` tokens, two CDN
URLs, and one comment). Nothing new to gate behind `prefers-reduced-motion`.

## Open items / deferred

1. Stage 6 (the HTML report's own layout/token/component migration onto the redesign system) is
   the next stage — this stage deliberately left the report's *layout* untouched, only its heading
   *font*, per the brief's explicit scope line ("Do NOT migrate the report's layout, tokens, or
   components this stage").
2. `report-fonts.js` (the PDF pipeline's self-hosted 'TIS Mono' face embedding, referenced in the
   Stage 0 report as "not yet wired into report-pdf-renderer.js") was read but not touched — it has
   no Space Grotesk reference and is out of scope for a font-token-only stage; the PDF renderer's
   own font embedding remains a separate, later concern.

## Commit

Branch `redesign/stage-5-font-finalize`, branched from `redesign/stage-4-sensitivities-states` tip
(`5c1a752`). Not merged to any earlier stage branch or `main`; not pushed, per instructions.
