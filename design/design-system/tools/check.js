const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'); const path = require('path');
const DIR = process.env.DIR || path.join(__dirname, '..', 'rendercheck');
(async () => {
  const dir = DIR;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
  const report = [];
  for (const f of files) {
    const errs = [];
    page.removeAllListeners('pageerror'); page.removeAllListeners('console');
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto('file://' + path.join(dir, f));
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => { const r = document.getElementById('root'); const b = document.body.getBoundingClientRect(); return { kids: r ? r.childElementCount : -1, h: Math.round(document.documentElement.scrollHeight), w: Math.round(document.documentElement.scrollWidth), text: (r ? r.innerText : document.body.innerText).length }; });
    report.push(f + ' kids=' + info.kids + ' h=' + info.h + ' w=' + info.w + ' text=' + info.text + (errs.length ? ' ERR ' + errs.join(' | ') : ''));
    if (process.env.SHOT) await page.screenshot({ path: path.join(dir, 'shots', f.replace('.html', '.png')), fullPage: true });
  }
  await browser.close();
  console.log(report.join('\n'));
})();
