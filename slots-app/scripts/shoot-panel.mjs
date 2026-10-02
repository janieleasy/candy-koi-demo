// 重拍设计说明面板截图(540 / 1080 / 360×640 × A/B × 顶部/滚到底):node scripts/shoot-panel.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [vp, tag, mobile] of [[{ width: 1080, height: 1920 }, '1080w', false], [{ width: 360, height: 640 }, '360x640', true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: tag === '1080w' ? 1 : 2, ...(mobile ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  for (const g of ['A', 'B']) {
    await page.goto(`${BASE}?game=${g}&seed=dp&reset=1`); await page.waitForSelector('html[data-ready="1"]'); await page.waitForTimeout(500);
    await page.click('#dn-open', { force: true }); await page.waitForSelector('#dn-panel:not([hidden])'); await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}design-panel-${g}-${tag}.png` });
    await page.evaluate(() => { const s = document.getElementById('dn-body'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}design-panel-${g}-${tag}-scrolled.png` });
  }
  await ctx.close();
}
await b.close();
console.log('done');
