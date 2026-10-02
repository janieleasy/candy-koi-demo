import { Container, Graphics, Sprite, type Ticker } from 'pixi.js';
import type { AppViewConfig } from '../games/viewTypes';
import type { TextureStore } from './textures';
import { SymbolView, type CellSpec } from './SymbolView';
import { COLS, ROWS, PITCH_X, PITCH_Y, REEL_BG, WINDOW, cellCenterInWindow } from './layout';
import { easeByName, hash32, type Ease } from '../core/utils';

type Mode = 'idle' | 'spin' | 'land';
const N_VIEWS = 6;

/** 一根转轴:6 个 SymbolView 滚动,P 为连续位置(行为单位)。元素 e 在行 P-e 处。 */
class Reel extends Container {
  views: SymbolView[] = [];
  viewE: number[] = [];
  P = 2;
  mode: Mode = 'idle';
  fixed = new Map<number, CellSpec | null>();
  // land tween
  private p0 = 0; private p1 = 0; private t0 = 0; private dur = 1; private ease: Ease = x => x;
  private onLanded: (() => void) | null = null;

  constructor(readonly col: number, store: TextureStore, view: AppViewConfig, private filler: (col: number, e: number) => CellSpec) {
    super();
    for (let k = 0; k < N_VIEWS; k++) {
      const v = new SymbolView(store, view);
      this.views.push(v); this.viewE.push(Number.NaN);
      this.addChild(v);
    }
    this.x = cellCenterInWindow(col, 0).x;
  }

  specFor(e: number): CellSpec | null {
    return this.fixed.has(e) ? this.fixed.get(e)! : this.filler(this.col, e);
  }

  layout(force = false) {
    const f = Math.floor(this.P);
    for (let k = 0; k < N_VIEWS; k++) {
      const e = f + 1 - k;
      const v = this.views[k];
      if (force || this.viewE[k] !== e || this.fixed.has(e)) {
        if (this.viewE[k] !== e) v.setWin(false);
        this.viewE[k] = e;
        const s = this.specFor(e);
        const cur = v.spec;
        if (force || !sameSpec(cur, s)) v.set(s);
        v.alpha = s?.ghost ? 0.28 : 1;
      }
      v.y = cellCenterInWindow(0, 0).y + (this.P - e) * PITCH_Y;
    }
  }

  /** 当前停稳时行 r 对应的 view(仅 idle 有意义) */
  viewAtRow(r: number): SymbolView | null {
    const e = Math.round(this.P) - r;
    const k = this.viewE.indexOf(e);
    return k >= 0 ? this.views[k] : null;
  }

  setStatic(col: (CellSpec | null)[]) {
    this.mode = 'idle';
    this.P = Math.round(this.P < 3 ? 3 : this.P);
    this.fixed.clear();
    for (let r = 0; r < ROWS; r++) this.fixed.set(this.P - r, col[r] ?? null);
    for (const v of this.views) v.setWin(false);
    this.layout(true);
  }

  startSpin() {
    this.mode = 'spin';
    for (const v of this.views) { v.setWin(false); v.alpha = v.spec?.ghost ? 0.28 : 1; }
  }

  /** 开始减速落位:最终 3 个元素作为新进入的元素,backOut 缓动落到整数位 */
  land(final: (CellSpec | null)[], dur: number, ease: Ease, now: number, done: () => void) {
    const p0 = this.P;
    const p1 = Math.ceil(p0) + 4;
    // 清掉远处旧 fixed
    for (const e of [...this.fixed.keys()]) if (e < p0 - 6) this.fixed.delete(e);
    for (let r = 0; r < ROWS; r++) this.fixed.set(p1 - r, final[r] ?? null);
    this.p0 = p0; this.p1 = p1; this.t0 = now; this.dur = Math.max(1, dur); this.ease = ease;
    this.mode = 'land'; this.onLanded = done;
  }

  update(dtRows: number, now: number) {
    if (this.mode === 'spin') {
      this.P += dtRows;
      this.layout();
    } else if (this.mode === 'land') {
      const p = Math.min(1, (now - this.t0) / this.dur);
      this.P = this.p0 + (this.p1 - this.p0) * this.ease(p);
      if (p >= 1) {
        this.P = this.p1; this.mode = 'idle'; this.layout();
        const cb = this.onLanded; this.onLanded = null; cb?.();
      } else this.layout();
    }
    for (const v of this.views) if (v.isWin) v.tick(now);
  }
}

