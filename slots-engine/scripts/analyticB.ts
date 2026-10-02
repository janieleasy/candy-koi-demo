/**
 * 玩法 B 的精确 RTP:基础部分用 native/enum 穷举 (线赢 L, C 数 k);H&S 用 (K,R) 马尔可夫链的期望(不含 10000x 上限,上限由蒙特卡洛覆盖)。
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GameBConfig } from '../src/config.js';

const ENUM_BIN = fileURLToPath(new URL('../native/enum', import.meta.url));
const SYMS = ['H1', 'H2', 'H3', 'L1', 'L2', 'L3', 'L4', 'C'];

export interface DistB { N: number; map: Map<number, number> }
export function enumerateB(strips: string[][], paylines: number[][], paytable: Record<string, [number, number, number]>): DistB {
  const lines = [`1 ${paylines.length}`, ...paylines.map(l => l.join(' '))];
  for (let i = 0; i < 7; i++) lines.push(paytable[SYMS[i]].join(' '));
  for (const st of strips) lines.push(`${st.length} ${st.map(x => SYMS.indexOf(x)).join(' ')}`);
  const out = execFileSync(ENUM_BIN, { input: lines.join('\n') + '\n', encoding: 'utf8', maxBuffer: 1 << 28 });
  const map = new Map<number, number>();
  for (const ln of out.split('\n')) { if (!ln) continue; const [L, k, c] = ln.split(' ').map(Number); map.set(L * 16 + k, c); }
  return { N: strips.reduce((a, s) => a * s.length, 1), map };
}

function binom(n: number, k: number, p: number): number {
  let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
  return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

export interface HsEV {
  expNew: number;     // 期望新落 C 个数
  pFull: number;      // 满屏概率
  expRespins: number; // 期望重旋转次数
  expFinalK: number;
}
export function hsChain(cfg: GameBConfig, K0: number): HsEV {
  const memo = new Map<number, HsEV>();
  const R0 = cfg.respins;
  const rec = (K: number, R: number): HsEV => {
    if (K >= 15) return { expNew: 0, pFull: 1, expRespins: 0, expFinalK: 15 };
    if (R <= 0) return { expNew: 0, pFull: 0, expRespins: 0, expFinalK: K };
    const key = K * 8 + R; const h = memo.get(key); if (h) return h;
    const n = 15 - K, p = cfg.pRespin[K - cfg.triggerMin];
    const r: HsEV = { expNew: 0, pFull: 0, expRespins: 1, expFinalK: 0 };
    for (let j = 0; j <= n; j++) {
      const pj = binom(n, j, p);
      const sub = j > 0 ? rec(K + j, R0) : rec(K, R - 1);
      r.expNew += pj * (j + sub.expNew); r.pFull += pj * sub.pFull; r.expRespins += pj * sub.expRespins; r.expFinalK += pj * sub.expFinalK;
    }
    memo.set(key, r); return r;
  };
  return rec(K0, R0);
}

const mean = (v: number[], w: number[]) => { let a = 0, b = 0; for (let i = 0; i < v.length; i++) { a += v[i] * w[i]; b += w[i]; } return a / b; };

export function analyzeB(cfg: GameBConfig, cache?: { base?: DistB }) {
  const d = cache?.base ?? enumerateB(cfg.reels.base, cfg.paylines, cfg.paytable as any);
  let lineRtp = 0, hit = 0, trig = 0;
  const pk = new Array(16).fill(0);
  for (const [key, cnt] of d.map) {
    const p = cnt / d.N, L = Math.floor(key / 16), k = key % 16;
    lineRtp += p * L / 10; if (L > 0) hit += p; pk[k] += p; if (k >= cfg.triggerMin) trig += p;
  }
  const mStart = mean(cfg.coin.values, cfg.coin.startWeights);
  const mResp = mean(cfg.coin.values, cfg.coin.respinWeights);
  const q = cfg.coin.jackpotProb, jw = cfg.coin.jackpotWeights;
  const jwt = jw.Mini + jw.Minor + jw.Major + jw.Grand;
  const eJp = (jw.Mini * cfg.jackpotMult.Mini + jw.Minor * cfg.jackpotMult.Minor + jw.Major * cfg.jackpotMult.Major + jw.Grand * cfg.jackpotMult.Grand) / jwt;
  const mNewMult = (1 - q) * mResp, mNewJp = q * eJp;
  // 给定 K0 的 H&S 期望(总投注倍数)
  const evFor = (K0: number) => {
    const c = hsChain(cfg, K0);
    const coin = K0 * mStart + c.expNew * mNewMult;
    const jp = c.expNew * mNewJp;
    const full = c.pFull * cfg.fullScreenMult;
    return { total: coin + jp + full, coin, jp, full, ...c };
  };
  let hsCoin = 0, hsJp = 0, hsFull = 0, fullProb = 0, respinsAvg = 0, kAvg = 0;
  for (let k = cfg.triggerMin; k <= 15; k++) {
    const e = evFor(k);
    hsCoin += pk[k] * e.coin; hsJp += pk[k] * e.jp; hsFull += pk[k] * e.full; fullProb += pk[k] * e.pFull;
    respinsAvg += pk[k] * e.expRespins; kAvg += pk[k] * e.expFinalK;
  }
  const buyEv = evFor(cfg.buy.startCoins);
  return {
    baseLineRtp: lineRtp, hitRate: hit, triggerRate: trig,
    hsRtp: hsCoin + hsJp + hsFull, hsCoinRtp: hsCoin, hsJackpotCoinRtp: hsJp, hsFullScreenRtp: hsFull,
    totalRtp: lineRtp + hsCoin + hsJp + hsFull,
    avgHsEv: trig > 0 ? (hsCoin + hsJp + hsFull) / trig : 0,
    fullScreenProbPerSpin: fullProb, hsAvgRespins: trig > 0 ? respinsAvg / trig : 0, hsAvgFinalK: trig > 0 ? kAvg / trig : 0,
    buyEv: buyEv.total, buyEvDetail: buyEv, pk, meanStart: mStart, meanResp: mResp, eJp,
  };
}
