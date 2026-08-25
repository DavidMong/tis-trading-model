'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

// ── 1. Bundle engine ─────────────────────────────────────────────────────────
execSync(
  'npx esbuild scripts/engine-browser-entry.js --bundle --format=iife --global-name=TISEngine --minify "--define:BROWSER_BUILD=true" --outfile=out/engine.bundle.js',
  { cwd: ROOT, stdio: 'inherit' }
);
const engineBundle = fs.readFileSync(path.join(OUT, 'engine.bundle.js'), 'utf8');

// ── 2. Read sample trade as initial state ────────────────────────────────────
const initialTrade = JSON.parse(fs.readFileSync(path.join(ROOT, 'trades', 'sample-equity-partner.json'), 'utf8'));
const isSampleFlag = /REGRESSION|FIXTURE|dummy|test|sample/i.test(initialTrade.meta.tradeName || '');

// ── 2a. Favicon data URI (TIS mark, red #d41d1d, 32×32 logical square) ───────
const faviconDataUri = 'data:image/svg+xml,' + encodeURIComponent([
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 38">',
  '<text x="-0.65" y="36.55" font-family="Helvetica Neue,Helvetica,Arial,sans-serif"',
  ' font-weight="700" font-size="50" fill="#d41d1d">TIS</text>',
  '</svg>',
].join(''));

