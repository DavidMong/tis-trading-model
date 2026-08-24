'use strict';

// BROWSER-SAFE quotebook facade. The interactive dashboard bundles the engine with esbuild for
// the browser (no node:fs). The bundler defines the BROWSER_BUILD flag; the real store is only
// required in Node builds.

// esbuild `--define:BROWSER_BUILD=true` for the dashboard bundle; Node gets false.
const BROWSER = typeof BROWSER_BUILD !== 'undefined' ? BROWSER_BUILD : false;

// NOTE: the require below is deliberately INDIRECT (`require(modPath)`) rather than
// `require('./quotebook')`. esbuild statically follows every *literal* require path — even
// inside a never-executed `if (!BROWSER)` branch — which would pull node:fs/node:path into
// the browser bundle and break it. An indirect require is opaque to esbuild ("indirect call
// to require"), so the bundler leaves it alone; under plain Node (CommonJS) it still loads
// the real store at runtime exactly as before.
if (!BROWSER) {
  const modPath = './quotebook';
  module.exports = require(modPath);
} else {
  module.exports = {
    resolveForTrade: (trade) => {
      const q = trade.indexQuotes || {};
      return {
        quotes: { ...q },
        provenance: Object.keys(q).map((id) => ({
          indexId: id, value: q[id], origin: 'TRADE-PINNED',
          note: 'pinned in trade file (browser session)',
        })),
      };
    },
    latest: () => ({}),
    consensus: () => ({ count: 0 }),
    add: () => { throw new Error('quotebook: not available in browser'); },
    retire: () => { throw new Error('quotebook: not available in browser'); },
    load: () => ({ version: 1, quotes: [] }),
    withStaleness: (e) => e,
    MAX_AGE_HOURS: { A: 30, B: 18, C: 8 },
  };
}
