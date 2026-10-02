// 大赢演出截图/验证:node scripts/shoot-showcase.mjs [game=A] [tiers=big,mega,epic,max] [quality=high] [dsf=1.5] [base=http://localhost:5173]
// headless 软渲染(swiftshader)下 page.screenshot 很慢(每张 ~1s),会错过时间点;所以在页面内按时间点抓 canvas(debug 构建 preserveDrawingBuffer),
// 再用 PIL 把 canvas(带 alpha)合成到"演出前的游戏截图"上,等价于玩家看到的画面。同时统计演出期间的 rAF 帧率。
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [game = 'A', tiersArg = 'big,mega,epic,max', quality = 'high', dsf = '1.5', base = 'http://localhost:5173'] = process.argv.slice(2);
const tiers = tiersArg.split(',');
const DUR = { big: 3500, mega: 5000, epic: 7000, max: 7000 };
const T = { big: [0.2, 0.34, 0.83], mega: [0.22, 0.4, 0.82], epic: [0.3, 0.45, 0.85], max: [0.3, 0.45, 0.85] }; // 进场 / 峰值 / 数字滚动完成 的时间比例
const names = ['enter', 'peak', 'done'];
fs.mkdirSync('screenshots', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const summary = [];
for (const tier of tiers) {
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: +dsf });
  const logs = [];
  p.on('console', m => { if (m.type() === 'error' || /THREE|Shader/.test(m.text())) logs.push(m.type() + ': ' + m.text().slice(0, 500)); });
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await p.goto(`${base}/?game=${game}&seed=7&quality=${quality}`);
  await p.waitForSelector('html[data-ready="1"]', { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `/tmp/bg-${tier}.png` });
  const r = await p.evaluate(async ([tier, dur, ratios]) => {
    const frames = []; let n = 0; let go = true; const tick = () => { n++; if (go) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const run = window.__slots.playBigWin(tier);
    const caps = [];
    await new Promise(res => { const poll = () => { const c = document.querySelector('#showcase canvas'); if (c && +c.style.opacity > 0.3) res(); else setTimeout(poll, 20); }; poll(); });
    const st = () => performance.now() - window.__slots.showcaseStats.t0; const t0 = performance.now(); const n0 = n;
    for (const rt of ratios) {
      const at = rt * dur; while (st() < at) await new Promise(r => setTimeout(r, 15));
      const c = document.querySelector('#showcase canvas'); if (c) caps.push({ at: Math.round(st()), url: c.toDataURL('image/png'), op: c.style.opacity, w: c.width, h: c.height });
    }
    const res = await run; go = false; const endAt = Math.round(performance.now() - t0);
    return { endAt, res, caps, fps: +(((n - n0) / ((performance.now() - t0) / 1000)).toFixed(1)), last: window.__slots.showcaseLast.current, stats: window.__slots.showcaseStats };
  }, [tier, DUR[tier], T[tier]]);
  r.caps.forEach((c, i) => fs.writeFileSync(`/tmp/cap-${tier}-${i}.png`, Buffer.from(c.url.split(',')[1], 'base64')));
  for (let i = 0; i < r.caps.length; i++) {
    execFileSync('python3', ['-c', `
from PIL import Image
bg=Image.open('/tmp/bg-${tier}.png').convert('RGBA'); cv=Image.open('/tmp/cap-${tier}-${i}.png').convert('RGBA').resize(bg.size, Image.LANCZOS)
op=${r.caps[i].op}
if op<1:
    a=cv.split()[3].point(lambda v:int(v*op)); cv.putalpha(a)
Image.alpha_composite(bg,cv).convert('RGB').save('screenshots/showcase-${tier}-${game}-${names[i]}.png')
`]);
  }
  console.log(tier, game, 'end@' + r.endAt, `fps≈${r.fps}`, `canvas=${r.caps[0]?.w}x${r.caps[0]?.h}`, 'at', r.caps.map(c => c.at + 'ms'), JSON.stringify(r.last));
  if (logs.length) console.log('  logs:', logs.slice(0, 5));
  await p.close();
}
await b.close();
