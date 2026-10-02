import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  TIER_SPECS, TIER_ORDER, FADE_OUT_MS, SKIP_FINALE_MS, REDUCED_MS, showcaseDurationMs, timelineFor, countProgress, numberAt, phaseAt, endTimeMs, energy,
  eventSchedule, shakeAt, flashAt, zoomAt, easeOutBack, isTier, LAYOUT,
} from '../src/showcase/timeline';
import { parseDebug } from '../src/core/debug';

describe('大赢演出 · 档位与时长(tiers.json)', () => {
  it('四档:big/mega/epic/max;epic 与 max 共用 Super 美术,标题都是 SUPER WIN', () => {
    expect(TIER_ORDER).toEqual(['big', 'mega', 'epic', 'max']);
    expect(TIER_SPECS.big.title).toBe('BIG WIN'); expect(TIER_SPECS.mega.title).toBe('MEGA WIN');
    expect(TIER_SPECS.epic.title).toBe('SUPER WIN'); expect(TIER_SPECS.max.title).toBe('SUPER WIN');
    expect(TIER_SPECS.epic.art).toBe('super'); expect(TIER_SPECS.max.art).toBe('super');
    expect(isTier('epic')).toBe(true); expect(isTier('huge')).toBe(false);
  });
  it('max 变体:皇冠 1.35×、光环、粒子 +20%、终局爆发', () => {
    expect(TIER_SPECS.max.crown).toBe(1.35); expect(TIER_SPECS.epic.crown).toBe(1);
    expect(TIER_SPECS.max.halo).toBe(true); expect(TIER_SPECS.epic.halo).toBe(false);
    expect(TIER_SPECS.max.particleMul / TIER_SPECS.epic.particleMul).toBeCloseTo(1.2);
    expect(TIER_SPECS.max.finalBurst).toBe(true);
  });
  it('时长 3500/5000/7000/7000;turbo 约减半;reduced-motion 固定 2000;未知档位按 big', () => {
    expect(TIER_ORDER.map(t => showcaseDurationMs(t, false))).toEqual([3500, 5000, 7000, 7000]);
    expect(showcaseDurationMs('mega', true)).toBe(2500);
    expect(showcaseDurationMs('epic', false, true)).toBe(REDUCED_MS);
    expect(showcaseDurationMs('zzz', false)).toBe(3500);
  });
  it('与 UI 的 tiers.json 一致(遮罩色/α、时间轴、震动、闪白)', () => {
    const f = '/workspace/slots-ui/assets/bigwin/tiers.json';
    if (!fs.existsSync(f)) return;   // 源目录不存在时跳过(只读源,不复制进仓库)
    const j = JSON.parse(fs.readFileSync(f, 'utf8')).tiers as Record<string, any>;
    for (const t of TIER_ORDER) {
      const s = TIER_SPECS[t]; const a = j[s.art];
      expect(s.mask).toEqual(a.mask); expect(s.durationMs).toBe(a.durationMs);
      expect([s.enter, ...s.climax, ...s.count, ...s.hold]).toEqual([a.timeline.enter[1], ...a.timeline.climax, ...a.timeline.count, ...a.timeline.hold]);
      expect(s.shake).toEqual(a.shake); expect(s.flash).toEqual(a.flash);
      expect(s.particles).toEqual(a.particles); expect(s.amountFill).toEqual(a.amountFill);
      expect(a.mapsTo).toContain(t);
    }
  });
  it('坐标:标题 690 / 数字 900 / 主视觉 1000(相对 960:-270/-60/+40)', () => {
    expect(LAYOUT.title).toBe(960 - 690); expect(LAYOUT.amount).toBe(960 - 900); expect(LAYOUT.hero).toBe(960 - 1000);
  });
});

