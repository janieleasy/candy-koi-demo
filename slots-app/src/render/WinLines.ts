import { Container, Graphics } from 'pixi.js';
import type { LineWin, Pos, ScatterWin } from '@engine/index';
import { cellCenterAbs } from './layout';
import type { ReelSet } from './ReelSet';
import { sleep } from '../core/utils';

const LINE_COLORS = [0xff5c8a, 0xffe066, 0x6ee7c8, 0x5cc8ff, 0xff9f43, 0xb5a0ff];

/**
 * 赢线展示:总览(全部中奖格一起脉冲)→ 逐线高亮循环。
 * 线用 Graphics 画在 reel-frame 之上(折线穿过参与格的格心 + 圆点),符号放大脉冲由 ReelSet.highlight 负责。
 */
export class WinLines extends Container {
  private g = new Graphics();
  private loopId = 0;

  constructor(private reels: ReelSet) {
    super();
    this.addChild(this.g);
  }

  clear() {
    this.loopId++;
    this.g.clear();
    this.reels.highlight(null);
  }

  private drawLine(l: LineWin) {
    const color = LINE_COLORS[(l.line - 1) % LINE_COLORS.length];
    const pts = [...l.positions].sort((a, b) => a.reel - b.reel).map(p => cellCenterAbs(p.reel, p.row));
    this.g.clear();
    if (pts.length >= 2) {
      this.g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) this.g.lineTo(p.x, p.y);
      this.g.stroke({ width: 16, color: 0x3a1b5c, alpha: 0.85, join: 'round', cap: 'round' });
      this.g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) this.g.lineTo(p.x, p.y);
      this.g.stroke({ width: 8, color, alpha: 1, join: 'round', cap: 'round' });
    }
    for (const p of pts) this.g.circle(p.x, p.y, 10).fill({ color: 0xffffff }).stroke({ width: 4, color: 0x3a1b5c });
  }

  /** 全部中奖格(线 + scatter) */
  allPositions(lines: LineWin[], scatter: ScatterWin | null): Pos[] {
    const m = new Map<number, Pos>();
    for (const l of lines) for (const p of l.positions) m.set(p.reel * 3 + p.row, p);
    if (scatter) for (const p of scatter.positions) m.set(p.reel * 3 + p.row, p);
    return [...m.values()];
  }

  /**
   * 展示一轮:先总览 overviewMs,再逐线 perLineMs。signal abort → 直接停在总览态并返回。
   * onLine 回调用于发 'win:line' 事件。
   */
  async present(lines: LineWin[], scatter: ScatterWin | null, o: { overviewMs: number; perLineMs: number; signal?: AbortSignal; onLine?: (line: number) => void }) {
    const my = ++this.loopId;
    const all = this.allPositions(lines, scatter);
    if (all.length === 0) return;
    this.g.clear();
    this.reels.highlight(all);
    await sleep(o.overviewMs, o.signal);
    if (my !== this.loopId || o.signal?.aborted) return;
    for (const l of lines) {
      if (my !== this.loopId || o.signal?.aborted) return;
      o.onLine?.(l.line);
      this.drawLine(l);
      this.reels.highlight(l.positions, 0.5);
      await sleep(o.perLineMs, o.signal);
    }
    if (my !== this.loopId) return;
    this.g.clear();
    this.reels.highlight(all);
  }

  /** 空闲时循环展示(下一次 spin 前由 Shell clear 终止) */
  async loop(lines: LineWin[], scatter: ScatterWin | null, perLineMs = 900) {
    const my = ++this.loopId;
    const all = this.allPositions(lines, scatter);
    if (all.length === 0) return;
    while (my === this.loopId) {
      this.g.clear();
      this.reels.highlight(all);
      await sleep(perLineMs + 300);
      for (const l of lines) {
        if (my !== this.loopId) return;
        this.drawLine(l);
        this.reels.highlight(l.positions, 0.5);
        await sleep(perLineMs);
      }
    }
  }
}
