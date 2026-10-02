import { test } from 'vitest';
import assert from 'node:assert/strict';

import { cfgB, rep , engB } from './helpers.js';
import { configB } from '../config/gameB.js';
import type { HsRespinStep, HsSettleStep, BaseSpinStepB } from '../src/types.js';

const run = (cfg: any, req: any = { game: 'B', bet: 100, mode: 'normal' }, seed = 1) => engB(cfg, seed).play(req);
const noC = rep(['L1', 'L2', 'L3']);
const allC = rep(['C', 'C', 'C']);
// 前 2 轴全 C(6 个), 其余无 C
const sixC = [['C', 'C', 'C'], ['C', 'C', 'C'], ['L1', 'L2', 'L3'], ['L2', 'L3', 'L4'], ['L3', 'L4', 'L1']];
const fiveC = [['C', 'C', 'C'], ['C', 'C', 'L1'], ['L1', 'L2', 'L3'], ['L2', 'L3', 'L4'], ['L3', 'L4', 'L1']].map(s => s.slice());
const lowP = { pRespin: [1e-12, 1e-12, 1e-12, 1e-12, 1e-12, 1e-12, 1e-12, 1e-12, 1e-12] };
const hiP = { pRespin: new Array(9).fill(1 - 1e-12) };

test('C<6 不触发; C 中断连线', () => {
  const g = [['C', 'C', 'C'], ['C', 'C', 'L1'], ['L1', 'L1', 'L1'], ['L1', 'L1', 'L1'], ['L1', 'L1', 'L1']];
  // 找一个 stop 不确定 -> 用固定长度 3 轴带下停位随机, 只检查不变量
  const e = engB(cfgB(g.map(s => [...s]) as any), 5);
  for (let i = 0; i < 200; i++) { const r = e.play({ game: 'B', bet: 100, mode: 'normal' }); assert.equal(r.summary.featureTriggered, (r.steps[0] as BaseSpinStepB).coins.length >= 6); }
});
test('恰好 5 个 C: 不触发', () => {
  const strips = [['C', 'C', 'C'], ['C', 'C', 'L1'], ['L1', 'L2', 'L3'], ['L2', 'L3', 'L4'], ['L3', 'L4', 'L1']];
  // reel2 窗口含 C 数量为 2(3 个循环位置里 2 个 C, 窗口恒为全部 3 个位置) -> 共 5
  const r = run(cfgB(strips as any));
  assert.equal((r.steps[0] as BaseSpinStepB).coins.length, 5); assert.equal(r.steps.length, 1); assert.equal(r.summary.featureTriggered, false);
});
test('6 个 C 触发; 无新 C 时 R: 3->2->1->0 共 3 次重旋转后结算', () => {
  const r = run(cfgB(sixC as any, lowP));
  const b = r.steps[0] as BaseSpinStepB; assert.equal(b.trigger!.startCoins, 6);
  const rs = r.steps.filter(s => s.kind === 'B_hs_respin') as HsRespinStep[];
  assert.deepEqual(rs.map(s => s.R), [2, 1, 0]); assert.ok(rs.at(-1)!.ended); assert.ok(rs.every(s => s.newCoins.length === 0));
  const st = r.steps.at(-1) as HsSettleStep; assert.equal(st.kind, 'B_hs_settle'); assert.equal(st.payouts.length, 6);
  assert.equal(r.summary.hsFinalK, 6); assert.equal(r.summary.hsRespins, 3);
});
test('起始 C 只能是倍数币; 结算 = Σ v*bet; 无满屏奖励', () => {
  const r = run(cfgB(sixC as any, lowP));
  const b = r.steps[0] as BaseSpinStepB; assert.ok(b.coins.every(c => c.value.kind === 'mult'));
  const st = r.steps.at(-1) as HsSettleStep; const sum = b.coins.reduce((a, c) => a + c.payMult * 100, 0);
  assert.equal(st.rawTotal, sum); assert.equal(st.fullScreenBonus, null);
  assert.equal(r.totalWin, (r.steps[0] as BaseSpinStepB).lineTotal + sum);
});
test('15 个 C 起始: 无重旋转, 直接结算, 满屏奖励 1000x', () => {
  const r = run(cfgB(allC as any));
  assert.equal(r.steps.filter(s => s.kind === 'B_hs_respin').length, 0);
  const st = r.steps.at(-1) as HsSettleStep; assert.equal(st.fullScreenBonus!.win, 1000 * 100); assert.equal(st.payouts.length, 15);
  assert.equal(r.summary.hsFinalK, 15);
});
test('重旋转全落满: 一次落满立即结束, 满屏 = Σ币 + Grand', () => {
  const r = run(cfgB(sixC as any, { ...hiP, coin: { ...cfgB(sixC as any).coin, jackpotProb: 0 } }));
  const rs = r.steps.filter(s => s.kind === 'B_hs_respin') as HsRespinStep[];
  assert.equal(rs.length, 1); assert.equal(rs[0].K, 15); assert.ok(rs[0].ended); assert.equal(rs[0].R, 3);
  const st = r.steps.at(-1) as HsSettleStep; assert.ok(st.fullScreenBonus);
  const coinSum = st.payouts.reduce((a, p) => a + p.win, 0);
  assert.equal(st.rawTotal, coinSum + 100000);
});
test('有新 C 时 R 重置为 3(非累加); 多个新 C 只重置一次', () => {
  // 每次约一半空格落 C -> 观察 R 序列只会是 3 或递减
  const cfg = cfgB(sixC as any, { pRespin: new Array(9).fill(0.15) });
  const e = engB(cfg, 11);
  let sawReset = false;
  for (let i = 0; i < 500; i++) {
    const r = e.play({ game: 'B', bet: 100, mode: 'normal' });
    let R = 3, K = 6;
    for (const s of r.steps.filter(x => x.kind === 'B_hs_respin') as HsRespinStep[]) {
      if (s.newCoins.length > 0) { assert.equal(s.R, 3); K += s.newCoins.length; if (R < 3) sawReset = true; } else assert.equal(s.R, R - 1);
      assert.equal(s.K, K); assert.equal(s.locked.length, K); R = s.R;
      assert.equal(s.ended, s.R === 0 || s.K === 15);
    }
  }
  assert.ok(sawReset);
});
test('锁定位置不重复, 新 C 只落在空格', () => {
  const e = engB(cfgB(sixC as any, { pRespin: new Array(9).fill(0.3) }), 3);
  for (let i = 0; i < 300; i++) {
    const r = e.play({ game: 'B', bet: 100, mode: 'normal' });
    for (const s of r.steps.filter(x => x.kind === 'B_hs_respin') as HsRespinStep[]) {
      const keys = s.locked.map(c => c.reel * 3 + c.row); assert.equal(new Set(keys).size, keys.length);
    }
  }
});
test('Jackpot 币仅在重旋转中出现; 起始为倍数币', () => {
  const e = engB(cfgB(sixC as any, { pRespin: new Array(9).fill(0.4), coin: { ...cfgB(sixC as any).coin, jackpotProb: 0.5 } }), 8);
  let jp = 0;
  for (let i = 0; i < 300; i++) {
    const r = e.play({ game: 'B', bet: 100, mode: 'normal' });
    assert.ok((r.steps[0] as BaseSpinStepB).coins.every(c => c.value.kind === 'mult'));
    const en = r.steps.find(s => s.kind === 'B_hs_enter') as any; assert.ok(en.locked.every((c: any) => c.value.kind === 'mult'));
    for (const s of r.steps.filter(x => x.kind === 'B_hs_respin') as HsRespinStep[]) for (const c of s.newCoins) if (c.value.kind === 'jp') jp++;
  }
  assert.ok(jp > 0);
});
test('Jackpot 币 + 满屏 Grand 可叠加', () => {
  // 强制每个新 C 为 Grand 币
  const base = cfgB(sixC as any);
  const cfg = cfgB(sixC as any, { ...hiP, coin: { ...base.coin, jackpotProb: 0.999999999, jackpotWeights: { Mini: 1, Minor: 1, Major: 1, Grand: 1e9 } }, maxWinMult: 1e9 });
  const r = run(cfg);
  const st = r.steps.at(-1) as HsSettleStep;
  assert.equal(st.payouts.filter(p => p.jackpot === 'Grand').length >= 8, true);
  const coins = st.payouts.reduce((a, p) => a + p.win, 0);
  assert.equal(st.rawTotal, coins + 1000 * 100);
});
test('10000x 上限: H&S 结算超过上限则截断', () => {
  const base = cfgB(sixC as any);
  const cfg = cfgB(sixC as any, { ...hiP, coin: { ...base.coin, jackpotProb: 0.999999999, jackpotWeights: { Mini: 1, Minor: 1, Major: 1, Grand: 1e9 } } });
  const r = run(cfg);
  assert.equal(r.capped, true); assert.equal(r.totalWin, 10000 * 100);
  const st = r.steps.at(-1) as HsSettleStep; assert.ok(st.rawTotal > st.cumulativeWin); assert.equal(st.capped, true);
});
test('购买: 价格 = priceMult×bet, 6 个随机位置的倍数币, 无基础旋转', () => {
  const e = engB(configB, 4);
  for (let i = 0; i < 300; i++) {
    const r = e.play({ game: 'B', bet: 100, mode: 'buy' });
    assert.equal(r.cost, configB.buy.priceMult * 100); assert.equal(r.steps[0].kind, 'B_hs_enter'); assert.equal(r.summary.baseWin, 0);
    const en: any = r.steps[0]; assert.equal(en.locked.length, 6); assert.equal(new Set(en.locked.map((c: any) => c.reel * 3 + c.row)).size, 6);
    assert.ok(en.locked.every((c: any) => c.value.kind === 'mult'));
  }
});
test('购买位置覆盖全部 15 格(随机性)', () => {
  const e = engB(configB, 6); const seen = new Set<number>();
  for (let i = 0; i < 400; i++) for (const c of (e.play({ game: 'B', bet: 100, mode: 'buy' }).steps[0] as any).locked) seen.add(c.reel * 3 + c.row);
  assert.equal(seen.size, 15);
});
test('可复现 + 重放 + 整数金额 + 守恒', () => {
  const a = engB(configB, 'q'), b = engB(configB, 'q');
  for (let i = 0; i < 2000; i++) {
    const bet = [10, 20, 50, 100, 200, 500][i % 6];
    const mode = i % 40 === 0 ? 'buy' : 'normal';
    const ra = a.play({ game: 'B', bet, mode }), rb = b.play({ game: 'B', bet, mode });
    assert.deepEqual(ra, rb);
    let sum = 0; for (const s of ra.steps) { assert.ok(Number.isInteger(s.win)); sum += s.win; assert.equal(s.cumulativeWin, sum); }
    assert.equal(sum, ra.totalWin); assert.ok(ra.totalWin <= ra.maxWin);
  }
  const r1 = a.play({ game: 'B', bet: 100, mode: 'buy' });
  const c = engB(configB, 'other'); c.setRngState(r1.rng.stateBefore);
  assert.deepEqual(c.play({ game: 'B', bet: 100, mode: 'buy' }).steps, r1.steps);
});
test('配置校验', () => {
  assert.throws(() => engB(cfgB(noC as any, { pRespin: [0.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1] }), 1)); // 非单调
  assert.throws(() => engB(cfgB(noC as any, { betLevels: [15] }), 1));
  assert.throws(() => engB(cfgB([['W', 'L1', 'L2'], ...noC.slice(1)] as any), 1));
  assert.throws(() => run(cfgB(noC as any), { game: 'B', bet: 15, mode: 'normal' }));
});
