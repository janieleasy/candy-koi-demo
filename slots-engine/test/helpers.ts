import type { GameAConfig, GameBConfig } from '../src/config.js';
import { PAYLINES_A, PAYLINES_B } from '../scripts/paylines.js';

export const PAY_A: GameAConfig['paytable'] = {
  H1: [20, 100, 500], H2: [15, 60, 250], H3: [10, 40, 150], H4: [8, 30, 100],
  L1: [3, 12, 50], L2: [3, 12, 50], L3: [2, 8, 30], L4: [2, 8, 30], L5: [1, 5, 20],
};
export const PAY_B: GameBConfig['paytable'] = {
  H1: [25, 100, 400], H2: [15, 60, 200], H3: [10, 40, 120], L1: [4, 15, 50], L2: [4, 15, 50], L3: [3, 10, 30], L4: [3, 10, 30],
};

/** 测试用 A 配置:轴带可注入,用于构造确定性场景 */
export function cfgA(base: string[][], fs: string[][], over: Partial<GameAConfig> = {}): GameAConfig {
  return {
    game: 'A', version: 'test', betLevels: [20, 40, 100, 200], paylines: PAYLINES_A, paytable: PAY_A,
    scatterPay: { '3': 2, '4': 10, '5': 50 },
    reels: { base: base as any, fs: fs as any },
    fs: { award: { '3': 8, '4': 12, '5': 20 }, retrigger: { '3': 5, '4': 8, '5': 12 }, maxTotal: 60, ladder: [1, 2, 3, 5] },
    maxWinMult: 5000, buy: { enabled: true, priceMult: 75, initialSpins: 8, disclaimer: 'x' }, ...over,
  };
}
export const rep = (strip: string[]) => [0, 1, 2, 3, 4].map(() => strip.slice());
/** 长度 3、含一个 S:任意停位下每轴窗口恰有 1 个 S(行随停位变化) */
export const allS = () => ['L1', 'L2', 'L3', 'L4', 'L5'].map(f => ['S', f, f]); // 每轴窗口恒有 1 个 S,填充各轴不同 -> 永不连线
export const noWin = [['L1', 'L1', 'L1'], ['L2', 'L2', 'L2'], ['L3', 'L3', 'L3'], ['L4', 'L4', 'L4'], ['L5', 'L5', 'L5']]; // 每轴单一图案且各不相同:永不连线

export function cfgB(base: string[][], over: Partial<GameBConfig> = {}): GameBConfig {
  return {
    game: 'B', version: 'test', betLevels: [10, 20, 100], paylines: PAYLINES_B, paytable: PAY_B,
    reels: { base: base as any },
    coin: {
      values: [1, 2, 3, 5, 8, 10, 15, 25, 50], startWeights: [30, 25, 15, 12, 8, 5, 3, 1, 1], respinWeights: [25, 25, 15, 12, 10, 7, 4, 1, 1],
      jackpotProb: 0.05, jackpotWeights: { Mini: 70, Minor: 22, Major: 7, Grand: 1 },
    },
    jackpotMult: { Mini: 10, Minor: 25, Major: 100, Grand: 1000 }, fullScreenMult: 1000, triggerMin: 6, respins: 3,
    pRespin: [0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06, 0.04], maxWinMult: 10000,
    buy: { enabled: true, priceMult: 60, startCoins: 6, disclaimer: 'x' }, ...over,
  };
}

// ───────── 兼容适配:把「逐步引擎」按旧的整局 play() 形态呈现,供沿用的场景测试使用 ─────────
import { createEngineA } from '../src/engineA.js';
import { createEngineB } from '../src/engineB.js';
import type { EngineState, Step } from '../src/types.js';

/** 整局视图:steps 去掉 A_fs_enter 过场(旧 play() 没有该步),其余与 playRound 一致 */
export function wrapEngine(engine: any, seed: string | number) {
  let state: EngineState = engine.createState(seed);
  const seedStr = String(seed);
  return {
    get state() { return state; },
    play(req: { game: 'A' | 'B'; bet: number; mode: 'normal' | 'buy' }) {
      const before = state.rng;
      const r = engine.playRound(state, { type: 'start', ...req });
      state = r.state;
      const s = r.settlement;
      return {
        game: s.game, mode: s.mode, bet: s.bet, cost: s.cost, totalWin: s.totalWin, capped: s.capped,
        maxWin: s.totalWin >= 0 ? (engine.config as any).maxWinMult * s.bet : 0,
        steps: r.steps.filter((x: any) => x.kind !== "A_fs_enter") as Step[],
        allSteps: r.steps,
        summary: s,
        rng: { seed: seedStr, stateBefore: before, stateAfter: r.state.rng },
      };
    },
    getRngState: () => state.rng,
    setRngState(h: string) { state = { ...state, rng: h }; },
  };
}
export const engA = (cfg: GameAConfig, seed: string | number) => wrapEngine(createEngineA(cfg), seed);
export const engB = (cfg: GameBConfig, seed: string | number) => wrapEngine(createEngineB(cfg), seed);
