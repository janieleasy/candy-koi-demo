/**
 * ?force=fs|hs:通过**构造存档**直接进入特色玩法(不改引擎)。
 * 构造出的 EngineState 与引擎在“基础旋转刚触发”时产出的存档同构(round.next = A_fs_enter / B_hs_enter),
 * 因此后续步骤全部由真实引擎推进(随机数来自 seed)。
 * 限制:没有真实的触发盘面(界面用空闲盘面/锁币盘面代替);该局不含基础线赢;投注费由调用方从余额扣除。
 */
import { PROTOCOL_VERSION } from '@engine/index';
import type { EngineEx, EngineState, GameAConfig, GameBConfig, Coin, RoundStateA, RoundStateB } from '@engine/index';

export function buildForcedState(
  kind: 'fs' | 'hs', cfg: GameAConfig | GameBConfig, engine: EngineEx, seed: string | number, bet: number, roundSeq = 1,
): EngineState {
  const base = engine.createState(seed);
  const common = { roundId: String(roundSeq), mode: 'normal' as const, bet, cost: bet, maxWin: cfg.maxWinMult * bet, cumulativeWin: 0, baseWin: 0, featureWin: 0, stepCount: 1 };
  if (kind === 'fs') {
    if (cfg.game !== 'A') throw new Error('force=fs 只适用于玩法 A');
    const n = cfg.fs.award['3'];
    const round: RoundStateA = { ...common, game: 'A', next: 'A_fs_enter', fs: { source: 'scatter', awarded: n, remaining: n, played: 0, ladderIndex: 0 } };
    return { v: PROTOCOL_VERSION, game: 'A', rng: base.rng, roundSeq, round };
  }
  if (cfg.game !== 'B') throw new Error('force=hs 只适用于玩法 B');
  const vals = cfg.coin.values;
  const pick = (i: number) => vals[Math.min(vals.length - 1, i)];
  const spots: [number, number, number][] = [[0, 0, 1], [1, 1, 3], [2, 2, 0], [2, 0, 5], [3, 1, 2], [4, 2, 7]]; // reel,row,值下标
  const locked: Coin[] = spots
    .map(([reel, row, vi]) => ({ reel, row, value: { kind: 'mult' as const, mult: pick(vi) }, payMult: pick(vi) }))
    .sort((a, b) => a.reel - b.reel || a.row - b.row);
  const round: RoundStateB = { ...common, game: 'B', next: 'B_hs_enter', hs: { source: 'trigger', locked, R: cfg.respins, respinCount: 0 } };
  return { v: PROTOCOL_VERSION, game: 'B', rng: base.rng, roundSeq, round };
}
