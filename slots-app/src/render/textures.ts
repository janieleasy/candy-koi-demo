import { Assets, Texture, type Spritesheet } from 'pixi.js';

export interface UiManifestEntry {
  png: string; png2x: string | null; w: number; h: number;
  borders?: { left: number; top: number; right: number; bottom: number };
  window?: { x: number; y: number; w: number; h: number };
}
export type UiManifest = Record<string, UiManifestEntry>;

/** 首包不加载的 UI 项(特色背景懒加载;合成总览图/紧凑奖池条不用) */
const LAZY_KEYS = new Set(['background-fs', 'background-hs', 'logo-A', 'logo-B']);
const SKIP_KEYS = new Set(['counters', 'jackpot-bar-compact']);
/** 按钮由 DOM <img> 显示(浏览器自己加载并缓存),Pixi 不再重复加载 btn-* */
/** 通用 logo(无副标)不用;design-notes/* 由 DOM <img> 使用(入口按钮、提示气泡) */
const isDomOnly = (k: string) => k.startsWith('btn-') || k.startsWith('design-notes/') || k === 'logo';

/**
 * 素材仓库:符号合图 + UI bundle(png2x, resolution 2;背景只有 1x)+ 懒加载的特色背景。
 * 路径相对页面(vite base './'),放在子路径下也能工作。
 */
export class TextureStore {
  private sheet!: Spritesheet;
  private manifest!: UiManifest;
  private ui = new Map<string, Texture>();
  private lazy = new Map<string, Promise<Texture>>();
  readonly root: string;

  constructor(root = 'assets/') { this.root = root; }

  static async load(root = 'assets/'): Promise<TextureStore> {
    const s = new TextureStore(root);
    s.manifest = await (await fetch(`${root}ui/ui-manifest.json`)).json() as UiManifest;
    const bundle: Record<string, { src: string; data?: { resolution: number } }> = {};
    for (const [key, e] of Object.entries(s.manifest)) {
      if (LAZY_KEYS.has(key) || SKIP_KEYS.has(key) || isDomOnly(key) || !e.png) continue;
      bundle[key] = e.png2x ? { src: root + e.png2x, data: { resolution: 2 } } : { src: root + e.png };
    }
    Assets.addBundle('ui', bundle);
    const [sheet, ui] = await Promise.all([
      Assets.load<Spritesheet>(`${root}symbols/symbols-sheet.json`),
      Assets.loadBundle('ui') as Promise<Record<string, Texture>>,
    ]);
    s.sheet = sheet;
    for (const [k, t] of Object.entries(ui)) s.ui.set(k, t);
    // 符号从 512px 下采样到 ~165px:开 mipmap 避免走样
    try {
      const src = sheet.textureSource;
      src.autoGenerateMipmaps = true;
      src.style.mipmapFilter = 'linear';
    } catch { /* 低版本无此属性则忽略 */ }
    return s;
  }

  symbol(frame: string): Texture {
    const t = this.sheet.textures[frame];
    if (!t) throw new Error(`symbol frame not found: ${frame}`);
    return t;
  }
  /** 合图帧矩形(像素,@2x 合图坐标)与合图 URL —— 给 DOM 里用 CSS background 显示符号 */
  frameRect(frame: string): { x: number; y: number; w: number; h: number } {
    return (this.sheet.data.frames as Record<string, { frame: { x: number; y: number; w: number; h: number } }>)[frame].frame;
  }
  get sheetSize(): { w: number; h: number } { const m = this.sheet.data.meta as { size: { w: number; h: number } }; return m.size; }
  get sheetUrl(): string { return `${this.root}symbols/${(this.sheet.data.meta as { image: string }).image}`; }
  hasSymbol(frame: string): boolean { return !!this.sheet.textures[frame]; }
  get symbolFrames(): string[] { return Object.keys(this.sheet.textures); }

  texture(key: string): Texture {
    const t = this.ui.get(key);
    if (!t) throw new Error(`ui texture not loaded: ${key}`);
    return t;
  }
  entry(key: string): UiManifestEntry { return this.manifest[key]; }
  /** DOM <img> 使用的 URL(与 Pixi 同一文件,浏览器缓存复用) */
  url(key: string): string {
    const e = this.manifest[key];
    return this.root + (e.png2x ?? e.png);
  }
  /** 已加载? */
  has(key: string): boolean { return this.ui.has(key); }
  keys(): string[] { return Object.keys(this.manifest); }

  /** 懒加载 background-fs / background-hs / logo-A / logo-B(首包只含当前玩法的 logo) */
  loadBackground(key: string): Promise<Texture> {
    const hit = this.ui.get(key);
    if (hit) return Promise.resolve(hit);
    let p = this.lazy.get(key);
    if (!p) {
      const e = this.manifest[key];
      if (!e) return Promise.reject(new Error(`unknown background ${key}`));
      p = (e.png2x ? Assets.load<Texture>({ src: this.root + e.png2x, data: { resolution: 2 } }) : Assets.load<Texture>(this.root + e.png)).then(t => { this.ui.set(key, t); return t; });
      this.lazy.set(key, p);
    }
    return p;
  }
}
