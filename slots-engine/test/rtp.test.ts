import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createEngine } from '../src/index.js';
import { configA } from '../config/gameA.js';
import { configB } from '../config/gameB.js';

// 回归:配置改动后 RTP 不得偏离目标区间(2M 局的 4σ 容差内)。完整 2 亿局结果见 report/。
function rtp(cfg: any, game: 'A' | 'B', mode: 'normal' | 'buy', n: number, seed: string) {
  const e = createEngine(cfg); let st = e.createState(seed); const bet = 100; let w = 0, c = 0, sq = 0;
  for (let i = 0; i < n; i++) { const r = e.playRound(st, { type: 'start', game, bet, mode }); st = r.state; w += r.settlement.totalWin; c += r.settlement.cost; sq += (r.settlement.totalWin / r.settlement.cost) ** 2; }
  const mean = w / c, sd = Math.sqrt(sq / n - mean * mean); return { mean, se: sd / Math.sqrt(n) };
}
for (const [cfg, g] of [[configA, 'A'], [configB, 'B']] as const) {
  for (const mode of ['normal', 'buy'] as const) {
    test(`RTP 回归 ${g}/${mode}: 在 [95.5%, 96.5%] 内(4σ 容差)`, () => {
      const { mean, se } = rtp(cfg, g, mode, 1_500_000, `rtp-${g}-${mode}`);
      assert.ok(mean + 4 * se >= 0.955 && mean - 4 * se <= 0.965, `rtp=${mean} se=${se}`);
      assert.ok(Math.abs(mean - 0.96) < 4 * se + 0.005, `rtp=${mean} se=${se}`);
    }, 120_000);
  }
}
