// 端到端验证 + 截图:node scripts/e2e.mjs [baseUrl]
// 需要 dev server(或 preview 配合 VITE_ENABLE_DEBUG=1 构建)提供 window.__slots。
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

const ONLY = process.env.ONLY ?? '';
const run = (n) => !ONLY || ONLY.split(',').includes(String(n));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('[console.error]', m.text().slice(0, 300)); } });

const open = async (qs) => {
  await page.goto(BASE + qs);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 40000 });
  await page.waitForTimeout(600);
};
const snap = async (name) => { await page.screenshot({ path: OUT + name }); console.log('shot', OUT + name); };
const S = (fn, arg) => page.evaluate(fn, arg);
const state = () => S(() => window.__slots.snapshot());
const click = (tid) => page.click(`[data-testid="${tid}"]`, { force: true });
const text = (tid) => page.textContent(`[data-testid="${tid}"]`);
const waitIdle = async (ms = 90000) => {
  await page.waitForFunction(() => { const s = window.__slots.snapshot(); return !s.busy && s.ui === 'Idle'; }, null, { timeout: ms });
};
const eventsOf = () => S(() => window.__slots.events.map(e => e.n));
const clearEvents = () => S(() => { window.__slots.events.length = 0; });

// ─── 1. 玩法 A 空闲 ───
await open('?game=A&seed=shot1&reset=1');
await snap('01-A-idle.png');
{
  // 格心 = reel-bg 左上(37,490) + (95+204c, 95+215r),再下移 2px;符号 sprite 缩放 165/256
  const geo = await S(() => {
    const reels = window.__slots.shell.d.stage.reels; const out = [];
    for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) {
      const v = reels.cell(c, r); const g = v.sprite.getGlobalPosition();
      out.push({ c, r, x: g.x, y: g.y, sx: v.sprite.worldTransform.a });
    }
    return out;
  });
  const bad = geo.filter(p => Math.abs(p.x - (37 + 95 + 204 * p.c)) > 0.6 || Math.abs(p.y - (490 + 95 + 215 * p.r + 2)) > 0.6 || Math.abs(p.sx - 165 / 256) > 0.001);
  check('reel cell centers match README formula (95+204c, 95+215r)+2px, scale 165/256', bad.length === 0, JSON.stringify(bad.slice(0, 2)));
}
check('A idle: balance 10,000', (await text('balance')) === '10,000');
check('A idle: buy price = 48× bet(100) = 4,800 (read from config)', (await S(() => window.__slots.shell.ctrl.buyCost(100))) === 4800 && (await page.textContent('#buy')).includes('4,800'));
check('A disclaimer from config', (await text('disclaimer')).includes('购买功能仅为演示'));

// ─── 2. A: 转动中截图 + 中奖高亮 ───
// 找一个有线赢的 seed:逐个 seed 试(用引擎预演,不影响页面)
const winSeed = await S(async () => {
  const { engine } = window.__slots.shell.module.evaluator;
  for (let i = 0; i < 400; i++) {
    const st = engine.createState('w' + i);
    const r = engine.step(st, { type: 'start', game: 'A', bet: 100, mode: 'normal' });
    if (r.step.kind === 'A_base_spin' && r.step.lineWins.length >= 2 && !r.step.trigger) return 'w' + i;
  }
  return null;
});
console.log('winSeed', winSeed);
await open(`?game=A&seed=${winSeed}&reset=1`);
await clearEvents();
await click('spin');
await page.waitForTimeout(420);
await snap('02-A-spinning.png');
check('A spin: UI state is Spinning or Presenting', ['Spinning', 'Presenting'].includes((await state()).ui));
check('A spin: SPIN button shows stop state', (await page.getAttribute('[data-testid="spin"]', 'data-state')).startsWith('stop'));
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'win:present'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await snap('03-A-win-highlight.png');
await waitIdle();
{
  const ev = await eventsOf();
  const i = (n) => ev.indexOf(n);
  check('A events order: round:start < spin:begin < reel:stop < spin:end < step:begin... (base spin)', i('round:start') < i('spin:begin') && i('spin:begin') < i('reel:stop') && i('reel:stop') < i('spin:end'));
  check('A reel:stop x5 in order', ev.filter(n => n === 'reel:stop').length === 5);
  check('A round:end emitted', ev.includes('round:end'));
  const s = await state();
  check('A balance after win persisted', s.balance === (await S(() => Number(localStorage.getItem('slots:v2:balance')))));
}

