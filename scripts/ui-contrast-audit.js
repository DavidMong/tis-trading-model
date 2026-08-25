'use strict';
// Quick re-audit: contrast + both themes.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://localhost:7891/TIS-interactive', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.applyTheme('dark'));
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => window.applyTheme(t), theme);
    await page.waitForTimeout(250);
    const report = await page.evaluate(() => {
      function lum(c) {
        const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
      }
      function bgOf(el) {
        const chain = [];
        let n = el;
        while (n && n !== document.documentElement) { chain.push(n); n = n.parentElement; }
        let base = { r: 255, g: 255, b: 255 }, found = -1;
        for (let i = 0; i < chain.length; i++) {
          const m = getComputedStyle(chain[i]).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
          if (!m) continue;
          const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
          if (a >= 1) { base = { r: +m[1], g: +m[2], b: +m[3] }; found = i; break; }
        }
        for (let i = found - 1; i >= 0; i--) {
          const m = getComputedStyle(chain[i]).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
          if (!m) continue;
          const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
          if (a === 0) continue;
          base = { r: +m[1] * a + base.r * (1 - a), g: +m[2] * a + base.g * (1 - a), b: +m[3] * a + base.b * (1 - a) };
        }
        const s = `rgb(${Math.round(base.r)},${Math.round(base.g)},${Math.round(base.b)})`;
        return { bg: s, l: lum(s) };
      }
      let fails = 0, count = 0;
      document.querySelectorAll('.results td, .results th, .kpi-value, .kpi-label, .card-footer, h2.section-heading, .wfsvg-value, .wfsvg-collabel-name, button').forEach((el) => {
        if (!el.textContent || !el.textContent.trim()) return;
        const cs = getComputedStyle(el);
        const fgL = lum(cs.color);
        const { l } = bgOf(el);
        if (fgL == null || l == null) return;
        count++;
        const r = ((Math.max(fgL, l) + 0.05) / (Math.min(fgL, l) + 0.05));
        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight) >= 600;
        const min = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
        if (r < min) fails++;
      });
      return { count, fails };
    });
    console.log(`[${theme}] checked ${report.count}, AA failures: ${report.fails}`);
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
