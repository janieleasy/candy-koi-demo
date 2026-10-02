// 同步设计说明文案:把产品目录的 demo_panel_copy.json 拷到 src/content/(构建时静态 import,运行时不跨目录读取)。
// 用法:pnpm sync:panel-copy [源文件路径];默认 /workspace/slots-product/demo_panel_copy.json。只读源,不改产品目录。
import fs from 'node:fs';
const src = process.argv[2] ?? '/workspace/slots-product/demo_panel_copy.json';
const dst = new URL('../src/content/demo_panel_copy.json', import.meta.url).pathname;
const j = JSON.parse(fs.readFileSync(src, 'utf8'));
for (const g of ['A', 'B']) {
  const x = j.games?.[g];
  if (!x || !x.title || !x.panelTitle || !Array.isArray(x.points) || !x.points.every(p => p.heading && p.text)) throw new Error(`格式不符:games.${g}`);
  console.log(`${g}: ${x.title} · ${x.panelTitle} · ${x.points.length} 条`);
}
fs.copyFileSync(src, dst);
console.log(`version ${j.version} → ${dst}`);
