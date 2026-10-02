// 校验 H&S 状态条与盘面同步:node scripts/check-hs-sync.mjs [baseUrl] [seed]
// 1) 每个 B_hs_respin / B_hs_enter 步表现结束(step:end)时:状态条 K = CoinLayer 锁币数 = step.K,R = step.R
// 2) 持续采样,统计“不同步”只出现在哪些 UI 状态(用来区分动画中途 vs bug)
// 3) 在稳定状态(Presenting、K 与盘面一致)截图 screenshots/07-B-hold-and-spin.png
import { chromium } from 'playwright';
const BASE = process.argv[2] ?? 'http://localhost:5173/';
const SEED = process.argv[3] ?? 'hsdemo';
const OUT = new URL('../screenshots/07-B-hold-and-spin.png', import.meta.url).pathname;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`${BASE}?force=hs&seed=${SEED}&reset=1`);
await page.waitForSelector('html[data-ready="1"]', { timeout: 40000 });
await page.waitForFunction(() => !!window.__slots, null, { timeout: 10000 });
// force 的首个 hsEnter 步在 activate() 后立刻开始;钩子必须在其 step:end 之前挂上(enter 步含横幅,>1s,来得及)
await page.evaluate(() => {
  const w = window.__slots; const stage = w.shell.d.stage;
  const snap = () => ({ hdrK: stage.hsHeaderRef.shownK, hdrR: stage.hsHeaderRef.shownR, layer: stage.coins.count,
    engK: w.controllers.B.state.round?.hs.locked.length ?? null, ui: w.shell.fsm.state });
  w.__ends = []; w.__samples = [];
  w.bus.on('step:end', ({ step }) => {
    if (step.kind === 'B_hs_respin' || step.kind === 'B_hs_enter') w.__ends.push({ kind: step.kind, idx: step.index, K: step.K, R: step.R, ...snap() });
  });
  setInterval(() => w.__samples.push(snap()), 40);
  return true;
});
console.log('hooks installed:', await page.evaluate(() => Array.isArray(window.__slots.__ends)));
// 稳定截图:第 2 次重转表现结束前的“静止窗口”(presenter 末尾有等待),要求 K 与盘面一致且处于 Presenting
await page.waitForFunction(() => window.__slots.__ends.filter(e => e.kind === 'B_hs_respin').length >= 1, null, { timeout: 90000 });
let shot = false;
for (let i = 0; i < 400 && !shot; i++) {
  const ok = await page.evaluate(() => { const w = window.__slots; const st = w.shell.d.stage;
    const r = w.controllers.B.state.round; return !!r && w.shell.fsm.state === 'Presenting' && st.hsHeaderRef.shownK === st.coins.count && st.coins.count === r.hs.locked.length && st.coins.count >= 7; });
  if (ok) {
    const before = await page.evaluate(() => { const s = window.__slots.shell.d.stage; return [s.hsHeaderRef.shownK, s.coins.count]; });
    await page.screenshot({ path: OUT });
    const after = await page.evaluate(() => { const s = window.__slots.shell.d.stage; return [s.hsHeaderRef.shownK, s.coins.count]; });
    if (JSON.stringify(before) === JSON.stringify(after)) { console.log('stable screenshot, header K / board coins =', before.join(' / ')); shot = true; }
  } else await page.waitForTimeout(25);
}
await page.waitForFunction(() => { const s = window.__slots.snapshot(); return !s.busy && s.ui === 'Idle'; }, null, { timeout: 120000 });
const { ends, samples } = await page.evaluate(() => ({ ends: window.__slots.__ends, samples: window.__slots.__samples }));
let bad = 0;
for (const e of ends) { const ok = e.hdrK === e.K && e.layer === e.K && e.hdrR === e.R; if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', e.kind, '#' + e.idx, JSON.stringify(e)); }
const mism = samples.filter(s => s.hdrK !== s.layer);
const byUi = {}; for (const s of mism) byUi[s.ui] = (byUi[s.ui] ?? 0) + 1;
console.log(`samples=${samples.length}; header≠board-layer samples=${mism.length} by ui state:`, JSON.stringify(byUi));
const ahead = samples.filter(s => s.engK !== null && s.hdrK !== s.engK);
const byUi2 = {}; for (const s of ahead) byUi2[s.ui] = (byUi2[s.ui] ?? 0) + 1;
console.log(`header≠engine-saved K (state is saved before animation): ${ahead.length} samples by ui:`, JSON.stringify(byUi2));
console.log('screenshot taken:', shot, 'step:end checks:', ends.length, 'failures:', bad, 'pageerrors:', errs);
await b.close();
process.exit(bad || !shot || ends.length < 2 || errs.length ? 1 : 0);
