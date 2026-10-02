import { describe, it, expect } from 'vitest';
import { runEngine, CFG, findTriggerSeed } from './helpers';

const NEXT_OK: Record<string, string[]> = {
  A_base_spin: ['A_fs_enter'], A_fs_enter: ['A_fs_spin'], A_fs_spin: ['A_fs_spin'],
  B_base_spin: ['B_hs_enter'], B_hs_enter: ['B_hs_respin', 'B_hs_settle'], B_hs_respin: ['B_hs_respin', 'B_hs_settle'], B_hs_settle: [],
};

describe('步序列(协议 v2)', () => {
  for (const game of ['A', 'B'] as const) {
    it(`${game}: 随机 300 局,步序列符合状态机,index 连续,仅最后一步带 settlement`, () => {
      const bet = CFG[game].betLevels[2];
      for (let i = 0; i < 300; i++) {
        const rs = runEngine(game, `seq${i}`, bet, 'normal');
        rs.forEach((r, k) => {
          expect(r.step.index).toBe(k);
          expect(r.settlement === null).toBe(k < rs.length - 1);
          if (k === 0) expect(r.step.kind).toBe(`${game}_base_spin`);
          if (k > 0) expect(NEXT_OK[rs[k - 1].step.kind]).toContain(r.step.kind);
          expect(r.charge).toBe(k === 0 ? bet : 0);
        });
        const last = rs[rs.length - 1];
        expect(last.step.roundEnded).toBe(true);
        expect(last.settlement!.totalWin).toBe(last.step.cumulativeWin);
      }
    });
    it(`${game}: buy 局第一步是 enter 步,charge = config.buy.priceMult × bet`, () => {
      const cfg = CFG[game]; const bet = cfg.betLevels[1];
      const rs = runEngine(game, 'buy1', bet, 'buy');
      expect(rs[0].step.kind).toBe(game === 'A' ? 'A_fs_enter' : 'B_hs_enter');
      expect(rs[0].charge).toBe(cfg.buy.priceMult * bet);
      expect(rs.slice(1).every(r => r.charge === 0)).toBe(true);
      expect(rs[rs.length - 1].step.kind).toBe(game === 'A' ? 'A_fs_spin' : 'B_hs_settle');
    });
  }
  it('购买倍率来自 config(A=48, B=85),不是 75/60', () => {
    expect(CFG.A.buy.priceMult).toBe(48);
    expect(CFG.B.buy.priceMult).toBe(85);
  });
  it('可以找到触发特色玩法的 normal 局(含 enter 步)', () => {
    const sA = findTriggerSeed('A', 100, 50000);
    const rs = runEngine('A', sA, 100, 'normal');
    expect(rs.map(r => r.step.kind).slice(0, 3)).toEqual(['A_base_spin', 'A_fs_enter', 'A_fs_spin']);
  });
});
