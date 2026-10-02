import { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedBufferGeometry } from 'three';
import type { Art, ShowEvent, TierSpec } from '../timeline';
import { FRAME_NAMES, type FrameName } from './assets';

/** 确定性随机(便于测试与复现) */
export function mulberry32(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** 位置格栅 [-1,1]²(nx 段,可弯曲的主视觉锦鲤用 nx>1) */
export function quadGrid(nx = 1, x0 = -1, x1 = 1, y0 = -1, y1 = 1): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; pos.push(x, y0, 0, x, y1, 0); }
  for (let i = 0; i < nx; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx);
  return g;
}
export function instancedFrom(base: BufferGeometry, count: number, attrs: Record<string, [Float32Array, number]>): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
  for (const [k, [arr, n]] of Object.entries(attrs)) g.setAttribute(k, new InstancedBufferAttribute(arr, n));
  g.instanceCount = count;
  return g;
}

// ───────── 粒子配比(按档位;帧名见 particles-atlas.json) ─────────
type Mix = [FrameName, number][];
const SOLID_MIX: Record<Art, Mix> = {
  big:   [['coin', .46], ['ribbon-pink', .14], ['ribbon-sky', .14], ['ribbon-gold', .14], ['petal', .05], ['candy-star', .07]],
  mega:  [['candy-star', .40], ['bubble', .22], ['coin', .08], ['ribbon-pink', .05], ['ribbon-sky', .05], ['ribbon-gold', .05], ['petal', .15]],
  super: [['coin', .28], ['candy-star', .28], ['ribbon-pink', .06], ['ribbon-sky', .06], ['ribbon-gold', .06], ['bubble', .12], ['petal', .14]],
};
const MODE_W: Record<Art, { rain: number; fount: number; burst: number }> = {
  big: { rain: .25, fount: .35, burst: .40 }, mega: { rain: .30, fount: .20, burst: .50 }, super: { rain: .20, fount: .20, burst: .60 },
};
const SIZE: Record<FrameName, [number, number]> = {
  coin: [74, 112], 'candy-star': [72, 120], 'ribbon-pink': [70, 104], 'ribbon-sky': [70, 104], 'ribbon-gold': [70, 104], petal: [40, 70], bubble: [30, 92],
  sparkle: [52, 150], glow: [90, 210], crown: [1, 1], 'mini-koi-gold': [1, 1], 'mini-koi-pink': [1, 1], 'mini-koi-purple': [1, 1],
};
const pick = (mix: Mix, r: number): FrameName => { let a = 0; for (const [n, w] of mix) { a += w; if (r < a) return n; } return mix[mix.length - 1][0]; };
const frameIdx = (n: FrameName) => FRAME_NAMES.indexOf(n);

export interface ParticleData { count: number; A: Float32Array; B: Float32Array; C: Float32Array }
/**
 * 生成实例属性(rank, life, mode, evIdx) / (r1..r4) / (frame, colorIdx, size, spin)。
 * mode:0 雨 1/2 喷泉(左/右) 3 气泡 4 事件爆发。事件按 round-robin 分配到事件槽,烟花/爆发的发射时刻与位置在 shader 内由 uEv* 决定。
 */
export function buildParticles(kind: 'solid' | 'glow', art: Art, count: number, nEvents: number, rng: () => number): ParticleData {
  const A = new Float32Array(count * 4), B = new Float32Array(count * 4), C = new Float32Array(count * 4);
  const mw = MODE_W[art]; const mix: Mix = kind === 'solid' ? SOLID_MIX[art] : [['sparkle', .86], ['glow', .14]];
  for (let i = 0; i < count; i++) {
    const f = pick(mix, rng()); const r = rng();
    let mode = r < mw.rain ? 0 : r < mw.rain + mw.fount ? 1 + (i & 1) : 4;
    if (kind === 'glow' && f === 'glow' && mode !== 4) mode = 4;
    if (f === 'bubble') mode = rng() < 0.8 ? 3 : 4;
    const life = mode === 0 ? 3.2 + rng() * 1.8 : mode === 3 ? 5 + rng() * 4 : mode <= 2 ? 3 + rng() * 0.3 : (f === 'sparkle' ? 0.9 + rng() * 0.8 : f === 'glow' ? 0.5 + rng() * 0.4 : 1.5 + rng() * 1.2);
    const [s0, s1] = SIZE[f];
    A.set([rng(), life, mode, mode === 4 ? i % Math.max(1, nEvents) : 0], i * 4);
    B.set([rng(), rng(), rng(), rng()], i * 4);
    C.set([frameIdx(f), Math.floor(rng() * 6), s0 + (s1 - s0) * rng(), (rng() < .5 ? -1 : 1) * (1.2 + rng() * 3.6)], i * 4);
  }
  return { count, A, B, C };
}