function sameSpec(a: CellSpec | null, b: CellSpec | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  return !!a.ghost === !!b.ghost && JSON.stringify(a.coin ?? null) === JSON.stringify(b.coin ?? null);
}

export interface SpinOptions {
  turbo?: boolean;
  /** 跳过(快速停轴)信号 */
  skip?: AbortSignal;
  /** 每根轴额外延迟(预告),单位 ms;长度 5 */
  extraDelay?: number[];
  /** 最短旋转时间(从开始转到第 1 轴停) */
  minSpinMs?: number;
  onReelStop?: (reel: number) => void;
  /** 仅这些轴转动(H&S 重转:没有空格的轴不转);缺省全转 */
  spinReels?: boolean[];
}

/** 转轴舞台:背景板 → 符号层(mask 1000×620)→ (frame 由 Stage 盖在上面) */
export class ReelSet extends Container {
  readonly bg: Sprite;
  readonly symbolLayer = new Container();
  private maskG = new Graphics();
  readonly reels: Reel[] = [];
  private view!: AppViewConfig;
  private fillerPool: CellSpec[] = [];
  private fillerFor: (col: number, e: number) => CellSpec = () => ({ id: 'L1' });
  private ghostFiller = false;
  private spinning = false;
  private finalGrid: (CellSpec | null)[][] | null = null;
  private skipLanding = false;

  constructor(private store: TextureStore, view: AppViewConfig, private ticker: Ticker) {
    super();
    this.bg = new Sprite(store.texture('reel-bg'));
    this.bg.position.set(REEL_BG.x, REEL_BG.y);
    this.addChild(this.bg);

    this.symbolLayer.position.set(WINDOW.x, WINDOW.y);
    this.maskG.rect(0, 0, WINDOW.w, WINDOW.h).fill(0xffffff);
    this.maskG.position.set(WINDOW.x, WINDOW.y);
    this.addChild(this.maskG);
    this.symbolLayer.mask = this.maskG;
    this.addChild(this.symbolLayer);

    this.configure(view);
    this.ticker.add(this.onTick, this);
  }

  /** 切玩法/换视图:重建 5 根轴(符号集不同) */
  configure(view: AppViewConfig) {
    this.view = view;
    for (const r of this.reels) r.destroy({ children: true });
    this.reels.length = 0;
    // 转动时的填充符号池:所有非 C 的符号(B 额外含基础金币,让转动更像 B 的盘面)
    const ids = Object.keys(view.symbols);
    this.fillerPool = ids.map(id => ({ id }));
    if (view.coinFrames) this.fillerPool.push({ id: 'C' }); // B:转动中混入空白基础币
    this.fillerFor = (col, e) => {
      if (this.ghostFiller) return { id: 'C', ghost: true };       // H&S:空格转动时显示半透明基础币
      return this.fillerPool[hash32(e * 31 + col * 977) % this.fillerPool.length];
    };
    for (let c = 0; c < COLS; c++) {
      const r = new Reel(c, this.store, view, (col, e) => this.fillerFor(col, e));
      this.reels.push(r);
      this.symbolLayer.addChild(r);
    }
    this.showGrid(view.idleGrid.map(col => col.map(id => ({ id }))));
  }

  /** H&S 模式:转动中的填充物换成半透明基础币(需 view.coinFrames) */
  setGhostFiller(on: boolean) { this.ghostFiller = on; }
  get isSpinning() { return this.spinning; }
  get current(): (CellSpec | null)[][] | null { return this.finalGrid; }

  /** 直接显示盘面(无动画)。grid[reel][row];null = 空格 */
  showGrid(grid: (CellSpec | null)[][]) {
    this.finalGrid = grid;
    for (let c = 0; c < COLS; c++) this.reels[c].setStatic(grid[c]);
  }

  /** 全部清空为空格(H&S 中非币格) */
  blank() { this.showGrid(Array.from({ length: COLS }, () => Array<CellSpec | null>(ROWS).fill(null))); }

