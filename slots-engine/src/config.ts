import type { SymbolIdA, SymbolIdB } from './types.js';

export type PayRow = [number, number, number]; // 3连/4连/5连(线投注倍数)

export interface GameAConfig {
  game: 'A';
  version: string;
  betLevels: number[];                      // 每个必须能被 20 整除
  paylines: number[][];                     // [20][5],行号 0-based(0=上)
  paytable: Record<string, PayRow>;         // H1..L5
  scatterPay: Record<string, number>;       // {"3":2,"4":10,"5":50},总投注倍数
  reels: { base: SymbolIdA[][]; fs: SymbolIdA[][] }; // 各 5 条轴带
  fs: {
    award: Record<string, number>;          // S 数量 -> 初始次数
    retrigger: Record<string, number>;      // S 数量 -> 追加次数
    maxTotal: number;                       // 60
    ladder: number[];                       // [1,2,3,5]
  };
  maxWinMult: number;                       // 5000
  buy: { enabled: boolean; priceMult: number; initialSpins: number; disclaimer: string };
}

export interface GameBConfig {
  game: 'B';
  version: string;
  betLevels: number[];                      // 每个必须能被 10 整除
  paylines: number[][];                     // [10][5]
  paytable: Record<string, PayRow>;         // H1..L4
  reels: { base: SymbolIdB[][] };           // 5 条轴带,含 'C'
  coin: {
    values: number[];                       // 倍数币集合(整数)
    startWeights: number[];                 // 基础游戏起始 C / 购买起始 C 的权重
    respinWeights: number[];                // H&S 内新 C 的权重
    jackpotProb: number;                    // q:H&S 内每个新 C 成为 Jackpot 币的概率
    jackpotWeights: Record<'Mini' | 'Minor' | 'Major' | 'Grand', number>;
  };
  jackpotMult: Record<'Mini' | 'Minor' | 'Major' | 'Grand', number>;
  fullScreenMult: number;                   // 满屏额外 Grand 奖励倍数(=Grand)
  triggerMin: number;                       // 6
  respins: number;                          // 3
  pRespin: number[];                        // 下标 i 对应 K = 6 + i (K=6..14)
  maxWinMult: number;                       // 10000
  buy: { enabled: boolean; priceMult: number; startCoins: number; disclaimer: string };
}

export type EngineConfig = GameAConfig | GameBConfig;
