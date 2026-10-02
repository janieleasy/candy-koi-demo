import { test, expect } from 'vitest';
import { createEngine, EngineError, type EngineState, type Step, type SpinResult } from '../src/index.js';
import { configA } from '../config/gameA.js';
import { configB } from '../config/gameB.js';
import { createLegacyA } from './legacy/engineA_legacy.js';
import { createLegacyB } from './legacy/engineB_legacy.js';
import { cfgA, cfgB, allS, noWin, rep } from './helpers.js';

const BETS = { A: [20, 40, 100, 200, 400, 1000], B: [10, 20, 50, 100, 200, 500] } as const;
const norm = (steps: Step[], idxOffsetFix = true) => {
  const out: any[] = []; let i = 0;
  for (const s of steps as any[]) {
    if (s.kind === 'A_fs_enter') continue;               // 旧 play() 无此过场步
    const { roundEnded, next, source, ...rest } = s;
    out.push({ ...rest, index: idxOffsetFix ? i : s.index }); i++;
  }
  return out;
};
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** 逐步推进到整局结束,返回所有 SpinResult */
function stepAll(engine: any, state: EngineState, start: any, roundtrip = false): { results: SpinResult[]; state: EngineState } {
  const results: SpinResult[] = [];
  let r: SpinResult = engine.step(roundtrip ? json(state) : state, start);
  results.push(r);
  while (!r.settlement) {
    r = engine.step(roundtrip ? json(r.state) : r.state, { type: 'continue' });
    results.push(r);
  }
  return { results, state: r.state };
}

