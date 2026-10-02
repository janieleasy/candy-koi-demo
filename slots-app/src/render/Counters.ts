import { BitmapFont, BitmapText, Container, NineSliceSprite, Sprite, Text } from 'pixi.js';
import type { JackpotTier } from '@engine/index';
import type { TextureStore } from './textures';
import { NUM_FONT, NUM_FONT_GOLD } from './SymbolView';
import { FRAME, WIN_BAR, WIN_SLOT, BAND_Y } from './layout';
import { ease, fmt, tween } from '../core/utils';

const NUM_CHARS = '0123456789,.x×+-/ ';
let fontsInstalled = false;
/** 预生成 Fredoka 位图字体:白字(币面/计数)+ 金字(奖金),描边 #3A1B5C = 字号×0.18 */
export function installBitmapFonts() {
  if (fontsInstalled) return;
  fontsInstalled = true;
  const base = { fontFamily: 'Fredoka, "Baloo 2", system-ui, sans-serif', fontWeight: '700' as const, fontSize: 64 };
  BitmapFont.install({
    name: NUM_FONT, chars: NUM_CHARS, resolution: 2, padding: 4,
    style: { ...base, fill: 0xffffff, stroke: { color: 0x3a1b5c, width: 64 * 0.18, join: 'round' } },
  });
  BitmapFont.install({
    name: NUM_FONT_GOLD, chars: NUM_CHARS, resolution: 2, padding: 4,
    style: { ...base, fill: 0xffe066, stroke: { color: 0x3a1b5c, width: 64 * 0.18, join: 'round' } },
  });
}

export const CJK_STACK = 'Fredoka, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

/** 数字文本:居中、限宽缩放、可滚动。 */
export class AmountText extends Container {
  private bt: BitmapText;
  value = 0;
  private rollId = 0;
  constructor(font: string, private size: number, private maxW: number, private prefix = '') {
    super();
    this.bt = new BitmapText({ text: '0', style: { fontFamily: font, fontSize: size } });
    this.bt.anchor.set(0.5);
    this.addChild(this.bt);
    this.render(0);
  }
  private render(n: number) {
    this.bt.text = this.prefix + fmt(n);
    this.bt.scale.set(1);
    const w = this.bt.width;
    if (w > this.maxW) this.bt.scale.set(this.maxW / w);
  }
  setValue(n: number) { this.rollId++; this.value = n; this.render(n); }
  setText(s: string) { this.rollId++; this.bt.text = s; this.bt.scale.set(1); if (this.bt.width > this.maxW) this.bt.scale.set(this.maxW / this.bt.width); }
  /** 滚动到目标值;signal abort → 直接显示终值 */
  async rollTo(target: number, ms: number, signal?: AbortSignal): Promise<void> {
    const id = ++this.rollId;
    const from = this.value;
    if (from === target || ms <= 0 || signal?.aborted) { this.value = target; this.render(target); return; }
    await tween(ms, t => {
      if (id !== this.rollId) return;
      this.value = Math.round(from + (target - from) * t);
      this.render(this.value);
    }, ease.cubicOut, signal);
    if (id === this.rollId) { this.value = target; this.render(target); }
  }
  pop() { const b = this.bt; void tween(220, t => b.scale.set((1 + 0.18 * Math.sin(Math.PI * t)) * (this.maxW / Math.max(this.maxW, b.width / b.scale.x))), ease.linear); }
}

/** 赢额条(win-bar):数字槽中心 (450,66) */
export class WinBar extends Container {
  readonly amount = new AmountText(NUM_FONT_GOLD, 58, 480);
  private caption: Text;
  constructor(store: TextureStore) {
    super();
    const e = store.entry('win-bar');
    const bar = new NineSliceSprite({
      texture: store.texture('win-bar'), leftWidth: e.borders!.left, rightWidth: e.borders!.right, topHeight: 0, bottomHeight: 0,
      width: WIN_BAR.w, height: WIN_BAR.h,
    });
    bar.position.set(WIN_BAR.x, WIN_BAR.y);
    this.addChild(bar);
    this.amount.position.set(WIN_SLOT.x, WIN_SLOT.y + 2);
    this.addChild(this.amount);
    this.caption = new Text({ text: '', style: { fontFamily: CJK_STACK, fontSize: 26, fontWeight: '700', fill: 0xffe066, stroke: { color: 0x3a1b5c, width: 5, join: 'round' } } });
    this.caption.anchor.set(0.5);
    this.caption.position.set(WIN_BAR.x + WIN_BAR.w / 2, WIN_BAR.y - 6);
    this.addChild(this.caption);
  }
  setLabel(s: string) { this.caption.text = s; }
}

