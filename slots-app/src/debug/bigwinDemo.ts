import type { Shell } from '../ui/Shell';
import { TIER_ORDER, isTier, type Tier } from '../showcase/timeline';
import { showcaseStats } from './stats';
import { lastRun } from '../showcase/guard';

/**
 * 仅 dev / debug 构建(main.ts 里用 import.meta.env 字面量守卫的动态 import,prod 构建整块被裁掉):
 *   window.__slots.playBigWin(tier, amount?)  —— 按当前玩法 view.bigWin 解析档位,构造假结算并播放演出;**不改余额与存档**。
 *   ?force=big|mega|epic|max 启动后自动调用一次;?force=bigwin 依次播放四档。
 */
export function installBigWinDemo(shell: Shell, auto: Tier | 'bigwin' | null) {
  const w = window as unknown as { __slots?: Record<string, unknown> };
  const playBigWin = async (tier: Tier, amount?: number) => {
    if (!isTier(tier)) throw new Error('tier must be big|mega|epic|max');
    for (let i = 0; i < 100 && shell.isBusy; i++) await new Promise(r => setTimeout(r, 100));   // 等当前局结束
    const view = shell.module.view; const bet = shell.bet;
    const t = view.bigWin.find(x => x.tier === tier);
    if (!t) throw new Error('no such tier in current game');
    const totalWin = amount ?? Math.round(bet * t.minMult * (tier === 'max' ? 1.35 : 1.6));
    await shell.playShowcase(t.showcase, tier, { totalWin, bet });
    return { tier, totalWin, bet, showcase: t.showcase };
  };
  const o = (w.__slots ??= {});
  o.playBigWin = playBigWin; o.showcaseStats = showcaseStats; o.showcaseLast = lastRun;
  if (auto) void (async () => { if (auto === 'bigwin') { for (const t of TIER_ORDER) await playBigWin(t); } else await playBigWin(auto); })();
}
