/**
 * AUTO 自动旋转状态(纯逻辑,可单测)。
 * 口径:选 N 次 = 最多 N 局;remaining = 尚未结算完的局数(含正在进行的一局)。
 *   选 10 → 开始时 remaining=10;第 1 局结算后 9 …… 第 10 局结算后 0 → 自动停止。
 * 「直到特色」:remaining=null(不计数),由外部在触发 FS / H&S 时 stop。
 */
export type AutoChoice = number | 'feature';
export const AUTO_CHOICES: readonly AutoChoice[] = [10, 25, 50, 100, 'feature'];
export type AutoStopReason = 'manual' | 'feature' | 'funds' | 'count' | 'bet' | 'switch' | 'error';

export class AutoPlay {
  private _on = false;
  private _remaining: number | null = null;
  constructor(private emit: (p: { on: boolean; remaining: number | null }) => void) {}
  get on() { return this._on; }
  get remaining() { return this._remaining; }
  lastStop: AutoStopReason | null = null;

  start(choice: AutoChoice) {
    if (this._on) return;
    this._on = true; this.lastStop = null;
    this._remaining = choice === 'feature' ? null : Math.max(1, Math.floor(choice));
    this.emit({ on: true, remaining: this._remaining });
  }
  /** 一局正常结算后调用;返回是否继续下一局。 */
  roundSettled(): boolean {
    if (!this._on) return false;
    if (this._remaining !== null) {
      this._remaining -= 1;
      if (this._remaining <= 0) { this.stop('count'); return false; }
      this.emit({ on: true, remaining: this._remaining });
    }
    return true;
  }
  stop(reason: AutoStopReason) {
    if (!this._on) return;
    this._on = false; this._remaining = null; this.lastStop = reason;
    this.emit({ on: false, remaining: null });
  }
}
