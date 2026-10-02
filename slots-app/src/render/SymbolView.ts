import { BitmapText, ColorMatrixFilter, Container, Sprite, Texture } from 'pixi.js';
import type { Coin, CoinValue } from '@engine/index';
import type { AppViewConfig } from '../games/viewTypes';
import type { TextureStore } from './textures';
import { SYMBOL_DY, SYMBOL_SCALE } from './layout';

/** 一格要显示的内容:图案 id;C 可带币值(无币值 = 空白基础币,转动中用) */
export interface CellSpec { id: string; coin?: CoinValue; ghost?: boolean }

export const NUM_FONT = 'FredokaNum';       // 白字 + #3A1B5C 描边(币面)
export const NUM_FONT_GOLD = 'FredokaGold'; // #FFE066 填充(奖金)

/** 币面变体:倍数币 ≤3 低 / ≤10 中 / 其余高(README §1.1);Jackpot 按层级。 */
export function coinFrame(view: AppViewConfig, coin?: CoinValue): string {
  const f = view.coinFrames;
  if (!f) throw new Error('view.coinFrames missing');
  if (!coin) return f.base;
  if (coin.kind === 'jp') return f.jp[coin.tier];
  return coin.mult <= 3 ? f.multLow : coin.mult <= 10 ? f.multMid : f.multHigh;
}

export function cellFromCoin(c: Coin): CellSpec { return { id: 'C', coin: c.value }; }

/**
 * 单个符号视图:Sprite(165/256 缩放,+2px)+ 币值 BitmapText(槽心 (128,114) 相对 256 画布中心 (0,-14))。
 * 中奖效果:缩放脉冲 + ColorMatrixFilter 亮度,不出新图。
 */
export class SymbolView extends Container {
  readonly sprite = new Sprite();
  private numLabel: BitmapText | null = null;
  private filter: ColorMatrixFilter | null = null;
  private baseScale = SYMBOL_SCALE;
  private winScale = 1.12;
  private winOn = false;
  private winT0 = 0;
  spec: CellSpec | null = null;

  constructor(private store: TextureStore, private view: AppViewConfig) {
    super();
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(SYMBOL_SCALE);
    this.sprite.y = SYMBOL_DY;
    this.addChild(this.sprite);
  }

  setView(view: AppViewConfig) { this.view = view; }

  set(spec: CellSpec | null) {
    this.spec = spec;
    if (!spec) { this.alpha = 1; this.sprite.visible = false; if (this.numLabel) this.numLabel.visible = false; return; }
    this.sprite.visible = true;
    this.alpha = spec.ghost ? 0.28 : 1;
    let frame: string;
    if (spec.id === 'C') frame = coinFrame(this.view, spec.coin);
    else {
      const v = this.view.symbols[spec.id];
      if (!v) throw new Error(`no view for symbol ${spec.id}`);
      frame = v.frame;
      this.winScale = v.winScale ?? 1.12;
    }
    if (spec.id === 'C') this.winScale = 1.12;
    this.sprite.texture = this.store.symbol(frame) as Texture;
    // 币值数字:仅倍数币;Jackpot 币丝带自带层级名
    if (spec.id === 'C' && spec.coin?.kind === 'mult') {
      if (!this.numLabel) {
        this.numLabel = new BitmapText({ text: '', style: { fontFamily: NUM_FONT, fontSize: 50 } });
        this.numLabel.anchor.set(0.5);
        // 数值槽圆心 (128,114) → 相对 256 画布中心 (0,-14),再按显示缩放
        this.numLabel.position.set(0, (114 - 128) * SYMBOL_SCALE + SYMBOL_DY);
        this.numLabel.scale.set(SYMBOL_SCALE);
        this.addChild(this.numLabel);
      }
      this.numLabel.text = String(spec.coin.mult);
      this.numLabel.visible = true;
    } else if (this.numLabel) this.numLabel.visible = false;
  }

  /** 开关中奖脉冲;off 时恢复原状 */
  setWin(on: boolean, now = performance.now()) {
    if (on === this.winOn) return;
    this.winOn = on; this.winT0 = now;
    if (on) {
      if (!this.filter) this.filter = new ColorMatrixFilter();
      this.sprite.filters = [this.filter];
    } else {
      this.sprite.filters = null;
      this.scale.set(1);
    }
  }
  get isWin() { return this.winOn; }

  /** 由 Stage ticker 驱动 */
  tick(now: number) {
    if (!this.winOn || !this.filter) return;
    const p = 0.5 - 0.5 * Math.cos(((now - this.winT0) / 620) * Math.PI * 2); // 0..1..0
    const s = 1 + (this.winScale - 1) * p;
    this.scale.set(s);
    this.filter.reset();
    this.filter.brightness(1 + 0.28 * p, true);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.filter?.destroy();
    super.destroy(options);
  }
}
