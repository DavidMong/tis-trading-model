'use strict';
// Find the remaining light-mode AA failure.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:7891/TIS-interactive', { waitUntil: 'networkidle' });
  await p.evaluate(() => window.applyTheme('light'));
  await p.waitForTimeout(250);
  const fails = await p.evaluate(() => {
    function lum(c){const m=c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);if(!m)return null;const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return .2126*f(+m[1])+.7152*f(+m[2])+.0722*f(+m[3])}
    function bgOf(el){const chain=[];let n=el;while(n&&n!==document.documentElement){chain.push(n);n=n.parentElement}
      let base={r:255,g:255,b:255},found=-1;
      for(let i=0;i<chain.length;i++){const m=getComputedStyle(chain[i]).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);if(!m)continue;const a=m[4]!==undefined?parseFloat(m[4]):1;if(a>=1){base={r:+m[1],g:+m[2],b:+m[3]};found=i;break}}
      return 'rgb('+base.r+','+base.g+','+base.b+')'}
    const out=[];
    document.querySelectorAll('button, .results td, .results th, .kpi-value, .kpi-label').forEach(el=>{
      const cs=getComputedStyle(el); const f=lum(cs.color), l=lum(bgOf(el));
      if(f==null||l==null)return;
      const r=((Math.max(f,l)+.05)/(Math.min(f,l)+.05));
      const size=parseFloat(cs.fontSize); const bold=parseInt(cs.fontWeight)>=600;
      const min=(size>=24||(size>=18.66&&bold))?3:4.5;
      if(r<min) out.push({t:(el.textContent||'').trim().slice(0,30)||el.id||el.className.slice(0,24), color:cs.color, bg:bgOf(el), ratio:+r.toFixed(2), size});
    });
    return out;
  });
  console.log(JSON.stringify(fails,null,1));
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
