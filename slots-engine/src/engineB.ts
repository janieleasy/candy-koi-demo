import { Rng, WeightedTable } from './rng.js';
import type { GameBConfig } from './config.js';
import {
  EngineError,
  type RoundStateB, type RoundSettlement, type BaseSpinStepB, type HsEnterStep, type HsRespinStep, type HsSettleStep,
  type Coin, type CoinValue, type Pos, type StartRequest, type JackpotTier,
} from './types.js';
import { buildGrid, evalLines, sumWins, applyCap } from './core.js';
import { makeStepper, makePlayRound, checkStart, createState, type Advance, type EngineEx } from './engineCommon.js';

type Tier = JackpotTier;
const TIERS: Tier[] = ['Mini', 'Minor', 'Major', 'Grand'];

export function validateConfigB(cfg: GameBConfig): void {
  if (cfg.paylines.length !== 10) throw new Error('B: need 10 paylines');
  for (const b of cfg.betLevels) if (b % 10 !== 0) throw new Error(`B: bet ${b} not divisible by 10`);
  if (cfg.reels.base.length !== 5) throw new Error('B: need 5 strips');
  for (const s of cfg.reels.base) if (s.includes('W' as any) || s.includes('S' as any)) throw new Error('B: no W/S allowed');
  for (const k of Object.keys(cfg.paytable)) {
    const p = cfg.paytable[k];
    if (!(p[0] < p[1] && p[1] < p[2])) throw new Error(`B: paytable ${k} not strictly increasing`);
    for (const v of p) if (!Number.isInteger(v)) throw new Error('B: non-integer pay');
  }
  if (cfg.coin.values.some(v => !Number.isInteger(v) || v <= 0)) throw new Error('B: coin values must be positive integers');
  if (cfg.coin.values.length !== cfg.coin.startWeights.length || cfg.coin.values.length !== cfg.coin.respinWeights.length)
    throw new Error('B: coin weights length mismatch');
  if (cfg.pRespin.length !== 9) throw new Error('B: pRespin must have 9 entries (K=6..14)');
  cfg.pRespin.forEach((p, i) => {
    if (!(p > 0 && p < 1)) throw new Error('B: p out of (0,1)');
    if (i > 0 && p > cfg.pRespin[i - 1] + 1e-15) throw new Error('B: pRespin must be non-increasing');
  });
  if (!(cfg.coin.jackpotProb >= 0 && cfg.coin.jackpotProb < 1)) throw new Error('B: bad jackpotProb');
  for (const t of TIERS) if (!Number.isInteger(cfg.jackpotMult[t])) throw new Error('B: jackpot mult must be integer');
}

