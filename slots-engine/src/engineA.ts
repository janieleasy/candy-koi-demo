import type { Rng } from './rng.js';
import type { GameAConfig } from './config.js';
import {
  EngineError,
  type RoundStateA, type RoundSettlement, type FsSpinStepA, type BaseSpinStepA, type FsEnterStepA, type ScatterWin, type SymbolIdA, type Step, type StartRequest,
} from './types.js';
import { buildGrid, countSymbol, positionsOf, evalLines, sumWins, applyCap } from './core.js';
import { makeStepper, makePlayRound, checkStart, createState, type Advance, type EngineEx } from './engineCommon.js';

export function validateConfigA(cfg: GameAConfig): void {
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

export function createEngineA(cfg: GameAConfig): EngineEx {
  validateConfigA(cfg);

  const scatterOf = (grid: SymbolIdA[][], bet: number): { count: number; sw: ScatterWin | null } => {
    const count = countSymbol(grid, 'S' as SymbolIdA);
    const mult = cfg.scatterPay[String(count)];
    if (count >= 3 && mult) return { count, sw: { count, positions: positionsOf(grid, 'S' as SymbolIdA), payMult: mult, win: mult * bet } };
    return { count, sw: null };
  };
  const spinStops = (rng: Rng, strips: SymbolIdA[][]) => strips.map(s => rng.int(s.length));

  const settle = (round: Omit<RoundStateA, 'fs' | 'next'> & { fs?: RoundStateA['fs'] }, capped: boolean, entered: boolean, steps: number): RoundSettlement => ({
    roundId: round.roundId, game: 'A', mode: round.mode, bet: round.bet, cost: round.cost,
    totalWin: round.cumulativeWin, capped, baseWin: round.baseWin, featureWin: round.featureWin, steps,
    featureTriggered: entered,
    fsSpinsPlayed: entered ? round.fs!.played : 0,
    fsSpinsAwardedTotal: entered ? round.fs!.awarded : 0,
  });

  /** 推进一步。round 为可变对象(step() 传入的是克隆)。 */
  function advance(rng: Rng, seq: number, round: RoundStateA | null, req: StartRequest | { type: 'continue' }): Advance {
    if (req.type === 'start') {
      if (round) throw new EngineError('ROUND_IN_PROGRESS');
      checkStart(cfg, 'A', 20, req);
      const bet = req.bet, lineBet = bet / 20, maxWin = cfg.maxWinMult * bet;
      const buy = req.mode === 'buy';
      const cost = buy ? cfg.buy.priceMult * bet : bet;
      const roundSeq = seq + 1;
      const base = { roundId: String(roundSeq), game: 'A' as const, mode: req.mode, bet, cost, maxWin, cumulativeWin: 0, baseWin: 0, featureWin: 0, stepCount: 1 };
      if (buy) {
        const n = cfg.buy.initialSpins;
        const nr: RoundStateA = { ...base, next: 'A_fs_spin', fs: { source: 'buy', awarded: n, remaining: n, played: 0, ladderIndex: 0 } };
        const step: FsEnterStepA = { kind: 'A_fs_enter', index: 0, win: 0, cumulativeWin: 0, capped: false, roundEnded: false, next: 'A_fs_spin', source: 'buy', awarded: n };
        return { step, round: nr, roundSeq, charge: cost, settlement: null };
      }
      const stops = spinStops(rng, cfg.reels.base);
      const grid = buildGrid(cfg.reels.base, stops);
      const lineWins = evalLines(grid, cfg.paylines, { wild: 'W', paytable: cfg.paytable, lineBet });
      const lineTotal = sumWins(lineWins);
      const { count, sw } = scatterOf(grid, bet);
      const r = applyCap(0, lineTotal + (sw ? sw.win : 0), maxWin);
      const award = count >= 3 ? cfg.fs.award[String(count)] : 0;
      const enters = !!award && !r.capped;
      const step: BaseSpinStepA = {
        kind: 'A_base_spin', index: 0, win: r.win, cumulativeWin: r.cum, capped: r.capped,
        roundEnded: !enters, next: enters ? 'A_fs_enter' : null,
        stops, grid, lineWins, lineTotal, scatter: sw, trigger: award ? { freeSpins: award } : null,
      };
      const b = { ...base, cumulativeWin: r.cum, baseWin: r.win };
      if (enters) {
        const nr: RoundStateA = { ...b, next: 'A_fs_enter', fs: { source: 'scatter', awarded: award, remaining: award, played: 0, ladderIndex: 0 } };
        return { step, round: nr, roundSeq, charge: cost, settlement: null };
      }
      return { step, round: null, roundSeq, charge: cost, settlement: settle(b, r.capped, false, 1) };
    }

    // continue
    if (!round) throw new EngineError('NO_ACTIVE_ROUND');
    const fs = round.fs;
    if (round.next === 'A_fs_enter') {
      const index = round.stepCount++;
      round.next = 'A_fs_spin';
      const step: FsEnterStepA = { kind: 'A_fs_enter', index, win: 0, cumulativeWin: round.cumulativeWin, capped: false, roundEnded: false, next: 'A_fs_spin', source: fs.source, awarded: fs.awarded };
      return { step, round, roundSeq: seq, charge: 0, settlement: null };
    }
    if (round.next !== 'A_fs_spin' || fs.remaining <= 0) throw new EngineError('BAD_STATE', 'no free spins remaining');
    const bet = round.bet, lineBet = bet / 20;
    const remainingBefore = fs.remaining;
    fs.remaining -= 1;
    fs.played += 1;
    const stops = spinStops(rng, cfg.reels.fs);
    const grid = buildGrid(cfg.reels.fs, stops);
    const c = fs.ladderIndex;
    const m = cfg.fs.ladder[c];
    const lineWins = evalLines(grid, cfg.paylines, { wild: 'W', paytable: cfg.paytable, lineBet });
    const L = sumWins(lineWins);
    const { count, sw } = scatterOf(grid, bet);
    let retrigger: FsSpinStepA['retrigger'] = null;
    if (count >= 3) {
      const requested = cfg.fs.retrigger[String(count)];
      const added = Math.max(0, Math.min(requested, cfg.fs.maxTotal - fs.awarded));
      fs.awarded += added; fs.remaining += added;
      retrigger = { scatterCount: count, requested, added, totalAwarded: fs.awarded };
    }
    fs.ladderIndex = L > 0 ? Math.min(c + 1, cfg.fs.ladder.length - 1) : 0;
    const r = applyCap(round.cumulativeWin, L * m + (sw ? sw.win : 0), round.maxWin);
    const index = round.stepCount++;
    round.cumulativeWin = r.cum; round.featureWin += r.win;
    const ended = r.capped || fs.remaining <= 0;
    const step: FsSpinStepA = {
      kind: 'A_fs_spin', index, win: r.win, cumulativeWin: r.cum, capped: r.capped, roundEnded: ended, next: ended ? null : 'A_fs_spin',
      fsIndex: fs.played, remainingBefore, remainingAfter: fs.remaining,
      ladderIndex: c, multiplier: m, ladderAfter: fs.ladderIndex,
      stops, grid, lineWins, lineTotalRaw: L, lineTotalMultiplied: L * m, scatter: sw, retrigger,
    };
    if (ended) return { step, round: null, roundSeq: seq, charge: 0, settlement: settle(round, r.capped, true, round.stepCount) };
    return { step, round, roundSeq: seq, charge: 0, settlement: null };
  }

  return {
    game: 'A',
    config: cfg,
    createState: seed => createState('A', seed),
    step: makeStepper('A', advance as any),
    playRound: makePlayRound('A', advance as any),
  };
}
