// 首屏传输体积测量(D-07 新口径):node scripts/measure.mjs [distDir=dist] [--idle=5000] [--nocache] [--json out.json]
// - 真实浏览器(Playwright/Chromium)加载 dist 构建产物;脚本自带 gzip 静态服务器(html/js/css/json/svg gzip,webp/woff2 原样),
//   缓存头 `public, max-age=31536000`(同一 URL 第二次请求命中浏览器缓存,不再回源)。
// - 说明:Worker 里发起的贴图请求在 CDP 主线程会话里看不到(旧版漏统计的原因);这里以服务器逐请求日志为权威口径(任何来源的请求都会到服务器),并用 context 级 request 事件交叉校验。
// - 记录方式:context 级 request/response(含 Worker 发起的请求,如 Pixi 的 Worker 贴图加载)+ 服务器端逐请求日志,二者交叉校验。
// - 输出两种口径:未去重(每个到达服务器的请求都计)与按 URL 去重(每个 URL 只计一次);另给 Worker 请求数与"空闲 N 秒后"(含按钮状态图预载)的数字。
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const jsonOut = (() => { const i = args.indexOf('--json'); return i >= 0 ? args[i + 1] : null; })();
const root = path.resolve(args.find(a => !a.startsWith('--') && a !== jsonOut) ?? 'dist');
const IDLE = +flag('idle', 5000);
const NOCACHE = args.includes('--nocache'); // no-store:同一 URL 每次都回源,用来看“未去重”的重复请求(对照 QA 口径)
if (!fs.existsSync(path.join(root, 'index.html'))) { console.log('dist 不存在,先构建…'); execSync('pnpm build', { stdio: 'inherit' }); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const gz = new Set(['.html', '.js', '.css', '.json', '.svg']);
const served = []; // 服务器端逐请求日志
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = path.join(root, decodeURIComponent(u.pathname)); if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { served.push({ url: u.pathname, status: 404, bytes: 0 }); res.statusCode = 404; res.end('nf'); return; }
  const ext = path.extname(p); let buf = fs.readFileSync(p); const raw = buf.length; let enc = false;
  if (gz.has(ext)) { buf = zlib.gzipSync(buf, { level: 6 }); enc = true; }
  res.setHeader('content-type', types[ext] ?? 'application/octet-stream'); if (enc) res.setHeader('content-encoding', 'gzip');
  res.setHeader('cache-control', NOCACHE ? 'no-store' : 'public, max-age=31536000'); res.setHeader('content-length', buf.length);
  served.push({ url: u.pathname, status: 200, raw, bytes: buf.length });
  res.end(buf);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 540, height: 960 } }); // 新 context = 空缓存
const reqs = []; const pageUrls = new Map(); // reqs: context 级(含 Worker);pageUrls: page 级(只含页面 frame 发起)
ctx.on('requestfinished', async r => {
  const resp = await r.response().catch(() => null);
  let sizes = null; try { sizes = await r.sizes(); } catch { /* ignore */ }
  if (!r.url().startsWith(base)) return;
  reqs.push({ rid: r, url: new URL(r.url()).pathname, status: resp?.status() ?? 0, body: sizes?.responseBodySize ?? 0, head: sizes?.responseHeadersSize ?? 0 });
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const pageReqs = new Set(); page.on('request', r => pageReqs.add(r));
await page.goto(base);
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
await page.waitForTimeout(100);
const first = { ctx: reqs.slice(), srv: served.slice() };
await page.waitForTimeout(IDLE);
await page.screenshot({ path: new URL('../screenshots/measure-first-screen.png', import.meta.url).pathname }).catch(() => {});
const idleAll = { ctx: reqs.slice(), srv: served.slice() };
await b.close(); server.close();

const sum = (a, k) => a.reduce((s, x) => s + (x[k] ?? 0), 0);
const dedupBy = a => { const m = new Map(); for (const x of a) if (!m.has(x.url)) m.set(x.url, x); return [...m.values()]; };
const ok = a => a.filter(x => x.status === 200);
function report(label, d) {
  const srv = ok(d.srv); const srvU = dedupBy(srv);
  const ctxA = ok(d.ctx); const ctxU = dedupBy(ctxA);
  const ctxBytes = a => a.reduce((s, x) => s + x.body + x.head, 0);
  const dups = [...srv.reduce((m, x) => m.set(x.url, (m.get(x.url) ?? 0) + 1), new Map())].filter(([, n]) => n > 1);
  const r = {
    label,
    requests: srv.length, uniqueUrls: srvU.length, workerRequests: ctxA.filter(x => !pageReqs.has(x.rid)).length, blobRequests: 0,
    notDedupBytes: sum(srv, 'bytes'), dedupBytes: sum(srvU, 'bytes'),
    ctxNotDedupBytes: ctxBytes(ctxA), ctxDedupBytes: ctxBytes(ctxU), ctxRequests: ctxA.length,
    duplicates: dups.map(([u, n]) => `${u} ×${n}`),
    top: srvU.sort((a, b) => b.bytes - a.bytes).slice(0, 10).map(x => ({ url: x.url, bytes: x.bytes })),
  };
  return r;
}
const R1 = report('首屏(data-ready 刻,按钮状态图预载尚未开始)', first), R2 = report(`空闲 +${IDLE / 1000}s(含按钮状态图预载)`, idleAll);
const kb = n => `${(n / 1024).toFixed(1)} KB`;
for (const r of [R1, R2]) {
  console.log(`\n== ${r.label} ==`);
  console.log(`请求数 ${r.requests}(唯一 URL ${r.uniqueUrls});浏览器侧 context 级请求 ${r.ctxRequests};其中仅 context 级可见(Worker 发起)${r.workerRequests} 个`);
  console.log(`未去重:${r.notDedupBytes} B (${kb(r.notDedupBytes)})   去重:${r.dedupBytes} B (${kb(r.dedupBytes)})   [gzip 口径,服务器端]`);
  console.log(`浏览器侧交叉校验(responseBodySize+headers):未去重 ${r.ctxNotDedupBytes} B,去重 ${r.ctxDedupBytes} B`);
  console.log(`重复请求:${r.duplicates.length ? r.duplicates.join(', ') : '无'}`);
}
// 大赢演出(three 块 + 美术素材)必须不在首屏口径内;空闲 ≥8s 后会有 <link rel=prefetch>(可用 --idle=12000 观察,preview/生产构建才会预取)
const isBw = u => /\/assets\/(bigwin\/|three-)/.test(u);
for (const [lab, d] of [['首屏', first], [`空闲 +${IDLE / 1000}s`, idleAll]]) {
  const hit = dedupBy(ok(d.srv)).filter(x => isBw(x.url));
  console.log(`大赢演出相关请求(${lab}):${hit.length ? hit.map(x => `${x.url} ${x.bytes}B`).join(', ') : '0(未加载,符合预期)'}`);
}
console.log('\n最大 10 项(首屏,去重):'); for (const t of R1.top) console.log(String(t.bytes).padStart(8), t.url);
if (errs.length) console.log('page errors:', errs);
const out = { first: R1, idle: R2, errors: errs };
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
process.exit(errs.length ? 1 : 0);
