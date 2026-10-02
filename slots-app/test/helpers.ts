import { createEngine } from '@engine/index';
import type { GameId, SpinResult, EngineState, Step } from '@engine/index';
import { configA } from '@engine-config/gameA';
import { configB } from '@engine-config/gameB';
import { createBus } from '../src/core/bus';
import { MemoryStore, Wallet } from '../src/core/storage';
import { Controller } from '../src/engine-bridge/Controller';
import type { MathConfig } from '../src/core/types';

export const CFG: Record<GameId, MathConfig> = { A: configA, B: configB };
export const ENGINE = { A: createEngine(configA), B: createEngine(configB) };

export function makeEnv(seedA: string | number = 'tA', seedB: string | number = 'tB', store = new MemoryStore(), cfg = CFG) {
  const bus = createBus();
  const wallet = new Wallet(store);
  const events: { n: string; p: any }[] = [];
  bus.onAny((n, p) => events.push({ n, p }));
  const mk = (g: GameId, seed: string | number) => new Controller({ game: g, config: cfg[g], engine: createEngine(cfg[g]), bus, store, wallet, seed });
  const A = mk('A', seedA); const B = mk('B', seedB);
  const played: Step[] = [];
  for (const c of [A, B]) c.play = async (r: SpinResult) => { played.push(r.step); };
  return { bus, store, wallet, A, B, events, played };
}

/** 引擎直驱:返回整局 SpinResult 序列 */
export function runEngine(game: GameId, seed: string, bet: number, mode: 'normal' | 'buy', from?: EngineState) {
  const e = ENGINE[game];
  let st = from ?? e.createState(seed);
  const out: SpinResult[] = [];
  let r = e.step(st, { type: 'start', game, bet, mode });
  out.push(r);
  while (!r.settlement) { r = e.step(r.state, { type: 'continue' }); out.push(r); }
  return out;
}

/** 找一个让基础旋转触发特色玩法的 seed */
export function findTriggerSeed(game: GameId, bet: number, max = 200000): string {
  const e = ENGINE[game];
  for (let i = 0; i < max; i++) {
    const s = `trig${i}`;
    const r = e.step(e.createState(s), { type: 'start', game, bet, mode: 'normal' });
    if (r.state.round) return s;
  }
  throw new Error('no trigger seed found');
}
