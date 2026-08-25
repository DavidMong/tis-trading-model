'use strict';

// PRODUCTION ENTRY — dashboard + API on one port, built at boot.
// Render/Railway/Fly set PORT; we bind 0.0.0.0.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');

// Build the interactive dashboard at boot (esbuild via npx — downloads on first run).
console.log('[server] building dashboard…');
try {
  execSync('npx --yes esbuild scripts/engine-browser-entry.js --bundle --format=iife --global-name=TISEngine --minify "--define:BROWSER_BUILD=true" --outfile=out/engine.bundle.js', { cwd: ROOT, stdio: 'inherit' });
  execSync('node scripts/build-interactive.js', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  // If a prebuilt bundle was committed, boot can continue without rebuilding.
  if (!fs.existsSync(path.join(OUT, 'TIS-interactive.html'))) {
    console.error('[server] dashboard build failed and no prebuilt copy exists');
    throw e;
  }
  console.warn('[server] build failed; serving committed bundle');
}

const http = require('node:http');
const quotebook = require('./engine/core/quotebook');
const fxbook = require('./engine/core/fxbook');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function handleQuotes(req, res, urlPath) {
  if (req.method === 'GET') {
    const m = /^\/api\/quotes\/consensus\/(.+)$/.exec(urlPath);
    if (m) {
      try { return json(res, 200, quotebook.consensus(decodeURIComponent(m[1]))); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    return json(res, 200, quotebook.load());
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const d = JSON.parse(body || '{}');
        const entry = quotebook.add({
          indexId: d.indexId, value: Number(d.value), asOf: d.asOf,
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

function handleFx(req, res) {
  if (req.method === 'GET') return json(res, 200, fxbook.load());
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
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
  json(res, 405, { error: 'Method Not Allowed' });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '/TIS-interactive' || urlPath === '/TIS-interactive/') {
    urlPath = '/TIS-interactive.html';
  }
  const filePath = path.join(OUT, path.normalize(urlPath));
  if (filePath !== OUT && !filePath.startsWith(OUT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath.startsWith('/api/quotes')) return handleQuotes(req, res, urlPath);
  if (urlPath.startsWith('/api/fx')) return handleFx(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405, { 'Content-Type': 'text/plain' }); res.end('Method Not Allowed');
});

// Optional bearer-token gate: set ACCESS_TOKEN to require ?t=<token> on API calls.
const TOKEN = process.env.ACCESS_TOKEN || null;
if (TOKEN) {
  console.log('[server] access token protection ENABLED');
  server.on('request', (req, res) => {
    if (!urlPathStartsWithApi(req.url)) return; // static + shell pass through
    const url = new URL(req.url, 'http://x');
    const provided = url.searchParams.get('t') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (provided === TOKEN) return;
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
  });
}
function urlPathStartsWithApi(u) { return u.startsWith('/api/'); }

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] dashboard live on 0.0.0.0:${PORT}/TIS-interactive`);
});
