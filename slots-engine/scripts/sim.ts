/**
 * 蒙特卡洛模拟(走真实引擎 playRound 路径 = 循环 step 到整局结束)。
 * 用法: node --import tsx scripts/sim.ts <A|B> <normal|buy> <spinsPerShard> <batches> <seed> <out.json>
 *  - 一个 shard = 一个 seed、spinsPerShard 局,分成 batches 批;每批的 (n,cost,win) 单独记录,用于分批估计标准误。
 *  - 每批结束都会把当前累计结果写盘(中间结果落盘,可随时 merge)。
 *  - 固定投注 bet=100(A 能被 20 整除、B 能被 10 整除、币值/线投注均为整数)。
 * 多 shard 并行与合并见 scripts/runSim.sh、scripts/merge.ts。
 */
import fs from 'node:fs';
import { createEngine } from '../src/index.js';
import { configA } from '../config/gameA.js';
import { configB } from '../config/gameB.js';

const [gameArg, modeArg, spinsArg, batchesArg, seedArg, outArg] = process.argv.slice(2);
const game = (gameArg ?? 'A') as 'A' | 'B';
const mode = (modeArg ?? 'normal') as 'normal' | 'buy';
const spins = Number(spinsArg ?? 1e6), nBatches = Number(batchesArg ?? 20);
const seed = seedArg ?? 'sim', out = outArg;
const cfg: any = game === 'A' ? configA : configB;
const BET = 100;
const TIERS = ['Mini', 'Minor', 'Major', 'Grand'] as const;
// 赢额分布(倍总投注):0 | (0,1) | [1,5) | [5,20) | [20,100) | [100,1000] | >1000
const bucketOf = (x: number) => x === 0 ? 0 : x < 1 ? 1 : x < 5 ? 2 : x < 20 ? 3 : x < 100 ? 4 : x <= 1000 ? 5 : 6;

const z = (n: number) => new Array(n).fill(0) as number[];
const acc = {
  n: 0, cost: 0, win: 0, sumSq: 0, caps: 0, maxWin: 0, zero: 0, buckets: z(7), bucketWin: z(7),
  baseWin: 0, featWin: 0, hits: 0, triggers: 0, featSq: 0, featMax: 0, capLoss: 0,
  // A
  baseLine: 0, baseScatter: 0, fsLine: 0, fsScatter: 0, trigBy: z(6),
  fsSpins: 0, fsAwarded: 0, fsRoundsRetrig: 0, retrigEvents: 0, fsReached60: 0, fsTruncEvents: 0, fsMaxPlayed: 0,
  ladderUse: z(4), ladderLineWin: z(4), fsSpinHits: 0, fsPlayedHist: z(61),
  // B
  hsCoin: 0, jpWin: z(4), jpCoins: z(4), jpRounds: z(4), fullScreen: 0, fullScreenWin: 0, hsK: 0, hsKHist: z(16), startKHist: z(16), hsRespins: 0, hsCoinsMult: 0,
};
const batches: { n: number; cost: number; win: number }[] = [];

const engine = createEngine(cfg);
let state = engine.createState(seed);
const per = Math.floor(spins / nBatches);
const flush = () => { if (out) fs.writeFileSync(out, JSON.stringify({ meta: { game, mode, seed, spins: acc.n, spinsPerShard: spins, nBatches, bet: BET, version: cfg.version, configHash: undefined }, acc, batches })); };