// ─── 3. 切到 B,B 空闲;状态独立 ───
const aBefore = await S(() => JSON.stringify(window.__slots.controllers.A.state));
const balBefore = (await state()).balance;
await click('tab-B');
await page.waitForTimeout(900);
check('switch to B: game=B', (await state()).game === 'B');
const bBet = (await state()).bet;
check(`B buy price = 85× bet(${bBet})`, (await S(() => window.__slots.shell.ctrl.buyCost(window.__slots.shell.bet))) === 85 * bBet && (await page.textContent('#buy')).includes((85 * bBet).toLocaleString('en-US')));
check('B state independent of A (A state untouched)', (await S(() => JSON.stringify(window.__slots.controllers.A.state))) === aBefore);
check('wallet shared across tabs', (await state()).balance === balBefore);
await snap('04-B-idle.png');

// ─── 4. B 买特色 → 确认弹窗(截图),取消 ───
await click('buy');
await page.waitForSelector('[data-testid="buy-confirm"]');
await page.waitForTimeout(400);
await snap('05-B-buy-confirm.png');
check('B buy popup price text reads priceMult(85)×bet', (await page.getAttribute('[data-testid="buy-price"]', 'data-mult')) === '85' && (await page.getAttribute('[data-testid="buy-price"]', 'data-cost')) === String(85 * bBet));
check('B buy popup disclaimer from config', (await text('buy-disclaimer')).includes('购买功能仅为演示'));
await click('buy-cancel');
check('cancel: no round started, balance unchanged', (await state()).balance === balBefore && !(await S(() => window.__slots.controllers.B.inRound)));
// A 的 buy 弹窗也截一张
await click('tab-A'); await page.waitForTimeout(700);
await click('buy'); await page.waitForSelector('[data-testid="buy-confirm"]'); await page.waitForTimeout(300);
check('A buy popup price = 48×', (await page.getAttribute('[data-testid="buy-price"]', 'data-mult')) === '48' && (await page.getAttribute('[data-testid="buy-price"]', 'data-cost')) === '4800');
await snap('06-A-buy-confirm.png');
await click('buy-cancel');

// ─── 5. force=hs ───
await open('?force=hs&seed=hsdemo&reset=1');
check('force=hs: game B and in round', (await state()).game === 'B' && (await S(() => window.__slots.controllers.B.inRound)));
check('force=hs: tab switching blocked mid-round', await (async () => { await click('tab-A'); await page.waitForTimeout(300); return (await state()).game === 'B'; })());
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'coin:lock'), null, { timeout: 20000 });
await page.waitForTimeout(3600);
await snap('07-B-hold-and-spin.png');
// 刷新:局中恢复(此时 H&S 进行中)
const midBefore = await S(() => { const r = window.__slots.controllers.B.state.round; return r ? { next: r.next, id: r.roundId, K: r.hs.locked.length, seq: window.__slots.controllers.B.state.roundSeq } : null; });
console.log('mid-round before reload', midBefore);
const balMid = (await state()).balance;
await page.reload();
await page.waitForSelector('html[data-ready="1"]', { timeout: 40000 });
await page.waitForTimeout(400);
const afterReload = await state();
check('reload mid-round: resumed in game B', afterReload.game === 'B');
check('reload mid-round: balance not double-charged', afterReload.balance === balMid || afterReload.balance >= balMid /* 局内续玩可能已入账 */);
await waitIdle(120000);
{
  const ev = await eventsOf();
  check('after reload round continues & ends (round:end)', ev.includes('round:end'));
  const st = await state();
  check('round finished: B engine idle', st.states.B.round === null);
}
await snap('08-B-after-hs.png');

