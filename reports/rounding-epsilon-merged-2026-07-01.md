# Rounding epsilon fix — merge confirmation, 2026-07-01

## CLAUDE.md baseline reconciliation (pre-commit)

Per the worktree-checklist's standing rule, updated the baseline line from 245/241 to **249/245**
(fixture/no-fixture), matching the actual counts after the new `#5` regression block. Verified via
engine-guard that this was a pure doc edit with zero engine effect before committing:

- `node test/invariants.js` → 249 passed, 0 failed (unchanged)
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` (unchanged)

## Commit

`fix/rounding-epsilon` @ `ce61912`, "fix: correct rounding epsilon for real financial magnitudes" —
bundles:
- `engine/core/rounding.js` — the fix (`(x*f).toPrecision(15)` before `Math.round`, replacing the
  fixed `+Number.EPSILON` nudge).
- `test/invariants.js` — new `#5` regression block (4 checks), proven non-tautological via
  revert-and-rerun (2 of 4 checks genuinely fail on the pre-fix implementation).
- `CLAUDE.md` — baseline line reconciled 245/241 → 249/245.

No unrelated files were swept into this commit (working tree was clean of any other uncommitted
changes at commit time — unlike the prior hedge-validation commit, there was no pre-existing local
edit to work around).

## Merge into main

`git checkout main && git merge --ff-only fix/rounding-epsilon` — fast-forward, `2b56aca..ce61912`,
no conflicts.

## Post-merge engine-guard on main (HEAD ce61912)

- `node test/invariants.js` → **249 passed, 0 failed**
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — matches documented baseline,
  `OK (matches expected baseline)`.

Both match expectations exactly. No STOP condition.

## Push

`git push origin main` → `2b56aca..ce61912  main -> main` — succeeded.

## Full findings

See `reports/rounding-epsilon-fix-2026-07-01.md` for the complete root-cause analysis (which `round()`
call sites touch quantities vs. prices/rates and why that's compliant with the TIS-favor RULE),
brute-force boundary-bug demonstration at real financial magnitude, the `toPrecision(15)` derivation
and correctness argument, neutrality verification, before/after engine-guard runs, and the
revert-and-rerun non-tautology proof for the new `#5` test block.
