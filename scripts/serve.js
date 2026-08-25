'use strict';

// ─── Local dashboard + report server ──────────────────────────────────────────
// Replaces the inline `python -m http.server` static server with a Node server that
// does BOTH jobs from one origin (so the dashboard's relative fetch works):
//
//   • GET  *                 — serves the static dashboard + assets from out/
//                              (/, /TIS-interactive → out/TIS-interactive.html)
//   • POST /api/report.pdf   — body = the current trade JSON; runs the Playwright
//                              generator (scripts/build-report-pdf.js) and streams the
//                              PDF back as an attachment so the browser auto-downloads
//                              it with NO print dialog.
//
// One warm Chromium browser is kept alive across requests for fast repeat generation.
//
//   node scripts/serve.js            # http://localhost:7891/TIS-interactive
//   PORT=8080 node scripts/serve.js

const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');

const { renderTradePdf } = require('./build-report-pdf');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'out');
const PORT = Number(process.env.PORT) || 7891;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.pdf':  'application/pdf',
  '.ico':  'image/x-icon',
};

// ─── Warm Chromium (reused across PDF requests) ───────────────────────────────
// _launching serializes concurrent callers onto a single in-flight launch promise —
// without it, two near-simultaneous requests can each see _browser as null/disconnected
// and each call chromium.launch(), orphaning the second instance (never closed, not even
// on SIGINT/SIGTERM, since only the last-assigned _browser reference gets tracked).
let _browser = null;
let _launching = null;
async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_launching) return _launching;
  const { chromium } = require('playwright');
  _launching = chromium.launch()
    .then((b) => { _browser = b; _launching = null; return b; })
    .catch((err) => { _launching = null; throw err; });
  return _launching;
}

// ─── Static file serving (out/) ───────────────────────────────────────────────
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '/TIS-interactive' || urlPath === '/TIS-interactive/') {
    urlPath = '/TIS-interactive.html';
  }
  // Resolve within OUT and reject any traversal that escapes it.
  const filePath = path.join(OUT, path.normalize(urlPath));
  if (filePath !== OUT && !filePath.startsWith(OUT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

// ─── POST /api/report.pdf — generate + stream the branded PDF ─────────────────
function handleReportPdf(req, res) {
  let body = '';
  let aborted = false;
  req.on('data', (c) => {
    body += c;
    if (body.length > 12e6) { aborted = true; req.destroy(); }   // 12 MB guard
  });
  req.on('end', async () => {
    if (aborted) return;
    try {
      const trade = JSON.parse(body);
      const browser = await getBrowser();
      // fileName is the LIVE-trade-name slug (build-report-pdf.js), never the fixture tradeId.
      const { pdf, fileName } = await renderTradePdf(trade, { browser });
      const fname = (fileName || 'trade.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': pdf.length,
        'Cache-Control': 'no-store',
      });
      res.end(pdf);
      console.log(`PDF → ${fname}  (${(pdf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      const msg = String((e && e.message) || e);
      console.error('report.pdf failed:', msg);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
  });
}

// ─── Quote book API — capture/list/consensus from the dashboard ───────────────
const quotebook = require('../engine/core/quotebook');
const fxbook = require('../engine/core/fxbook');
const tradesync = require('../engine/core/tradesync');

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function handleQuotes(req, res, urlPath) {
  if (req.method === 'GET') {
    // /api/quotes            -> all active quotes
    // /api/quotes/consensus/<indexId> -> consensus view for one index
    const m = /^\/api\/quotes\/consensus\/(.+)$/.exec(urlPath);
    if (m) {
      try { return json(res, 200, quotebook.consensus(decodeURIComponent(m[1]))); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    return json(res, 200, quotebook.load());
  }
  if (req.method === 'POST') {
    let body = '';
    let aborted = false;
    req.on('data', (c) => { body += c; if (body.length > 1e6) { aborted = true; req.destroy(); } });
    req.on('end', () => {
      if (aborted) return;
      try {
        const d = JSON.parse(body || '{}');
        const entry = quotebook.add({
          indexId: d.indexId, value: Number(d.value), asOf: d.asOf,
          capturedAt: d.capturedAt,
          source: { name: d.source || 'unknown', org: d.org || '', tier: d.tier || 'B' },
          method: d.method, notes: d.notes,
        });
        json(res, 201, entry);
      } catch (e) { json(res, 400, { error: e.message }); }
    });
    return;
  }
  json(res, 405, { error: 'Method Not Allowed' });
}

// ─── Router ───────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (req.method === 'POST' && urlPath === '/api/report.pdf') return handleReportPdf(req, res);
  if (urlPath.startsWith('/api/quotes')) return handleQuotes(req, res, urlPath);
  if (urlPath.startsWith('/api/trades')) {
    if (req.method === 'GET') return json(res, 200, tradesync.load());
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload || payload.version !== 1 || typeof payload.trades !== 'object') {
            return json(res, 400, { error: 'expected version 1 with a trades object' });
          }
          const mode = urlPath === '/api/trades/replace' ? 'replace' : 'merge';
          json(res, 200, tradesync.merge(payload, mode));
        } catch (e) { json(res, 400, { error: e.message }); }
      });
      return;
    }
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (urlPath.startsWith('/api/fx')) {
    if (req.method === 'GET') return json(res, 200, fxbook.load());
    if (req.method === 'POST') {
      let body = '';
      let aborted = false;
      req.on('data', (c) => { body += c; if (body.length > 1e6) { aborted = true; req.destroy(); } });
      req.on('end', () => {
        if (aborted) return;
        try {
          const d = JSON.parse(body || '{}');
          const entry = fxbook.add({
            date: d.date, nafem: Number(d.nafem),
            parallel: d.parallel != null ? Number(d.parallel) : null,
            source: d.source, notes: d.notes,
          });
          json(res, 201, entry);
        } catch (e) { json(res, 400, { error: e.message }); }
      });
      return;
    }
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`Serving at http://localhost:${PORT}/TIS-interactive`);
  console.log(`Report endpoint: POST http://localhost:${PORT}/api/report.pdf`);
  console.log(`Quote book API:  GET|POST http://localhost:${PORT}/api/quotes`);
});

// Await any in-flight launch before closing, so a shutdown signal arriving mid-launch doesn't
// orphan the Chromium process it was about to track.
async function shutdown() {
  try {
    const browser = _browser || (_launching ? await _launching : null);
    if (browser) await browser.close();
  } catch { /* best-effort close on shutdown */ }
  process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
