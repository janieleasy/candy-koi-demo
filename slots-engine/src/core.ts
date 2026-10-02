import type { Grid, LineWin, Pos } from './types.js';
import type { PayRow } from './config.js';

/** 取某轴带上从 stop 开始的连续 3 个位置(首尾循环),返回 [上,中,下] */
export function window3<T>(strip: readonly T[], stop: number): [T, T, T] {
  const n = strip.length;
  return [strip[stop % n], strip[(stop + 1) % n], strip[(stop + 2) % n]];
}

export function buildGrid<T>(strips: readonly (readonly T[])[], stops: readonly number[]): T[][] {
  return strips.map((s, r) => window3(s, stops[r]));
}

export function countSymbol<T>(grid: readonly (readonly T[])[], sym: T): number {
  let n = 0;
  for (const col of grid) for (const s of col) if (s === sym) n++;
  return n;
}

export function positionsOf<T>(grid: readonly (readonly T[])[], sym: T): Pos[] {
  const out: Pos[] = [];
  for (let reel = 0; reel < grid.length; reel++)
    for (let row = 0; row < grid[reel].length; row++) if (grid[reel][row] === sym) out.push({ reel, row });
  return out;
}

export interface LineEvalOptions {
  wild?: string;                    // 玩法 A: 'W';玩法 B: 无
  paytable: Record<string, PayRow>; // 不在表内的图案(S/C/W)作为线首时不赢
  lineBet: number;                  // 线投注(整数)
}

/**
 * 逐线判定(规则文档第 5 节):从轴1起取 X=c[0],W 可替代(仅 wild 配置时),
 * 遇到不等于 X 且不是 W 的图案(含 S、C)即停止;n>=3 才赔。每线只取最长连续。
 */
export function evalLines(grid: Grid<any>, lines: readonly (readonly number[])[], opt: LineEvalOptions): LineWin[] {
  const wins: LineWin[] = [];
  const { wild, paytable, lineBet } = opt;
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li];
    const x = grid[0][ln[0]] as string;
    const row = paytable[x];
    if (!row) continue; // S / C / W 开头:不赢
    let n = 1;
    for (let i = 1; i < 5; i++) {
      const c = grid[i][ln[i]] as string;
      if (c === x || (wild !== undefined && c === wild)) n++;
      else break;
    }
    if (n >= 3) {
      const payMult = row[n - 3];
      const positions: Pos[] = [];
      for (let i = 0; i < n; i++) positions.push({ reel: i, row: ln[i] });
      wins.push({ line: li + 1, symbol: x as any, count: n as 3 | 4 | 5, positions, payMult, win: payMult * lineBet });
    }
  }
  return wins;
}

export function sumWins(w: readonly LineWin[]): number {
  let t = 0; for (const x of w) t += x.win; return t;
}

export function assertBet(bet: number, levels: readonly number[], divisor: number): void {
  if (!Number.isInteger(bet) || !levels.includes(bet)) throw new Error(`invalid bet ${bet}: not in betLevels`);
  if (bet % divisor !== 0) throw new Error(`invalid bet ${bet}: not divisible by ${divisor}`);
}

/** 上限截断:返回 [本步实际入账, 是否触顶] */
export function applyCap(cumBefore: number, stepRaw: number, maxWin: number): { win: number; cum: number; capped: boolean } {
  const total = cumBefore + stepRaw;
  if (total >= maxWin) return { win: maxWin - cumBefore, cum: maxWin, capped: true };
  return { win: stepRaw, cum: total, capped: false };
}
