/** 通用小工具:格式化、可中断 sleep、tween、clamp。无 Pixi 依赖。 */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 千分位格式化(演示币整数) */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 可被 AbortSignal 提前结束的 sleep(abort 时 resolve,不 reject——“跳过”不是错误)。 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted || ms <= 0) { resolve(); return; }
    const t = setTimeout(done, ms);
    const onAbort = () => { clearTimeout(t); done(); };
    function done() { signal?.removeEventListener('abort', onAbort); resolve(); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type Ease = (t: number) => number;
export const ease = {
  linear: ((t: number) => t) as Ease,
  cubicOut: ((t: number) => 1 - Math.pow(1 - t, 3)) as Ease,
  cubicInOut: ((t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) as Ease,
  backOut: ((t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }) as Ease,
  sineInOut: ((t: number) => -(Math.cos(Math.PI * t) - 1) / 2) as Ease,
};
export function easeByName(name: string): Ease {
  return (ease as Record<string, Ease>)[name] ?? ease.backOut;
}

/**
 * rAF tween:duration 内回调 onUpdate(eased t)。signal abort 时直接以 t=1 收尾(跳到终态)再 resolve。
 */
export function tween(duration: number, onUpdate: (t: number) => void, fn: Ease = ease.cubicOut, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (duration <= 0 || signal?.aborted) { onUpdate(1); resolve(); return; }
    const t0 = performance.now();
    let raf = 0;
    const finish = () => { cancelAnimationFrame(raf); signal?.removeEventListener('abort', onAbort); onUpdate(1); resolve(); };
    const onAbort = () => finish();
    signal?.addEventListener('abort', onAbort, { once: true });
    const loop = () => {
      const p = Math.min(1, (performance.now() - t0) / duration);
      if (p >= 1) { finish(); return; }
      onUpdate(fn(p));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}

/** 字符串 → 32 位哈希(用于确定性的视觉填充符号选择,不影响数学结果) */
export function hash32(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
