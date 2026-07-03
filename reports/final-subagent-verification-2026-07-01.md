# Final Subagent Verification — fix/ladder-labeling-hedge-pctsell (2026-07-01)

Two specialized subagents (`engine-guard`, `invariants-reviewer`) independently re-ran verification
against this branch, replacing the earlier general-purpose stand-in.

## 1. engine-guard: suite + fingerprint

- Fixture check: `trades/reference-trade-001.json` present in this (main) worktree — no copy needed.
- `node test/invariants.js` → **231 passed, 0 failed**.
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162`
  (script self-reports "OK (matches expected baseline)").

**Claim A (231 passed, 0 failed): CONFIRMED**
**Claim B (hash a90288…408162): CONFIRMED** — full hash matches exactly.

Note: CLAUDE.md's header text currently says 220/221; actual current count is 231, reflecting test
additions since that doc sync (not a regression).

## 2. invariants-reviewer: diff re-review

1. **"marginBasis hardcoding" catch — CONTRADICTED.** `marginBasis`/`fxBasis` are correctly derived
   from pre-existing `conv.fxMarketForDepot` config (`engine/core/pricing-ladder.js:246,275`), unchanged
   by this diff. The only new string literals are `marginStatus: 'INDICATIVE'` (line 247, legitimate
   advisory-status label) and `pnlBasis: 'nafem'` (line 250, correctly mirrors real NAFEM-only P&L
   conversion in `engine/core/revenue.js:119` per RULE 1). No derived numeric/financial field is
   hardcoded.
2. **ICE hedge cost wiring into ctx — CONFIRMED correct**, and it fixes a real pre-existing bug: on
   `main`, `computeEquityPartner` built the hedge but never fed `iceCostDelta`/`extraFinancingCost`
   into P&L. This branch adds `iceHedgeNetImpact` into `standaloneProfit`
   (`engine/flows/equity-partner.js:107-118`), correctly excluded from `marginForegone`. Manually
   re-derived on `reference-trade-001.json`: hedge-ON `tisNetProfit = 1,575,804.18`, exact match to
   hand calc. Sign/direction match CLAUDE.md's spec.
3. **sellValue wiring for `pct_of_sell` — CONFIRMED correct.** Previously `ctx.sellValue` was never
   passed, so `pct_of_sell` lines silently resolved to $0. Now wired via `sellCfg.value × deliveredQty`
   (`equity-partner.js:78`) and `combinedRevenue` (`trade.js:132`). Manually verified: 2% `pct_of_sell`
   override on the reference trade gives `amountUsd = 420,000`, exact match.

**New finding (not previously reported):** The doc-reconciliation commit `d06c341` (HEAD) sets the
invariants baseline to 221/221, but was written after `fcb82aa` (same branch) added ~10 more checks.
Actual count is 231 (fixture present) / 227 (fixture absent), not 221/217 — the branch's own
doc-reconciliation is already stale on arrival, reproducing the exact failure mode CLAUDE.md warns
about (`CLAUDE.md:28-32`). Also noted: no direct suite assertion pins `marginBasis`/`pnlBasis`/
`marginStatus` field values themselves — a future regression flipping these labels wouldn't be caught
numerically.

## Conclusion

All prior stand-in findings **hold up** under specialized-agent re-review; one new stale-doc-count
finding surfaced (baseline count needs another bump: 221 → 231).
