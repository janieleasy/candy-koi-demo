/** 两个玩法共用的展示辅助。presenters 只看 Step,不碰引擎。 */
import type { Coin, LineWin, ScatterWin, Step } from '@engine/index';
import type { AppPresentContext } from '../core/types';
import type { CellSpec } from '../render/SymbolView';
import { fmt, sleep } from '../core/utils';
import { WIN_BAR } from '../render/layout';
import { t } from '../core/i18n';

/** Turbo 时缩短时长 */
export const dur = (ctx: AppPresentContext, ms: number) => (ctx.turbo ? ms * 0.45 : ms);
export const wait = (ctx: AppPresentContext, ms: number) => sleep(dur(ctx, ms), ctx.skip);

export function gridToCells(grid: string[][], coinAt?: Map<string, Coin>): CellSpec[][] {
  return grid.map((col, reel) => col.map((id, row) => {
    if (id === 'C') {
      const c = coinAt?.get(`${reel},${row}`);
      return c ? { id, coin: c.value } : { id };
    }
    return { id };
  }));
}

/**
 * 通用“线赢 + Scatter”展示:总览脉冲 → 逐线高亮 → 赢额滚动。
 * `cumulative` 为本步之后的整局累计赢额(局中只显示累计,不显示最终入账)。
 */
export async function presentLineWins(
  ctx: AppPresentContext,
  step: Step,
  o: { lineWins: LineWin[]; scatter: ScatterWin | null; cumulative: number; stepWin: number },
): Promise<void> {
  const { stage, bus } = ctx;
  const has = o.lineWins.length > 0 || !!o.scatter;
  if (!has || o.stepWin <= 0 && o.cumulative === stage.winBar.amount.value) {
    stage.winBar.amount.setValue(o.cumulative);
    return;
  }
  bus.emit('win:present', { amount: o.stepWin, cumulative: o.cumulative });
  const n = Math.max(1, o.lineWins.length);
  const perLine = dur(ctx, Math.max(320, Math.min(650, 4200 / n)));
  const roll = stage.winBar.amount.rollTo(o.cumulative, dur(ctx, 900), ctx.skip);
  const showing = stage.lines.present(o.lineWins, o.scatter, {
    overviewMs: dur(ctx, 800), perLineMs: perLine, signal: ctx.skip,
    onLine: line => bus.emit('win:line', { step, line }),
  });
  await Promise.all([roll, showing]);
  stage.winBar.amount.setValue(o.cumulative);
}

/** 终局后继续循环展示线赢(直到下一次 spin 前被 clear) */
export function loopWinsInIdle(ctx: AppPresentContext, lineWins: LineWin[], scatter: ScatterWin | null) {
  if (lineWins.length === 0 && !scatter) return;
  void ctx.stage.lines.loop(lineWins, scatter);
}

export function winBarPoint() { return { x: WIN_BAR.x + 450, y: WIN_BAR.y + 66 }; }

export function capToast(ctx: AppPresentContext, step: Step) {
  if (step.capped) ctx.ui.toast(t('toast.cap', { n: fmt(step.cumulativeWin) }), 2600);
}
