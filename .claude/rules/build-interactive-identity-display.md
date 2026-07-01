---
paths:
  - "scripts/build-interactive.js"
---

# Identity, branding & display

## Browser tab title

`updateHeader()` (called on load, New Trade, rename, identity edits, and load-snapshot) sets
`document.title`:
- Sample fixture (`_isSample === true`) → `${INIT.meta.tradeId} — TIS Global Trading (Interactive)`
- Unnamed / New Trade → `New Trade — TIS Global Trading`
- Named real trade → `${name} — TIS Global Trading`

## Identity fields + Fixture badge

Trade name, Partner, Supplier, Inspector are editable text fields in the **Trade Identity** section
of the Deal tab. They update the header live (`updateHeader()`).

**`_isSample` flag:** `true` at boot when `INIT_IS_SAMPLE` detects the bundled sample fixture name
(REGRESSION/FIXTURE/dummy/test/sample keywords). Cleared to `false` on: any `onInputChange()` call
(any text/number input change), any toggle click (`.tgl-wrap` listener), `newTrade()`, or loading a
real saved trade via `loadSelectedTrade()`. When `_isSample` is `false`, `updateHeader()` hides the
`#hdr-fixture-badge` span and sets `#hdr-trade-id` to `display:none`. The badge only reappears if the
page is reloaded with the original sample fixture.

**Header identity segments:** each of Partner / Supplier / Inspector is wrapped in a `<span id="hdr-X-seg">`.
`updateHeader()` sets `display:none` on any segment whose value is empty — so blank fields are omitted
entirely from the header strip rather than showing a stale or placeholder value. When a value is filled
in, the segment reverts to the default display (empty string).

**Logo SVG:** the raw SVG (`assets/tis-logo-2.svg`) has an `<?xml...?>` declaration and `<!DOCTYPE>` stripped
before inlining; no `<title>` is injected into the inline SVG (accessibility is handled by `role="img"` +
`aria-label="TIS Global Trading"` on the container div). This prevents doubled text from SVG-title + aria-label
rendering in certain environments.

## Favicon

Embedded as a data URI in `<head>` — the TIS mark (`tis-logo-4.svg` viewBox, red #d41d1d) rendered
as a minimal inline SVG. No external request; works from `file://` and `localhost` equally.

## Color-semantics palette (Batch C — final)

`#d41d1d` red = **BRAND ACCENT ONLY** — never danger/loss/error in financials.
`#15803d` green = positive / active.  `#f59e0b`/`#92400e` amber = caution / unverified.
`#242331` ink.  `#717c89` slate.  `#991b1b` deep-red = genuine error or real P&L loss.

**Red KEEP list** (all justified as brand accent or genuine error):
- `--red` tab active underline (brand)
- `@keyframes val-flash` subtle amber-red wash (brand, opacity .07)
- `.err-banner` / `.tie-out-box.tie-warn` (`#991b1b`) — genuine computation errors
- `lc < 0 ? 'var(--red)'` in `updateLcDisplay()` — equity stack overallocated (genuine error)
- `fixtureBadgeHtml` uses `rgba(212,29,29,.20)` / `#fca5a5` — sample fixture label (brand)
- Favicon fill `#d41d1d` (brand)
- `.leg-del:hover { color: #991b1b }` (S2.1, revenue-leg editor) — destructive-action hover affordance
  on a delete button, the standard UX convention; not financial-negative semantics, so not a Batch C
  regression

**Changed (C1–C6):**
- `.neg { color: #717c89 }` — expected structural negatives (hedge cost delta, margin foregone,
  sensitivity deltas) → slate. Previously `#991b1b` alarm-red.
- `.loss { color: #991b1b }` — NEW class for real P&L losses (ladder TIS NET when negative).
  Ladder cells use `tier.tisNetProfit >= 0 ? 'pos' : 'loss'` (was `'neg'`).
- `.btn-save` background → `var(--ink)` (was `var(--red)`). Hover `#3a3545`. (C2)
- `.tgl-track.on` → ink default; `[data-type="hedge"]` → green `#10b981`;
  `[data-type="surcharge"]` → amber `#f59e0b`. No untyped toggles exist in UI. (C6)
- `.si:focus` / `.ss:focus` / `.lib-select:focus` border/shadow → ink (was red). (C6)
- `.si.ph` / `.hedge-warn-note` / `.h-lock-warn` → amber `#92400e` text (was `#9a3412`). (C5)
- `.pip-ph` → `#f59e0b` amber (was `#f97316` orange). (C4)
- `.bdg.bdg-placeholder` → `#92400e` text / `#fef3c7` bg (was blue `#1e40af`/`#dbeafe`).
  Double-class selector (0,2,0) + `!important` defeats reportCss cascade. (C4)
- Route seg-btn active state → ink (C3).
- Sensitivity heat cells `.sens-neg` / `.sens-neg-strong` → dark-grey text, heat-map bg. (C1)
