'use strict';
// Mobile audit: 390x844 viewport, capture layout issues + screenshots.
// Overflow check now respects scroll containers (a table inside an
// overflow-x:auto wrap is FINE — it scrolls, it doesn't break the page).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:7891/TIS-interactive', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof window.applyTheme === 'function', null, { timeout: 10000 }).catch(() => {});
  await p.evaluate(() => window.applyTheme && window.applyTheme('dark'));
  await p.waitForTimeout(800);

  // True overflow = elements extending past the viewport whose scroll ancestors
  // do NOT have overflow-x auto/scroll/hidden.
  const overflow = await p.evaluate(() => {
    const docW = document.documentElement.clientWidth;
    const bad = [];
    const hasScrollableAncestor = (el) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
        n = n.parentElement;
      }
      return false;
    };
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > docW + 2 && !hasScrollableAncestor(el)) {
        bad.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), right: Math.round(r.right), w: Math.round(r.width) });
      }
    });
    return { docW, scrollW: document.documentElement.scrollWidth, count: bad.length, sample: bad.slice(0, 10) };
  });
  console.log('viewport:', overflow.docW, 'scrollWidth:', overflow.scrollW, overflow.scrollW > overflow.docW ? '← PAGE OVERFLOW' : 'page ok');
  console.log('true overflowing elements:', overflow.count);
  overflow.sample.forEach(s => console.log('  ', s.tag, s.cls, 'w=' + s.w, 'right=' + s.right));

  // KPI chips stacked?
  const kpi = await p.evaluate(() => {
    const chips = [...document.querySelectorAll('.kpi-chip')].map(c => ({ w: Math.round(c.getBoundingClientRect().width) }));
    return chips;
  });
  console.log('kpi chip widths:', JSON.stringify(kpi));

  await p.screenshot({ path: 'out/mobile-top.png' });
  // open drawer and screenshot
  await p.evaluate(() => { document.querySelector('.sidebar')?.classList.add('open'); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'out/mobile-drawer.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await b.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