// ─── 6. force=fs ───
await open('?force=fs&seed=fsdemo&reset=1');
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'feature:enter'), null, { timeout: 20000 });
await page.waitForSelector('[data-testid="banner"]', { timeout: 10000 });
await page.waitForTimeout(700);
await snap('09-A-fs-banner.png');
check('FS banner shows Candy Gate wording, no legacy names', !/牌坊|龙门/.test(await page.textContent('#ui')));
await page.waitForFunction(() => window.__slots.events.filter(e => e.n === 'spin:begin').length >= 2, null, { timeout: 40000 });
await page.waitForTimeout(2500);
await snap('10-A-fs-spin.png');
check('force=fs: Stage background is fs', (await S(() => window.__slots.shell.d.stage.background)) === 'fs');
await waitIdle(180000);


// ─── 7. 局中禁止切 tab(A 免费旋转进行中点 B) ───
await open('?force=fs&seed=fsdemo2&reset=1');
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'spin:begin'), null, { timeout: 40000 });
await click('tab-B'); await page.waitForTimeout(400);
check('mid-FS: tab B click blocked, still game A', (await state()).game === 'A');
check('mid-FS: toast explains', (await page.textContent('#toast-layer')).includes('局中不能切换'));
check('mid-FS: tab visually locked', (await page.getAttribute('[data-testid="tab-B"]', 'class')).includes('locked'));
// 刷新(A 局中)→ 从存档继续;另一个玩法是独立的
const aMid = await S(() => { const r = window.__slots.controllers.A.state.round; return r && { rem: r.fs.remaining, cum: r.cumulativeWin, next: r.next }; });
const bState = await S(() => JSON.stringify(window.__slots.controllers.B.state));
await page.reload(); await page.waitForSelector('html[data-ready="1"]', { timeout: 40000 });
check('reload mid-FS: resumes in A (pending round game auto-selected)', (await state()).game === 'A' && (await S(() => window.__slots.controllers.A.inRound || window.__slots.events.length > 0)));
check('reload: B state unchanged by A reload', (await S(() => JSON.stringify(window.__slots.controllers.B.state))) === bState);
await waitIdle(180000);
check('FS round completes after reload; A idle', (await state()).states.A.round === null);
console.log('A mid-round snapshot before reload', JSON.stringify(aMid));

// ─── 8. 余额不足 + 重置菜单 ───
await open('?game=A&seed=poor&reset=1');
await S(() => { window.__slots.wallet.set(15); window.__slots.shell.refresh(); });
await page.waitForTimeout(300);
check('poor: SPIN disabled', (await page.getAttribute('[data-testid="spin"]', 'data-state')).endsWith(':disabled'));
check('poor: hint says reset demo coins', (await text('hint')).includes('重置演示币'));
check('poor: buy disabled', await page.isDisabled('#buy'));
await snap('11-A-broke-hint.png');
await click('menu'); await page.waitForSelector('[data-testid="menu-popup"]');
await snap('12-menu.png');
check('menu: reset enabled when idle', !(await page.isDisabled('[data-testid="menu-reset"]')));
// D-01:点重置先出确认框;取消不重置并回菜单;确认才重置并关菜单
await click('menu-reset'); await page.waitForSelector('[data-testid="reset-confirm"]'); await page.waitForTimeout(300);
await snap('D01-reset-confirm.png');
check('reset: confirm dialog shown, balance untouched', (await S(() => window.__slots.wallet.balance)) === 15);
await click('reset-cancel'); await page.waitForSelector('[data-testid="menu-popup"]'); await page.waitForTimeout(200);
check('reset cancel → back to menu, balance still 15', (await S(() => window.__slots.wallet.balance)) === 15 && !!(await page.$('[data-testid="menu-popup"]')));
await click('menu-reset'); await page.waitForSelector('[data-testid="reset-confirm"]');
await click('reset-ok'); await page.waitForTimeout(300);
check('reset confirm closes menu', !(await page.$('[data-testid="menu-popup"]')) && !(await page.$('[data-testid="reset-confirm"]')));
check('reset → balance 10,000 (persisted)', (await text('balance')) === '10,000' && (await S(() => localStorage.getItem('slots:v2:balance'))) === '10000');
check('after reset SPIN enabled', !(await page.getAttribute('[data-testid="spin"]', 'data-state')).endsWith(':disabled'));
// 局中菜单里 reset 不可用
await click('spin'); await page.waitForTimeout(300);
await click('menu'); await page.waitForSelector('[data-testid="menu-popup"]');
check('menu mid-round: reset disabled', await page.isDisabled('[data-testid="menu-reset"]'));
check('resetBalance() refuses mid-round', (await S(() => window.__slots.shell.resetBalance())) === false);
await click('popup-close');
await waitIdle();

