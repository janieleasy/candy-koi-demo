/**
 * 大赢演出的纯逻辑层(无 three / 无 DOM,可在 Vitest 里直接测):
 * 档位表(数值取自 UI 的 slots-ui/assets/bigwin/tiers.json)、时长/时间轴、数字滚动、阶段/进度函数、skip 收尾时序、
 * 事件(爆发/冲击波)时间表、确定性震屏。Shell 与 three 插件共用 `numberAt`,保证"壳子驱动的数字滚动"与"插件内的特效进度"同一条时间线。
 */
export type Tier = 'big' | 'mega' | 'epic' | 'max';
export type Art = 'big' | 'mega' | 'super';
export const TIER_ORDER: readonly Tier[] = ['big', 'mega', 'epic', 'max'];
export const isTier = (s: string): s is Tier => (TIER_ORDER as readonly string[]).includes(s);

export interface TierSpec {
  tier: Tier;
  art: Art;                         // 美术档:epic / max 共用 super
  title: string;                    // 标题字样(max 并入 SUPER WIN)
  durationMs: number;               // 建议总时长(含 300ms 收尾淡出)
  enter: number; climax: [number, number]; count: [number, number]; hold: [number, number];   // 毫秒,相对演出开始
  mask: { color: string; alpha: number };
  mainLight: string; secondLight?: string;
  particles: string[];              // 6 色
  amountFill: string[];             // 数字填色(上→下)
  shake: { px: number; ms: number };
  flash: { color: string; alpha: number; ms: number };
  strength: number;                 // 0..1 视觉强度基线
  rays: number;                     // 光束条数
  koiRing: number;                  // 前景 mini-koi 环绕数量(mega)
  koiBg: number;                    // 水面下的程序化锦鲤
  hero: boolean;                    // 巨型金锦鲤跃出(super)
  crown: number;                    // 皇冠缩放(0 = 无)
  halo: boolean;                    // 皇冠光环(max 变体)
  fireworks: number;                // 糖果烟花处数
  particleMul: number;              // 粒子数量系数(max = +20%)
  push: number;                     // 镜头推近终值
  bursts: number[];                 // 中途爆发在(climax 结束→count 结束)区间的位置 0..1
  finalBurst: boolean;              // 终局爆发(max)
}

export const TIER_SPECS: Record<Tier, TierSpec> = {
  big: {
    tier: 'big', art: 'big', title: 'BIG WIN', durationMs: 3500, enter: 350, climax: [350, 900], count: [350, 2800], hold: [2800, 3200],
    mask: { color: '#2B0F26', alpha: 0.70 }, mainLight: '#FFE066',
    particles: ['#FF5C8A', '#FFB84D', '#FFE066', '#FFFFFF', '#FF9F43', '#FFB6D9'],
    amountFill: ['#FFFFFF', '#FFE066'], shake: { px: 6, ms: 300 }, flash: { color: '#FFFFFF', alpha: 0.35, ms: 120 },
    strength: 0.45, rays: 12, koiRing: 0, koiBg: 3, hero: false, crown: 0, halo: false, fireworks: 0, particleMul: 0.5, push: 1, bursts: [], finalBurst: false,
  },
  mega: {
    tier: 'mega', art: 'mega', title: 'MEGA WIN', durationMs: 5000, enter: 450, climax: [450, 1200], count: [450, 3950], hold: [3950, 4700],
    mask: { color: '#170E45', alpha: 0.76 }, mainLight: '#5CC8FF', secondLight: '#FFE066',
    particles: ['#7B5CFF', '#FF5C8A', '#5CC8FF', '#FFE066', '#B5A0FF', '#FFB6D9'],
    amountFill: ['#FFFFFF', '#BFE9FF'], shake: { px: 10, ms: 450 }, flash: { color: '#FFFFFF', alpha: 0.5, ms: 150 },
    strength: 0.7, rays: 10, koiRing: 8, koiBg: 4, hero: false, crown: 0, halo: false, fireworks: 0, particleMul: 0.8, push: 1.05, bursts: [0.5], finalBurst: false,
  },
  epic: {
    tier: 'epic', art: 'super', title: 'SUPER WIN', durationMs: 7000, enter: 600, climax: [600, 1800], count: [600, 5500], hold: [5500, 6700],
    mask: { color: '#120A2E', alpha: 0.82 }, mainLight: '#FFF6D0',
    particles: ['#FFE066', '#FF5C8A', '#5CC8FF', '#6EE7C8', '#FF9F43', '#B5A0FF'],
    amountFill: ['#FFFFFF', '#FFF6B0', '#FFE066', '#F0A010'], shake: { px: 16, ms: 700 }, flash: { color: '#FFF6D0', alpha: 0.7, ms: 180 },
    strength: 0.9, rays: 16, koiRing: 0, koiBg: 4, hero: true, crown: 1, halo: false, fireworks: 6, particleMul: 1, push: 1.06, bursts: [0.25, 0.6], finalBurst: false,
  },
  max: {
    tier: 'max', art: 'super', title: 'SUPER WIN', durationMs: 7000, enter: 600, climax: [600, 1800], count: [600, 5500], hold: [5500, 6700],
    mask: { color: '#120A2E', alpha: 0.82 }, mainLight: '#FFF6D0',
    particles: ['#FFE066', '#FF5C8A', '#5CC8FF', '#6EE7C8', '#FF9F43', '#B5A0FF'],
    amountFill: ['#FFFFFF', '#FFF6B0', '#FFE066', '#F0A010'], shake: { px: 16, ms: 700 }, flash: { color: '#FFF6D0', alpha: 0.7, ms: 180 },
    strength: 1, rays: 18, koiRing: 0, koiBg: 4, hero: true, crown: 1.35, halo: true, fireworks: 8, particleMul: 1.2, push: 1.08, bursts: [0.15, 0.4, 0.7], finalBurst: true,
  },
};

