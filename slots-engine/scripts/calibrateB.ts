/**
 * 玩法 B 校准。阶段1:退火优化 BASE 轴带(线赢 RTP≈0.33,命中率≈0.23,触发率≈1/130)。
 * 阶段2(见 tuneB.ts):在固定轴带上调币值权重 / p(K) / q,使 H&S 贡献≈0.63、Jackpot≈0.055。
 * 用法: node --import tsx scripts/calibrateB.ts <seed> <iters> <out.json>
 */
import fs from 'node:fs';
import { PAYLINES_B } from './paylines.js';
import { enumerateB } from './analyticB.js';
import { Rng } from '../src/rng.js';

const PAY: Record<string, [number, number, number]> = {
  H1: [25, 100, 400], H2: [15, 60, 200], H3: [10, 40, 120], L1: [4, 15, 50], L2: [4, 15, 50], L3: [3, 10, 30], L4: [3, 10, 30], C: [0, 0, 0],
};
const NS = ['H1', 'H2', 'H3', 'L1', 'L2', 'L3', 'L4'];
const seed = process.argv[2] ?? 'b'; const iters = Number(process.argv[3] ?? 200); const outFile = process.argv[4];
const rng = new Rng('calB-' + seed);
const LEN = 34, NC = 4; // 每轴 34 格,含 4 个 C

function init(): string[][] {
  return [0, 1, 2, 3, 4].map(() => {
    const s: string[] = new Array(LEN).fill('');
    for (let i = 0; i < NC; i++) s[Math.floor(i * LEN / NC)] = 'C';
    const pool: string[] = []; const w = [2, 3, 4, 6, 6, 7, 7]; // 权重粗分布
    let k = 0; while (pool.length < LEN - NC) { pool.push(NS[k % 7]); if (rng.int(3) === 0) pool.push(NS[rng.int(7)]); k++; }
    pool.length = LEN - NC;
    for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let p = 0; for (let i = 0; i < LEN; i++) if (s[i] === '') s[i] = pool[p++];
    void w; return s;
  });
}
function mutate(st: string[][]): string[][] {
  const o = st.map(s => s.slice()); const s = o[rng.int(5)];
  const t = rng.int(3);
  if (t === 0) { const i = rng.int(LEN), j = rng.int(LEN); [s[i], s[j]] = [s[j], s[i]]; }
  else if (t === 1) { const i = rng.int(LEN); if (s[i] !== 'C') s[i] = NS[rng.int(7)]; }
  else { // 变更 C 数量 ±1(约束 3..5)
    const nc = s.filter(x => x === 'C').length;
    const i = rng.int(LEN);
    if (s[i] === 'C' && nc > 3) s[i] = NS[rng.int(7)]; else if (s[i] !== 'C' && nc < 5) s[i] = 'C';
  }
  return o;
}
const TL = 0.33, TH = 0.23, TT = 1 / 130;
function score(st: string[][]) {
  const d = enumerateB(st, PAYLINES_B, PAY);
  let line = 0, hit = 0, trig = 0;
  for (const [key, cnt] of d.map) { const p = cnt / d.N, L = Math.floor(key / 16), k = key % 16; line += p * L / 10; if (L > 0) hit += p; if (k >= 6) trig += p; }
  const e = Math.abs(line - TL) * 4 + Math.abs(hit - TH) * 8 + Math.abs(Math.log(trig / TT)) * 0.1;
  return { e, line, hit, trig };
}
let cur = init(), curS = score(cur), best = cur, bestS = curS;
for (let it = 0; it < iters; it++) {
  const T = 0.01 * (1 - it / iters) + 1e-4;
  const c = mutate(cur), s = score(c);
  if (s.e < curS.e || rng.float() < Math.exp((curS.e - s.e) / T)) { cur = c; curS = s; }
  if (curS.e < bestS.e) { best = cur; bestS = curS; }
  if (it % 20 === 0) console.error(`it ${it}`, JSON.stringify(bestS));
}
console.error('BEST', JSON.stringify(bestS));
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ base: best, info: bestS }, null, 1));