// ─── 9. 赔付表占位弹窗 + 大赢占位演出 ───
await click('info'); await page.waitForSelector('[data-testid="info-popup"]'); await page.waitForTimeout(300);
await snap('13-A-info-placeholder.png');
check('info popup: no legacy names', !/牌坊|龙门/.test(await page.textContent('[data-testid="info-popup"]')));
await click('popup-close');
await S(() => { window.__slots.__bw = window.__slots.shell.playShowcase('default-big', 'big', { roundId: '1', game: 'A', mode: 'normal', bet: 100, cost: 100, totalWin: 4200, capped: false, baseWin: 0, featureWin: 4200, steps: 3, featureTriggered: true }); });
await page.waitForTimeout(1500);
await snap('14-bigwin-placeholder.png');
check('bigwin overlay visible during showcase', await page.evaluate(() => document.getElementById('showcase').classList.contains('on')));
await page.mouse.click(270, 400); // 点击跳过
await page.waitForTimeout(500);
check('bigwin skip closes overlay', await page.evaluate(() => !document.getElementById('showcase').classList.contains('on')));

// ─── 10. B 购买 → 完整 H&S → 结算飞币(截图) ───
await open('?game=B&seed=bbuy&reset=1');
await click('buy'); await page.waitForSelector('[data-testid="buy-confirm"]');
const balPre = (await state()).balance;
const bBetNow = (await state()).bet;
await click('buy-ok');
await page.waitForFunction(() => window.__slots.events.some(e => e.n === 'coin:fly'), null, { timeout: 60000 });
await page.waitForTimeout(250);
await snap('15-B-settle-fly.png');
await waitIdle(180000);
{
  const ev = await S(() => window.__slots.events.map(e => e.n));
  const k = (n) => ev.indexOf(n);
  check('B buy event order: round:start < feature:enter < coin:lock < coin:fly < feature:exit < round:end', k('round:start') < k('feature:enter') && k('feature:enter') < k('coin:lock') && k('coin:lock') < k('coin:fly') && k('coin:fly') < k('feature:exit') && k('feature:exit') < k('round:end'));
  const hist = await S(() => window.__slots.shell.fsm.history.join(' > '));
  console.log('fsm history:', hist.slice(0, 400));
  check('fsm never returned to Idle mid-feature', !/Idle/.test(hist.split('Settling')[0].replace(/^Idle/, '')));
  const st = await state();
  const chg = await S(() => window.__slots.events.filter(e => e.n === 'balance:change' && e.p.reason === 'charge').map(e => e.p.delta));
  check(`B buy charged exactly 85×bet (${85 * bBetNow}) once`, chg.length === 1 && chg[0] === -85 * bBetNow, JSON.stringify(chg));
}

console.log('\nerrors:', errors.length ? errors : 'none');
check('no page errors', errors.length === 0);
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
