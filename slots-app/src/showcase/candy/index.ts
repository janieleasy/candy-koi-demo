import type { ShowcasePlugin, ShowcaseContext } from '@spec/client';
import { chooseQuality, readEnv } from '../quality';
import { showcaseOptions } from '../config';
import { Session } from './session';
import { ShowcaseFallback } from '../errors';

export { lastQuality } from './session';
export { stats as showcaseStats } from './tracker';

/**
 * 糖果甜心大赢演出(three.js 块)。每次 play 使用独立 Session(独占 renderer / 资源),结束或出错即 dispose(幂等);
 * 插件实例会被注册表缓存,所以这里不在实例上持有 GPU 资源。
 */
export function createCandyShowcase(id: string): ShowcasePlugin {
  let current: Session | null = null;
  return {
    id,
    async load() { /* 素材在 play 时按档位加载 */ },
    async play(ctx: ShowcaseContext) {
      const choice = chooseQuality(readEnv(showcaseOptions.forcedQuality));
      if (choice.backend === 'fallback') throw new ShowcaseFallback(choice.reason);
      current?.dispose();
      current = new Session(ctx, choice);
      try { await current.run(); } finally { current.dispose(); current = null; }
    },
    dispose() { current?.dispose(); current = null; },
  };
}
