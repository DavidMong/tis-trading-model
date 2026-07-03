# dashboard-dataviz-batch-g — sync with main + CLAUDE.md defect fix (2026-07-03)

Follow-up to `reports/dashboard-dataviz-batch-g-review-2026-07-03.md`, which found the branch was
5 commits stale relative to `main` and shipped a dangling CLAUDE.md reference to
`.claude/rules/build-interactive-*.md` files that main created (commit `fafe563`) but this branch
never had. This report documents fixing both.

**Result: fixed and verified.** Suite 249/249, guard byte-for-byte unchanged, all four rule files
present and correctly cross-referenced, no content lost from either side.

---

## Method: merge, not rebase

Chose **`git merge main` into `dashboard-dataviz-batch-g`** rather than `git rebase
dashboard-dataviz-batch-g onto main`.

**Why:** `dashboard-dataviz-batch-g` has a remote tracking ref (`origin/dashboard-dataviz-batch-g`).
A rebase rewrites every commit's SHA, which would require a force-push to publish and could conflict
with anyone else who has this branch checked out. A merge adds a single new commit on top of existing
history — nothing is rewritten, no force-push is ever needed, and it's safe to do directly on the
named branch (no need for a separate "rebase branch"). Given the task allowed either, and explicitly
offered the rebase-branch alternative specifically to avoid rewriting shared history, a plain merge
sidesteps that concern entirely rather than working around it.

Stayed on `dashboard-dataviz-batch-g` itself (did not create a separate rebase branch) — merging
doesn't touch existing commits, so there was no history-rewrite risk to route around.

---

## 1. Engine safety

### Before the merge

Re-confirmed both sides unchanged from the prior review, immediately before merging:

```
$ node test/invariants.js   # on main
249 passed, 0 failed

$ node scripts/fingerprint.js   # on main
ALL-USD GUARD COMBINED: a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162
ALL-USD GUARD: OK (matches expected baseline)
```

### The merge

```
$ git merge main --no-edit
Auto-merging CLAUDE.md
CONFLICT (content): Merge conflict in CLAUDE.md
Auto-merging scripts/build-interactive.js
CONFLICT (content): Merge conflict in scripts/build-interactive.js
Automatic merge failed; fix conflicts and then commit the result.
```

Everything else merged cleanly, including the four `.claude/rules/build-interactive-*.md` files
(new, non-conflicting adds from main) and the 5 fix commits' engine/test changes (`engine/core/hedge.js`,
`engine/core/pricing-ladder.js`, `engine/core/rounding.js`, `engine/core/sensitivities.js`,
`engine/flows/equity-partner.js`, `engine/flows/trade.js`, `test/invariants.js`,
`test/verify-report-equivalence.js`, `run.js`, `scripts/report-renderer.js`, `scripts/serve.js`, plus
13 new `reports/*.md` audit trails and `.claude/agents/`, `.claude/settings.json`).

### After the merge (post-commit)

```
$ node test/invariants.js
249 passed, 0 failed

$ node scripts/fingerprint.js
  reference-trade-001        equity-partner       n= 334  42066008f041a4a41861facd4afb523a8484dcd1d99b4747b9ae3ce729c38f20  [ALL-USD GUARD]
  sample-both-channels       trade                n= 410  7fffbfb3b7b6a17b16fd539382ed0ae2eca714bb9cdcd71a210f1af13539542a
  sample-depot-only          full-depot-resale    n= 385  b93c85fe9b431b9f31759bff70f59a11a0d81a1cc10e93bcb495d7dcdcbf496b
  sample-equity-partner      equity-partner       n= 334  b048129345ef4e03d17b8ffe900aa66f9dd15562b42863bb095a99c82eaf00e5  [ALL-USD GUARD]
  sample-exship-tis          straight-exship      n= 380  7ce1501b6a2f626eddad5061b90a5a2d2030200bd1ad50feca3db5bf5a11bce4  [ALL-USD GUARD]
  sample-trade               equity-partner       n= 335  c6b11f0d740ea4a0465d53536fc207d3ead3289d102969cacfdbe7922ea4d46a

  ALL-USD GUARD COMBINED: a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162
  ALL-USD GUARD: OK (matches expected baseline)
```

**249 passed, 0 failed** (fixture present throughout — never removed). **Guard hash byte-for-byte
identical**: `a90288524a4c1d599a343959e978f9ae5df91d0fbbf6cd27e346feb9d5408162`, matching both
pre-merge baselines exactly. Confirmed both before staging the conflict resolution and again after
the merge commit — stable at every checkpoint.

Merge commit: `3f3ea56` on `dashboard-dataviz-batch-g`.

---

## 2. Conflict resolution

Two files conflicted: `CLAUDE.md` and `scripts/build-interactive.js`. Every other file (including the
four new rule files) merged automatically with no manual intervention.

### 2a. CLAUDE.md — the core defect fix

Single conflict, in the "Module documentation" section. Branch's side (HEAD) had the module-split
pointers but no rule-file descriptions; main's side had the rule-file descriptions plus the Effort
policy / Model routing sections the branch never had. Resolved by keeping **all** of it:

