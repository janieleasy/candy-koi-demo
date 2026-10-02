import { test } from 'vitest';
import assert from 'node:assert/strict';

import { cfgA, allS, noWin, rep , engA } from './helpers.js';
import { configA } from '../config/gameA.js';
import type { FsSpinStepA, BaseSpinStepA } from '../src/types.js';

const run = (cfg: any, req: any = { game: 'A', bet: 100, mode: 'normal' }, seed = 1) => engA(cfg, seed).play(req);

test('无赢无触发: 单步, 赢额 0', () => {
  const r = run(cfgA(noWin, noWin));
  assert.equal(r.steps.length, 1); assert.equal(r.totalWin, 0); assert.equal(r.cost, 100); assert.equal(r.summary.featureTriggered, false);
});
test('5 个 S: 基础 Scatter 赢 50x 总投注, 赠送 20 次', () => {
  const cfg = cfgA(allS(), noWin);
  const r = run(cfg);
  const b = r.steps[0] as BaseSpinStepA;
  assert.equal(b.scatter!.count, 5); assert.equal(b.scatter!.win, 50 * 100); assert.equal(b.trigger!.freeSpins, 20);
  assert.equal(r.summary.fsSpinsPlayed, 20); assert.equal(r.steps.length, 21);
});
test('Scatter 不乘倍数; 阶梯在无线赢(仅 Scatter)时重置; 重触发', () => {
  // FS 轴带:全 S 轴带 -> 每次旋转 5S(Scatter 50x), 但无线赢 -> c 恒为 0, 且每次重触发 +12
  const cfg = cfgA(allS(), allS(), { maxWinMult: 1e9 });
  const r = run(cfg);
  const fs = r.steps.filter(s => s.kind === 'A_fs_spin') as FsSpinStepA[];
  assert.ok(fs.length === 60, `fs=${fs.length}`); // 20 + 12*k 截断到 60
  assert.ok(fs.every(s => s.multiplier === 1 && s.ladderAfter === 0 && s.win === 5000));
  assert.equal(r.summary.fsSpinsAwardedTotal, 60);
  assert.equal(fs.at(-1)!.retrigger!.added, 0); // 已到 60 上限: 不追加但仍支付
  assert.equal(r.totalWin, 5000 + 60 * 5000);
  assert.equal(fs[0].remainingBefore, 20); assert.equal(fs[0].remainingAfter, 19 + 12);
});
test('60 次上限: 部分追加(截断)', () => {
  const r = run(cfgA(allS(), allS(), { maxWinMult: 1e9 }));
  const fs = r.steps.filter(s => s.kind === 'A_fs_spin') as FsSpinStepA[];
  const partial = fs.find(s => s.retrigger && s.retrigger.added > 0 && s.retrigger.added < s.retrigger.requested)!;
  assert.ok(partial, '应出现 added<requested 的截断追加'); // 20+12*3=56 -> 再 +12 只加 4
  assert.equal(partial.retrigger!.added, 4); assert.equal(partial.retrigger!.totalAwarded, 60);
});
test('阶梯 1,2,3,5,5...: 全 H1 轴带每次都有线赢', () => {
  // FS 轴带全 H1 (无 S): 20 线 * 5连 500x线投注 = 巨额, 关掉上限观察阶梯
  const allH1 = rep(['H1', 'H1', 'H1']);
  const cfg = cfgA(allS(), allH1, { maxWinMult: 1e12 });
  const r = run(cfg);
  const fs = r.steps.filter(s => s.kind === 'A_fs_spin') as FsSpinStepA[];
  assert.deepEqual(fs.slice(0, 6).map(s => s.multiplier), [1, 2, 3, 5, 5, 5]);
  assert.deepEqual(fs.slice(0, 5).map(s => s.ladderIndex), [0, 1, 2, 3, 3]);
  assert.equal(fs[0].lineTotalRaw, 20 * 500 * 5); assert.equal(fs[1].lineTotalMultiplied, fs[1].lineTotalRaw * 2);
});
test('5000x 上限: 截断, 立即结束, 剩余 FS 作废', () => {
  const allH1 = rep(['H1', 'H1', 'H1']);
  const r = run(cfgA(allS(), allH1));
  assert.equal(r.capped, true); assert.equal(r.totalWin, 5000 * 100); assert.equal(r.maxWin, 500000);
  const last = r.steps.at(-1)!; assert.equal(last.capped, true); assert.equal(last.cumulativeWin, 500000);
  assert.ok(r.steps.length < 21);
  // 逐步: 累计 == 各步 win 之和
  assert.equal(r.steps.reduce((a, s) => a + s.win, 0), r.totalWin);
});
test('基础旋转即触顶: 不进入 Free Spins', () => {
  const allH1 = rep(['H1', 'H1', 'H1']);
  // 基础轴带: 仅 reel1-3 为 S... 构造: 全 H1 基础会触顶, 且无 S
  // 全 H1: 20 线×500×线投注 = 500x 总投注;把上限设为 100x 以构造基础旋转触顶且同时有 5 个 S 的情形不可行,故只验证触顶即结束
  const r = run(cfgA(allH1, noWin, { maxWinMult: 100 }));
  assert.equal(r.steps.length, 1); assert.equal(r.capped, true); assert.equal(r.totalWin, 100 * 100);
});
test('购买: 价格 = priceMult×bet(测试配置 75x), 直接 8 次 FS, 无基础旋转, 无触发 Scatter 赢', () => {
  const r = run(cfgA(allS(), noWin), { game: 'A', bet: 100, mode: 'buy' });
  assert.equal(r.cost, 7500); assert.equal(r.summary.baseWin, 0);
  assert.equal(r.steps[0].kind, 'A_fs_spin'); assert.equal(r.summary.fsSpinsAwardedTotal, 8); assert.equal(r.summary.fsSpinsPlayed, 8);
  assert.equal(r.totalWin, 0);
});
test('购买关闭时拒绝; 非法投注拒绝', () => {
  assert.throws(() => run(cfgA(noWin, noWin, { buy: { enabled: false, priceMult: 75, initialSpins: 8, disclaimer: '' } }), { game: 'A', bet: 100, mode: 'buy' }));
  assert.throws(() => run(cfgA(noWin, noWin), { game: 'A', bet: 30, mode: 'normal' }));
  assert.throws(() => run(cfgA(noWin, noWin), { game: 'B', bet: 100, mode: 'normal' }));
});
test('配置校验: W 在轴1/5、S 间距、FS 的 S 比例', () => {
  assert.throws(() => cfgCheck(rep(['W', 'L1', 'L2']), noWin));
  assert.throws(() => cfgCheck(rep(['S', 'S', 'L1', 'L2']), noWin));
  assert.throws(() => cfgCheck(noWin, allS())); // FS S 比例 > BASE
});
function cfgCheck(b: string[][], f: string[][]) { return engA(cfgA(b, f), 1); }