/** 玩法 A 免费旋转计数带:剩余次数 | 倍数阶梯 x1/x2/x3/x5 | 累计赢 */
export class FsPanel extends Container {
  readonly remaining: AmountText;
  readonly total: AmountText;
  private mults: Sprite[] = [];
  private cy = BAND_Y + 85;
  constructor(store: TextureStore, ladder: number[]) {
    super();
    const rem = new Sprite(store.texture('fs_remaining')); rem.anchor.set(0.5); rem.position.set(150, this.cy);
    const tot = new Sprite(store.texture('fs_total')); tot.anchor.set(0.5); tot.position.set(915, this.cy);
    this.remaining = new AmountText(NUM_FONT, 46, 150); this.remaining.position.set(150, this.cy + 20);
    this.total = new AmountText(NUM_FONT_GOLD, 42, 190); this.total.position.set(915, this.cy + 20);
    this.addChild(rem, tot, this.remaining, this.total);
    const keys = ['mult_x1', 'mult_x2', 'mult_x3', 'mult_x5'];
    const xs = [330, 456, 582, 708];
    ladder.slice(0, 4).forEach((_, i) => {
      const s = new Sprite(store.texture(keys[i])); s.anchor.set(0.5); s.position.set(xs[i], this.cy);
      this.mults.push(s); this.addChild(s);
    });
    this.setLadder(0);
  }
  /** 高亮当前阶梯;其余半透明缩小 */
  setLadder(i: number) {
    this.mults.forEach((s, k) => { const on = k === i; s.alpha = on ? 1 : 0.4; s.scale.set(on ? 1.12 : 0.88); });
  }
  async bumpLadder(i: number) { this.setLadder(i); const s = this.mults[i]; if (s) await tween(260, t => s.scale.set(1.12 + 0.2 * Math.sin(Math.PI * t)), ease.linear); this.setLadder(i); }
}

/** 玩法 B 的 Jackpot 牌:Grand/Major/Minor/Mini,数字 = jackpotMult × 当前下注 */
export class JackpotBar extends Container {
  private nums: Record<JackpotTier, AmountText>;
  private mults: Record<JackpotTier, number>;
  constructor(store: TextureStore, mults: Record<JackpotTier, number>) {
    super();
    this.mults = mults;
    const bar = new Sprite(store.texture('jackpot-bar'));
    bar.position.set(FRAME.x, BAND_Y);
    this.addChild(bar);
    const order: JackpotTier[] = ['Grand', 'Major', 'Minor', 'Mini'];
    this.nums = {} as Record<JackpotTier, AmountText>;
    order.forEach((t, i) => {
      const a = new AmountText(NUM_FONT_GOLD, 40, 190);
      a.position.set(FRAME.x + i * 260 + 120, BAND_Y + 109);
      this.nums[t] = a; this.addChild(a);
    });
  }
  setBet(bet: number) { for (const t of Object.keys(this.nums) as JackpotTier[]) this.nums[t].setValue(this.mults[t] * bet); }
}

/** B 的 H&S 抬头:重转点 dots_NofM + 已锁定 K/15 */
export class HsHeader extends Container {
  private dots: Sprite;
  private store: TextureStore;
  readonly k: AmountText;
  constructor(store: TextureStore) {
    super();
    this.store = store;
    this.dots = new Sprite(store.texture('dots_3of3')); this.dots.anchor.set(0.5); this.dots.position.set(260, 150);
    this.k = new AmountText(NUM_FONT_GOLD, 56, 220); this.k.position.set(790, 150);
    const lab = new Text({ text: '已锁定', style: { fontFamily: CJK_STACK, fontSize: 24, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x3a1b5c, width: 5, join: 'round' } } });
    lab.anchor.set(0.5); lab.position.set(790, 108);
    const lab2 = new Text({ text: '剩余重转', style: { fontFamily: CJK_STACK, fontSize: 24, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x3a1b5c, width: 5, join: 'round' } } });
    lab2.anchor.set(0.5); lab2.position.set(260, 98);
    this.addChild(this.dots, this.k, lab, lab2);
  }
  /** 当前显示的 K / R(测试与调试读取) */
  shownK = 0;
  shownR = 0;
  set(K: number, R: number) {
    this.shownK = K; this.shownR = R;
    this.dots.texture = this.store.texture(`dots_${Math.max(0, Math.min(3, R))}of3`);
    this.k.setText(`${K}/15`);
  }
  async bumpDots() { const d = this.dots; await tween(300, t => d.scale.set(1 + 0.2 * Math.sin(Math.PI * t)), ease.linear); d.scale.set(1); }
}

/** A 基础旋转时带区的提示条(panel-info 九宫格) */
export class HintStrip extends Container {
  private text: Text;
  constructor(store: TextureStore, msg: string) {
    super();
    const e = store.entry('panel-info');
    const p = new NineSliceSprite({
      texture: store.texture('panel-info'), leftWidth: e.borders!.left, topHeight: e.borders!.top, rightWidth: e.borders!.right, bottomHeight: e.borders!.bottom,
      width: FRAME.w, height: 120,
    });
    p.position.set(FRAME.x, BAND_Y + 30);
    this.text = new Text({ text: msg, style: { fontFamily: CJK_STACK, fontSize: 36, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x3a1b5c, width: 7, join: 'round' } } });
    this.text.anchor.set(0.5);
    this.text.position.set(FRAME.x + FRAME.w / 2, BAND_Y + 86);
    this.addChild(p, this.text);
  }
  setText(s: string) { this.text.text = s; }
}
