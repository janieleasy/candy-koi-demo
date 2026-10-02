import { Rng } from './rng.js';
import {
  EngineError, PROTOCOL_VERSION,
  type Engine, type EngineState, type GameId, type Phase, type RoundSettlement, type RoundState, type SpinResult, type Step, type StartRequest,
} from './types.js';

/** 引擎实例:协议 Engine + 整局循环(供 sim / 测试;外层 UI 不需要)。 */
export interface RoundResult {
  steps: Step[];
  state: EngineState;
  charge: number;
  settlement: RoundSettlement;
}
export interface EngineEx extends Engine {
  /** 从空闲存档出发,循环 step 直到整局结束(等价于 start + 若干 continue)。 */
  playRound(state: EngineState, start: StartRequest): RoundResult;
}

/** advance* 的内部返回(round 为可变对象,调用方负责是否克隆) */
export interface Advance {
  step: Step;
  round: RoundState | null;
  roundSeq: number;
  charge: number;
  settlement: RoundSettlement | null;
}

export function rngFrom(hex: string): Rng {
  const r = new Rng(0);
  try { r.setState(hex); } catch { throw new EngineError('BAD_STATE', 'invalid rng state'); }
  return r;
}

const PHASES_A: Phase[] = ['A_fs_enter', 'A_fs_spin'];
const PHASES_B: Phase[] = ['B_hs_enter', 'B_hs_respin', 'B_hs_settle'];

export function assertState(state: EngineState, game: GameId): void {
  if (!state || typeof state !== 'object' || state.v !== PROTOCOL_VERSION) throw new EngineError('BAD_STATE', 'bad version');
  if (state.game !== game) throw new EngineError('WRONG_GAME', `state is game ${state.game}`);
  if (typeof state.rng !== 'string' || !Number.isInteger(state.roundSeq) || state.roundSeq < 0) throw new EngineError('BAD_STATE', 'bad fields');
  const r = state.round;
  if (r === null) return;
  if (!r || r.game !== game) throw new EngineError('BAD_STATE', 'round game mismatch');
  const ok = (game === 'A' ? PHASES_A : PHASES_B).includes(r.next);
  if (!ok) throw new EngineError('BAD_STATE', 'bad next');
  for (const k of ['bet', 'cost', 'maxWin', 'cumulativeWin', 'baseWin', 'featureWin', 'stepCount'] as const)
    if (!Number.isInteger(r[k])) throw new EngineError('BAD_STATE', `bad round.${k}`);
  if (r.game === 'A') {
    const f = r.fs;
    if (!f || !Number.isInteger(f.remaining) || !Number.isInteger(f.awarded) || !Number.isInteger(f.played) || !Number.isInteger(f.ladderIndex)) throw new EngineError('BAD_STATE', 'bad round.fs');
  } else {
    const h = r.hs;
    if (!h || !Array.isArray(h.locked) || !Number.isInteger(h.R) || !Number.isInteger(h.respinCount)) throw new EngineError('BAD_STATE', 'bad round.hs');
  }
}

export function makeStepper(game: GameId, advance: (rng: Rng, seq: number, round: RoundState | null, req: any) => Advance) {
  return (state: EngineState, req: any): SpinResult => {
    assertState(state, game);
    const rng = rngFrom(state.rng);
    const round = state.round ? structuredClone(state.round) : null; // 纯函数:不改入参
    const o = advance(rng, state.roundSeq, round, req);
    const after = rng.getState();
    return {
      step: o.step,
      state: { v: PROTOCOL_VERSION, game, rng: after, roundSeq: o.roundSeq, round: o.round },
      charge: o.charge, settlement: o.settlement, rng: { before: state.rng, after },
    };
  };
}

export function makePlayRound(game: GameId, advance: (rng: Rng, seq: number, round: RoundState | null, req: any) => Advance) {
  return (state: EngineState, start: StartRequest): RoundResult => {
    assertState(state, game);
    if (state.round !== null) throw new EngineError('ROUND_IN_PROGRESS');
    const rng = rngFrom(state.rng);
    const steps: Step[] = [];
    let o = advance(rng, state.roundSeq, null, start);
    const charge = o.charge;
    steps.push(o.step);
    while (!o.settlement) { o = advance(rng, o.roundSeq, o.round, { type: 'continue' }); steps.push(o.step); }
    return {
      steps, charge, settlement: o.settlement,
      state: { v: PROTOCOL_VERSION, game, rng: rng.getState(), roundSeq: o.roundSeq, round: null },
    };
  };
}

export function checkStart(cfg: { betLevels: number[]; buy: { enabled: boolean } }, game: GameId, divisor: number, req: StartRequest): void {
  if (req.game !== game) throw new EngineError('WRONG_GAME', `engine is game ${game}`);
  if (!Number.isInteger(req.bet) || !cfg.betLevels.includes(req.bet) || req.bet % divisor !== 0) throw new EngineError('INVALID_BET', `invalid bet ${req.bet}`);
  if (req.mode !== 'normal' && req.mode !== 'buy') throw new EngineError('INVALID_MODE');
  if (req.mode === 'buy' && !cfg.buy.enabled) throw new EngineError('BUY_DISABLED');
}

export function createState(game: GameId, seed: string | number): EngineState {
  return { v: PROTOCOL_VERSION, game, rng: new Rng(seed).getState(), roundSeq: 0, round: null };
}