// ── 3. Read logo SVG ─────────────────────────────────────────────────────────
const logoSvgRaw = fs.readFileSync(path.join(ROOT, 'assets', 'tis-logo-2.svg'), 'utf8');
const logo = logoSvgRaw
  .replace(/^<\?xml[^?]*\?>\s*/,'')
  .replace(/<!DOCTYPE[^>]*>\s*/,'')
  .replace(/fill:#242331/g, 'fill:#f0f1f2');
// aria-label on the container provides accessibility; no <title> injected into inline SVG

// ── 4. CSS ───────────────────────────────────────────────────────────────────
function css() {
  const { reportCss } = require('./report-renderer');
  return reportCss + `
/* ════ DESIGN TOKENS (Batch F) ══════════════════════════════════════════════
   Additive only — does not replace any existing rule. A second :root block
   layers fine on top of reportCss's :root (different custom-property names,
   no redeclaration) per the same cascade-layering pattern already used for
   .sb-footer / .wf-box overrides below. Color roles map onto the EXISTING
   Batch C palette (ink/slate/amber/red/green) — no new colors introduced. ── */
:root {
  /* Type scale — named by role, not size, so a component's intent reads from
     its CSS rather than a magic px value. 6 sizes, smallest to largest. */
  --type-label:   9px;   /* section/field labels, uppercase eyebrow text */
  --type-body:    11px;  /* body copy, sub-text, table cells */
  --type-input:   12px;  /* form inputs, default UI text */
  --type-value:   13px;  /* emphasized inline figures (primary inputs, table totals) */
  --type-kpi:     21px;  /* header KPI figures */
  --type-display: 28px;  /* reserved for hero/display figures */

  /* 8px spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;

  /* Color roles — aliases onto the existing Batch C palette, not new hex values */
  --role-ink:      var(--ink);     /* primary text, terminal/emphasis fills */
  --role-slate:    var(--slate);   /* secondary text, neutral borders */
  --role-positive: #15803d;        /* Batch C green — positive / active */
  --role-caution:  #f59e0b;        /* Batch C amber — caution / unverified */
  --role-loss:     #991b1b;        /* Batch C deep-red — genuine error / real P&L loss */
  --role-accent:   var(--red);     /* Batch C red — brand accent ONLY, never loss */
}

/* ════ DESIGN TOKENS (Stage 0) ═══════════════════════════════════
   A second additive :root layer on top of Batch F, above. Deliberately uses
   ITS OWN token namespace (--fs-*, --g-*) rather than redeclaring the Batch F
   --type- / --role- names — this stage re-skins only the app shell (header,
   sticky KPI strip, sidebar, footer) and the Profit Waterfall as a reference
   implementation (root CLAUDE.md: "UI is not the priority" but still must be
   deliberate); other result sections keep reading the Batch F tokens
   unchanged until their own staged diff repoints them onto this scale.
   Color roles below alias the EXISTING Batch C/F hex values (canvas==--bg,
   panel==--white, hairline==--border, etc.) — no new colors invented except
   the one inverse-ink text color and one neutral elevation shadow the brief
   calls for explicitly. No gradients, no glow, no colored shadow anywhere. */
:root {
  /* Font stacks — --f-mono is new (Plex Mono, CDN-loaded + self-hosted via
     report-fonts.js's 'TIS Mono' face for the PDF pipeline, not yet wired
     into report-pdf-renderer.js this stage). --f-display/--f-body are NOT
     repointed here — this Stage 0 diff left reportCss's Space Grotesk/IBM
     Plex Sans values as they were; Stage 5 later repointed --f-display to
     IBM Plex Sans and dropped Space Grotesk entirely (see reportCss's own
     :root, scripts/report-renderer.js). Comment kept as historical record
     of the original Stage 0 scope decision, not current state. */
  --f-mono: 'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace;

  /* Type scale (px), named by role. data/value/kpi/display are set to use
     --f-mono + tabular-nums at their call sites (mono is a font choice, not
     a size, so it isn't baked into the token name). */
  --fs-label:   10px;  /* section/field eyebrow labels, uppercase */
  --fs-caption: 12px;  /* secondary/sub text under a value or heading */
  --fs-body:    13px;  /* running prose, table cells */
  --fs-input:   13px;  /* form inputs */
  --fs-data:    13px;  /* table numerics, mono tabular */
  --fs-value:   15px;  /* emphasized inline figures */
  --fs-heading: 16px;  /* card/section headings */
  --fs-kpi:     24px;  /* header KPI figures */
  --fs-display: 32px;  /* hero/display figures */

  /* Color roles — aliases onto existing hex values (no new palette this
     stage), named for their ROLE per the brief rather than their value. */
  --g-canvas:        var(--bg);      /* #f6f7f8 */
  --g-panel:         var(--white);   /* #ffffff */
  --g-chrome-ink:        #242331;    /* == --ink; named for header/rail chrome */
  --g-chrome-ink-inverse:#f0f1f2;    /* text on --g-chrome-ink surfaces */
  /* Stage 1 AA fix: darkened role token, NOT an alias of base --slate
     (#717c89 stays untouched everywhere else). #64707c computes to 5.06:1 on
     #ffffff and 4.72:1 on canvas #f6f7f8 (WCAG relative-luminance formula) —
     both clear the 4.5:1 AA-normal floor with margin. Every surface reading
     --g-text-slate (including Stage 0's shell/waterfall) inherits this. */
  --g-text-slate:    #64707c;
  --g-hairline:      var(--border);  /* rgba(113,124,137,.18) */
  --g-brand-red:     var(--red);     /* #d41d1d — wayfinding/identity ONLY, never P&L */
  --g-positive:      var(--role-positive); /* #15803d */
  --g-loss:          var(--role-loss);     /* #991b1b */
  --g-caution:       var(--role-caution);  /* #f59e0b */
  /* One neutral elevation shadow, reserved for overlay/drawer surfaces only
     — never used for card/KPI/button emphasis (no colored or glow shadows). */
  --g-shadow-elevation: 0 8px 24px rgba(36,35,49,.14);

  /* Motion — transform/opacity only (enforced at call sites, not by the
     token system); prefers-reduced-motion override lives in the "Motion"
     block below, right after the shell+waterfall rules that use these. */
  --g-duration-fast:    120ms;
  --g-duration-ui:      160ms;
  --g-duration-surface: 220ms;  /* 200–240ms range per brief */
  --g-easing-standard:  cubic-bezier(.2,0,0,1);
  --g-easing-exit:      cubic-bezier(.4,0,1,1);
}

/* ════ THEME SYSTEM (2026-08 refresh) ═══════════════════════════════
   Dark/light toggle via [data-theme] on <html>. The LIGHT values below are
   the existing palette restated as semantic SURFACE tokens — every rule in
   this sheet that reads --g-* keeps working unchanged. DARK remaps those
   same roles onto a deep neutral-blue scale (fintech terminal), keeping:
   - brand red for wayfinding only (brightened for dark-bg contrast)
   - green/amber/red P&L semantics (dark-mode AA variants)
   - IBM Plex superfamily + tabular-nums discipline.
   Additive: nothing above is edited, so light mode is byte-for-byte today. */
:root {
  /* Semantic surface tokens (light defaults = current palette) */
  --t-canvas:      var(--bg);                       /* app background */
  --t-panel:       var(--white);                    /* cards, rail, tables */
  --t-panel-alt:   #fbfcfd;                         /* zebra rows, hover wash */
  --t-sunken:      var(--slate-bg);                 /* wells, code, inputs bg */
  --t-ink:         var(--ink);                      /* primary text */
  --t-ink-2:       var(--g-text-slate);             /* secondary text */
  --t-ink-3:       #8a94a0;                         /* tertiary/captions */
  --t-hairline:    var(--border);
  --t-hairline-strong: rgba(113,124,137,.32);
  --t-brand:       var(--red);
  --t-brand-ink:   #ffffff;                          /* text on brand fill */
  --t-positive:    var(--g-positive);
  --t-caution:     var(--g-caution);
  --t-loss:        var(--g-loss);
  --t-shadow:      0 8px 24px rgba(36,35,49,.14);
}
html[data-theme='dark'] {
  --bg:            #0d1117;                          /* repoint legacy aliases too */
  --white:         #161b22;                          /* 'panel' surfaces go dark */
  --ink:           #e6edf3;
  --slate:         #9da7b3;
  --border:        rgba(139,148,158,.16);
  --red:           #f0554f;                          /* brand on dark — wayfinding only */
  --red-dim:       #c73e39;

  --t-canvas:      #0d1117;
  --t-panel:       #161b22;
  --t-panel-alt:   #1b2129;
  --t-sunken:      #10151c;
  --t-ink:         #e6edf3;
  --t-ink-2:       #a8b3bf;   /* AA 8.0:1 on panel — was 7.1, fine; bumped for small sizes */
  --t-ink-3:       #848f9b;   /* AA 5.26:1 on panel — captions now clear the 4.5 floor */
  --t-hairline:    rgba(139,148,158,.18);
  --t-hairline-strong: rgba(154,164,175,.38);
  --t-brand:       #ff6b64;   /* brightened: 4.6:1 on panel for text use */
  --t-brand-ink:   #0d1117;
  --t-positive:    #4ade80;   /* 9.2:1 on panel — P&L green pops without neon */
  --t-caution:     #e3b341;   /* 8.6:1 */
  --t-loss:        #ff7b72;   /* 6.6:1 — readable at 11px table sizes */
  --g-text-slate:  #9da7b3;
  --g-canvas:      #0d1117;
  --g-chrome-ink:  #161b22;
  --g-chrome-ink-inverse: #e6edf3;
  --g-shadow-elevation: 0 8px 24px rgba(0,0,0,.5);
  color-scheme: dark;
}
html[data-theme='light'] { color-scheme: light; --hdr-bg: var(--ink); --hdr-fg: #ffffff; }

/* Status chips on dark: same hues, dark-mode-tuned text/bg pairs */
html[data-theme='dark'] {
  --confirm-c:#f5c451; --confirm-bg:rgba(245,196,81,.12);
  --unver-c:#ff8f88;   --unver-bg:rgba(248,81,73,.13);
  --placeholder-c:#8ecbff; --placeholder-bg:rgba(88,166,255,.14);
  --pending-c:#dcb8ff; --pending-bg:rgba(163,113,247,.16);
  --recov-c:#63e680;   --recov-bg:rgba(63,185,80,.13);
  --indic-c:#d3dae1;   --indic-bg:rgba(139,148,158,.13);
  --example-c:#d3dae1; --example-bg:rgba(139,148,158,.10);
  --fixed-c:#63e680;   --fixed-bg:rgba(63,185,80,.13);
  --heat-pos: rgba(74,222,128,.15);  --heat-pos-strong: rgba(74,222,128,.28);
  --heat-neg: rgba(255,123,114,.15); --heat-neg-strong: rgba(255,123,114,.28);
}

/* ── Theme application layer (2026-08) ─────────────────────────────
   Repoints the shell's hardcoded surfaces onto the --t-* semantic tokens.
   Light values are identical to what was here before (aliases), so light
   mode is unchanged; dark mode inherits the remap automatically. */
body, .app-body { background: var(--t-canvas); color: var(--t-ink); }

/* SPACING CORRECTIONS: the base .section (report-renderer) has gap:0 and its
   heading carries border-left + margin-bottom that double up with this sheet's
   own h2.section-heading treatment — producing cramped cards and doubled ticks.
   Normalize here: consistent 8px-scale rhythm across section → card → footer. */
.section { gap: 0; margin: 0; }
h2.section-heading { padding: 0 0 10px 12px; margin-bottom: 12px; }
.card-body { padding: 18px 22px; }
.card-footer {
  background: transparent;                 /* was var(--bg) — mismatched vs panel in dark */
  border-top: 1px solid var(--t-hairline);
  color: var(--t-ink-2);
}
.tbl-wrap { padding: 4px 22px 14px; }
.wf-reconcile { padding: 10px 22px; }

/* DARK-MODE HEADER FIX: the header KPI chips (report-renderer base) use white-on-dark
   chrome designed for the light theme's dark-ink header. In dark mode --ink becomes
   near-white, so the chips sat white-text on near-white bg = invisible. Repoint the
   header surfaces onto theme tokens and lift label/value contrast to AA. */
.report-header {
  background: var(--t-sunken);
  color: var(--t-ink);
  border-top: 3px solid var(--t-brand);
}
/* Light theme keeps its original dark-chrome header (brand look) — only dark remaps. */
html[data-theme='light'] .report-header,
.report-header:not([data-theme]) { }
:root { --hdr-bg: var(--ink); --hdr-fg: #ffffff; }
html[data-theme='dark'] { --hdr-bg: var(--t-sunken); --hdr-fg: var(--t-ink); }
.report-header { background: var(--hdr-bg); color: var(--hdr-fg); border-top: 3px solid var(--t-brand); }
.kpi-chip { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.12); }
.kpi-label { color: rgba(255,255,255,.72); }   /* AA on both header chromes */
.kpi-sub { color: rgba(255,255,255,.62); }
.kpi-value { color: #ffffff; }
.kpi-loss .kpi-value { color: #ffd7d7; }       /* readable white-red on both chromes */
html[data-theme='dark'] .kpi-chip { background: rgba(255,255,255,.05); border-color: var(--t-hairline); }
html[data-theme='dark'] .kpi-label { color: var(--t-ink-2); }
html[data-theme='dark'] .kpi-sub { color: var(--t-ink-3); }
html[data-theme='dark'] .kpi-value { color: var(--t-ink); }
html[data-theme='dark'] .kpi-loss .kpi-value { color: var(--t-loss); }
/* Profit (accent) chip: solid green + white in light; translucent green wash + AA
   green text in dark (white on green-tint-over-dark fails). */
html[data-theme='dark'] .kpi-chip.kpi-accent { background: rgba(74,222,128,.12); border-color: var(--t-positive); }
html[data-theme='dark'] .kpi-chip.kpi-accent .kpi-value { color: var(--t-positive); }
html[data-theme='dark'] .kpi-chip.kpi-accent .kpi-label { color: var(--t-ink-2); }
html[data-theme='dark'] .kpi-chip.kpi-accent .kpi-sub { color: var(--t-ink-3); }
.header-meta-strip { background: transparent; border-top: 1px solid var(--t-hairline); }
.header-meta-inner { color: var(--t-ink-3); }
.header-meta-inner b { color: var(--t-ink-2); }
.trade-name, #hdr-trade-name { color: var(--hdr-fg); }
.trade-id, #hdr-trade-id { color: rgba(255,255,255,.55); }
html[data-theme='dark'] .trade-id, html[data-theme='dark'] #hdr-trade-id { color: var(--t-ink-3); }

/* LIGHT-THEME column-label fix: waterfall labels used --role-slate (#717c89) at
   10px uppercase = 4.25:1, below AA for small text. Use the AA-safe slate token. */
.wfsvg-collabel-name { color: var(--g-text-slate); }
/* AA fix: --role-slate (#717c89) at 10px = 4.25:1 on white — below 4.5. The
   audit-verified slate (#64707c) clears AA at 5.06:1. */
.wfsvg-collabel-name, .wfsvg-collabel-sub { color: var(--g-text-slate); }

/* ════ EXECUTIVE POLISH LAYER (2026-08) ════════════════════════════
   Rams: good design is as little design as possible. One accent per
   heading — the base border-left tick from report-renderer stays; the
   extra ::before/::after ornamentation below is removed. */

/* Inputs: quieter borders, focus ring in brand color, comfortable hit areas */
.si, input[type='number'], input[type='text'], select, textarea {
  background: var(--t-panel); color: var(--t-ink);
  border: 1px solid var(--t-hairline); border-radius: 5px;
  transition: border-color var(--g-duration-fast) var(--g-easing-standard),
              box-shadow var(--g-duration-fast) var(--g-easing-standard);
}
.si::placeholder { color: var(--t-ink-3); }
.si:hover { border-color: var(--t-hairline-strong); }
.si:focus, input:focus, select:focus, textarea:focus {
  outline: none; border-color: var(--t-brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--t-brand) 15%, transparent);
}
select.lib-select { background: var(--t-panel); color: var(--t-ink); }

/* Data tables: consulting-report tables — no zebra noise, hairline rows,
   bold totals with a double-rule finish */
.data-table thead th {
  font-size: var(--fs-label); letter-spacing: .06em; text-transform: uppercase;
  color: var(--t-ink-3); border-bottom: 1px solid var(--t-hairline-strong);
  padding: 7px 8px;
}
.data-table tbody td { padding: 6px 8px; border-bottom: 1px solid var(--t-hairline); }
.data-table tbody tr:hover td { background: var(--t-panel-alt); }
.data-table tbody tr:last-child td { border-bottom: none; }
tr.total td, .row-total td {
  border-top: 1px solid var(--t-hairline-strong);
  border-bottom: none; font-weight: 600; color: var(--t-ink);
}

/* Numerics: always Plex Mono tabular — columns align like a printed exhibit */
.param-value, .kpi-value, .data-table td.r, .wf-val, .tot-row td.r,
.tnsvg-val, .ladder-price, .mono-num, .glance-value {
  font-family: var(--f-mono);
  font-variant-numeric: tabular-nums lining-nums;
}

/* KPI strip: executive summary band — big number, quiet label, generous air */
.kpi-value { letter-spacing: -0.01em; line-height: 1.1; }

/* P&L semantics via theme tokens (dark-mode AA variants inherit) */
.pos, .val-pos, .delta-pos { color: var(--t-positive); }
.neg, .val-neg, .delta-neg { color: var(--t-loss); }

/* Status pills: softer fills, crisp text — never shouty */
.pill, .state-badge {
  border-radius: 4px; font-size: 10px; font-weight: 600;
  letter-spacing: .03em; padding: 1px 7px;
}

/* Buttons: consistent geometry, subtle transitions */
.btn-new, .btn-saveas, .btn-lib, .btn-export {
  border-radius: 5px;
  transition: background var(--g-duration-fast) var(--g-easing-standard),
              color var(--g-duration-fast) var(--g-easing-standard),
              border-color var(--g-duration-fast) var(--g-easing-standard);
}
.btn-new:hover, .btn-saveas:hover, .btn-lib:hover, .btn-export:hover {
  background: var(--t-sunken); color: var(--t-ink); border-color: var(--t-hairline-strong);
}
.btn-save, .btn-report {
  border-radius: 5px; font-weight: 600;
  transition: filter var(--g-duration-fast) var(--g-easing-standard);
}
/* Dark-mode AA fix: these primary buttons use background:var(--ink) + white text —
   in dark, --ink becomes near-white so white-on-white = invisible. Remap the fill
   to a theme-aware solid and keep white text (AA on both fills). */
.btn-save, .btn-report {
  background: var(--t-brand);
  color: var(--t-brand-ink);
}
html[data-theme='dark'] .btn-save,
html[data-theme='dark'] .btn-report { color: #0d1117; } /* brand red is light in dark */
.btn-save:hover, .btn-report:hover { filter: brightness(1.12); }

/* Theme toggle: full-width, icon-led */
#theme-toggle { width: 100%; text-align: center; }

/* Scrollbars: thin, themed (WebKit + Firefox) */
* { scrollbar-width: thin; scrollbar-color: var(--t-hairline-strong) transparent; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-thumb { background: var(--t-hairline-strong); border-radius: 4px; }
*::-webkit-scrollbar-track { background: transparent; }

/* Focus visibility for keyboard users — brand ring everywhere */
:focus-visible { outline: 2px solid var(--t-brand); outline-offset: 2px; }

/* Reduced motion respected */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* ── Shared component classes (Stage 0) ───────────────────────────
   Defined now, proved on the app shell + Profit Waterfall this stage; rolled
   out to the remaining result sections in a later staged diff (scope note
   above). Each is additive — none of these class names exist anywhere else
   in the stylesheet yet, so there is zero collision risk. */

/* section-block: eyebrow/heading + optional right-aligned status badge, atop
   a card body + optional reconcile/footer strip. Wraps the EXISTING .card
   markup — it does not require changing .card's own rules, just adding a
   heading row in front of it with this class. */
.section-block { display: flex; flex-direction: column; }
.section-block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);   /* single controlled heading-to-chart offset */
}
.section-block-eyebrow {
  font-family: var(--f-display);
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--g-text-slate);
  padding-left: var(--space-3);
  border-left: 3px solid var(--g-brand-red);
}
.section-block-status { flex-shrink: 0; }

/* data-table: caps header, labels left, numerics right in mono tabular,
   hairline row separators, totals row set apart by weight + a top hairline
   (never a filled background — the brief is explicit: "by weight + top
   hairline not fill"). */
.data-table { width: 100%; border-collapse: collapse; font-family: var(--f-body); font-size: var(--fs-body); }
.data-table thead th {
  font-family: var(--f-display);
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--g-text-slate);
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--g-hairline);
}
.data-table thead th.num { text-align: right; }
.data-table tbody td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--g-hairline); color: var(--g-chrome-ink); }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody td.num {
  text-align: right;
  font-family: var(--f-mono);
  font-size: var(--fs-data);
  font-variant-numeric: tabular-nums lining-nums;
}
.data-table tbody tr.total td { font-weight: 600; border-top: 1px solid var(--g-hairline); border-bottom: none; background: none; }

/* kpi-atom: label eyebrow + mono figure + optional delta/sub — the single
   reusable KPI shape, used by both the header strip and the sticky mirror. */
.kpi-atom { display: flex; flex-direction: column; gap: 2px; }
.kpi-atom-label {
  font-family: var(--f-display);
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--g-text-slate);
}
.kpi-atom-figure {
  font-family: var(--f-mono);
  font-size: var(--fs-kpi);
  font-weight: 600;
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--g-chrome-ink);
  line-height: 1.1;
}
.kpi-atom-sub { font-family: var(--f-body); font-size: var(--fs-caption); color: var(--g-text-slate); }

/* chart-frame: shared padding + guide hairlines for the waterfall now, and
   future charts later. Intentionally does NOT touch .wfsvg-wrap's existing
   rule — see the waterfall-specific spacing fix below, which folds label
   headroom into the SVG viewBox instead of DOM padding. */
.chart-frame { padding: 0 var(--space-4) var(--space-2); }
.chart-frame-guide { stroke: var(--g-hairline); stroke-width: 1; }

/* Motion: transform/opacity only, per Batch G tokens above. Honors
   prefers-reduced-motion by collapsing all durations to near-zero — this is
   additive (does not remove any existing transition property), matching the
   pattern already used for .results-sticky-kpi below. */
@media (prefers-reduced-motion: reduce) {
  .section-block, .kpi-atom, .chart-frame,
  .section-block *, .kpi-atom *, .chart-frame * {
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
  }
}

/* ── Stage 2: result tables (Pricing Ladder, Cost Build-Up, Tax Block) ──
   Layers onto reportCss's generic table / thead th / tbody selectors AND
   the .data-table rules above, using the EXISTING per-cell classes
   renderLadder / renderCost / renderTax already emit (class="r" numeric
   cells, class="muted" secondary text, class="ladder-current" the entered
   tier) -- no cell class renamed, only class="data-table" added to the
   <table> tag itself at each of the 4 call sites. Scope is exactly these
   4 tables; other tables in the interactive DOM (e.g. Sensitivities) do
   not carry this class and are unaffected. */
.data-table thead th { background: none; }
.data-table thead th.r { text-align: right; }
.data-table tbody tr { border-bottom: 1px solid var(--g-hairline); }
/* Dark-mode fix: base rule hardcodes cell text to --g-chrome-ink, which the dark
   theme remaps to a near-PANEL value (chrome surface color) — text vanished. Cell
   text must always be the readable ink token, never a chrome-surface token. */
html[data-theme='dark'] .data-table tbody td,
html[data-theme='dark'] .data-table thead th { color: var(--t-ink); }
html[data-theme='dark'] .data-table thead th { color: var(--t-ink-3); }
html[data-theme='dark'] .ladder-tier-pip { color: var(--t-ink-2); }
html[data-theme='dark'] .ladder-tier-pip::before { background: var(--t-hairline-strong); }
.data-table tbody tr:last-child { border-bottom: none; }
.data-table tbody tr:hover { background: none; }
.data-table tbody td.r {
  font-family: var(--f-mono);
  font-size: var(--fs-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--g-chrome-ink);
}
.data-table tbody td.muted { color: var(--g-text-slate); }

/* Entered/highlighted ladder tier: weight + hairline, never a heavy fill
   (brief explicit). Removes reportCss's .ladder-current 6-percent-opacity
   red wash; the existing thin left accent border and the existing bold
   row weight (both set by reportCss's own .ladder-current / .ladder-current
   td rules, untouched here) already carry the emphasis. */
.data-table .ladder-current { background: none; }

/* Status badges inside these tables (Recoverable-VAT, INDICATIVE,
   UNVERIFIED): shape only, same colors -- the taxonomy and which flag
   fires on which line is decided entirely in badge() / renderCost /
   renderTax (untouched); this only tightens the pill corner radius. */
.data-table .bdg { border-radius: 3px; }

/* Ladder scale bar frame: guide hairlines top/bottom only -- deliberately
   NOT touching horizontal padding (ladder-tier-pip / ladder-scale-tick
   position via left:X% relative to .ladder-scale-bar's own box, computed
   in ladderScale() -- untouched) or the existing vertical padding (tick
   label headroom). */
.ladder-scale-wrap.chart-frame {
  border-top: 1px solid var(--g-hairline);
  border-bottom: 1px solid var(--g-hairline);
}

/* ════ INTERACTIVE: full-viewport sidebar layout ══════════════════════════ */
html, body { height: 100%; overflow: hidden; }
body { display: flex; flex-direction: column; }
/* Typography (Batch G): kerning explicitly on — "no exceptions" per the
   typography skill, even though most browsers default it on for the fonts
   already in use here. Ligatures on too (fi/fl pairs in running prose like
   "financing"/"reflow"). reportCss's body rule doesn't set either. */
body { font-feature-settings: "kern" 1, "liga" 1; text-rendering: optimizeLegibility; }

/* Drawer toggle — hidden on wide screens */
.drawer-btn {
  display: none;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 16px;
  background: var(--white);
  border: none;
  border-bottom: 1.5px solid var(--border);
  cursor: pointer;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
  flex-shrink: 0;
}
.drawer-btn:hover { color: var(--ink); background: var(--bg); }
.drawer-arrow { margin-left: auto; font-size: 12px; }

/* App body: sidebar left, results right */
.app-body { flex: 1; display: flex; overflow: hidden; }

/* ── Sidebar ───────────────────────────────────────────────────── */
.sidebar {
  width: 290px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--white);
  border-right: 1.5px solid var(--border);
  overflow: hidden;
}

/* Tabs */
.sb-tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1.5px solid var(--border);
  background: var(--white);
}
.tab-btn {
  flex: 1;
  padding: 11px 0;
  background: none;
  border: none;
  border-bottom: 2.5px solid transparent;
  margin-bottom: -1.5px;
  font-family: var(--f-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
  cursor: pointer;
  transition: color .15s, border-color .15s;
}
.tab-btn:hover { color: var(--ink); }
.tab-btn.active { color: var(--red); border-bottom-color: var(--red); }

/* Scrollable content */
.sb-scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* Section groups */
.sb-sec { padding: 11px 13px; border-bottom: 1px solid var(--border); }
.sb-sec-title {
  font-family: var(--f-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: 9px;
}

/* Tier divider */
.tier-div {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 13px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.tier-div-lbl {
  font-family: var(--f-display);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: .10em;
  text-transform: uppercase;
  color: var(--g-text-slate); /* AA fix — was #94a3b8, 2.39:1 on canvas */
  white-space: nowrap;
}
.tier-div-line { flex: 1; height: 1px; background: var(--border); }

/* Disclosure / assumptions */
.disc-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 13px;
  background: var(--bg);
  border: none;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-family: var(--f-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--g-text-slate); /* AA fix — was #94a3b8, 2.39:1 on canvas */
  transition: color .12s;
}
.disc-btn:hover { color: var(--slate); background: #eef0f3; }
.disc-body { display: none; }
.disc-body.open { display: block; }

/* ── Input rows ────────────────────────────────────────────────── */
.ir {
  display: flex;
  flex-direction: column;
  margin-bottom: 7px;
}
.ir:last-child { margin-bottom: 0; }
.ir-lbl {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--f-body);
  font-size: 10px;
  color: var(--slate);
  margin-bottom: 3px;
  line-height: 1.2;
}
/* Status pip */
.pip {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  cursor: help;
}
.pip-ok   { background: #10b981; }
.pip-conf { background: #f59e0b; }
.pip-ind  { background: #94a3b8; }
.pip-ph   { background: #f59e0b; }
.pip-unv  { background: #f97316; }
.pip-none { width: 0; }

/* Inputs */
.si {
  font-family: var(--f-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 7px;
  width: 100%;
  box-sizing: border-box;
  font-variant-numeric: tabular-nums lining-nums;
  transition: border-color .12s, box-shadow .12s;
  appearance: textfield;
}
.si:focus {
  outline: none;
  border-color: var(--ink);
  box-shadow: 0 0 0 2px rgba(36,35,49,.10);
}
.si:hover:not(:focus) { border-color: #9ca3af; background: #fafafa; }
.si.ph { border-color: #fdba74; background: #fffbf0; }

.ss {
  font-family: var(--f-body);
  font-size: 12px;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 5px 7px;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.ss:focus { outline: none; border-color: var(--ink); }
.sr {
  font-family: var(--f-body);
  font-size: 12px;
  font-weight: 500;
  color: var(--slate);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 7px;
  width: 100%;
  box-sizing: border-box;
}

/* Primary tier: larger */
.ir.pri .si { font-size: 13px; padding: 6px 8px; font-weight: 600; }
.ir.pri .ir-lbl { font-size: 10.5px; font-weight: 600; color: var(--ink-60); }

/* ── Toggle switches ────────────────────────────────────────────── */
.tgl-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  outline: none;
  padding: 1px 0;
}
.tgl-wrap:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(36,35,49,.25); }
.tgl-track {
  flex-shrink: 0;
  width: 34px; height: 18px;
  background: #c9cdd4;
  border-radius: 9px;
  position: relative;
  transition: background .18s;
}
.tgl-track.on { background: var(--ink); }
/* Hedge toggles ON → green (active = safe/good state) */
.tgl-wrap[data-type="hedge"] .tgl-track.on { background: #10b981; }
.tgl-wrap[data-type="hedge"]:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(16,185,129,.30); }
/* Surcharge toggle ON → amber (caution: cost/risk) */
.tgl-wrap[data-type="surcharge"] .tgl-track.on { background: #f59e0b; }
.tgl-wrap[data-type="surcharge"]:focus-visible .tgl-track { box-shadow: 0 0 0 2px rgba(245,158,11,.30); }
.tgl-knob {
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,.22);
  transition: transform .18s;
}
.tgl-track.on .tgl-knob { transform: translateX(16px); }
.tgl-lbl {
  font-family: var(--f-body);
  font-size: 11px;
  font-weight: 500;
  color: var(--slate);
  transition: color .18s;
  line-height: 1;
}
.tgl-wrap[data-on="true"] .tgl-lbl { color: var(--ink); font-weight: 600; }
.tgl-set { display: flex; flex-direction: column; gap: 9px; }

/* Hedge tab: greyed disabled state */
.hedge-off { opacity: .38; pointer-events: none; }
.hedge-warn-note {
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 5px;
  color: #92400e;
  font-family: var(--f-body);
  font-size: 11px;
  padding: 7px 10px;
  margin-bottom: 10px;
  line-height: 1.4;
}
.hedge-off-note {
  font-family: var(--f-body);
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 10px;
  line-height: 1.4;
}

/* ── Sidebar footer ─────────────────────────────────────────────── */
.sb-footer {
  flex-shrink: 0;
  padding: 9px 13px;
  border-top: 1.5px solid var(--border);
  background: var(--white);
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-reset {
  flex: 1;
  padding: 6px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--f-body);
  font-size: 11px;
  color: var(--slate);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.btn-reset:hover { background: var(--bg); color: var(--ink); }
.state-badge {
  font-family: var(--f-display);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  border-radius: 3px;
  padding: 2px 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  display: inline-block;
}
.state-new      { color: var(--slate); background: var(--slate-bg); }
.state-saved    { color: #475569;      background: #f1f5f9; border: 1px solid #cbd5e1; }
.state-modified { color: #92400e;      background: #fef3c7; border: 1px solid #fbbf24; }

/* ── Results area ───────────────────────────────────────────────── */
/* .results-col holds the (always-reserved) sticky-KPI row + the actual
   scrolling .results box, stacked in a column. It occupies the flex slot
   .results used to occupy directly in .app-body (row layout desktop /
   column layout narrow — see .app-body media query below; unaffected
   either way since .results-col just inherits whichever role .results had). */
.results-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* flex-child scroll-clipping fix (Safari/Firefox) */
  overflow: hidden;
}
.results {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px 64px;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Sticky condensed KPI (Batch G) ──────────────────────────────────────
   Deliberately NOT position:sticky over .results' own scroll content.
   position:sticky only reserves ITS OWN row once, at its natural document
   position near the top — it does not create a repeating no-go zone for
   the rest of the scroll range, so once scrolled further, later content
   passes back UNDER the visually-pinned pill and gets hidden behind it
   (confirmed: it hid an UNVERIFIED status badge on a cost line). A first
   attempt at reserving space via padding-top on .results had the same
   flaw — padding is a one-time constant offset in document space, so it
   only delayed the overlap by a fixed amount instead of preventing it
   (re-verified by sweeping 12 scroll positions × 5 sections: overlaps
   still occurred well past the reserved amount).
   Fix that actually holds for the ENTIRE scroll range: the pill is a
   genuine FLEX SIBLING of .results (both inside .results-col above), so
   .results' own border-box is permanently a fixed amount shorter — and
   since overflow-y:auto clips .results' content strictly to its own box,
   that content can NEVER geometrically render outside it, at any
   scrollTop. The space is reserved unconditionally (not just once the
   pill is visible), so the opacity/transform reveal causes no layout
   shift — same "hidden until scrolled past threshold" UX as before,
   entrance-only, ease-out 200ms, transform+opacity only (GPU-friendly,
   motion-spec "tooltip appear" / "state change" bucket), no bounce/scale
   per the project's existing subtle-motion register. */
.results-sticky-kpi {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  align-self: flex-start;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: var(--space-2) var(--space-4);
  margin: 24px 28px 0;
  box-shadow: 0 2px 8px rgba(36,35,49,.08);
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  transition: opacity .2s cubic-bezier(0,0,0.2,1), transform .2s cubic-bezier(0,0,0.2,1);
}
.results-sticky-kpi.visible { opacity: 1; transform: translateY(0); }
.results-sticky-kpi-label {
  font-family: var(--f-display);
  font-size: var(--type-label);
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--role-slate);
}
.results-sticky-kpi-val {
  font-family: var(--f-display);
  font-size: var(--type-kpi);
  font-weight: 700;
  color: var(--role-ink);
  font-variant-numeric: tabular-nums lining-nums;
}
@media (prefers-reduced-motion: reduce) {
  .results-sticky-kpi { transition-duration: .01ms; }
}

/* Error banner */
.err-banner {
  background: #fff5f5;
  border: 1.5px solid #fca5a5;
  border-radius: 6px;
  color: #991b1b;
  font-family: var(--f-body);
  font-size: 12px;
  padding: 10px 16px;
}
.err-banner[hidden] { display: none; }

/* ── Waterfall — hand-rolled SVG bridge chart (Batch G) ───────────────────
   Replaces the old .wf-row card-row (now dead — see renderWaterfall). Bars
   float between cumulative running totals read directly from res; viewBox
   is a fixed logical 1000x220 coordinate system scaled responsively via
   width:100% (same technique as the existing ladder-scale bar's percentage
   positioning), so proportions hold at any rendered card width. */
.wfsvg-wrap { padding: 20px 24px 4px; }
.wfsvg { width: 100%; height: auto; display: block; overflow: visible; }
.wfsvg-zero  { stroke: var(--t-hairline-strong); stroke-width: 1; }
/* Connectors: solid, slightly stronger than hairline — the running-total thread
   the eye follows. Research consensus: connectors are what make a bridge readable. */
.wfsvg-guide { stroke: var(--t-hairline-strong); stroke-width: 1.25; stroke-dasharray: none; opacity:.85; }
.wfsvg-bar   { stroke-width: 0; rx: 2; }
/* Direction-coded bars (FT/consulting convention, restated in the legend):
   totals anchor in neutral panel ink; increases/decreases get muted directional
   fills with STRONG left-edge accent strokes so direction survives color-blindness
   (never color alone) and both themes. */
.wfsvg-bar-neutral  { fill: var(--t-sunken); stroke: var(--t-hairline-strong); stroke-width:1; }
.wfsvg-bar-up       { fill: color-mix(in srgb, var(--t-positive) 22%, var(--t-panel)); stroke:none; border-left:3px solid var(--t-positive); }
.wfsvg-bar-down     { fill: color-mix(in srgb, var(--t-loss) 22%, var(--t-panel)); stroke:none; }
.wfsvg-bar-terminal { fill: var(--t-ink); }
.wfsvg-bar-loss-terminal { fill: var(--t-loss); }
/* Direction ticks drawn INSIDE the bar edge as SVG lines (border-left doesn't
   work on SVG rects) — a 3px vertical accent at the bar's leading edge. */
.wfsvg-tick-up   { stroke: var(--t-positive); stroke-width: 4; stroke-linecap: round; }
.wfsvg-tick-down { stroke: var(--t-loss); stroke-width: 4; stroke-linecap: round; }
/* Legend: states the color convention (research rule — never assume the reader knows) */
.wfsvg-legend {
  display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
  padding: 2px 24px var(--space-3); font-size: var(--fs-caption); color: var(--t-ink-2);
}
.lg-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
.lg-total { background: var(--t-sunken); border: 1px solid var(--t-hairline-strong); }
.lg-up { background: color-mix(in srgb, var(--t-positive) 22%, var(--t-panel)); box-shadow: inset 3px 0 0 var(--t-positive); }
.lg-down { background: color-mix(in srgb, var(--t-loss) 22%, var(--t-panel)); box-shadow: inset 3px 0 0 var(--t-loss); }

/* Two-way heatmap grid: translucent pos/neg tints (same language as sensitivities heat) */
.hm { transition: background var(--g-duration-fast) var(--g-easing-standard); }
.hm-pos        { background: var(--heat-pos); }
.hm-pos-strong { background: var(--heat-pos-strong); font-weight: 600; }
.hm-neg        { background: var(--heat-neg); }
.hm-neg-strong { background: var(--heat-neg-strong); font-weight: 600; }
/* Font-size here is in SVG viewBox units, not screen px — it scales together
   with the bars as the chart's rendered width changes (intentional: text and
   geometry stay proportional, standard data-vis behavior), so this number is
   NOT one of the --type-* px tokens even though it looks like one. */
.wfsvg-value {
  font-family: var(--f-display);
  font-weight: 700;
  font-size: 15px;
  fill: var(--role-ink);
  font-variant-numeric: tabular-nums lining-nums;
}
.wfsvg-collabels { position: relative; padding: 0 24px var(--space-3); min-height: 46px; }
.wfsvg-collabel { position: absolute; top: 0; text-align: center; padding: 0 4px; box-sizing: border-box; }
.wfsvg-collabel-name {
  font-family: var(--f-display);
  font-size: var(--type-label);
  font-weight: 600;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--g-text-slate); /* AA fix — was --role-slate (#717c89), 4.25:1 at 10px */
}
.wfsvg-collabel-sub {
  font-family: var(--f-body);
  font-size: var(--type-body);
  color: var(--g-text-slate);
  margin-top: 3px;
  line-height: 1.3;
}

/* ── Hedge cards: side by side, each card heights independently ─── */
.hedge-cards { display: flex; flex-direction: row; gap: 16px; align-items: flex-start; }
.hedge-cards .h-card { flex: 1; min-width: 0; }
.h-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.h-card.on { border-color: rgba(16,185,129,.35); }
.h-card-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 18px;
  background: var(--bg);
}
.h-card-title {
  font-family: var(--f-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--slate);
}
.h-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 20px;
  font-family: var(--f-body);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  background: #f3f4f6;
  color: var(--slate);
  border: 1px solid var(--border);
  transition: all .18s;
}
.h-pill.on { background: rgba(16,185,129,.12); color: #059669; border-color: rgba(16,185,129,.40); }
.h-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
/* Detail expands on ON state */
.h-detail {
  max-height: 0;
  overflow: hidden;
  transition: max-height .3s ease;
}
.h-card.on .h-detail { max-height: 1000px; }
.h-detail-inner { padding: 14px 18px; border-bottom: 1px solid var(--border); }
/* Fix info-row layout in interactive card contexts (hedge detail + partner two-col) */
.h-detail .info-row,
.two-col-grid .info-row,
.h-cmp .info-row,
.info-block .info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
  line-height: 1.5;
}
.h-detail .info-row span,
.two-col-grid .info-row span { color: var(--slate); flex-shrink: 0; }
.h-detail .info-row b,
.two-col-grid .info-row b { font-variant-numeric: tabular-nums; text-align: right; word-break: break-word; }
.h-lock-warn {
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 5px;
  color: #92400e;
  font-family: var(--f-body);
  font-size: 11px;
  padding: 8px 12px;
  margin-bottom: 12px;
  line-height: 1.4;
  max-width: 65ch; /* typography: 45-90ch line length — this note renders inside the wide
                       Hedge Analysis card, not the narrow sidebar, so it actually needs the cap */
}
/* Unit-sanity guard: implausibly large fee/spread (likely a units typo). Deeper amber than the
   INDICATIVE notes so it reads as "stop and check", not a routine placeholder hint. */
.h-unit-warn {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-left: 3px solid #b45309;
  border-radius: 5px;
  color: #7c2d12;
  font-family: var(--f-body);
  font-size: 11px;
  font-weight: 600;
  padding: 8px 11px;
  margin: 2px 0 10px;
  line-height: 1.45;
}
/* Comparison: always visible */
.h-cmp {
  padding: 12px 18px;
  background: var(--white);
}
.h-cmp-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--f-body);
  font-size: 12px;
  padding: 2px 0;
}
.h-cmp-lbl { color: var(--slate); }
.h-cmp-val { font-weight: 600; font-variant-numeric: tabular-nums; }
.h-cmp-delta { font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── Live badge ─────────────────────────────────────────────────── */
.live-badge {
  display: inline-block;
  background: #d1fae5;
  color: #065f46;
  font-family: var(--f-body);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  border-radius: 3px;
  padding: 2px 5px;
  margin-left: 8px;
  vertical-align: middle;
}

/* ── Ladder price-scale bar ─────────────────────────────────────── */
.ladder-scale-wrap { padding: 8px 20px 52px; position: relative; }
.ladder-scale-bar {
  height: 24px;
  border-radius: 4px;
  background: linear-gradient(to right, #fee2e2 0%, #fef3c7 42%, #d1fae5 76%, #bbf7d0 100%);
  position: relative;
}
.ladder-scale-tick {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 2px;
  background: var(--ink);
  transform: translateX(-50%);
  border-radius: 1px;
}
.ladder-scale-tick::after {
  content: attr(data-label);
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: var(--f-body);
  font-size: 10px;
  font-weight: 600;
  color: var(--ink);
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 6px;
}
/* ladder-tier-pip now defined below cost-totals block with alt + ::before tick */

/* ── Ladder tier pips: below bar, alternating rows ─────────────── */
.ladder-tier-pip {
  position: absolute;
  top: calc(100% + 5px);
  transform: translateX(-50%);
  font-family: var(--f-display);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: rgba(0,0,0,.55);
  white-space: nowrap;
  pointer-events: none;
  line-height: 1;
}
.ladder-tier-pip.alt { top: calc(100% + 20px); }
.ladder-tier-pip::before {
  content: '';
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  width: 1px;
  height: 10px;
  background: rgba(0,0,0,.25);
  transform: translateX(-50%);
}
.ladder-tier-pip.alt::before { bottom: calc(100% + 20px); height: 25px; }

/* ── Cost totals block ──────────────────────────────────────────── */
.cost-totals {
  background: var(--bg);
  border-top: 2px solid var(--border);
  padding: 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cost-total-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--f-body);
  font-size: 12px;
}
.cost-total-row span { color: var(--slate); }
.cost-total-row b { font-variant-numeric: tabular-nums; }

/* ── Tax net-after highlight ────────────────────────────────────── */
.tax-net-box {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
}
.tax-net-box .lbl { font-family: var(--f-body); font-size: 12px; color: #166534; }
.tax-net-box .val { font-family: var(--f-display); font-size: 20px; font-weight: 700; color: #15803d; font-variant-numeric: tabular-nums lining-nums; }

/* ── Sens heat-map cell classes ─────────────────────────────────── */
.sh-pos  { background: var(--heat-pos); }
.sh-pos-s{ background: var(--heat-pos-strong); }
.sh-neg  { background: var(--heat-neg); }
.sh-neg-s{ background: var(--heat-neg-strong); }

/* ── Val-flash (preserved) ──────────────────────────────────────── */
@keyframes val-flash {
  0%   { background-color: rgba(212,29,29,.07); }
  100% { background-color: transparent; }
}
.val-flash { animation: val-flash .5s ease-out; }

/* KPI chip flash */
@keyframes kpi-flash {
  0%   { opacity: .5; }
  100% { opacity: 1; }
}
.kpi-flash { animation: kpi-flash .3s ease-out; }

/* ── Two-col cards inside results ───────────────────────────────── */
.two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.two-col-grid > div { min-width: 0; }
.two-col-card { background: var(--white); border: 1px solid var(--border); border-radius: 10px; padding: 20px 24px; }

/* ── Route segmented control (on hedge card header) ─────────────── */
.route-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; flex-shrink: 0; }
.seg-btn { padding: 3px 9px; font-family: var(--f-body); font-size: 10px; font-weight: 600; background: none; border: none; border-right: 1px solid var(--border); cursor: pointer; color: var(--slate); white-space: nowrap; transition: background .12s, color .12s; line-height: 1.4; }
.seg-btn:last-child { border-right: none; }
.seg-btn:hover { background: var(--bg); color: var(--ink); }
.seg-btn.seg-active { background: var(--ink); color: #fff; }

/* ── Storage line unit toggle (₦/L | $/MT) — mirrors the route segmented control ── */
.storage-unit-ctl { display: flex; align-items: center; gap: 8px; }
.storage-unit-ctl input { flex: 1; min-width: 0; }
.storage-unit-lbl { font-family: var(--f-body); font-size: 10px; font-weight: 700; color: var(--slate); }

/* ── Responsive: drawer at < 1000px ────────────────────────────── */
@media (max-width: 1000px) {
  .app-body { flex-direction: column; }
  .sidebar {
    width: 100%;
    max-height: 0;
    overflow: hidden;
    transition: max-height .35s ease;
    border-right: none;
    border-bottom: 1.5px solid var(--border);
    flex-shrink: 0;
  }
  .sidebar.open { max-height: 560px; overflow-y: auto; }
  .drawer-btn { display: flex !important; }
  .results { padding: 16px 14px 48px; }
  .two-col-grid { grid-template-columns: 1fr; }
  .hedge-cards { flex-direction: column; }
  .hedge-cards .h-card { min-width: unset; }
}

/* ════ SPACING SYSTEM — coherent rhythm across every interactive section ════

   Base unit: 4px.  Named steps used below:
     xs=4  sm=8  md=12  lg=16  xl=20  2xl=24  3xl=28  4xl=32
   All padding/gap/margin values snap to this grid.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 1. Header: full-bleed aligned to results band ─────────────────────────── */
/* reportCss uses max-width:1200px;margin:0 auto which floats the header content
   centered — at wide viewports it diverges from the sidebar+results layout.
   Override to remove that centering; use the same 28px padding as .results so
   the KPI chips' right edge aligns with the results area right edge.
   align-items:center from reportCss stays untouched.                              */
.header-inner {
  max-width: none;
  margin: 0;
  padding: 20px 28px;
}
/* Meta strip: same horizontal bounds as the header row                            */
.header-meta-inner {
  max-width: none;
  margin: 0;
  padding: 0 28px;
}
.kpi-chip { padding: 10px 16px; min-width: 126px; }
/* Batch F: Annualised Return + Ex-Ship Margin are a clear secondary pair next
   to the filled/green TIS Net Profit primary card. They already inherited the
   same unmodified .kpi-chip base (no kpi-accent/kpi-loss) — this makes that
   pairing an explicit, shared rule instead of "no class happens to match no
   class", so the two can't drift apart if either one later needs a one-off
   tweak that isn't deliberately applied to its pair too. Same min-width as
   the base .kpi-chip (no change) — width otherwise follows content so the
   longer "on bank LC mobilised · 45d lockup" sub-text isn't clipped. */
.kpi-chip.kpi-secondary { min-width: 126px; }

/* ── 2. Section headings: breathe above cards ────────────────────────────── */
.section-heading { margin-bottom: 14px; }

/* ── 3. Sidebar: 4px-grid alignment throughout ───────────────────────────── */
.sb-sec         { padding: 12px 16px; }
.sb-sec-title   { margin-bottom: 10px; }
.tier-div       { padding: 6px 16px; }
.disc-btn       { padding: 8px 16px; }
.sb-footer      { padding: 10px 16px; }
.ir             { margin-bottom: 8px; }
.tab-btn        { padding: 12px 0; }
.tgl-set        { gap: 10px; }

/* ── 4. Waterfall reconcile line: proper text flow ────────────────────────
   (the .wf-row/.wf-box overrides that used to live here are gone — Batch G
   replaced the card-row markup with an SVG bridge chart; see the new
   .wfsvg-* rules above. The underlying .wf-box/.wf-deduct/etc classes in
   reportCss are NOT consumed by the PDF — report-pdf-renderer.js has its own
   independent waterfall markup (.wf-node/.wf-op/.wf-amt/.wf-sub in its own
   PDF_CSS, Stage 9), and no other surface emits .wf-box markup either (grep
   confirms zero HTML call sites across the repo). Main's independent
   "Batch G v2" card color system, which restyled the now-defunct .wf-box
   card markup for this dashboard, was dropped as dead code during the
   dashboard-dataviz-batch-g / main merge: the dashboard no longer emits
   .wf-box divs at all, so those overrides had no matching markup left to
   target. The .wf-box rules in reportCss are themselves dead CSS with no
   remaining consumer — left in place, out of this stage's scope.) */
/* reportCss uses display:flex+gap on .wf-reconcile but content is inline;
   override to block so text wraps naturally with consistent line spacing.
   Promoted to section-header weight (ink, semibold, --type-value) — was
   small slate/gray afterthought text (--ink-60, 12px, no weight) for a line
   that states whether the trade's numbers actually reconcile. */
.wf-reconcile {
  display: block;
  padding: var(--space-3) var(--space-6);
  line-height: 1.7;
  font-size: var(--type-value);
  font-weight: 600;
  color: var(--role-ink);
}

/* ── 5. Cost Build-Up totals: standard card padding, row breathing ───────── */
/* Batch F: snapped onto the --space-*/--type-* token scale (step 1) — values
   that didn't land exactly on a token (14px, 2px, 6px) move to the nearest
   one rather than staying as one-off magic numbers. Small (≤2px) spacing
   shifts only; no figure/number is affected. */
.cost-totals      { padding: var(--space-4) var(--space-6); gap: var(--space-2); }
.cost-total-row   { padding: var(--space-1) 0; }

/* ── 6. Partner Deliverables — all three missing style definitions ────────── */
/* .info-block separates logical groups within each column                   */
.info-block            { margin-bottom: var(--space-4); }
.info-block:last-child { margin-bottom: 0; }

/* .info-sub is the sub-heading for each group ("(1) Product Received" etc.) */
.info-sub {
  font-family: var(--f-display);
  font-size: var(--type-label);
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

/* .tie-out-box is the principal reconciliation callout at the card bottom.
   Batch F: unified with the cost-table recoverable badge and the waterfall
   reconcile line — same "verified / ties out" signal everywhere is now a
   single .bdg pill, not a separately-colored box. The box itself stays
   neutral in both states; only the pill (already bdg-recoverable / bdg-confirm,
   shared with the other two surfaces) carries the ok/mismatch color. */
.tie-out-box {
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-radius: 8px;
  font-family: var(--f-body);
  font-size: var(--type-body);
  line-height: 1.5;
  border: 1.5px solid var(--border);
  background: var(--bg);
  color: var(--ink-60);
}
.tie-out-box b { color: inherit; font-weight: 600; }

/* Info rows in partner two-col-grid and hedge detail: more vertical padding  */
.h-detail .info-row,
.two-col-grid .info-row { padding: var(--space-1) 0; }

/* ── 7. Hedge cards: more space throughout ───────────────────────────────── */
/* Batch F: snapped onto the token scale, same as the Cost Build-Up totals
   block above — 14px/3px didn't land on a token so move to the nearest one. */
.hedge-cards    { gap: var(--space-5); }
.h-card-hdr     { padding: var(--space-4) var(--space-5); }
.h-detail-inner { padding: var(--space-4) var(--space-5); }
.h-cmp          { padding: var(--space-4) var(--space-5); }
.h-cmp-row      { padding: var(--space-1) 0; }

/* ── Costs tab: two-column field grid (Batch F) ──────────────────────────────
   Port & Cargo Dues / Maritime Levies / Cargo & Services / Banking & Admin
   were single-column stacked .ir rows, full sidebar width, for short
   $/MT-or-% fields that don't need it. Two columns halves the section height
   without crowding the (already small, 10px) labels. Gutter uses the token
   scale; .ir's own column layout (label stacked above input) is untouched —
   it just becomes a grid item instead of a full-width flex child. Storage
   isn't included — its rows carry a unit-toggle control the simple field
   pattern doesn't, so it stays single-column. */
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: var(--space-3);
}

/* ── 8. Sensitivities / tornado: breathing room ──────────────────────────── */
.tn-wrap            { padding: 24px 24px 8px; }
.tn-baseline-label  { padding: 12px 0 8px; margin-top: 12px; }

/* ── Tornado rows — hand-rolled SVG diverging bars (Batch G) ─────────────────
   Replaces the old .tn-row/.tn-bars/.tn-half/.tn-bar CSS-width-div bars (now
   dead in this file — reportCss's own .tn-* classes are untouched, the PDF's
   tornado still uses them). Same grid layout (150px label | 1fr bars), same
   BAR proportion as before, just drawn as SVG <rect>s. The inside/outside
   label placement (renderTornadoRow) moved off the old flat THRESH cutoff to
   a width-aware check in Stage 8 — see that function's own comment. */
.tnsvg-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-2);
}
.tnsvg-label {
  font-family: var(--f-body);
  font-size: var(--type-input);
  color: var(--role-ink);
  text-align: right;
  padding-right: var(--space-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tnsvg-bars { width: 100%; height: 26px; display: block; }
.tnsvg-spine { stroke: var(--border); stroke-width: 2; }
.tnsvg-bar-neg { fill: #fee2e2; }
.tnsvg-bar-pos { fill: #d1fae5; }
.tnsvg-val {
  font-family: var(--f-body);
  font-size: var(--type-body);
  font-weight: 600;
  font-variant-numeric: tabular-nums lining-nums;
}
/* C1 (Batch C, carried forward): expected structural negatives (sensitivity
   deltas) read slate/neutral, never alarm-red — same colors as the prior
   .tn-neg .tn-val / .tn-neg-val overrides this replaces. */
.tnsvg-val-neg              { fill: var(--role-slate); }
.tnsvg-val-neg.tnsvg-val-in { fill: #4b5563; }
.tnsvg-val-pos               { fill: #065f46; }

/* ════ NEW-FEATURE STYLES ════════════════════════════════════════════════════ */

/* ── Text inputs share .si but don't need spinner removal ─────────────────── */
.si[type="text"] { -webkit-appearance: auto; appearance: auto; }

/* ── Sidebar footer: 3-row column layout ───────────────────────────────────── */
/* Override old .sb-footer (display:flex;align-items:center;gap:8px;padding:9px 13px)
   and the spacing-system override (padding:10px 16px). Rows own their padding. */
.sb-footer {
  flex-shrink:0; display:flex; flex-direction:column; align-items:stretch;
  padding:0; gap:0; border-top:1.5px solid var(--border); background:var(--white);
  overflow:hidden; box-sizing:border-box; width:100%;
}
.sb-footer-row1 {
  display:flex; align-items:center; gap:6px; padding:9px 14px 6px;
  box-sizing:border-box; width:100%; overflow:hidden;
}
.sb-state-row   {
  padding:4px 14px 6px; border-bottom:1px solid var(--border);
  box-sizing:border-box; width:100%; overflow:hidden;
}
.sb-footer-row2 {
  display:flex; align-items:center; gap:5px; padding:8px 14px;
  box-sizing:border-box; width:100%; overflow:hidden;
}
.sb-report-row {
  padding:0 14px 10px; box-sizing:border-box; width:100%; overflow:hidden;
}
.btn-report {
  display:block; width:100%; padding:8px 12px; background:var(--ink); border:none;
  border-radius:4px; font-family:var(--f-body); font-size:11px; font-weight:600;
  letter-spacing:.02em; color:#fff; cursor:pointer; transition:background .12s;
  white-space:nowrap; box-sizing:border-box;
}
.btn-report:hover { background:#3a3545; }

.btn-new {
  flex:1; padding:5px 8px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; transition:background .12s, color .12s; white-space:nowrap;
}
.btn-new:hover { background:var(--bg); color:var(--ink); }

.btn-save {
  padding:5px 12px; background:var(--ink); border:none; border-radius:4px;
  font-family:var(--f-body); font-size:11px; font-weight:600; color:#fff;
  cursor:pointer; transition:background .12s; white-space:nowrap;
}
.btn-save:hover { background:#3a3545; }

.btn-saveas {
  padding:5px 9px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; transition:background .12s, color .12s; white-space:nowrap;
}
.btn-saveas:hover { background:var(--bg); color:var(--ink); }

.btn-lib {
  padding:5px 8px; background:none; border:1px solid var(--border); border-radius:4px;
  font-family:var(--f-body); font-size:12px; color:var(--slate); cursor:pointer;
  flex-shrink:0; transition:background .12s, color .12s, border-color .12s;
}
.btn-lib:hover { background:var(--bg); color:var(--ink); }
.btn-lib-del:hover { background:var(--slate-bg); color:var(--ink); border-color:var(--slate); }

.sb-export-row {
  display:flex; align-items:center; gap:6px; padding:0 14px 10px;
  box-sizing:border-box; width:100%; overflow:hidden;
}
.btn-export {
  flex:1; padding:5px 8px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; transition:background .12s, color .12s; white-space:nowrap;
}
.btn-export:hover { background:var(--bg); color:var(--ink); }

.lib-select {
  flex:1; font-family:var(--f-body); font-size:11px; color:var(--ink);
  background:var(--white); border:1px solid var(--border); border-radius:4px;
  padding:5px 6px; cursor:pointer; min-width:0; max-width:100%; overflow:hidden;
  text-overflow:ellipsis; box-sizing:border-box;
}
.lib-select:focus { outline:none; border-color:var(--ink); }

/* ── House defaults button + banner (Costs tab) ──────────────────────────── */
.btn-defaults {
  width:100%; padding:7px 10px; background:none; border:1px solid var(--border);
  border-radius:4px; font-family:var(--f-body); font-size:11px; color:var(--slate);
  cursor:pointer; text-align:left; transition:background .12s, color .12s;
}
.btn-defaults:hover { background:var(--bg); color:var(--ink); }
/* typography: 45-90ch line length. .defaults-note appears in both the narrow
   sidebar (already well under 65ch, so this is a no-op there) and the wide
   results-pane cards (Hedge Analysis), where it actually needs the cap. */
.defaults-note { font-family:var(--f-body); font-size:10px; color:#94a3b8; line-height:1.5; margin-top:5px; max-width: 65ch; }
.costs-tab-banner {
  padding:8px 16px 7px; background:#f8fafc; border-bottom:1px solid var(--border);
  font-family:var(--f-body); font-size:10px; color:#94a3b8; line-height:1.5;
}

/* ── Per-trade chip in section title ─────────────────────────────────────── */
.per-trade-tag {
  display:inline-block; margin-left:6px; padding:1px 5px;
  background:var(--bg); border:1px solid var(--border); border-radius:3px;
  font-family:var(--f-display); font-size:7.5px; font-weight:700;
  letter-spacing:.08em; text-transform:uppercase; color:#94a3b8;
  vertical-align:middle;
}

/* ── FX rate role tags (settlement vs reference) ─────────────────────────── */
.rate-tag {
  display:inline-block; margin-left:6px; padding:1px 5px; border-radius:3px;
  font-family:var(--f-display); font-size:7.5px; font-weight:700;
  letter-spacing:.06em; text-transform:uppercase; vertical-align:middle;
}
/* settlement / P&L driver — green (positive / active, per palette) */
.rate-settle { background:#dcfce7; color:#15803d; border:1px solid #86efac; }
/* reference only — neutral slate, visibly secondary */
.rate-ref    { background:var(--bg); color:#717c89; border:1px solid var(--border); }

/* ── C4 (Batch C) / D2 (Batch D): 3-state taxonomy badge overrides ─────────── */
/* Defensive: keep bdg-placeholder styled amber even though badge() no longer emits it */
:root { --placeholder-c: #92400e; --placeholder-bg: #fef3c7; }
.bdg.bdg-placeholder { color: #92400e !important; background: #fef3c7; }
/* INDICATIVE: amber — reasonable estimate, fine to model */
.bdg.bdg-indicative  { color: #92400e; background: #fef3c7; }
/* UNVERIFIED: deeper amber — needs checking before live trade */
.bdg.bdg-unverified  { color: #7c2d12; background: #fed7aa; }
/* pip-ind: amber dot (override reportCss slate) */
.pip-ind { background: #f59e0b; }

/* ── D3: Status legend ──────────────────────────────────────────────────────── */
.status-legend {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  font-family: var(--f-body); font-size: var(--fs-label); color: var(--g-text-slate);
  padding: 8px 12px; border-top: 1px solid var(--g-hairline); margin-top: 2px;
}
.status-legend .sl-item { display: flex; align-items: center; gap: 5px; }
.status-legend .sl-check { color: #10b981; font-size: 11px; font-weight: 700; }
.status-legend .sl-key { font-weight: 600; color: var(--g-chrome-ink); }
.status-legend .bdg { font-size: var(--fs-label); padding: 1px 5px; border-radius: 3px; }

/* ── Empty state (blank/new trade — insufficient inputs to compute) ─────────── */
.empty-state-section { min-height: 260px; display:flex; align-items:center; justify-content:center;
  border:none; background:none; box-shadow:none; padding:0; }
.empty-state { text-align:center; padding:48px 24px; }
.empty-state-title { font-family:var(--f-display); font-size:var(--fs-value); font-weight:600;
  color:var(--g-chrome-ink); margin:0 0 6px; letter-spacing:0; }
.empty-state-sub { font-family:var(--f-body); font-size:var(--fs-caption); color:var(--g-text-slate); margin:0 auto; max-width: 65ch; }

/* ── C1: Expected negative figures → slate/neutral, not alarm-red ─────────── */
/* .neg is used for expected structural negatives (hedge cost, sensitivity deltas).
   .loss is for actual P&L losses (TIS Net negative at a pricing tier). */
.neg { color: #717c89; }
.loss { color: #991b1b; }
/* Sensitivity heat text: light-theme values below; dark theme remaps via tokens
   (heat fills are translucent color-mixes, so fixed grays fail AA on dark). */
.sens-neg        { background: var(--heat-neg); color: #4b5563; font-weight: 600; }
.sens-neg-strong { background: var(--heat-neg-strong); color: #374151; font-weight: 700; }
html[data-theme='dark'] .sens-neg        { color: var(--t-ink-2); }
html[data-theme='dark'] .sens-neg-strong { color: var(--t-ink); }
html[data-theme='dark'] .data-table tbody td.r.sens-pos        { color: var(--t-positive); }
html[data-theme='dark'] .data-table tbody td.r.sens-pos-strong { color: var(--t-positive); font-weight:700; }
html[data-theme='dark'] .data-table tbody td.r.sens-neg        { color: var(--t-loss); }
html[data-theme='dark'] .neg { color: var(--t-ink-3); }
/* Subtle separator between lever groups in the sensitivities table (each lever's +/- pair) */
.sens-group-start td { border-top: 2px solid var(--g-hairline); }
/* .tn-neg .tn-val / .tn-neg-val (old CSS-bar tornado overrides) removed —
   Batch G replaced the markup with .tnsvg-val-neg, defined alongside the rest
   of the .tnsvg-* tornado rules above, same colors. */

/* ── Toast ───────────────────────────────────────────────────────────────── */
.tis-toast {
  position:fixed; bottom:20px; left:50%;
  transform:translateX(-50%) translateY(60px);
  background:var(--ink); color:#fff;
  font-family:var(--f-body); font-size:12px;
  padding:8px 18px; border-radius:6px;
  z-index:9999; transition:transform .22s ease, opacity .22s ease;
  opacity:0; pointer-events:none; white-space:nowrap; box-shadow:0 4px 12px rgba(0,0,0,.18);
}
.tis-toast.visible { transform:translateX(-50%) translateY(0); opacity:1; }

/* ════ Per-leg revenue editor ═════════════════════════════════════════════ */
.leg-editor { display:flex; flex-direction:column; gap:8px; }
.leg-row {
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:6px 8px;
  padding:9px 32px 10px 10px;  /* right: 32px reserves space for the × button */
  border:1px solid var(--border);
  border-radius:7px;
  background:var(--white);
  position:relative;
  box-sizing:border-box;
}
.leg-row .leg-field { display:flex; flex-direction:column; gap:3px; min-width:0; }
.leg-row .leg-field.full { grid-column:1 / -1; }
.leg-field-lbl {
  font-family:var(--f-display); font-size:9px; font-weight:700;
  letter-spacing:.07em; text-transform:uppercase; color:var(--slate);
}
.leg-row select.leg-in, .leg-row input.leg-in {
  width:100%; box-sizing:border-box;
  padding:6px 8px; font-family:var(--f-body); font-size:13px;
  border:1px solid var(--border); border-radius:5px; background:#fff; color:var(--ink);
}
.leg-row select.leg-in:disabled { background:#f3f4f6; color:var(--slate); cursor:not-allowed; }
.leg-row input.leg-in:focus, .leg-row select.leg-in:focus {
  outline:none; border-color:var(--ink); box-shadow:0 0 0 2px rgba(36,35,49,.10);
}
.leg-qty-group { display:flex; gap:6px; }
.leg-qty-group input.leg-in { flex:1; min-width:0; }
.leg-qty-group select.leg-in { flex:0 0 64px; }
.leg-row .leg-del {
  position:absolute; top:6px; right:7px;
  width:20px; height:20px; line-height:18px; text-align:center;
  border:none; background:transparent; color:var(--slate);
  font-size:16px; cursor:pointer; border-radius:4px;
}
.leg-row .leg-del:hover { background:#f3f4f6; color:#991b1b; }
.leg-foot { display:flex; align-items:center; justify-content:space-between; margin-top:9px; gap:10px; }
.leg-add {
  padding:7px 13px; font-family:var(--f-display); font-size:11px; font-weight:700;
  letter-spacing:.04em; color:var(--ink); background:var(--white);
  border:1px dashed var(--slate); border-radius:6px; cursor:pointer;
}
.leg-add:hover { background:#f3f4f6; border-color:var(--ink); }
.leg-total { font-family:var(--f-body); font-size:12px; text-align:right; line-height:1.35; }
.leg-total b { font-family:var(--f-display); font-weight:700; }
.leg-total.ok   { color:#15803d; }
.leg-total.bad  { color:#92400e; }
.leg-total .leg-total-flag { font-weight:700; }
/* Unpriced leg — calm amber cue (same language as hedge placeholders); P&L stays pending. */
.leg-in.leg-in-pending { border-color:#f59e0b; background:#fffbeb; }
.leg-price-flag { color:#92400e; font-weight:700; font-size:9px; letter-spacing:.04em; }
.leg-ngn-equiv { font-family:var(--f-body); font-size:10px; color:#94a3b8; margin-top:2px; display:block; min-height:13px; }
.ladder-ngn-equiv { color:var(--slate); font-weight:400; font-size:11px; white-space:nowrap; }

/* Per-leg native-currency ladders */
.ladder-sub { font-family:var(--f-display); font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--slate); margin:18px 20px 8px; }
.ladder-compare { margin:14px 20px 0; padding:10px 13px; background:#f8fafc; border:1px solid var(--border); border-radius:7px; font-family:var(--f-body); font-size:12px; color:var(--ink); line-height:1.5; }
.ladder-compare b { font-family:var(--f-display); }
.ladder-compare .lc-rationale { color:var(--slate); font-size:11px; }

/* ════════════════════════════════════════════════════════════════════════
   STAGE 0 FOUNDATION — app shell + Profit Waterfall reference implementation
   Applies the Stage 0 tokens/component classes above to: header, sticky KPI
   strip, left rail (sidebar), footer, and the Profit Waterfall. Placed last
   in the stylesheet so it wins the cascade over the earlier reportCss/Batch F/
   Batch C rules it re-skins (equal-or-lower specificity, later source order).
   No engine output, data binding, or JS logic is touched by anything below —
   CSS + one markup-free spacing fix only. ═══════════════════════════════ */

/* ── App header: canvas/chrome roles + raised type floor ─────────────────── */
.report-header { background: var(--g-chrome-ink); }
.trade-name { font-family: var(--f-display); font-size: var(--fs-heading); font-weight: 600; color: var(--g-chrome-ink-inverse); }
.trade-id { font-family: var(--f-body); font-size: var(--fs-caption); }
.header-meta-inner { font-family: var(--f-body); font-size: var(--fs-caption); }
.kpi-chip { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); }
.kpi-label { font-family: var(--f-display); font-size: var(--fs-label); }
.kpi-value {
  font-family: var(--f-mono);
  font-size: var(--fs-kpi);
  font-weight: 600;
  font-variant-numeric: tabular-nums lining-nums;
}
.kpi-sub { font-family: var(--f-body); font-size: var(--fs-caption); }
/* KPI chip flash now rides the Stage 0 motion tokens (opacity-only, unchanged
   visual) instead of the old hardcoded .3s ease-out — same effect, named
   duration/easing so future chips inherit the same rhythm automatically. */
.kpi-flash { animation: kpi-flash var(--g-duration-surface) var(--g-easing-standard); }

/* ── Sticky condensed KPI mirror: same raised floor + mono figure ─────────── */
.results-sticky-kpi-label { font-size: var(--fs-label); }
.results-sticky-kpi-val {
  font-family: var(--f-mono);
  font-size: var(--fs-kpi);
  font-variant-numeric: tabular-nums lining-nums;
}
.results-sticky-kpi {
  transition: opacity var(--g-duration-surface) var(--g-easing-standard),
              transform var(--g-duration-surface) var(--g-easing-standard);
}

/* ── Left rail (sidebar): Stage 0 raised type floor off 9/11px ─────────────
   .ir/.si/.ss/.sr keep their existing box model (padding/border/radius) —
   only font-size moves onto the Stage 0 scale, so field-row heights shift by
   a px or two at most, no layout rewrite. */
.tab-btn { font-size: var(--fs-label); }
.sb-sec-title { font-size: var(--fs-label); }
.tier-div-lbl { font-size: var(--fs-label); }
.disc-btn { font-size: var(--fs-label); }
.lib-select { font-size: var(--fs-caption); }

/* ── Left rail: Stage 1 field-row grammar ───────────────────────────────
   ir()/ni()/ti()/si()/tog() (the ONE set of helper functions that emits
   every Deal/Costs/Hedge tab field, including the ICE Gasoil swap panel)
   still emit the exact same .ir/.ir-lbl/.si/.ss/.sr/.pip/.si.ph DOM hooks —
   JS reads/toggles these class names for pip-state and placeholder logic
   (build-interactive-field-status.md) and is NOT touched this stage. This
   block re-skins those existing classes onto the Stage 0 field-row grammar
   (label eyebrow + input + status pip + unit) via CSS only, so the same
   pass covers all three tabs and the hedge panel without a markup rewrite. */
.ir-lbl {
  font-size: var(--fs-label);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--g-text-slate);
}
/* Primary-tier fields (ICE, FOB) stay visually emphasized — full ink instead
   of the old --ink-60 (rgba ink @ 60%, ~4.19:1 on white, below AA-normal);
   swapping to solid --g-chrome-ink both strengthens the intended emphasis
   and clears AA, without touching the shared --ink-60 token used elsewhere. */
.ir.pri .ir-lbl { font-size: var(--fs-caption); font-weight: 700; color: var(--g-chrome-ink); }
.si, .ss, .sr { font-size: var(--fs-input); }
.si { font-variant-numeric: tabular-nums lining-nums; }
/* Mono figures for numeric fields only — ni() always renders type="number",
   ti() (free-text: trade name/partner/supplier/inspector) always renders
   type="text"; both share the .si class, so this type-selector is the only
   way to split mono-numeric from prose without touching ni()/ti() JS. */
input[type="number"].si { font-family: var(--f-mono); }

/* Focus-visible parity: .si already had a focus ring (box-shadow, pre-
   existing); .ss (select) and .seg-btn (segmented control) had none before
   this stage — both get the same ink ring language. */
.ss:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(36,35,49,.10); }
.seg-btn:focus-visible { outline: 2px solid var(--g-chrome-ink); outline-offset: -2px; }

/* Segmented controls (.route-seg/.seg-btn): hairline border + ink active
   fill (already true, no gradient/glow) — moved onto tokens + the shared UI
   motion duration (was untimed background/color transitions). */
.route-seg { border-color: var(--g-hairline); }
.seg-btn {
  font-size: var(--fs-label);
  color: var(--g-text-slate);
  border-color: var(--g-hairline);
  transition: background var(--g-duration-ui) var(--g-easing-standard),
              color var(--g-duration-ui) var(--g-easing-standard);
}
.seg-btn.seg-active { background: var(--g-chrome-ink); }

/* Toggles (.tgl): ink active fill (already true, no gradient/glow) — moved
   onto the shared UI motion duration (was .18s = 180ms, over the 160ms
   ceiling; now 160ms flat, matching --g-duration-ui exactly). */
.tgl-lbl { font-size: var(--fs-caption); }
.tgl-track { transition: background var(--g-duration-ui) var(--g-easing-standard); }
.tgl-knob { transition: transform var(--g-duration-ui) var(--g-easing-standard); }
.tgl-lbl { transition: color var(--g-duration-ui) var(--g-easing-standard); }

@media (prefers-reduced-motion: reduce) {
  .seg-btn, .tgl-track, .tgl-knob, .tgl-lbl {
    transition-duration: .01ms !important;
  }
}

/* ── Footer: raised type floor + visible keyboard focus on all footer
   controls (New/Save/Save As/library dropdown/rename/delete/report) — none
   of these had an explicit :focus-visible ring before; browser default
   outline was the only cue. Ring uses the chrome-ink role, 2px offset,
   consistent with .si:focus's existing box-shadow ring language. ────────── */
.btn-new, .btn-save, .btn-saveas, .btn-lib, .btn-export, .btn-report, .lib-select {
  font-size: var(--fs-caption);
}
.btn-new:focus-visible, .btn-save:focus-visible, .btn-saveas:focus-visible,
.btn-lib:focus-visible, .btn-export:focus-visible, .btn-report:focus-visible,
.lib-select:focus-visible, .tab-btn:focus-visible {
  outline: 2px solid var(--g-chrome-ink);
  outline-offset: 2px;
}

/* ── Profit Waterfall: single controlled heading-to-chart offset ──────────
   BEFORE: #wf-h's .section-heading margin-bottom (14px) + .wfsvg-wrap's own
   top padding (20px) stacked as two separate DOM gaps, on top of the SVG's
   already-generous internal padTop (chart geometry, unchanged) — the visible
   gap above the first bar was the SUM of three independent numbers nobody
   was reading as one rhythm unit. AFTER: the heading's margin-bottom is
   zeroed (ID selector beats the shared .section-heading class, no !important
   needed) and .wfsvg-wrap's top padding becomes the SOLE offset, set to one
   named spacing token — a single number controls the whole gap. The SVG's
   own padTop=36 (of a 220-unit viewBox) already contains enough headroom for
   the highest bar's value label without ever going negative (verified: the
   tallest bar's top is always exactly at padTop, by construction of
   buildWaterfallSteps' domain), so no viewBox/geometry change was needed —
   this is framing only, per scope; bar geometry, computed values, and the
   terminal-bar-only fill are byte-for-byte unchanged. */
#wf-h { margin-bottom: 0; }
#wf-h + .card .wfsvg-wrap { padding: var(--space-5) var(--space-4) var(--space-1); }
.wfsvg-value { font-family: var(--f-mono); }
.wfsvg-collabel-name { font-size: var(--fs-label); }
.wfsvg-collabel-sub { font-size: var(--fs-caption); }

/* ── Stage 3: Partner/Equity + Hedge Analysis, unified summary-strip ──────
   One flat treatment for section bottom-line blocks: hairline-top + a
   subtle neutral tint, never a heavy border box or semantic-color fill.
   Applied via an added class (markup only, no rows renamed) to the Partner
   principal tie-out box, the Hedge comparison block, and retrofitted onto
   .cost-totals (deferred from Stage 2 as a distinct UI primitive) so all
   three read identically. Compound selectors so this wins the cascade
   regardless of position relative to each block's own base rule above. */
.tie-out-box.summary-strip {
  border: none;
  border-top: 1px solid var(--g-hairline);
  border-radius: 0;
  background: var(--g-canvas);
}
.h-cmp.summary-strip {
  border: none;
  border-top: 1px solid var(--g-hairline);
  background: var(--g-canvas);
}
.cost-totals.summary-strip {
  border: none;
  border-top: 1px solid var(--g-hairline);
  background: var(--g-canvas);
}

/* Partner/Hedge info-row grammar: label left in --g-text-slate (AA-fixed
   token, Stage 1), figure right in --f-mono with tabular-nums lining-nums.
   Reuses the EXISTING .info-row markup (the infoRow() helper already used
   throughout renderPartner/renderHedge) -- only the color/font tokens move,
   no cell class renamed. Extends coverage to .h-cmp's rows (Stage 3 moves
   those onto the same .info-row markup, see cmpBlock() below). */
.h-detail .info-row span,
.two-col-grid .info-row span,
.h-cmp .info-row span {
  color: var(--g-text-slate);
}
.h-detail .info-row b,
.two-col-grid .info-row b,
.h-cmp .info-row b {
  font-family: var(--f-mono);
  font-size: var(--fs-data);
  font-variant-numeric: tabular-nums lining-nums;
  color: var(--g-chrome-ink);
}
.h-cmp .info-row { padding: var(--space-1) 0; }

/* Semantic direction, scoped to the hedge-comparison figures only (does
   NOT touch the page-wide .pos/.neg/.loss classes -- .neg is deliberately
   slate elsewhere per Batch C, "expected structural negative", a separate
   concern from this stage's brief). Any hedge-comparison figure that can
   go negative (TIS net, hedge-value delta) renders loss-red when negative,
   ink when positive -- the sign glyph (fmtUsd's leading "−", fmtUsdSign's
   "+"/"−") is always present too, so direction never depends on color
   alone. Compound selectors beat the unscoped reportCss .pos (green) /
   this file's own .neg (slate) rules. */
.h-cmp .info-row b.h-cmp-val.neg,
.h-cmp .info-row b.h-cmp-delta.neg { color: var(--g-loss); }
.h-cmp .info-row b.h-cmp-val.pos,
.h-cmp .info-row b.h-cmp-delta.pos { color: var(--g-chrome-ink); }

/* Hedge card title: onto the same eyebrow-label token pair as the
   data-table headers (Stage 2) / section-block eyebrow (Stage 0), instead
   of a raw 11px/--slate pair. */
.h-card-title { font-size: var(--fs-label); color: var(--g-text-slate); }

/* Route/basis-risk note text inside Hedge Analysis only (scoped to
   .hedge-cards so the sidebar's other .defaults-note instances -- Deal/
   Costs/Hedge tab field notes, Stage 1 territory -- are untouched): onto
   the caption token + AA-fixed slate instead of the raw 10px/#94a3b8 pair. */
.hedge-cards .defaults-note { font-size: var(--fs-caption); color: var(--g-text-slate); }

/* ── Stage 4: Sensitivities heat table, status legend, empty/pending states ──
   The Sensitivities table gained class="data-table" this stage (Step 2, same
   dual-class pattern as Stage 2's Cost/Tax tables) so its chrome (eyebrow
   header, hairline rows, mono tabular numerics) matches. That pulled in
   Stage 2's ".data-table tbody td.r { color: var(--g-chrome-ink) }" rule,
   which -- being higher-specificity than the bare ".sens-pos"/".sens-neg"/
   "-strong" classes (0,2,2 vs 0,1,0) -- clobbered every heat-cell's text
   color to flat ink, silently defeating the pos/neg/strong distinction.
   Caught via getComputedStyle() on a live page (all four classes reporting
   rgb(36,35,49) instead of their reportCss/Batch-C colors) before any
   screenshot was taken. Fixed with compound selectors at (0,3,2) that beat
   the data-table rule while reproducing the EXACT pre-existing color values
   (reportCss's own .sens-pos/-strong greens, Batch C's .sens-neg/-strong
   desaturated greys) -- no color value invented or changed, only the
   cascade-losing bug fixed. */
.data-table tbody td.r.sens-pos        { color: #15803d; }
.data-table tbody td.r.sens-pos-strong { color: #14532d; }
/* Dark theme: heat fills are translucent tints over the dark panel — light-theme
   fixed greens/greys fail AA on them. Same specificity pattern as above. */
/* Dark theme: heat-cell text sits ON its own translucent tint fill, so text must
   contrast with the TINT-over-panel composite. Plain --t-ink (#e6edf3) clears AA
   against every heat tint composite (verified by contrast math); the tint itself
   carries the pos/neg signal, so text stays neutral ink for maximum legibility. */
html[data-theme='dark'] .data-table tbody td.r.sens-pos        { color: var(--t-ink); }
html[data-theme='dark'] .data-table tbody td.r.sens-pos-strong { color: var(--t-ink); font-weight: 700; }
html[data-theme='dark'] .data-table tbody td.r.sens-neg        { color: var(--t-ink); }
html[data-theme='dark'] .data-table tbody td.r.sens-neg-strong { color: var(--t-ink); font-weight: 700; }
html[data-theme='dark'] .data-table tbody td.r.neg             { color: var(--t-ink-3); }
.data-table tbody td.r.sens-neg        { color: #4b5563; }
.data-table tbody td.r.sens-neg-strong { color: #374151; }
`;
}

// ── 5. Build helpers ─────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const t = initialTrade;
const f = t.financing;
const p = t.partner;
const cl = t.costLines;
const hg = t.hedge;
const fxhg = t.fxHedge || {};
const sur = t.tax.surcharge || {};

// Round to N decimal places for display
function dp(v, n) { return parseFloat((+v).toFixed(n)); }
// Percent: 0.075 → 7.5 (shown in input)
function pct2(v) { return dp(v * 100, 2); }
function pct4(v) { return dp(v * 100, 4); }

// Input component builders
function ni(id, val, step, min, cls) {
  const minAttr = min != null ? ` min="${min}"` : '';
  const clsStr  = cls ? ` ${cls}` : '';
  const phData  = cls === 'ph' ? ' data-ph="1"' : '';
  return `<input type="number" id="${id}" class="si${clsStr}" value="${val !== '' && val != null ? val : ''}" step="${step ?? 'any'}"${minAttr}${phData}>`;
}
function si(id, opts, sel) {
  const o = opts.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `<select id="${id}" class="ss">${o}</select>`;
}
function ro(id, val) {
  return `<div id="${id}" class="sr">${esc(String(val ?? ''))}</div>`;
}
function ti(id, val, placeholder) {
  const ph = placeholder ? ` placeholder="${esc(placeholder)}"` : '';
  return `<input type="text" id="${id}" class="si" value="${esc(val ?? '')}"${ph}>`;
}
function tog(id, label, active, type) {
  const typeAttr = type ? ` data-type="${type}"` : '';
  return `<div id="${id}" class="tgl-wrap" data-on="${active}"${typeAttr} tabindex="0" role="switch" aria-checked="${active}" aria-label="${esc(label)}">
    <div class="tgl-track${active ? ' on' : ''}"><div class="tgl-knob"></div></div>
    <span class="tgl-lbl">${esc(label)}</span>
  </div>`;
}

// status === null is the explicit "this field has no verification-status concept" signal
// (free text, trader-discretion business terms, structural choices) — distinct from a falsy
// '' which historically also fell through to the green pip-ok default. See CLAUDE.md
// "Status pip semantics" — only call pip(null) for fields with no real status to report.
function pip(status) {
  if (status === null) return `<span class="pip pip-none"></span>`;
  const s = (status || '').toUpperCase();
  let cls;
  if (!status || s === 'OK' || s.includes('FIXED')) cls = 'pip-ok';
  else if (s.includes('CONFIRM') || s.includes('UNVERIFIED')) cls = 'pip-unv';
  else cls = 'pip-ind';
  return `<span class="pip ${cls}" title="${esc(status || 'OK')}"></span>`;
}

function ir(id, label, inputHtml, status, primary) {
  const pr = primary ? ' pri' : '';
  return `<div class="ir${pr}">
  <label class="ir-lbl" for="${id}">${pip(status)}${esc(label)}</label>
  ${inputHtml}
</div>`;
}
function sec(title, rows) {
  // title is always a hardcoded string from this file — never user input — so no esc() needed
  return `<div class="sb-sec"><div class="sb-sec-title">${title}</div>${rows}</div>`;
}
function tdiv(label) {
  return `<div class="tier-div"><span class="tier-div-lbl">${esc(label)}</span><span class="tier-div-line"></span></div>`;
}
// Storage line with a per-line unit toggle (₦/L | $/MT). The hidden <select> holds the persistent state
// (snapshotted as a house default); the segmented buttons drive it via setStorageUnit. Label relabels live.
function storageUnitLabel(unit) { return unit === 'USD_PER_MT' ? '$/MT' : '₦/L'; }
function storageRow(inpId, selId, lblId, baseLabel, val, unit, step) {
  const u = unit === 'USD_PER_MT' ? 'USD_PER_MT' : 'NGN_PER_L';
  const ngn = u === 'NGN_PER_L';
  return `<div class="ir">
  <label class="ir-lbl" for="${inpId}">${pip('OK')}${esc(baseLabel)} <span id="${lblId}" class="storage-unit-lbl">${storageUnitLabel(u)}</span></label>
  <div class="storage-unit-ctl">
    <div class="route-seg" id="${selId}-seg">
      <button type="button" class="seg-btn${ngn ? ' seg-active' : ''}" onclick="setStorageUnit('${selId}','NGN_PER_L')">₦/L</button>
      <button type="button" class="seg-btn${ngn ? '' : ' seg-active'}" onclick="setStorageUnit('${selId}','USD_PER_MT')">$/MT</button>
    </div>
    ${ni(inpId, val, step, 0)}
    <select id="${selId}" class="storage-unit-sel" style="display:none">
      <option value="NGN_PER_L"${ngn ? ' selected' : ''}>NGN_PER_L</option>
      <option value="USD_PER_MT"${ngn ? '' : ' selected'}>USD_PER_MT</option>
    </select>
  </div>
</div>`;
}

// ── 6. Sidebar HTML ──────────────────────────────────────────────────────────
const lcPctInit = dp(1 - p.bondPct - p.equityPct, 2) * 100;
const exShipPctInit = t.channels ? dp(t.channels.exShipPct * 100, 1) : 100;
const depotPctInit  = t.channels ? dp(t.channels.depotPct  * 100, 1) : 0;
const depotActive   = depotPctInit > 0;
const surEnabled    = !!(sur.enabled);
const iceOn         = !!(hg.iceHedged);
const fxOn          = !!(fxhg.fxHedged);

// ── Tab: Deal ────────────────────────────────────────────────────────────────
const shortTitleRaw = t.meta.tradeName.replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi, '').trim();
const tabDeal = `
${sec('Trade Identity <span class="per-trade-tag">per-trade</span>', [
  ir('inp-trade-name',    'Trade name',  ti('inp-trade-name',    shortTitleRaw,                   'e.g. Reference Trade 001'), null),
  ir('inp-partner-name',  'Partner',     ti('inp-partner-name',  (t.parties||{}).partner  || '', 'Partner name'), null),
  ir('inp-supplier-name', 'Supplier',    ti('inp-supplier-name', (t.parties||{}).supplier || '', 'Supplier name'), null),
  ir('inp-inspector-name','Inspector',   ti('inp-inspector-name',(t.parties||{}).inspector|| '', 'Inspector name'), null),
].join(''))}
${sec('Pricing <span class="live-badge">Live</span>', [
  ir('inp-ice',       'ICE LSGO $/MT',      ni('inp-ice',       t.market.ice.value,           0.01, 0),     t.market.ice.status, true),
  ir('inp-ice-final', 'Final ICE $/MT (settlement)', ni('inp-ice-final', t.market.ice.final != null ? t.market.ice.final : '', 0.01, 0, 'ph'), 'INDICATIVE'),
  '<p class="defaults-note">Leave blank to use live ICE. Enter the settled ICE at payment to see the realized hedge outcome — your purchase floats at this price; the swap offsets it on hedged tonnes.</p>',
  ir('inp-fob',       'FOB Premium $/MT',    ni('inp-fob',       t.market.fobPremium.value,    0.01),        null, true),
  `<div class="ir pri">
    <label class="ir-lbl" for="inp-fxnafem">${pip(t.fx.nafem.status)}FX NAFEM ₦/USD <span class="rate-tag rate-settle">settlement · P&amp;L</span></label>
    ${ni('inp-fxnafem', t.fx.nafem.value, 1, 1)}
  </div>`,
  '<p class="defaults-note" style="margin-top:-2px">Settlement rate — bank converts naira proceeds to USD at NAFEM, so this drives <b>all naira P&amp;L</b> (RULE 1). The live FX sensitivity lever.</p>',
  ir('inp-delivered', 'Delivered MT',        ni('inp-delivered', t.cargo.deliveredQtyMT,        1, 1),        null, true),
].join(''))}
${sec('Sale — Revenue Legs', [
  '<div class="leg-editor" id="leg-editor"></div>',
  '<div class="leg-foot"><button type="button" id="btn-add-leg" class="leg-add">+ Add leg</button>'
    + '<div class="leg-total" id="leg-total"></div></div>',
  '<p class="defaults-note" style="margin-top:6px">Each leg = channel + pricing unit + tonnage (or % of cargo) + price in its native unit. Depot legs are always ₦/L. Leg tonnage must sum to Delivered MT. Price is optional per leg — leave blank to price from the ladder first.</p>',
  ir('inp-profit-split', 'Partner Profit Split %', ni('inp-profit-split', pct2(p.profitSharePct), 1, 0), null, true),
].join(''))}
${sec('Toggles', `<div class="tgl-set">
  ${tog('tog-ice-hedge', 'ICE Gasoil Hedge', iceOn, 'hedge')}
  ${tog('tog-fx-hedge',  'FX Hedge (Naira)', fxOn, 'hedge')}
  ${tog('tog-surcharge', 'Fossil-fuel Surcharge', surEnabled, 'surcharge')}