describe('大赢演出 · 时间轴 / 数字滚动 / 阶段', () => {
  it('建议时长下与 tiers.json 一致;缩放时收尾淡出固定 300ms', () => {
    expect(timelineFor('big', 3500)).toMatchObject({ enter: 350, climax: [350, 900], count: [350, 2800], fadeStart: 3200 });
    expect(timelineFor('super' as never, 3500).count[0]).toBe(350);   // 未知档位按 big
    expect(timelineFor('mega', 5000)).toMatchObject({ enter: 450, count: [450, 3950], fadeStart: 4700 });
    expect(timelineFor('epic', 7000)).toMatchObject({ enter: 600, count: [600, 5500], fadeStart: 6700 });
    for (const d of [1750, 2000, 2500, 3500, 8000]) { const tl = timelineFor('epic', d); expect(tl.duration - tl.fadeStart).toBe(FADE_OUT_MS); expect(tl.count[1]).toBeLessThanOrEqual(tl.fadeStart); }
  });
  it('数字:count 开始前为 0,easeOutCubic 单调,count 结束时 = 终值且之后不变', () => {
    const A = 123456; const tl = timelineFor('mega', 5000);
    expect(numberAt(A, 0, 'mega', 5000)).toBe(0);
    expect(numberAt(A, tl.count[0], 'mega', 5000)).toBe(0);
    let prev = -1;
    for (let t = 0; t <= 5000; t += 50) { const n = numberAt(A, t, 'mega', 5000); expect(n).toBeGreaterThanOrEqual(prev); expect(n).toBeLessThanOrEqual(A); prev = n; }
    expect(numberAt(A, tl.count[1], 'mega', 5000)).toBe(A);
    expect(numberAt(A, 5000, 'mega', 5000)).toBe(A);
    expect(countProgress(tl.count[1] + 999, tl)).toBe(1);
  });
  it('阶段:enter → roll → hold(终值停留)→ done;alpha 入场淡入/收尾淡出', () => {
    const tl = timelineFor('big', 3500);
    expect(phaseAt(100, tl, null).phase).toBe('enter');
    expect(phaseAt(1000, tl, null).phase).toBe('roll');
    const h = phaseAt(3000, tl, null); expect(h.phase).toBe('hold'); expect(h.p).toBe(1);
    expect(phaseAt(3499, tl, null).alpha).toBeLessThan(0.02);
    expect(phaseAt(3500, tl, null).done).toBe(true);
    expect(phaseAt(1500, tl, null).alpha).toBe(1);
    expect(phaseAt(0, tl, null).alpha).toBe(0);
  });
  it('skip 收尾时序:数字立即终值(p=1),收尾 ≤300ms 后 done,任意阶段 skip 都成立', () => {
    expect(SKIP_FINALE_MS).toBeLessThanOrEqual(300);
    const tl = timelineFor('epic', 7000);
    for (const sk of [0, 100, 700, 3000, 5600, 6900]) {
      expect(endTimeMs(7000, sk)).toBe(sk + SKIP_FINALE_MS);
      const a = phaseAt(sk, tl, sk); expect(a.phase).toBe('finale'); expect(a.p).toBe(1); expect(a.done).toBe(false); expect(a.alpha).toBe(1);
      const m = phaseAt(sk + SKIP_FINALE_MS / 2, tl, sk); expect(m.alpha).toBeCloseTo(0.5, 1);
      const e = phaseAt(sk + SKIP_FINALE_MS, tl, sk); expect(e.done).toBe(true); expect(e.alpha).toBe(0);
    }
    expect(endTimeMs(7000, null)).toBe(7000);
  });
  it('能量:随滚动进度上升,停留降到约 40%,skip 收尾归零', () => {
    const s = TIER_SPECS.epic;
    expect(energy(s, 1, 0)).toBeGreaterThan(energy(s, 0.1, 0));
    expect(energy(s, 1, 1)).toBeCloseTo(energy(s, 1, 0) * 0.4, 5);
    expect(energy(s, 1, 1, 1)).toBe(0);
    expect(energy(TIER_SPECS.max, 1, 0)).toBeGreaterThan(energy(TIER_SPECS.big, 1, 0));
  });
});

