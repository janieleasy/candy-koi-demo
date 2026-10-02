import { createEngine } from '@engine/index';
import { configA } from '@engine-config/gameA';
import type { AppGameModule, AppPresentContext } from '../../core/types';
import type { EngineState, RoundStateA } from '@engine/index';
import { viewA } from './view';
import { anticipationA, beginA, presentersA, spinPlanA } from './presenters';

const engine = createEngine(configA);

/** 玩法 A 模块:数学配置 + 判定器(引擎适配)+ 展示配置 + 表现钩子 */
const gameA: AppGameModule<typeof configA> = {
  id: 'A',
  mathConfig: configA,
  evaluator: { id: 'A', engine, validateConfig: () => { /* createEngine 已在构造时校验 */ } },
  view: viewA,
  presenters: presentersA,
  begin: beginA,
  spinPlan: spinPlanA,
  anticipation: anticipationA,
  restore(state: EngineState, ctx: AppPresentContext) {
    const { stage } = ctx;
    const r = state.round as RoundStateA | null;
    stage.coins.clear();
    if (!r) { stage.setPhase('base'); void stage.setBackground('base'); return; }
    const inFs = r.next === 'A_fs_spin';
    stage.winBar.amount.setValue(r.cumulativeWin);
    if (inFs) {
      stage.setPhase('fs'); void stage.setBackground('fs');
      const p = stage.fsPanelRef;
      p?.remaining.setValue(r.fs.remaining); p?.total.setValue(r.cumulativeWin); p?.setLadder(r.fs.ladderIndex);
    }
  },
  reset(ctx: AppPresentContext) {
    ctx.stage.lines.clear();
    ctx.stage.setPhase('base');
    ctx.stage.winBar.amount.setValue(0);
  },
};
export default gameA;
