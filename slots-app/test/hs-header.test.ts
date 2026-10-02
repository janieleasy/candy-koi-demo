import { describe, it, expect } from 'vitest';
import { ENGINE, CFG } from './helpers';
import { presentersB } from '../src/games/gameB/presenters';
import { createBus } from '../src/core/bus';
import type { Coin, HsRespinStep, HsEnterStep, Step, SpinResult } from '@engine/index';
import type { AppPresentContext } from '../src/core/types';

/** 最小舞台替身:只实现 B 的 hsEnter / hsRespin presenter 用到的部分,行为与真实 CoinLayer / HsHeader 对齐。 */
function mockStage() {
  const locked = new Map<string, Coin>();
  const header = { shownK: -1, shownR: -1, set(K: number, R: number) { this.shownK = K; this.shownR = R; }, async bumpDots() {} };
  const stage: any = {
    coins: {
      get count() { return locked.size; },
      get coins() { return [...locked.values()]; },
      clear() { locked.clear(); },
      async add(c: Coin) { locked.set(`${c.reel},${c.row}`, c); },
    },
    reels: { blank() {}, setGhostFiller() {} },
    lines: { clear() {} },
    winBar: { amount: { setValue() {} } },
    hsHeaderRef: header,
    setPhase() {}, setBackground: async () => {},
  };
  return { stage, header, locked };
}

describe('B 状态条与盘面一致', () => {
  it('每个 B_hs_enter / B_hs_respin 步表现结束后:状态条 K = 盘面锁定币数 = step.K,R = step.R', async () => {
    let checkedRespins = 0;
    for (const seed of ['hsA', 'hsB', 'hsC', 'hsD', 'hsE', 'hsF']) {
      const e = ENGINE.B;
      const bet = CFG.B.betLevels[1];
      let r: SpinResult = e.step(e.createState(seed), { type: 'start', game: 'B', bet, mode: 'buy' });
      const steps: Step[] = [r.step];
      while (!r.settlement) { r = e.step(r.state, { type: 'continue' }); steps.push(r.step); }

      const { stage, header, locked } = mockStage();
      const ac = new AbortController(); ac.abort();                         // 跳过所有等待,只验证状态
      const ctx = {
        bus: createBus(), skip: ac.signal, turbo: true, getState: () => r.state, stage, ui: { banner: async () => {}, toast() {} },
        view: {}, cfg: CFG.B, bet,
      } as unknown as AppPresentContext;

      for (const step of steps) {
        if (step.kind === 'B_hs_enter') {
          await presentersB.B_hs_enter(step, ctx);
          const s = step as HsEnterStep;
          expect(header.shownK, `${seed} enter K`).toBe(s.K);
          expect(locked.size).toBe(s.K);
          expect(header.shownR).toBe(s.R);
        } else if (step.kind === 'B_hs_respin') {
          await presentersB.B_hs_respin(step, ctx);
          const s = step as HsRespinStep;
          expect(header.shownK, `${seed} respin#${s.respinIndex} K`).toBe(s.K);
          expect(locked.size, `${seed} respin#${s.respinIndex} board`).toBe(s.K);
          expect(header.shownR, `${seed} respin#${s.respinIndex} R`).toBe(s.R);
          expect(new Set(s.locked.map(c => `${c.reel},${c.row}`))).toEqual(new Set(locked.keys()));
          checkedRespins++;
        }
      }
    }
    expect(checkedRespins).toBeGreaterThan(5);
  });
});