describe('大赢演出 · 事件 / 震屏 / 闪白', () => {
  it('事件表:climax 在高潮起点,peak 在数字到终值,max 多一个 final;按时间排序,数量 ≤ 8 个槽', () => {
    for (const t of TIER_ORDER) {
      const D = TIER_SPECS[t].durationMs; const tl = timelineFor(t, D); const ev = eventSchedule(t, D);
      expect(ev[0].kind).toBe('climax'); expect(ev[0].tMs).toBe(tl.climax[0]);
      expect(ev.find(e => e.kind === 'peak')!.tMs).toBe(tl.count[1]);
      expect(ev.length).toBeLessThanOrEqual(8);
      expect([...ev].sort((a, b) => a.tMs - b.tMs)).toEqual(ev);
      expect(ev.some(e => e.kind === 'final')).toBe(t === 'max');
    }
    expect(eventSchedule('big', 3500).length).toBe(2);
    expect(eventSchedule('max', 7000).length).toBe(1 + 3 + 1 + 1);
  });
  it('闪白按 tiers.json(α/时长),间隔 ≥350ms(≤3 次/秒),α ≤ 0.7;reduced-motion 无闪白无震动', () => {
    for (const t of TIER_ORDER) {
      const s = TIER_SPECS[t]; const ev = eventSchedule(t, s.durationMs);
      const fl = ev.filter(e => e.flash > 0);
      expect(fl.length).toBeGreaterThan(0);
      for (let i = 1; i < fl.length; i++) expect(fl[i].tMs - fl[i - 1].tMs).toBeGreaterThanOrEqual(350);
      for (const e of fl) expect(e.flash).toBeLessThanOrEqual(0.7);
      expect(flashAt(ev[0].tMs, ev, s)).toBeCloseTo(s.flash.alpha);
      expect(flashAt(ev[0].tMs + s.flash.ms, ev, s)).toBe(0);
      const r = eventSchedule(t, s.durationMs, true);
      expect(r.every(e => e.flash === 0 && e.shake === 0)).toBe(true);
    }
  });
  it('震屏:幅度 ≤ 档位 px,持续 ≤ ms 后归零;disabled 返回 0;确定性', () => {
    const s = TIER_SPECS.epic; const ev = eventSchedule('epic', 7000); const t0 = ev[0].tMs;
    expect(shakeAt(t0 + 50, ev, s, false)).toEqual([0, 0]);
    const a = shakeAt(t0 + 50, ev, s, true), b = shakeAt(t0 + 50, ev, s, true);
    expect(a).toEqual(b);
    expect(Math.hypot(...a)).toBeLessThanOrEqual(s.shake.px * 2 + 1e-6);
    expect(shakeAt(t0 + s.shake.ms + 1, [ev[0]], s, true)).toEqual([0, 0]);
    expect(shakeAt(t0 - 1, ev, s, true)).toEqual([0, 0]);
  });
  it('推近与 easeOutBack', () => {
    expect(zoomAt(TIER_SPECS.mega, 0, true)).toBe(1); expect(zoomAt(TIER_SPECS.mega, 1, true)).toBeCloseTo(1.05); expect(zoomAt(TIER_SPECS.mega, 1, false)).toBe(1);
    expect(easeOutBack(0)).toBeCloseTo(0, 5); expect(easeOutBack(1)).toBeCloseTo(1, 5);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => easeOutBack(i / 49)))).toBeGreaterThan(1.05);   // 过冲(~1.1)
  });
});

describe('调试参数(仅 debug 构建)', () => {
  it('?force=big|mega|epic|max|bigwin → demo;?force=fs|hs 仍是 force;?quality=', () => {
    expect(parseDebug('?force=mega&quality=low', true)).toMatchObject({ force: null, demo: 'mega', quality: 'low' });
    expect(parseDebug('?force=bigwin', true).demo).toBe('bigwin');
    expect(parseDebug('?force=fs', true)).toMatchObject({ force: 'fs', demo: null });
    expect(parseDebug('?quality=ultra', true).quality).toBeNull();
    expect(parseDebug('?force=max&quality=high', false)).toMatchObject({ demo: null, quality: null, force: null });   // prod 构建:全部忽略
  });
});
