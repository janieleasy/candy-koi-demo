import type { AppViewConfig } from '../viewTypes';

/** 玩法 A《糖果锦鲤池》展示配置(与数学配置分开)。frame 名 = symbols-sheet.json 的键。 */
export const viewA: AppViewConfig = {
  id: 'A',
  title: '糖果锦鲤池',
  background: { base: 'background-base', feature: 'background-fs' },
  symbols: {
    H1: { frame: 'H1_koi' }, H2: { frame: 'H2_lantern' }, H3: { frame: 'H3_lotus' }, H4: { frame: 'H4_ingot' },
    L1: { frame: 'L1_A' }, L2: { frame: 'L2_K' }, L3: { frame: 'L3_Q' }, L4: { frame: 'L4_J' }, L5: { frame: 'L5_10' },
    W: { frame: 'W_pearl', winScale: 1.12 }, S: { frame: 'S_gate', winScale: 1.14 },
  },
  reel: {
    cols: 5, rows: 3,
    cell: { w: 190, h: 190, gapX: 14, gapY: 25 },
    symbolSize: 165,
    spinSpeed: 3400,
    stopStaggerMs: 280,
    easing: 'backOut',
    turboFactor: 0.45,
    anticipation: { symbol: 'S', minCount: 2 },
  },
  // 阈值为占位值,待策划确认;showcase = 糖果甜心 three.js 演出(candy-*,epic/max 共用 Super 美术,max 为变体);default-big 仅作回退
  bigWin: [
    { minMult: 20, tier: 'big', showcase: 'candy-big' },
    { minMult: 50, tier: 'mega', showcase: 'candy-mega' },
    { minMult: 100, tier: 'epic', showcase: 'candy-epic' },
    { minMult: 500, tier: 'max', showcase: 'candy-max' },
  ],
  audio: {},
  idleGrid: [['L1', 'H2', 'L3'], ['H1', 'L4', 'H3'], ['L2', 'W', 'H4'], ['H3', 'L5', 'H1'], ['L4', 'H2', 'L1']],
  band: 'fs',
};
