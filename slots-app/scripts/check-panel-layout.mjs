// 设计说明面板:DOM 实测逻辑坐标 vs UI 稿 panel-layout.json / panel-spec.md。node scripts/check-panel-layout.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:5173/';
const LAYOUT = JSON.parse(fs.readFileSync('/workspace/slots-ui/assets/design-notes/panel-layout.json', 'utf8')); // 只读
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`${BASE}?game=A&seed=lay&reset=1`); await page.waitForSelector('html[data-ready="1"]'); await page.waitForTimeout(500);
let bad = 0; const rows = [];
const cmp = (name, got, want, tol = 2) => { const ok = Math.abs(got - want) <= tol; if (!ok) bad++; rows.push({ item: name, 实测: +got.toFixed(1), 稿面: +want.toFixed(1), 差: +(got - want).toFixed(1), ok: ok ? '✓' : '✗' }); };
for (const g of ['A', 'B']) {
  await page.evaluate(gm => { const p = document.getElementById('dn-panel'); if (p.hidden) document.getElementById('dn-open').click(); document.getElementById(`dn-tab-${gm}`).click(); }, g);
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect(); const s = st.width / 1080;
    const r = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; const b = e.getBoundingClientRect(); return { x: (b.x - st.x) / s, y: (b.y - st.y) / s, w: b.width / s, h: b.height / s }; };
    const scroll = document.getElementById('dn-body'); const sc = r(scroll);
    const top = scroll.getBoundingClientRect().y;
    return { panel: r('#dn-panel'), title: r('.dn-titlebar'), x: r('.dn-x'), tabs: r('.dn-tabs'), scroll: sc, close: r('.dn-close'), foot: r('.dn-foot'),
      contentH: scroll.scrollHeight, maxScroll: scroll.scrollHeight - scroll.clientHeight,
      cards: [...document.querySelectorAll('.dn-card')].map(c => { const b = c.getBoundingClientRect(); return { id: c.dataset.id, y: (b.y - top) / s + scroll.scrollTop, h: b.height / s }; }),
      fonts: { h3: parseFloat(getComputedStyle(document.querySelector('.dn-card h3')).fontSize), p: parseFloat(getComputedStyle(document.querySelector('.dn-card p')).fontSize), title: parseFloat(getComputedStyle(document.querySelector('.dn-titlebar h2')).fontSize), disc: parseFloat(getComputedStyle(document.querySelector('.dn-disc')).fontSize) } };
  });
  const c = LAYOUT.const, L = LAYOUT[g];
  if (g === 'A') {
    cmp('panel.x', m.panel.x, c.panel.x); cmp('panel.y', m.panel.y, c.panel.y); cmp('panel.w', m.panel.w, c.panel.w); cmp('panel.h', m.panel.h, c.panel.h);
    cmp('titlebar.x', m.title.x, c.titlebar.x); cmp('titlebar.y', m.title.y, c.titlebar.y); cmp('titlebar.w', m.title.w, c.titlebar.w); cmp('titlebar.h', m.title.h, c.titlebar.h);
    cmp('close-hit.w', m.x.w, c.close.hit); cmp('close-hit.cx', m.x.x + m.x.w / 2, c.close.cx); cmp('close-hit.cy', m.x.y + m.x.h / 2, c.close.cy);
    cmp('tabs.x', m.tabs.x, c.tabs.x); cmp('tabs.y', m.tabs.y, c.tabs.y); cmp('tabs.h', m.tabs.h, c.tabs.h);
    cmp('scroll.y', m.scroll.y, c.scroll.y); cmp('scroll.h', m.scroll.h, c.scroll.h);
    cmp('closeBtn.x', m.close.x, c.closeBtn.x); cmp('closeBtn.y', m.close.y, c.closeBtn.y); cmp('closeBtn.w', m.close.w, c.closeBtn.w); cmp('closeBtn.h', m.close.h, c.closeBtn.h);
    cmp('font 卡片标题 px', m.fonts.h3, c.card.headingFs, 0); cmp('font 正文 px', m.fonts.p, c.card.bodyFs, 0); cmp('font 标题 px', m.fonts.title, 52, 0); cmp('font 声明 px', m.fonts.disc, 28, 0);
  }
  cmp(`${g} 内容高(滚动高)`, m.contentH, L.contentHeight, 80); cmp(`${g} 最大滚动`, m.maxScroll, L.maxScroll, 80);
  L.cards.forEach((cd, i) => { cmp(`${g} 卡${i + 1} y`, m.cards[i].y, cd.y, 6); cmp(`${g} 卡${i + 1} 高`, m.cards[i].h, cd.h, 6); });
}
console.table(rows);
console.log(bad ? `${bad} 项超出容差` : '全部在容差内');
await b.close(); process.exit(0);
