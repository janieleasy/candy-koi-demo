import type { Tier } from '../timeline';

/** 程序化文字纹理(Canvas2D → CanvasTexture):标题逐字母图集 / 数字 / 倍数徽章。字体 Fredoka 700(主包已加载),描边 #3A1B5C。 */
const FONT = `"Fredoka", system-ui, sans-serif`;
export const OUTLINE = '#3A1B5C';

const GRADS: Record<Tier, [number, string][]> = {
  big:  [[0, '#FFFBD0'], [.45, '#FFE066'], [1, '#FFA63A']],
  mega: [[0, '#FFF1F8'], [.42, '#FF86B0'], [1, '#C65CFF']],
  epic: [[0, '#FFFBD6'], [.34, '#FFD84A'], [.7, '#FF8F2E'], [1, '#FF4F7A']],
  max:  [[0, '#FFFFFF'], [.3, '#FFE066'], [.62, '#FF9A3C'], [1, '#FF3D6E']],
};

export interface TitleLayout {
  canvas: HTMLCanvasElement;
  letters: { cx: number; cellW: number; u0: number; u1: number }[];  // cx: 相对标题中心的世界 x
  cellH: number;     // 世界单位
  fontPx: number;
}

function mk(w: number, h: number) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }

/** 逐字母图集:每个字母一格(带内边距,互不重叠),顶点着色器按格独立弹跳 */
export function makeTitle(text: string, tier: Tier, maxWidth: number, SS = 1.5): TitleLayout {
  const meas = mk(8, 8).getContext('2d')!;
  let F = 200;
  const spacing = 0.04;
  const adv = (ch: string, f: number) => { meas.font = `700 ${f}px ${FONT}`; return ch === ' ' ? f * 0.3 : meas.measureText(ch).width + f * spacing; };
  const total = (f: number) => [...text].reduce((a, ch) => a + adv(ch, f), 0);
  F = Math.min(F, F * maxWidth / total(F));
  const pad = Math.ceil(F * 0.22) + 8;
  const cellH = F * 1.25 + pad * 2;
  const chars = [...text];
  const advs = chars.map(ch => adv(ch, F));
  const cells = chars.map((ch, i) => ({ ch, adv: advs[i], w: ch === ' ' ? 0 : advs[i] + pad * 2 }));
  const atlasW = cells.reduce((a, c) => a + c.w, 0);
  const canvas = mk(atlasW * SS, cellH * SS);
  const g = canvas.getContext('2d')!;
  g.scale(SS, SS);
  g.lineJoin = 'round'; g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const letters: TitleLayout['letters'] = [];
  const totalAdv = advs.reduce((a, b) => a + b, 0);
  let penX = -totalAdv / 2; let ax = 0;
  const stops = GRADS[tier];
  cells.forEach((c, i) => {
    if (c.ch === ' ') { penX += c.adv; return; }
    const cx0 = ax + pad + (c.adv - F * spacing) / 2; const cy = cellH / 2 - F * 0.02;
    g.font = `700 ${F}px ${FONT}`;
    // 1 底部挤出阴影
    g.strokeStyle = '#220B3D'; g.lineWidth = F * 0.27; g.strokeText(c.ch, cx0, cy + F * 0.075);
    // 2 外描边(#3A1B5C)
    g.strokeStyle = OUTLINE; g.lineWidth = F * 0.27; g.strokeText(c.ch, cx0, cy);
    // 3 白色糖衣内沿
    g.strokeStyle = '#FFFFFF'; g.lineWidth = F * 0.135; g.strokeText(c.ch, cx0, cy);
    // 4 渐变填充 + 高光(在临时层里做 source-atop,再贴回图集)
    const t = mk(c.w * SS, cellH * SS); const tg = t.getContext('2d')!;
    tg.scale(SS, SS); tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.font = `700 ${F}px ${FONT}`;
    const grad = tg.createLinearGradient(0, cy - F * 0.5, 0, cy + F * 0.5);
    for (const [o, col] of stops) grad.addColorStop(o, col);
    tg.fillStyle = grad; tg.fillText(c.ch, cx0 - ax, cy);
    tg.globalCompositeOperation = 'source-atop';
    const gl = tg.createLinearGradient(0, cy - F * 0.5, 0, cy + F * 0.05);
    gl.addColorStop(0, 'rgba(255,255,255,0.78)'); gl.addColorStop(0.55, 'rgba(255,255,255,0.18)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    tg.fillStyle = gl; tg.fillRect(0, cy - F * 0.55, c.w, F * 0.6);
    const sh = tg.createLinearGradient(0, cy + F * 0.1, 0, cy + F * 0.52);
    sh.addColorStop(0, 'rgba(120,20,80,0)'); sh.addColorStop(1, 'rgba(120,20,80,0.32)');
    tg.fillStyle = sh; tg.fillRect(0, cy + F * 0.1, c.w, F * 0.5);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(t, ax * SS, 0); g.restore();
    // 5 小高光点(左上)
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(cx0 - F * 0.2, cy - F * 0.3, F * 0.045, F * 0.028, -0.5, 0, Math.PI * 2); g.fill();
    letters.push({ cx: penX + c.adv / 2 - F * spacing / 2 * 0, cellW: c.w, u0: ax / atlasW, u1: (ax + c.w) / atlasW });
    ax += c.w; penX += c.adv;
  });
  return { canvas, letters, cellH, fontPx: F };
}

export interface NumberSheet { canvas: HTMLCanvasElement; worldW: number; worldH: number; draw(n: number): void }
/** 滚动数字:等宽数字栅格(避免滚动时抖动);档位填色渐变(tiers.json amountFill)、#3A1B5C 粗描边、y+10 软阴影 #1B0E33 α.35 */
export function makeNumberSheet(fill: string[]): NumberSheet {
  const W = 1100, H = 230, worldW = 990, worldH = worldW * H / W;
  const canvas = mk(W, H); const ctx = canvas.getContext('2d')!;
  let last = '';
  const draw = (n: number) => {
    const s = Math.round(n).toLocaleString('en-US'); if (s === last) return; last = s;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let F = 150; ctx.font = `700 ${F}px ${FONT}`;
    const dw = ctx.measureText('0').width, cw = ctx.measureText(',').width * 1.05;
    const widths = [...s].map(ch => (ch === ',' ? cw : dw));
    const tw = widths.reduce((a, b) => a + b, 0);
    const k = Math.min(1, (W - 140) / tw);
    let x = W / 2 - (tw * k) / 2; const y = H / 2 - 6;
    const grad = ctx.createLinearGradient(0, y - F * 0.5, 0, y + F * 0.5);
    fill.forEach((c, i) => grad.addColorStop(fill.length === 1 ? 0 : i / (fill.length - 1), c));
    [...s].forEach((ch, i) => {
      const w = widths[i] * k, cx = x + w / 2; x += w;
      ctx.strokeStyle = 'rgba(27,14,51,0.35)'; ctx.lineWidth = F * 0.2; ctx.strokeText(ch, cx, y + 10);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = F * 0.2; ctx.strokeText(ch, cx, y);
      ctx.fillStyle = grad; ctx.fillText(ch, cx, y);
    });
  };
  draw(0);
  return { canvas, worldW, worldH, draw };
}

/** "×52.4" 倍数徽章(静态) */
export function makeBadge(multiple: number): { canvas: HTMLCanvasElement; worldW: number; worldH: number } {
  const W = 420, H = 110; const c = mk(W, H); const g = c.getContext('2d')!;
  const txt = `×${multiple >= 100 ? Math.round(multiple) : multiple.toFixed(1)}`;
  g.lineJoin = 'round';
  const rr = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  rr(8, 8, W - 16, H - 16, 40); g.fillStyle = 'rgba(43,27,77,0.88)'; g.fill();
  g.lineWidth = 7; g.strokeStyle = OUTLINE; g.stroke();
  rr(14, 14, W - 28, H - 28, 34); g.lineWidth = 4; g.strokeStyle = '#FFE066'; g.stroke();
  g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const gr = g.createLinearGradient(0, 24, 0, H - 24); gr.addColorStop(0, '#FFF6B8'); gr.addColorStop(1, '#FFC940');
  g.lineWidth = 12; g.strokeStyle = OUTLINE; g.strokeText(txt, W / 2, H / 2 + 4);
  g.fillStyle = gr; g.fillText(txt, W / 2, H / 2 + 4);
  return { canvas: c, worldW: 300, worldH: 300 * H / W };
}

/** 标题美术稿加载失败时的兜底:用 Canvas 逐字母图集拼成单张(900 宽以内) */
export function makeTitleFallback(text: string, tier: Tier): { canvas: HTMLCanvasElement; worldW: number; worldH: number } {
  const SS = 1.5;
  const lay = makeTitle(text, tier, 800, SS);
  const first = lay.letters[0], last = lay.letters[lay.letters.length - 1];
  const span = (last.cx + last.cellW / 2) - (first.cx - first.cellW / 2);
  const W = Math.ceil(span), H = Math.ceil(lay.cellH);
  const c = mk(W * SS, H * SS); const g = c.getContext('2d')!;
  const atlasW = lay.canvas.width;
  for (const l of lay.letters) {
    const sx = l.u0 * atlasW, sw = (l.u1 - l.u0) * atlasW;
    g.drawImage(lay.canvas, sx, 0, sw, lay.canvas.height, (l.cx - l.cellW / 2 - (first.cx - first.cellW / 2)) * SS, 0, sw, lay.canvas.height);
  }
  return { canvas: c, worldW: W, worldH: H };
}
