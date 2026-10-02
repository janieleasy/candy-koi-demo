import type { GameViewConfig, BigWinTier } from '@spec/client';
import type { JackpotTier } from '@engine/index';

/** 在 spec 的 GameViewConfig 上扩展本工程需要的展示字段(不改 spec)。 */
export interface AppBigWinTier extends BigWinTier { tier: string }
export interface AppViewConfig extends GameViewConfig {
  bigWin: AppBigWinTier[];
  /** 空闲初始盘面 [reel][row](仅视觉,与引擎无关;避免用轴带 stop 0 造成“满屏糖果门”的误导) */
  idleGrid: string[][];
  /** 本玩法在顶部信息带显示的内容 */
  band: 'fs' | 'jackpot';
  jackpotTiers?: JackpotTier[];
}
