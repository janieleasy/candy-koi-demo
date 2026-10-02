/**
 * 玩法 A 的精确(解析)RTP 计算:对 5 轴所有停轴组合穷举(native/enum.c),得到 (线赢总额 L, S 数量 k) 的精确分布,
 * 再对 Free Spins 做 (剩余次数, 已授予总数, 阶梯下标) 的动态规划。不含 5000x 上限(上限由蒙特卡洛覆盖)。
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GameAConfig } from '../src/config.js';

const ENUM_BIN = fileURLToPath(new URL('../native/enum', import.meta.url));

const SYMS = ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4', 'L5', 'W', 'S'];

export interface Dist { N: number; map: Map<number, number> } // key = Lraw(线投注倍数)*8 + k

export function enumerate(strips: string[][], paylines: number[][], paytable: Record<string, [number, number, number]>): Dist {
  // 调用 native/enum(C + OpenMP)做 5 轴全组合穷举
  const lines = [`0 ${paylines.length}`, ...paylines.map(l => l.join(' '))];
  for (let i = 0; i < 9; i++) lines.push(paytable[SYMS[i]].join(' '));
  for (const st of strips) lines.push(`${st.length} ${st.map(x => SYMS.indexOf(x)).join(' ')}`);
  const out = execFileSync(ENUM_BIN, { input: lines.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 28 });
  const map = new Map<number, number>();
  for (const ln of out.split('\n')) {
    if (!ln) continue;
    const [L, k, c] = ln.split(' ').map(Number);
    map.set(L * 8 + k, c);
  }
  return { N: strips.reduce((a, s) => a * s.length, 1), map };
}

export interface StatsA {
  baseLineRtp: number; baseScatterRtp: number; hitRate: number; triggerRate: number;
  fsRtp: number; baseRtp: number; totalRtp: number;
  ev: Record<number, number>;          // 起始次数 -> 一整段 FS 的期望赢额(总投注倍数)
  fsAvgSpins: Record<number, number>;
  fsPerSpinRaw: number;                // FS 轴带上一次旋转的原始线赢期望(总投注倍数,未乘倍数)
  fsPHit: number;
  baseStopsProbK: number[];
}

export function analyzeA(cfg: GameAConfig, cache?: { base?: Dist; fs?: Dist }): StatsA & { baseDist: Dist; fsDist: Dist } {
  const baseDist = cache?.base ?? enumerate(cfg.reels.base, cfg.paylines, cfg.paytable as any);
  const fsDist = cache?.fs ?? enumerate(cfg.reels.fs, cfg.paylines, cfg.paytable as any);
  const sc = (k: number) => cfg.scatterPay[String(k)] ?? 0;

  // 基础
  let lineRtp = 0, scRtp = 0, hit = 0, trig = 0;
  const pk = [0, 0, 0, 0, 0, 0];
  for (const [key, cnt] of baseDist.map) {
    const p = cnt / baseDist.N, L = Math.floor(key / 8), k = key % 8;
    lineRtp += p * L / 20; scRtp += p * sc(k); pk[k] += p;
    if (L > 0 || k >= 3) hit += p;
    if (k >= 3) trig += p;
  }
  // FS 分布整理
  type O = { p: number; L: number; k: number };
  const fo: O[] = [];
  let fsRaw = 0, fsHit = 0;
  for (const [key, cnt] of fsDist.map) {
    const p = cnt / fsDist.N, L = Math.floor(key / 8), k = key % 8;
    fo.push({ p, L: L / 20, k }); fsRaw += p * L / 20; if (L > 0) fsHit += p;
  }
  const M = cfg.fs.ladder, maxT = cfg.fs.maxTotal;
  const memo = new Map<number, number>(), memoN = new Map<number, number>();
  const rec = (r: number, a: number, c: number): [number, number] => {
    if (r <= 0) return [0, 0];
    const key = (r * 64 + a) * 4 + c;
    const hv = memo.get(key); if (hv !== undefined) return [hv, memoN.get(key)!];
    let ev = 0, ns = 0;
    for (const o of fo) {
      let r2 = r - 1, a2 = a;
      if (o.k >= 3) { const add = Math.max(0, Math.min(cfg.fs.retrigger[String(o.k)], maxT - a)); r2 += add; a2 += add; }
      const c2 = o.L > 0 ? Math.min(c + 1, M.length - 1) : 0;
      const [sub, subN] = rec(r2, a2, c2);
      ev += o.p * (o.L * M[c] + sc(o.k) + sub);
      ns += o.p * (1 + subN);
    }
    memo.set(key, ev); memoN.set(key, ns);
    return [ev, ns];
  };
  const ev: Record<number, number> = {}, fsAvgSpins: Record<number, number> = {};
  for (const n of [8, 12, 20]) { const [e, s] = rec(n, n, 0); ev[n] = e; fsAvgSpins[n] = s; }
  let fsRtp = 0;
  for (let k = 3; k <= 5; k++) fsRtp += pk[k] * ev[cfg.fs.award[String(k)]];
  const baseRtp = lineRtp + scRtp;
  return {
    baseLineRtp: lineRtp, baseScatterRtp: scRtp, hitRate: hit, triggerRate: trig, fsRtp, baseRtp,
    totalRtp: baseRtp + fsRtp, ev, fsAvgSpins, fsPerSpinRaw: fsRaw, fsPHit: fsHit, baseStopsProbK: pk, baseDist, fsDist,
  };
}
