---
name: build-report
description: Run the invariants suite, then regenerate the PDF and interactive HTML trade reports. Use before committing engine/ changes or handing off a report.
disable-model-invocation: true
---

# Build report

1. `node test/invariants.js` — abort if any invariant fails; do not proceed to build on a red suite.
2. `node scripts/build-report.js` — regenerates the PDF report into `out/`.
3. `node scripts/build-interactive.js` — regenerates the interactive HTML into `out/`.
4. Report the `out/` files produced and the invariants pass count back to the user.
