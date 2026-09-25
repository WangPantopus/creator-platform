const { chromium } = require(process.env.PW);
const fs = require('fs'); const path = require('path');
const DIR = process.env.DIR || path.join(__dirname, '..', 'rendercheck');
(async () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.light.html')).sort();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 200 } });
  for (const f of files) {
    await page.goto('file://' + path.join(DIR, f)); await page.waitForTimeout(100);
    const r = await page.evaluate(() => { const el = document.getElementById('root') || document.querySelector('.cover'); const b = el.getBoundingClientRect(); return Math.ceil(b.bottom) + ' w' + Math.ceil(b.width) + ' fonts:' + [...document.fonts].filter(x => x.status === 'loaded').map(x => x.family).join(','); });
    console.log(f.replace('.light.html', ''), r);
  }
  await browser.close();
})();