export const FADE_OUT_MS = 300;       // 收尾淡出固定 300ms
export const SKIP_FINALE_MS = 280;    // skip 收尾(≤300ms)
export const REDUCED_MS = 2000;       // prefers-reduced-motion 的总时长

/** 总时长:turbo 约减半;reduced-motion 固定 2000ms;未知档位按 big */
export function showcaseDurationMs(tier: string, turbo: boolean, reduced = false): number {
  if (reduced) return REDUCED_MS;
  const base = (isTier(tier) ? TIER_SPECS[tier] : TIER_SPECS.big).durationMs;
  return Math.round(base * (turbo ? 0.5 : 1));
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** easeOutBack(标题入场 scale 0.4→1.08→1) */
export function easeOutBack(x: number, s = 1.70158): number { const t = clamp01(x) - 1; return 1 + t * t * ((s + 1) * t + s); }

export interface Timeline {
  duration: number; enter: number; climax: [number, number]; count: [number, number]; holdEnd: number; fadeStart: number;
}
/** 把 tiers.json 的毫秒时间轴按 durationMs 比例缩放;收尾淡出固定 300ms */
export function timelineFor(tier: string, durationMs: number): Timeline {
  const s = isTier(tier) ? TIER_SPECS[tier] : TIER_SPECS.big;
  const fadeStart = Math.max(1, durationMs - FADE_OUT_MS);
  const r = fadeStart / (s.durationMs - FADE_OUT_MS);
  const f = (v: number) => Math.round(v * r);
  const c0 = f(s.count[0]), c1 = Math.max(c0 + 1, f(s.count[1]));
  return { duration: durationMs, enter: f(s.enter), climax: [f(s.climax[0]), f(s.climax[1])], count: [c0, c1], holdEnd: fadeStart, fadeStart };
}
/** 滚动进度 0..1(线性时间,仅 count 区间) */
export const countProgress = (tMs: number, tl: Timeline) => clamp01((tMs - tl.count[0]) / (tl.count[1] - tl.count[0]));
/** 壳子驱动的滚动数字:easeOutCubic(与 Shell 同一函数) */
export const numberAt = (amount: number, tMs: number, tier: string, durationMs: number) => Math.round(amount * easeOutCubic(countProgress(tMs, timelineFor(tier, durationMs))));

export type Phase = 'enter' | 'roll' | 'hold' | 'finale' | 'done';
export interface PhaseInfo {
  phase: Phase;
  p: number;        // 滚动进度 0..1(被 skip 时直接 1)
  intro: number;    // 入场 0..1
  alpha: number;    // 整体 alpha:入场淡入 × 收尾淡出
  hold: number;     // 进入停留后 0..1(停留时特效降到 40%:见 energy)
  finale: number;   // skip 收尾进度 0..1(非 skip 为 0)
  done: boolean;
}
/**
 * 阶段函数。skippedAt=null 为正常;否则从 skippedAt 起进入 ≤SKIP_FINALE_MS 的收尾,数字立刻=终值。
 * 正常结束点 = durationMs;被 skip 时的结束点 = skippedAt + SKIP_FINALE_MS(无论此时处于哪个阶段)。
 */
export function phaseAt(tMs: number, tl: Timeline, skippedAt: number | null): PhaseInfo {
  const intro = clamp01(tMs / Math.max(1, tl.enter));
  if (skippedAt !== null) {
    const f = clamp01((tMs - skippedAt) / SKIP_FINALE_MS);
    return { phase: f >= 1 ? 'done' : 'finale', p: 1, intro: 1, alpha: 1 - f, hold: 1, finale: f, done: f >= 1 };
  }
  const p = countProgress(tMs, tl);
  const fadeIn = smoothstep(0, Math.min(tl.enter, 400), tMs);
  const fadeOut = clamp01((tl.duration - tMs) / FADE_OUT_MS);
  const hold = clamp01((tMs - tl.count[1]) / 200);
  if (tMs >= tl.duration) return { phase: 'done', p: 1, intro, alpha: 0, hold: 1, finale: 0, done: true };
  const phase: Phase = tMs < tl.enter ? 'enter' : tMs < tl.count[1] ? 'roll' : 'hold';
  return { phase, p, intro, alpha: fadeIn * fadeOut, hold, finale: 0, done: false };
}
/** 总结束时间(用于看门狗):正常 = durationMs;skip = skippedAt+收尾 */
export const endTimeMs = (durationMs: number, skippedAt: number | null) => (skippedAt === null ? durationMs : skippedAt + SKIP_FINALE_MS);

/** 能量 0..1(粒子/光芒强度):随滚动进度上升,停留后降到 40%,收尾归零 */
export function energy(spec: TierSpec, p: number, hold: number, finale = 0): number {
  const base = (0.35 + 0.65 * Math.pow(clamp01(p), 0.9)) * (0.6 + 0.4 * spec.strength);
  return clamp01(base * (1 - 0.6 * hold) * (1 - finale));
}

export type EventKind = 'climax' | 'burst' | 'peak' | 'final';
export interface ShowEvent { kind: EventKind; tMs: number; power: number; flash: number; shake: number; shock: boolean }
/**
 * 事件时间表:climax(高潮起点:闪白 + 震动 + 爆发)→ 中途爆发 → peak(数字到终值的峰值爆发)→ (max)final。
 * 闪白按 tiers.json 的 alpha;每次间隔 ≥ 350ms(≤3 次/秒),只有 climax 与 peak 有闪白。
 */
export function eventSchedule(tier: Tier, durationMs: number, reduced = false): ShowEvent[] {
  const spec = TIER_SPECS[tier]; const tl = timelineFor(tier, durationMs);
  const ev: ShowEvent[] = [];
  const sh = reduced ? 0 : spec.shake.px; const fl = reduced ? 0 : spec.flash.alpha;
  ev.push({ kind: 'climax', tMs: tl.climax[0], power: 1, flash: fl, shake: sh, shock: tier !== 'big' });
  const span = tl.count[1] - tl.climax[1];
  spec.bursts.forEach((f, i) => ev.push({ kind: 'burst', tMs: Math.round(tl.climax[1] + f * span), power: 0.6 + 0.08 * i, flash: 0, shake: sh * 0.4, shock: tier === 'epic' || tier === 'max' }));
  ev.push({ kind: 'peak', tMs: tl.count[1], power: 0.9, flash: fl * 0.6, shake: sh * 0.7, shock: true });
  if (spec.finalBurst) ev.push({ kind: 'final', tMs: Math.min(tl.fadeStart - 120, tl.count[1] + 480), power: 1.1, flash: 0, shake: sh * 0.5, shock: true });
  return ev.sort((a, b) => a.tMs - b.tMs);
}

/** 确定性震屏(像素):climax 起 shake.ms 内衰减;enabled=false(reduced / low)→ 0 */
export function shakeAt(tMs: number, events: readonly ShowEvent[], spec: TierSpec, enabled: boolean): [number, number] {
  if (!enabled) return [0, 0];
  let x = 0, y = 0;
  for (const e of events) {
    const a = tMs - e.tMs;
    if (e.shake <= 0 || a < 0 || a > spec.shake.ms) continue;
    const k = e.shake * Math.pow(1 - a / spec.shake.ms, 2);
    x += Math.sin(a * 0.083 + e.tMs) * k; y += Math.cos(a * 0.071 + e.tMs * 1.7) * k;
  }
  return [x, y];
}
/** 闪白强度 0..alpha:事件起 flash.ms 内线性衰减 */
export function flashAt(tMs: number, events: readonly ShowEvent[], spec: TierSpec): number {
  let f = 0;
  for (const e of events) { const a = tMs - e.tMs; if (e.flash > 0 && a >= 0 && a < spec.flash.ms) f = Math.max(f, e.flash * (1 - a / spec.flash.ms)); }
  return f;
}
/** 镜头推近系数:随滚动进度 1 → spec.push */
export const zoomAt = (spec: TierSpec, p: number, enabled: boolean) => (enabled ? 1 + (spec.push - 1) * easeOutCubic(p) : 1);

/** 坐标(世界坐标 y 向上,画布中心为原点):取自 tiers.json 的全屏锚点(绝对 y: 标题 690 / 数字 900 / 主视觉 1000,相对 960 的偏移 -270 / -60 / +40) */
export const LAYOUT = { title: 270, amount: 60, hero: -40, crown: 420 } as const;

export const fmtAmount = (n: number) => Math.round(n).toLocaleString('en-US');
