import { createEngine } from '@engine/index';
import { configB } from '@engine-config/gameB';
import type { EngineState, RoundStateB } from '@engine/index';
import type { AppGameModule, AppPresentContext } from '../../core/types';
import { viewB } from './view';
import { beginB, presentersB, spinPlanB } from './presenters';

const engine = createEngine(configB);

/** 玩法 B 模块 */
const gameB: AppGameModule<typeof configB> = {
  id: 'B',
  mathConfig: configB,
  evaluator: { id: 'B', engine, validateConfig: () => { /* createEngine 已在构造时校验 */ } },
  view: viewB,
  presenters: presentersB,
  begin: beginB,
  spinPlan: spinPlanB,
  restore(state: EngineState, ctx: AppPresentContext) {
    const { stage } = ctx;
    const r = state.round as RoundStateB | null;
    stage.coins.clear();
    if (!r) { stage.setPhase('base'); stage.reels.setGhostFiller(false); void stage.setBackground('base'); return; }
    stage.winBar.amount.setValue(r.cumulativeWin);
    stage.setPhase('hs'); void stage.setBackground('hs');
    stage.reels.blank(); stage.reels.setGhostFiller(true);
    // next = B_hs_enter 时尚未展示过 H&S 过场,锁币由 enter 步展示,这里不预放
    if (r.next !== 'B_hs_enter') {
      stage.coins.setMany(r.hs.locked);
      stage.hsHeaderRef?.set(r.hs.locked.length, r.hs.R);
    } else {
      // 基础旋转的盘面没有存档:用触发币(位置+币值取自 hs.locked)+ 填充符号重建一个等价盘面
      stage.setPhase('base'); void stage.setBackground('base'); stage.reels.setGhostFiller(false);
      stage.coins.clear();
      const fill = Object.keys(viewB.symbols);
      const grid = Array.from({ length: 5 }, (_, c) => Array.from({ length: 3 }, (_, rw) => ({ id: fill[(c * 3 + rw * 2 + 1) % fill.length] } as { id: string; coin?: import('@engine/index').CoinValue })));
      for (const c of r.hs.locked) grid[c.reel][c.row] = { id: 'C', coin: c.value };
      stage.reels.showGrid(grid);
    }
  },
  reset(ctx: AppPresentContext) {
    ctx.stage.lines.clear();
    ctx.stage.coins.clear();
    ctx.stage.reels.setGhostFiller(false);
    ctx.stage.setPhase('base');
    ctx.stage.winBar.amount.setValue(0);
  },
};
export default gameB;