export function createEngineB(cfg: GameBConfig): EngineEx {
  validateConfigB(cfg);
  const startTable = new WeightedTable(cfg.coin.startWeights);
  const respinTable = new WeightedTable(cfg.coin.respinWeights);
  const jpTable = new WeightedTable(TIERS.map(t => cfg.coin.jackpotWeights[t]));

  const mkMult = (rng: Rng, pos: Pos, table: WeightedTable): Coin => {
    const v = cfg.coin.values[table.pick(rng)];
    return { ...pos, value: { kind: 'mult', mult: v }, payMult: v };
  };
  const mkRespinCoin = (rng: Rng, pos: Pos): Coin => {
    if (cfg.coin.jackpotProb > 0 && rng.float() < cfg.coin.jackpotProb) {
      const tier = TIERS[jpTable.pick(rng)];
      return { ...pos, value: { kind: 'jp', tier } as CoinValue, payMult: cfg.jackpotMult[tier] };
    }
    return mkMult(rng, pos, respinTable);
  };
  const sortCoins = (c: Coin[]) => c.sort((a, b) => a.reel - b.reel || a.row - b.row);

  const settleOf = (r: { roundId: string; mode: 'normal' | 'buy'; bet: number; cost: number; cumulativeWin: number; baseWin: number; featureWin: number }, capped: boolean, steps: number, hs?: RoundStateB['hs']): RoundSettlement => ({
    roundId: r.roundId, game: 'B', mode: r.mode, bet: r.bet, cost: r.cost, totalWin: r.cumulativeWin, capped,
    baseWin: r.baseWin, featureWin: r.featureWin, steps, featureTriggered: !!hs,
    ...(hs ? { hsFinalK: hs.locked.length, hsRespins: hs.respinCount } : {}),
  });

  const nextAfterEnter = (K: number) => (K >= 15 ? 'B_hs_settle' : 'B_hs_respin') as 'B_hs_settle' | 'B_hs_respin';

  function advance(rng: Rng, seq: number, round: RoundStateB | null, req: StartRequest | { type: 'continue' }): Advance {
    if (req.type === 'start') {
      if (round) throw new EngineError('ROUND_IN_PROGRESS');
      checkStart(cfg, 'B', 10, req);
      const bet = req.bet, lineBet = bet / 10, maxWin = cfg.maxWinMult * bet;
      const buy = req.mode === 'buy';
      const cost = buy ? cfg.buy.priceMult * bet : bet;
      const roundSeq = seq + 1;
      const base = { roundId: String(roundSeq), game: 'B' as const, mode: req.mode, bet, cost, maxWin, cumulativeWin: 0, baseWin: 0, featureWin: 0, stepCount: 1 };
      if (buy) {
        // 购买:startCoins 个随机位置(部分 Fisher-Yates),币值取起始权重,仅倍数币
        const cells: Pos[] = [];
        for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) cells.push({ reel: r, row: w });
        for (let i = 0; i < cfg.buy.startCoins; i++) { const j = i + rng.int(15 - i); [cells[i], cells[j]] = [cells[j], cells[i]]; }
        const locked = sortCoins(cells.slice(0, cfg.buy.startCoins).map(p => mkMult(rng, p, startTable)));
        const next = nextAfterEnter(locked.length);
        const nr: RoundStateB = { ...base, next: 'B_hs_respin', hs: { source: 'buy', locked, R: cfg.respins, respinCount: 0 } };
        nr.next = next;
        const step: HsEnterStep = {
          kind: 'B_hs_enter', index: 0, win: 0, cumulativeWin: 0, capped: false, roundEnded: false, next,
          source: 'buy', locked: locked.map(c => ({ ...c })), K: locked.length, R: cfg.respins,
        };
        return { step, round: nr, roundSeq, charge: cost, settlement: null };
      }
      const stops = cfg.reels.base.map(s => rng.int(s.length));
      const grid = buildGrid(cfg.reels.base, stops);
      const coins: Coin[] = [];
      for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) if (grid[r][w] === 'C') coins.push(mkMult(rng, { reel: r, row: w }, startTable));
      const lineWins = evalLines(grid, cfg.paylines, { paytable: cfg.paytable, lineBet });
      const lineTotal = sumWins(lineWins);
      const r = applyCap(0, lineTotal, maxWin);
      const trig = coins.length >= cfg.triggerMin;
      const enters = trig && !r.capped;
      const step: BaseSpinStepB = {
        kind: 'B_base_spin', index: 0, win: r.win, cumulativeWin: r.cum, capped: r.capped,
        roundEnded: !enters, next: enters ? 'B_hs_enter' : null,
        stops, grid, coins, lineWins, lineTotal, trigger: trig ? { startCoins: coins.length } : null,
      };
      const b = { ...base, cumulativeWin: r.cum, baseWin: r.win };
      if (enters) {
        const nr: RoundStateB = { ...b, next: 'B_hs_enter', hs: { source: 'trigger', locked: coins.map(c => ({ ...c })), R: cfg.respins, respinCount: 0 } };
        return { step, round: nr, roundSeq, charge: cost, settlement: null };
      }
      return { step, round: null, roundSeq, charge: cost, settlement: settleOf(b, r.capped, 1) };
    }

    // continue
    if (!round) throw new EngineError('NO_ACTIVE_ROUND');
    const hs = round.hs, bet = round.bet;
    const index = round.stepCount++;
    if (round.next === 'B_hs_enter') {
      const next = nextAfterEnter(hs.locked.length);
      round.next = next;
      const step: HsEnterStep = {
        kind: 'B_hs_enter', index, win: 0, cumulativeWin: round.cumulativeWin, capped: false, roundEnded: false, next,
        source: hs.source, locked: hs.locked.map(c => ({ ...c })), K: hs.locked.length, R: hs.R,
      };
      return { step, round, roundSeq: seq, charge: 0, settlement: null };
    }
    if (round.next === 'B_hs_respin') {
      if (!(hs.R > 0 && hs.locked.length < 15)) throw new EngineError('BAD_STATE', 'hs already finished');
      const occupied = new Set(hs.locked.map(c => c.reel * 3 + c.row));
      hs.respinCount += 1;
      const p = cfg.pRespin[hs.locked.length - cfg.triggerMin];
      const newCoins: Coin[] = [];
      for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) {
        if (occupied.has(r * 3 + w)) continue;
        if (rng.float() < p) newCoins.push(mkRespinCoin(rng, { reel: r, row: w }));
      }
      for (const c of newCoins) hs.locked.push(c);
      sortCoins(hs.locked);
      hs.R = newCoins.length > 0 ? cfg.respins : hs.R - 1;
      const ended = hs.R === 0 || hs.locked.length === 15;
      const next = ended ? 'B_hs_settle' : 'B_hs_respin';
      round.next = next;
      const step: HsRespinStep = {
        kind: 'B_hs_respin', index, win: 0, cumulativeWin: round.cumulativeWin, capped: false, roundEnded: false, next,
        respinIndex: hs.respinCount, newCoins, locked: hs.locked.map(c => ({ ...c })), K: hs.locked.length, R: hs.R, ended,
      };
      return { step, round, roundSeq: seq, charge: 0, settlement: null };
    }
    if (round.next !== 'B_hs_settle') throw new EngineError('BAD_STATE', 'bad next');
    const payouts: HsSettleStep['payouts'] = [];
    let raw = 0;
    for (const c of hs.locked) {
      const win = c.payMult * bet; raw += win;
      payouts.push({ pos: { reel: c.reel, row: c.row }, payMult: c.payMult, win, ...(c.value.kind === 'jp' ? { jackpot: c.value.tier } : {}) });
    }
    let fullScreenBonus: HsSettleStep['fullScreenBonus'] = null;
    if (hs.locked.length === 15) {
      fullScreenBonus = { payMult: cfg.fullScreenMult, win: cfg.fullScreenMult * bet };
      raw += fullScreenBonus.win;
    }
    const r = applyCap(round.cumulativeWin, raw, round.maxWin);
    round.cumulativeWin = r.cum; round.featureWin = r.win;
    const step: HsSettleStep = {
      kind: 'B_hs_settle', index, win: r.win, cumulativeWin: r.cum, capped: r.capped, roundEnded: true, next: null,
      payouts, fullScreenBonus, rawTotal: raw,
    };
    return { step, round: null, roundSeq: seq, charge: 0, settlement: settleOf(round, r.capped, round.stepCount, hs) };
  }

  return {
    game: 'B',
    config: cfg,
    createState: seed => createState('B', seed),
    step: makeStepper('B', advance as any),
    playRound: makePlayRound('B', advance as any),
  };
}
