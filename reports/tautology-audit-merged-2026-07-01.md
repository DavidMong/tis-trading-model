# Tautology audit — merge confirmation, 2026-07-01

## Commit

`fix/tautology-audit` @ `e9be92d`, "fix: replace 10 tautological/vacuous test assertions with
independently-grounded checks" — bundles:
- `test/invariants.js` — 8 fixes (2 `principalTie.ok` tautologies, 6 `reconciliation.ok`-alone
  tautologies), all grounded in independently-derived expected values, proven non-tautological via
  synthetic counter-example.
- `test/verify-report-equivalence.js` — 2 hardcoded `assert(..., true)` fixes + 2 NaN-detection
  pattern-gap fixes, same proof method.

Check counts unchanged both files (249/245 fixture/no-fixture for `invariants.js`, 77/0 for
`verify-report-equivalence.js`) — every fix was a 1:1 replacement of an existing assertion, not an
addition, so no `CLAUDE.md` baseline update was needed.

## Merge into main

`git checkout main && git merge --ff-only fix/tautology-audit` — fast-forward, `0d1ec2c..e9be92d`,
no conflicts.

## Post-merge engine-guard on main (HEAD e9be92d)

- `node test/invariants.js` → **249 passed, 0 failed**
- `node test/verify-report-equivalence.js` → **77 passed, 0 failed**
- `node scripts/fingerprint.js` → ALL-USD GUARD COMBINED:
  `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162` — matches documented baseline,
  `OK (matches expected baseline)`.

All three match expectations exactly. No STOP condition. Expected, since this was a test-assertion-only
change — no `engine/core` or `engine/flows` files were touched.

## Push

`git push origin main` → `0d1ec2c..e9be92d  main -> main` — succeeded.

## Full findings

See `reports/tautology-audit-2026-07-01.md` for the complete methodology, the full section-by-section
review of every check in `test/invariants.js`, all 10 fixes with diffs, and every synthetic
counter-example proof.