```markdown
## Module documentation

- `engine/core/CLAUDE.md` — pricing ladder, ICE/FX hedge mechanics, settlement ICE, config-driven cost/tax lines
- `engine/flows/CLAUDE.md` — the unified `trade.js` flow (five independent dimensions)

Interactive dashboard (`scripts/build-interactive.js`) behavior is documented in **path-scoped rules**
that auto-load only when editing that file (kept out of this always-loaded root file to save context
— do not copy them back here):

- `.claude/rules/build-interactive-state.md` — per-trade vs house-defaults split, trade-library
  state machine + footer layout, `TISStorage` persistence.
- `.claude/rules/build-interactive-results-flow.md` — empty-state / stale-results prevention,
  optional sell price (price-independent vs price-dependent outputs).
- `.claude/rules/build-interactive-field-status.md` — `pip()` status semantics, `.si.ph`
  placeholder state, hedged-volume MT placeholder.
- `.claude/rules/build-interactive-identity-display.md` — browser tab title, identity fields +
  fixture badge, favicon, Batch C color-semantics palette.


## Effort policy
[... main's content, unchanged ...]

## Model routing
[... main's content, unchanged ...]
```

**Bonus fix (not part of the conflict, found while resolving it):** the branch's original CLAUDE.md
split had silently dropped the `../` prefix from `## NTA 2025 tax anchors  (authority: tax-reference.md
...)` — a small accuracy regression from the original split, unrelated to the interactive-dashboard
defect, inconsistent with the "local working copy outside this repo" blockquote right below it (which
still said `../tax-reference.md`, since that blockquote is new content from main that merged in
cleanly). Corrected the header back to `../tax-reference.md` to match main and the blockquote.

### 2b. scripts/build-interactive.js — 3 substantive conflicts, resolved by picking the more-correct side each time

This file diverged more than expected: main independently touched the same two dataviz features this
branch modified (sticky KPI, Profit Waterfall), evolving them differently after the fork. Each
conflict was a real fork in implementation, not a mechanical text clash — resolved by reading both
sides and keeping whichever was actually correct, not by favoring one branch by default.

**Sticky KPI (CSS + HTML structure, 3 conflict hunks) — took main's version.** Branch's original
implementation used `position: sticky` on `.results-sticky-kpi` inside `<main class="results">`. Main's
comment explained why that's broken: `position: sticky` only reserves its own row once, at its natural
document position — it does not prevent later-scrolled content from passing back underneath it, and
main had confirmed this concretely ("it hid an UNVERIFIED status badge on a cost line"), then verified
the fix "by sweeping 12 scroll positions × 5 sections." Main's fix makes the pill a genuine flex
sibling of `<main class="results">` (both wrapped in a new `.results-col`), so `.results`' own
scrollable box is permanently and unconditionally shorter — content can never geometrically reach
behind the pill at any scroll position. Adopted main's CSS, HTML structure, and JS comment wholesale;
the JS logic itself (query `.results`, toggle `.visible` past a scroll threshold) was unchanged on
both sides.

**Profit Waterfall (CSS + `renderWaterfall()` body, 2 conflict hunks) — took the branch's version.**
Main had independently redesigned the *old* card-row markup's color system ("Batch G v2": muted-slate
deductions, bordered-white checkpoint, still-colored terminal). This branch, however, had already
replaced that entire card-row markup with the hand-rolled SVG bridge chart (`buildWaterfallSteps` +
`renderWaterfallChart`, verified working in the prior review — correct figures, "neutral intermediate
bars" already matches the same visual intent main's v2 cards were going for, just via SVG rather than
DOM cards). Since the dashboard no longer renders `.wf-box` markup at all once the SVG chart is in
place, main's new `.wf-box.wf-deduct/wf-share/wf-adjusted` CSS overrides would have been dead code —
styling elements the page never emits. Kept the branch's SVG-chart implementation and updated the
removal comment to explicitly note main's v2 card CSS was dropped as dead code and why. Confirmed via
`grep` that `.wf-box` classes are still defined and used by `scripts/report-renderer.js` (the separate
PDF-report path, untouched either way) — only the *dashboard's own* card markup and matching overrides
are gone.

**Boot-sequence comment (1 conflict hunk, cosmetic) — took main's version**, since it accurately
describes the flex-sibling structure adopted above; branch's comment described the old
`position:sticky` approach no longer in use.

### 2c. Post-resolution checks

```
$ grep -n "^<<<<<<<\|^=======\|^>>>>>>>" scripts/build-interactive.js CLAUDE.md
(no matches)

$ node --check scripts/build-interactive.js
(exits 0, no output)

$ node scripts/build-interactive.js
  out/engine.bundle.js  38.8kb
⚡ Done in 18ms
HTML → out/TIS-interactive.html
```

