# Hedge validation fix — merge confirmation, 2026-07-01

## CLAUDE.md baseline reconciliation (pre-commit)

Per the worktree-checklist's own standing rule ("as part of any future PR that touches
`test/invariants.js`, re-run the suite and update this line in the same PR"), the stale 220/221
baseline line was updated to reflect actual counts. Verified via engine-guard that this was a pure
doc edit with zero engine effect:

- `node test/invariants.js` → 245 passed, 0 failed (unchanged from pre-doc-edit)
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` (unchanged)

New baseline line: **245 passed with `reference-trade-001.json` present, 241 without it** (verified
by temporarily moving the fixture aside and rerunning, then restoring it).

## Commit

`fix/hedge-validation` @ `303dd15`, "fix: guard buildHedge() against missing trade.hedge" — bundles:
- `engine/core/hedge.js` — the fix (defaults `trade.hedge` to `{}`, mirrors the existing
  `iceHedged:false`-with-hedge-present output shape).
- `test/invariants.js` — new `#7b` regression block (6 checks), proven non-tautological via
  revert-and-rerun (reverting the fix crashes the suite outright).
- `CLAUDE.md` — baseline line reconciled 220/221 → 245/241.

Note: an unrelated, pre-existing local uncommitted edit to `CLAUDE.md` (an "Effort policy" / "Model
routing" section addition, present before this task started) was deliberately left uncommitted and
out of this commit — it was staged-around via a targeted patch rather than swept in with `git add -A`.

## Merge into main

`git checkout main && git merge --ff-only fix/hedge-validation` — fast-forward, `b07d63a..303dd15`,
no conflicts.

## Post-merge engine-guard on main (HEAD 303dd15)

- `node test/invariants.js` → **245 passed, 0 failed**
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — matches documented baseline,
  `OK (matches expected baseline)`.

Both match expectations exactly. No STOP condition.

## Push

`git push origin main` → `b07d63a..303dd15  main -> main` — succeeded.

## Full findings

See `reports/hedge-validation-fix-2026-07-01.md` for the complete root-cause analysis, diff,
before/after engine-guard runs, hand-verification on a configured-hedge fixture, the missing-`hedge`
crash-fix demonstration, and the revert-and-rerun non-tautology proof for the new test.