for (let b = 0; b < nBatches; b++) {
  let bn = 0, bc = 0, bw = 0;
  for (let i = 0; i < per; i++) {
    const r = engine.playRound(state, { type: 'start', game, bet: BET, mode });
    state = r.state;
    const s = r.settlement, tw = s.totalWin;
    acc.n++; bn++; acc.cost += s.cost; bc += s.cost; acc.win += tw; bw += tw;
    const x = tw / BET; acc.sumSq += x * x;
    acc.baseWin += s.baseWin; acc.featWin += s.featureWin;
    if (s.capped) acc.caps++;
    if (x > acc.maxWin) acc.maxWin = x;
    if (tw === 0) acc.zero++;
    const bk = bucketOf(x); acc.buckets[bk]++; acc.bucketWin[bk] += tw;
    if (s.featureTriggered) {
      acc.triggers++;
      const fw = s.featureWin / BET; acc.featSq += fw * fw; if (fw > acc.featMax) acc.featMax = fw;
    }
    for (const st of r.steps as any[]) {
      switch (st.kind) {
        case 'A_base_spin': {
          const sc = st.scatter ? st.scatter.win : 0, raw = st.lineTotal + sc;
          acc.baseLine += st.lineTotal; acc.baseScatter += sc; acc.capLoss += raw - st.win;
          if (st.lineTotal > 0 || sc > 0) acc.hits++;
          if (st.scatter || st.trigger) { /* trigger count by S */ }
          if (st.trigger) acc.trigBy[st.trigger.freeSpins === 8 ? 3 : st.trigger.freeSpins === 12 ? 4 : 5]++;
          break;
        }
        case 'A_fs_spin': {
          const sc = st.scatter ? st.scatter.win : 0, raw = st.lineTotalMultiplied + sc;
          acc.fsLine += st.lineTotalMultiplied; acc.fsScatter += sc; acc.capLoss += raw - st.win;
          acc.ladderUse[st.ladderIndex]++; acc.ladderLineWin[st.ladderIndex] += st.lineTotalMultiplied;
          if (st.lineTotalRaw > 0) acc.fsSpinHits++;
          if (st.retrigger) { acc.retrigEvents++; if (st.retrigger.added < st.retrigger.requested) acc.fsTruncEvents++; }
          break;
        }
        case 'B_base_spin': {
          acc.baseLine += st.lineTotal; acc.capLoss += st.lineTotal - st.win;
          if (st.lineTotal > 0) acc.hits++;
          if (st.trigger) acc.startKHist[st.trigger.startCoins]++;
          break;
        }
        case 'B_hs_settle': {
          for (const p of st.payouts) {
            if (p.jackpot) { const t = TIERS.indexOf(p.jackpot); acc.jpWin[t] += p.win; acc.jpCoins[t]++; } else { acc.hsCoin += p.win; acc.hsCoinsMult++; }
          }
          const seen = new Set<string>(); for (const p of st.payouts) if (p.jackpot) seen.add(p.jackpot);
          for (const t of seen) acc.jpRounds[TIERS.indexOf(t as any)]++;
          if (st.fullScreenBonus) { acc.fullScreen++; acc.fullScreenWin += st.fullScreenBonus.win; }
          acc.capLoss += st.rawTotal - st.win;
          break;
        }
      }
    }
    if (game === 'A' && s.featureTriggered) {
      acc.fsSpins += s.fsSpinsPlayed!; acc.fsAwarded += s.fsSpinsAwardedTotal!;
      acc.fsPlayedHist[Math.min(60, s.fsSpinsPlayed!)]++;
      if (s.fsSpinsAwardedTotal! >= 60) acc.fsReached60++;
      if (s.fsSpinsAwardedTotal! > (r.steps.find((q: any) => q.kind === 'A_fs_enter') as any).awarded) acc.fsRoundsRetrig++;
      if (s.fsSpinsPlayed! > acc.fsMaxPlayed) acc.fsMaxPlayed = s.fsSpinsPlayed!;
    }
    if (game === 'B' && s.featureTriggered) { acc.hsK += s.hsFinalK!; acc.hsKHist[s.hsFinalK!]++; acc.hsRespins += s.hsRespins!; }
  }
  batches.push({ n: bn, cost: bc, win: bw });
  flush();
}
flush();
if (!out) console.log(JSON.stringify({ acc, batches }));
