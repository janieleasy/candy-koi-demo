import type { BaseSpinStepB, Coin, HsEnterStep, HsRespinStep, HsSettleStep, Step, JackpotTier } from '@engine/index';
import type { AppPresentContext, Presenter, SpinPlan } from '../../core/types';
import type { CellSpec } from '../../render/SymbolView';
import { gridToCells, presentLineWins, wait, dur, capToast } from '../common';
import { t } from '../../core/i18n';
import { fmt, sleep } from '../../core/utils';
import { WIN_SLOT, W } from '../../render/layout';

const keyOf = (c: { reel: number; row: number }) => `${c.reel},${c.row}`;

export function spinPlanB(step: Step, ctx: AppPresentContext): SpinPlan | null {
  if (step.kind === 'B_base_spin') {
    const m = new Map<string, Coin>(step.coins.map(c => [keyOf(c), c]));
    return { grid: gridToCells(step.grid, m) };
  }
  if (step.kind === 'B_hs_respin') {
    // H&S 重转:锁定格由 CoinLayer 盖住;转轴只需给“新落币”和空格。已锁的格也给 null。
    const prev = new Set(ctx.stage.coins.coins.map(keyOf));
    const grid: (CellSpec | null)[][] = Array.from({ length: 5 }, () => [null, null, null]);
    for (const c of step.newCoins) grid[c.reel][c.row] = { id: 'C', coin: c.value };
    // 哪些轴要转:该轴至少有一个空格(未锁定格)
    const spinReels = [0, 1, 2, 3, 4].map(c => [0, 1, 2].some(r => !prev.has(`${c},${r}`)));
    return { grid: grid as CellSpec[][], spinReels, ghost: true };
  }
  return null;
}

export const beginB: Record<string, (step: Step, ctx: AppPresentContext) => void> = {
  B_hs_respin(step, ctx) {
    const s = step as HsRespinStep;
    ctx.bus.emit('feature:progress', { kind: 'hold_and_spin', K: s.K - s.newCoins.length, R: s.R });
  },
};

const baseSpin: Presenter = async (step, ctx) => {
  const s = step as BaseSpinStepB;
  await presentLineWins(ctx, s, { lineWins: s.lineWins, scatter: null, cumulative: s.cumulativeWin, stepWin: s.win });
  if (s.trigger) {
    // 触发:全部 C 脉冲
    ctx.stage.reels.highlight(s.coins.map(c => ({ reel: c.reel, row: c.row })));
    ctx.ui.toast(t('banner.hs.sub', { k: s.trigger.startCoins, r: 3 }), 1400);
    await wait(ctx, 1000);
  }
  capToast(ctx, s);
};

const hsEnter: Presenter = async (step, ctx) => {
  const s = step as HsEnterStep;
  const { stage, ui, bus } = ctx;
  bus.emit('feature:enter', { kind: 'hold_and_spin', startCoins: s.K });
  stage.lines.clear();
  stage.setPhase('hs');
  const bg = stage.setBackground('hs');
  stage.hsHeaderRef?.set(0, s.R);
  stage.winBar.amount.setValue(s.cumulativeWin);
  await Promise.race([bg, wait(ctx, 1500)]);
  await ui.banner({ kind: 'hs', title: t('banner.hs.title'), sub: t('banner.hs.sub', { k: s.K, r: s.R }), ms: dur(ctx, 1900), signal: ctx.skip });
  // 盘面清空为空格,锁币逐个弹出(buy 开局时从无到有;trigger 时对应基础盘面的 C)
  stage.reels.blank();
  stage.coins.clear();
  stage.reels.setGhostFiller(true);
  for (const c of s.locked) {
    bus.emit('coin:lock', { reel: c.reel, row: c.row, payMult: c.payMult, ...(c.value.kind === 'jp' ? { jackpot: c.value.tier } : {}) });
    void stage.coins.add(c, !ctx.skip.aborted);
    stage.hsHeaderRef?.set(stage.coins.count, s.R);
    await sleep(dur(ctx, 110), ctx.skip);
  }
  stage.hsHeaderRef?.set(s.K, s.R);
  await wait(ctx, 400);
};

