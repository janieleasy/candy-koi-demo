import type { AppViewConfig } from '../viewTypes';

/** 玩法 B《金鲤满仓》展示配置。C 的币面按 coinFrames 选择,数字由 SymbolView 叠加。 */
export const viewB: AppViewConfig = {
  id: 'B',
  title: '金鲤满仓',
  background: { base: 'background-base', feature: 'background-hs' },
  symbols: {
    H1: { frame: 'H1_koi' }, H2: { frame: 'H2_lantern' }, H3: { frame: 'H3_lotus' },
    L1: { frame: 'L1_A' }, L2: { frame: 'L2_K' }, L3: { frame: 'L3_Q' }, L4: { frame: 'L4_J' },
  },
  coinFrames: {
    base: 'C_coin_base', multLow: 'C_coin_mult_low', multMid: 'C_coin_mult_mid', multHigh: 'C_coin_mult_high',
    jp: { Mini: 'C_coin_jp_mini', Minor: 'C_coin_jp_minor', Major: 'C_coin_jp_major', Grand: 'C_coin_jp_grand' },
  },
  reel: {
    cols: 5, rows: 3,
    cell: { w: 190, h: 190, gapX: 14, gapY: 25 },
    symbolSize: 165,
    spinSpeed: 3400,
    stopStaggerMs: 260,
    easing: 'backOut',
    turboFactor: 0.45,
  },
  bigWin: [
    { minMult: 20, tier: 'big', showcase: 'candy-big' },
    { minMult: 50, tier: 'mega', showcase: 'candy-mega' },
    { minMult: 100, tier: 'epic', showcase: 'candy-epic' },
    { minMult: 1000, tier: 'max', showcase: 'candy-max' },
  ],
  audio: {},
  idleGrid: [['L1', 'H2', 'L3'], ['H1', 'C', 'L2'], ['L4', 'H3', 'L1'], ['H2', 'L3', 'C'], ['C', 'L4', 'H1']],
  band: 'jackpot',
  jackpotTiers: ['Grand', 'Major', 'Minor', 'Mini'],
};
