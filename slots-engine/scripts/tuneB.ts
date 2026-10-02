/**
 * 玩法 B 的 H&S 参数调校(在固定 BASE 轴带上):随机搜索币值权重/p(K)/q/Jackpot 权重,
 * 目标:总 RTP≈0.96;H&S≈0.63;Jackpot(Jackpot 币 + 满屏 Grand)≈0.055;满屏 Grand 约占 Jackpot 的 1/3 以内;购买价使购买 RTP 与正常相差 <0.5pp。
 * 解析模型不含 10000x 上限(上限截断的影响由蒙特卡洛量化)。
 */
import fs from 'node:fs';
import { PAYLINES_B } from './paylines.js';
import { analyzeB, enumerateB } from './analyticB.js';
import { Rng } from '../src/rng.js';

const PAY: any = { H1: [25, 100, 400], H2: [15, 60, 200], H3: [10, 40, 120], L1: [4, 15, 50], L2: [4, 15, 50], L3: [3, 10, 30], L4: [3, 10, 30], C: [0, 0, 0] };
const reels = JSON.parse(fs.readFileSync(new URL('../config/reelsB.json', import.meta.url), 'utf8'));
const dist = enumerateB(reels, PAYLINES_B, PAY);
const VALUES = [1, 2, 3, 5, 8, 10, 15, 25, 50];
const rng = new Rng('tuneB-' + (process.argv[2] ?? '1'));
const iters = Number(process.argv[3] ?? 4000);

// 平滑参数化,避免权重表退化:w(v) = round(1000 * v^(-alpha)) ,高档位再乘 boost
interface P { aS: number; aR: number; boost: number; q: number; p0: number; decay: number; }
const JW: [number, number, number, number] = [60, 28, 10, 2];
const wts = (alpha: number, boost: number) => VALUES.map(v => Math.max(1, Math.round(1000 * Math.pow(v, -alpha) * (v >= 15 ? boost : 1))));
const mk = (p: P): any => ({
  paylines: PAYLINES_B, paytable: PAY, reels: { base: reels }, triggerMin: 6, respins: 3,
  coin: { values: VALUES, startWeights: wts(p.aS, 1), respinWeights: wts(p.aR, p.boost), jackpotProb: p.q, jackpotWeights: { Mini: JW[0], Minor: JW[1], Major: JW[2], Grand: JW[3] } },
  jackpotMult: { Mini: 10, Minor: 25, Major: 100, Grand: 1000 }, fullScreenMult: 1000,
  pRespin: Array.from({ length: 9 }, (_, i) => Math.min(0.95, p.p0 * Math.pow(p.decay, i))),
  buy: { startCoins: 6 },
});
const BUY = Number(process.argv[4] ?? 85);
const score = (p: P) => {
  const a = analyzeB(mk(p), { base: dist });
  const jp = a.hsJackpotCoinRtp + a.hsFullScreenRtp;
  const e = Math.abs(a.buyEv / BUY - a.totalRtp) * 12 + Math.abs(a.totalRtp - 0.96) * 6 + Math.abs(a.hsRtp - 0.63) * 2 + Math.abs(jp - 0.055) * 6 + Math.abs(a.hsFullScreenRtp - 0.015) * 10;
  return { e, a, jp };
};
let cur: P = { aS: 1.4, aR: 1.2, boost: 1, q: 0.02, p0: 0.12, decay: 0.9 };
let curS = score(cur), best = cur, bestS = curS;
const rr = (x: number, k: number) => x * (1 + (rng.float() - 0.5) * k);
for (let it = 0; it < iters; it++) {
  const c: P = { ...cur };
  const t = rng.int(6);
  if (t === 0) c.aS = Math.min(2.5, Math.max(0, rr(c.aS + 0.01, 0.2)));
  else if (t === 1) c.aR = Math.min(2.5, Math.max(0, rr(c.aR + 0.01, 0.2)));
  else if (t === 2) c.q = Math.min(0.2, Math.max(0.002, rr(c.q, 0.3)));
  else if (t === 3) c.boost = 1;
  else if (t === 4) c.p0 = Math.min(0.5, Math.max(0.03, rr(c.p0, 0.15)));
  else c.decay = Math.min(1, Math.max(0.7, rr(c.decay, 0.05)));
  const s = score(c); const T = 0.01 * (1 - it / iters) + 1e-5;
  if (s.e < curS.e || rng.float() < Math.exp((curS.e - s.e) / T)) { cur = c; curS = s; }
  if (curS.e < bestS.e) { best = cur; bestS = curS; }
}
const final = mk(best);
const a = bestS.a;
console.log(JSON.stringify({ best, startWeights: final.coin.startWeights, respinWeights: final.coin.respinWeights, pRespin: final.pRespin, e: bestS.e, jp: bestS.jp, hit: a.hitRate, trig: a.triggerRate, line: a.baseLineRtp, hs: a.hsRtp, coin: a.hsCoinRtp, jpCoin: a.hsJackpotCoinRtp, full: a.hsFullScreenRtp, total: a.totalRtp, buyEv: a.buyEv, avgHsEv: a.avgHsEv, pFull: a.fullScreenProbPerSpin, avgRespins: a.hsAvgRespins, avgK: a.hsAvgFinalK }, null, 1));
