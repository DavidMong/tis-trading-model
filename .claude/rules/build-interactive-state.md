---
paths:
  - "scripts/build-interactive.js"
---

# Trade state & persistence

Two named arrays in the client script control which inputs are cleared/reloaded on **New Trade**:

- **`PER_TRADE_IDS`** — identity (name/partner/supplier/inspector), market prices, FX, freight,
  financing, partner terms, toggles. Cleared on New Trade.
- **`DEFAULT_IDS`** — cost-line rates/flat fees, tax rates, storage rates, density, hedge bank
  terms. Persist across trades; loaded from saved house defaults on New Trade.

## Professional trade library — state machine + footer layout

Three-state badge (`#trade-state-badge`) driven by `_currentTradeName` (null = new) and `_modified`:
- **New · unsaved** — slate/grey; `_currentTradeName === null`
- **{name} · saved** — blue-grey; loaded/saved, no pending edits
- **{name} · modified** — amber; any `onInputChange()` or toggle click since last save/load

Footer is a four-row column layout (requires `display:flex; flex-direction:column` on `.sb-footer`
— parent sidebar uses flex:row, which is why the explicit direction is needed):
1. **Row 1** (`.sb-footer-row1`) — New Trade · Save · Save As…
2. **State row** (`.sb-state-row`) — three-state badge (full width)
3. **Row 2** (`.sb-footer-row2`) — dropdown · ↓ (force-load) · ✎ (rename) · ✕ (delete)
4. **Report row** (`.sb-report-row`) — Download Report button (added with the report-pdf feature)

**CSS cascade note:** three `.sb-footer` blocks exist in the stylesheet (original ~line 322, spacing-system
~line 693, new-feature ~line 766). The new-feature block must explicitly set `align-items:stretch; padding:0;
gap:0; overflow:hidden; box-sizing:border-box; width:100%` to override all conflicting properties from the
earlier blocks. Each inner row (`sb-footer-row1`, `sb-state-row`, `sb-footer-row2`) carries its own padding
and `box-sizing:border-box; width:100%; overflow:hidden`. The lib-select dropdown uses `flex:1; min-width:0;
max-width:100%; box-sizing:border-box` to shrink within its flex row without bleeding past the sidebar edge.

Key behaviours:
- **Smart Save** (`saveTrade()`): if `_currentTradeName !== null`, updates in place ("Updated: {name}");
  otherwise reads `inp-trade-name`, prompts duplicate-check, saves as new.
- **Save As…** (`saveAsTrade()`): always `prompt()`s for name; default is "{current} (copy)" or typed name.
  Switches `_currentTradeName` to the new name on success.
- **Rename** (`renameTrade()`): `prompt()`s; moves storage key; updates badge if renaming current trade.
- **Delete** (`deleteSelectedTrade()`): confirm includes "(This is the trade currently in your form.)"
  when deleting the current trade; sets `_currentTradeName = null` so badge reverts to "New · unsaved";
  form inputs are **not** wiped.
- **Load** (`loadSelectedTrade(explicit?)`): auto-loads on dropdown `onchange`; `↓` passes `explicit=true`
  to surface "Select a saved trade first" on empty. Unsaved-changes confirm on either path.
- **New Trade** (`newTrade()`): confirm if `_modified`; resets `_currentTradeName = null` + dropdown.

**Template-literal escape rule:** `\n` inside the Node.js template literal emits a literal newline into
the browser JS string, breaking single-quoted strings. Never use `\n` in string literals within the
client JS block — use concatenation or omit newlines entirely.

## Storage abstraction (`TISStorage`)

All persistence is routed through `TISStorage` (an IIFE in the client script). Current backend:
**`localStorage`** (`tis_saved_trades_v1`, `tis_house_defaults_v1`). To swap to a hosted backend,
replace only the four methods: `saveTrade`, `loadTrade`, `loadTrades`, `deleteTrade`,
`saveDefaults`, `loadDefaults`. The rest of the UI is backend-agnostic.
