// 第三轮新增行为的端到端:D-01 重置确认 / D-05 AUTO 次数 / D-06 调投注停 AUTO / 设计说明面板 / 截图
// node scripts/e2e-new.mjs [baseUrl]   需要 dev server(window.__slots)
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname; fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const mkPage = async (vp, mobile = false) => {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, ...(mobile ? { hasTouch: true, isMobile: true } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 200)); } });
  return page;
};
let page = await mkPage({ width: 540, height: 960 });
const open = async (qs) => { await page.goto(BASE + qs); await page.waitForSelector('html[data-ready="1"]', { timeout: 40000 }); await page.waitForTimeout(600); };
const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => window.__slots.snapshot());
const click = (tid) => page.click(`[data-testid="${tid}"]`, { force: true });
const text = (tid) => page.textContent(`[data-testid="${tid}"]`);
const snap = async (name, p = page) => { await p.screenshot({ path: OUT + name }); console.log('shot', name); };
const waitIdle = async (ms = 90000) => page.waitForFunction(() => { const s = window.__slots.snapshot(); return !s.busy && s.ui === 'Idle'; }, null, { timeout: ms });
const autoEvents = () => S(() => window.__slots.events.filter(e => e.n === 'ui:autoplay').map(e => e.p));
const rounds = () => S(() => window.__slots.events.filter(e => e.n === 'round:start').length);
const clr = () => S(() => { window.__slots.events.length = 0; });

