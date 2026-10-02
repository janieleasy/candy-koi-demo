import { describe, it, expect } from 'vitest';
import { AutoPlay, AUTO_CHOICES } from '../src/core/autoplay';

function mk() {
  const ev: { on: boolean; remaining: number | null }[] = [];
  const a = new AutoPlay(p => ev.push({ ...p }));
  return { a, ev };
}

describe('AutoPlay(D-05 次数口径)', () => {
  it('选项:10 / 25 / 50 / 100 / 直到特色', () => {
    expect([...AUTO_CHOICES]).toEqual([10, 25, 50, 100, 'feature']);
  });
  it('选 10:最多 10 局,remaining 10→9→…→0 后自动停', () => {
    const { a, ev } = mk();
    a.start(10);
    expect(a.on).toBe(true); expect(a.remaining).toBe(10);
    let rounds = 0;
    while (a.on) { rounds++; a.roundSettled(); if (rounds > 50) throw new Error('runaway'); }
    expect(rounds).toBe(10);
    expect(a.lastStop).toBe('count');
    expect(ev.filter(e => e.on).map(e => e.remaining)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(ev.at(-1)).toEqual({ on: false, remaining: null });
  });
  it('第 N 局结算返回值:前 N-1 次继续,最后一次停止', () => {
    const { a } = mk(); a.start(3);
    expect([a.roundSettled(), a.roundSettled(), a.roundSettled()]).toEqual([true, true, false]);
  });
  it('直到特色:remaining=null,不计数;触发特色停止', () => {
    const { a, ev } = mk(); a.start('feature');
    expect(a.remaining).toBeNull();
    for (let i = 0; i < 500; i++) expect(a.roundSettled()).toBe(true);
    expect(a.on).toBe(true);
    a.stop('feature');
    expect(a.on).toBe(false); expect(a.lastStop).toBe('feature');
    expect(ev[0]).toEqual({ on: true, remaining: null });
    expect(ev.at(-1)).toEqual({ on: false, remaining: null });
  });
  it('手动停 / 余额不足 / 调投注:停止并回到关闭;重复 stop 不重复发事件', () => {
    for (const r of ['manual', 'funds', 'bet'] as const) {
      const { a, ev } = mk(); a.start(25); a.roundSettled();
      a.stop(r); a.stop('manual');
      expect(a.on).toBe(false); expect(a.remaining).toBeNull(); expect(a.lastStop).toBe(r);
      expect(ev.filter(e => !e.on).length).toBe(1);
    }
  });
  it('已开启时再次 start 无效;停止后可重新开始', () => {
    const { a } = mk(); a.start(10); a.start(100); expect(a.remaining).toBe(10);
    a.stop('manual'); a.start(50); expect(a.remaining).toBe(50);
  });
});
