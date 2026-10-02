import { readEnv, shouldPrefetch, type Env } from './quality';
import { showcaseOptions } from './config';

/**
 * three 块预热(只下载、不执行):
 * 构建时 vite 插件(showcaseChunks)把 candy 块及其依赖(three 块)的文件名写进下面的占位符;
 * 运行时 ready 之后 delayMs,再等浏览器空闲(requestIdleCallback),插入 <link rel="prefetch">。
 * prefetch 为最低优先级、不解析不执行,所以不影响首屏渲染与首屏测量口径(首屏口径只统计 load 之前的请求)。
 * 省流量 / 2g-3g / 低端设备 / 无 WebGL / dev 服务器 → 不预取。
 */
/** 构建期由 vite 插件 showcaseChunks 把这个字符串字面量整体替换成 JSON 数组串;dev 下保持原样(= 不预取) */
const RAW_CHUNKS = '__SHOWCASE_CHUNKS__';
export function chunkList(raw: string = RAW_CHUNKS): string[] {
  if (!raw.startsWith('[')) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

export interface PrefetchDeps {
  env: Env; chunks: string[]; baseURI: string;
  addLink(href: string): void;
  idle(cb: () => void): void;
}
/** 纯逻辑:返回是否安排了预取(便于单测) */
export function planPrefetch(d: PrefetchDeps): boolean {
  if (!d.chunks.length || !shouldPrefetch(d.env)) return false;
  d.idle(() => { for (const f of d.chunks) d.addLink(new URL(f, d.baseURI).href); });
  return true;
}

export function schedulePrefetch(delayMs = 8000) {
  if (showcaseOptions.debug && /[?&]noprefetch\b/.test(location.search)) return;
  const chunks = chunkList();
  if (!chunks.length) return;
  const env = readEnv();
  setTimeout(() => {
    planPrefetch({
      env, chunks, baseURI: document.baseURI,
      addLink: href => { const l = document.createElement('link'); l.rel = 'prefetch'; l.as = 'script'; l.href = href; l.dataset.showcase = '1'; document.head.appendChild(l); },
      idle: cb => { const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback; ric ? ric(cb, { timeout: 6000 }) : setTimeout(cb, 1500); },
    });
  }, delayMs);
}
