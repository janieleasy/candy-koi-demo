import fs from 'node:fs';
import { analyzeA } from './analyticA.js';
import { PAYLINES_A } from './paylines.js';
const r = JSON.parse(fs.readFileSync(new URL('../config/reelsA.json', import.meta.url), 'utf8'));
const cfg: any = {
  paylines: PAYLINES_A, scatterPay: { '3': 2, '4': 10, '5': 50 }, reels: { base: r.base, fs: r.fs },
  paytable: { H1: [20, 100, 500], H2: [15, 60, 250], H3: [10, 40, 150], H4: [8, 30, 100], L1: [3, 12, 50], L2: [3, 12, 50], L3: [2, 8, 30], L4: [2, 8, 30], L5: [1, 5, 20] },
  fs: { award: { '3': 8, '4': 12, '5': 20 }, retrigger: { '3': 5, '4': 8, '5': 12 }, maxTotal: 60, ladder: [1, 2, 3, 5] },
};
const a = analyzeA(cfg);
const { baseDist, fsDist, ...rest } = a;
console.log(JSON.stringify(rest, null, 1));
console.log('buy price for RTP=total:', a.ev[8] / a.totalRtp);
