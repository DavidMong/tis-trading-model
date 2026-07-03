# Report Mislabeling Fix — Merged & Pushed (2026-07-01)

## Commit

`54500fc` on `fix/report-mislabeling`:

```
fix: correct report footer and KPI subtitle mislabeling

- footerSection() now branches on isFixture (same regex as headerSection)
  instead of unconditionally claiming DUMMY/EXAMPLE data on every report
- TIS Net Profit KPI subtitle now branches on res.equityProvider === 'TIS'
  instead of unconditionally claiming "after partner split"

engine-guard confirmed byte-for-byte unchanged before/after (236/0, hash
a90288...408162) — display-only change.
```

Files: `scripts/report-renderer.js` (9 lines changed), `reports/report-mislabeling-fix-2026-07-01.md` (new).

## Merge

`fix/report-mislabeling` had zero divergence from `main` (`main..fix/report-mislabeling` = 1 commit
ahead, `fix/report-mislabeling..main` = 0) — fast-forward merge:

```
Updating 66fe5d6..54500fc
Fast-forward
 reports/report-mislabeling-fix-2026-07-01.md | 123 +++++++++++++++++++++++++++
 scripts/report-renderer.js                   |   9 +-
 2 files changed, 130 insertions(+), 2 deletions(-)
```

`main` now at `54500fc`.

## Post-merge engine-guard on main

- `trades/reference-trade-001.json`: present, confirmed.
- `node test/invariants.js` → **236 passed, 0 failed** — CONFIRMED, matches expected.
- `node scripts/fingerprint.js` ALL-USD guard → **a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162** — CONFIRMED, matches expected; script self-reports "OK (matches expected baseline)".

No STOP condition — `main` (54500fc) is byte-identical to the pre-merge branch tip on both gates.

## Push

```
git push origin main
66fe5d6..54500fc  main -> main
```

## Conclusion

Fixes committed, merged (fast-forward, no conflicts), verified byte-for-byte unchanged post-merge
(236/0 suite, hash `a90288...408162`), and pushed to `origin/main`.
