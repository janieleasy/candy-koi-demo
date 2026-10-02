// 参考实现(测试用):接口变更前的「整局 play()」原样保留,仅作为逐步引擎的回归基准,不属于对外接口。
import { Rng } from '../../src/rng.js';
import type { GameAConfig } from '../../src/config.js';
import type {
  Engine, EngineOptions, SpinRequest, SpinResult, Step, BaseSpinStepA, FsSpinStepA, ScatterWin, SymbolIdA,
} from './types_v01.js';
import { buildGrid, countSymbol, positionsOf, evalLines, sumWins, assertBet, applyCap } from '../../src/core.js';

export function validateConfigALegacy(cfg: GameAConfig): void {
  if (cfg.paylines.length !== 20) throw new Error('A: need 20 paylines');
  for (const b of cfg.betLevels) if (b % 20 !== 0) throw new Error(`A: bet ${b} not divisible by 20`);
  for (const set of ['base', 'fs'] as const) {
    const strips = cfg.reels[set];
    if (strips.length !== 5) throw new Error(`A: ${set} needs 5 strips`);
    strips.forEach((s, r) => {
      if (s.length < 3) throw new Error('strip too short');
      if ((r === 0 || r === 4) && s.includes('W')) throw new Error(`A: W on reel ${r + 1} (${set})`);
      const n = s.length;
      for (let i = 0; i < n; i++) {           // 任意相邻 3 位(循环)至多 1 个 S
        let c = 0; for (let k = 0; k < 3; k++) if (s[(i + k) % n] === 'S') c++;
        if (c > 1) throw new Error(`A: S spacing violated on ${set} reel ${r + 1} at ${i}`);
      }
    });
  }
  const sr = (strips: SymbolIdA[][]) => strips.reduce((a, s) => a + s.filter(x => x === 'S').length / s.length, 0);
  if (sr(cfg.reels.fs) > sr(cfg.reels.base) + 1e-12) throw new Error('A: FS scatter ratio must not exceed BASE');
  const order = ['H1', 'H2', 'H3', 'H4', 'L1', 'L2', 'L3', 'L4', 'L5'];
  for (const k of order) {
    const p = cfg.paytable[k];
    if (!(p[0] < p[1] && p[1] < p[2])) throw new Error(`A: paytable ${k} not strictly increasing`);
    for (const v of p) if (!Number.isInteger(v)) throw new Error('A: non-integer pay');
  }
  for (let i = 1; i < order.length; i++)
    for (let j = 0; j < 3; j++)
      if (cfg.paytable[order[i - 1]][j] < cfg.paytable[order[i]][j]) throw new Error(`A: paytable inversion ${order[i - 1]}/${order[i]}`);
}

export function createLegacyA(cfg: GameAConfig, opts: EngineOptions): Engine {
  validateConfigALegacy(cfg);
  const rng = new Rng(opts.seed);
  const seedStr = String(opts.seed);
  const [M0] = cfg.fs.ladder;
  void M0;

  const scatterOf = (grid: SymbolIdA[][], bet: number): { count: number; sw: ScatterWin | null } => {
    const count = countSymbol(grid, 'S' as SymbolIdA);
    const mult = cfg.scatterPay[String(count)];
    if (count >= 3 && mult) return { count, sw: { count, positions: positionsOf(grid, 'S' as SymbolIdA), payMult: mult, win: mult * bet } };
    return { count, sw: null };
  };
  const spinStops = (strips: SymbolIdA[][]) => strips.map(s => rng.int(s.length));

  function play(req: SpinRequest): SpinResult {
    if (req.game !== 'A') throw new Error('engine is game A');
    assertBet(req.bet, cfg.betLevels, 20);
    if (req.mode === 'buy' && !cfg.buy.enabled) throw new Error('buy feature disabled');
    if (req.mode !== 'buy' && req.mode !== 'normal') throw new Error('invalid mode');
    const bet = req.bet, lineBet = bet / 20, maxWin = cfg.maxWinMult * bet;
    const stateBefore = rng.getState();
    const steps: Step[] = [];
    let cum = 0, capped = false, baseWin = 0, featureWin = 0;
    let awardedTotal = 0, fsPlayed = 0, featureTriggered = false;
    let startFs = 0;
    const cost = req.mode === 'buy' ? cfg.buy.priceMult * bet : bet;

    if (req.mode === 'normal') {
      const stops = spinStops(cfg.reels.base);
      const grid = buildGrid(cfg.reels.base, stops);
      const lineWins = evalLines(grid, cfg.paylines, { wild: 'W', paytable: cfg.paytable, lineBet });
      const lineTotal = sumWins(lineWins);
      const { count, sw } = scatterOf(grid, bet);
      const raw = lineTotal + (sw ? sw.win : 0);
      const r = applyCap(cum, raw, maxWin);
      cum = r.cum; capped = r.capped; baseWin = r.win;
      const award = count >= 3 ? cfg.fs.award[String(count)] : 0;
      const step: BaseSpinStepA = {
        kind: 'A_base_spin', index: 0, win: r.win, cumulativeWin: cum, capped,
        stops, grid, lineWins, lineTotal, scatter: sw, trigger: award ? { freeSpins: award } : null,
      };
      steps.push(step);
      if (award && !capped) startFs = award;
    } else {
      startFs = cfg.buy.initialSpins;
    }

    if (startFs > 0) {
      featureTriggered = true;
      awardedTotal = startFs;
      let remaining = startFs, c = 0;
      while (remaining > 0 && !capped) {
        const remainingBefore = remaining;
        remaining -= 1;
        fsPlayed += 1;
        const stops = spinStops(cfg.reels.fs);
        const grid = buildGrid(cfg.reels.fs, stops);
        const m = cfg.fs.ladder[c];
        const lineWins = evalLines(grid, cfg.paylines, { wild: 'W', paytable: cfg.paytable, lineBet });
        const L = sumWins(lineWins);
        const { count, sw } = scatterOf(grid, bet);
        let retrigger: FsSpinStepA['retrigger'] = null;
        if (count >= 3) {
          const requested = cfg.fs.retrigger[String(count)];
          const added = Math.max(0, Math.min(requested, cfg.fs.maxTotal - awardedTotal));
          awardedTotal += added; remaining += added;
          retrigger = { scatterCount: count, requested, added, totalAwarded: awardedTotal };
        }
        const cBefore = c;
        c = L > 0 ? Math.min(c + 1, cfg.fs.ladder.length - 1) : 0;
        const raw = L * m + (sw ? sw.win : 0);
        const r = applyCap(cum, raw, maxWin);
        cum = r.cum; capped = r.capped; featureWin += r.win;
        const step: FsSpinStepA = {
          kind: 'A_fs_spin', index: steps.length, win: r.win, cumulativeWin: cum, capped,
          fsIndex: fsPlayed, remainingBefore, remainingAfter: remaining,
          ladderIndex: cBefore, multiplier: m, ladderAfter: c,
          stops, grid, lineWins, lineTotalRaw: L, lineTotalMultiplied: L * m, scatter: sw, retrigger,
        };
        steps.push(step);
      }
    }

    return {
      game: 'A', mode: req.mode, bet, cost, steps, totalWin: cum, capped, maxWin,
      summary: {
        baseWin, featureWin, featureTriggered,
        fsSpinsPlayed: fsPlayed, fsSpinsAwardedTotal: awardedTotal,
      },
      rng: { seed: seedStr, stateBefore, stateAfter: rng.getState() },
    };
  }

  return { play, getRngState: () => rng.getState(), setRngState: s => rng.setState(s), config: cfg };
}