test('可复现: 同种子同结果; setRngState(stateBefore) 重放一致', () => {
  const a = engA(configA, 'abc'), b = engA(configA, 'abc');
  for (let i = 0; i < 300; i++) {
    const ra = a.play({ game: 'A', bet: 100, mode: 'normal' }), rb = b.play({ game: 'A', bet: 100, mode: 'normal' });
    assert.deepEqual(ra, rb);
  }
  const r1 = a.play({ game: 'A', bet: 200, mode: 'normal' });
  const c = engA(configA, 'zzz'); c.setRngState(r1.rng.stateBefore);
  const r2 = c.play({ game: 'A', bet: 200, mode: 'normal' });
  assert.equal(r2.totalWin, r1.totalWin); assert.deepEqual(r2.steps, r1.steps); assert.equal(r2.rng.stateAfter, r1.rng.stateAfter);
});
test('整数金额 & 守恒: 所有金额为整数, 各步 win 之和 = totalWin, cumulative 单调', () => {
  const e = engA(configA, 99);
  for (let i = 0; i < 20000; i++) {
    const bet = [20, 40, 100, 200, 400, 1000][i % 6];
    const r = e.play({ game: 'A', bet, mode: i % 50 === 0 ? 'buy' : 'normal' });
    let sum = 0, prev = 0;
    for (const s of r.steps) {
      assert.ok(Number.isInteger(s.win)); sum += s.win; assert.ok(s.cumulativeWin >= prev); prev = s.cumulativeWin; assert.equal(s.cumulativeWin, sum);
    }
    assert.equal(sum, r.totalWin); assert.ok(r.totalWin <= r.maxWin); assert.ok((r.summary.fsSpinsAwardedTotal ?? 0) <= 60);
    assert.equal(r.capped, r.totalWin === r.maxWin);
  }
});
test('实际配置: 轴带约束已校验(createEngine 不抛错), 购买价与上限', () => {
  assert.equal(configA.maxWinMult, 5000); assert.equal(configA.fs.maxTotal, 60); assert.deepEqual(configA.fs.ladder, [1, 2, 3, 5]);
});
test('基础旋转 5 S 触发但 Scatter 赢即触顶: 不进入 Free Spins', () => {
  const r = run(cfgA(allS(), noWin, { maxWinMult: 10 })); // Scatter 50x > 10x
  assert.equal(r.steps.length, 1); assert.equal(r.capped, true); assert.equal(r.totalWin, 1000); assert.equal(r.summary.featureTriggered, false);
  assert.ok((r.steps[0] as BaseSpinStepA).trigger); // 触发条件满足但整局已结束
});