</div>`)}

${tdiv('Deal Terms')}

${sec('FX & Currency', [
  `<div class="ir">
    <label class="ir-lbl" for="inp-fxpar">${pip(t.fx.parallel.status)}FX Parallel ₦/USD <span class="rate-tag rate-ref">reference only</span></label>
    ${ni('inp-fxpar', t.fx.parallel.value, 1, 1)}
  </div>`,
  '<p class="defaults-note" style="margin-top:-2px">Street / parallel rate — display, exposure and reconciliation only. Drives <b>zero P&amp;L</b> (RULE 1). NAFEM (Pricing, above) is the settlement rate.</p>',
  '<p class="defaults-note">Currency mode is derived from the revenue legs above (USD-only, naira-only, or split).</p>',
  ir('inp-taxable-prop', 'Taxable Supply Prop.', ni('inp-taxable-prop', t.tax.taxableSupplyProportion, 0.05, 0), 'INDICATIVE'),
].join(''))}
${sec('Freight', [
  ir('inp-tc-rate',   'TC Rate $/day',    ni('inp-tc-rate',   t.freight.tcRatePerDay,   500,  0), t.freight.status || 'INDICATIVE'),
  ir('inp-charter',   'Charter Days',     ni('inp-charter',   t.freight.charterDays,    1,    0), t.freight.status || 'INDICATIVE'),
  ir('inp-demurrage', 'Demurrage Days',   ni('inp-demurrage', t.freight.demurrageDays,  0.5,  0), t.freight.status || 'INDICATIVE'),
].join(''))}
${sec('Financing', [
  ir('inp-credit-rate', 'Credit Rate %/yr',    ni('inp-credit-rate', pct2(f.creditRate), 0.1, 0), f.status || 'INDICATIVE'),
  ir('inp-lc-fee',      'LC Fee %',            ni('inp-lc-fee', pct2(f.lcFeePct), 0.01, 0),       f.status || 'INDICATIVE'),
  ir('inp-fin-days',    'Financing Days',      ni('inp-fin-days', f.financingDays, 1, 1),          null),
  ir('inp-lockup',      'Capital Lockup Days', ni('inp-lockup', f.capitalLockupDays, 1, 1),        null),
  ir('inp-wc-sublimit', 'WC Sublimit $',       ni('inp-wc-sublimit', f.wcSublimit, 10000, 0),      'INDICATIVE'),
].join(''))}
${sec('Partner & Equity', [
  ir('sel-equity-provider', 'Equity Provider',    si('sel-equity-provider', [['partner','Partner (equity split)'],['TIS','TIS (self-funded)']], p.equityProvider || 'partner'), null),
  ir('inp-bond',    'Bond % of cargo',  ni('inp-bond',    pct2(p.bondPct),  0.5, 0), null),
  ir('inp-equity',  'Equity % of cargo',ni('inp-equity',  pct2(p.equityPct),0.5, 0), null),
  `<div class="ir">
    <label class="ir-lbl" for="lc-display">${pip('')}LC % (auto-derived)</label>
    <div id="lc-display" class="sr">${lcPctInit.toFixed(2)}%</div>
  </div>`,
  `<div class="ir">
    <label class="ir-lbl" for="inp-product-alloc">${pip('')}<span title="Fraction of the partner&rsquo;s principal (their equity stake) returned in-kind as product rather than cash. 100% = full product; 0% = full cash. Does not change the partner&rsquo;s share of the cargo.">Partner principal as product %&nbsp;ⓘ</span></label>
    ${ni('inp-product-alloc', pct2(p.productAllocationPct ?? 1), 5, 0)}
  </div>`,
].join(''))}
${sec('Surcharge', [
  `<div id="sur-inc-row"${!surEnabled ? ' hidden' : ''}>
    ${ir('sel-surcharge-inc', 'Surcharge incidence', si('sel-surcharge-inc', [['cost','Cost (TIS bears)'],['pass_through','Pass-through (buyer)']], (sur.incidence) || 'cost'), 'INDICATIVE')}
  </div>`,
  `<div id="sur-off-note" class="ir-lbl" style="color:#94a3b8"${surEnabled ? ' hidden' : ''}>Enable toggle to configure incidence</div>`,
].join(''))}
<button class="disc-btn" onclick="toggleDisc(this)">Assumptions &amp; Tax Rates <span>▼</span></button>
<div class="disc-body">
${sec('Tax Rates', [
  ir('inp-vat-rate', 'VAT Rate %',        ni('inp-vat-rate', pct2(t.tax.vatRate),             0.1, 0), 'OK'),
  ir('inp-wht-rate', 'WHT on freight %',  ni('inp-wht-rate', pct2(t.tax.whtFreightRate || 0.05), 0.1, 0), 'UNVERIFIED'),
].join(''))}
</div>
`;

// ── Tab: Costs ───────────────────────────────────────────────────────────────
const tabCosts = `
<div class="costs-tab-banner">House defaults — rates &amp; fees that persist across new trades</div>
${sec('Port & Cargo Dues', '<div class="field-grid">' + [
  ir('inp-npa-per-mt', 'NPA cargo dues $/MT', ni('inp-npa-per-mt', cl.npaCargoDuesPerMT, 0.1, 0), 'OK'),
  ir('inp-port-das',   'Port DAs $',          ni('inp-port-das',   cl.portDAs, 1000, 0),           'OK'),
  ir('inp-ncs-docs',   'NCS documentation $', ni('inp-ncs-docs',   cl.ncsDocs, 100, 0),            'OK'),
].join('') + '</div>')}
${sec('Maritime Levies', '<div class="field-grid">' + [
  ir('inp-nimasa-cab',     'NIMASA cabotage %',     ni('inp-nimasa-cab',     pct2(cl.nimasaCabotagePct),     0.1, 0), 'UNVERIFIED'),
  ir('inp-nimasa-freight', 'NIMASA freight levy %', ni('inp-nimasa-freight', pct2(cl.nimasaFreightLevyPct), 0.1, 0), 'UNVERIFIED'),
  ir('inp-spomo',          'SPOMO / CVFF %',        ni('inp-spomo',          pct2(cl.spomoCvffPct),         0.1, 0), 'UNVERIFIED'),
].join('') + '</div>')}
${sec('Cargo & Services', '<div class="field-grid">' + [
  ir('inp-marine-icc',    'Marine ICC(A) %',      ni('inp-marine-icc',    pct4(cl.marineIccPct),    0.001, 0), 'INDICATIVE'),
  ir('inp-sgs',           'SGS inspection $',     ni('inp-sgs',           cl.sgsInspection,         500,   0), 'OK'),
  ir('inp-port-agency',   'Port agency $',        ni('inp-port-agency',   cl.portAgency,            500,   0), 'OK'),
  ir('inp-alloc-security','Allocated security %', ni('inp-alloc-security',pct4(cl.allocSecurityPct),0.001, 0), 'INDICATIVE'),
].join('') + '</div>')}
${sec('Banking & Admin', '<div class="field-grid">' + [
  ir('inp-bank-charges',  'Bank charges $',      ni('inp-bank-charges',  cl.bankCharges,      100,  0), 'OK'),
  ir('inp-overhead',      'Overhead $',          ni('inp-overhead',      cl.overhead,          100,  0), 'OK'),
  ir('inp-contingency',   'Contingency $',       ni('inp-contingency',   cl.contingency,       1000, 0), 'OK'),
  ir('inp-collateral-mgr','Collateral manager $',ni('inp-collateral-mgr',cl.collateralManager, 100,  0), 'OK'),
].join('') + '</div>')}
<div id="storage-sec"${!depotActive ? ' hidden' : ''}>
${sec('Storage (depot active)', [
  storageRow('inp-throughput',     'sel-throughput-unit', 'lbl-throughput-unit', 'Throughput',
    (cl.throughputUnit ? cl.throughputRate : (cl.throughputNgnPerMT || cl.throughput || 0)),
    cl.throughputUnit || 'NGN_PER_L', 0.1),
  storageRow('inp-storage-rental', 'sel-storage-unit',    'lbl-storage-unit',    'Storage rental',
    (cl.storageRentalUnit ? cl.storageRentalRate : (cl.storageRentalNgn || cl.storageRental || 0)),
    cl.storageRentalUnit || 'NGN_PER_L', 0.1),
  '<p class="defaults-note">Unit per line: <b>₦/L</b> (naira per litre, converted via density at NAFEM) or <b>$/MT</b> (direct USD). Real depot quotes use one of these — never ₦/MT.</p>',
  ir('inp-evaporation',    'Evaporation %',          ni('inp-evaporation',    pct4(cl.evaporationPct),     0.01, 0), 'INDICATIVE'),
  ir('inp-tank-insurance', 'Tank insurance %',       ni('inp-tank-insurance', pct4(cl.tankInsurancePct),   0.001,0), 'INDICATIVE'),
  ir('inp-litres-per-mt',  'Litres per MT (density)',ni('inp-litres-per-mt',  t.pricing.conversion.litresPerMT, 1, 100), 'INDICATIVE'),
].join(''))}
</div>
<div id="storage-off-note" class="sb-sec" style="color:#94a3b8;font-family:var(--f-body);font-size:11px"${depotActive ? ' hidden' : ''}>Storage inputs activate when a depot revenue leg is added (Sale section, Deal tab).</div>
<div class="sb-sec">
  <button class="btn-defaults" onclick="saveAsDefaults()">↓ Save current rates as house defaults</button>
  <div class="defaults-note">Saves cost lines, tax rates &amp; hedge bank terms — applied automatically on New Trade.</div>
</div>
`;