  /** 停稳时 (reel,row) 的符号视图 */
  cell(c: number, r: number): SymbolView | null {
    const v = this.reels[c]?.viewAtRow(r) ?? null;
    return v && v.visible && v.spec ? v : null;
  }
  allCells(): { c: number; r: number; v: SymbolView }[] {
    const out: { c: number; r: number; v: SymbolView }[] = [];
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const v = this.cell(c, r); if (v) out.push({ c, r, v }); }
    return out;
  }

  /** 高亮一组格子,其余压暗;null = 全部恢复 */
  highlight(cells: { reel: number; row: number }[] | null, dim = 0.45) {
    const set = cells ? new Set(cells.map(p => p.reel * 3 + p.row)) : null;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.reels[c].viewAtRow(r);
      if (!v) continue;
      const on = !!set && set.has(c * 3 + r);
      v.setWin(on);
      v.alpha = set && !on ? dim : 1;
      // 压住 z:中奖符号放最上层
      if (on) this.reels[c].addChild(v);
    }
  }

  /**
   * 转动并逐轴停轴。final[reel][row]。返回全部停稳后 resolve。
   * 时序:t=0 全部开始转;第 c 根轴在 minSpin + c*stagger(+预告延迟)后开始减速落位(backOut)。
   * skip abort → 立即全部快速落位(不错开)。
   */
  spin(final: (CellSpec | null)[][], opts: SpinOptions = {}): Promise<void> {
    const rc = this.view.reel;
    const k = opts.turbo ? rc.turboFactor : 1;
    const stagger = rc.stopStaggerMs * k;
    const minSpin = (opts.minSpinMs ?? 650) * k;
    const landDur = 520 * (opts.turbo ? Math.max(0.5, k) : 1);
    const ease = easeByName(rc.easing);
    this.spinning = true; this.skipLanding = false;
    this.finalGrid = final;
    const active = (c: number) => opts.spinReels ? !!opts.spinReels[c] : true;
    this.reels.forEach((r, c) => { if (active(c)) r.startSpin(); });
    const start = performance.now();
    const extra = opts.extraDelay ?? [0, 0, 0, 0, 0];
    let cumulativeExtra = 0;

    return new Promise<void>(resolve => {
      let remaining = COLS;
      if (!this.reels.some((_, c) => active(c))) { this.spinning = false; this.showGrid(final); resolve(); return; }
      for (let c = 0; c < COLS; c++) if (!active(c)) { this.reels[c].setStatic(final[c]); remaining--; }
      const landed = (c: number) => {
        opts.onReelStop?.(c);
        if (--remaining === 0) { this.spinning = false; resolve(); }
      };
      const timers: number[] = [];
      const landReel = (c: number, quick: boolean) => {
        const reel = this.reels[c];
        if (!active(c)) return;
        if (reel.mode !== 'spin') return;
        reel.land(final[c], quick ? 200 : landDur, quick ? easeByName('cubicOut') : ease, performance.now(), () => landed(c));
      };
      for (let c = 0; c < COLS; c++) {
        if (!active(c)) continue;
        cumulativeExtra += (extra[c] ?? 0) * k;
        const delay = minSpin + c * stagger + cumulativeExtra;
        timers.push(window.setTimeout(() => landReel(c, false), Math.max(0, delay - (performance.now() - start))));
      }
      const onSkip = () => {
        this.skipLanding = true;
        timers.forEach(t => clearTimeout(t));
        for (let c = 0; c < COLS; c++) landReel(c, true);
      };
      if (opts.skip) {
        if (opts.skip.aborted) onSkip();
        else opts.skip.addEventListener('abort', onSkip, { once: true });
      }
    });
  }

  private lastT = performance.now();
  private onTick() {
    const now = performance.now();
    const dt = Math.min(64, now - this.lastT); this.lastT = now;
    const rows = (this.view.reel.spinSpeed / PITCH_Y) * (dt / 1000);
    for (const r of this.reels) r.update(rows, now);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.ticker.remove(this.onTick, this);
    super.destroy(options);
  }
}

export { PITCH_X };
