/**
 * 合并 sim/raw 里同一 (game, mode, seedPrefix) 的所有 shard,输出汇总 JSON。
 * 用法: node --import tsx scripts/merge.ts <A|B> <normal|buy> <seedPrefix> [out.json]
 * RTP 标准误 = 分批估计:把全部批次(每批等量局数)的批 RTP 当作独立样本,SE = sd(批RTP)/sqrt(批数);
 * 同时给出由每局赢额方差得到的解析 SE(sd/sqrt(n)/成本倍数)作交叉检验。
 */
import fs from 'node:fs';
import path from 'node:path';

const [game, mode, prefix, outArg] = process.argv.slice(2);
const dir = new URL('../sim/raw/', import.meta.url).pathname;
const files = fs.readdirSync(dir).filter(f => f.startsWith(`${game}_${mode}_${prefix}_`) && f.endsWith('.json')).sort();
if (!files.length) throw new Error('no shards');
const parts = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const A: any = JSON.parse(JSON.stringify(parts[0].acc));
const MAXKEYS = ['maxWin', 'featMax', 'fsMaxPlayed'];
const add = (a: any, b: any, key = '') => {
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'number') { if (MAXKEYS.includes(k)) a[k] = Math.max(a[k], b[k]); else a[k] += b[k]; }
    else if (Array.isArray(a[k])) a[k] = a[k].map((v: number, i: number) => v + b[k][i]);
  }
};
for (let i = 1; i < parts.length; i++) add(A, parts[i].acc);
const batches = parts.flatMap(p => p.batches) as { n: number; cost: number; win: number }[];
const meta = parts[0].meta;
const bet = meta.bet, n = A.n, cost = A.cost;
const costMult = cost / n / bet;
const rtp = A.win / cost;
const br = batches.map(b => b.win / b.cost);
const bm = br.reduce((a, b) => a + b, 0) / br.length;
const bsd = Math.sqrt(br.reduce((a, b) => a + (b - bm) ** 2, 0) / (br.length - 1));
const se = bsd / Math.sqrt(br.length);
const meanX = A.win / bet / n, varX = A.sumSq / n - meanX * meanX, sd = Math.sqrt(varX);
const seAnalytic = sd / costMult / Math.sqrt(n);
const C = cost; // 分量占比分母 = 总成本
const sh = (v: number) => v / C;
const TIERS = ['Mini', 'Minor', 'Major', 'Grand'];
const res: any = {
  meta: { game, mode, seedPrefix: prefix, shards: files.length, seeds: parts.map(p => p.meta.seed), spins: n, batches: batches.length, batchSize: batches[0].n, configVersion: meta.version, bet },
  rtp, rtpSE_batch: se, rtpCI95: [rtp - 1.96 * se, rtp + 1.96 * se], rtpSE_analytic: seAnalytic, rtpCI95_analytic: [rtp - 1.96 * seAnalytic, rtp + 1.96 * seAnalytic],
  costMult, stdDevPerBet: sd, stdDevPerCost: sd / costMult, volatilityIndex95: 1.96 * sd / costMult,
  baseRtp: sh(A.baseWin), featureRtp: sh(A.featWin),
  hitRate: A.hits / n, zeroRate: A.zero / n,
  triggerCount: A.triggers, triggerRate: A.triggers / n, oneInTrigger: A.triggers ? n / A.triggers : null,
  maxWinMult: A.maxWin, cappedRounds: A.caps, cappedRate: A.caps / n, cappedOneIn: A.caps ? n / A.caps : null,
  capLossRtp: sh(A.capLoss),
  distribution: ['0', '(0,1)x', '[1,5)x', '[5,20)x', '[20,100)x', '[100,1000]x', '>1000x'].map((label, i) => ({ label, count: A.buckets[i], freq: A.buckets[i] / n, rtpShare: sh(A.bucketWin[i]) })),
  avgFeatureWinMult: A.triggers ? A.featWin / bet / A.triggers : null,
  featureStdDev: A.triggers ? Math.sqrt(A.featSq / A.triggers - (A.featWin / bet / A.triggers) ** 2) : null, featureWinMax: A.featMax,
};
if (game === 'A') {
  Object.assign(res, {
    baseLineRtp: sh(A.baseLine), baseScatterRtp: sh(A.baseScatter), fsLineRtp: sh(A.fsLine), fsScatterRtp: sh(A.fsScatter),
    triggerBySCount: { 3: A.trigBy[3], 4: A.trigBy[4], 5: A.trigBy[5] },
    fsAvgPlayedPerTrigger: A.triggers ? A.fsSpins / A.triggers : null, fsAvgAwardedPerTrigger: A.triggers ? A.fsAwarded / A.triggers : null,
    fsRoundsWithRetrigger: A.fsRoundsRetrig, fsRetriggerRateOfFs: A.triggers ? A.fsRoundsRetrig / A.triggers : null, retriggerEvents: A.retrigEvents,
    fsReached60: A.fsReached60, fsReached60RateOfFs: A.triggers ? A.fsReached60 / A.triggers : null, fsReached60Rate: A.fsReached60 / n,
    fsTruncatedEvents: A.fsTruncEvents, fsMaxPlayed: A.fsMaxPlayed,
    fsSpinLineHitRate: A.ladderUse.reduce((a: number, b: number) => a + b, 0) ? A.fsSpinHits / A.ladderUse.reduce((a: number, b: number) => a + b, 0) : null,
    ladder: A.ladderUse.map((u: number, c: number) => ({ c, uses: u, freq: u / A.ladderUse.reduce((x: number, y: number) => x + y, 0), lineRtp: sh(A.ladderLineWin[c]) })),
  });
} else {
  Object.assign(res, {
    baseLineRtp: sh(A.baseLine), hsRtp: sh(A.featWin),
    hsCoinRtp: sh(A.hsCoin), jackpotCoinRtp: Object.fromEntries(TIERS.map((t, i) => [t, sh(A.jpWin[i])])),
    jackpotCoinRtpTotal: sh(A.jpWin.reduce((a: number, b: number) => a + b, 0)), fullScreenRtp: sh(A.fullScreenWin),
    jackpotRtpTotalInclFullScreen: sh(A.jpWin.reduce((a: number, b: number) => a + b, 0) + A.fullScreenWin),
    jackpotCoinCount: Object.fromEntries(TIERS.map((t, i) => [t, A.jpCoins[i]])), jackpotRoundCount: Object.fromEntries(TIERS.map((t, i) => [t, A.jpRounds[i]])),
    jackpotRoundOneIn: Object.fromEntries(TIERS.map((t, i) => [t, A.jpRounds[i] ? n / A.jpRounds[i] : null])),
    fullScreenCount: A.fullScreen, fullScreenOneIn: A.fullScreen ? n / A.fullScreen : null, fullScreenRateOfHs: A.triggers ? A.fullScreen / A.triggers : null,
    hsAvgFinalK: A.triggers ? A.hsK / A.triggers : null, hsAvgRespins: A.triggers ? A.hsRespins / A.triggers : null, hsKHist: A.hsKHist, startKHist: A.startKHist,
  });
}
const out = outArg ?? new URL(`../sim/summary_${game}_${mode}_${prefix}.json`, import.meta.url).pathname;
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
