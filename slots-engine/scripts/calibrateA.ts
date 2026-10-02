/**
 * 玩法 A 卷轴校准:模拟退火 + 精确枚举。
 * 用法: node --import tsx scripts/calibrateA.ts <seed> <iters> [out.json]
 * 阶段1 优化 BASE 轴带(目标:基础 RTP≈0.65,命中率≈0.29);阶段2 优化 FS 轴带(目标:FS 贡献≈0.31,总 RTP≈0.96)。
 */
import fs from 'node:fs';
import { PAYLINES_A } from './paylines.js';
import { enumerate } from './analyticA.js';
import { Rng } from '../src/rng.js';

const PAY: Record<string, [number, number, number]> = {
  H1: [20, 100, 500], H2: [15, 60, 250], H3: [10, 40, 150], H4: [8, 30, 100],
  L1: [3, 12, 50], L2: [3, 12, 50], L3: [2, 8, 30], L4: [2, 8, 30], L5: [1, 5, 20],
};
const SC: Record<number, number> = { 3: 2, 4: 10, 5: 50 };
const NS = ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4', 'L5'];

const seed = process.argv[2] ?? 'cal';
const iters = Number(process.argv[3] ?? 200);
const outFile = process.argv[4];
const rng = new Rng('calA-' + seed);

function initStrip(len: number, reel: number, nS: number, wCount: number): string[] {
  const s: string[] = new Array(len).fill('');
  // S 均匀放置
  for (let i = 0; i < nS; i++) s[Math.floor((i * len) / nS) + (len % 3)] = 'S';
  const pool: string[] = [];
  for (let i = 0; i < wCount; i++) pool.push('W');
  const wts = [2, 2, 3, 3, 4, 4, 5, 5, 5];
  let k = 0;
  while (pool.length < len - nS) { for (let j = 0; j < 9 && pool.length < len - nS; j++) if (k % 5 < Math.ceil(wts[j] / 2)) pool.push(NS[j]); k++; }
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  let p = 0;
  for (let i = 0; i < len; i++) if (s[i] === '') s[i] = pool[p++];
  return s;
}

function mutate(strips: string[][]): string[][] {
  const out = strips.map(s => s.slice());
  const r = rng.int(5), s = out[r], n = s.length;
  const allowed = r >= 1 && r <= 3 ? [...NS, 'W'] : NS;
  if (rng.int(2) === 0) {
    const i = rng.int(n), j = rng.int(n);
    if (s[i] === 'S' || s[j] === 'S') return out;
    [s[i], s[j]] = [s[j], s[i]];
  } else {
    const i = rng.int(n);
    if (s[i] === 'S') return out;
    s[i] = allowed[rng.int(allowed.length)];
  }
  return out;
}

function evalBase(strips: string[][]) {
  const d = enumerate(strips, PAYLINES_A, PAY);
  let line = 0, sc = 0, hit = 0, trig = 0;
  for (const [key, cnt] of d.map) {
    const p = cnt / d.N, L = Math.floor(key / 8), k = key % 8;
    line += p * L / 20; sc += p * (SC[k] ?? 0); if (L > 0 || k >= 3) hit += p; if (k >= 3) trig += p;
  }
  return { rtp: line + sc, line, sc, hit, trig };
}

const lenBase = [33, 33, 33, 33, 33];
const lenFs = [36, 36, 36, 36, 36];
let base = lenBase.map((n, r) => initStrip(n, r, 1, r >= 1 && r <= 3 ? 2 : 0));

function anneal<T>(init: string[][], score: (s: string[][]) => [number, T], n: number, T0: number) {
  let cur = init, [curE, curI] = score(cur);
  let best = cur, bestE = curE, bestI = curI;
  for (let it = 0; it < n; it++) {
    const T = T0 * (1 - it / n) + 1e-4;
    const cand = mutate(cur);
    const [e, info] = score(cand);
    if (e < curE || rng.float() < Math.exp((curE - e) / T)) { cur = cand; curE = e; curI = info; }
    if (curE < bestE) { best = cur; bestE = curE; bestI = curI; }
    if (it % 20 === 0) console.error(`it ${it} E=${bestE.toFixed(5)}`, JSON.stringify(bestI));
  }
  return { strips: best, E: bestE, info: bestI };
}

const TARGET_BASE = 0.65, TARGET_HIT = 0.29;
const b = anneal(base, s => {
  const m = evalBase(s);
  const e = Math.abs(m.rtp - TARGET_BASE) * 4 + Math.abs(m.hit - TARGET_HIT) * 2;
  return [e, m];
}, iters, 0.01);
console.error('BASE', JSON.stringify(b.info));

// FS 阶段:目标 FS 贡献 ≈ 0.31 -> 需要每个触发的 EV;用 analyticA 内的 DP
import { analyzeA } from './analyticA.js';
const mkCfg = (bs: string[][], fsr: string[][]): any => ({
  paylines: PAYLINES_A, paytable: PAY, scatterPay: { '3': 2, '4': 10, '5': 50 }, reels: { base: bs, fs: fsr },
  fs: { award: { '3': 8, '4': 12, '5': 20 }, retrigger: { '3': 5, '4': 8, '5': 12 }, maxTotal: 60, ladder: [1, 2, 3, 5] },
});
const baseDist = enumerate(b.strips, PAYLINES_A, PAY);
const baseScatRatio = b.strips.reduce((a, s) => a + s.filter(x => x === 'S').length / s.length, 0);
let fsInit = lenFs.map((n, r) => initStrip(n, r, 1, r >= 1 && r <= 3 ? 5 : 0));
const f = anneal(fsInit, s => {
  const ratio = s.reduce((a, x) => a + x.filter(y => y === 'S').length / x.length, 0);
  if (ratio > baseScatRatio) return [1e3, {}];
  const st = analyzeA(mkCfg(b.strips, s), { base: baseDist });
  const e = Math.abs(st.totalRtp - 0.96) * 4 + Math.abs(st.fsRtp - 0.31) * 2;
  return [e, { total: st.totalRtp, fs: st.fsRtp, base: st.baseRtp }];
}, Math.floor(iters / 2), 0.01);
console.error('FS', JSON.stringify(f.info));
if (outFile) fs.writeFileSync(outFile, JSON.stringify({ base: b.strips, fs: f.strips, baseInfo: b.info, fsInfo: f.info }, null, 1));
