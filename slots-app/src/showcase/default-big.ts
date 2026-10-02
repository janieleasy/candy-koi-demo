import type { ShowcasePlugin, ShowcaseContext } from '@spec/client';

/**
 * 默认大赢占位:DOM 叠加层 + Canvas2D 简易粒子 + 数字滚动。**不含 three.js / shader。**
 * 真正的演出实现 ShowcasePlugin 并在 showcase/index.ts 注册即可。
 */
const TITLES: Record<string, string> = { big: 'BIG WIN', mega: 'MEGA WIN', epic: 'SUPER WIN', max: 'SUPER WIN' };

const plugin: ShowcasePlugin = {
  id: 'default-big',
  async load() { /* 无外部资源 */ },
  async play(ctx: ShowcaseContext): Promise<void> {
    const c = ctx.canvas;
    const g = c.getContext('2d');
    const W = ctx.width, H = ctx.height;
    const parts = Array.from({ length: 70 }, (_, i) => ({
      x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 900,
      r: 8 + Math.random() * 12, hue: (i * 37) % 360, rot: Math.random() * 6,
    }));
    let shown = 0;
    ctx.onAmount(v => { shown = v; });   // 壳子驱动数字滚动并回调(见 README“待确认问题”)
    const t0 = performance.now();
    const title = TITLES[ctx.tier] ?? 'BIG WIN';
    await new Promise<void>(resolve => {
      let raf = 0;
      const finish = () => { cancelAnimationFrame(raf); resolve(); };
      ctx.skip.addEventListener('abort', finish, { once: true });
      if (ctx.skip.aborted) { finish(); return; }
      const loop = () => {
        const dt = performance.now() - t0;
        const p = Math.min(1, dt / ctx.durationMs);
        if (g) {
          g.clearRect(0, 0, c.width, c.height);
          g.save(); g.scale(c.width / W, c.height / H);
          g.fillStyle = 'rgba(27,14,51,0.62)'; g.fillRect(0, 0, W, H);
          for (const q of parts) {
            q.vy += 22; q.x += q.vx * 0.016; q.y += q.vy * 0.016; q.rot += 0.1;
            g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
            g.fillStyle = `hsl(${q.hue},90%,65%)`; g.strokeStyle = '#3A1B5C'; g.lineWidth = 3;
            g.beginPath(); g.roundRect(-q.r, -q.r / 2, q.r * 2, q.r, 4); g.fill(); g.stroke(); g.restore();
          }
          const s = 1 + 0.06 * Math.sin(dt / 120);
          g.translate(W / 2, H * 0.4); g.scale(s, s);
          g.font = '700 150px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
          g.lineWidth = 26; g.strokeStyle = '#3A1B5C'; g.strokeText(title, 0, 0);
          g.fillStyle = '#FFE066'; g.fillText(title, 0, 0);
          g.restore();
          g.save(); g.scale(c.width / W, c.height / H);
          g.font = '700 128px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
          g.lineWidth = 24; g.strokeStyle = '#3A1B5C'; g.strokeText(shown.toLocaleString('en-US'), W / 2, H * 0.4 + 190);
          g.fillStyle = '#FFFFFF'; g.fillText(shown.toLocaleString('en-US'), W / 2, H * 0.4 + 190);
          g.restore();
        }
        if (p >= 1) { finish(); return; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    shown = ctx.amount;
  },
  dispose() { /* 无 GPU 资源 */ },
};
export default plugin;