// ── Tab: Hedge ───────────────────────────────────────────────────────────────
const tabHedge = `
<div class="sb-sec">
  <div class="sb-sec-title">ICE Gasoil Swap</div>
  <div id="ice-on-warn" class="hedge-warn-note"${!iceOn ? ' hidden' : ''}>Hedge ON — unconfirmed values are marked INDICATIVE. Verify all before live trading.</div>
  <div id="ice-off-note" class="hedge-off-note"${iceOn ? ' hidden' : ''}>Enable ICE Hedge in Deal tab to activate.</div>
  <div id="ice-params" class="${iceOn ? '' : 'hedge-off'}">
    ${ir('sel-ice-route', 'Route', si('sel-ice-route', [['bank_book','Bank book'],['third_party','Third-party (margin)']], hg.route || 'bank_book'), '')}
    ${ir('inp-ice-fixed',  'Fixed price $/MT',  ni('inp-ice-fixed',  hg.fixedPrice != null ? hg.fixedPrice : '', 0.01, 0, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-ice-fee',    'Swap fee $/MT',      ni('inp-ice-fee',    hg.feePerMT || 1.5, 0.01, 0, 'ph'),   'PLACEHOLDER')}
    <div id="ice-spread-row"${hg.route === 'third_party' ? ' hidden' : ''}>
      ${ir('inp-ice-spread', 'Bank spread $/MT', ni('inp-ice-spread', hg.bankSpreadPerMT || 0.5, 0.01, 0), 'INDICATIVE')}
    </div>
    <div id="ice-margin-row"${hg.route !== 'third_party' ? ' hidden' : ''}>
      ${ir('inp-ice-margin', 'Initial margin %', ni('inp-ice-margin', pct2(hg.initialMarginPct || 0.10), 1, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    ${ir('inp-ice-hedged-vol', 'Hedged volume MT', ni('inp-ice-hedged-vol', hg.hedgedVolumeMT != null ? hg.hedgedVolumeMT : '', 100, 0), 'INDICATIVE')}
    <p class="defaults-note">Swap fee and bank spread are absolute <b>$/MT</b> amounts (×&nbsp;hedged tonnes), not a fraction of notional — typically ~$0.5–$2/MT.</p>
    <div id="ice-fee-warn" class="h-unit-warn" hidden></div>
    <p class="defaults-note">Defaults to TIS-retained tonnes — the fixed-price tonnes sold to clients. Partner principal is repaid at par (= landed cost), so ICE cancels on partner tonnes; only TIS&rsquo;s fixed-price tonnes carry ICE risk. Raise to full cargo only if partner repayment is fixed-VALUE rather than par/landed-cost.</p>
  </div>
</div>
<div class="sb-sec">
  <div class="sb-sec-title">FX Hedge (Naira Exposure)</div>
  <div id="fx-on-warn" class="hedge-warn-note"${!fxOn ? ' hidden' : ''}>FX Hedge ON — unconfirmed values are marked INDICATIVE. Verify all before live trading.</div>
  <div id="fx-off-note" class="hedge-off-note"${fxOn ? ' hidden' : ''}>Enable FX Hedge in Deal tab to activate.</div>
  <div id="fx-params" class="${fxOn ? '' : 'hedge-off'}">
    ${ir('sel-fx-route',   'Route',             si('sel-fx-route', [['bank_book','Bank forward'],['third_party','Third-party NDF']], fxhg.route || 'bank_book'), '')}
    ${ir('inp-fx-forward', 'Forward rate ₦/USD',ni('inp-fx-forward', fxhg.forwardRate != null ? fxhg.forwardRate : '', 1, 1, 'ph'), 'PLACEHOLDER')}
    ${ir('inp-fx-ratio',   'Hedge ratio %',     ni('inp-fx-ratio',  pct2(fxhg.hedgeRatio != null ? fxhg.hedgeRatio : 1), 5, 0), 'INDICATIVE')}
    ${ir('inp-fx-fee',     'Fee $/USD (e.g. 0.003)',    ni('inp-fx-fee',    0.003, 0.001, 0, 'ph'), 'PLACEHOLDER')}
    <div id="fx-spread-row"${fxhg.route === 'third_party' ? ' hidden' : ''}>
      ${ir('inp-fx-spread',  'Spread $/USD (e.g. 0.001)', ni('inp-fx-spread', 0.001, 0.001, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    <div id="fx-thirdparty-rows"${fxhg.route !== 'third_party' ? ' hidden' : ''}>
      ${ir('inp-fx-margin', 'Initial margin %', ni('inp-fx-margin', pct2(0.10), 1, 0, 'ph'), 'PLACEHOLDER')}
      ${ir('inp-fx-tenor',  'Tenor (days)',     ni('inp-fx-tenor',  fxhg.tenorDays != null ? fxhg.tenorDays : 30, 1, 0, 'ph'), 'PLACEHOLDER')}
      ${ir('inp-fx-broker', 'Broker fee $',     ni('inp-fx-broker', fxhg.brokerFee != null ? fxhg.brokerFee : 0, 100, 0, 'ph'), 'PLACEHOLDER')}
    </div>
    <p class="defaults-note">Fee and spread are a small <b>fraction of every USD of notional</b> — typically 0.001–0.004 ($1–$4 per $1,000 hedged), not whole dollars. 0.004 on a $19M hedge ≈ $76k cost. Entering whole-dollar figures (e.g. 2.0 = $2 per $1) overstates the cost by ~1000×.</p>
    <p class="defaults-note" id="fx-thirdparty-note"${fxhg.route !== 'third_party' ? ' hidden' : ''}>NDF cost drivers: the bank posts <b>initial margin %</b> of notional (financed at the credit rate over <b>tenor days</b>) plus a flat <b>broker fee</b>. Margin is bank-provided, never partner equity.</p>
    <div id="fx-fee-warn" class="h-unit-warn" hidden></div>
  </div>
</div>
`;

// ── 7. Sidebar assembly ──────────────────────────────────────────────────────
const sidebarHtml = `<aside class="sidebar" id="sidebar">
  <div class="sb-tabs" role="tablist" aria-label="Trade input sections">
    <button class="tab-btn active" data-tab="deal" role="tab" aria-selected="true" aria-controls="tab-deal" id="tabbtn-deal">Deal</button>
    <button class="tab-btn" data-tab="costs" role="tab" aria-selected="false" aria-controls="tab-costs" id="tabbtn-costs">Costs</button>
    <button class="tab-btn" data-tab="hedge" role="tab" aria-selected="false" aria-controls="tab-hedge" id="tabbtn-hedge">Hedge</button>
    <button class="tab-btn" data-tab="quotes" role="tab" aria-selected="false" aria-controls="tab-quotes" id="tabbtn-quotes">Quotes</button>
  </div>
  <div class="sb-scroll">
    <div class="tab-panel active" id="tab-deal" role="tabpanel" aria-labelledby="tabbtn-deal">${tabDeal}</div>
    <div class="tab-panel" id="tab-costs" role="tabpanel" aria-labelledby="tabbtn-costs">${tabCosts}</div>
    <div class="tab-panel" id="tab-hedge" role="tabpanel" aria-labelledby="tabbtn-hedge">${tabHedge}</div>
    <div class="tab-panel" id="tab-quotes" role="tabpanel" aria-labelledby="tabbtn-quotes">
      <div class="sb-section">
        <p class="defaults-note">Capture index quotes with provenance (source, tier, method). Trades resolve unpinned indexes from this book — latest active entry per index.</p>
        <div class="ir"><label class="ir-lbl" for="qb-index">Index</label>
          <select id="qb-index" class="lib-select" style="width:100%"></select></div>
        <div class="ir"><label class="ir-lbl" for="qb-value">Value</label>
          <input type="number" step="0.01" min="0" id="qb-value" class="si" style="width:100%"></div>
        <div class="ir"><label class="ir-lbl" for="qb-asof">As of date</label>
          <input type="date" id="qb-asof" class="si" style="width:100%"></div>
        <div class="ir"><label class="ir-lbl" for="qb-source">Source</label>
          <input type="text" id="qb-source" class="si" placeholder="Who gave you this number?" style="width:100%"></div>
        <div style="display:flex;gap:8px">
          <div class="ir" style="flex:1"><label class="ir-lbl" for="qb-tier">Tier</label>
            <select id="qb-tier" class="lib-select" style="width:100%">
              <option value="A">A — primary/published</option>
              <option value="B" selected>B — broker</option>
              <option value="C">C — unverified</option>
            </select></div>
          <div class="ir" style="flex:1"><label class="ir-lbl" for="qb-method">Method</label>
            <input type="text" id="qb-method" class="si" placeholder="WhatsApp…" style="width:100%"></div>
        </div>
        <button class="btn-save" style="width:100%;margin-top:6px" onclick="captureQuote()">Capture Quote</button>
        <p id="qb-status" class="defaults-note" style="min-height:1em">&nbsp;</p>
      </div>
      <div class="sb-section">
        <p class="ir-lbl">Consensus check</p>
        <select id="qb-consensus-index" class="lib-select" style="width:100%" onchange="showConsensus()"></select>
        <div id="qb-consensus-out" class="defaults-note" style="margin-top:8px">Pick an index to see median / spread across sources.</div>
      </div>
      <div class="sb-section">
        <p class="ir-lbl">Recent quotes</p>
        <div id="qb-list" class="defaults-note">Loading…</div>
      </div>
      <div class="sb-section">
        <p class="ir-lbl">FX rate memory</p>
        <p class="defaults-note" style="margin-bottom:6px">Log today's NAFEM print with source. Latest entry pre-fills new trades.</p>
        <div class="ir"><label class="ir-lbl" for="fx-date">Date</label><input type="date" id="fx-date" class="si" style="width:100%"></div>
        <div style="display:flex;gap:8px">
          <div class="ir" style="flex:1"><label class="ir-lbl" for="fx-nafem">NAFEM ₦/$</label><input type="number" step="0.5" min="0" id="fx-nafem" class="si" style="width:100%"></div>
          <div class="ir" style="flex:1"><label class="ir-lbl" for="fx-par">Parallel (opt.)</label><input type="number" step="0.5" min="0" id="fx-par" class="si" style="width:100%"></div>
        </div>
        <div class="ir"><label class="ir-lbl" for="fx-source">Source</label><input type="text" id="fx-source" class="si" placeholder="bank print / aboki…" style="width:100%"></div>
        <button class="btn-save" style="width:100%;margin-top:6px" onclick="captureFx()">Log FX Rate</button>
        <p id="fx-status" class="defaults-note" style="min-height:1em">&nbsp;</p>
        <div id="fx-latest" class="defaults-note"></div>
      </div>
    </div>
  </div>
  <div class="sb-footer">
    <div class="sb-footer-row1">
      <button class="btn-new"    onclick="newTrade()"    title="Clear form, start a new trade">New Trade</button>
      <button class="btn-save"   onclick="saveTrade()"   title="Save / update this trade">Save</button>
      <button class="btn-saveas" onclick="saveAsTrade()" title="Save a copy under a new name">Save As…</button>
    </div>
    <div class="sb-state-row">
      <span id="trade-state-badge" class="state-badge state-new">New · unsaved</span>
    </div>
    <div class="sb-footer-row2">
      <select id="sel-saved-trades" class="lib-select" onchange="loadSelectedTrade()"><option value="">Load a saved trade…</option></select>
      <button class="btn-lib"               onclick="loadSelectedTrade(true)" title="Reload the selected trade">↓</button>
      <button class="btn-lib btn-lib-ren"   onclick="renameTrade()"           title="Rename selected trade">✎</button>
      <button class="btn-lib btn-lib-del"   onclick="deleteSelectedTrade()"   title="Delete selected trade">✕</button>
    </div>
    <div class="sb-report-row">
      <button class="btn-report" onclick="downloadReport()" title="Generate and download a branded PDF report for the current trade (auto-downloads — no print dialog)">Download Report</button>
    </div>
    <div class="sb-export-row">
      <button class="btn-export" onclick="exportTrades()" title="Download all saved trades to a .json backup file">Export Trades</button>
      <button class="btn-export" onclick="importTrades()" title="Restore saved trades from a .json backup file">Import Trades</button>
    </div>
    <div class="sb-export-row">
      <button class="btn-export btn-theme" id="theme-toggle" onclick="toggleTheme()" title="Switch dark / light theme">🌙 Dark</button>
    </div>
    <input type="file" id="imp-file-input" accept=".json" style="display:none" onchange="importTradesFromFile(this)">
  </div>
</aside>`;

// ── 8. Header HTML ───────────────────────────────────────────────────────────
const shortTitle = esc(shortTitleRaw);
// Fixture badge: always present in DOM, visibility driven by _isSample JS state
const fixtureBadgeHtml = `<span id="hdr-fixture-badge" style="display:${isSampleFlag ? 'inline-block' : 'none'};margin-left:10px;padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;background:rgba(212,29,29,.20);color:#fca5a5;border:1px solid rgba(212,29,29,.35);border-radius:3px;vertical-align:middle">Fixture</span>`;

// ── 9. Assemble CSS ──────────────────────────────────────────────────────────
let sharedCss;
try { sharedCss = css(); }
catch(e) { throw e; }

// ── 10. Full HTML ────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.meta.tradeId)} — TIS Global Trading (Interactive)</title>
<link rel="icon" type="image/svg+xml" href="${faviconDataUri}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${sharedCss}
</style>
</head>
<body>

<!-- ── App header (always visible) ─────────────────────────────────────── -->
<header class="report-header">
  <div class="header-inner">
    <div class="header-logo" role="img" aria-label="TIS Global Trading">${logo}</div>
    <div class="header-trade">
      <h1 class="trade-name" id="hdr-trade-name">${shortTitle}</h1>
      <p class="trade-id" id="hdr-trade-id">${esc(t.meta.tradeId)}${fixtureBadgeHtml}</p>
    </div>
    <div class="header-kpis" role="region" aria-label="Key metrics">
      <div class="kpi-chip">
        <span class="kpi-label">TIS Net Profit</span>
        <span class="kpi-value" id="kpi-tisnet-val">—</span>
        <span class="kpi-sub"  id="kpi-tisnet-sub">after partner split</span>
      </div>
      <div class="kpi-chip kpi-secondary">
        <span class="kpi-label">Annualised Return</span>
        <span class="kpi-value" id="kpi-annret-val">—</span>
        <span class="kpi-sub"  id="kpi-annret-sub">—</span>
      </div>
      <div class="kpi-chip kpi-secondary">
        <span class="kpi-label" id="kpi-margin-label">Ex-Ship Margin</span>
        <span class="kpi-value" id="kpi-margin-val">—</span>
        <span class="kpi-sub"  id="kpi-margin-sub">—</span>
      </div>
    </div>
  </div>
  <div class="header-meta-strip">
    <div class="header-meta-inner">
      Flow: <b id="hdr-flow">${esc(t.meta.flow || 'equity-partner')}</b><span id="hdr-partner-seg">&nbsp;&middot;&nbsp;Partner: <b id="hdr-partner">${esc((t.parties || {}).partner || '')}</b></span><span id="hdr-supplier-seg">&nbsp;&middot;&nbsp;Supplier: <span id="hdr-supplier">${esc((t.parties || {}).supplier || '')}</span></span><span id="hdr-inspector-seg">&nbsp;&middot;&nbsp;Inspector: <span id="hdr-inspector">${esc((t.parties || {}).inspector || '')}</span></span>
    </div>
  </div>
</header>

<!-- ── Narrow-screen drawer toggle ──────────────────────────────────────── -->
<button class="drawer-btn" id="drawer-btn" onclick="toggleDrawer()">
  ☰ Trade Inputs <span class="drawer-arrow">▼</span>
</button>

<!-- ── App body: sidebar + results ──────────────────────────────────────── -->
<div class="app-body">

  ${sidebarHtml}

  <!-- ── Results ──────────────────────────────────────────────────────── -->
  <div class="results-col">
    <!-- Sticky condensed KPI mirror (Batch G): the app header above is a fixed
         shell element and is always visible regardless of scroll, so this is
         a visual convenience for a long results scroll, not new information —
         aria-hidden, the header's own labeled chip is the authoritative figure
         for assistive tech. Hidden until scrolled past the threshold (JS).
         Lives OUTSIDE <main class="results"> (a genuine flex sibling, not a
         position:sticky child of its scroll content) so .results' own box is
         permanently shorter and its clipped content can never reach this row
         at any scroll position — see the .results-sticky-kpi CSS comment. -->
    <div class="results-sticky-kpi" id="results-sticky-kpi" aria-hidden="true">
      <span class="results-sticky-kpi-label">TIS Net Profit</span>
      <span class="results-sticky-kpi-val" id="sticky-tisnet-val">—</span>
    </div>
    <main class="results" role="main">
      <div id="rpt-error" class="err-banner" hidden></div>
      <div id="sec-waterfall"></div>
      <div id="sec-ladder"></div>
      <div id="sec-cost"></div>
      <div id="sec-partner"></div>
      <div id="sec-hedge"></div>
      <div id="sec-tax"></div>
      <div id="sec-sens"></div>
      <section class="section" aria-labelledby="cmp-h">
        <h2 class="section-heading" id="cmp-h">Compare With Saved Trade</h2>
        <div class="card">
          <div style="display:flex;gap:10px;align-items:center;padding:14px 22px;flex-wrap:wrap">
            <select id="cmp-select" class="lib-select" style="flex:1;min-width:200px"><option value="">Pick a saved trade…</option></select>
            <button class="btn-new" onclick="runComparison()" style="padding:6px 14px">Compare</button>
            <button class="btn-lib" onclick="clearComparison()" title="Clear comparison">✕</button>
          </div>
          <div id="cmp-out"></div>
        </div>
      </section>
      <section class="section" aria-labelledby="co-h">
        <h2 class="section-heading" id="co-h">Deal Close-Out (actuals vs model)</h2>
        <div class="card">
          <p class="defaults-note" style="padding:10px 22px 0">After settlement, type what ACTUALLY happened over the model values. Blank = use model. Variance feeds your cost baselines automatically.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;padding:12px 22px 6px">
            <div class="ir"><label class="ir-lbl" for="co-qty">Delivered MT</label><input type="number" step="1" id="co-qty" class="si" style="width:100%" placeholder="model"></div>
            <div class="ir"><label class="ir-lbl" for="co-avgprice">Avg realized $/MT</label><input type="number" step="0.01" id="co-avgprice" class="si" style="width:100%" placeholder="model"></div>
            <div class="ir"><label class="ir-lbl" for="co-cost">All-in cost $</label><input type="number" step="1" id="co-cost" class="si" style="width:100%" placeholder="model"></div>
            <div class="ir"><label class="ir-lbl" for="co-nafem">NAFEM ₦/$</label><input type="number" step="0.5" id="co-nafem" class="si" style="width:100%" placeholder="model"></div>
            <div class="ir"><label class="ir-lbl" for="co-net">TIS net profit $</label><input type="number" step="1" id="co-net" class="si" style="width:100%" placeholder="model"></div>
          </div>
          <div style="padding:4px 22px 14px">
            <button class="btn-save" onclick="runCloseOut()" style="padding:7px 16px">Run Close-Out</button>
          </div>
          <div id="co-out"></div>
        </div>
      </section>
      <section class="section" aria-labelledby="qb-h">
        <h2 class="section-heading" id="qb-h">Quote Provenance</h2>
        <div class="card"><div id="sec-quotes" class="muted">No indexed pricing on this trade.</div></div>
      </section>
    </main>
  </div>

</div>

<footer class="report-footer" role="contentinfo" style="display:none">
  TIS Global Trading — Interactive Trade Model — ${esc(t.meta.tradeId)} — DUMMY/EXAMPLE data.
</footer>

<!-- ── Engine bundle ────────────────────────────────────────────────────── -->
<script>${engineBundle}</script>