Rebuilt the dashboard and re-verified visually in Chrome (same sample fixture,
`TIS-SAMPLE-EQUITY-PARTNER-001`): Profit Waterfall SVG chart renders identically to the pre-merge
branch build (same five steps, same figures — $1,929,550.96 → −$418,640.47 → =$1,510,910.49 →
−$528,818.67 → =$982,091.82); Sensitivities tornado chart renders correctly; sticky KPI (now on
main's flex-sibling implementation) appears on scroll with no overlap. No visual regression from
adopting main's sticky-KPI structure.

---

## 3. CLAUDE.md section-by-section diff — confirming no content lost from either side

Header-level comparison, current merged branch root `CLAUDE.md` (213 lines) vs main's current root
`CLAUDE.md` (342 lines — main never split out the engine-module content, so its root file still
carries Pricing ladder / Unified trade model / Hedge toggles / Final ICE / Config-driven lines inline):

| Section | Main (root, full) | Merged branch (root) | Merged branch (relocated) |
|---|---|---|---|
| Architecture (three layers) | ✅ | ✅ (module-split wording) | — |
| Worktree setup checklist | ✅ | ✅ verbatim | — |
| Input → derivative dependency graph | ✅ | ✅ verbatim | — |
| NTA 2025 tax anchors | ✅ | ✅ (typo fixed, see §2a) | — |
| Recoverable-VAT treatment | ✅ | ✅ verbatim | — |
| Surcharge gate | ✅ | ✅ verbatim | — |
| Partner compensation toggle | ✅ | ✅ verbatim | — |
| Annualised return (RULE) | ✅ | ✅ verbatim | — |
| Paper vs economic quantities | ✅ | ✅ verbatim | — |
| Dual-route hedge (summary) | ✅ | ✅ verbatim + pointer | — |
| Pricing ladder (full) | ✅ (inline) | — | ✅ `engine/core/CLAUDE.md` (verbatim except path shortened: `` `pricing-ladder.js` `` vs `` `engine/core/pricing-ladder.js` ``, correct for its new location) |
| Unified trade model (full) | ✅ (inline) | — | ✅ `engine/flows/CLAUDE.md` (verbatim except one cross-reference: "see root *Annualised return*" vs "see *Annualised return* above", correct for its new location) |
| Hedge toggles — ICE + FX (full) | ✅ (inline) | — | ✅ `engine/core/CLAUDE.md` verbatim |
| Final / settlement ICE (full) | ✅ (inline) | — | ✅ `engine/core/CLAUDE.md` verbatim |
| Config-driven cost/tax lines (full) | ✅ (inline) | — | ✅ `engine/core/CLAUDE.md` verbatim |
| Status-flag taxonomy | ✅ | ✅ verbatim | — |
| Interactive dashboard | ✅ (pointer only, since `fafe563`) | ✅ pointer, now correct | ✅ 4 files in `.claude/rules/`, byte-identical to main's |
| Effort policy | ✅ | ✅ verbatim (recovered from the merge) | — |
| Model routing | ✅ | ✅ verbatim (recovered from the merge) | — |

Confirmed with `diff` that the two relocated sections spot-checked (Pricing ladder, Unified trade
model) are content-identical to main's current inline versions apart from the expected path/
cross-reference rewording appropriate to their new file location — no material content differs.

**The defect from the prior review is fixed:** the "Interactive dashboard" pointer in root `CLAUDE.md`
now resolves to four files that actually exist, are tracked in this branch, and are byte-identical to
main's:

```
$ diff .claude/rules/build-interactive-state.md          <main-worktree>/.claude/rules/build-interactive-state.md          # identical
$ diff .claude/rules/build-interactive-results-flow.md    <main-worktree>/.claude/rules/build-interactive-results-flow.md    # identical
$ diff .claude/rules/build-interactive-field-status.md    <main-worktree>/.claude/rules/build-interactive-field-status.md    # identical
$ diff .claude/rules/build-interactive-identity-display.md <main-worktree>/.claude/rules/build-interactive-identity-display.md # identical
```

---

## 4. Rule files exist and are correctly referenced

```
$ ls -la .claude/rules/build-interactive-*.md
build-interactive-field-status.md      2885 bytes
build-interactive-identity-display.md  4311 bytes
build-interactive-results-flow.md      3687 bytes
build-interactive-state.md             3756 bytes
```

All four present, tracked (staged as part of the merge commit, sourced cleanly from main with no
conflict), and referenced by name and one-line summary from the "Module documentation" section of root
`CLAUDE.md` (§2a above) — matching main's own pointer text exactly.

---

## Summary

| Check | Result |
|---|---|
| Engine suite | 249/249 both before and after, no drift at any checkpoint |
| ALL-USD guard | `a90288...408162` byte-for-byte identical throughout |
| Merge conflicts | 2 files (`CLAUDE.md`, `scripts/build-interactive.js`), both resolved by reading and picking the objectively correct side, not mechanically |
| CLAUDE.md content | Nothing lost from either side; one pre-existing typo fixed as a bonus |
| Rule files | All 4 present, tracked, byte-identical to main, correctly cross-referenced |
| Dashboard | Builds clean, renders correctly (SVG waterfall, tornado chart, sticky KPI all verified visually) |

`dashboard-dataviz-batch-g` (commit `3f3ea56`) is now current with `main` and the CLAUDE.md
dangling-reference defect from the prior review is resolved. Not merged to `main` — left for review as
instructed.
