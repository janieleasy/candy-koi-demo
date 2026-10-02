import { test, expect } from 'vitest';
import { createEngine, type FsSpinStepA, type BaseSpinStepA, type Step } from '../src/index.js';
import { configA } from '../config/gameA.js';
import { configB } from '../config/gameB.js';
import { cfgA, noWin } from './helpers.js';

/** k 个 S(分布在前 k 轴),其余轴单一图案:3 行窗口恒含全部 3 格,故结果与停位无关 */
const kS = (k: number) => ['L1', 'L2', 'L3', 'L4', 'L5'].map((f, i) => (i < k ? ['S', f, f] : [f, f, f]));
const play = (cfg: any, mode: 'normal' | 'buy' = 'normal', bet = 100) => {
  const e = createEngine(cfg); return e.playRound(e.createState(1), { type: 'start', game: cfg.game, bet, mode });
};

test('A: Scatter 3/4/5 个 → 总投注 2x/10x/50x,赠送 8/12/20 次(Scatter 不乘倍数)', () => {
  for (const [k, pay, fsN] of [[3, 2, 8], [4, 10, 12], [5, 50, 20]] as const) {
    const r = play(cfgA(kS(k), noWin));
    const b = r.steps[0] as BaseSpinStepA;
    expect(b.scatter!.count).toBe(k); expect(b.scatter!.win).toBe(pay * 100); expect(b.win).toBe(pay * 100);
    expect(b.trigger!.freeSpins).toBe(fsN);
    expect(r.steps[1].kind).toBe('A_fs_enter'); expect((r.steps[1] as any).awarded).toBe(fsN);
    expect(r.settlement.fsSpinsPlayed).toBe(fsN); expect(r.settlement.totalWin).toBe(pay * 100);
  }
  // 2 个 S 不赔不触发
  const r2 = play(cfgA(kS(2), noWin)); expect(r2.steps.length).toBe(1); expect((r2.steps[0] as BaseSpinStepA).scatter).toBeNull(); expect(r2.settlement.totalWin).toBe(0);
});

test('A: FS 中 Scatter 3/4/5 重触发追加 5/8/12(未触顶 60 时)', () => {
  for (const [k, add] of [[3, 5], [4, 8], [5, 12]] as const) {
    const r = play(cfgA(kS(5), kS(k), { maxWinMult: 1e9 }), 'buy');
    const fs = r.steps.filter(s => s.kind === 'A_fs_spin') as FsSpinStepA[];
    expect(fs[0].retrigger).toEqual({ scatterCount: k, requested: add, added: add, totalAwarded: 8 + add });
    expect(fs[0].remainingBefore).toBe(8); expect(fs[0].remainingAfter).toBe(7 + add);
    expect(fs.at(-1)!.retrigger!.added).toBe(0);   // 满 60 后仍支付 Scatter
    expect(r.settlement.fsSpinsAwardedTotal).toBe(60);
  }
});

test('A: 阶梯 — L>0 才升档;仅 Scatter 赢(L=0)则 c 重置;使用真实 config 统计所有转移', () => {
  const e = createEngine(configA); let st = e.createState('ladder');
  let resetByScatterOnly = 0, atMaxStay = 0, up = 0, resetNoWin = 0;
  for (let i = 0; i < 40000; i++) {
    const r = e.playRound(st, { type: 'start', game: 'A', bet: 100, mode: 'buy' }); st = r.state;
    let prev = 0;
    for (const s of r.steps as FsSpinStepA[]) {
      if (s.kind !== 'A_fs_spin') continue;
      expect(s.ladderIndex).toBe(prev);                       // 阶梯跨重触发连续
      expect(s.multiplier).toBe(configA.fs.ladder[s.ladderIndex]);
      const exp = s.lineTotalRaw > 0 ? Math.min(s.ladderIndex + 1, 3) : 0;
      expect(s.ladderAfter).toBe(exp);
      expect(s.lineTotalMultiplied).toBe(s.lineTotalRaw * s.multiplier);
      if (s.lineTotalRaw === 0 && s.scatter && s.ladderIndex > 0) resetByScatterOnly++;
      if (s.lineTotalRaw === 0 && !s.scatter && s.ladderIndex > 0) resetNoWin++;
      if (s.lineTotalRaw > 0 && s.ladderIndex === 3) atMaxStay++;
      if (s.lineTotalRaw > 0 && s.ladderIndex < 3) up++;
      prev = s.ladderAfter;
    }
  }
  expect(resetByScatterOnly).toBeGreaterThan(0); expect(resetNoWin).toBeGreaterThan(0); expect(atMaxStay).toBeGreaterThan(0); expect(up).toBeGreaterThan(0);
});

test('A/B: 真实 config 下大量局的不变量(≤60 次、≤上限、整数、累计=Σ步)', () => {
  for (const cfg of [configA, configB] as any[]) {
    const e = createEngine(cfg); let st = e.createState('inv-' + cfg.game);
    for (let i = 0; i < 30000; i++) {
      const bet = cfg.betLevels[i % cfg.betLevels.length];
      const r = e.playRound(st, { type: 'start', game: cfg.game, bet, mode: i % 20 === 0 ? 'buy' : 'normal' }); st = r.state;
      let sum = 0; for (const s of r.steps as Step[]) { expect(Number.isInteger(s.win)).toBe(true); sum += s.win; expect(s.cumulativeWin).toBe(sum); }
      expect(sum).toBe(r.settlement.totalWin); expect(sum).toBeLessThanOrEqual(cfg.maxWinMult * bet);
      expect(r.settlement.capped).toBe(sum === cfg.maxWinMult * bet);
      if (cfg.game === 'A') expect(r.settlement.fsSpinsAwardedTotal!).toBeLessThanOrEqual(60);
    }
  }
});

test('B 配置约束:p(K) 单调不增且在 (0,1);币值全为整数;Jackpot 倍数整数', () => {
  const p = configB.pRespin;
  for (let i = 0; i < p.length; i++) { expect(p[i]).toBeGreaterThan(0); expect(p[i]).toBeLessThan(1); if (i) expect(p[i]).toBeLessThanOrEqual(p[i - 1]); }
  expect(configB.coin.values.every(Number.isInteger)).toBe(true);
  expect(Object.values(configB.jackpotMult).every(Number.isInteger)).toBe(true);
  expect(configB.fullScreenMult).toBe(configB.jackpotMult.Grand);
});

test('A 配置约束:FS 轴带 W 多于 BASE、低图案少于 BASE、S 比例不高于 BASE;W 仅在轴 2-4', () => {
  const cnt = (set: any[][], f: (s: string) => boolean) => set.reduce((a, r) => a + r.filter(f).length, 0);
  const tot = (set: any[][]) => set.reduce((a, r) => a + r.length, 0);
  const b = configA.reels.base as any[][], f = configA.reels.fs as any[][];
  expect(cnt(f, s => s === 'W') / tot(f)).toBeGreaterThan(cnt(b, s => s === 'W') / tot(b));
  expect(cnt(f, s => s[0] === 'L') / tot(f)).toBeLessThan(cnt(b, s => s[0] === 'L') / tot(b));
  expect(cnt(f, s => s === 'S') / tot(f)).toBeLessThanOrEqual(cnt(b, s => s === 'S') / tot(b));
  for (const set of [b, f]) { expect(set[0].includes('W')).toBe(false); expect(set[4].includes('W')).toBe(false); }
});
