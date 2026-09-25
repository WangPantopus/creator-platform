// Renders every board of every canvas in light and night, with web fonts, and records problems.
// Local files are served through request interception; Google Fonts are fetched once and cached in memory.
const { chromium } = require(process.env.PW);
const fs = require('fs'); const path = require('path');
const ROOT = __dirname;
const canvases = (process.env.ONLY_CANVAS || 'qv-4a,qv-4b,qv-4c,qv-4d,qv-4e,qv-5').split(',');
const onlyBoards = (process.env.ONLY_BOARDS || '').split(',').filter(Boolean);
const themes = (process.env.THEMES || 'light,night').split(',');
const cache = new Map();
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const report = [];
  for (const c of canvases) {
    const dir = path.join(ROOT, c);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'project/canvas.json'), 'utf8'));
    fs.mkdirSync(path.join(ROOT, 'shots', c), { recursive: true });
    for (const theme of themes) {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true, deviceScaleFactor: Number(process.env.DSF || 1) });
      if (theme === 'night') await ctx.addInitScript(() => { document.documentElement.setAttribute('data-theme', 'night'); });
      await ctx.route('http://dc.local/**', (route) => {
        const p = path.join(dir, decodeURIComponent(new URL(route.request().url()).pathname));
        if (!fs.existsSync(p)) return route.fulfill({ status: 404, body: '' });
        route.fulfill({ status: 200, contentType: (TYPES[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8', body: fs.readFileSync(p) });
      });
      await ctx.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, async (route) => {
        const u = route.request().url();
        try {
          if (!cache.has(u)) {
            const resp = await route.fetch();
            cache.set(u, { status: resp.status(), headers: resp.headers(), body: await resp.body() });
          }
          const r = cache.get(u);
          await route.fulfill({ status: r.status, headers: r.headers, body: r.body });
        } catch (e) { await route.abort(); }
      });
      for (const b of idx.order) {
        if (onlyBoards.length && !onlyBoards.includes(b)) continue;
        const f = idx.boards[b];
        const page = await ctx.newPage();
        await page.setViewportSize({ width: f.w, height: f.h });
        const errs = [];
        page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
        await page.goto(`http://dc.local/project/${b}`);
        try { await page.waitForFunction(() => document.body.innerText.length > 20, null, { timeout: 8000 }); } catch (e) { errs.push('timeout waiting for render'); }
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(Number(process.env.WAIT || 250));
        const info = await page.evaluate(([W, H]) => {
          const root = [...document.querySelectorAll('body *')].find((d) => d.style && d.style.width === W + 'px' && d.style.height === H + 'px');
          let over = 0, wide = 0;
          if (root) {
            const r0 = root.getBoundingClientRect();
            over = Math.max(0, root.scrollHeight - H); wide = Math.max(0, root.scrollWidth - W);
            for (const el of root.querySelectorAll('*')) {
              const r = el.getBoundingClientRect();
              if (r.height && r.bottom - r0.top > H + over) over = Math.round(r.bottom - r0.top - H);
              if (r.width && r.right - r0.left > W + wide + 1) wide = Math.round(r.right - r0.left - W);
            }
          }
          const fonts = [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family).filter((v, i, a) => a.indexOf(v) === i).join('+');
          return { root: !!root, over, wide, fonts };
        }, [f.w, f.h]);
        await page.screenshot({ path: path.join(ROOT, 'shots', c, b.replace('.dc.html', '') + '.' + theme + '.png'), clip: { x: 0, y: 0, width: f.w, height: f.h } });
        const line = [c, b, theme, 'board ' + f.w + 'x' + f.h, (info.root ? '' : 'NO-ROOT ') + (info.over ? 'OVERFLOW+' + info.over : 'fits') + (info.wide ? ' WIDE+' + info.wide : ''), 'fonts ' + info.fonts, errs.join(' | ')].join('\t');
        report.push(line); console.log(line);
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'report.tsv'), report.join('\n') + '\n');
})();
