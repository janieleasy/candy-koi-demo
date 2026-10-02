import type { BaseSpinStepA, FsEnterStepA, FsSpinStepA, Step } from '@engine/index';
import type { AppPresentContext, Presenter, SpinPlan } from '../../core/types';
import { gridToCells, presentLineWins, wait, dur, capToast } from '../common';
import { t } from '../../core/i18n';
import { fmt } from '../../core/utils';
import { W } from '../../render/layout';

/** A:盘面 → SpinPlan(基础旋转 / 免费旋转有转轴;过场步无) */
export function spinPlanA(step: Step): SpinPlan | null {
  if (step.kind === 'A_base_spin' || step.kind === 'A_fs_spin') return { grid: gridToCells(step.grid) };
  return null;
}

/** 糖果门预告钩子:前 c 根轴已出现 ≥2 个糖果门时,后面的轴额外延迟(拉长停轴,制造期待) */
export function anticipationA(step: Step): number[] | null {
  if (step.kind !== 'A_base_spin' && step.kind !== 'A_fs_spin') return null;
  const extra = [0, 0, 0, 0, 0];
  let seen = 0;
  for (let c = 0; c < 5; c++) {
    if (c >= 2 && seen >= 2) extra[c] = 420;
    seen += step.grid[c].filter(s => s === 'S').length;
  }
  return extra.some(x => x > 0) ? extra : null;
}

export const beginA: Record<string, (step: Step, ctx: AppPresentContext) => void> = {
  A_fs_spin(step, ctx) {
    const s = step as FsSpinStepA;
    const p = ctx.stage.fsPanelRef;
    if (!p) return;
    p.remaining.setValue(Math.max(0, s.remainingBefore - 1)); // 本次已开始,剩余 = 不含本次
    p.setLadder(s.ladderIndex);
    p.total.setValue(s.cumulativeWin - s.win);
    ctx.bus.emit('feature:progress', { kind: 'free_spins', remaining: s.remainingBefore - 1, ladder: s.ladderIndex });
  },
};

const baseSpin: Presenter = async (step, ctx) => {
  const s = step as BaseSpinStepA;
  await presentLineWins(ctx, s, { lineWins: s.lineWins, scatter: s.scatter, cumulative: s.cumulativeWin, stepWin: s.win });
  if (s.trigger) {
    ctx.ui.toast(t('banner.gate', { n: s.scatter?.count ?? 3 }), 1200);
    await wait(ctx, 700);
  }
  capToast(ctx, s);
};

const fsEnter: Presenter = async (step, ctx) => {
  const s = step as FsEnterStepA;
  const { stage, ui, bus } = ctx;
  bus.emit('feature:enter', { kind: 'free_spins', awarded: s.awarded });
  stage.setPhase('fs');
  const bg = stage.setBackground('fs');
  const p = stage.fsPanelRef;
  p?.remaining.setValue(s.awarded); p?.total.setValue(s.cumulativeWin); p?.setLadder(0);
  stage.winBar.amount.setValue(s.cumulativeWin);
  await Promise.race([bg, wait(ctx, 1500)]);
  await ui.banner({
    kind: 'fs', title: t('banner.fs.title'),
    sub: t(s.source === 'buy' ? 'banner.fs.sub.buy' : 'banner.fs.sub', { n: s.awarded }),
    ms: dur(ctx, 2000), signal: ctx.skip,
  });
};

const fsSpin: Presenter = async (step, ctx) => {
  const s = step as FsSpinStepA;
  const { stage, ui, bus } = ctx;
  const p = stage.fsPanelRef;
  if (s.lineWins.length > 0 && s.multiplier > 1) void stage.floatText(`×${s.multiplier}`, { x: W / 2, y: 760 }, dur(ctx, 1000), 0xffe066, 110);
  await presentLineWins(ctx, s, { lineWins: s.lineWins, scatter: s.scatter, cumulative: s.cumulativeWin, stepWin: s.win });
  p?.total.rollTo(s.cumulativeWin, dur(ctx, 500), ctx.skip);
  if (p && s.ladderAfter !== s.ladderIndex) await p.bumpLadder(s.ladderAfter);
  else p?.setLadder(s.ladderAfter);
  if (s.retrigger) {
    const r = s.retrigger;
    p?.remaining.rollTo(s.remainingAfter, dur(ctx, 500), ctx.skip);
    await ui.banner({
      kind: 'info', title: `+${r.added}`,
      sub: r.added < r.requested ? t('banner.fs.retrigger.cap', { n: r.added, max: 60 }) : t('banner.fs.retrigger', { n: r.added }),
      ms: dur(ctx, 1500), signal: ctx.skip,
    });
  }
  p?.remaining.setValue(s.remainingAfter);
  bus.emit('feature:progress', { kind: 'free_spins', remaining: s.remainingAfter, ladder: s.ladderAfter });
  capToast(ctx, s);
  if (s.roundEnded) {
    bus.emit('feature:exit', { kind: 'free_spins', total: s.cumulativeWin });
    await ui.banner({ kind: 'end', title: t('banner.fs.end'), sub: t('banner.total', { n: fmt(s.cumulativeWin) }), ms: dur(ctx, 1800), signal: ctx.skip });
    stage.setPhase('base');
    void stage.setBackground('base');
  }
};

export const presentersA: Record<string, Presenter> = {
  A_base_spin: baseSpin,
  A_fs_enter: fsEnter,
  A_fs_spin: fsSpin,
};
