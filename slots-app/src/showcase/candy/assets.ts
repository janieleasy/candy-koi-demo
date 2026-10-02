import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, Texture } from 'three';
import type { Art } from '../timeline';
import type { Tracker } from './tracker';
import { makeTitleFallback } from './text';
import type { Tier } from '../timeline';

/**
 * 大赢美术素材(slots-ui/assets/bigwin → public/assets/bigwin,原样复制不重编码):按档位分批懒加载,绝不进首屏。
 *   通用(所有档):particles-atlas.webp+json(~28 KB)、ray.png(14 KB)、ramp-<art>.png(<1 KB)、noise-256.png(39 KB,可缺)、title-<art>(png 15–17 KB / webp 31–34 KB)
 *   仅 super:hero-koi.svg(矢量,运行时光栅化)+ crown.svg;位图 hero-koi.webp(14.5 KB)作兜底
 * 必需项(atlas / ray / ramp)失败 → 抛错,由守卫回退到 default-big;可选项失败 → 用程序化/Canvas 兜底。
 */
export const ASSET_BASE = 'assets/bigwin/';
export const FRAME_NAMES = ['coin', 'candy-star', 'ribbon-pink', 'ribbon-sky', 'ribbon-gold', 'petal', 'bubble', 'sparkle', 'glow', 'crown', 'mini-koi-gold', 'mini-koi-pink', 'mini-koi-purple'] as const;
export type FrameName = typeof FRAME_NAMES[number];
export interface Frame { u0: number; v0: number; u1: number; v1: number; w: number; h: number }
export interface Assets {
  atlas: Texture; frames: Record<FrameName, Frame>; ray: Texture; ramp: Texture; noise: Texture | null;
  title: { tex: Texture; worldW: number; worldH: number }; hero: { tex: Texture; aspect: number } | null; crown: { tex: Texture; aspect: number } | null;
  bytesHint: number;
}
export interface LoadOpts { art: Art; tier: Tier; hiTitle: boolean; vecScale: number; titleText: string; signal?: AbortSignal; timeoutMs?: number }

const url = (f: string) => new URL(ASSET_BASE + f, document.baseURI).href;
function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.decoding = 'async';
    const to = setTimeout(() => { img.src = ''; rej(new Error('timeout ' + src)); }, timeoutMs);
    img.onload = () => { clearTimeout(to); res(img); };
    img.onerror = () => { clearTimeout(to); rej(new Error('load ' + src)); };
    img.src = src;
  });
}
async function loadJson<T>(src: string, timeoutMs: number): Promise<T> {
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), timeoutMs);
  try { const r = await fetch(src, { signal: ac.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json() as T; } finally { clearTimeout(to); }
}
const opt = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

function tex(tr: Tracker, img: TexImageSource, o: { flipY?: boolean; repeat?: boolean; mip?: boolean } = {}): Texture {
  const t = tr.add('texture', new Texture(img as HTMLImageElement));
  t.flipY = o.flipY ?? true;
  t.wrapS = t.wrapT = o.repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.generateMipmaps = o.mip ?? true;
  t.minFilter = t.generateMipmaps ? LinearMipmapLinearFilter : LinearFilter; t.magFilter = LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
async function rasterSvg(src: string, w: number, timeoutMs: number): Promise<{ canvas: HTMLCanvasElement; aspect: number }> {
  const img = await loadImage(src, timeoutMs);
  const ar = (img.naturalWidth || 256) / (img.naturalHeight || 192);
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(w / ar);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, aspect: ar };
}

export async function loadAssets(tr: Tracker, o: LoadOpts): Promise<Assets> {
  const to = o.timeoutMs ?? 6000; const a = o.art; const isSuper = a === 'super';
  const titleFile = o.hiTitle ? `title-${a}.webp` : `title-${a}.png`;
  const [atlasImg, atlasJson, rayImg, rampImg, noiseImg, titleImg, heroSvg, crownSvg] = await Promise.all([
    loadImage(url('particles-atlas.webp'), to),
    loadJson<{ frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; uv: { u0: number; v0_top: number; u1: number; v1_top: number } }> }>(url('particles-atlas.json'), to),
    loadImage(url('ray.png'), to),
    loadImage(url(`ramp-${a}.png`), to),
    opt(loadImage(url('noise-256.png'), to)),
    opt(loadImage(url(titleFile), to)),
    isSuper ? opt(rasterSvg(url('hero-koi.svg'), 1024 * o.vecScale, to)) : Promise.resolve(null),
    isSuper ? opt(rasterSvg(url('crown.svg'), 512 * o.vecScale, to)) : Promise.resolve(null),
  ]);
  const heroImg = isSuper && !heroSvg ? await opt(loadImage(url('hero-koi.webp'), to)) : null;
  const frames = {} as Record<FrameName, Frame>;
  for (const n of FRAME_NAMES) {
    const f = atlasJson.frames[n];
    if (!f && n !== 'crown') throw new Error('atlas frame missing: ' + n);
    if (f) frames[n] = { u0: f.uv.u0, v0: f.uv.v0_top, u1: f.uv.u1, v1: f.uv.v1_top, w: f.frame.w, h: f.frame.h };
    else frames[n] = frames.coin;
  }
  const atlas = tex(tr, atlasImg, { flipY: false });
  const ray = tex(tr, rayImg, { mip: false });
  const ramp = tex(tr, rampImg, { flipY: false, repeat: true, mip: false });
  ramp.wrapT = ClampToEdgeWrapping;
  const noise = noiseImg ? tex(tr, noiseImg, { repeat: true }) : null;
  let title: Assets['title'];
  if (titleImg) {
    title = { tex: tex(tr, titleImg), worldW: 900, worldH: 260 };
  } else {
    const fb = makeTitleFallback(o.titleText, o.tier);
    title = { tex: tr.add('texture', Object.assign(new CanvasTexture(fb.canvas), { generateMipmaps: true, minFilter: LinearMipmapLinearFilter })), worldW: fb.worldW, worldH: fb.worldH };
  }
  let hero: Assets['hero'] = null; let crown: Assets['crown'] = null;
  if (heroSvg) hero = { tex: tr.add('texture', Object.assign(new CanvasTexture(heroSvg.canvas), { minFilter: LinearMipmapLinearFilter, generateMipmaps: true })), aspect: heroSvg.aspect };
  else if (heroImg) hero = { tex: tex(tr, heroImg), aspect: heroImg.naturalWidth / heroImg.naturalHeight };
  if (crownSvg) crown = { tex: tr.add('texture', Object.assign(new CanvasTexture(crownSvg.canvas), { minFilter: LinearMipmapLinearFilter, generateMipmaps: true })), aspect: crownSvg.aspect };
  return { atlas, frames, ray, ramp, noise, title, hero, crown, bytesHint: 0 };
}

/** 供预取使用:所有档位共用的美术文件(小) */
export const SHARED_ART = ['particles-atlas.webp', 'particles-atlas.json', 'ray.png', 'noise-256.png'].map(f => ASSET_BASE + f);
