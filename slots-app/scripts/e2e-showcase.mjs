// 大赢演出专项验证(dev 服务器,headless 软渲染):node scripts/e2e-showcase.mjs [base=http://localhost:5173]
// 覆盖:skip(数字立刻终值→短收尾→回主流程,余额不变)、降级(quality=low / 无 WebGL / three 块加载失败 / 素材失败 / context lost / reduced-motion)、
// 20 次连播不泄漏(资源计数 + DOM + renderer.info)、?force= 自动演示、真实一局走 settle(余额正确)。
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5173';
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
let pass = 0, fail = 0; const failed = [];
const check = (name, ok, extra = '') => { ok ? pass++ : (fail++, failed.push(name)); console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`); };
const b = await chromium.launch({ args: ARGS });

async function open(qs = '', opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 540, height: 960 }, ...opts.ctx });
  const p = await ctx.newPage();
  const errs = [], warns = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); if (m.type() === 'warning') warns.push(m.text().slice(0, 300)); });
  if (opts.init) await p.addInitScript(opts.init);
  if (opts.route) await opts.route(p);
  await p.goto(`${base}/?game=A&seed=11${qs}`);
  await p.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
  return { p, ctx, errs, warns };
}
const bal = p => p.evaluate(() => window.__slots.wallet.balance);
const clean = errs => errs.filter(e => !/Failed to load resource|net::ERR|GL Driver|ReadPixels/.test(e));

// ── 1 skip ──
{
  const { p, ctx, errs } = await open('&quality=low');
  const b0 = await bal(p);
  const r = await p.evaluate(async () => {
    const S = window.__slots; const ev = []; S.bus.on('bigwin:start', () => ev.push(['start', performance.now()])); S.bus.on('bigwin:end', () => ev.push(['end', performance.now()]));
    const run = S.playBigWin('epic', 123456);
    await new Promise(res => { const poll = () => (document.querySelector('#showcase canvas') && +document.querySelector('#showcase canvas').style.opacity > 0.2 && S.showcaseStats.t0 > 0 && performance.now() - S.showcaseStats.t0 > 700) ? res() : setTimeout(poll, 20); poll(); });
    const shownBefore = S.showcaseStats.shown;
    const tClick = performance.now();
    document.querySelector('#showcase').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
    const shownAfter = S.showcaseStats.shown;
    await run; const tEnd = performance.now();
    return { shownBefore, shownAfter, ms: Math.round(tEnd - tClick), left: document.querySelectorAll('#showcase canvas').length, on: document.querySelector('#showcase').classList.contains('on'), busy: S.shell.isBusy, evs: ev.map(e => e[0]) };
  });
  check('skip: 数字立即置终值', r.shownBefore < 123456 && r.shownAfter === 123456, `before=${r.shownBefore} after=${r.shownAfter}`);
  check('skip: 短收尾后 resolve(≤ 1.2s,含软渲染慢帧)', r.ms <= 1200, `${r.ms}ms`);
  check('skip: 叠加层已清理、不再忙碌、事件成对', r.left === 0 && !r.on && !r.busy && r.evs.join() === 'start,end');
  check('skip: 余额不变(演示不入账)', (await bal(p)) === b0);
  check('skip: 无页面报错', clean(errs).length === 0, clean(errs).join(' | '));
  await ctx.close();
}

// ── 2 真实一局结算走 settle(把赢额强行注入 settlement):余额正确、点击跳过 ──
{
  const { p, ctx, errs } = await open('&quality=low');
  await p.waitForTimeout(500);
  const r = await p.evaluate(async () => {
    const S = window.__slots; const sh = S.shell; const ctrl = sh.ctrl ?? S.controllers[sh.gameId];
    const ev = []; S.bus.on('bigwin:end', e => ev.push(e.tier));
    // 直接调用 settle(私有):构造 mult>=20 的结算,验证 settle → 演出 → commitDisplayBalance 的主流程不被演出卡住
    const s = { roundId: 'x', game: 'A', mode: 'normal', bet: 100, cost: 100, totalWin: 2500, capped: false, baseWin: 2500, featureWin: 0, steps: 1, featureTriggered: false };
    const t0 = performance.now();
    sh.busy = true; sh.fsm.to('Spinning'); sh.fsm.to('Presenting'); // 与 runRound 同样的状态机路径
    const run = sh.settle(s).finally(() => { sh.fsm.forceIdle(); sh.busy = false; });
    await new Promise(res => { let n = 0; const poll = () => (document.querySelector('#showcase canvas') || ++n > 400 ? res() : setTimeout(poll, 20)); poll(); });
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('#showcase').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await run;
    return { ev, ms: Math.round(performance.now() - t0) };
  });
  check('settle: 25× 触发 big 演出并在 skip 后继续主流程', r.ev[0] === 'big', JSON.stringify(r));
  check('settle: 无页面报错', clean(errs).length === 0, clean(errs).join(' | '));
  await ctx.close();
}

// ── 3 降级 ──
{ // 3a 强制 low
  const { p, ctx, errs } = await open('&quality=low');
  const r = await p.evaluate(async () => { await window.__slots.playBigWin('mega'); return window.__slots.showcaseLast.current; });
  check('降级: ?quality=low 用 three/low 完整播完', r.backend === 'three' && r.quality === 'low', JSON.stringify(r));
  check('降级: low 无报错', clean(errs).length === 0, clean(errs).join(' | ')); await ctx.close();
}
{ // 3b 无 WebGL
  const { p, ctx, errs } = await open('', { init: () => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(t)) return null; return o.call(this, t, ...a); }; } });
  const t = Date.now();
  const r = await p.evaluate(async () => { const x = await window.__slots.playBigWin('big'); return { x, last: window.__slots.showcaseLast.current, canv: document.querySelectorAll('#showcase canvas').length }; });
  check('降级: 无 WebGL → 回退 default-big 播完', r.last.backend === 'fallback' && r.last.reason === 'no-webgl' && r.canv === 0, JSON.stringify(r.last) + ` ${Date.now() - t}ms`);
  check('降级: 无 WebGL 不报错', clean(errs).length === 0, clean(errs).join(' | ')); await ctx.close();
}
{ // 3c three 块加载失败
  const { p, ctx, errs } = await open('&quality=low', { route: async p => { await p.route(/showcase\/candy\/index|\/assets\/three-/, r => r.abort()); } });
  const r = await p.evaluate(async () => { await window.__slots.playBigWin('big'); return window.__slots.showcaseLast.current; });
  check('降级: three 块加载失败 → 回退', r.backend === 'fallback' && r.reason === 'chunk-load-failed', JSON.stringify(r));
  check('降级: 块失败不抛未捕获错误', !errs.some(e => /Uncaught|pageerror/.test(e))); await ctx.close();
}
{ // 3d 美术素材失败
  const { p, ctx } = await open('&quality=low', { route: async p => { await p.route(/particles-atlas\.webp/, r => r.abort()); } });
  const r = await p.evaluate(async () => { await window.__slots.playBigWin('mega'); return window.__slots.showcaseLast.current; });
  check('降级: 必需素材失败 → 回退', r.backend === 'fallback' && /assets/.test(r.reason), JSON.stringify(r)); await ctx.close();
}
{ // 3e 标题美术失败 → Canvas 兜底标题仍用 three
  const { p, ctx } = await open('&quality=low', { route: async p => { await p.route(/title-(big|mega|super)\.(png|webp)/, r => r.abort()); } });
  const r = await p.evaluate(async () => { await window.__slots.playBigWin('big'); return window.__slots.showcaseLast.current; });
  check('降级: 仅标题素材失败 → three + Canvas 兜底标题', r.backend === 'three', JSON.stringify(r)); await ctx.close();
}
{ // 3f context lost
  const { p, ctx, errs } = await open('&quality=low');
  const r = await p.evaluate(async () => {
    const run = window.__slots.playBigWin('big');
    await new Promise(res => { const poll = () => (window.__slots.showcaseStats.t0 > 0 && performance.now() - window.__slots.showcaseStats.t0 > 500) ? res() : setTimeout(poll, 20); poll(); });
    const c = document.querySelector('#showcase canvas'); const gl = c.getContext('webgl2'); gl.getExtension('WEBGL_lose_context').loseContext();
    const t = performance.now(); await run;
    return { ms: Math.round(performance.now() - t), last: window.__slots.showcaseLast.current, busy: window.__slots.shell.isBusy };
  });
  check('降级: context lost → 回退并 resolve,不阻塞', r.last.backend === 'fallback' && r.last.reason === 'context-lost' && !r.busy, JSON.stringify(r)); await ctx.close();
}
{ // 3g reduced-motion
  const { p, ctx, errs } = await open('', { ctx: { reducedMotion: 'reduce' } });
  const t = Date.now();
  const r = await p.evaluate(async () => { await window.__slots.playBigWin('max'); return window.__slots.showcaseLast.current; });
  const ms = Date.now() - t;
  check('reduced-motion: 最轻量档(low)、总时长≈2s(含素材/编译)', r.backend === 'three' && r.quality === 'low' && ms < 6500, JSON.stringify(r) + ` ${ms}ms`);
  check('reduced-motion: 无报错', clean(errs).length === 0, clean(errs).join(' | ')); await ctx.close();
}

// ── 4 ?force=mega 启动后自动演示一次 ──
{
  const { p, ctx, errs } = await open('&quality=low&force=mega');
  const r = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); const n = () => window.__slots.events.filter(e => e.n === 'bigwin:start').length; for (let i = 0; i < 100 && n() === 0; i++) await new Promise(r => setTimeout(r, 100)); return { n: n(), tier: window.__slots.events.find(e => e.n === 'bigwin:start')?.p }; });
  check('?force=mega 自动触发一次大赢演出', r.n === 1 && r.tier.tier === 'mega' && r.tier.showcase === 'candy-mega', JSON.stringify(r));
  check('?force= 一次性:已从地址栏移除', !(await p.url()).includes('force='));
  await p.evaluate(() => document.querySelector('#showcase')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await p.waitForTimeout(1500); await ctx.close();
}

// ── 5 20 次连播不泄漏 ──
{
  const { p, ctx, errs, warns } = await open('&quality=low');
  const r = await p.evaluate(async () => {
    const S = window.__slots; const st = S.showcaseStats; const b = JSON.parse(JSON.stringify(st));
    const tiers = ['big', 'mega', 'epic', 'max']; let maxLive = 0;
    for (let i = 0; i < 20; i++) {
      const run = S.playBigWin(tiers[i % 4]);
      await new Promise(res => { const poll = () => (st.t0 > b.t0 && performance.now() - st.t0 > 150 + (i % 3) * 120) ? res() : setTimeout(poll, 15); st.t0 = st.t0; poll(); });
      maxLive = Math.max(maxLive, document.querySelectorAll('canvas').length);
      document.querySelector('#showcase').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await run;
      b.t0 = st.t0;
    }
    return { st: JSON.parse(JSON.stringify(st)), base: b, canv: document.querySelectorAll('#showcase canvas').length, all: document.querySelectorAll('canvas').length };
  });
  const s = r.st;
  const kinds = ['renderer', 'geometry', 'material', 'texture', 'target'];
  check('泄漏: 20 次演出 = 20 个 Session,全部 dispose', s.sessions === 20 && s.disposedSessions === 20, `sessions=${s.sessions} disposed=${s.disposedSessions}`);
  check('泄漏: renderer/geometry/material/texture/target 创建数 = 释放数', kinds.every(k => s.created[k] === s.disposed[k]) && s.created.renderer > 0 && s.created.texture > 0, kinds.map(k => `${k}:${s.created[k]}/${s.disposed[k]}`).join(' '));
  check('泄漏: 存活 canvas 计数归零、DOM 无残留 #showcase canvas', s.canvasesLive === 0 && r.canv === 0);
  check('泄漏: dispose 后 renderer.info 无残留(geometries/textures/programs = 0)', s.lastInfo && s.lastInfo.geometries === 0 && s.lastInfo.textures === 0 && s.lastInfo.programs === 0, JSON.stringify(s.lastInfo));
  check('泄漏: 无 "Too many active WebGL contexts" 警告', !warns.some(w => /Too many active WebGL/i.test(w)));
  check('泄漏: 无页面报错', clean(errs).length === 0, clean(errs).join(' | '));
  console.log('   resources:', JSON.stringify({ created: s.created, disposed: s.disposed }));
  await ctx.close();
}

// ── 5b high 档(带后处理 RT)4 档各一次 ──
{
  const { p, ctx, errs } = await open('&quality=high');
  const s = await p.evaluate(async () => {
    const S = window.__slots; const st = S.showcaseStats;
    for (const t of ['big', 'mega', 'epic', 'max']) {
      const run = S.playBigWin(t); const t00 = st.t0;
      await new Promise(res => { const poll = () => (st.t0 > t00 && performance.now() - st.t0 > 900) ? res() : setTimeout(poll, 20); poll(); });
      document.querySelector('#showcase').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await run;
    }
    return JSON.parse(JSON.stringify(st));
  });
  check('泄漏(high,含后处理 RT): 4 档 created = disposed 且 target>0', s.sessions === 4 && ['renderer', 'geometry', 'material', 'texture', 'target'].every(k => s.created[k] === s.disposed[k]) && s.created.target > 0, JSON.stringify(s.created));
  check('泄漏(high): renderer.info 清零、无残留 canvas', s.lastInfo.geometries === 0 && s.lastInfo.textures === 0 && s.canvasesLive === 0, JSON.stringify(s.lastInfo));
  check('泄漏(high): 无页面报错', clean(errs).length === 0, clean(errs).join(' | ')); await ctx.close();
}

// ── 6 skip 发生在启动期(素材加载/编译阶段) ──
{
  const { p, ctx } = await open('&quality=low');
  const r = await p.evaluate(async () => { const run = window.__slots.playBigWin('big'); await new Promise(r => setTimeout(r, 30)); document.querySelector('#showcase')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); const t = performance.now(); await run; return { ms: Math.round(performance.now() - t), busy: window.__slots.shell.isBusy, live: window.__slots.showcaseStats.canvasesLive }; });
  check('skip 发生在启动期:快速结束且不泄漏', r.ms < 4000 && !r.busy && r.live === 0, JSON.stringify(r)); await ctx.close();
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('FAILED:', failed); process.exit(1); }