<!-- ── Interactive controller ───────────────────────────────────────────── -->
<script>
(function () {
'use strict';

// ── Initial trade (baseline for reset + modified detection) ────────────────
const INIT = ${JSON.stringify(initialTrade)};
const INIT_IS_SAMPLE = /REGRESSION|FIXTURE|dummy|test|sample/i.test((INIT.meta || {}).tradeName || '');

// ── Shared set-value helpers (used by resetToDefaults, newTrade, loadTrade) ─
function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function sd(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

// ── isSample runtime state (true = show Fixture badge) ─────────────────────
let _isSample = INIT_IS_SAMPLE;

// ── Formatters ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtUsd(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (v < 0 ? '−$' : '$') + abs;
}
function fmtUsdSign(v) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (v < 0 ? '−$' : '+$') + abs;
}
function fmtPct(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return (v * 100).toFixed(d != null ? d : 2) + '%';
}
function fmtMt(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d??2,maximumFractionDigits:d??2}) + ' MT';
}
function fmtNum(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US',{minimumFractionDigits:d??0,maximumFractionDigits:d??0});
}
function badge(s) {
  if (!s || s === 'OK') return '';
  const upper = String(s).toUpperCase();
  if (upper.includes('RECOVERABLE')) return \`<span class="bdg bdg-recoverable" title="\${esc(s)}">&#10003; OK</span>\`;
  if (upper.includes('FIXED')) return '';
  if (upper.includes('CONFIRM') || upper.includes('UNVERIFIED'))
    return \`<span class="bdg bdg-unverified" title="\${esc(s)}">&#9888;&#xFE0E;&nbsp;UNVERIFIED</span>\`;
  return \`<span class="bdg bdg-indicative" title="\${esc(s)}">INDICATIVE</span>\`;
}

// ── DOM helpers ────────────────────────────────────────────────────────────
function gf(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) : NaN; }
function gi(id) { const el = document.getElementById(id); return el ? parseInt(el.value, 10) : NaN; }
function gs(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function isOn(id) { const el = document.getElementById(id); return el ? el.dataset.on === 'true' : false; }
function show(id, vis) { const el = document.getElementById(id); if (el) el.hidden = !vis; }

// ── Collect trade from inputs ──────────────────────────────────────────────
// ── Per-leg revenue editor ───────────────────────────────────────────────
// Source of truth for the Sale section. Each entry:
//   { channel:'ex-ship'|'depot', unit:'USD_PER_MT'|'NGN_PER_L', qtyMode:'tonnes'|'pct', qty:Number, price:Number|null }
var _legs = [];
var _lastRetainedTonnes = null; // updated after each recompute; drives hedge-vol placeholder

// Last successful FULL-PRICE compute — cached so "Download Report" can render the live trade.
// Only set when every leg is priced (hasSellPrice); cleared on empty/error so a stale report
// can never be generated against a half-entered trade.
var _lastTrade = null, _lastRes = null, _lastLadder = null;

function legBlank() { return { channel:'ex-ship', unit:'USD_PER_MT', qtyMode:'pct', qty:100, price:null }; }
function legUnitLabel(unit) { return unit === 'NGN_PER_L' ? '₦/L' : '$/MT'; }

// Derive editor legs from a legacy-shape trade object (channels + sell.currencyMode + prices).
// Mirrors the engine's legacy adapter so a loaded legacy trade recomputes byte-for-byte identically.
function legsFromLegacyTrade(tr) {
  var legs = [];
  var ch = tr.channels || { exShipPct: 1, depotPct: 0 };
  var exPct = (ch.exShipPct != null ? ch.exShipPct : 1);
  var dePct = (ch.depotPct  != null ? ch.depotPct  : (1 - exPct));
  var sell = tr.sell || {};
  var mode = sell.currencyMode || 'USD';
  var usdShare = (mode === 'USD') ? 1 : (mode === 'NGN') ? 0 : (sell.splitUsdPct != null ? sell.splitUsdPct : 1);
  var exPriceUsd = (sell.exShipPricePerMT && isFinite(sell.exShipPricePerMT.value)) ? sell.exShipPricePerMT.value : null;
  var litres = (tr.pricing && tr.pricing.conversion && tr.pricing.conversion.litresPerMT) || 1183;
  var parPricing = (tr.fx && tr.fx.parallel && isFinite(tr.fx.parallel.value)) ? tr.fx.parallel.value : null;
  if (exPct > 1e-9) {
    var exUsdPct = exPct * usdShare;
    var exNgnPct = exPct * (1 - usdShare);
    if (exUsdPct > 1e-9) {
      legs.push({ channel:'ex-ship', unit:'USD_PER_MT', qtyMode:'pct', qty:+(exUsdPct*100).toFixed(4), price: exPriceUsd });
    }
    if (exNgnPct > 1e-9) {
      var ngnPerL = (exPriceUsd != null && parPricing != null) ? (exPriceUsd * parPricing) / litres : null;
      legs.push({ channel:'ex-ship', unit:'NGN_PER_L', qtyMode:'pct', qty:+(exNgnPct*100).toFixed(4), price: ngnPerL != null ? +ngnPerL.toFixed(4) : null });
    }
  }
  if (dePct > 1e-9) {
    var depPrice = (sell.depotPriceNgnPerL && isFinite(sell.depotPriceNgnPerL.value)) ? sell.depotPriceNgnPerL.value : null;
    legs.push({ channel:'depot', unit:'NGN_PER_L', qtyMode:'pct', qty:+(dePct*100).toFixed(4), price: depPrice });
  }
  if (!legs.length) legs.push(legBlank());
  return legs;
}

// Derive editor legs from any trade object: native revenueLegs win; else the legacy adapter.
function legsFromTrade(tr) {
  if (tr && Array.isArray(tr.revenueLegs) && tr.revenueLegs.length) {
    return tr.revenueLegs.map(function(l) {
      var hasTonnes = (l.tonnes != null);
      return {
        channel: l.channel || 'ex-ship',
        unit: l.pricingUnit || 'USD_PER_MT',
        qtyMode: hasTonnes ? 'tonnes' : 'pct',
        qty: hasTonnes ? l.tonnes : (l.share != null ? +(l.share*100).toFixed(4) : 0),
        price: (l.price != null && isFinite(l.price)) ? l.price : null,
      };
    });
  }
  return legsFromLegacyTrade(tr || {});
}

// Reconstruct legs from a saved input snapshot. New snapshots carry _legs JSON; older
// (pre per-leg) snapshots are rebuilt from their legacy ex-ship/depot/currency fields.
function legsFromSnapshot(snap) {
  if (snap && snap['_legs']) { try { return JSON.parse(snap['_legs']); } catch(_) {} }
  var exPct  = (snap['inp-exship-pct'] != null && snap['inp-exship-pct'] !== '') ? parseFloat(snap['inp-exship-pct'])/100 : 1;
  var exPrice= (snap['inp-exship-price'] != null && snap['inp-exship-price'] !== '') ? parseFloat(snap['inp-exship-price']) : null;
  var depPrice=(snap['inp-depot-price'] != null && snap['inp-depot-price'] !== '') ? parseFloat(snap['inp-depot-price']) : null;
  var fakeTrade = {
    channels: { exShipPct: exPct, depotPct: Math.round((1-exPct)*1e10)/1e10 },
    sell: {
      currencyMode: snap['inp-currency-mode'] || 'USD',
      splitUsdPct: (snap['inp-split-usd'] != null && snap['inp-split-usd'] !== '') ? parseFloat(snap['inp-split-usd'])/100 : 1,
      exShipPricePerMT: { value: exPrice },
      depotPriceNgnPerL: depPrice != null ? { value: depPrice } : null,
    },
    fx: { parallel: { value: (snap['inp-fxpar'] != null ? parseFloat(snap['inp-fxpar']) : null) } },
    pricing: { conversion: { litresPerMT: (snap['inp-litres-per-mt'] != null ? parseFloat(snap['inp-litres-per-mt']) : 1183) } },
  };
  return legsFromLegacyTrade(fakeTrade);
}

function legRowHtml(leg, i) {
  var depot = leg.channel === 'depot';
  var chanOpts =
    '<option value="ex-ship"' + (depot ? '' : ' selected') + '>Ex-ship</option>' +
    '<option value="depot"'   + (depot ? ' selected' : '') + '>Depot</option>';
  var unitOpts =
    '<option value="USD_PER_MT"' + (leg.unit==='USD_PER_MT' ? ' selected':'') + (depot ? ' disabled':'') + '>USD $/MT</option>' +
    '<option value="NGN_PER_L"'  + (leg.unit==='NGN_PER_L'  ? ' selected':'') + '>Naira ₦/L</option>';
  var qtyModeOpts =
    '<option value="tonnes"' + (leg.qtyMode==='tonnes' ? ' selected':'') + '>MT</option>' +
    '<option value="pct"'    + (leg.qtyMode==='pct'    ? ' selected':'') + '>%</option>';
  var qtyVal   = isFinite(leg.qty) ? leg.qty : '';
  var priced   = (leg.price != null && isFinite(leg.price) && leg.price > 0);
  var priceVal = priced ? leg.price : '';
  var priceFlag = priced ? '' : ' <span class="leg-price-flag">· pending</span>';
  return '<div class="leg-row" data-idx="' + i + '">' +
    '<button type="button" class="leg-del" data-act="del" data-idx="' + i + '" title="Remove leg" aria-label="Remove leg">×</button>' +
    '<div class="leg-field"><span class="leg-field-lbl">Channel</span>' +
      '<select class="leg-in" data-field="channel" data-idx="' + i + '">' + chanOpts + '</select></div>' +
    '<div class="leg-field"><span class="leg-field-lbl">Pricing unit</span>' +
      '<select class="leg-in" data-field="unit" data-idx="' + i + '"' + (depot ? ' disabled' : '') + '>' + unitOpts + '</select></div>' +
    '<div class="leg-field full"><span class="leg-field-lbl">Quantity</span>' +
      '<div class="leg-qty-group">' +
        '<input class="leg-in" type="number" step="any" min="0" data-field="qty" data-idx="' + i + '" value="' + qtyVal + '">' +
        '<select class="leg-in" data-field="qtyMode" data-idx="' + i + '">' + qtyModeOpts + '</select>' +
      '</div></div>' +
    '<div class="leg-field full"><span class="leg-field-lbl">Price (' + legUnitLabel(leg.unit) + ')' + priceFlag + '</span>' +
      '<input class="leg-in' + (priced ? '' : ' leg-in-pending') + '" type="number" step="any" min="0" data-field="price" data-idx="' + i + '" value="' + priceVal + '" placeholder="optional">' +
      '<span id="leg-ngn-equiv-' + i + '" class="leg-ngn-equiv"></span></div>' +
    '</div>';
}

function updateLegNgnEquiv() {
  // RULE 1 (2026-06-23): naira<->USD conversion is at NAFEM, so the ₦/L-equiv hint uses the NAFEM rate.
  var nafemEl = document.getElementById('inp-fxnafem');
  var litEl = document.getElementById('inp-litres-per-mt');
  var nafemRate = nafemEl ? parseFloat(nafemEl.value) : NaN;
  var litresPerMT = (litEl && isFinite(parseFloat(litEl.value)) && parseFloat(litEl.value) > 0)
    ? parseFloat(litEl.value) : 1183;
  var canCompute = isFinite(nafemRate) && nafemRate > 0 && isFinite(litresPerMT) && litresPerMT > 0;
  for (var i = 0; i < _legs.length; i++) {
    var leg = _legs[i];
    var el = document.getElementById('leg-ngn-equiv-' + i);
    if (!el) continue;
    if (!canCompute || leg.unit !== 'USD_PER_MT' || leg.price == null || !isFinite(leg.price) || leg.price <= 0) {
      el.textContent = '';
    } else {
      var ngnPerL = (leg.price * nafemRate) / litresPerMT;
      el.textContent = '· ₦' + Math.round(ngnPerL).toLocaleString('en-US') + '/L equiv';
    }
  }
}

function renderLegEditor() {
  var box = document.getElementById('leg-editor');
  if (!box) return;
  if (!_legs.length) _legs = [legBlank()];
  var html = '';
  for (var i = 0; i < _legs.length; i++) html += legRowHtml(_legs[i], i);
  box.innerHTML = html;
  updateLegTotal();
  updateLegNgnEquiv();
}

function legTonnesResolved(leg, delivered) {
  if (!isFinite(leg.qty)) return 0;
  return leg.qtyMode === 'pct' ? (leg.qty/100) * delivered : leg.qty;
}

function updateLegTotal() {
  var el = document.getElementById('leg-total');
  if (!el) return;
  var dEl = document.getElementById('inp-delivered');
  var delivered = dEl ? parseFloat(dEl.value) : NaN;
  var base = (isFinite(delivered) && delivered > 0) ? delivered : 0;
  var sum = 0;
  for (var i = 0; i < _legs.length; i++) sum += legTonnesResolved(_legs[i], base);
  var sumStr = sum.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (!isFinite(delivered) || delivered <= 0) {
    el.className = 'leg-total';
    el.innerHTML = !isFinite(delivered)
      ? 'Σ legs: <b>—</b>'
      : 'Σ legs: <b>' + sumStr + ' MT</b>';
    return;
  }
  var delivStr = delivered.toLocaleString('en-US', { maximumFractionDigits: 2 });
  var diff = sum - delivered;
  var ok = Math.abs(diff) <= 1e-6 * Math.max(1, delivered);
  el.className = 'leg-total ' + (ok ? 'ok' : 'bad');
  var flag = ok
    ? '<span class="leg-total-flag">✓ matches delivered</span>'
    : '<span class="leg-total-flag">⚠ ' + (diff > 0 ? 'over' : 'under') + ' by ' + Math.abs(diff).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' MT</span>';
  el.innerHTML = 'Σ legs: <b>' + sumStr + ' MT</b> / delivered <b>' + delivStr + ' MT</b><br>' + flag;
}

function onLegFieldChange(i, field, value) {
  var leg = _legs[i];
  if (!leg) return false;
  var rerender = false;
  if (field === 'channel') {
    leg.channel = value;
    if (value === 'depot' && leg.unit !== 'NGN_PER_L') leg.unit = 'NGN_PER_L'; // depot forces ₦/L
    rerender = true;
  } else if (field === 'unit') {
    leg.unit = value;
    rerender = true; // price label/placeholder depends on unit
  } else if (field === 'qtyMode') {
    leg.qtyMode = value;
  } else if (field === 'qty') {
    leg.qty = (value === '' ? NaN : parseFloat(value));
  } else if (field === 'price') {
    leg.price = (value === '' ? null : parseFloat(value));
    // Live-toggle the amber "pending" cue without re-rendering (preserve input focus).
    var rowEl = document.querySelector('.leg-row[data-idx="' + i + '"]');
    var inp = rowEl ? rowEl.querySelector('input[data-field="price"]') : null;
    var pend = !(leg.price != null && isFinite(leg.price) && leg.price > 0);
    if (inp) {
      inp.classList.toggle('leg-in-pending', pend);
      var lbl = inp.parentNode ? inp.parentNode.querySelector('.leg-field-lbl') : null;
      if (lbl) {
        var flag = lbl.querySelector('.leg-price-flag');
        if (pend && !flag) { var sp = document.createElement('span'); sp.className = 'leg-price-flag'; sp.textContent = ' · pending'; lbl.appendChild(sp); }
        else if (!pend && flag) { flag.remove(); }
      }
    }
  }
  if (rerender) renderLegEditor(); else updateLegTotal();
  return rerender;
}

function legInputChanged() {
  if (_isSample) { _isSample = false; }
  setModified(true);
  updateDepotVisibility();   // a depot leg activates the storage section
  updateHeader();
  recompute();
}

function addLeg() {
  _legs.push(legBlank());
  renderLegEditor();
  legInputChanged();
}

function removeLeg(i) {
  if (_legs.length <= 1) _legs = [legBlank()];
  else _legs.splice(i, 1);
  renderLegEditor();
  legInputChanged();
}

function wireLegEditor() {
  var box = document.getElementById('leg-editor');
  if (box) {
    var handler = function(e) {
      var tEl = e.target;
      if (!tEl || !tEl.dataset || tEl.dataset.field == null) return;
      onLegFieldChange(+tEl.dataset.idx, tEl.dataset.field, tEl.value);
      legInputChanged();
    };
    box.addEventListener('input', handler);
    box.addEventListener('change', handler);
    box.addEventListener('click', function(e) {
      var tEl = e.target;
      if (tEl && tEl.dataset && tEl.dataset.act === 'del') removeLeg(+tEl.dataset.idx);
    });
  }
  var addBtn = document.getElementById('btn-add-leg');
  if (addBtn) addBtn.addEventListener('click', addLeg);
}

// Build the engine revenueLegs array from the editor. Blank price → null (price-independent run).
function collectLegs() {
  return _legs.map(function(leg) {
    var out = { channel: leg.channel, pricingUnit: leg.unit };
    if (leg.qtyMode === 'pct') out.share = (isFinite(leg.qty) ? leg.qty/100 : NaN);
    else out.tonnes = leg.qty;
    out.price = (leg.price != null && isFinite(leg.price)) ? leg.price : null;
    return out;
  });
}

function collectTrade() {
  const bondPct     = gf('inp-bond')   / 100;
  const equityPct   = gf('inp-equity') / 100;
  const lcPct       = Math.round((1 - bondPct - equityPct) * 1e10) / 1e10;
  // Sale revenue is a PER-LEG model now. Channels + currency are DERIVED from the legs.
  const revenueLegs = collectLegs();
  const deliveredQ  = gf('inp-delivered');
  let _exT = 0, _deT = 0;
  for (const l of revenueLegs) {
    const tn = (l.tonnes != null ? l.tonnes : (isFinite(l.share) ? l.share * deliveredQ : 0));
    if (l.channel === 'depot') _deT += tn; else _exT += tn;
  }
  const _totT       = _exT + _deT;
  const exShipPct   = _totT > 0 ? _exT / _totT : 1;
  const depotPct    = _totT > 0 ? _deT / _totT : 0;
  const depotOn     = revenueLegs.some(l => l.channel === 'depot');
  const needLitres  = revenueLegs.some(l => l.pricingUnit === 'NGN_PER_L');
  const iceHedgeOn  = isOn('tog-ice-hedge');
  const fxHedgeOn   = isOn('tog-fx-hedge');
  const surOn       = isOn('tog-surcharge');
  const eqProvider  = gs('sel-equity-provider') || 'partner';

  // Hedge params
  const iceRoute      = gs('sel-ice-route')   || 'bank_book';
  const fxRoute       = gs('sel-fx-route')    || 'bank_book';
  const iceFixedRaw   = gf('inp-ice-fixed');
  const iceFixed      = (isNaN(iceFixedRaw) || iceFixedRaw <= 0) ? null : iceFixedRaw;
  const fxFwdRaw      = gf('inp-fx-forward');
  const fxFwd         = (isNaN(fxFwdRaw) || fxFwdRaw <= 0) ? null : fxFwdRaw;
  const iceVolRaw     = gf('inp-ice-hedged-vol');
  const iceVol        = (isNaN(iceVolRaw) || iceVolRaw <= 0) ? null : iceVolRaw;
  // Final/settlement ICE: blank (or non-positive) => null => engine defaults to live ICE.
  const iceFinalRaw   = gf('inp-ice-final');
  const iceFinal      = (isNaN(iceFinalRaw) || iceFinalRaw <= 0) ? null : iceFinalRaw;

  // sell kept for back-compat shape only; the engine prices from revenueLegs (native path).
  const sell = { ...INIT.sell };

  return {
    ...INIT,
    revenueLegs,
    market: {
      ice:        { ...INIT.market.ice,        value: gf('inp-ice'), final: iceFinal },
      fobPremium: { ...INIT.market.fobPremium, value: gf('inp-fob') },
    },
    cargo:    { ...INIT.cargo, deliveredQtyMT: gf('inp-delivered') },
    freight:  { ...INIT.freight, tcRatePerDay: gf('inp-tc-rate'), charterDays: gi('inp-charter'), demurrageDays: gi('inp-demurrage') },
    financing: {
      ...INIT.financing,
      creditRate:       gf('inp-credit-rate') / 100,
      lcFeePct:         gf('inp-lc-fee') / 100,
      financingDays:    gi('inp-fin-days'),
      capitalLockupDays:gi('inp-lockup'),
      lcPctOfCargo:     lcPct,
      wcSublimit:       gf('inp-wc-sublimit'),
    },
    sell,
    fx: {
      parallel: { ...INIT.fx.parallel, value: gf('inp-fxpar'),   override: null },
      nafem:    { ...INIT.fx.nafem,    value: gf('inp-fxnafem'), override: null },
    },
    channels: { exShipPct, depotPct },
    partner: {
      ...INIT.partner,
      equityProvider:     eqProvider,
      bondPct, equityPct,
      totalFundingPct:    bondPct + equityPct,
      profitSharePct:     gf('inp-profit-split') / 100,
      productAllocationPct: gf('inp-product-alloc') / 100,
    },
    tax: {
      ...INIT.tax,
      vatRate:                   gf('inp-vat-rate') / 100,
      whtFreightRate:            gf('inp-wht-rate') / 100,
      taxableSupplyProportion:   gf('inp-taxable-prop'),
      surcharge: { ...INIT.tax.surcharge, enabled: surOn, incidence: gs('sel-surcharge-inc') || 'cost' },
    },
    hedge: {
      ...INIT.hedge,
      iceHedged:       iceHedgeOn,
      route:           iceRoute,
      fixedPrice:      iceFixed,
      feePerMT:        gf('inp-ice-fee'),
      bankSpreadPerMT: gf('inp-ice-spread'),
      initialMarginPct:gf('inp-ice-margin') / 100,
      hedgedVolumeMT:  iceVol,
    },
    fxHedge: {
      ...INIT.fxHedge,
      fxHedged:    fxHedgeOn,
      route:       fxRoute,
      forwardRate: fxFwd,
      hedgeRatio:  gf('inp-fx-ratio') / 100,
      feePerUsd:   gf('inp-fx-fee'),
      spreadPerUsd:gf('inp-fx-spread'),
      initialMarginPct: gf('inp-fx-margin') / 100,
      tenorDays:        gi('inp-fx-tenor'),
      brokerFee:        gf('inp-fx-broker'),
    },
    pricing: {
      ...INIT.pricing,
      conversion: {
        ...INIT.pricing.conversion,
        litresPerMT: (needLitres && isFinite(gf('inp-litres-per-mt')) && gf('inp-litres-per-mt') > 0)
          ? gf('inp-litres-per-mt') : (INIT.pricing.conversion.litresPerMT || 1183),
      },
    },
    depot: { enabled: depotOn },
    costLines: {
      npaCargoDuesPerMT:    gf('inp-npa-per-mt'),
      portDAs:              gf('inp-port-das'),
      nimasaCabotagePct:    gf('inp-nimasa-cab')     / 100,
      nimasaFreightLevyPct: gf('inp-nimasa-freight') / 100,
      spomoCvffPct:         gf('inp-spomo')          / 100,
      ncsDocs:              gf('inp-ncs-docs'),
      marineIccPct:         gf('inp-marine-icc')     / 100,
      sgsInspection:        gf('inp-sgs'),
      portAgency:           gf('inp-port-agency'),
      allocSecurityPct:     gf('inp-alloc-security') / 100,
      bankCharges:          gf('inp-bank-charges'),
      overhead:             gf('inp-overhead'),
      contingency:          gf('inp-contingency'),
      collateralManager:    gf('inp-collateral-mgr'),
      // Storage lines handle BOTH the new ₦/L|$/MT unit schema and LOADED old-format data (legacy
      // ₦/MT throughput + ₦ lump rental). resolveStorageCostLines emits the right keys so the engine
      // never reinterprets legacy per-MT/lump values as ₦/L. Single source of truth (TISEngine).
      ...TISEngine.resolveStorageCostLines({
        depotOn,
        throughput:    { unit: gs('sel-throughput-unit') || 'NGN_PER_L', rate: gf('inp-throughput'),     legacy: _storageLegacy.throughput },
        storageRental: { unit: gs('sel-storage-unit')    || 'NGN_PER_L', rate: gf('inp-storage-rental'), legacy: _storageLegacy.storageRental },
      }),
      evaporationPct:       gf('inp-evaporation')    / 100,
      tankInsurancePct:     gf('inp-tank-insurance') / 100,
    },
  };
}

// ── Visibility updates ────────────────────────────────────────────────────
function updateLcDisplay() {
  const b = gf('inp-bond') / 100, e = gf('inp-equity') / 100;
  const lc = Math.round((1 - b - e) * 10000) / 100;
  const el = document.getElementById('lc-display');
  if (el) { el.textContent = lc.toFixed(2) + '%'; el.style.color = lc < 0 ? 'var(--red)' : ''; }
}

function updateDepotVisibility() {
  const hasDepot = _legs.some(l => l.channel === 'depot');
  show('storage-sec', hasDepot);
  show('storage-off-note', !hasDepot);
}

function updateCurrencyVisibility() {
  // Currency mode is derived from the revenue legs — no UI row to toggle.
}

function updateSurchargeVisibility() {
  const on = isOn('tog-surcharge');
  show('sur-inc-row', on);
  show('sur-off-note', !on);
}

function updateHedgeTab() {
  const iceOn = isOn('tog-ice-hedge');
  const fxOn  = isOn('tog-fx-hedge');
  show('ice-on-warn', iceOn);  show('ice-off-note', !iceOn);
  show('fx-on-warn',  fxOn);   show('fx-off-note',  !fxOn);
  const iceP = document.getElementById('ice-params');
  const fxP  = document.getElementById('fx-params');
  if (iceP) iceP.classList.toggle('hedge-off', !iceOn);
  if (fxP)  fxP.classList.toggle('hedge-off',  !fxOn);
}

function updateIceRouteVisibility() {
  const r = gs('sel-ice-route');
  show('ice-spread-row', r !== 'third_party');
  show('ice-margin-row', r === 'third_party');
}

function updateFxRouteVisibility() {
  const r = gs('sel-fx-route');
  // Bank forward → spread only; Third-party NDF → margin/tenor/broker only.
  show('fx-spread-row',       r !== 'third_party');
  show('fx-thirdparty-rows',  r === 'third_party');
  show('fx-thirdparty-note',  r === 'third_party');
}

// ── Modified state ─────────────────────────────────────────────────────────
let _modified = false;
let _currentTradeName = null;   // null = new/unsaved; string = loaded/saved trade key

// ── Storage backward-compat: which storage lines are LOADED OLD-FORMAT (no unit field) ──────
// Old-format fixtures / saved trades store throughputNgnPerMT (₦/MT) and storageRentalNgn (₦ lump),
// with NO unit field. collectTrade must emit those ORIGINAL keys (not the new ₦/L unit schema) so the
// engine's backward-compat branch reproduces the correct cost — otherwise a per-MT rate / lump is
// reinterpreted as ₦/L and storage inflates ~1183×. A line stays legacy until the trader edits its value
// or flips its unit toggle (cleared in onInputChange); new / blank trades default to the ₦/L schema.
let _storageLegacy = { throughput: false, storageRental: false };
function detectStorageLegacyFromCostLines(cl) {
  return {
    throughput:    !!cl && cl.throughputUnit    == null,
    storageRental: !!cl && cl.storageRentalUnit == null,
  };
}
function detectStorageLegacyFromSnap(snap) {
  return {
    throughput:    !snap || !('sel-throughput-unit' in snap),
    storageRental: !snap || !('sel-storage-unit'    in snap),
  };
}

function updateStateBadge() {
  const el = document.getElementById('trade-state-badge');
  if (!el) return;
  if (_currentTradeName === null) {
    el.textContent = 'New · unsaved';
    el.className = 'state-badge state-new';
  } else if (_modified) {
    el.textContent = _currentTradeName + ' · modified';
    el.className = 'state-badge state-modified';
  } else {
    el.textContent = _currentTradeName + ' · saved';
    el.className = 'state-badge state-saved';
  }
}

function setModified(v) {
  _modified = v;
  updateStateBadge();
}

// ── Reset to defaults ──────────────────────────────────────────────────────
function resetToDefaults() {
  const I = INIT;
  const f = I.financing, p = I.partner, cl = I.costLines, h = I.hedge, fxh = I.fxHedge || {};
  const sur = I.tax.surcharge || {};

  sv('inp-ice',            I.market.ice.value);
  sv('inp-ice-final',      I.market.ice.final != null ? I.market.ice.final : '');
  sv('inp-fob',            I.market.fobPremium.value);
  sv('inp-fxpar',          I.fx.parallel.value);
  sv('inp-delivered',      I.cargo.deliveredQtyMT);
  _legs = legsFromTrade(I);
  renderLegEditor();
  sv('inp-profit-split',   +(p.profitSharePct * 100).toFixed(1));
  sv('inp-fxnafem',        I.fx.nafem.value);
  sv('inp-taxable-prop',   I.tax.taxableSupplyProportion);
  sv('inp-tc-rate',        I.freight.tcRatePerDay);
  sv('inp-charter',        I.freight.charterDays);
  sv('inp-demurrage',      I.freight.demurrageDays);
  sv('inp-credit-rate',    +(f.creditRate * 100).toFixed(2));
  sv('inp-lc-fee',         +(f.lcFeePct * 100).toFixed(3));
  sv('inp-fin-days',       f.financingDays);
  sv('inp-lockup',         f.capitalLockupDays);
  sv('inp-wc-sublimit',    f.wcSublimit);
  sd('sel-equity-provider',p.equityProvider || 'partner');
  sv('inp-bond',           +(p.bondPct * 100).toFixed(2));
  sv('inp-equity',         +(p.equityPct * 100).toFixed(2));
  sv('inp-product-alloc',  +((p.productAllocationPct ?? 1) * 100).toFixed(1));
  sd('sel-surcharge-inc',  sur.incidence || 'cost');
  sv('inp-vat-rate',       +(I.tax.vatRate * 100).toFixed(2));
  sv('inp-wht-rate',       +((I.tax.whtFreightRate || 0.05) * 100).toFixed(2));
  // Costs
  sv('inp-npa-per-mt',     cl.npaCargoDuesPerMT);
  sv('inp-port-das',       cl.portDAs);
  sv('inp-ncs-docs',       cl.ncsDocs);
  sv('inp-nimasa-cab',     +(cl.nimasaCabotagePct * 100).toFixed(2));
  sv('inp-nimasa-freight', +(cl.nimasaFreightLevyPct * 100).toFixed(2));
  sv('inp-spomo',          +(cl.spomoCvffPct * 100).toFixed(2));
  sv('inp-marine-icc',     +(cl.marineIccPct * 100).toFixed(4));
  sv('inp-sgs',            cl.sgsInspection);
  sv('inp-port-agency',    cl.portAgency);
  sv('inp-alloc-security', +(cl.allocSecurityPct * 100).toFixed(4));
  sv('inp-bank-charges',   cl.bankCharges);
  sv('inp-overhead',       cl.overhead);
  sv('inp-contingency',    cl.contingency);
  sv('inp-collateral-mgr', cl.collateralManager);
  sv('inp-throughput',     cl.throughputUnit ? cl.throughputRate : (cl.throughputNgnPerMT || cl.throughput || 0));
  sv('inp-storage-rental', cl.storageRentalUnit ? cl.storageRentalRate : (cl.storageRentalNgn || cl.storageRental || 0));
  sd('sel-throughput-unit',cl.throughputUnit || 'NGN_PER_L');
  sd('sel-storage-unit',   cl.storageRentalUnit || 'NGN_PER_L');
  _storageLegacy = detectStorageLegacyFromCostLines(cl);
  syncAllStorageUnits();
  sv('inp-evaporation',    +(cl.evaporationPct * 100).toFixed(4));
  sv('inp-tank-insurance', +(cl.tankInsurancePct * 100).toFixed(4));
  sv('inp-litres-per-mt',  I.pricing.conversion.litresPerMT);
  // Hedge
  sd('sel-ice-route',      h.route || 'bank_book');
  sv('inp-ice-fixed',      h.fixedPrice != null ? h.fixedPrice : '');
  sv('inp-ice-fee',        h.feePerMT || 1.5);
  sv('inp-ice-spread',     h.bankSpreadPerMT || 0.5);
  sv('inp-ice-margin',     +((h.initialMarginPct || 0.10) * 100).toFixed(1));
  sv('inp-ice-hedged-vol', h.hedgedVolumeMT != null ? h.hedgedVolumeMT : '');
  sd('sel-fx-route',       fxh.route || 'bank_book');
  sv('inp-fx-forward',     fxh.forwardRate != null ? fxh.forwardRate : '');
  sv('inp-fx-ratio',       +((fxh.hedgeRatio != null ? fxh.hedgeRatio : 1) * 100).toFixed(1));
  sv('inp-fx-fee',         0.003);
  sv('inp-fx-spread',      0.001);
  sv('inp-fx-margin',      +(0.10 * 100).toFixed(1));
  sv('inp-fx-tenor',       fxh.tenorDays != null ? fxh.tenorDays : 30);
  sv('inp-fx-broker',      fxh.brokerFee != null ? fxh.brokerFee : 0);
  // Toggles
  activateToggle(document.getElementById('tog-ice-hedge'), !!h.iceHedged);
  activateToggle(document.getElementById('tog-fx-hedge'),  !!fxh.fxHedged);
  activateToggle(document.getElementById('tog-surcharge'), !!(sur.enabled));
  // Identity
  sv('inp-trade-name',    (I.meta.tradeName||'').replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample)[^)]*\)/gi,'').trim());
  sv('inp-partner-name',  (I.parties||{}).partner   || '');
  sv('inp-supplier-name', (I.parties||{}).supplier  || '');
  sv('inp-inspector-name',(I.parties||{}).inspector || '');
  _isSample = INIT_IS_SAMPLE;
  _currentTradeName = null;
  const selRTD = document.getElementById('sel-saved-trades');
  if (selRTD) selRTD.value = '';
  // UI state
  updateLcDisplay();
  updateDepotVisibility();
  updateCurrencyVisibility();
  updateSurchargeVisibility();
  updateHedgeTab();
  updateIceRouteVisibility();
  updateFxRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
}

// ── Render helpers ─────────────────────────────────────────────────────────
function infoRow(label, value, extra) {
  return \`<div class="info-row"><span>\${esc(label)}</span><b>\${value ?? '—'}</b>\${extra ? \` \${extra}\` : ''}</div>\`;
}

// Calm pending card shown in the waterfall slot before a sell price is entered.
// Per-leg pricing status: how many legs have a price, and which ones don't.
function legPricingStatus(trade) {
  var legs = (trade && trade.revenueLegs) || [];
  var unpriced = [];
  for (var i = 0; i < legs.length; i++) {
    var l = legs[i];
    if (!(isFinite(l.price) && l.price > 0)) {
      unpriced.push((unpriced.length + 1) + '. ' + l.channel + (l.pricingUnit === 'NGN_PER_L' ? ' ₦/L' : ' $/MT'));
    }
  }
  return { total: legs.length, priced: legs.length - unpriced.length, unpriced: unpriced };
}

function renderPricePending(status) {
  var s = status || { total: 0, priced: 0, unpriced: [] };
  var headline = s.total > 0 ? (s.priced + ' of ' + s.total + ' legs priced') : 'Add a revenue leg';
  var awaiting = s.unpriced.length ? ' Awaiting a price for: ' + esc(s.unpriced.join('  ·  ')) + '.' : '';
  return \`<section class="section" aria-labelledby="wf-h">
  <h2 class="section-heading" id="wf-h">Profit Waterfall</h2>
  <div class="card">
    <div class="empty-state" style="padding:36px 24px">
      <p class="empty-state-title">P&amp;L pending — \${esc(headline)}</p>
      <p class="empty-state-sub">The cost build-up and pricing ladder below are ready. Enter a price for every revenue leg to compute TIS Net Profit, ex-ship margin, partner split and sensitivities.\${awaiting}</p>
    </div>
  </div>
</section>\`;
}

// ── KPI chips ──────────────────────────────────────────────────────────────
function renderKPIs(res, hasSellPrice) {
  const kv = document.getElementById('kpi-tisnet-val');
  const ks = document.getElementById('kpi-tisnet-sub');
  const av  = document.getElementById('kpi-annret-val');
  const as_ = document.getElementById('kpi-annret-sub');
  const mv = document.getElementById('kpi-margin-val');
  const ms = document.getElementById('kpi-margin-sub');
  const ml = document.getElementById('kpi-margin-label');
  // The margin KPI tracks whichever channel the trade actually sells through: ex-ship $/MT margin
  // when an ex-ship leg is priced, else depot ₦/L margin on a depot trade. Avoids a dead "Ex-Ship
  // Margin ——" slot on depot-only trades.
  const depotActiveKpi = !!(res && res.channels && res.channels.depotPct > 0);

  // Colour the TIS Net chip by sign: green only for a positive net; deep-red for a genuine
  // loss; neutral when pending (no value). Green is never used for a real negative (Batch C).
  const netChip = kv ? kv.closest('.kpi-chip') : null;
  function setNetChip(state) {
    if (!netChip) return;
    netChip.classList.toggle('kpi-accent', state === 'pos');
    netChip.classList.toggle('kpi-loss',   state === 'loss');
  }

  // Sticky condensed KPI mirror (Batch G) — same #sticky-tisnet-val element
  // updated in both branches below, right alongside the real #kpi-tisnet-val,
  // so the two can never show different numbers.
  const stickyVal = document.getElementById('sticky-tisnet-val');

  // P&L KPIs are pending until every leg has a price — show calm placeholders, no fake numbers.
  if (hasSellPrice === false) {
    setNetChip('neutral');
    if (kv) kv.textContent = '—';
    if (ks) ks.textContent = 'enter leg prices for P&L';
    if (av) av.textContent = '—';
    if (as_) as_.textContent = 'enter leg prices';
    if (ml) ml.textContent = depotActiveKpi ? 'Depot Margin' : 'Ex-Ship Margin';
    if (mv) mv.textContent = '—';
    if (ms) ms.textContent = 'enter leg prices';
    if (stickyVal) stickyVal.textContent = '—';
    return;
  }

  const p   = res.profit;
  const tisNet = p.tisNetAfterSurcharge;
  setNetChip(tisNet < 0 ? 'loss' : 'pos');
  if (kv) { kv.textContent = fmtUsd(tisNet); kv.classList.add('kpi-flash'); setTimeout(() => kv.classList.remove('kpi-flash'), 350); }
  if (ks) ks.textContent = res.equityProvider === 'TIS' ? 'self-funded (no partner)' : 'after partner split';
  if (stickyVal) stickyVal.textContent = fmtUsd(tisNet);

  const ann = res.tisAnnualisedReturn;
  if (av) av.textContent = ann != null ? fmtPct(ann) : '—';
  if (as_) as_.textContent = \`on \${res.annualReturnBaseLabel||'bank LC mobilised'} · \${res.financing.capitalLockupDays}d lockup\`;

  const landed = res.price.exShipLandedPerMT;
  const price  = res.price.exShipPricePerMT;
  const exMargin = (price && landed) ? (price - landed) / price : null;
  if (exMargin != null) {
    // Ex-ship leg priced — show ex-ship margin (unchanged behaviour for ex-ship/split trades).
    if (ml) ml.textContent = 'Ex-Ship Margin';
    if (mv) mv.textContent = fmtPct(exMargin);
    if (ms) ms.textContent = fmtUsd(price) + '/MT sell';
  } else if (depotActiveKpi
      && isFinite(res.price.depotPriceUSDperMT) && res.price.depotPriceUSDperMT > 0
      && isFinite(res.price.depotLandedPerMT)) {
    // Depot-only (or no ex-ship price) — show the depot margin instead of a dead slot.
    const dp_ = res.price.depotPriceUSDperMT;
    const dMargin = (dp_ - res.price.depotLandedPerMT) / dp_;
    if (ml) ml.textContent = 'Depot Margin';
    if (mv) mv.textContent = fmtPct(dMargin);
    if (ms) ms.textContent = isFinite(res.price.depotPriceNgnPerL)
      ? fmtNum(res.price.depotPriceNgnPerL, 0) + ' ₦/L sell'
      : fmtUsd(dp_) + '/MT sell';
  } else {
    if (ml) ml.textContent = depotActiveKpi ? 'Depot Margin' : 'Ex-Ship Margin';
    if (mv) mv.textContent = '—';
    if (ms) ms.textContent = '—';
  }
}

// ── 1. Profit Waterfall ────────────────────────────────────────────────────
// Bars float between cumulative running totals read DIRECTLY from res — never
// recomputed here. "total" steps (start/subtotal/terminal) run from 0 to the
// engine's own value; "delta" steps float between the engine's own before/
// after totals (e.g. Margin Foregone floats between res.profit.standaloneProfit
// and res.profit.adjustedProfit — the NEXT total step's own value, not
// standalone-minus-marginForegone computed here) so consecutive bars line up
// by construction from the engine's own identities (marginForegone+adjusted=
// standalone; partnerCash+tisNet=adjusted) — no chart-side subtraction that
// could ever drift from what the engine actually produced.
function buildWaterfallSteps(res) {
  const p = res.profit, qty = res.quantities, ep = res.equityProvider;
  if (ep === 'TIS') {
    const revenue = res.revenue.combinedUSD, net = p.tisNetProfit;
    return [
      { label: 'Revenue', sub: 'Combined channels', kind: 'total', value: revenue, before: 0, after: revenue, prefix: '' },
      { label: 'All-in Cost', sub: 'Incl. irrecoverable VAT', kind: 'delta', before: revenue, after: net },
      { label: 'TIS Net Profit', sub: 'Self-funded — no partner', kind: 'total', value: net, before: 0, after: net, prefix: '=', terminal: true },
    ];
  }
  const standalone = p.standaloneProfit, adjusted = p.adjustedProfit, net = p.tisNetProfit;
  return [
    { label: 'Standalone Profit', sub: 'TIS as 100% owner', kind: 'total', value: standalone, before: 0, after: standalone, prefix: '' },
    { label: 'Margin Foregone', sub: fmtMt(qty.economic.partnerTonnes, 2) + ' partner tonnes', kind: 'delta', before: standalone, after: adjusted },
    { label: 'Adjusted Profit', sub: 'TIS retained tonnes share', kind: 'total', value: adjusted, before: 0, after: adjusted, prefix: '=' },
    { label: 'Partner Cash Share', sub: fmtPct(p.profitSharePct) + ' of adjusted', kind: 'delta', before: adjusted, after: net },
    { label: 'TIS Net Profit', sub: fmtPct(1 - p.profitSharePct) + ' of adjusted', kind: 'total', value: net, before: 0, after: net, prefix: '=', terminal: true },
  ];
}

// viewBox is a fixed logical 1000x220 coordinate system, scaled responsively
// via width:100% (same technique as ladderScale's percentage positioning) —
// proportions hold at any rendered card width. Geometry is computed once and
// shared between the SVG bars/guides/value-labels and the HTML column-label
// row below, so the two can never drift out of alignment with each other.
function renderWaterfallChart(steps) {
  const W = 1000, H = 220, padX = 16, padTop = 36, padBottom = 36;
  const plotW = W - padX * 2, plotH = H - padTop - padBottom;
  const n = steps.length;
  const gap = n > 1 ? (plotW * 0.10) / (n - 1) : 0;
  const barW = (plotW - gap * (n - 1)) / n;

  const allLevels = steps.flatMap(s => [s.before, s.after]).concat([0]);
  const domLo = Math.min(...allLevels), domHi = Math.max(...allLevels);
  const domRange = (domHi - domLo) || 1; // guard: degenerate all-zero/flat domain never divides by zero
  function yFor(v) { return padTop + plotH - ((v - domLo) / domRange) * plotH; }

  const bars = steps.map((s, i) => {
    const x = padX + i * (barW + gap);
    const yA = yFor(s.before), yB = yFor(s.after);
    const yTop = Math.min(yA, yB);
    const h = Math.max(1.5, Math.abs(yA - yB)); // 1.5px hairline floor — a true-zero delta still renders visibly
    const isTerminal = !!s.terminal;
    // FT/consulting convention: totals are anchors (neutral/ink); intermediate bars
    // are DIRECTION-CODED (rising=positive fill, falling=negative). Direction also
    // carried by the +/- sign on the label and the leading-edge tick — never color alone.
    let cls, tick = '';
    if (s.kind === 'total') {
      if (!isTerminal) cls = 'wfsvg-bar-neutral';
      else { cls = s.after < 0 ? 'wfsvg-bar-loss-terminal' : 'wfsvg-bar-terminal'; }
    } else {
      const rising = s.after >= s.before;
      cls = rising ? 'wfsvg-bar-up' : 'wfsvg-bar-down';
      // leading-edge accent tick (left edge — consistent for rises and falls)
      tick = \`<line class="\${rising ? 'wfsvg-tick-up' : 'wfsvg-tick-down'}" x1="\${(x + 2).toFixed(1)}" y1="\${yTop.toFixed(1)}" x2="\${(x + 2).toFixed(1)}" y2="\${(yTop + h).toFixed(1)}"></line>\`;
    }

    // Total steps print the engine's own value (fmtUsd already handles the lone
    // sign). Delta steps derive sign from the GEOMETRIC delta (after-before),
    // not from the underlying named field — so a structurally-unusual negative
    // Margin Foregone / Partner Cash Share (e.g. selling below landed cost)
    // never produces a double minus sign the way string-concatenating a
    // hardcoded '−' prefix onto an already-negative fmtUsd() value would.
    let valueText;
    if (s.kind === 'total') {
      valueText = s.prefix + fmtUsd(s.value);
    } else {
      const delta = s.after - s.before;
      valueText = (delta < 0 ? '−' : '+') + fmtUsd(Math.abs(delta));
    }
    const placeAbove = (yTop - padTop) >= 16;
    const labelY = placeAbove ? yTop - 10 : yTop + h + 16;
    return { x, yTop, h, cls, tick, valueText, labelY, mid: x + barW / 2, label: s.label, sub: s.sub };
  });

  const zeroY = yFor(0);
  const zeroLine = \`<line class="wfsvg-zero" x1="\${padX}" y1="\${zeroY.toFixed(1)}" x2="\${W - padX}" y2="\${zeroY.toFixed(1)}"></line>\`;
  const guides = [];
  for (let i = 0; i < n - 1; i++) {
    const xEnd = padX + i * (barW + gap) + barW;
    const xStart = padX + (i + 1) * (barW + gap);
    const y = yFor(steps[i].after);
    guides.push(\`<line class="wfsvg-guide" x1="\${xEnd.toFixed(1)}" y1="\${y.toFixed(1)}" x2="\${xStart.toFixed(1)}" y2="\${y.toFixed(1)}"></line>\`);
  }

  const barsHtml = bars.map(b => \`<g>
    <title>\${esc(b.label + ': ' + b.valueText)}</title>
    <rect class="wfsvg-bar \${b.cls}" x="\${b.x.toFixed(2)}" y="\${b.yTop.toFixed(2)}" width="\${barW.toFixed(2)}" height="\${b.h.toFixed(2)}" rx="3"></rect>
    \${b.tick}
    <text class="wfsvg-value" x="\${b.mid.toFixed(1)}" y="\${b.labelY.toFixed(1)}" text-anchor="middle">\${esc(b.valueText)}</text>
  </g>\`).join('');

  const chartSummary = \`Profit waterfall, \${steps.length} steps: \${bars.map(b => b.label + ' ' + b.valueText).join(', ')}\`;
  const svg = \`<svg class="wfsvg" viewBox="0 0 \${W} \${H}" role="img" aria-label="\${esc(chartSummary)}">
    \${zeroLine}\${guides.join('')}\${barsHtml}
  </svg>\`;

  const labels = bars.map(b => {
    const xPct = (b.x / W * 100).toFixed(2), wPct = (barW / W * 100).toFixed(2);
    return \`<div class="wfsvg-collabel" style="left:\${xPct}%;width:\${wPct}%">
      <div class="wfsvg-collabel-name">\${esc(b.label)}</div>
      <div class="wfsvg-collabel-sub">\${esc(b.sub)}</div>
    </div>\`;
  }).join('');

  return \`<div class="wfsvg-wrap">\${svg}</div><div class="wfsvg-collabels">\${labels}</div>
  <div class="wfsvg-legend">
    <span><span class="lg-swatch lg-total"></span> Total / anchor</span>
    <span><span class="lg-swatch lg-up"></span> Increases profit</span>
    <span><span class="lg-swatch lg-down"></span> Decreases profit</span>
    <span class="muted">— running totals connected; sign shown on every step</span>
  </div>\`;
}

function renderWaterfall(res) {
  const p   = res.profit;
  const ep  = res.equityProvider;
  const rec = p.reconciliation;
  const okMark = rec.ok
    ? \`<span class="bdg bdg-recoverable">&#10003; OK</span>\`
    : \`<span class="bdg bdg-confirm">MISMATCH</span>\`;

  const steps = buildWaterfallSteps(res);
  const chartHtml = renderWaterfallChart(steps);

  const hedgeNote = (res.hedges.iceHedgeNetImpact !== 0 || res.hedges.fxHedgeNetImpact !== 0)
    ? \`ICE hedge impact: <b>\${fmtUsdSign(res.hedges.iceHedgeNetImpact)}</b> &nbsp;·&nbsp; FX hedge: <b>\${fmtUsdSign(res.hedges.fxHedgeNetImpact)}</b> &nbsp;·&nbsp;\`
    : '';

  const reconcile = ep === 'TIS'
    ? \`Revenue − cost = TIS net: <b>\${fmtUsd(res.revenue.combinedUSD)} − \${fmtUsd(res.cost.allInCost)} = \${fmtUsd(p.tisNetAfterSurcharge)}</b>\`
    : \`Reconciliation: marginForegone + adjusted = standalone <b>\${fmtUsd(p.marginForegone)} + \${fmtUsd(p.adjustedProfit)} = \${fmtUsd(p.standaloneProfit)}</b> \${okMark}\`;

  return \`<section class="section" aria-labelledby="wf-h">
  <h2 class="section-heading" id="wf-h">Profit Waterfall</h2>
  <div class="card">
    \${chartHtml}
    <div class="wf-reconcile">
      \${hedgeNote}
      \${reconcile}
      &nbsp;·&nbsp; Annualised return: <b>\${fmtPct(res.tisAnnualisedReturn)}</b> on \${esc(res.annualReturnBaseLabel||'bank LC mobilised')} · \${res.financing.capitalLockupDays}d lockup
    </div>
    <div class="card-footer">
      Unit FOB: <b>\${fmtUsd(res.unitFob)}/MT</b> &nbsp;·&nbsp;
      Ex-ship landed: <b>\${fmtUsd(res.price.exShipLandedPerMT)}/MT</b> &nbsp;·&nbsp;
      Equity stack: <b>\${fmtPct(res.financing.pct.bondPct,1)} bond + \${fmtPct(res.financing.pct.equityPct,1)} equity + \${fmtPct(res.financing.pct.lcPct,1)} LC</b>
    </div>
  </div>
</section>\`;
}

// ── 2. Pricing Ladder ──────────────────────────────────────────────────────
// Gradient price-scale bar shared by BOTH ladders (ex-ship $/MT and depot NGN/L). Positions each tier
// pip across the gradient and draws an optional current-price marker tick. The values/cur args are in
// the ladder's NATIVE unit; fmtLabel(cur) formats the marker caption. Identical markup for both ladders,
// so the depot NGN/L ladder gets the same bar + marker the ex-ship ladder already had (no regression to
// the ex-ship output — this reproduces its prior inline markup byte-for-byte).
function ladderScale(values, names, cur, fmtLabel) {
  if (!values || values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = (hi - lo) || 1;
  const pips = values.map((v, i) => {
    const pos = ((v - lo) / range * 80 + 10).toFixed(1);
    const altCls = i % 2 === 1 ? ' alt' : '';
    return \`<span class="ladder-tier-pip\${altCls}" style="left:\${pos}%">\${esc(names[i])}</span>\`;
  }).join('');
  let tick = '';
  if (cur != null && isFinite(cur) && cur >= lo - (range*0.1) && cur <= hi + (range*0.1)) {
    const pos = ((cur - lo) / range * 80 + 10).toFixed(1);
    tick = \`<div class="ladder-scale-tick" style="left:\${pos}%" data-label="\${esc(fmtLabel(cur))}"></div>\`;
  }
  return \`<div class="ladder-scale-wrap chart-frame" style="padding-top:28px">
        <div class="ladder-scale-bar">\${pips}\${tick}</div>
      </div>\`;
}

// Surfaces the engine's ladders, each in its NATIVE unit: an ex-ship $/MT ladder
// (margin-of-sell tiers) and a depot ₦/L ladder (absolute-spread tiers), plus the
// engine's cross-leg comparison. Show only the ladders relevant to the trade's legs.
function renderLadder(trade, res, ladder) {
  if (!ladder) return '';
  const legs = (trade && trade.revenueLegs) || [];
  const hasExShip = legs.some(l => l.channel === 'ex-ship');
  const depotApplicable = !!(ladder.depot && ladder.depot.applicable && ladder.depot.tiers && ladder.depot.tiers.length);
  const bothLadders = hasExShip && depotApplicable;
  // Current ex-ship price for the marker, in the ladder's $/MT unit. For a native ₦/L-priced ex-ship
  // leg res.price.exShipPricePerMT is null (no USD leg), so fall back to the leg's USD-EQUIVALENT
  // (revenue.legs[].priceUsdPerMT, already at NAFEM) — but ONLY when the trader actually entered a
  // price (the trade leg's price is finite, not the suppressed synthetic run), so the no-price state
  // still shows no marker. (GAP 3.)
  let curPrice = res.price.exShipPricePerMT;
  if (curPrice == null) {
    const tLeg = legs.find(l => l.channel === 'ex-ship');
    const rLeg = ((res.revenue && res.revenue.legs) || []).find(l => l.channel === 'ex-ship');
    if (tLeg && isFinite(tLeg.price) && tLeg.price > 0 && rLeg && isFinite(rLeg.priceUsdPerMT) && rLeg.priceUsdPerMT > 0) {
      curPrice = rLeg.priceUsdPerMT;
    }
  }
  const landed   = res.price.exShipLandedPerMT;

  // Naira-equivalent converter for ex-ship USD prices (trader-on-a-call reference).
  // RULE 1 (2026-06-23): naira<->USD settles at NAFEM, so this ₦/L-equiv uses NAFEM — matching the
  // leg-editor ₦/L hint and the depot ladder. (Display-only reference; per-tier P&L is engine-computed.)
  const ladderNafem  = (trade && trade.fx && trade.fx.nafem && isFinite(trade.fx.nafem.value) && trade.fx.nafem.value > 0) ? trade.fx.nafem.value : null;
  const ladderLitres   = (trade && trade.pricing && trade.pricing.conversion && isFinite(trade.pricing.conversion.litresPerMT) && trade.pricing.conversion.litresPerMT > 0) ? trade.pricing.conversion.litresPerMT : null;
  const ngnEquivSpan = usd => (ladderNafem && ladderLitres)
    ? \` <span class="ladder-ngn-equiv muted">· ₦\${Math.round((usd * ladderNafem) / ladderLitres).toLocaleString('en-US')}/L</span>\`
    : '';

  // ----- Ex-ship $/MT ladder (only when an ex-ship leg exists) -----
  let exShipBlock = '';
  const exShip = ladder.exShip;
  if (hasExShip && exShip && exShip.tiers && exShip.tiers.length) {
    const tiers = exShip.tiers;
    const scaleHtml = ladderScale(
      tiers.map(t => t.pricePerMT),
      tiers.map(t => t.name),
      curPrice,
      v => fmtUsd(v) + '/MT'
    );
    const tierRows = tiers.map(tier => {
      const isCur = curPrice != null && Math.abs(tier.pricePerMT - curPrice) < 0.005;
      return \`<tr class="\${isCur ? 'ladder-current' : ''}">
        <td><b>\${esc(tier.name)}</b></td>
        <td class="r">\${fmtUsd(tier.pricePerMT)}/MT\${ngnEquivSpan(tier.pricePerMT)}</td>
        <td class="r">\${fmtPct(tier.marginPctOfSell)}</td>
        <td class="r">\${fmtPct(tier.markupPctOnCost)}</td>
        <td class="r">\${fmtUsd(tier.spreadPerMT)}/MT</td>
        <td class="r \${tier.tisNetAfterSurcharge >= 0 ? 'pos' : 'loss'}">\${fmtUsd(tier.tisNetAfterSurcharge)}</td>
      </tr>\`;
    }).join('');
    // Label the ex-ship ladder only when a depot ladder is also shown (preserves the
    // single-ladder look for ex-ship-only / legacy trades — no regression).
    const subHead = bothLadders ? '<h3 class="ladder-sub">Ex-Ship $/MT Ladder</h3>' : '';
    exShipBlock = \`\${subHead}\${scaleHtml}
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr><th>Tier</th><th class="r">Price/MT</th><th class="r">Margin of Sell</th><th class="r">Markup on Landed</th><th class="r">Spread/MT</th><th class="r">TIS Net</th></tr></thead>
      <tbody>\${tierRows}</tbody>
    </table></div>\`;
  }

  // ----- Depot ₦/L ladder (absolute-spread tiers; native naira) -----
  let depotBlock = '';
  if (depotApplicable) {
    // Gradient bar + tier pips + current-price marker, in the depot's native ₦/L unit (GAP 2 — parity
    // with the ex-ship ladder bar). Marker = the trader's entered depot price (null in the no-price
    // state, so no phantom marker — the synthetic ₦/L is suppressed in recompute()).
    const curDepot = res.price.depotPriceNgnPerL;
    const depotScaleHtml = ladderScale(
      ladder.depot.tiers.map(t => t.priceNgnPerL),
      ladder.depot.tiers.map(t => t.name),
      curDepot,
      v => fmtNum(v, 2) + ' ₦/L'
    );
    const depotRows = ladder.depot.tiers.map(tier => {
      const isCur = curDepot != null && isFinite(curDepot) && Math.abs(tier.priceNgnPerL - curDepot) < 0.005;
      const net = (tier.tisNetAfterSurcharge == null)
        ? '<span class="muted">PENDING</span>'
        : \`<span class="\${tier.tisNetAfterSurcharge >= 0 ? 'pos' : 'loss'}">\${fmtUsd(tier.tisNetAfterSurcharge)}</span>\`;
      return \`<tr class="\${isCur ? 'ladder-current' : ''}">
        <td><b>\${esc(tier.name)}</b></td>
        <td class="r">\${fmtNum(tier.priceNgnPerL, 2)} ₦/L</td>
        <td class="r">\${fmtNum(tier.spreadNgnPerL, 0)} ₦/L</td>
        <td class="r">\${fmtPct(tier.marginPctOfSell)}</td>
        <td class="r">\${fmtPct(tier.markupPctOnCost)}</td>
        <td class="r">\${net}</td>
      </tr>\`;
    }).join('');
    depotBlock = \`<h3 class="ladder-sub">Depot ₦/L Ladder</h3>\${depotScaleHtml}
    <div class="tbl-wrap"><table class="data-table">
      <thead><tr><th>Tier</th><th class="r">Price ₦/L</th><th class="r">Spread ₦/L</th><th class="r">Margin %</th><th class="r">Markup on Landed</th><th class="r">TIS Net</th></tr></thead>
      <tbody>\${depotRows}</tbody>
    </table></div>\`;
  }

  // ----- Cross-leg comparison (engine output; only when BOTH legs actually exist) -----
  // The engine still emits a comparison (with a hypothetical ex-ship tier) on a depot-only trade,
  // but an ex-ship-vs-depot spread is meaningless without a real ex-ship channel. Gate the display
  // on bothLadders so depot-only / ex-ship-only trades don't show a phantom cross-leg comparison.
  // (UI-only — the engine output is untouched.)
  let compBlock = '';
  const cmp = ladder.comparison;
  if (bothLadders && cmp && cmp.applicable && cmp.exShip && cmp.depot) {
    const winner = cmp.depotEarnsMoreAbsolute ? 'Depot' : 'Ex-ship';
    compBlock = \`<div class="ladder-compare">
      <b>Cross-leg spread</b> (common ₦/L): Ex-ship <b>\${esc(cmp.exShip.tier)}</b> \${fmtNum(cmp.exShip.spreadNgnPerL, 1)} ₦/L
      vs Depot <b>\${esc(cmp.depot.tier)}</b> \${fmtNum(cmp.depot.spreadNgnPerL, 1)} ₦/L — <b>\${winner}</b> earns the larger absolute spread.
      <div class="lc-rationale">\${esc(cmp.rationale || '')}</div>
    </div>\`;
  }

  // ----- Footer: landed-cost bases in native units -----
  const footerParts = [];
  if (hasExShip) {
    footerParts.push(\`Ex-ship landed: <b>\${fmtUsd(landed)}/MT</b>\`);
    if (curPrice != null) footerParts.push(\`Current price: <b>\${fmtUsd(curPrice)}/MT</b>\`);
  }
  if (depotApplicable && ladder.depot.costBaseNgnPerL != null) {
    footerParts.push(\`Depot landed: <b>\${fmtNum(ladder.depot.costBaseNgnPerL, 2)} ₦/L</b>\`);
  }

  return \`<section class="section" aria-labelledby="ladder-h">
  <h2 class="section-heading" id="ladder-h">Pricing Ladder <span class="muted" style="font-size:11px;font-weight:400;letter-spacing:0;text-transform:none">— advisory only</span></h2>
  <div class="card">
    \${exShipBlock}
    \${depotBlock}
    \${compBlock}
    <div class="card-footer">
      \${footerParts.join(' &nbsp;·&nbsp; ')}
    </div>
  </div>
</section>\`;
}

// ── 3. Cost Build-Up ───────────────────────────────────────────────────────
function renderCost(res) {
  const cost = res.cost;
  const catLabel = c => ({ per_mt:'Per MT', derived_freight:'Freight', derived_financing:'Financing',
    flat:'Fixed fee', storage:'Storage', pct_of_freight:'% of freight',
    pct_of_cargo_value:'% of cargo', pct_of_services:'% of services',
    pct_of_LC:'% of LC', pct_of_sell:'% of sell', derived:'Derived' }[c] || c);

  const rows = cost.lines.map(l => \`<tr>
    <td class="muted" style="font-variant-numeric:tabular-nums">\${l.id}</td>
    <td>\${esc(l.label)}\${l.legalRef ? \`<div class="legal-ref">\${esc(l.legalRef)}</div>\` : ''}</td>
    <td class="muted">\${catLabel(l.category)}</td>
    <td class="r">\${l.amountUsd === 0 && l.category === 'storage' ? '<span class="muted">—</span>' : fmtUsd(l.amountUsd)}</td>
    <td>\${l.recoverable ? \`<span class="bdg bdg-recoverable" title="Recoverable input VAT">&#10003; OK</span>\` : badge(l.status)}</td>
  </tr>\`).join('');

  const rv = cost.recoverableVat;
  const sb = cost.servicesBucket;
  const vatBase = \`<tr class="total" style="border-top:1px solid var(--g-hairline)">
    <td colspan="2"><b>VAT base (services bucket)</b><div class="legal-ref">\${sb.composition.map(x => esc(x.label)).join(', ')}</div></td>
    <td class="muted">% of services</td>
    <td class="r">\${fmtUsd(sb.sum)}</td>
    <td></td>
  </tr>\`;
  const recRows = rv.lines.map(l => \`<tr class="tc-rec-row">
    <td colspan="2" class="muted" style="padding-left:22px">↩ \${esc(l.label)} (recoverable s.155(4))</td>
    <td></td><td class="r muted">\${fmtUsd(l.amount)}</td><td></td>
  </tr>\`).join('');

  return \`<section class="section" aria-labelledby="cost-h">
  <h2 class="section-heading" id="cost-h">Cost Build-Up</h2>
  <div class="card">
    <div class="tbl-wrap"><table class="cost-table data-table">
      <thead><tr><th>#</th><th>Line</th><th>Category</th><th class="r">USD</th><th>Flag</th></tr></thead>
      <tbody>\${rows}\${vatBase}\${recRows}</tbody>
    </table></div>
    <div class="cost-totals summary-strip">
      <div class="cost-total-row"><span>All-in cost (incl. irrecoverable VAT):</span><b>\${fmtUsd(cost.allInCost)}</b></div>
      <div class="cost-total-row"><span>Recoverable VAT (timing only, s.155(4)):</span><b>\${fmtUsd(rv.recoverable)}</b></div>
      <div class="cost-total-row"><span>Landed cost / MT (ex-ship, excl. storage):</span><b>\${fmtUsd(cost.exShipLandedPerMT)}/MT</b></div>
    </div>
    <div class="card-footer">
      Freight base: TC hire <b>\${fmtUsd(cost.freight.tcHire)}</b> + demurrage <b>\${fmtUsd(cost.freight.demurrage)}</b> = <b>\${fmtUsd(cost.freight.freightBase)}</b>
      \${cost.storageActive ? '&nbsp;·&nbsp; Storage active (depot leg)' : ''}
    </div>
    <div class="status-legend">
      <span class="sl-item"><span class="sl-check">&#10003;</span><span class="sl-key">No badge</span>Verified — confirmed vs statute or contract</span>
      <span class="sl-item"><span class="bdg bdg-indicative">INDICATIVE</span><span class="sl-key" style="margin-left:2px">Indicative</span>Reasonable estimate; fine to model, not contractual</span>
      <span class="sl-item"><span class="bdg bdg-unverified">&#9888;&#xFE0E;&nbsp;UNVERIFIED</span><span class="sl-key" style="margin-left:2px">Unverified</span>Needs confirmation before live trading</span>
    </div>
  </div>
</section>\`;
}

// ── 4. Partner Deliverables ────────────────────────────────────────────────
function renderPartner(trade, res) {
  const pd  = res.partnerDelivers;
  const q   = res.quantities;
  const ep  = res.equityProvider;

  if (ep === 'TIS') {
    return \`<section class="section" aria-labelledby="partner-h">
    <h2 class="section-heading" id="partner-h">Equity Structure</h2>
    <div class="card card-body">
      <p class="muted" style="font-size:12px;margin-bottom:10px">\${esc(pd.note)}</p>
      <div class="info-block">
        \${infoRow('Cargo value', fmtUsd(res.cargoValue))}
        \${infoRow('Partner funding (self)', fmtUsd(res.financing.partnerFunding))}
        \${infoRow('Standalone = Adjusted = TIS net', fmtUsd(res.profit.tisNetProfit))}
      </div>
    </div>
    </section>\`;
  }

  const pp = q.paper;
  return \`<section class="section" aria-labelledby="partner-h">
  <h2 class="section-heading" id="partner-h">Partner Deliverables</h2>
  <div class="card card-body">
    <p class="muted" style="font-size:11px;margin-bottom:12px">\${esc(pd.note)}</p>
    <div class="two-col-grid">
      <div>
        <div class="info-block">
          <div class="info-sub">(1) Product Received</div>
          \${infoRow('Tonnes (economic)', fmtMt(q.economic.partnerTonnes, 2))}
          \${infoRow('Valued at ex-ship landed', fmtUsd(pd.productReceived?.valuedAtExShipLandedCost))}
          \${infoRow('= Principal at par', fmtUsd(res.financing.partnerFunding))}
        </div>
        <div class="info-block">
          <div class="info-sub">(2) Cash Received</div>
          \${infoRow('Profit share ('+fmtPct(res.profit.profitSharePct)+')', fmtUsd(pd.cashReceived?.profitShare))}
          \${pd.cashReceived?.principalCashPortion > 0 ? infoRow('Principal cash portion', fmtUsd(pd.cashReceived?.principalCashPortion)) : ''}
          \${infoRow('Settlement true-up', fmtUsd(pd.cashReceived?.settlementTrueUp))}
        </div>
      </div>
      <div>
        <div class="info-block">
          <div class="info-sub">Funding Stack</div>
          \${infoRow('Partner bond ('+fmtPct(res.financing.pct.bondPct,1)+')', fmtUsd(res.financing.performanceBond))}
          \${infoRow('Partner equity ('+fmtPct(res.financing.pct.equityPct,1)+')', fmtUsd(res.financing.equity))}
          \${infoRow('Bank LC ('+fmtPct(res.financing.pct.lcPct,1)+')', fmtUsd(res.financing.lc))}
        </div>
        \${pp ? \`<div class="info-block">
          <div class="info-sub">Paper vs Economic Quantities</div>
          \${infoRow('Partner economic', fmtMt(q.economic.partnerTonnes, 2))}
          \${infoRow('Partner paper (nearest 50)', fmtMt(pp.partnerPaper, 0) + ' ↓ TIS favour')}
          \${infoRow('Settlement cash true-up', fmtUsd(pp.cashTrueUp))}
        </div>\` : ''}
      </div>
    </div>
    <div class="tie-out-box summary-strip">
      Principal tie-out: owed <b>\${fmtUsd(res.financing.partnerFunding)}</b> = product <b>\${fmtUsd(pd.principalTie?.returnedProductValue)}</b> + cash <b>\${fmtUsd(pd.principalTie?.returnedCash)}</b>
      \${pd.principalTie?.ok ? ' <span class="bdg bdg-recoverable">&#10003; OK</span>' : ' <span class="bdg bdg-confirm">MISMATCH</span>'}
    </div>
  </div>
</section>\`;
}

// ── 5. Hedge Analysis (two side-by-side cards, independent heights) ──────
function renderHedge(trade, res) {
  const h       = res.hedge;
  const fxh     = res.fxHedge;
  const hc      = res.hedgeComparison;
  const iceOn   = !!(trade.hedge && trade.hedge.iceHedged);
  const fxOn    = !!(trade.fxHedge && trade.fxHedge.fxHedged);
  const iceRoute = (trade.hedge && trade.hedge.route) || 'bank_book';
  const fxRoute  = (trade.fxHedge && trade.fxHedge.route) || 'bank_book';

  const iceNullFixed = iceOn && (trade.hedge.fixedPrice == null);
  const fxNullFwd    = fxOn  && (trade.fxHedge.forwardRate == null);

  // Route segmented control rendered inline on each card header
  function routeSeg(selectId, current) {
    const bb = current === 'bank_book';
    // ICE is a SWAP (bank books in-house vs third-party margin financing); FX is a forward/NDF.
    const isFx = selectId === 'sel-fx-route';
    const bankLbl  = isFx ? 'Bank forward'     : 'Bank book';
    const thirdLbl = isFx ? 'Third-party NDF'  : 'Third-party (margin)';
    return \`<div class="route-seg">
      <button class="seg-btn\${bb ? ' seg-active' : ''}" onclick="setHedgeRoute('\${selectId}','bank_book')">\${bankLbl}</button>
      <button class="seg-btn\${!bb ? ' seg-active' : ''}" onclick="setHedgeRoute('\${selectId}','third_party')">\${thirdLbl}</button>
    </div>\`;
  }

  function cmpBlock(comp) {
    if (!comp) return '<div class="h-cmp summary-strip"><span class="muted" style="font-size:11px">Comparison not available</span></div>';
    const delta = comp.hedgeWorthItVsUnhedged;
    const dcls  = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
    const hCls  = comp.hedgedTisNet   < 0 ? 'neg' : comp.hedgedTisNet   > 0 ? 'pos' : '';
    const uCls  = comp.unhedgedTisNet < 0 ? 'neg' : comp.unhedgedTisNet > 0 ? 'pos' : '';
    return \`<div class="h-cmp summary-strip">
      <div class="info-row"><span>Hedged TIS Net</span><b class="h-cmp-val \${hCls}">\${fmtUsd(comp.hedgedTisNet)}</b></div>
      <div class="info-row"><span>Unhedged TIS Net</span><b class="h-cmp-val \${uCls}">\${fmtUsd(comp.unhedgedTisNet)}</b></div>
      <div class="info-row"><span>Hedge value vs unhedged</span><b class="h-cmp-delta \${dcls}">\${fmtUsdSign(delta)}</b></div>
      <p class="defaults-note" style="margin-top:6px">Cost or benefit of hedging vs running unhedged, given how the rate actually moved. Negative = the hedge cost its fee/financing because the rate stayed flat or moved in your favour (protection you didn&rsquo;t need to claim). Positive = the hedge paid off because the rate moved against you. The hedge locks your margin both ways — it trades the chance of a windfall for certainty.</p>
    </div>\`;
  }

  // ICE rows — route-aware: third_party shows notional/margin/financing; bank_book shows spread
  const hedgedTonnes     = h.hedgedTonnes || 0;
  const priceForNotional = h.fixedPrice || trade.market.ice.value || 0;
  const iceNotional      = hedgedTonnes * priceForNotional;

  const iceRouteRows = iceRoute === 'third_party'
    ? \`\${infoRow('Notional (hedged × price)', fmtUsd(iceNotional))}
       \${infoRow('Margin posted (' + fmtPct(trade.hedge.initialMarginPct || 0.10) + ')', fmtUsd(h.bankProvidedMargin) + ' ' + badge('PLACEHOLDER'))}
       \${infoRow('Margin financing cost', fmtUsd(h.extraFinancingCost))}\`
    : infoRow('Bank spread', fmtUsd((trade.hedge.bankSpreadPerMT || 0) * hedgedTonnes) + ' total');

  // Final/settlement ICE: when entered, h.liveIce carries the settled price and the purchase floats to
  // it; the row relabels and a realized swap-P&L row appears.
  const finalSet = trade.market.ice && trade.market.ice.final != null;
  const effIce   = h.liveIce || trade.market.ice.value;
  const iceRows = \`
    \${infoRow('Lots / Hedged MT', \`\${h.lots ?? '—'} lots (\${fmtNum(hedgedTonnes, 0)} MT)\`)}
    \${infoRow('Retained basis', fmtMt(h.comparisonBasisTonnes, 2) + ' TIS retained')}
    \${infoRow('Fixed price', fmtUsd(h.fixedPrice) + '/MT ' + (trade.hedge.fixedPrice == null ? badge('PLACEHOLDER') : ''))}
    \${infoRow(finalSet ? 'Settlement ICE (final)' : 'Live ICE', fmtUsd(effIce) + '/MT' + (finalSet ? ' ' + badge('SETTLEMENT') : ''))}
    \${infoRow('ICE cost delta', fmtUsdSign(h.iceCostDelta) + (iceOn ? '' : ' (OFF — not applied)'))}
    \${finalSet ? infoRow('Realized hedge P&L', fmtUsdSign(res.hedges.iceHedgeNetImpact) + (iceOn ? ' (swap settles − fee/financing)' : ' (OFF — not applied)')) : ''}
    \${infoRow('Swap fee', fmtUsd(h.swapFee) + ' ' + badge('PLACEHOLDER'))}
    \${iceRouteRows}
  \`;
  const settlementNote = finalSet
    ? \`<div class="defaults-note">Realized at settlement ICE <b>\${fmtUsd(effIce)}/MT</b>: the purchase floats to this price (landed cost recomputed) and the swap settles (final − fixed) × hedged tonnes on TIS&rsquo;s retained tonnes only. &ldquo;Hedge value vs unhedged&rdquo; below is the realized outcome.</div>\`
    : '';
  const iceDetail = settlementNote + (iceNullFixed
    ? \`<div class="h-lock-warn">⚠ Fixed price not set — hedge prices at live ICE (<b>\${fmtUsd(trade.market.ice.value)}/MT</b>). No lock-in effect. Set a fixed price in the Hedge tab.</div>\`
    : '');

  // FX rows
  let fxRows;
  if (fxh.noHedgeReason) {
    fxRows = infoRow('Note', fxh.noHedgeReason);
  } else {
    fxRows = \`
      \${infoRow('Bank-repayment hedge base', fmtNum(fxh.exposureNgn, 0) + ' ₦' + (fxh.bankRepaymentUsd ? ' (= ' + fmtUsd(fxh.bankRepaymentUsd) + ' @ NAFEM)' : ''))}
      \${infoRow('Hedge ratio', fmtPct(fxh.hedgeRatio || 0))}
      \${infoRow('Forward rate', fxh.forwardRate ? fmtNum(fxh.forwardRate, 0) + ' ₦/USD' : badge('PLACEHOLDER'))}
      \${infoRow('FX realized delta', fmtUsdSign(fxh.fxRealizedDeltaUsd || 0) + (fxOn ? '' : ' (OFF)'))}
      \${infoRow('FX hedge cost', fmtUsd(fxh.extraFinancingCost || 0))}
      \${fxh.basis ? infoRow('Basis risk (benchmark vs NAFEM)', fmtNum(fxh.basis.gapNgnPerUsd, 2) + ' ₦/USD residual') : ''}
      <div class="defaults-note">FX hedge covers the naira needed to repay the bank&rsquo;s USD facility (principal + interest). Naira profit is retained in naira and not hedged.</div>
    \`;
  }
  const fxWarning = (!fxh.noHedgeReason && fxNullFwd)
    ? \`<div class="h-lock-warn">⚠ Forward rate not set — FX hedge prices at parallel pricing rate (<b>\${fmtNum(res.fx.rates.parallelPricing, 0)} ₦/USD</b>). No lock-in effect. Set a forward rate in the Hedge tab.</div>\`
    : '';

  // card(title, on, routeCtrl, detail, detailExtra, comp) — no forced equal height
  function card(title, on, routeCtrl, detail, detailExtra, comp) {
    const pillCls = on ? 'h-pill on' : 'h-pill';
    return \`<div class="h-card\${on ? ' on' : ''}">
      <div class="h-card-hdr">
        <span class="h-card-title">\${esc(title)}</span>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          \${routeCtrl}
          <span class="\${pillCls}"><span class="h-pill-dot"></span>\${on ? 'Active' : 'Off'}</span>
        </div>
      </div>
      <div class="h-detail">
        <div class="h-detail-inner">
          \${detailExtra || ''}
          <div class="info-block">\${detail}</div>
        </div>
      </div>
      \${cmpBlock(comp)}
    </div>\`;
  }

  return \`<section class="section" aria-labelledby="hedge-h">
  <h2 class="section-heading" id="hedge-h">Hedge Analysis</h2>
  <div class="hedge-cards">
    \${card('ICE Gasoil Swap',           iceOn, routeSeg('sel-ice-route', iceRoute), iceRows, iceDetail, hc?.ice)}
    \${card('FX Hedge (Naira Exposure)', fxOn,  routeSeg('sel-fx-route',  fxRoute),  fxRows,  fxWarning, hc?.fx)}
  </div>
</section>\`;
}

// ── 6. Tax Block ───────────────────────────────────────────────────────────
function renderTax(res) {
  const cost = res.cost;
  const tb   = res.tax;
  const sur  = tb.surcharge;
  const rv   = cost.recoverableVat;

  // Full tax-line set: all cost lines flagged taxLine=true, ordered by id
  const taxLines = cost.lines.filter(l => l.taxLine);
  const taxRows = taxLines.map(l => \`<tr>
    <td>\${esc(l.label)}\${l.legalRef ? \`<div class="legal-ref">\${esc(l.legalRef)}</div>\` : ''}</td>
    <td class="r">\${fmtUsd(l.amountUsd)}</td>
    <td>\${badge(l.status)}</td>
  </tr>\`).join('');

  // Recoverable VAT callout (timing note)
  const recBox = \`<tr class="total">
    <td colspan="2">
      <span class="muted" style="font-size:11px">
        ↩ <b>Recoverable input VAT (s.155(4))</b> — cash-flow timing only, excluded from cost.
        Apportioned at \${(rv.taxableSupplyProportion*100).toFixed(0)}% taxable supply:
        <b>\${fmtUsd(rv.recoverable)}</b> recoverable · <b>\${fmtUsd(rv.irrecoverable)}</b> irrecoverable (IS a cost).
      </span>
    </td>
    <td class="r muted">\${fmtUsd(rv.recoverable)}</td>
  </tr>\`;

  // Fossil-fuel surcharge row (toggle-gated)
  const surRow = \`<tr style="border-top:1px solid var(--g-hairline)">
    <td><b>Fossil-fuel surcharge (5%)</b>
      <div class="legal-ref">NTA 2025 s.158–161; commences on Gazette date (s.160)</div>
    </td>
    <td class="r">\${sur.enabled ? fmtUsd(sur.tisBorneUsd || 0) : '<span class="muted">OFF</span>'}</td>
    <td>\${sur.enabled ? '' : badge('PENDING')}</td>
  </tr>\`;

  const afterSurcharge = sur.enabled
    ? \`<div class="tax-net-box">
        <span class="lbl">TIS Net after surcharge</span>
        <span class="val">\${fmtUsd(res.profit.tisNetAfterSurcharge)}</span>
      </div>\`
    : '';

  return \`<section class="section" aria-labelledby="tax-h">
  <h2 class="section-heading" id="tax-h">Tax Block</h2>
  <div class="card">
    <div class="tbl-wrap"><table class="cost-table data-table">
      <thead><tr><th>Tax Line</th><th class="r">Amount (USD)</th><th>Flag</th></tr></thead>
      <tbody>\${taxRows}\${recBox}\${surRow}</tbody>
    </table></div>
    \${afterSurcharge}
  </div>
</section>\`;
}

// ── 7. Sensitivities ───────────────────────────────────────────────────────
// Pair each lever's +10% / -10% scenarios into one group {label, pos, neg, impact},
// sorted by the lever's max absolute impact. Shared by the tornado chart and the
// sensitivities table so the table can group each lever's two rows adjacently.
function pairLeverScenarios(scenarios) {
  const sorted = [...scenarios].sort((a, b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));
  const seen = new Set();
  const rows = [];
  for (const s of sorted) {
    if (seen.has(s.lever)) continue;
    const baseName = s.lever.replace(/\\s*[+\\-]\\s*\\d+%$/i, '').trim();
    const partner  = sorted.find(p => !seen.has(p.lever) && p !== s && p.lever.replace(/\\s*[+\\-]\\s*\\d+%$/i,'').trim() === baseName);
    let label, pos, neg;
    if (partner) {
      label = baseName;
      pos = s.deltaVsBase >= 0 ? s : partner;
      neg = s.deltaVsBase < 0  ? s : partner;
      seen.add(s.lever); seen.add(partner.lever);
    } else {
      label = s.lever;
      pos = s.deltaVsBase >= 0 ? s : null;
      neg = s.deltaVsBase < 0  ? s : null;
      seen.add(s.lever);
    }
    const impact = Math.max(pos ? Math.abs(pos.deltaVsBase) : 0, neg ? Math.abs(neg.deltaVsBase) : 0);
    rows.push({ label, pos, neg, impact });
  }
  rows.sort((a, b) => b.impact - a.impact);
  return rows;
}

// One row's diverging bars as a percentage-positioned SVG (no viewBox — x/width
// resolve against the SVG's own rendered pixel box per spec, exactly like
// ladderScale's existing CSS left:X% positioning). Deliberately NOT using a
// viewBox+preserveAspectRatio="none" stretch here: this row is extremely wide
// and short (often >30:1), and non-uniform viewBox scaling would stretch
// <text> glyphs along with the bars. Percentage coordinates sidestep that
// entirely — font-size is a real, undistorted CSS px value.
function renderTornadoRow(row, maxAbs) {
  const BAR = 52; // unchanged from the prior CSS-bar version
  const negPct = row.neg ? +(Math.abs(row.neg.deltaVsBase) / maxAbs * BAR).toFixed(1) : 0;
  const posPct = row.pos ? +(Math.abs(row.pos.deltaVsBase) / maxAbs * BAR).toFixed(1) : 0;
  const negVal = row.neg ? fmtUsd(row.neg.deltaVsBase) : '';
  const posVal = row.pos ? (row.pos.deltaVsBase >= 0 ? '+' : '') + fmtUsd(row.pos.deltaVsBase) : '';

  // negPct/posPct are "% of one half" (0..BAR=52), matching the prior CSS
  // version's width:X% of the 50%-wide .tn-half. Halve again for "% of the
  // FULL row" since x/width here are percentages of the whole SVG. A small
  // floor (0.5% of row width) keeps a real-but-tiny delta visible, mirroring
  // the old .tn-bar{min-width:4px}.
  const negW = row.neg ? Math.max(negPct / 2, 0.5) : 0;
  const posW = row.pos ? Math.max(posPct / 2, 0.5) : 0;

  // Width-aware inside/outside decision (Stage 8 fix, replaces the old flat THRESH=13 cutoff).
  // A label placed INSIDE its bar grows FROM the bar's outer edge TOWARD the spine (x=50%) by
  // design -- that only stays inside the bar if the bar is actually wider than the label text.
  // THRESH alone never checked that: a bar could clear THRESH while still being narrower than
  // its own (fixed 12px font) text, so the inward-growing label crossed the spine and collided
  // with the opposite label. Reproduced with FX NAFEM (-$28,483.97 tiny bar / +$222,316.24 at a
  // bar that cleared THRESH=13 but not its own text width) against an ICE-sized maxAbs.
  // CHAR_PCT/MARGIN_PCT conservatively estimate a currency string's rendered width as a percent
  // of the row's FULL width (same basis as negW/posW), calibrated against this app's own
  // narrowest supported layout (700px "narrow" screenshots) so the check stays safe at any wider
  // viewport too -- intentionally not a live DOM measurement, so it's viewport-agnostic and
  // doesn't need a second render pass.
  const CHAR_PCT = 1.5, MARGIN_PCT = 2;
  const fitsInside = (val, w) => w >= val.length * CHAR_PCT + MARGIN_PCT;
  const negIn = row.neg && fitsInside(negVal, negW);
  const posIn = row.pos && fitsInside(posVal, posW);

  const negRect = row.neg
    ? \`<g><title>\${esc(row.label + ' (-10%): ' + negVal)}</title><rect class="tnsvg-bar tnsvg-bar-neg" x="\${(50 - negW).toFixed(2)}%" y="15%" width="\${negW.toFixed(2)}%" height="70%" rx="3"></rect></g>\`
    : '';
  const posRect = row.pos
    ? \`<g><title>\${esc(row.label + ' (+10%): ' + posVal)}</title><rect class="tnsvg-bar tnsvg-bar-pos" x="50%" y="15%" width="\${posW.toFixed(2)}%" height="70%" rx="3"></rect></g>\`
    : '';
  const negText = row.neg
    ? \`<text class="tnsvg-val tnsvg-val-neg\${negIn ? ' tnsvg-val-in' : ''}" x="\${(negIn ? 50 - negW + 0.8 : 50 - negW - 0.8).toFixed(2)}%" y="50%" text-anchor="\${negIn ? 'start' : 'end'}" dominant-baseline="middle">\${esc(negVal)}</text>\`
    : '';
  const posText = row.pos
    ? \`<text class="tnsvg-val tnsvg-val-pos\${posIn ? ' tnsvg-val-in' : ''}" x="\${(posIn ? 50 + posW - 0.8 : 50 + posW + 0.8).toFixed(2)}%" y="50%" text-anchor="\${posIn ? 'end' : 'start'}" dominant-baseline="middle">\${esc(posVal)}</text>\`
    : '';

  const summary = \`\${row.label}: \${row.neg ? negVal + ' at -10%' : 'no -10% scenario'}, \${row.pos ? posVal + ' at +10%' : 'no +10% scenario'}\`;
  return \`<div class="tnsvg-row">
    <div class="tnsvg-label">\${esc(row.label)}</div>
    <svg class="tnsvg-bars" role="img" aria-label="\${esc(summary)}">
      <line class="tnsvg-spine" x1="50%" y1="0" x2="50%" y2="100%"></line>
      \${negRect}\${posRect}\${negText}\${posText}
    </svg>
  </div>\`;
}

function renderTornado(sens) {
  const scenarios = sens.scenarios;
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);
  const rows = pairLeverScenarios(scenarios);
  const rowHtml = rows.filter(r => r.impact > 1).map(row => renderTornadoRow(row, maxAbs)).join('');

  return \`<div class="tn-wrap">
    <div class="tn-axis-labels">
      <span class="tn-axis-left">&larr; Negative impact (&darr; TIS Net)</span>
      <span class="tn-axis-right">Positive impact (&uarr; TIS Net) &rarr;</span>
    </div>
    \${rowHtml}
    <div class="tn-baseline-label">Base: <b>\${fmtUsd(sens.baseNet)}</b> &nbsp;·&nbsp; Bars = &Delta; vs base at &plusmn;10%</div>
  </div>\`;
}

function renderSens(res) {
  if (!res.sensitivities) return '';
  const sens = res.sensitivities;
  const scenarios = [...sens.scenarios].sort((a,b) => Math.abs(b.deltaVsBase) - Math.abs(a.deltaVsBase));
  const maxAbs = Math.max(...scenarios.map(s => Math.abs(s.deltaVsBase)), 1);

  // Discrete heat tiers: every non-zero Δ cell gets a tint from the same fixed
  // --heat-* tokens (and pct>0.6 "strong" threshold) already used by the static
  // HTML report's sensitivitiesSection() (scripts/report-renderer.js) — mirrors
  // that reference implementation instead of the old continuous-alpha inline
  // rgba blend, so the tint is a discrete cell fill, not a gradient. Values fed
  // in (s.deltaVsBase, maxAbs) are unchanged; only how the tint is chosen moves
  // from a computed alpha to a class lookup.
  function heatCls(delta) {
    if (delta === 0 || delta == null) return '';
    const pct = Math.abs(delta) / maxAbs;
    if (delta > 0) return pct > 0.6 ? 'sens-pos-strong' : 'sens-pos';
    return pct > 0.6 ? 'sens-neg-strong' : 'sens-neg';
  }

  // Group each lever's +10% / -10% on adjacent rows (shared pairing logic with the tornado),
  // ordered by the lever's max impact. Both directions stay visible; the first row of each
  // group carries a subtle separator (.sens-group-start).
  const groups = pairLeverScenarios(scenarios);
  const sensRow = (s, first) => \`<tr\${first ? ' class="sens-group-start"' : ''}>
      <td>\${esc(s.lever)}</td>
      <td class="r">\${fmtUsd(s.tisNet)}</td>
      <td class="r \${heatCls(s.deltaVsBase)}">\${s.deltaVsBase >= 0 ? '+' : ''}\${fmtUsd(s.deltaVsBase)}</td>
    </tr>\`;
  const tableRows = [
    // Base-case row: set apart by weight + top hairline (.total, Stage 2's convention), never a fill.
    \`<tr class="sens-base total">
      <td><b>Base case</b></td>
      <td class="r"><b>\${fmtUsd(sens.baseNet)}</b></td>
      <td class="r muted" style="font-style:italic">baseline</td>
    </tr>\`,
    ...groups.flatMap(g => [g.pos, g.neg].filter(Boolean)
      .sort((a, b) => a.lever < b.lever ? -1 : a.lever > b.lever ? 1 : 0)
      .map((s, i) => sensRow(s, i === 0))),
  ].join('');

  const fxNote = !(sens.fx && sens.fx.hasNgnLegs)
    ? \`<div class="card-footer muted">FX: No NGN legs — FX sensitivity = $0 (all-USD ex-ship trade).</div>\`
    : '';

  return \`<section class="section" aria-labelledby="sens-h">
  <h2 class="section-heading" id="sens-h">Sensitivities (&plusmn;10%)</h2>
  <div class="card">
    \${renderTornado(sens)}
    <div class="tbl-wrap" style="margin-top:24px;border-top:1.5px solid var(--g-hairline);padding-top:16px">
      <table class="cost-table data-table">
        <thead><tr><th>Lever</th><th class="r">TIS Net</th><th class="r">&Delta; vs Base</th></tr></thead>
        <tbody>\${tableRows}</tbody>
      </table>
    </div>
    \${fxNote}
    <div class="tbl-wrap" style="border-top:1.5px solid var(--g-hairline);padding-top:16px;margin-top:8px">
      <p class="ir-lbl" style="margin-bottom:8px">Two-way grid: sell price &times; NAFEM (TIS net)</p>
      <div id="heatmap-grid">\${renderHeatmapGrid()}</div>
    </div>
  </div>
</section>\`;
}

// ── Two-way sensitivity heatmap (2026-08) ───────────────────────────────────
// Sell price × NAFEM grid. Shows interaction effects the one-lever tornado can't:
// how the SAME price move lands differently at different FX. Pure client-side —
// re-uses TISEngine.computeTrade on perturbed clones, exactly like runSensitivities.
function renderHeatmapGrid() {
  const trade = window._liveTrade;
  if (!trade || !Array.isArray(trade.revenueLegs) || !trade.revenueLegs.length) {
    return '<div class="card-footer muted">Available for trades with a priced ex-ship leg.</div>';
  }
  const exLeg = trade.revenueLegs.find(l => l.channel === 'ex-ship');
  if (!exLeg || !isFinite(exLeg.price) || exLeg.price <= 0) {
    return '<div class="card-footer muted">Set an ex-ship price to activate the two-way grid.</div>';
  }
  const hasNgn = trade.revenueLegs.some(l => l.pricingUnit === 'NGN_PER_L') ||
    (trade.channels && trade.channels.depotPct > 0);
  if (!hasNgn && !(trade.fx && trade.fx.nafem)) {
    return '<div class="card-footer muted">No FX context for this trade.</div>';
  }
  try {
    const steps = [-0.1, -0.05, 0, 0.05, 0.1];
    const basePrice = exLeg.price;
    const nafemNow = trade.fx?.nafem?.value;
    if (!nafemNow) return '<div class="card-footer muted">NAFEM rate needed.</div>';
    // FX axis only bites if there are NGN legs; otherwise rows all identical — still fine to show.
    const cells = [];
    let maxAbs = 1;
    const grid = steps.map(priceStep => steps.map(fxStep => {
      const t = JSON.parse(JSON.stringify(trade));
      t.revenueLegs = t.revenueLegs.map(l => l.channel === 'ex-ship' ? { ...l, price: basePrice * (1 + priceStep) } : l);
      if (t.fx && t.fx.nafem && hasNgn) t.fx.nafem.value *= (1 + fxStep);
      const r = TISEngine.computeTrade(t);
      const net = r.profit.tisNetProfit;
      maxAbs = Math.max(maxAbs, Math.abs(net));
      return { priceStep, fxStep, net };
    }));
    const baseNet = window._lastResult?.profit?.tisNetProfit ?? 0;
    const heatCls = (net) => {
      const d = net - baseNet; const pct = Math.abs(d) / maxAbs;
      return d >= 0 ? (pct > 0.02 ? 'hm-pos-strong' : 'hm-pos') : (pct > 0.02 ? 'hm-neg-strong' : 'hm-neg');
    };
    const fmtK = (v) => '$' + Math.round(v / 1000).toLocaleString('en-US') + 'k';
    const head = \`<tr><th class="r">Price ↓ / NAFEM →</th>\${steps.map(fs => \`<th class="r">\${(hasNgn ? '₦' : '') + Math.round(nafemNow * (1 + fs)).toLocaleString()}</th>\`).join('')}</tr>\`;
    const body = grid.map((row, i) => \`<tr><td class="mono-num">$\${Math.round(basePrice * (1 + steps[i])).toLocaleString()}/MT</td>\${
      row.map(c => \`<td class="r mono-num hm \${heatCls(c.net)}" title="\${c.net.toFixed(0)}">\${fmtK(c.net)}</td>\`).join('')
    }</tr>\`).join('');
    return \`<table class="data-table"><thead>\${head}</thead><tbody>\${body}</tbody></table>
      <div class="card-footer muted">Tint = Δ vs base (\${fmtUsd(baseNet)}). Each cell is a full engine run — no interpolation.</div>\`;
  } catch (e) {
    return '<div class="card-footer muted">Grid unavailable: ' + esc(e.message) + '</div>';
  }
}

// ── Quote provenance panel (2026-08) ────────────────────────────────────────
// Shows where every index number on the trade came from — pinned vs book,
// source person, tier, freshness. Auditability for informally-sourced data.
function renderQuoteProvenance(res) {
  const el = document.getElementById('sec-quotes');
  if (!el) return;
  const rows = (res && res.quoteProvenance) || [];
  if (!rows.length) { el.innerHTML = '<span class="muted">No indexed pricing on this trade.</span>'; return; }
  el.innerHTML = \`<div class="tbl-wrap"><table class="cost-table data-table">
    <thead><tr><th>Index</th><th class="r">Value</th><th>Origin</th><th>Source</th><th>Note</th></tr></thead>
    <tbody>\${rows.map((p) => \`<tr>
      <td>\${esc(p.indexId)}</td>
      <td class="r mono-num">\${Number(p.value).toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
      <td><span class="state-badge">\${esc(p.origin)}</span></td>
      <td class="muted">\${esc(p.source || '—')}\${p.asOf ? \` · asOf \${esc(p.asOf)}\` : ''}</td>
      <td class="muted">\${p.freshness === 'STALE' ? '<span style="color:var(--t-caution)">⚠ STALE</span> ' : ''}\${esc(p.warning || p.note || '')}</td>
    </tr>\`).join('')}</tbody></table></div>\`;
}

// ── Master render ──────────────────────────────────────────────────────────
function renderAll(trade, res, ladder, hasSellPrice) {
  window._liveTrade = trade; // for the two-way heatmap grid
  renderKPIs(res, hasSellPrice);
  if (hasSellPrice === false) {
    // No sell price yet: show price-INDEPENDENT outputs (cost build-up + pricing ladder),
    // a calm pending card where the waterfall goes, and clear the P&L-dependent sections.
    document.getElementById('sec-waterfall').innerHTML = renderPricePending(legPricingStatus(trade));
    document.getElementById('sec-ladder').innerHTML    = renderLadder(trade, res, ladder);
    document.getElementById('sec-cost').innerHTML      = renderCost(res);
    document.getElementById('sec-partner').innerHTML   = '';
    document.getElementById('sec-hedge').innerHTML     = '';
    document.getElementById('sec-tax').innerHTML       = '';
    document.getElementById('sec-sens').innerHTML      = '';
  } else {
    document.getElementById('sec-waterfall').innerHTML = renderWaterfall(res);
    document.getElementById('sec-ladder').innerHTML    = renderLadder(trade, res, ladder);
    document.getElementById('sec-cost').innerHTML      = renderCost(res);
    document.getElementById('sec-partner').innerHTML   = renderPartner(trade, res);
    document.getElementById('sec-hedge').innerHTML     = renderHedge(trade, res);
    document.getElementById('sec-tax').innerHTML       = renderTax(res);
    document.getElementById('sec-sens').innerHTML      = renderSens(res);
  }
  renderQuoteProvenance(res);
  window._lastResult = res; // for trade comparison
  requestAnimationFrame(() => {
    document.querySelectorAll('.section').forEach(el => {
      el.classList.remove('val-flash');
      void el.offsetWidth;
      el.classList.add('val-flash');
    });
  });
}

// ── Error UI ───────────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('rpt-error');
  if (el) { el.textContent = '⚠ ' + msg; el.hidden = false; }
}
function clearError() {
  const el = document.getElementById('rpt-error');
  if (el) { el.textContent = ''; el.hidden = true; }
}
function clearResults() {
  ['sec-waterfall','sec-ladder','sec-cost','sec-partner','sec-hedge','sec-tax','sec-sens']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  [['kpi-tisnet-val','—'],['kpi-annret-val','—'],['kpi-margin-val','—'],
   ['kpi-tisnet-sub','—'],['kpi-annret-sub','—'],['kpi-margin-sub','—'],
   ['kpi-margin-label','Ex-Ship Margin'],['sticky-tisnet-val','—']]
    .forEach(([id,t]) => { const el = document.getElementById(id); if (el) el.textContent = t; });
  // No value → neutral chip (never the green profit box).
  const nv = document.getElementById('kpi-tisnet-val');
  const nc = nv ? nv.closest('.kpi-chip') : null;
  if (nc) { nc.classList.remove('kpi-accent','kpi-loss'); }
}
function showEmptyState() {
  _lastRetainedTonnes = null;
  updateHedgedVolPlaceholder();
  clearResults();
  clearError();
  const el = document.getElementById('sec-waterfall');
  if (el) el.innerHTML = '<section class="section empty-state-section"><div class="empty-state"><p class="empty-state-title">Enter trade data to see results</p><p class="empty-state-sub">Required: ICE price · FX NAFEM rate · delivered MT</p></div></section>';
}

// ── Recompute ──────────────────────────────────────────────────────────────
function recompute() {
  // Invalidate the cached report inputs up front — any early return (empty / collect error /
  // compute error / unpriced legs) then leaves them null, so "Download Report" can never fire
  // against a stale or partial trade. Re-set at the end only on a full-price success.
  _lastTrade = _lastRes = _lastLadder = null;
  // Gate on key per-trade input — blank form (New Trade) shows empty state, no stale numbers
  const delivEl = document.getElementById('inp-delivered');
  if (!delivEl || !delivEl.value.trim()) { showEmptyState(); return; }

  let trade;
  try { trade = collectTrade(); }
  catch(e) { clearResults(); showError('Input error: ' + e.message); return; }

  // Sell price is OPTIONAL, now PER LEG. The cost build-up and pricing ladder are price-INDEPENDENT
  // (the ladder derives each tier's price from landed cost); only the P&L outputs need prices.
  // When any leg is unpriced we run the engine with synthetic per-leg placeholders purely so the
  // price-independent outputs compute, then suppress every price-dependent display below.
  const legsAll = trade.revenueLegs || [];
  const hasSellPrice = legsAll.length > 0 && legsAll.every(l => isFinite(l.price) && l.price > 0);

  let engineTrade = trade;
  if (!hasSellPrice) {
    const iceV = trade.market.ice.value, fobV = trade.market.fobPremium.value;
    const base = (isFinite(iceV) ? iceV : 0) + (isFinite(fobV) ? fobV : 0);
    const synthUsd = base > 0 ? base * 1.25 : 1000; // positive; never displayed
    const par = (trade.fx && trade.fx.parallel && isFinite(trade.fx.parallel.value)) ? trade.fx.parallel.value : null;
    const litres = (trade.pricing && trade.pricing.conversion && trade.pricing.conversion.litresPerMT) || 1183;
    const synthNgnPerL = par ? (synthUsd * par) / litres : 1000;
    const filled = legsAll.map(l => {
      if (isFinite(l.price) && l.price > 0) return l;
      return { ...l, price: (l.pricingUnit === 'NGN_PER_L' ? synthNgnPerL : synthUsd) };
    });
    engineTrade = { ...trade, revenueLegs: filled };
  }

  let res;
  try { res = TISEngine.computeTrade(engineTrade); }
  catch(e) { clearResults(); showError(e.message); return; }

  // Sensitivities are P&L-based — only meaningful (and only shown) once a sell price exists.
  if (hasSellPrice) {
    try {
      const fn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
      // RULE 1 (2026-06-23): NAFEM drives naira P&L, so the live FX sensitivity is the NAFEM lever.
      res.sensitivities = TISEngine.runSensitivities(engineTrade, fn, { fxMode: 'nafem' });
    } catch(_) { res.sensitivities = null; }
  } else {
    res.sensitivities = null;
  }

  let ladder = null;
  try {
    const fn = t => TISEngine.computeTrade(t, { skipHedgeCompare: true });
    ladder = TISEngine.buildLadder(engineTrade, fn, res);
  } catch(_) { ladder = null; }

  // Suppress the synthetic prices so the ladder shows no fake current-price markers — BOTH the ex-ship
  // $/MT marker AND the depot ₦/L marker. Both feed ladder marker ticks now; leaving the synthetic
  // depot price in would draw a phantom marker on the depot ₦/L bar.
  if (!hasSellPrice) {
    res.price.exShipPricePerMT = null;
    res.price.depotPriceNgnPerL = null;
  }

  // Update retained-tonnes for the hedge-volume placeholder (engine default = retained, not full cargo).
  _lastRetainedTonnes = (res.quantities && res.quantities.economic)
    ? res.quantities.economic.tisRetainedTonnes
    : null;

  clearError();
  renderAll(trade, res, ladder, hasSellPrice);
  updateLegNgnEquiv();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();

  // Cache the live inputs for "Download Report" — only on a fully-priced compute, so the report
  // always reflects a complete, displayed P&L (never the synthetic-placeholder price path).
  if (hasSellPrice) { _lastTrade = trade; _lastRes = res; _lastLadder = ladder; }
}

// ── Toggle switches ────────────────────────────────────────────────────────
function activateToggle(wrap, on) {
  if (!wrap) return;
  wrap.dataset.on = String(on);
  wrap.setAttribute('aria-checked', String(on));
  wrap.querySelector('.tgl-track').classList.toggle('on', on);
}

document.querySelectorAll('.tgl-wrap').forEach(wrap => {
  const toggle = () => {
    if (_isSample) { _isSample = false; }
    activateToggle(wrap, wrap.dataset.on !== 'true');
    updateSurchargeVisibility();
    updateHedgeTab();
    setModified(true);
    updateHeader();
    recompute();
  };
  wrap.addEventListener('click', toggle);
  wrap.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });
});

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = 'tab-' + btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
  });
});

// ── Hedge route switcher (called from route-seg buttons on cards) ──────────
window.setHedgeRoute = function(selectId, route) {
  const el = document.getElementById(selectId);
  if (el) { el.value = route; onInputChange(selectId); }
};

// ── Storage line unit toggle (₦/L | $/MT) — drives the hidden select, relabels, recomputes ──
const STORAGE_UNIT_LBL = { 'sel-throughput-unit': 'lbl-throughput-unit', 'sel-storage-unit': 'lbl-storage-unit' };
function syncStorageUnitUI(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const unit = sel.value === 'USD_PER_MT' ? 'USD_PER_MT' : 'NGN_PER_L';
  const seg = document.getElementById(selId + '-seg');
  if (seg) {
    const btns = seg.querySelectorAll('.seg-btn');
    if (btns[0]) btns[0].classList.toggle('seg-active', unit === 'NGN_PER_L');
    if (btns[1]) btns[1].classList.toggle('seg-active', unit === 'USD_PER_MT');
  }
  const lblEl = document.getElementById(STORAGE_UNIT_LBL[selId]);
  if (lblEl) lblEl.textContent = unit === 'USD_PER_MT' ? '$/MT' : '₦/L';
}
function syncAllStorageUnits() { syncStorageUnitUI('sel-throughput-unit'); syncStorageUnitUI('sel-storage-unit'); }
window.setStorageUnit = function(selId, unit) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.value = unit;
  syncStorageUnitUI(selId);
  onInputChange(selId);
};

// ── Disclosure toggles ─────────────────────────────────────────────────────
window.toggleDisc = function(btn) {
  const body = btn.nextElementSibling;
  if (!body) return;
  const open = body.classList.toggle('open');
  const arrow = btn.querySelector('span');
  if (arrow) arrow.textContent = open ? '▲' : '▼';
};

// ── Drawer (responsive) ────────────────────────────────────────────────────
window.toggleDrawer = function() {
  const sb  = document.getElementById('sidebar');
  const btn = document.getElementById('drawer-btn');
  const open = sb.classList.toggle('open');
  if (btn) {
    const arr = btn.querySelector('.drawer-arrow');
    if (arr) arr.textContent = open ? '▲' : '▼';
  }
};

// ── Input listeners ────────────────────────────────────────────────────────
document.querySelectorAll('.si, .ss').forEach(el => {
  el.addEventListener('input',  () => { onInputChange(el.id); });
  el.addEventListener('change', () => { onInputChange(el.id); });
});

// Sync ph-class and pip on hedge placeholder fields: amber only when field is empty
function refreshHedgePh() {
  document.querySelectorAll('[data-ph]').forEach(function(inp) {
    const hasVal = inp.value.trim() !== '';
    inp.classList.toggle('ph', !hasVal);
    const pipEl = inp.closest('.ir') ? inp.closest('.ir').querySelector('.pip') : null;
    if (pipEl) {
      pipEl.classList.remove('pip-ok','pip-ind','pip-unv','pip-ph','pip-conf','pip-none');
      pipEl.classList.add(hasVal ? 'pip-ok' : 'pip-ind');
      pipEl.title = hasVal ? 'OK' : 'PLACEHOLDER';
    }
  });
}
// Unit-sanity guard for hedge fee/spread inputs. These multiply USD notional (FX) or hedged
// tonnes (ICE); a units typo (e.g. 2.0 meaning "$2 per $1" instead of 0.002) silently produces a
// catastrophic cost rather than an error. We surface an amber "check units" warning instead of
// letting the bad number flow into P&L. Pure display — no engine math touched.
function refreshHedgeSanity() {
  // FX fee/spread are a FRACTION OF USD NOTIONAL. Sane range ~0.001-0.004; >0.05 (5% of notional)
  // is almost certainly a units error (whole dollars typed where a small fraction belongs).
  const FX_MAX = 0.05;
  const fxFee = parseFloat((document.getElementById('inp-fx-fee') || {}).value);
  const fxSpread = parseFloat((document.getElementById('inp-fx-spread') || {}).value);
  const fxBad = [];
  if (isFinite(fxFee) && fxFee > FX_MAX) fxBad.push('Fee ' + fxFee);
  if (isFinite(fxSpread) && fxSpread > FX_MAX) fxBad.push('Spread ' + fxSpread);
  const fxWarn = document.getElementById('fx-fee-warn');
  if (fxWarn) {
    if (fxBad.length) {
      fxWarn.hidden = false;
      fxWarn.innerHTML = '⚠ ' + fxBad.join(' / ') + ' $/USD is implausibly high (>' + FX_MAX
        + ' = ' + Math.round(FX_MAX * 100) + '% of notional). These are a small fraction per USD '
        + '(e.g. 0.004), not whole dollars — check the units before this flows into P&L.';
    } else {
      fxWarn.hidden = true;
      fxWarn.textContent = '';
    }
  }

  // ICE swap fee / bank spread are ABSOLUTE $/MT (different exposure: x hedged tonnes, not a
  // fraction of notional). A typo here is bounded but can still be large, so we guard proportionally
  // against the ICE price: >10% of ICE $/MT (sane values are ~$0.5-$2/MT) signals a likely error.
  const iceEl = document.getElementById('inp-ice-final');
  const iceLiveEl = document.getElementById('inp-ice');
  let icePrice = iceEl && iceEl.value.trim() !== '' ? parseFloat(iceEl.value) : NaN;
  if (!(isFinite(icePrice) && icePrice > 0) && iceLiveEl) icePrice = parseFloat(iceLiveEl.value);
  const iceCap = (isFinite(icePrice) && icePrice > 0) ? icePrice * 0.10 : 100; // $/MT
  const iceFee = parseFloat((document.getElementById('inp-ice-fee') || {}).value);
  const iceSpread = parseFloat((document.getElementById('inp-ice-spread') || {}).value);
  const iceBad = [];
  if (isFinite(iceFee) && iceFee > iceCap) iceBad.push('Swap fee ' + iceFee);
  if (isFinite(iceSpread) && iceSpread > iceCap) iceBad.push('Bank spread ' + iceSpread);
  const iceWarn = document.getElementById('ice-fee-warn');
  if (iceWarn) {
    if (iceBad.length) {
      iceWarn.hidden = false;
      iceWarn.innerHTML = '⚠ ' + iceBad.join(' / ') + ' $/MT is implausibly high (>'
        + (Math.round(iceCap * 100) / 100) + ' $/MT ≈ 10% of ICE). Sane swap fee/spread is '
        + '~$0.5–$2/MT — check the units.';
    } else {
      iceWarn.hidden = true;
      iceWarn.textContent = '';
    }
  }
}
// // Keep hedged-volume placeholder in sync with retained tonnes from the last compute.
// The engine default is retained (not full cargo); placeholder reflects the actual
// computed value when available, or a label when not yet computed.
function updateHedgedVolPlaceholder() {
  const volEl = document.getElementById('inp-ice-hedged-vol');
  if (!volEl) return;
  const hasDefault = _lastRetainedTonnes != null && isFinite(_lastRetainedTonnes) && _lastRetainedTonnes > 0;
  volEl.placeholder = hasDefault
    ? _lastRetainedTonnes.toLocaleString('en-US', {maximumFractionDigits: 0}) + ' (retained)'
    : 'retained tonnes';
  // Pip: green when user entered a value OR a valid computed default exists;
  // amber only when genuinely empty with no computable default.
  const pipEl = volEl.closest('.ir') && volEl.closest('.ir').querySelector('.pip');
  if (pipEl) {
    const hasValue = volEl.value.trim() !== '';
    pipEl.classList.remove('pip-ok','pip-ind','pip-unv','pip-ph','pip-conf','pip-none');
    pipEl.classList.add(hasValue || hasDefault ? 'pip-ok' : 'pip-ind');
    pipEl.title = hasValue ? 'OK' : (hasDefault ? 'Using retained default' : 'INDICATIVE');
  }
}
// Keep the Final ICE placeholder showing the current live ICE (blank => engine uses live).
function updateFinalIcePlaceholder() {
  const finEl = document.getElementById('inp-ice-final');
  if (!finEl) return;
  const iceEl = document.getElementById('inp-ice');
  const live = iceEl ? parseFloat(iceEl.value) : NaN;
  finEl.placeholder = isFinite(live) && live > 0
    ? live.toLocaleString('en-US', {maximumFractionDigits: 2}) + ' (live ICE)'
    : 'live ICE';
}
function onInputChange(id) {
  if (_isSample) { _isSample = false; }
  // A trader edit (value) or unit-toggle on a storage line means it is no longer untouched legacy data,
  // so collectTrade emits the ₦/L|$/MT unit schema for it from here on (setStorageUnit routes through here).
  if (id === 'inp-throughput'     || id === 'sel-throughput-unit') _storageLegacy.throughput = false;
  if (id === 'inp-storage-rental' || id === 'sel-storage-unit')    _storageLegacy.storageRental = false;
  setModified(true);
  updateLcDisplay();
  updateDepotVisibility();
  updateCurrencyVisibility();
  updateSurchargeVisibility();
  updateHedgeTab();
  updateIceRouteVisibility();
  updateFxRouteVisibility();
  updateHeader();
  refreshHedgePh();
  refreshHedgeSanity();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();
  updateLegTotal();   // delivered MT feeds the leg tonnage total
  recompute();
}

// ── Per-trade vs house-defaults grouping ──────────────────────────────────
const PER_TRADE_IDS = [
  'inp-trade-name','inp-partner-name','inp-supplier-name','inp-inspector-name',
  'inp-ice','inp-ice-final','inp-fob','inp-fxpar','inp-fxnafem','inp-delivered',
  'inp-profit-split',
  'inp-tc-rate','inp-charter','inp-demurrage',
  'inp-credit-rate','inp-lc-fee','inp-fin-days','inp-lockup','inp-wc-sublimit',
  'sel-equity-provider','inp-bond','inp-equity','inp-product-alloc',
  'sel-surcharge-inc',
  'inp-ice-fixed','inp-fx-forward','inp-ice-hedged-vol',
];
const DEFAULT_IDS = [
  'inp-npa-per-mt','inp-port-das','inp-ncs-docs',
  'inp-nimasa-cab','inp-nimasa-freight','inp-spomo',
  'inp-marine-icc','inp-sgs','inp-port-agency','inp-alloc-security',
  'inp-bank-charges','inp-overhead','inp-contingency','inp-collateral-mgr',
  'inp-throughput','inp-storage-rental','inp-evaporation','inp-tank-insurance',
  'sel-throughput-unit','sel-storage-unit',
  'inp-litres-per-mt',
  'inp-vat-rate','inp-wht-rate','inp-taxable-prop',
  'inp-ice-fee','inp-ice-spread','inp-ice-margin',
  'inp-fx-ratio','inp-fx-fee','inp-fx-spread',
  'inp-fx-margin','inp-fx-tenor','inp-fx-broker',
  'sel-ice-route','sel-fx-route',
];

// ── Storage layer — swap methods here to move to a hosted backend ─────────
const TISStorage = (function() {
  const KEY_TRADES   = 'tis_saved_trades_v1';
  const KEY_DEFAULTS = 'tis_house_defaults_v1';
  function safeRead(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(_) { return null; }
  }
  function safeWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch(_) { return false; }
  }
  return {
    saveTrade(name, snap) {
      const trades = safeRead(KEY_TRADES) || {};
      trades[name] = { snap, savedAt: Date.now() };
      safeWrite(KEY_TRADES, trades);
    },
    loadTrades()  { return safeRead(KEY_TRADES) || {}; },
    loadTrade(name) { const t = this.loadTrades(); return t[name] ? t[name].snap : null; },
    deleteTrade(name) {
      const t = this.loadTrades(); delete t[name]; safeWrite(KEY_TRADES, t);
    },
    saveDefaults(snap) { safeWrite(KEY_DEFAULTS, snap); },
    loadDefaults()     { return safeRead(KEY_DEFAULTS); },
  };
})();

// ── Input snapshot helpers ────────────────────────────────────────────────
function snapshotInputs(ids) {
  const snap = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) snap[id] = el.value;
  }
  return snap;
}
// Keep LOADED old-format storage lines detectable as legacy across a re-save: drop the unit-select keys
// so the saved snapshot looks like the genuinely-old snapshots it came from (no sel-*-unit). Without this
// a re-saved old trade would bake in NGN_PER_L and reintroduce the ~1183× inflation on the next load.
function stripLegacyStorageUnits(snap) {
  if (_storageLegacy.throughput)    delete snap['sel-throughput-unit'];
  if (_storageLegacy.storageRental) delete snap['sel-storage-unit'];
  return snap;
}
function applyInputSnapshot(snap) {
  if (!snap) return;
  for (const [id, val] of Object.entries(snap)) {
    const el = document.getElementById(id);
    if (el && !id.startsWith('_')) el.value = val;
  }
}

// ── Live header update ────────────────────────────────────────────────────
function updateHeader() {
  const nameEl = document.getElementById('inp-trade-name');
  const name   = nameEl ? (nameEl.value.trim() || '(Unnamed Trade)') : '(Unnamed Trade)';
  const hName  = document.getElementById('hdr-trade-name');
  if (hName) hName.textContent = name;

  // Sync browser tab title — sample fixture keeps its id; real/new trades use trade name
  if (_isSample) {
    document.title = INIT.meta.tradeId + ' — TIS Global Trading (Interactive)';
  } else if (name === '(Unnamed Trade)') {
    document.title = 'New Trade — TIS Global Trading';
  } else {
    document.title = name + ' — TIS Global Trading';
  }

  const partner   = document.getElementById('inp-partner-name')?.value.trim()   || '';
  const supplier  = document.getElementById('inp-supplier-name')?.value.trim()  || '';
  const inspector = document.getElementById('inp-inspector-name')?.value.trim() || '';

  const hP = document.getElementById('hdr-partner');   if (hP) hP.textContent = partner;
  const hS = document.getElementById('hdr-supplier');  if (hS) hS.textContent = supplier;
  const hI = document.getElementById('hdr-inspector'); if (hI) hI.textContent = inspector;

  const hPS = document.getElementById('hdr-partner-seg');
  const hSS = document.getElementById('hdr-supplier-seg');
  const hIS = document.getElementById('hdr-inspector-seg');
  if (hPS) hPS.style.display = partner   ? '' : 'none';
  if (hSS) hSS.style.display = supplier  ? '' : 'none';
  if (hIS) hIS.style.display = inspector ? '' : 'none';

  const badge = document.getElementById('hdr-fixture-badge');
  if (badge) badge.style.display = _isSample ? 'inline-block' : 'none';

  const tradeIdEl = document.getElementById('hdr-trade-id');
  if (tradeIdEl) {
    if (_isSample) {
      tradeIdEl.firstChild.textContent = INIT.meta.tradeId;
      tradeIdEl.style.display = '';
    } else {
      tradeIdEl.firstChild.textContent = '';
      tradeIdEl.style.display = 'none';
    }
  }
}

// ── Theme toggle (2026-08 refresh) ─────────────────────────────────────────
// Persists via localStorage; defaults to the user's OS preference on first load.
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '☀️ Light' : '🌙 Dark';
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('tis-theme'); } catch (_) {}
  if (!t) t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(t);
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('tis-theme', next); } catch (_) {}
}
// Expose for inline onclick handlers — the app body runs inside an IIFE, so these
// functions are invisible at global scope without an explicit export.
window.toggleTheme = toggleTheme;
window.applyTheme = applyTheme;

// ── Quote book panel (2026-08) ─────────────────────────────────────────────
// Talks to scripts/serve.js /api/quotes (GET list+consensus, POST capture).
// Graceful when served statically (no server): shows a hint instead of failing.
const QB_INDEXES = ${JSON.stringify((() => {
  try { return require('../engine/config/indexes.json').indexes.map(x => ({ id: x.id, name: x.name })); }
  catch (_) { return []; }
})())};

function qbFillIndexSelects() {
  const opts = QB_INDEXES.map(i => \`<option value="\${esc(i.id)}">\${esc(i.id)}</option>\`).join('');
  ['qb-index', 'qb-consensus-index'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.options.length) el.innerHTML = opts;
  });
}

async function qbFetch(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || ('HTTP ' + res.status));
  return res.json();
}

async function refreshQuoteList() {
  const el = document.getElementById('qb-list');
  if (!el) return;
  try {
    const book = await qbFetch('/api/quotes');
    const rows = (book.quotes || []).filter(q => q.status === 'ACTIVE')
      .sort((a, b) => (b.asOf + (b.capturedAt || '')).localeCompare(a.asOf + (a.capturedAt || '')))
      .slice(0, 12);
    if (!rows.length) { el.innerHTML = 'No quotes yet.'; return; }
    el.innerHTML = rows.map(q => \`<div style="margin-bottom:6px">
      <span class="mono-num">\${q.value}</span> <span class="muted">\${esc(q.indexId)}</span><br>
      <span class="muted" style="font-size:10px">\${esc(q.source?.name || '?')} · tier \${esc(q.source?.tier || '?')} · asOf \${esc(q.asOf)}</span>
    </div>\`).join('');
  } catch (e) {
    el.innerHTML = 'Quote book needs <code>node scripts/serve.js</code> — not available on a static page.';
  }
}

async function captureQuote() {
  const st = document.getElementById('qb-status');
  try {
    await qbFetch('/api/quotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        indexId: document.getElementById('qb-index').value,
        value: Number(document.getElementById('qb-value').value),
        asOf: document.getElementById('qb-asof').value,
        source: document.getElementById('qb-source').value.trim(),
        tier: document.getElementById('qb-tier').value,
        method: document.getElementById('qb-method').value.trim(),
      }),
    });
    st.textContent = '✓ captured';
    st.style.color = 'var(--t-positive)';
    document.getElementById('qb-value').value = '';
    refreshQuoteList();
  } catch (e) {
    st.textContent = '✗ ' + e.message;
    st.style.color = 'var(--t-loss)';
  }
  setTimeout(() => { st.innerHTML = '&nbsp;'; }, 4000);
}

async function showConsensus() {
  const idx = document.getElementById('qb-consensus-index').value;
  const out = document.getElementById('qb-consensus-out');
  if (!idx) return;
  try {
    const c = await qbFetch('/api/quotes/consensus/' + encodeURIComponent(idx));
    if (!c.count) { out.textContent = 'No active quotes for ' + idx + '.'; return; }
    out.innerHTML = \`median <b class="mono-num">\${c.median}</b> · n=\${c.count} · range \${c.min}–\${c.max} · spread \${c.spreadPct}%\${c.wideSpread ? ' <span style="color:var(--t-caution)">⚠ WIDE</span>' : ''}\`;
  } catch (e) { out.textContent = '✗ ' + e.message; }
}

// Init quote panel when its tab is first opened (avoid fetching on every load)
let _quotesInit = false;
function initQuotesTab() {
  if (_quotesInit) return;
  _quotesInit = true;
  qbFillIndexSelects();
  const d = new Date().toISOString().slice(0, 10);
  const asof = document.getElementById('qb-asof');
  if (asof && !asof.value) asof.value = d;
  const fxdate = document.getElementById('fx-date');
  if (fxdate && !fxdate.value) fxdate.value = d;
  refreshQuoteList();
  refreshFxLatest();
}
document.getElementById('tabbtn-quotes')?.addEventListener('click', initQuotesTab);

async function captureFx() {
  const st = document.getElementById('fx-status');
  try {
    await qbFetch('/api/fx', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: document.getElementById('fx-date').value,
        nafem: Number(document.getElementById('fx-nafem').value),
        parallel: document.getElementById('fx-par').value ? Number(document.getElementById('fx-par').value) : null,
        source: document.getElementById('fx-source').value.trim(),
      }),
    });
    st.textContent = '✓ logged';
    st.style.color = 'var(--t-positive)';
    refreshFxLatest();
  } catch (e) {
    st.textContent = '✗ ' + e.message;
    st.style.color = 'var(--t-loss)';
  }
  setTimeout(() => { st.innerHTML = '&nbsp;'; }, 4000);
}

async function refreshFxLatest() {
  const el = document.getElementById('fx-latest');
  if (!el) return;
  try {
    const book = await qbFetch('/api/fx');
    const latest = (book.entries || []).slice(-1)[0];
    el.innerHTML = latest
      ? \`Latest: <b class="mono-num">\${latest.nafem}</b> ₦/\$ (\${latest.date}\${latest.source ? ', ' + esc(latest.source) : ''})\`
      : 'No FX entries yet.';
  } catch (_) { /* static page — silent */ }
}

// Expose quote-panel functions for inline onclick handlers (app body is inside an IIFE).
window.captureQuote = captureQuote;
window.showConsensus = showConsensus;
window.captureFx = captureFx;
window.runComparison = runComparison;
window.clearComparison = clearComparison;
window.runCloseOut = runCloseOut;

// ── New Trade ─────────────────────────────────────────────────────────────
function newTrade() {
  if (_modified && !confirm('You have unsaved changes. Start a new trade and discard them?')) return;
  const BLANK = [
    'inp-trade-name','inp-partner-name','inp-supplier-name','inp-inspector-name',
    'inp-ice','inp-ice-final','inp-fob','inp-fxpar','inp-fxnafem','inp-delivered',
    'inp-ice-fixed','inp-fx-forward','inp-ice-hedged-vol',
  ];
  for (const id of BLANK) { const el = document.getElementById(id); if (el) el.value = ''; }

  // Fresh trade starts with one blank, unpriced ex-ship leg.
  _legs = [legBlank()];
  renderLegEditor();

  // Structural per-trade: reset to INIT defaults
  const I = INIT, p = I.partner, f = I.financing;
  sv('inp-profit-split',  +(p.profitSharePct*100).toFixed(1));
  sv('inp-tc-rate',       I.freight.tcRatePerDay);
  sv('inp-charter',       I.freight.charterDays);
  sv('inp-demurrage',     I.freight.demurrageDays);
  sv('inp-credit-rate',   +(f.creditRate*100).toFixed(2));
  sv('inp-lc-fee',        +(f.lcFeePct*100).toFixed(3));
  sv('inp-fin-days',      f.financingDays);
  sv('inp-lockup',        f.capitalLockupDays);
  sv('inp-wc-sublimit',   f.wcSublimit);
  sd('sel-equity-provider', p.equityProvider || 'partner');
  sv('inp-bond',          +(p.bondPct*100).toFixed(2));
  sv('inp-equity',        +(p.equityPct*100).toFixed(2));
  sv('inp-product-alloc', +((p.productAllocationPct??1)*100).toFixed(1));
  sd('sel-surcharge-inc', (I.tax.surcharge||{}).incidence || 'cost');

  // Apply saved house defaults for cost lines, tax rates, hedge params
  const defs = TISStorage.loadDefaults();
  if (defs) { applyInputSnapshot(defs); }
  syncAllStorageUnits();
  refreshHedgePh();
  refreshHedgeSanity();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();

  activateToggle(document.getElementById('tog-ice-hedge'), false);
  activateToggle(document.getElementById('tog-fx-hedge'),  false);
  activateToggle(document.getElementById('tog-surcharge'), false);

  _isSample = false;
  _currentTradeName = null;
  _storageLegacy = { throughput: false, storageRental: false };   // new trade uses the ₦/L|$/MT schema
  const selNT = document.getElementById('sel-saved-trades');
  if (selNT) selNT.value = '';
  updateLcDisplay(); updateDepotVisibility(); updateCurrencyVisibility();
  updateSurchargeVisibility(); updateHedgeTab(); updateIceRouteVisibility(); updateFxRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
  showToast('New trade — enter market data');
}

// ── Save trade (smart: update in place if already saved, else create new) ─────
function saveTrade() {
  const nameEl = document.getElementById('inp-trade-name');
  let saveName;
  const isUpdate = _currentTradeName !== null;

  if (isUpdate) {
    saveName = _currentTradeName;
  } else {
    const typedName = nameEl ? nameEl.value.trim() : '';
    if (!typedName) { showToast('Enter a trade name first'); if (nameEl) nameEl.focus(); return; }
    if (TISStorage.loadTrades()[typedName] &&
        !confirm('"' + typedName + '" already exists. Overwrite it?')) return;
    saveName = typedName;
  }

  const snap = stripLegacyStorageUnits(snapshotInputs([...PER_TRADE_IDS, ...DEFAULT_IDS]));
  snap['_tog-ice-hedge'] = String(isOn('tog-ice-hedge'));
  snap['_tog-fx-hedge']  = String(isOn('tog-fx-hedge'));
  snap['_tog-surcharge'] = String(isOn('tog-surcharge'));
  snap['_isSample']      = 'false';
  snap['_legs']          = JSON.stringify(_legs);
  if (window._lastResult) snap['_res'] = window._lastResult; // result snapshot for comparison
  TISStorage.saveTrade(saveName, snap);
  _currentTradeName = saveName;
  renderSavedTradesList(saveName);
  setModified(false);
  showToast(isUpdate ? 'Updated: ' + saveName : 'Saved: ' + saveName);
}

// ── Save As (always prompts for a new name, creates a separate saved copy) ───
function saveAsTrade() {
  const nameEl    = document.getElementById('inp-trade-name');
  const suggestion = _currentTradeName
    ? _currentTradeName + ' (copy)'
    : (nameEl ? nameEl.value.trim() : '');
  const input = prompt('Save a copy as:', suggestion);
  if (input === null) return;
  const saveName = input.trim();
  if (!saveName) { showToast('Name cannot be empty'); return; }
  if (TISStorage.loadTrades()[saveName] && saveName !== _currentTradeName &&
      !confirm('"' + saveName + '" already exists. Overwrite it?')) return;

  const snap = stripLegacyStorageUnits(snapshotInputs([...PER_TRADE_IDS, ...DEFAULT_IDS]));
  snap['_tog-ice-hedge'] = String(isOn('tog-ice-hedge'));
  snap['_tog-fx-hedge']  = String(isOn('tog-fx-hedge'));
  snap['_tog-surcharge'] = String(isOn('tog-surcharge'));
  snap['_isSample']      = 'false';
  snap['_legs']          = JSON.stringify(_legs);
  if (window._lastResult) snap['_res'] = window._lastResult; // result snapshot for comparison
  TISStorage.saveTrade(saveName, snap);
  _currentTradeName = saveName;
  renderSavedTradesList(saveName);
  setModified(false);
  showToast('Saved as: ' + saveName);
}

// ── Rename selected saved trade ────────────────────────────────────────────
function renameTrade() {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) { showToast('Select a saved trade first'); return; }
  const currentName = sel.value;
  const input = prompt('Rename "' + currentName + '" to:', currentName);
  if (input === null) return;
  const renamed = input.trim();
  if (!renamed) { showToast('Name cannot be empty'); return; }
  if (renamed === currentName) return;
  if (TISStorage.loadTrades()[renamed] &&
      !confirm('"' + renamed + '" already exists. Overwrite it?')) return;

  const snap = TISStorage.loadTrade(currentName);
  if (!snap) { showToast('Trade not found'); return; }
  TISStorage.saveTrade(renamed, snap);
  TISStorage.deleteTrade(currentName);
  if (_currentTradeName === currentName) _currentTradeName = renamed;
  renderSavedTradesList(renamed);
  updateStateBadge();
  showToast('Renamed to: ' + renamed);
}

// ── Load selected trade ───────────────────────────────────────────────────
function loadSelectedTrade(explicit) {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) {
    if (explicit) showToast('Select a saved trade first');
    return;
  }
  const targetName = sel.value;
  if (_modified && !confirm('Discard unsaved changes and load "' + targetName + '"?')) {
    // Restore dropdown to reflect the form's current state
    sel.value = _currentTradeName || '';
    return;
  }
  const snap = TISStorage.loadTrade(targetName);
  if (!snap) { showToast('Trade not found in storage'); return; }
  applyInputSnapshot(snap);
  // Old saved trades (pre unit-toggle) have no sel-throughput-unit / sel-storage-unit in their snapshot —
  // flag them legacy so collectTrade keeps their original ₦/MT / ₦-lump semantics instead of ₦/L.
  _storageLegacy = detectStorageLegacyFromSnap(snap);
  syncAllStorageUnits();
  _legs = legsFromSnapshot(snap);   // new snaps carry _legs; legacy snaps rebuild from old fields
  renderLegEditor();
  refreshHedgePh();
  refreshHedgeSanity();
  updateHedgedVolPlaceholder();
  updateFinalIcePlaceholder();
  if (snap['_tog-ice-hedge'] != null) activateToggle(document.getElementById('tog-ice-hedge'), snap['_tog-ice-hedge'] === 'true');
  if (snap['_tog-fx-hedge']  != null) activateToggle(document.getElementById('tog-fx-hedge'),  snap['_tog-fx-hedge']  === 'true');
  if (snap['_tog-surcharge'] != null) activateToggle(document.getElementById('tog-surcharge'), snap['_tog-surcharge'] === 'true');
  _isSample = snap['_isSample'] === 'true';
  _currentTradeName = targetName;
  updateLcDisplay(); updateDepotVisibility(); updateCurrencyVisibility();
  updateSurchargeVisibility(); updateHedgeTab(); updateIceRouteVisibility(); updateFxRouteVisibility();
  updateHeader();
  setModified(false);
  recompute();
  showToast('Loaded: ' + targetName);
}

// ── Delete selected trade ─────────────────────────────────────────────────
function deleteSelectedTrade() {
  const sel = document.getElementById('sel-saved-trades');
  if (!sel || !sel.value) { showToast('Select a saved trade first'); return; }
  const name = sel.value;
  const isCurrentTrade = (_currentTradeName === name);
  const extra = isCurrentTrade ? ' (This is the trade currently in your form.)' : '';
  if (!confirm('Delete "' + name + '"? This cannot be undone.' + extra)) return;
  TISStorage.deleteTrade(name);
  if (isCurrentTrade) {
    _currentTradeName = null;
    // Form stays intact; saved copy is gone → state reverts to "new · unsaved"
  }
  renderSavedTradesList();
  sel.value = '';
  updateStateBadge();
  showToast('Deleted: ' + name);
}

// ── Save house defaults ───────────────────────────────────────────────────
function saveAsDefaults() {
  TISStorage.saveDefaults(snapshotInputs(DEFAULT_IDS));
  showToast('House defaults saved');
}

// ── Render saved trades dropdown ──────────────────────────────────────────
function renderSavedTradesList(selectName) {
  const trades = TISStorage.loadTrades();
  const sel    = document.getElementById('sel-saved-trades');
  if (sel) {
    const names = Object.keys(trades).sort();
    sel.innerHTML = '<option value="">Load a saved trade…</option>' +
      names.map(n => \`<option value="\${esc(n)}"\${n === selectName ? ' selected' : ''}>\${esc(n)}</option>\`).join('');
  }
  // keep the comparison picker in sync too
  const cmp = document.getElementById('cmp-select');
  if (cmp) {
    const cur = cmp.value;
    const names2 = Object.keys(trades).sort();
    cmp.innerHTML = '<option value="">Pick a saved trade…</option>' +
      names2.map(n => \`<option value="\${esc(n)}">\${esc(n)}</option>\`).join('');
    if (cur && names2.includes(cur)) cmp.value = cur;
  }
}

// ── Trade comparison (2026-08) ─────────────────────────────────────────────
// Diff the LIVE trade's computed result against any saved trade's stored result.
// Snapshots store the engine result at save time, so no recompute drift.
function _cmpRow(label, a, b, fmt) {
  if (a == null && b == null) return '';
  const delta = (b ?? 0) - (a ?? 0);
  const cls = delta > 0.005 ? 'pos' : delta < -0.005 ? 'neg' : 'muted';
  const f = fmt || ((v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  return \`<tr>
    <td>\${esc(label)}</td>
    <td class="r mono-num">\${a != null ? f(a) : '—'}</td>
    <td class="r mono-num">\${b != null ? f(b) : '—'}</td>
    <td class="r mono-num \${cls}">\${delta ? ((delta > 0 ? '+' : '−') + f(Math.abs(delta))) : '—'}</td>
  </tr>\`;
}
function runComparison() {
  const out = document.getElementById('cmp-out');
  const name = document.getElementById('cmp-select').value;
  if (!name) { out.innerHTML = '<div class="card-footer">Pick a saved trade first.</div>'; return; }
  const snap = TISStorage.loadTrade(name);
  if (!snap || !snap._res) { out.innerHTML = '<div class="card-footer muted">That snapshot predates result storage — re-save it to compare.</div>'; return; }
  const A = window._lastResult, B = snap._res; // A = live, B = saved
  const rows = [
    _cmpRow('TIS Net Profit', A?.profit?.tisNetProfit, B?.profit?.tisNetProfit, v => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })),
    _cmpRow('Standalone Profit', A?.profit?.standaloneProfit, B?.profit?.standaloneProfit, v => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })),
    _cmpRow('All-in Landed Cost', A?.cost?.allInCost, B?.cost?.allInCost),
    _cmpRow('Avg Realized $/MT', A?.price?.avgRealizedPriceUSDperMT, B?.price?.avgRealizedPriceUSDperMT),
    _cmpRow('Ex-ship Landed $/MT', A?.price?.exShipLandedPerMT, B?.price?.exShipLandedPerMT),
    _cmpRow('Delivered Qty (MT)', A?.meta?.deliveredQty, B?.meta?.deliveredQty),
    _cmpRow('Annualised Return', A?.tisAnnualisedReturn, B?.tisAnnualisedReturn, v => (v * 100).toFixed(2) + '%'),
  ].join('');
  const savedName = B?.meta?.tradeId || name;
  const liveName = A?.meta?.tradeId || 'live trade';
  out.innerHTML = \`<div class="tbl-wrap" style="padding:4px 22px 16px">
    <table class="data-table">
      <thead><tr><th>Metric</th><th class="r">\${esc(liveName)} (live)</th><th class="r">\${esc(savedName)} (saved)</th><th class="r">Δ saved − live</th></tr></thead>
      <tbody>\${rows}</tbody>
    </table></div>
    <div class="card-footer muted">Saved \${snap.savedAt ? new Date(snap.savedAt).toLocaleString() : ''}. Δ sign: positive = saved trade higher.</div>\`;
}
function clearComparison() {
  document.getElementById('cmp-select').value = '';
  document.getElementById('cmp-out').innerHTML = '';
}

// ── Deal close-out (2026-08) — client-side variance vs the live model run ────
// Mirrors engine/core/closeout.js direction semantics: revenue-like lines are
// favorable when higher, cost-like when lower. Baselines update server-side via
// POST /api/closeout (which calls deskMemory.updateBaseline).
function _coRow(label, model, actual, unit, favorableWhen) {
  if (actual == null || actual === '') return '';
  const delta = (actual ?? 0) - (model ?? 0);
  const good = favorableWhen === 'higher' ? delta > 0 : delta < 0;
  const verdict = Math.abs(delta) < 0.005 ? 'FLAT' : (good ? 'FAVORABLE' : 'UNFAVORABLE');
  const cls = verdict === 'FAVORABLE' ? 'pos' : verdict === 'UNFAVORABLE' ? 'neg' : 'muted';
  const f = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return \`<tr>
    <td>\${esc(label)}</td>
    <td class="r mono-num">\${model != null ? f(model) : '—'}</td>
    <td class="r mono-num">\${f(actual)}</td>
    <td class="r mono-num \${cls}">\${(delta > 0 ? '+' : '−') + f(Math.abs(delta))} \${cls === 'pos' ? '↑' : cls === 'neg' ? '↓' : ''}</td>
    <td><span class="state-badge">\${verdict}</span></td>
  </tr>\`;
}
function runCloseOut() {
  const out = document.getElementById('co-out');
  const A = window._lastResult;
  if (!A) { out.innerHTML = '<div class="card-footer muted">Compute a trade first.</div>'; return; }
  const val = (id) => { const v = document.getElementById(id)?.value; return v !== '' && v != null ? Number(v) : null; };
  const rows = [
    _coRow('Delivered qty', A.meta?.deliveredQty, val('co-qty'), 'MT', 'higher'),
    _coRow('Avg realized $/MT', A.price?.avgRealizedPriceUSDperMT, val('co-avgprice'), '$/MT', 'higher'),
    _coRow('All-in cost', A.cost?.allInCost, val('co-cost'), '$', 'lower'),
    _coRow('NAFEM rate', A.fx?.rates?.nafemReference, val('co-nafem'), '₦/$', 'higher'),
    _coRow('TIS net profit', A.profit?.tisNetProfit, val('co-net'), '$', 'higher'),
  ].join('');
  const anyRow = rows.replace(/<[^>]*tr>/g, '').trim();
  if (!anyRow) {
    out.innerHTML = '<div class="card-footer muted">Enter at least one actual above.</div>';
    return;
  }
  out.innerHTML = \`<div class="tbl-wrap" style="padding:4px 22px 16px">
    <table class="data-table">
      <thead><tr><th>Metric</th><th class="r">Model</th><th class="r">Actual</th><th class="r">Δ</th><th>Verdict</th></tr></thead>
      <tbody>\${rows}</tbody>
    </table></div>
    <div class="card-footer muted">Favorable/unfavorable judged by line type: costs lower = good; revenue higher = good. Log per-cost-line actuals via <code>node desk.js baseline set …</code>.</div>\`;
}

// ── Toast ─────────────────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  let el = document.getElementById('tis-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tis-toast'; el.className = 'tis-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

// ── Download Report (server-rendered PDF) ──────────────────────────────────
// Collects the LIVE trade (cached full-price compute + current identity fields) and POSTs it
// to the local report server (scripts/serve.js → POST /api/report.pdf), which runs the
// Playwright generator and streams back a McKinsey-grade PDF that auto-downloads — NO browser
// print dialog, NO print-CSS artifacts. All numbers come from the SAME engine the dashboard
// ran: the server recomputes the identical trade JSON, so the PDF matches the screen exactly.
async function downloadReport() {
  if (!_lastRes || !_lastTrade) { alert('Compute a trade first.'); return; }

  const gv = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const tradeName = gv('inp-trade-name') || _lastRes.meta.tradeName || 'Trade';
  // Live identity from the form (collectTrade keeps the loaded meta/parties unchanged). Spread the
  // loaded parties first so non-form fields (facility, bank) survive; the form values win.
  const parties = {
    ...(_lastTrade.parties || {}),
    partner:   gv('inp-partner-name'),
    supplier:  gv('inp-supplier-name'),
    inspector: gv('inp-inspector-name'),
  };
  const liveTrade = { ..._lastTrade, meta: { ..._lastTrade.meta, tradeName }, parties };

  const btn = document.querySelector('.btn-report');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const resp = await fetch('/api/report.pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(liveTrade),
    });
    if (!resp.ok) {
      let msg = 'server returned ' + resp.status;
      try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e2) {}
      throw new Error(msg);
    }
    const blob = await resp.blob();
    const cd = resp.headers.get('Content-Disposition') || '';
    const m = /filename="?([^"]+)"?/.exec(cd);
    // Server names the file from the live trade name (slug); this slug is only the offline fallback.
    const slug = String(tradeName || '').replace(/\s*\([^)]*(?:REGRESSION|FIXTURE|dummy|test|sample|EXAMPLE)[^)]*\)/gi,'').trim().replace(/[^\w\s-]/g,' ').trim().replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'').slice(0,80) || 'trade';
    const fname = (m && m[1]) || (slug + '.pdf');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Report downloaded — ' + fname);
  } catch (e) {
    alert('Report download failed: ' + e.message + '. The report server must be running — start it with: node scripts/serve.js (then open http://localhost:7891/TIS-interactive).');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

// ── Export / Import trades ─────────────────────────────────────────────────
function exportTrades() {
  const trades   = TISStorage.loadTrades();
  const defaults = TISStorage.loadDefaults();
  const payload  = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trades, defaults }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href     = url;
  a.download = 'tis-trades-' + ts + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const n = Object.keys(trades).length;
  showToast('Exported ' + n + ' trade' + (n === 1 ? '' : 's'));
}

function importTrades() {
  const inp = document.getElementById('imp-file-input');
  if (inp) { inp.value = ''; inp.click(); }
}

// True only for a non-null, non-array plain object — guards against typeof null / typeof [] both === 'object'.
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function importTradesFromFile(inp) {
  const file = inp.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let payload;
    try { payload = JSON.parse(e.target.result); } catch(_) { alert('Import failed: the file is not valid JSON.'); return; }

    // ── Validate the full shape BEFORE writing anything (atomic — no partial writes) ──
    if (!isPlainObject(payload) || payload.version !== 1 || !isPlainObject(payload.trades)) {
      alert('Import failed: this is not a TIS trade export (expected version 1 with a trades object).');
      return;
    }
    if (payload.defaults !== undefined && payload.defaults !== null && !isPlainObject(payload.defaults)) {
      alert('Import failed: the export is corrupt (defaults block is malformed).');
      return;
    }
    const incoming = Object.keys(payload.trades);
    if (incoming.length === 0) {
      alert('Import failed: the file contains no saved trades.');
      return;
    }
    // Every entry must be a {snap:{…}} object — if ANY is malformed, abort with the store untouched.
    for (const name of incoming) {
      const entry = payload.trades[name];
      if (!isPlainObject(entry) || !isPlainObject(entry.snap)) {
        alert('Import failed: the export is corrupt (trade "' + name + '" has no valid snapshot). Nothing was changed.');
        return;
      }
    }

    // ── Shape is valid — only same-name trades are overwritten; all other existing trades are kept ──
    const existing  = TISStorage.loadTrades();
    const conflicts = incoming.filter(function(n) { return !!existing[n]; });
    if (conflicts.length > 0) {
      if (!confirm('These trades already exist and will be overwritten: ' + conflicts.join(', ') + '. Other saved trades are kept. Continue?')) return;
    }
    let count = 0;
    for (const name of incoming) {
      // Any trade reaching local storage via Save/Save As is real — force-set here too, matching
      // that path (saveTrade/saveAsTrade), so an imported snapshot can never carry a stale or
      // tampered _isSample:true into the Fixture badge on load.
      const snap = { ...payload.trades[name].snap, _isSample: 'false' };
      TISStorage.saveTrade(name, snap);   // merges into the store; non-conflicting trades survive
      count++;
    }
    if (isPlainObject(payload.defaults)) TISStorage.saveDefaults(payload.defaults);
    renderSavedTradesList();
    showToast('Imported ' + count + ' trade' + (count === 1 ? '' : 's'));
  };
  reader.readAsText(file);
}

// ── Window exposes ────────────────────────────────────────────────────────
window.newTrade            = newTrade;
window.saveTrade           = saveTrade;
window.saveAsTrade         = saveAsTrade;
window.renameTrade         = renameTrade;
window.loadSelectedTrade   = loadSelectedTrade;
window.deleteSelectedTrade = deleteSelectedTrade;
window.saveAsDefaults       = saveAsDefaults;
window.downloadReport       = downloadReport;
window.exportTrades         = exportTrades;
window.importTrades         = importTrades;
window.importTradesFromFile = importTradesFromFile;

// ── Boot ───────────────────────────────────────────────────────────────────
_storageLegacy = detectStorageLegacyFromCostLines(INIT.costLines);   // bundled fixture may be old-format
_legs = legsFromTrade(INIT);   // seed the per-leg editor from the initial trade
renderLegEditor();
wireLegEditor();
initTheme();
updateLcDisplay();
updateDepotVisibility();
syncAllStorageUnits();
updateCurrencyVisibility();
updateSurchargeVisibility();
updateHedgeTab();
updateIceRouteVisibility();
updateFxRouteVisibility();
updateHeader();
renderSavedTradesList();
updateStateBadge();
recompute();
refreshHedgePh();
refreshHedgeSanity();
updateHedgedVolPlaceholder();
updateFinalIcePlaceholder();

// ── Condensed KPI on results scroll (Batch G) ─────────────────────────────
// The outer app header (with the full KPI triad) is a fixed app-shell element
// — html/body and .app-body all have overflow:hidden, so only .results
// scrolls; the header is always visible regardless of scroll position and
// never "scrolls off-screen" in this layout. This mirror instead gives a
// persistent reference to the headline TIS Net Profit figure while reviewing
// a long results scroll (Cost Build-Up -> Partner Deliverables -> Hedge ->
// Tax -> Sensitivities) without scrolling back up to the still-visible-but-
// farther-away real header. It lives as a flex sibling of .results (see the
// .results-sticky-kpi CSS comment for why — not position:sticky over the
// scroll content, which can't prevent overlap for the full scroll range),
// so the space is already permanently reserved; this listener only toggles
// the opacity/transform reveal, no layout measurement needed.
(function () {
  var resultsEl = document.querySelector('.results');
  var stickyEl  = document.getElementById('results-sticky-kpi');
  if (!resultsEl || !stickyEl) return;
  var THRESHOLD = 140;
  resultsEl.addEventListener('scroll', function () {
    stickyEl.classList.toggle('visible', resultsEl.scrollTop > THRESHOLD);
  });
})();

})();
</script>

</body>
</html>`;

// ── 11. Write output ─────────────────────────────────────────────────────────
const outPath = path.join(OUT, 'TIS-interactive.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('HTML → ' + path.relative(ROOT, outPath));
