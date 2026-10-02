/** 解析(精确枚举 + 马尔可夫/DP)RTP,不含上限截断;用于与模拟交叉检验。输出 sim/analytic.json */
import fs from 'node:fs';
import { configA } from '../config/gameA.js';
import { configB } from '../config/gameB.js';
import { analyzeA } from './analyticA.js';
import { analyzeB } from './analyticB.js';
const a = analyzeA(configA as any); const { baseDist, fsDist, ...ra } = a;
const b = analyzeB(configB as any);
const out = {
  A: { ...ra, buyPriceForEqualRtp: a.ev[configA.buy.initialSpins] / a.totalRtp, buyRtpAtConfiguredPrice: a.ev[configA.buy.initialSpins] / configA.buy.priceMult, configuredPrice: configA.buy.priceMult },
  B: { ...b, buyPriceForEqualRtp: b.buyEv / b.totalRtp, buyRtpAtConfiguredPrice: b.buyEv / configB.buy.priceMult, configuredPrice: configB.buy.priceMult },
};
fs.writeFileSync(new URL('../sim/analytic.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