export interface RayData { count: number; R: Float32Array; R2: Float32Array }
export function buildRays(spec: TierSpec, count: number, rotate: boolean, rng: () => number): RayData {
  const R = new Float32Array(count * 4), R2 = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2 + (rng() - .5) * 0.25;
    const om = rotate ? (0.05 + rng() * 0.07) * (i % 2 ? 1 : -1) : 0;
    R.set([a0, om, 330 + rng() * 260, 1500 + rng() * 700], i * 4);
    R2.set([i / count, spec.secondLight && (i & 1) ? 1 : 0], i * 2);
  }
  return { count, R, R2 };
}

export interface KoiData { count: number; O: Float32Array; M: Float32Array; V: Float32Array }
/** 水下背景锦鲤(程序化 SDF) */
export function buildKoiBg(count: number, rng: () => number): KoiData {
  const O = new Float32Array(count * 4), M = new Float32Array(count * 4), V = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    O.set([(rng() - .5) * 240, -350 + rng() * 650, 250 + rng() * 190, 380 + rng() * 380], i * 4);
    M.set([rng() * 6.283, (rng() < .5 ? -1 : 1) * (0.13 + rng() * 0.1), 190 + rng() * 100, rng()], i * 4);
    V.set([i % 5, 0.34 + rng() * 0.16, 2.2 + rng() * 0.8, 0], i * 4);
  }
  return { count, O, M, V };
}
/** Mega 前景 mini-koi 环(精灵):椭圆环,前大后小,头朝运动方向(顺时针) */
export function buildKoiRing(count: number, cy: number, rng: () => number): KoiData {
  const O = new Float32Array(count * 4), M = new Float32Array(count * 4), V = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    O.set([0, cy, 400 + rng() * 60, 235 + rng() * 40], i * 4);
    M.set([(i / count) * 6.283 + (rng() - .5) * .3, -(0.5 + rng() * 0.12), 80 + rng() * 26, rng()], i * 4);
    V.set([i % 3, 1, 4.5 + rng(), 0.5], i * 4);
  }
  return { count, O, M, V };
}

/** 事件槽的发射位置 / 烟花数 / 冲击波强度(数据驱动,纯函数便于测试) */
export interface EventSlot { t: number; p: number; f: number; ox: number; oy: number; s: number }
export function eventSlots(events: ShowEvent[], spec: TierSpec, heroY: number): EventSlot[] {
  return events.map((e, i) => {
    const offs: [number, number][] = [[0, 0], [-170, 120], [170, 90], [-120, -150], [130, -110]];
    const [dx, dy] = e.kind === 'burst' ? offs[1 + (i % 4)] : [0, 0];
    const fw = spec.fireworks > 0 ? (e.kind === 'climax' ? spec.fireworks : e.kind === 'burst' ? Math.ceil(spec.fireworks / 2) : e.kind === 'final' ? spec.fireworks : 0) : 0;
    const s = !e.shock ? 0 : e.kind === 'final' ? 1.3 : e.kind === 'peak' ? 0.9 : e.kind === 'climax' ? 1 : 0.6;
    return { t: e.tMs / 1000, p: e.power, f: fw, ox: dx, oy: heroY + dy, s };
  });
}