for (const [G, cfg, legacy] of [['A', configA, createLegacyA], ['B', configB, createLegacyB]] as const) {
  const mk = () => createEngine(cfg as any);
  const bets = BETS[G];

  test(`${G}: 回归 — 逐步步序列与接口变更前的整局 play() 逐步一致(含 RNG 终态),normal+buy`, () => {
    for (const mode of ['normal', 'buy'] as const) {
      const old: any = (legacy as any)(cfg, { seed: 'reg-' + G });
      const e = mk();
      let st = e.createState('reg-' + G);
      const n = mode === 'buy' ? 3000 : 20000;
      for (let i = 0; i < n; i++) {
        const bet = bets[i % 6];
        const o = old.play({ game: G, bet, mode });
        const res = e.playRound(st, { type: 'start', game: G, bet, mode });
        st = res.state;
        expect(norm(res.steps)).toEqual(norm(o.steps as any));
        expect(res.settlement.totalWin).toBe(o.totalWin);
        expect(res.settlement.capped).toBe(o.capped);
        expect(res.settlement.baseWin).toBe(o.summary.baseWin);
        expect(res.settlement.featureWin).toBe(o.summary.featureWin);
        expect(res.charge).toBe(o.cost);
        expect(st.rng).toBe(o.rng.stateAfter);
      }
    }
  });

  test(`${G}: 逐步(step/continue) 与 playRound 同 seed 结果完全一致,且 JSON 往返存档不改变后续步`, () => {
    const e = mk();
    let sA = e.createState('s1'), sB = e.createState('s1');
    for (let i = 0; i < 3000; i++) {
      const start = { type: 'start' as const, game: G, bet: bets[i % 6], mode: (i % 25 === 0 ? 'buy' : 'normal') as 'buy' | 'normal' };
      const whole = e.playRound(sA, start);
      const a = stepAll(e, sB, start, false);
      const b = stepAll(e, sB, start, true);       // 每步前把存档序列化再反序列化
      expect(a.results.map(r => r.step)).toEqual(whole.steps);
      expect(b.results.map(r => r.step)).toEqual(whole.steps);
      expect(b.results.map(r => r.state)).toEqual(a.results.map(r => r.state));
      expect(a.state).toEqual(whole.state);
      expect(b.results.at(-1)!.settlement).toEqual(whole.settlement);
      expect(a.results[0].charge).toBe(whole.charge);
      expect(a.results.slice(1).every(r => r.charge === 0)).toBe(true);
      // 每步:仅最后一步有 settlement;next/roundEnded 一致;局中 state.round 非空
      a.results.forEach((r, k) => {
        const last = k === a.results.length - 1;
        expect(r.step.roundEnded).toBe(last); expect(r.step.next === null).toBe(last);
        expect(r.settlement !== null).toBe(last); expect(r.state.round === null).toBe(last);
        expect(r.step.index).toBe(k);
        if (!last) expect(r.state.round!.next).toBe(r.step.next); expect(r.state.round?.stepCount ?? k + 1).toBe(k + 1);
        expect(r.rng.after).toBe(r.state.rng);
        expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
      });
      expect(a.results.reduce((t, r) => t + r.step.win, 0)).toBe(whole.settlement.totalWin);
      expect(Number.isInteger(whole.settlement.totalWin)).toBe(true);
      sA = whole.state; sB = a.state;
    }
  });

  test(`${G}: 任意一步后存档恢复(新引擎实例 + JSON),后续步不变`, () => {
    const e1 = mk(), e2 = mk();
    let st = e1.createState('resume');
    for (let i = 0; i < 400; i++) {
      const start = { type: 'start' as const, game: G, bet: bets[i % 6], mode: (i % 7 === 0 ? 'buy' : 'normal') as 'buy' | 'normal' };
      const ref = stepAll(e1, st, start);
      // 在每一个中断点用全新引擎恢复
      for (let cut = 0; cut < ref.results.length - 1; cut++) {
        const saved = json(ref.results[cut].state);
        const rest = stepAll(e2, saved, { type: 'continue' } as any);
        // stepAll 的第一个请求是 continue
        expect(rest.results.map(r => r.step)).toEqual(ref.results.slice(cut + 1).map(r => r.step));
        expect(rest.state).toEqual(ref.state);
      }
      st = ref.state;
    }
  });

  test(`${G}: step 是纯函数 — 不修改入参 state;同 (state,req) 同结果`, () => {
    const e = mk(); const s0 = e.createState(5);
    const snap = json(s0);
    const r1 = e.step(s0, { type: 'start', game: G, bet: bets[0], mode: 'normal' });
    expect(s0).toEqual(snap);
    const r2 = e.step(s0, { type: 'start', game: G, bet: bets[0], mode: 'normal' });
    expect(r2).toEqual(r1);
    let s = r1.state; let guard = 0;
    while (s.round && guard++ < 500) { const before = json(s); const a = e.step(s, { type: 'continue' }); expect(s).toEqual(before); expect(e.step(s, { type: 'continue' })).toEqual(a); s = a.state; }
    expect(r1.rng.before).toBe(s0.rng);
  });

  test(`${G}: 非法请求抛 EngineError(code)`, () => {
    const e = mk(); const s0 = e.createState(1);
    const code = (f: () => unknown) => { try { f(); } catch (x) { expect(x).toBeInstanceOf(EngineError); return (x as EngineError).code; } return 'NO_THROW'; };
    const other = G === 'A' ? 'B' : 'A';
    expect(code(() => e.step(s0, { type: 'continue' }))).toBe('NO_ACTIVE_ROUND');
    expect(code(() => e.step(s0, { type: 'start', game: other, bet: bets[0], mode: 'normal' }))).toBe('WRONG_GAME');
    expect(code(() => e.step(s0, { type: 'start', game: G, bet: 15, mode: 'normal' }))).toBe('INVALID_BET');
    expect(code(() => e.step(s0, { type: 'start', game: G, bet: 1.5 as any, mode: 'normal' }))).toBe('INVALID_BET');
    expect(code(() => e.step(s0, { type: 'start', game: G, bet: bets[0], mode: 'free' as any }))).toBe('INVALID_MODE');
    const noBuy = createEngine({ ...(cfg as any), buy: { ...(cfg as any).buy, enabled: false } });
    expect(code(() => noBuy.step(s0, { type: 'start', game: G, bet: bets[0], mode: 'buy' }))).toBe('BUY_DISABLED');
    // 局中 start:buy 一定进入局中
    const mid = e.step(s0, { type: 'start', game: G, bet: bets[0], mode: 'buy' }).state;
    expect(mid.round).not.toBeNull();
    expect(code(() => e.step(mid, { type: 'start', game: G, bet: bets[0], mode: 'normal' }))).toBe('ROUND_IN_PROGRESS');
    // BAD_STATE
    expect(code(() => e.step({ ...s0, v: 1 as any }, { type: 'continue' }))).toBe('BAD_STATE');
    expect(code(() => e.step({ ...s0, rng: 'zz' }, { type: 'start', game: G, bet: bets[0], mode: 'normal' }))).toBe('BAD_STATE');
    expect(code(() => e.step({ ...s0, game: other as any }, { type: 'continue' }))).toBe('WRONG_GAME');
    expect(code(() => e.step({ ...mid, round: { ...mid.round!, next: 'nope' as any } }, { type: 'continue' }))).toBe('BAD_STATE');
    // 失败的请求不改变 state
    expect(s0.round).toBeNull();
  });
}
