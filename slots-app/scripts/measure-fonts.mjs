// 视口字号/布局测量(D-02):node scripts/measure-fonts.mjs [baseUrl] [out.json]
// 对 320×568 … 768×1024 逐个视口:测免责声明、提示行、购买确认 .fine、设计说明面板正文的实际渲染字号(= 计算字号 × 舞台缩放),
// 并检查:主要控件在视口内且未被遮挡;免责声明/提示行/购买钮互不重叠、不出屏;弹窗在视口内。
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUTJSON = process.argv[3] ?? new URL('../screenshots/viewport-fonts.json', import.meta.url).pathname;
const VPS = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [430, 932], [768, 1024]];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const rows = []; let bad = 0;
for (const [w, h] of VPS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}?game=A&seed=vp&reset=1`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 40000 }); await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect(); const s = st.width / 1080;
    const r = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const $ = sel => document.querySelector(sel);
    const fs = sel => { const e = $(sel); return e ? +(parseFloat(getComputedStyle(e).fontSize) * s).toFixed(1) : null; };
    const lines = sel => { const e = $(sel); if (!e) return null; const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2; return Math.round(e.getBoundingClientRect().height / s / lh * 10) / 10; };
    const dis = r($('#disclaimer')), buy = r($('#buy')), hint = r($('#hint'));
    const ctrl = ['spin', 'auto', 'turbo', 'bet-minus', 'bet-plus', 'bet-max', 'info', 'menu', 'sound', 'tab-A', 'tab-B'].map(id => {
      const e = $(`[data-testid="${id}"]`); const b = r(e); const t = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2);
      return { id, inside: b.x >= -0.5 && b.r <= innerWidth + 0.5 && b.y >= -0.5 && b.b <= innerHeight + 0.5, hit: !!t && (e === t || e.contains(t) || t.contains(e)) };
    });
    const ov = (a, c) => a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b;
    return {
      scale: +s.toFixed(3), disclaimerPx: fs('#disclaimer'), hintPx: fs('#hint'), disclaimerLines: lines('#disclaimer'),
      layoutOk: dis.b <= st.bottom + 0.5 && dis.y >= buy.b - 0.5 && !ov(dis, buy) && !ov(hint, buy),
      disBox: dis, buyBox: buy,
      ctrlBad: ctrl.filter(c => !c.inside || !c.hit).map(c => c.id),
    };
  });
  // 购买确认 .fine
  await page.click('[data-testid="buy"]', { force: true }); await page.waitForSelector('[data-testid="buy-confirm"]'); await page.waitForTimeout(350);
  const buy = await page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(); const s = st.width / 1080;
    const p = document.querySelector('[data-testid="buy-confirm"] .popup').getBoundingClientRect(); const f = document.querySelector('[data-testid="buy-confirm"] .fine');
    return { finePx: +(parseFloat(getComputedStyle(f).fontSize) * s).toFixed(1), inside: p.x >= -0.5 && p.right <= innerWidth + 0.5 && p.y >= -0.5 && p.bottom <= innerHeight + 0.5 }; });
  if (w === 360) await page.screenshot({ path: new URL('../screenshots/D02-360x640-buy-confirm.png', import.meta.url).pathname });
  await page.click('[data-testid="buy-cancel"]'); await page.waitForTimeout(250);
  // 设计说明面板(若已实现)
  let dp = null;
  await page.click('[data-testid="menu"]', { force: true }); await page.waitForSelector('[data-testid="menu-popup"]');
  if (await page.$('[data-testid="menu-design"]')) {
    await page.click('[data-testid="menu-design"]'); await page.waitForSelector('[data-testid="design-popup"]:not([hidden])'); await page.waitForTimeout(450);
    dp = await page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(); const s = st.width / 1080;
      const p = document.querySelector('[data-testid="design-popup"]').getBoundingClientRect(); const t = document.querySelector('.dn-card p'); const h = document.querySelector('.dn-card h3'); const d = document.querySelector('.dn-disc');
      const px = e => +(parseFloat(getComputedStyle(e).fontSize) * s).toFixed(1);
      return { textPx: px(t), headPx: px(h), discPx: px(d), inside: p.x >= -0.5 && p.right <= innerWidth + 0.5 && p.y >= -0.5 && p.bottom <= innerHeight + 0.5 }; });
    await page.click('[data-testid="dn-close"]'); await page.waitForTimeout(250);
  }
  const row = { vp: `${w}×${h}`, scale: m.scale, disclaimerPx: m.disclaimerPx, disclaimerLines: m.disclaimerLines, hintPx: m.hintPx, buyFinePx: buy.finePx, designTextPx: dp?.textPx ?? null, designHeadPx: dp?.headPx ?? null, designDiscPx: dp?.discPx ?? null,
    layoutOk: m.layoutOk, ctrlBad: m.ctrlBad.join(',') || '-', buyPopupInside: buy.inside, designInside: dp?.inside ?? null, pageerrors: errs.length };
  rows.push(row);
  if (!row.layoutOk || m.ctrlBad.length || !buy.inside || (dp && !dp.inside) || errs.length) bad++;
  await ctx.close();
}
console.table(rows);
fs.writeFileSync(OUTJSON, JSON.stringify(rows, null, 1));
await b.close();
process.exit(0);
