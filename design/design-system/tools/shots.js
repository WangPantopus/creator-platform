const { chromium } = require(process.env.PW);
const fs = require('fs'); const path = require('path');
const DIR = process.env.DIR || path.join(__dirname, '..', 'rendercheck');
(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && (!only.length || only.some(o => f.startsWith(o + '.')))).sort();
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 300 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const f of files) {
    await page.goto('file://' + path.join(DIR, f));
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
    const fonts = await page.evaluate(() => [...document.fonts].filter(x => x.status === 'loaded').length);
    await page.screenshot({ path: path.join(DIR, 'shots', f.replace('.html', '.png')), fullPage: true });
    console.log(f, 'fonts loaded:', fonts);
  }
  await browser.close();
})();
