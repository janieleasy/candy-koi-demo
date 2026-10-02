import { describe, expect, it, vi } from 'vitest';
import {
  chooseQuality, downgrade, adjustForFirstFrame, FIRST_FRAME_SLOW_MS, FrameGovernor, isLowEnd, paramsFor, QUALITY, REDUCED_PARTICLES, shouldPrefetch,
} from '../src/showcase/quality';
import { chunkList, planPrefetch } from '../src/showcase/prefetch';
import { Tracker, stats } from '../src/showcase/candy/tracker';
import { buildParticles, buildRays, eventSlots, mulberry32, quadGrid } from '../src/showcase/candy/build';
import { TIER_SPECS, eventSchedule } from '../src/showcase/timeline';

describe('质量档:初始选择', () => {
  it('桌面默认 high;移动端粗指针 medium;低端(≤4 核且 ≤4GB)low', () => {
    expect(chooseQuality({ webgl: true, hardwareConcurrency: 8, deviceMemory: 8 })).toMatchObject({ quality: 'high', backend: 'three' });
    expect(chooseQuality({ webgl: true, hardwareConcurrency: 6, coarsePointer: true }).quality).toBe('medium');
    expect(chooseQuality({ webgl: true, hardwareConcurrency: 4, deviceMemory: 4 })).toMatchObject({ quality: 'low', reason: 'low-end' });
    expect(chooseQuality({ webgl: true, hardwareConcurrency: 4, deviceMemory: 8 }).quality).toBe('high');   // 需同时满足两条
    expect(isLowEnd({ hardwareConcurrency: 2, deviceMemory: 2 })).toBe(true); expect(isLowEnd({ hardwareConcurrency: 2 })).toBe(false); expect(isLowEnd({})).toBe(false);   // 内存未知(Safari 无 deviceMemory)不判低端
  });
  it('reduced-motion → low + reducedMotion 标志;无 WebGL → 回退 default-big;debug 强制档位优先但仍保留 reduced 标志', () => {
    expect(chooseQuality({ webgl: true, reducedMotion: true })).toMatchObject({ quality: 'low', reducedMotion: true });
    expect(chooseQuality({ webgl: false })).toMatchObject({ backend: 'fallback', reason: 'no-webgl' });
    expect(chooseQuality({ webgl: true, forced: 'medium', hardwareConcurrency: 2 })).toMatchObject({ quality: 'medium', reason: 'forced' });
    expect(chooseQuality({ webgl: true, forced: 'high', reducedMotion: true })).toMatchObject({ quality: 'high', reducedMotion: true });
  });
  it('降档链 high → medium → low → null;首帧过慢降一档', () => {
    expect(downgrade('high')).toBe('medium'); expect(downgrade('medium')).toBe('low'); expect(downgrade('low')).toBeNull();
    expect(adjustForFirstFrame('high', FIRST_FRAME_SLOW_MS + 1)).toBe('medium');
    expect(adjustForFirstFrame('high', FIRST_FRAME_SLOW_MS)).toBe('high');
    expect(adjustForFirstFrame('low', 5000)).toBe('low');
  });
  it('档位参数单调递减;reduced-motion 关震屏/推近、闪烁大幅降低、粒子 ≤40', () => {
    expect(QUALITY.high.solid).toBeGreaterThan(QUALITY.medium.solid); expect(QUALITY.medium.solid).toBeGreaterThan(QUALITY.low.solid);
    expect(QUALITY.high.scale).toBeGreaterThan(QUALITY.low.scale);
    expect(QUALITY.low.bloomLevels).toBe(0); expect(QUALITY.low.waterOctaves).toBe(0);
    const r = paramsFor('high', true);
    expect(r).toMatchObject({ shake: false, push: false }); expect(r.twinkle).toBeLessThan(0.1); expect(r.solid).toBeLessThanOrEqual(REDUCED_PARTICLES);
    expect(paramsFor('high', false)).toEqual(QUALITY.high);
  });
});

describe('FrameGovernor:帧率自适应降档', () => {
  it('连续 15 帧 >25ms 才降;中途一帧正常则清零;预热帧与 >250ms 巨帧被忽略;最多降 2 次', () => {
    const g = new FrameGovernor();
    for (let i = 0; i < 3; i++) expect(g.push(60)).toBe(false);          // 预热
    for (let i = 0; i < 14; i++) expect(g.push(30)).toBe(false);
    expect(g.push(16)).toBe(false);                                      // 清零
    for (let i = 0; i < 14; i++) expect(g.push(30)).toBe(false);
    expect(g.push(30)).toBe(true);                                       // 第 15 帧
    for (let i = 0; i < 14; i++) g.push(400);                            // 巨帧(切后台/编译)不计
    for (let i = 0; i < 14; i++) expect(g.push(30)).toBe(false);
    expect(g.push(30)).toBe(true);
    for (let i = 0; i < 40; i++) expect(g.push(50)).toBe(false);         // 已降 2 次,不再降
    expect(g.dropCount).toBe(2);
  });
});

