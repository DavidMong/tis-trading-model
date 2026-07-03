---
paths:
  - "scripts/build-interactive.js"
---

# Field status & placeholder semantics

## Status pip semantics — `pip()` (Batch F)

The small colored dot before a field label (`ir(id, label, inputHtml, status, primary)`) signals the
field's *verification status* against the root status-flag taxonomy, via the same status strings the
engine/config emit: green `pip-ok` = OK/FIXED, grey `pip-ind` = INDICATIVE/PLACEHOLDER/PENDING/EXAMPLE,
orange `pip-unv` = CONFIRM/UNVERIFIED. This is real and varies meaningfully across the Costs and
Hedge tabs, where every field is backed by a config-driven status (e.g. NIMASA levies → UNVERIFIED,
VAT rate → OK).

It does **not** apply to fields with no verification-status concept at all — free-text identity
fields (trade name, partner, supplier, inspector), pure trader-discretion business terms (delivered
MT, profit split %, financing days, capital lockup days), the equity-provider/bond%/equity%
structural inputs, and FOB premium (no `status` field exists on `market.fobPremium` the way it does
on `market.ice`). Before Batch F, `pip(status)` defaulted falsy/`''` status to green `pip-ok` — so
these 12 Deal-tab fields showed an always-green "verified" dot that was actually just the function's
fallback, not a real signal. `pip(null)` (the explicit "no status concept" sentinel, distinct from
`''`) now renders no dot (`pip-none`) for exactly these fields; `ir()` callers elsewhere are
unaffected (`''`/omitted still falls through to green, unchanged) — only the 12 call sites with no
real status pass `null`. If you add a new Deal-tab field, pass `null` unless it's genuinely backed by
an engine/config status string.

## Hedge placeholder field state — `.si.ph` and `data-ph`

`.si.ph` gives amber border/background + amber pip to signal "field is empty; unconfirmed default."
Once a field has a value it must show **neutral** styling (normal border/bg, green pip, ink text).

Implementation:
- `ni()` adds `data-ph="1"` to inputs rendered with `cls='ph'`
- `refreshHedgePh()` iterates `[data-ph]` inputs: has-value → removes `ph`, sets pip to `pip-ok`;
  empty → ensures `ph` present, pip stays `pip-ind`
- Called from `onInputChange()` (every keystroke), after each `applyInputSnapshot()` call, and at init
- The `color` property was removed from `.si.ph` (prior pass) so text is always ink regardless

## Hedged volume MT placeholder

`inp-ice-hedged-vol` is empty when using the engine default (TIS retained tonnes, not full cargo —
see root *Dual-route hedge*). `updateHedgedVolPlaceholder()` sets its HTML `placeholder` attribute from
`_lastRetainedTonnes` (the last compute's retained tonnage), e.g. `"7,500 (retained)"`, or the label
`"retained tonnes"` before any compute has run. Called from `onInputChange()`, after each
`applyInputSnapshot()` call, and at init so it tracks the live computed default.