const hsRespin: Presenter = async (step, ctx) => {
  const s = step as HsRespinStep;
  const { stage, bus } = ctx;
  const h = stage.hsHeaderRef;
  const adds: Promise<void>[] = [];
  for (const c of s.newCoins) {
    bus.emit('coin:lock', { reel: c.reel, row: c.row, payMult: c.payMult, ...(c.value.kind === 'jp' ? { jackpot: c.value.tier } : {}) });
    adds.push(stage.coins.add(c, !ctx.skip.aborted, ctx.skip));
    h?.set(stage.coins.count, s.R);
    await sleep(dur(ctx, 120), ctx.skip);
  }
  await Promise.all(adds);
  // 转轴上遗留的那几格(新币)清空,由 CoinLayer 负责显示
  stage.reels.blank();
  h?.set(s.K, s.R);
  if (s.newCoins.length > 0) await h?.bumpDots();
  bus.emit('feature:progress', { kind: 'hold_and_spin', K: s.K, R: s.R });
  await wait(ctx, s.newCoins.length > 0 ? 450 : 250);
};

const hsSettle: Presenter = async (step, ctx) => {
  const s = step as HsSettleStep;
  const { stage, bus, ui } = ctx;
  const base = s.cumulativeWin - s.win;               // 基础线赢(已在累计里)
  const amount = stage.winBar.amount;
  amount.setValue(base);
  let acc = base;
  const target = { x: WIN_SLOT.x, y: WIN_SLOT.y };
  for (const p of s.payouts) {
    if (ctx.skip.aborted) break;
    const from = stage.coins.absPos(p.pos);
    const coin = stage.coins.coins.find(c => c.reel === p.pos.reel && c.row === p.pos.row);
    const frame = coin ? stage.coinFrameFor(coin.value) : 'C_coin_base';
    bus.emit('coin:fly', { reel: p.pos.reel, row: p.pos.row, payMult: p.payMult });
    await stage.coins.pulse(p.pos, ctx.skip);
    stage.coins.consume(p.pos);
    const label = p.jackpot ? jpName(p.jackpot) : `${p.payMult}×`;
    await stage.flyCoin(frame, from, target, dur(ctx, 380), label, ctx.skip);
    acc += p.win;
    await amount.rollTo(Math.min(acc, s.cumulativeWin), dur(ctx, 160), ctx.skip);
    amount.pop();
  }
  if (s.fullScreenBonus && !ctx.skip.aborted) {
    void stage.floatText(t('banner.hs.full', { n: fmt(s.fullScreenBonus.win) }), { x: W / 2, y: 780 }, dur(ctx, 1400), 0xffe066, 56);
    await wait(ctx, 700);
  }
  await amount.rollTo(s.cumulativeWin, dur(ctx, 300), ctx.skip);   // 截断/跳过:落到最终累计
  amount.setValue(s.cumulativeWin);
  capToast(ctx, s);
  bus.emit('feature:exit', { kind: 'hold_and_spin', total: s.cumulativeWin });
  await ui.banner({ kind: 'end', title: t('banner.hs.end'), sub: t('banner.total', { n: fmt(s.cumulativeWin) }), ms: dur(ctx, 1700), signal: ctx.skip });
  stage.coins.clear();
  stage.reels.setGhostFiller(false);
  stage.setPhase('base');
  void stage.setBackground('base');
};

function jpName(tier: JackpotTier): string { return t(`jp.${tier}` as const); }

export const presentersB: Record<string, Presenter> = {
  B_base_spin: baseSpin,
  B_hs_enter: hsEnter,
  B_hs_respin: hsRespin,
  B_hs_settle: hsSettle,
};