// ── D-05:选 10 → 最多 10 局,remaining 递减,最后回到关闭 ──
await open('?game=A&seed=autoA&reset=1');
check('auto: idle shows no count', (await page.getAttribute('[data-testid="auto-count"]', 'data-remaining')) === '');
await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await page.waitForTimeout(300);
await snap('D05-auto-menu.png');
check('auto menu has 5 choices (10/25/50/100/feature)', (await page.$$eval('[data-testid="auto-menu"] [data-testid^="auto-"]:not([data-testid="auto-cancel"]):not([data-testid="auto-menu"])', els => els.map(e => e.dataset.testid).join(','))) === 'auto-10,auto-25,auto-50,auto-100,auto-feature');
check('auto: nothing started before choosing', (await rounds()) === 0);
await click('auto-cancel'); await page.waitForTimeout(200);
check('auto menu cancel → no AUTO', !(await state()).autoOn && (await rounds()) === 0);
await S(() => { window.__slots.wallet.set(1e7); window.__slots.shell.refresh(); });
await click('turbo'); // 加速,缩短测试时间
await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await click('auto-10');
await page.waitForFunction(() => window.__slots.snapshot().autoOn, null, { timeout: 5000 });
await page.waitForTimeout(1500);
{
  const st = await state(); const cnt = await page.getAttribute('[data-testid="auto-count"]', 'data-remaining');
  check('auto in progress shows remaining count', st.autoOn && /^\d+$/.test(cnt) && +cnt <= 10, `remaining=${cnt}`);
  await snap('D05-auto-running-remaining.png');
}
await page.waitForFunction(() => !window.__slots.snapshot().autoOn && !window.__slots.snapshot().busy, null, { timeout: 240000 });
{
  const ev = await autoEvents(); const n = await rounds();
  const rem = ev.filter(e => e.on).map(e => e.remaining);
  check('auto 10: at most 10 rounds (no feature) / stops on feature', n <= 10 && n >= 1, `rounds=${n}`);
  check('auto 10: remaining strictly decreasing from 10', rem[0] === 10 && rem.every((v, i) => i === 0 || v < rem[i - 1]), JSON.stringify(rem));
  check('auto 10: ends with on=false', ev.at(-1)?.on === false);
}
// ── D-05:再点关闭(手动停) ──
await open('?game=A&seed=autoA2&reset=1'); await clr();
await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await click('auto-100');
await page.waitForFunction(() => window.__slots.snapshot().autoOn, null, { timeout: 5000 });
await click('auto'); await page.waitForTimeout(300);
check('auto: tap again → stops (on=false)', !(await state()).autoOn);
await waitIdle(120000);
{ const n = await rounds(); check('auto manual stop: only the in-flight round finished', n === 1, `rounds=${n}`); }
// ── D-06:AUTO 中两局间调整投注 → 停止 ──
for (const [tid, name] of [['bet-plus', '+'], ['bet-minus', '-'], ['bet-max', 'MAX']]) {
  await open('?game=A&seed=autoB&reset=1'); await clr();
  if (tid === 'bet-minus') { await click('bet-plus'); await page.waitForTimeout(150); }
  await S(() => { window.__slots.wallet.set(1e7); window.__slots.shell.refresh(); }); await click('turbo');
  await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await click('auto-100');
  await page.waitForFunction(() => window.__slots.snapshot().autoOn, null, { timeout: 5000 });
  // 在页面内:检测到两局之间(AUTO 仍开、空闲)的瞬间同步点击(避免 Playwright 往返延迟错过 500ms 间隙)
  const r = await page.evaluate(tid => new Promise(res => {
    const t0 = performance.now();
    const tick = () => {
      const sn = window.__slots.snapshot();
      if (sn.autoOn && !sn.busy && sn.ui === 'Idle') {
        const before = { bet: sn.bet, rounds: window.__slots.events.filter(e => e.n === 'round:start').length };
        document.querySelector(`[data-testid="${tid}"]`).click();
        const a = window.__slots.snapshot();
        res({ clicked: true, before, autoOnAfter: a.autoOn, betAfter: a.bet });
      } else if (performance.now() - t0 > 60000) res({ clicked: false });
      else setTimeout(tick, 10);
    };
    tick();
  }), tid);
  await page.waitForTimeout(900); // 若 AUTO 没停,这段时间内会开新一局
  const st = await state(); const nRounds = await rounds();
  check(`D-06 bet ${name} between rounds: clicked in the gap`, r.clicked);
  check(`D-06 bet ${name} between rounds stops AUTO immediately`, r.clicked && r.autoOnAfter === false && !st.autoOn, JSON.stringify(r));
  check(`D-06 bet ${name}: no new round started after stop`, nRounds === r.before.rounds, `rounds ${r.before.rounds}→${nRounds}`);
  check(`D-06 bet ${name}: bet actually changed`, st.bet !== r.before.bet, `${r.before.bet}→${st.bet}`);
  await waitIdle(120000);
}
// ── D-05:直到特色:A 的 seed au29 在第 6 局触发 FS,AUTO 遇 FS 即停 ──
await open('?game=A&seed=au29&reset=1'); await clr();
await S(() => { window.__slots.wallet.set(1e7); window.__slots.shell.refresh(); });
await click('turbo');
await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await click('auto-feature');
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'feature:enter'), null, { timeout: 240000 });
await page.waitForFunction(() => !window.__slots.snapshot().autoOn, null, { timeout: 30000 }).catch(() => {});
check('until-feature: AUTO stops when FS triggers', !(await state()).autoOn);
{ const ev = await autoEvents(); check('until-feature: autoplay events remaining=null then off', ev[0].on && ev[0].remaining === null && ev.at(-1).on === false, JSON.stringify(ev)); }
await waitIdle(240000);
{ const n = await rounds(); check('until-feature: exactly one round after FS (no further AUTO round)', n === 6, `rounds=${n}`); }
// B:H&S
await open('?game=B&seed=bu39&reset=1'); await clr();
await S(() => { window.__slots.wallet.set(1e7); window.__slots.shell.refresh(); });
await click('turbo');
await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await click('auto-feature');
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'feature:enter'), null, { timeout: 240000 });
await page.waitForFunction(() => !window.__slots.snapshot().autoOn, null, { timeout: 30000 }).catch(() => {});
check('until-feature: AUTO stops when H&S triggers (B)', !(await state()).autoOn);
await waitIdle(240000);
// ── 余额不足 → 停止 ──
await open('?game=A&seed=autoC&reset=1'); await clr();
await S(() => { window.__slots.wallet.set(250); window.__slots.shell.refresh(); });
await click('auto'); await page.waitForSelector('[data-testid="auto-menu"]'); await click('auto-100');
await page.waitForFunction(() => !window.__slots.snapshot().autoOn && !window.__slots.snapshot().busy, null, { timeout: 120000 });
{ const st = await state(); check('auto stops when balance insufficient', !st.autoOn && st.balance < st.bet, `bal=${st.balance} bet=${st.bet}`); }

