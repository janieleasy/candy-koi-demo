import type { GameBConfig } from '../src/config.js';
import { PAYLINES_B } from '../scripts/paylines.js';

/**
 * 玩法 B《金鲤满仓》H&S 配置(校准产物,见 report/RTP_report.md)。
 * 基础轴带由 scripts/calibrateB.ts 退火得到;币值权重 / p(K) / q 由 scripts/tuneB.ts 得到。
 */
export const configB: GameBConfig = {
  game: 'B',
  version: '1.1-math-r1',
  betLevels: [10, 20, 50, 100, 200, 500],
  paylines: PAYLINES_B,
  paytable: {
    H1: [25, 100, 400], H2: [15, 60, 200], H3: [10, 40, 120],
    L1: [4, 15, 50], L2: [4, 15, 50], L3: [3, 10, 30], L4: [3, 10, 30],
  },
  reels: { base: [["H3", "H1", "L2", "H1", "L4", "L1", "L3", "H1", "L1", "L3", "L1", "L1", "C", "H1", "L2", "L4", "L1", "H1", "H1", "L2", "L4", "H1", "C", "L3", "C", "C", "L1", "L3", "L4", "H3", "H3", "L1", "L3", "L1"], ["C", "H1", "L1", "H3", "L4", "L1", "C", "L2", "H3", "L3", "H1", "L3", "H1", "H1", "L3", "C", "L1", "C", "H1", "L3", "L4", "L3", "H3", "L1", "L4", "H2", "L1", "H3", "L3", "H1", "L3", "L4", "L3", "C"], ["L4", "H1", "L3", "H3", "H1", "L1", "L4", "L3", "L4", "C", "H1", "L1", "L1", "L1", "L3", "L1", "L3", "C", "C", "L1", "L1", "L3", "H3", "L1", "C", "H1", "L1", "L3", "H2", "H1", "L3", "L1", "C", "L3"], ["L4", "H2", "L3", "L3", "H1", "L3", "C", "H3", "H1", "H1", "H2", "C", "L4", "L2", "L2", "L4", "H3", "C", "H3", "H2", "L2", "L3", "H1", "H1", "L3", "L1", "L2", "L2", "L3", "C", "L2", "L4", "L4", "H3"], ["C", "H3", "L4", "L4", "H3", "H1", "L3", "H2", "L3", "H3", "L4", "L4", "C", "L4", "H1", "H1", "H1", "H1", "H2", "C", "L4", "H3", "H3", "H3", "H1", "L1", "C", "L4", "H2", "H2", "C", "L1", "H2", "L4"]] as any },
  coin: {
    values: [1, 2, 3, 5, 8, 10, 15, 25, 50],
    startWeights: [1000, 623, 472, 333, 241, 207, 157, 111, 69],
    respinWeights: [1000, 798, 699, 591, 507, 472, 413, 350, 279],
    jackpotProb: 0.026,
    jackpotWeights: { Mini: 60, Minor: 28, Major: 10, Grand: 2 },
  },
  jackpotMult: { Mini: 10, Minor: 25, Major: 100, Grand: 1000 },
  fullScreenMult: 1000,
  triggerMin: 6,
  respins: 3,
  // 下标 i 对应 K = 6 + i(K=6..14)
  pRespin: [0.1808, 0.1406, 0.1093, 0.085, 0.0661, 0.0514, 0.04, 0.0311, 0.0242],
  maxWinMult: 10000,
  buy: {
    enabled: true,
    priceMult: 85,
    startCoins: 6,
    disclaimer: '购买功能仅为演示。在部分真钱市场该功能可能不被允许。',
  },
};
