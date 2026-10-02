// Playwright 辅助:node scripts/pw.mjs <url> <out.png> [waitMs]
import { chromium } from 'playwright';
const [url, out, wait = '1500'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
p.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 300)));
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(url);
await p.waitForSelector('html[data-ready="1"]', { timeout: 30000 }).catch(() => console.log('not ready'));
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
await b.close();