// ── 设计说明面板(按 UI 稿) ──
const dpOpen = async (via) => { await click(via === 'menu' ? 'menu' : 'dn-open'); if (via === 'menu') { await page.waitForSelector('[data-testid="menu-popup"]'); await click('menu-design'); } await page.waitForSelector('[data-testid="design-popup"]:not([hidden])'); await page.waitForTimeout(500); };
const dpClose = async () => { await click('dn-close'); await page.waitForTimeout(300); };
await open('?game=A&seed=dp&reset=1');
check('design: entry button at (800,97) 210×76 visual, hotspot +10px', await S(() => { const st = document.getElementById('stage').getBoundingClientRect(); const s = st.width / 1080; const b = document.getElementById('dn-open').getBoundingClientRect(); const i = document.querySelector('#dn-open img').getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) < 1.5; return near((i.x - st.x) / s, 800) && near((i.y - st.y) / s, 97) && near(i.width / s, 210) && near(i.height / s, 76) && near(b.width / s, 230) && near(b.height / s, 96); }));
await dpOpen('menu');
check('design A: role=dialog, 5 items, title', (await page.getAttribute('[data-testid="design-popup"]', 'role')) === 'dialog' && (await page.$$('[data-testid="dp-item"]')).length === 5 && (await text('dp-game')) === '糖果锦鲤池');
check('design A: contains "没有连消"', (await text('design-popup')).includes('没有连消'));
check('design A: scrollable & digits highlighted', await S(() => { const s = document.getElementById('dn-body'); return s.scrollHeight > s.clientHeight && document.querySelectorAll('.dn-card strong').length > 10; }));
await snap('design-panel-A-1080w.png');
await S(() => { const s = document.getElementById('dn-body'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(300);
await snap('design-panel-A-1080w-scrolled.png');
await S(() => { document.getElementById('dn-body').scrollTop = 0; });
await click('dn-tab-B'); await page.waitForTimeout(400);
check('design B (tab in panel): content switched, 5 items, "不是累进奖池"', (await page.$$('[data-testid="dp-item"]')).length === 5 && (await text('dp-game')) === '金鲤满仓' && (await text('design-popup')).includes('不是累进奖池'));
await snap('design-panel-B-1080w.png');
await S(() => { const s = document.getElementById('dn-body'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(300);
await snap('design-panel-B-1080w-scrolled.png');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
check('design: Esc closes, focus returns to entry', await S(() => document.getElementById('dn-panel').hidden && document.activeElement === document.getElementById('dn-open')));
// 打开期间不阻塞游戏:局中打开面板,局照常结束
await click('spin'); await page.waitForTimeout(300);
await dpOpen('entry');
check('design opens mid-round (entry button)', !!(await page.$('[data-testid="design-popup"]:not([hidden])')));
check('design: SPIN not clickable behind mask', await S(() => { const b = document.querySelector('[data-testid="spin"]').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!e && e.closest('.dn-mask, .dn-panel') !== null; }));
await waitIdle(120000);
check('design open during round: round completed (not stuck)', (await state()).ui === 'Idle' && !(await state()).busy);
await dpClose();
// 特色玩法不被打断:force=fs 打开面板,FS 流程照常走完
await open('?game=A&seed=au29&force=fs&reset=1'); await page.waitForTimeout(500);
await dpOpen('entry'); await page.waitForTimeout(3000);
const mid = await S(() => window.__slots.events.map(e => e.n));
check('design during FS: feature events still flowing', mid.length > 0 && mid.includes('feature:enter'));
await dpClose();
await waitIdle(240000);
check('design during FS: FS finishes normally', (await state()).states.A.round === null);

// ── logo A/B(D-03) ──
for (const [g, key] of [['A', 'logo-A'], ['B', 'logo-B']]) {
  await open(`?game=${g}&seed=lg&reset=1`); await page.waitForTimeout(500);
  const got = await S(() => window.__slots.shell.d.stage.logoTextureKey);
  check(`logo shows ${key} on game ${g}`, got === key, got);
  await snap(`D03-logo-${g}.png`);
}
await open('?game=A&seed=lg&reset=1'); await click('tab-B'); await page.waitForTimeout(1500);
check('logo switches to logo-B when tab B', (await S(() => window.__slots.shell.d.stage.logoTextureKey)) === 'logo-B');
await click('tab-A'); await page.waitForTimeout(1500);
check('logo switches back to logo-A when tab A', (await S(() => window.__slots.shell.d.stage.logoTextureKey)) === 'logo-A');

// ── 截图:设计说明 A/B × (360×640, 1080 宽) ;免责声明 360×640 ──
for (const [vp, tag] of [[{ width: 360, height: 640 }, '360x640'], [{ width: 1080, height: 1920 }, '1080w']]) {
  await page.context().close();
  page = await mkPage(vp, tag === '360x640');
  for (const g of ['A', 'B']) {
    await open(`?game=${g}&seed=dp&reset=1`);
    if (g === 'A' && tag === '360x640') await snap('D02-360x640-disclaimer.png');
    await dpOpen('entry');
    await snap(`design-panel-${g}-${tag}.png`);
    await S(() => { const s = document.getElementById('dn-body'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(300);
    await snap(`design-panel-${g}-${tag}-scrolled.png`);
    await dpClose();
  }
}
console.log('\nerrors:', errors.length ? errors : 'none');
check('no page errors', errors.length === 0);
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