describe('预热策略(prefetch)', () => {
  const ok = { webgl: true, hardwareConcurrency: 8, deviceMemory: 8 };
  it('省流量 / 2g-3g / 低端 / 无 WebGL 不预取;正常环境预取', () => {
    expect(shouldPrefetch(ok)).toBe(true);
    expect(shouldPrefetch({ ...ok, saveData: true })).toBe(false);
    for (const t of ['slow-2g', '2g', '3g']) expect(shouldPrefetch({ ...ok, effectiveType: t })).toBe(false);
    expect(shouldPrefetch({ ...ok, effectiveType: '4g' })).toBe(true);
    expect(shouldPrefetch({ ...ok, hardwareConcurrency: 4, deviceMemory: 4 })).toBe(false);
    expect(shouldPrefetch({ ...ok, webgl: false })).toBe(false);
  });
  it('planPrefetch:空闲时才插入 link,按 baseURI 解析;清单为空(dev)不安排', () => {
    const links: string[] = []; const idle = vi.fn((cb: () => void) => { expect(links.length).toBe(0); cb(); });
    expect(planPrefetch({ env: ok, chunks: ['assets/a.js', 'assets/three-x.js'], baseURI: 'https://x.test/app/', addLink: h => links.push(h), idle })).toBe(true);
    expect(idle).toHaveBeenCalledTimes(1); expect(links).toEqual(['https://x.test/app/assets/a.js', 'https://x.test/app/assets/three-x.js']);
    const idle2 = vi.fn();
    expect(planPrefetch({ env: ok, chunks: [], baseURI: 'https://x.test/', addLink: () => {}, idle: idle2 })).toBe(false);
    expect(planPrefetch({ env: { ...ok, saveData: true }, chunks: ['a.js'], baseURI: 'https://x.test/', addLink: () => {}, idle: idle2 })).toBe(false);
    expect(idle2).not.toHaveBeenCalled();
  });
  it('chunkList:构建期注入的 JSON;dev 占位符/坏数据 → 空', () => {
    expect(chunkList('["assets/a.js","assets/b.js"]')).toEqual(['assets/a.js', 'assets/b.js']);
    expect(chunkList('__SHOWCASE_CHUNKS__')).toEqual([]); expect(chunkList('[1,"x"]')).toEqual(['x']); expect(chunkList('[bad')).toEqual([]);
  });
});

describe('资源跟踪与 dispose 幂等', () => {
  it('Tracker:逐个释放并计数;disposeAll 幂等;释放过的不重复 dispose', () => {
    const before = { c: { ...stats.created }, d: { ...stats.disposed } };
    const t = new Tracker(); const made = { g: 0, m: 0, tx: 0, rt: 0 };
    const mk = (k: 'g' | 'm' | 'tx' | 'rt') => ({ dispose: () => { made[k]++; } });
    const g = t.add('geometry', mk('g')), m = t.add('material', mk('m')); t.add('texture', mk('tx')); t.add('target', mk('rt'));
    t.release(g);
    t.disposeAll(); t.disposeAll(); t.release(m);
    expect(made).toEqual({ g: 1, m: 1, tx: 1, rt: 1 });
    expect(stats.created.geometry - before.c.geometry).toBe(1); expect(stats.disposed.geometry - before.d.geometry).toBe(1);
    expect(stats.disposed.material - before.d.material).toBe(1); expect(stats.disposed.target - before.d.target).toBe(1);
  });
  it('Tracker:dispose 抛错不影响其余资源释放', () => {
    const t = new Tracker(); let ok = 0;
    t.add('geometry', { dispose: () => { throw new Error('x'); } }); t.add('texture', { dispose: () => { ok++; } });
    expect(() => t.disposeAll()).not.toThrow(); expect(ok).toBe(1);
  });
});

describe('粒子/光束/事件槽构建(纯数据)', () => {
  it('buildParticles:数量、属性范围、确定性;bubble 只出现在 mega/super 配比;rank 均匀', () => {
    const a = buildParticles('solid', 'super', 300, 6, mulberry32(1)), b = buildParticles('solid', 'super', 300, 6, mulberry32(1));
    expect(a.A).toEqual(b.A); expect(a.C).toEqual(b.C);
    expect(a.A.length).toBe(1200);
    for (let i = 0; i < 300; i++) {
      const [rank, life, mode, ev] = a.A.slice(i * 4, i * 4 + 4); const [frame, col, size] = a.C.slice(i * 4, i * 4 + 3);
      expect(rank).toBeGreaterThanOrEqual(0); expect(rank).toBeLessThan(1); expect(life).toBeGreaterThan(0.5);
      expect([0, 1, 2, 3, 4]).toContain(mode); expect(ev).toBeLessThan(6); expect(col).toBeLessThan(6); expect(size).toBeGreaterThan(20); expect(frame).toBeLessThan(10);
    }
    const bigFrames = new Set(Array.from(buildParticles('solid', 'big', 400, 2, mulberry32(2)).C).filter((_, i) => i % 4 === 0));
    expect(bigFrames.has(6)).toBe(false);   // big 没有 bubble
    const g = buildParticles('glow', 'mega', 100, 4, mulberry32(3));
    expect(new Set(Array.from(g.C).filter((_, i) => i % 4 === 0))).toEqual(new Set([7, 8]));   // sparkle / glow
  });
  it('buildRays / quadGrid / eventSlots', () => {
    const r = buildRays(TIER_SPECS.mega, 10, true, mulberry32(4));
    expect(r.R.length).toBe(40); expect(Array.from(r.R2).filter((_, i) => i % 2 === 1).some(v => v === 1)).toBe(true);   // mega 有副色
    expect(buildRays(TIER_SPECS.big, 12, false, mulberry32(4)).R.filter((_, i) => i % 4 === 1).every(v => v === 0)).toBe(true);   // 不旋转
    const q = quadGrid(18); expect(q.getAttribute('position').count).toBe(38); expect(q.index!.count).toBe(18 * 6);
    const spec = TIER_SPECS.max; const slots = eventSlots(eventSchedule('max', 7000), spec, -40);
    expect(slots.length).toBe(6); expect(slots[0].f).toBe(spec.fireworks); expect(slots.every(s => s.p > 0)).toBe(true);
    expect(slots.find(s => s.f === 0 && s.s > 0)).toBeTruthy();
  });
});
