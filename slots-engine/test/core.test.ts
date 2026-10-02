import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Rng, WeightedTable } from '../src/rng.js';
import { evalLines, window3, applyCap, buildGrid } from '../src/core.js';
import { PAYLINES_A, PAYLINES_B } from '../scripts/paylines.js';

const PAY_A: any = { H1: [20, 100, 500], H2: [15, 60, 250], L5: [1, 5, 20], L1: [3, 12, 50] };
// grid[reel][row]
const mk = (rows: string[][]) => rows; // alias

test('RNG: 同种子同序列;状态可保存/恢复', () => {
  const a = new Rng('x'), b = new Rng('x');
  for (let i = 0; i < 100; i++) assert.equal(a.u32(), b.u32());
  const st = a.getState(); const v = [a.u32(), a.int(37), a.float()];
  a.setState(st); assert.deepEqual([a.u32(), a.int(37), a.float()], v);
  assert.notEqual(new Rng('x').u32(), new Rng('y').u32());
  assert.throws(() => a.setState('zz'));
});
test('RNG: int(n) 均匀(卡方)', () => {
  const r = new Rng(7); const n = 13, N = 260000; const c = new Array(n).fill(0);
  for (let i = 0; i < N; i++) c[r.int(n)]++;
  const e = N / n; const chi = c.reduce((a, x) => a + (x - e) ** 2 / e, 0);
  assert.ok(chi < 32.9, `chi2=${chi}`); // df=12, p=0.001 -> 32.9
});
test('WeightedTable 频率与权重一致', () => {
  const t = new WeightedTable([1, 3, 6]); const r = new Rng(3); const c = [0, 0, 0]; const N = 200000;
  for (let i = 0; i < N; i++) c[t.pick(r)]++;
  assert.ok(Math.abs(c[0] / N - 0.1) < 0.005 && Math.abs(c[1] / N - 0.3) < 0.006 && Math.abs(c[2] / N - 0.6) < 0.006);
});
test('window3 循环', () => {
  assert.deepEqual(window3(['a', 'b', 'c', 'd'], 3), ['d', 'a', 'b']);
  assert.deepEqual(buildGrid([['a', 'b', 'c', 'd']], [2]), [['c', 'd', 'a']]);
});

function gridWithLine(line: number, seq: string[], filler = 'L4'): string[][] {
  const g: string[][] = Array.from({ length: 5 }, () => [filler, filler, filler]);
  PAYLINES_A[line].forEach((row, reel) => (g[reel][row] = seq[reel]));
  return g;
}
const ev = (g: string[][], pay = PAY_A, wild: string | undefined = 'W') => evalLines(g as any, PAYLINES_A, { wild, paytable: pay, lineBet: 5 });

test('线赢: 3/4/5 连, 只取最长, 2 连不赔', () => {
  let w = ev(gridWithLine(0, ['H1', 'H1', 'H1', 'L5', 'L1'], 'L2')); // 中行
  assert.equal(w.length, 1); assert.equal(w[0].count, 3); assert.equal(w[0].payMult, 20); assert.equal(w[0].win, 100);
  w = ev(gridWithLine(0, ['H1', 'H1', 'H1', 'H1', 'L1'], 'L2')); assert.equal(w[0].count, 4); assert.equal(w[0].payMult, 100);
  w = ev(gridWithLine(0, ['H1', 'H1', 'H1', 'H1', 'H1'], 'L2')); assert.equal(w[0].count, 5); assert.equal(w[0].payMult, 500);
  w = ev(gridWithLine(0, ['H1', 'H1', 'L5', 'H1', 'H1'], 'L2')); assert.equal(w.length, 0);
});
test('Wild 替代, 不替代 S; S 中断; 线以 S 开头不赢', () => {
  let w = ev(gridWithLine(0, ['H2', 'W', 'W', 'H2', 'L1'], 'L2'));
  assert.equal(w[0].count, 4); assert.equal(w[0].symbol, 'H2');
  w = ev(gridWithLine(0, ['H2', 'W', 'S', 'W', 'W'], 'L2')); assert.equal(w.length, 0);
  w = ev(gridWithLine(0, ['S', 'W', 'W', 'W', 'W'], 'L2')); assert.equal(w.length, 0);
  // W 在中间,右侧是不同图案:按 X=H2 计到 W 为止
  w = ev(gridWithLine(0, ['H2', 'W', 'W', 'L1', 'L1'], 'L2')); assert.equal(w[0].count, 3);
});
test('B: 无 Wild, C 中断连线, 线首为 C 不赢', () => {
  const PAY_B: any = { H1: [25, 100, 400], L1: [4, 15, 50] };
  const g = gridWithLine(0, ['H1', 'H1', 'C', 'H1', 'H1'], 'L1');
  const lines = PAYLINES_B;
  const w = evalLines(g as any, lines, { paytable: PAY_B, lineBet: 10 });
  // 只有第 1 线(中行)被 C 打断 -> 不赢;其它行 L1 填充会赢
  assert.ok(!w.some(x => x.line === 1));
  const g2 = gridWithLine(0, ['C', 'H1', 'H1', 'H1', 'H1'], 'L1');
  assert.ok(!evalLines(g2 as any, lines, { paytable: PAY_B, lineBet: 10 }).some(x => x.line === 1));
});
test('20 条线: 全部同图案时每条线 5 连', () => {
  const g = Array.from({ length: 5 }, () => ['L1', 'L1', 'L1']);
  const w = ev(g); assert.equal(w.length, 20); assert.ok(w.every(x => x.count === 5 && x.payMult === 50));
});
test('同格被多条线共用, 不去重', () => {
  const g = Array.from({ length: 5 }, () => ['L1', 'L1', 'L1']);
  const w = ev(g); const total = w.reduce((a, x) => a + x.win, 0); assert.equal(total, 20 * 50 * 5);
});
test('赔付线定义正确(20/10 条, 每轴行号在 0..2)', () => {
  assert.equal(PAYLINES_A.length, 20); assert.equal(PAYLINES_B.length, 10);
  for (const l of PAYLINES_A) { assert.equal(l.length, 5); l.forEach(r => assert.ok(r >= 0 && r <= 2)); }
  assert.deepEqual(PAYLINES_A[19], [1, 0, 2, 0, 1]); assert.deepEqual(PAYLINES_A[5], [0, 0, 1, 2, 2]);
  assert.equal(new Set(PAYLINES_A.map(l => l.join())).size, 20);
});
test('applyCap: 触顶截断', () => {
  assert.deepEqual(applyCap(0, 50, 100), { win: 50, cum: 50, capped: false });
  assert.deepEqual(applyCap(80, 50, 100), { win: 20, cum: 100, capped: true });
  assert.deepEqual(applyCap(0, 100, 100), { win: 100, cum: 100, capped: true });
});
