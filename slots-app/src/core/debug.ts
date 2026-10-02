/**
 * 调试开关(仅 dev,或构建时 VITE_ENABLE_DEBUG=1):?game=A|B  ?seed=xxx  ?force=fs|hs  ?reset=1  ?lang=en
 *   大赢演出:?force=big|mega|epic|max|bigwin(进入页面后自动演示一次/依次演示四档;只播放演出,不改余额与存档)  ?quality=high|medium|low(强制质量档并关闭自适应)  ?noprefetch
 */
import type { GameId } from '@engine/index';
import type { Quality } from '../showcase/quality';
import type { Tier } from '../showcase/timeline';

export interface DebugParams {
  enabled: boolean;
  game: GameId | null;
  seed: string | null;
  force: 'fs' | 'hs' | null;
  /** ?force=big|mega|epic|max|bigwin:启动后自动演示大赢(bigwin = 依次演示四档) */
  demo: Tier | 'bigwin' | null;
  quality: Quality | null;
  reset: boolean;
  lang: 'zh' | 'en' | null;
}

export function debugEnabled(): boolean {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === '1');
  } catch { return false; }
}

/** 构建期常量:prod 构建里 import.meta.env 被字面量替换,下面用它守卫的代码会被整块剔除。 */
export const NO_DEBUG: DebugParams = { enabled: false, game: null, seed: null, force: null, demo: null, quality: null, reset: false, lang: null };

export function parseDebug(search: string, enabled = debugEnabled()): DebugParams {
  const none: DebugParams = { enabled, game: null, seed: null, force: null, demo: null, quality: null, reset: false, lang: null };
  if (!enabled) return none;
  const q = new URLSearchParams(search);
  const g = (q.get('game') ?? '').toUpperCase();
  const f = (q.get('force') ?? '').toLowerCase();
  const l = q.get('lang');
  return {
    enabled,
    game: g === 'A' || g === 'B' ? g : null,
    seed: q.get('seed') || null,
    force: f === 'fs' || f === 'hs' ? f : null,
    demo: f === 'big' || f === 'mega' || f === 'epic' || f === 'max' || f === 'bigwin' ? f : null,
    quality: ['high', 'medium', 'low'].includes((q.get('quality') ?? '').toLowerCase()) ? (q.get('quality')!.toLowerCase() as Quality) : null,
    reset: q.get('reset') === '1',
    lang: l === 'en' || l === 'zh' ? l : null,
  };
}

/** force/reset 是一次性的:消费后从地址栏移除,避免刷新时反复触发 */
export function stripParams(...names: string[]) {
  try {
    const u = new URL(location.href);
    let changed = false;
    for (const n of names) if (u.searchParams.has(n)) { u.searchParams.delete(n); changed = true; }
    if (changed) history.replaceState(null, '', u.toString());
  } catch { /* ignore */ }
}

export function randomSeed(): string {
  const a = new Uint32Array(2);
  (globalThis.crypto ?? undefined)?.getRandomValues?.(a);
  return `s${(a[0] || Math.floor(Math.random() * 2 ** 32)).toString(36)}${(a[1] || Date.now()).toString(36)}`;
}
