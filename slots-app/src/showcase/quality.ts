/** 质量档位与降级决策(纯逻辑)。three 插件、Shell 预取、测试共用。 */
export type Quality = 'high' | 'medium' | 'low';
export const QUALITY_ORDER: readonly Quality[] = ['high', 'medium', 'low'];
export const isQuality = (s: unknown): s is Quality => s === 'high' || s === 'medium' || s === 'low';

export interface Env {
  hardwareConcurrency?: number; deviceMemory?: number;
  reducedMotion?: boolean; saveData?: boolean; effectiveType?: string;
  webgl?: boolean; coarsePointer?: boolean;
  forced?: Quality | null;
}
export interface QualityParams {
  scale: number;        // 内部渲染分辨率 = 1080×1920 × scale(再被屏幕物理像素封顶)
  solid: number;        // 实体粒子实例数(糖纸/糖针/金币/星星)
  glow: number;         // 发光粒子实例数(星芒/光点)
  bloomLevels: number;  // 0=关 bloom
  waterOctaves: number; // 水面 shader 的 fbm 层数(0 = 用简单渐变)
  caustics: number;     // 焦散层数
  koiMax: number;       // 锦鲤总数上限
  shake: boolean; push: boolean; twinkle: number;   // 运动类特效(reduced-motion 关闭)
}
export const QUALITY: Record<Quality, QualityParams> = {
  high:   { scale: 0.75, solid: 700, glow: 420, bloomLevels: 3, waterOctaves: 4, caustics: 2, koiMax: 16, shake: true,  push: true,  twinkle: 1 },
  medium: { scale: 0.55, solid: 380,  glow: 220,  bloomLevels: 2, waterOctaves: 3, caustics: 1, koiMax: 9,  shake: true,  push: true,  twinkle: 0.8 },
  low:    { scale: 0.4,  solid: 150,  glow: 60,  bloomLevels: 0, waterOctaves: 0, caustics: 0, koiMax: 4,  shake: false, push: false, twinkle: 0.4 },
};
/** reduced-motion:粒子 ≤40、无运动类特效 */
export const REDUCED_PARTICLES = 40;
/** reduced-motion:在所选档位基础上去掉运动类特效(无震屏、无推近、闪烁大幅降低) */
export function paramsFor(q: Quality, reducedMotion: boolean): QualityParams {
  const b = QUALITY[q];
  return reducedMotion ? { ...b, solid: Math.min(b.solid, REDUCED_PARTICLES), glow: Math.min(b.glow, 12), shake: false, push: false, twinkle: 0.08 } : { ...b };
}

export const isLowEnd = (e: Env) => (e.hardwareConcurrency ?? 99) <= 4 && (e.deviceMemory ?? 99) <= 4;
export type Backend = 'three' | 'fallback';
export interface Choice { quality: Quality; reducedMotion: boolean; backend: Backend; reason: string }

/** 初始档位决策。优先级:无 WebGL → 回退;forced(debug)→ 强制;reduced-motion / 低端 → low;移动端粗指针 → medium;否则 high。 */
export function chooseQuality(e: Env): Choice {
  const reducedMotion = !!e.reducedMotion;
  if (e.webgl === false) return { quality: 'low', reducedMotion, backend: 'fallback', reason: 'no-webgl' };
  if (e.forced && isQuality(e.forced)) return { quality: e.forced, reducedMotion, backend: 'three', reason: 'forced' };
  if (reducedMotion) return { quality: 'low', reducedMotion, backend: 'three', reason: 'reduced-motion' };
  if (isLowEnd(e)) return { quality: 'low', reducedMotion, backend: 'three', reason: 'low-end' };
  if (e.coarsePointer && (e.hardwareConcurrency ?? 8) <= 6) return { quality: 'medium', reducedMotion, backend: 'three', reason: 'mobile' };
  return { quality: 'high', reducedMotion, backend: 'three', reason: 'default' };
}
export const downgrade = (q: Quality): Quality | null => { const i = QUALITY_ORDER.indexOf(q); return i >= 0 && i < QUALITY_ORDER.length - 1 ? QUALITY_ORDER[i + 1] : null; };
/** 首帧(含编译)耗时过长 → 降一档 */
export const FIRST_FRAME_SLOW_MS = 400;
export const adjustForFirstFrame = (q: Quality, firstFrameMs: number): Quality => (firstFrameMs > FIRST_FRAME_SLOW_MS ? downgrade(q) ?? q : q);

/**
 * 运行时帧率自适应:连续 N 帧 > thresholdMs 则建议降一档。
 * 忽略预热帧与 >250ms 的巨大间隔(切后台 / 编译卡顿),且最多降 maxDrops 次。
 */
export class FrameGovernor {
  private bad = 0; private seen = 0; private drops = 0;
  constructor(public readonly opts: { thresholdMs: number; consecutive: number; warmup: number; maxDrops: number } = { thresholdMs: 25, consecutive: 15, warmup: 3, maxDrops: 2 }) {}
  /** 返回 true 表示应降一档 */
  push(dtMs: number): boolean {
    this.seen++;
    if (this.seen <= this.opts.warmup || dtMs > 250) return false;
    if (dtMs > this.opts.thresholdMs) this.bad++; else this.bad = 0;
    if (this.bad >= this.opts.consecutive && this.drops < this.opts.maxDrops) { this.bad = 0; this.drops++; return true; }
    return false;
  }
  get dropCount() { return this.drops; }
}

export function prefersReducedMotion(): boolean { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
/** 运行时读取环境(DOM / navigator),不可用的字段留空 */
export function readEnv(forced: Quality | null = null): Env {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const mm = (q: string) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };
  return {
    hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory,
    reducedMotion: mm('(prefers-reduced-motion: reduce)'), coarsePointer: mm('(pointer: coarse)'),
    saveData: !!nav.connection?.saveData, effectiveType: nav.connection?.effectiveType,
    webgl: detectWebGL(), forced,
  };
}
let webglCache: boolean | null = null;
/** 用一次性 canvas 探测 WebGL2 支持(结果缓存);用后立刻释放上下文 */
export function detectWebGL(force = false): boolean {
  if (webglCache !== null && !force) return webglCache;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webglCache = !!gl;
    (gl?.getExtension('WEBGL_lose_context'))?.loseContext();
  } catch { webglCache = false; }
  return webglCache;
}
/** 测试用:重置探测缓存 */
export const _resetWebglCache = () => { webglCache = null; };

/** 预取策略:省流量 / 慢网 / 低端 / 无 WebGL 不预取 three 块(这些环境下大赢走 low 档或回退,不值得为它占带宽) */
export function shouldPrefetch(e: Env): boolean {
  if (e.webgl === false || e.saveData) return false;
  if (e.effectiveType && ['slow-2g', '2g', '3g'].includes(e.effectiveType)) return false;
  if (isLowEnd(e)) return false;
  return true;
}
