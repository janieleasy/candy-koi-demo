import type { ShowcasePlugin, ShowcaseContext } from '@spec/client';
import { detectWebGL } from './quality';
import { showcaseOptions } from './config';
import { ShowcaseFallback } from './errors';

/**
 * 主包内的"守卫插件":three 块(./candy)只在这里被动态 import;任何失败都回退到 default-big(Canvas2D 占位),
 * 保证"大赢演出"永远不会阻塞主流程:
 *   - 不支持 WebGL2          → 直接回退(不加载 three 块)
 *   - three 块加载失败(离线/404) → 回退
 *   - play 抛错 / WebGL context lost(candy 抛 ShowcaseFallback) → 在新 canvas 上回退,时长用剩余时间
 */
export { ShowcaseFallback };
export interface GuardInfo { backend: 'three' | 'fallback'; reason: string; quality?: string }
export const lastRun: { current: GuardInfo | null; log: GuardInfo[] } = { current: null, log: [] };
const note = (i: GuardInfo) => { lastRun.current = i; if (showcaseOptions.debug) { lastRun.log.push(i); if (lastRun.log.length > 50) lastRun.log.shift(); } };

type CandyMod = typeof import('./candy');
let candyP: Promise<CandyMod | null> | null = null;
/** 懒加载 three 块;失败返回 null(并允许下次重试) */
export function loadCandy(): Promise<CandyMod | null> {
  candyP ??= import('./candy').catch(e => { console.warn('[showcase] three chunk load failed', e); candyP = null; return null; });
  return candyP;
}

async function runFallback(ctx: ShowcaseContext, remainingMs: number) {
  const { default: fb } = await import('./default-big');
  // 新 canvas:原 canvas 可能已被 WebGL 占用,无法再取 2d 上下文
  const old = ctx.canvas; const c = document.createElement('canvas'); c.width = old.width; c.height = old.height;
  old.isConnected ? old.replaceWith(c) : void 0;
  await fb.load();
  await fb.play({ ...ctx, canvas: c, durationMs: Math.max(700, remainingMs) });
  fb.dispose();
}

export function createGuardedPlugin(id: string): ShowcasePlugin {
  let real: ShowcasePlugin | null = null;
  return {
    id,
    async load() { /* 三块在 play 时才加载;预取由 prefetch.ts 负责 */ },
    async play(ctx) {
      const t0 = performance.now();
      if (ctx.skip.aborted) { return; }
      if (!detectWebGL()) { note({ backend: 'fallback', reason: 'no-webgl' }); return runFallback(ctx, ctx.durationMs); }
      const mod = await loadCandy();
      if (!mod) { note({ backend: 'fallback', reason: 'chunk-load-failed' }); return runFallback(ctx, ctx.durationMs); }
      if (ctx.skip.aborted) return;
      real = mod.createCandyShowcase(id);
      try {
        await real.play(ctx);
        note({ backend: 'three', reason: 'ok', quality: mod.lastQuality.current ?? undefined });
      } catch (e) {
        const reason = e instanceof ShowcaseFallback ? e.reason : 'error';
        if (!(e instanceof ShowcaseFallback)) console.error('[showcase] three play failed, fallback', e);
        try { real.dispose(); } catch { /* ignore */ }
        note({ backend: 'fallback', reason });
        if (ctx.skip.aborted) return;
        await runFallback(ctx, ctx.durationMs - (performance.now() - t0));
      }
    },
    dispose() { try { real?.dispose(); } catch { /* ignore */ } real = null; },
  };
}
