import { Container, Graphics } from 'pixi.js';
import type { Coin } from '@engine/index';
import type { AppViewConfig } from '../games/viewTypes';
import type { TextureStore } from './textures';
import { SymbolView } from './SymbolView';
import { CELL, WINDOW, cellCenterInWindow } from './layout';
import { ease, tween } from '../core/utils';

interface Item { key: string; box: Container; plate: Graphics; sym: SymbolView; coin: Coin }

/** H&S 锁定币层:在转轴之上、frame 之下(与符号层同 mask 坐标),每个锁币带底板遮住下面转动的填充符号。 */
export class CoinLayer extends Container {
  private items = new Map<string, Item>();
  private maskG = new Graphics();
  private view!: AppViewConfig;

  constructor(private store: TextureStore, view: AppViewConfig) {
    super();
    this.view = view;
    this.position.set(WINDOW.x, WINDOW.y);
    this.maskG.rect(0, 0, WINDOW.w, WINDOW.h).fill(0xffffff);
    this.addChild(this.maskG);
    this.mask = this.maskG;
  }
  setView(view: AppViewConfig) { this.view = view; }

  private key(c: { reel: number; row: number }) { return `${c.reel},${c.row}`; }
  has(c: { reel: number; row: number }) { return this.items.has(this.key(c)); }
  get count() { return this.items.size; }
  get coins(): Coin[] { return [...this.items.values()].map(i => i.coin); }

  /** 放一枚币;animate=true 时弹出 */
  async add(coin: Coin, animate: boolean, signal?: AbortSignal): Promise<void> {
    const key = this.key(coin);
    if (this.items.has(key)) this.remove(coin);
    const box = new Container();
    const p = cellCenterInWindow(coin.reel, coin.row);
    box.position.set(p.x, p.y);
    const plate = new Graphics()
      .roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 30).fill({ color: 0x2b1b4d, alpha: 1 })
      .roundRect(-CELL / 2 + 4, -CELL / 2 + 4, CELL - 8, CELL - 8, 26).fill({ color: 0x3a2570, alpha: 1 });
    const sym = new SymbolView(this.store, this.view);
    sym.set({ id: 'C', coin: coin.value });
    box.addChild(plate, sym);
    this.addChild(box);
    const item: Item = { key, box, plate, sym, coin };
    this.items.set(key, item);
    if (animate) {
      box.scale.set(0.2); box.alpha = 0;
      await tween(320, t => { box.scale.set(0.2 + 0.8 * t); box.alpha = Math.min(1, t * 2); }, ease.backOut, signal);
      box.scale.set(1); box.alpha = 1;
    }
  }

  setMany(coins: Coin[]) {
    this.clear();
    for (const c of coins) void this.add(c, false);
  }

  remove(c: { reel: number; row: number }) {
    const it = this.items.get(this.key(c));
    if (!it) return;
    it.box.destroy({ children: true });
    this.items.delete(it.key);
  }
  clear() {
    for (const it of this.items.values()) it.box.destroy({ children: true });
    this.items.clear();
  }

  /** 币的舞台绝对坐标 */
  absPos(c: { reel: number; row: number }) {
    const p = cellCenterInWindow(c.reel, c.row);
    return { x: p.x + WINDOW.x, y: p.y + WINDOW.y };
  }

  /** 单个币脉冲(结算时) */
  async pulse(c: { reel: number; row: number }, signal?: AbortSignal) {
    const it = this.items.get(this.key(c));
    if (!it) return;
    await tween(260, t => { const s = 1 + 0.22 * Math.sin(Math.PI * t); it.box.scale.set(s); }, ease.linear, signal);
    it.box.scale.set(1);
  }
  /** 结算后让币变暗(已飞走) */
  consume(c: { reel: number; row: number }) {
    const it = this.items.get(this.key(c));
    if (it) it.box.alpha = 0.35;
  }

  tick(now: number) { for (const it of this.items.values()) if (it.sym.isWin) it.sym.tick(now); }
}
