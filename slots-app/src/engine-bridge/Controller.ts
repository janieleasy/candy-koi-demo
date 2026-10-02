/**
 * Controller:把 slots-engine 包成界面用的接口。**不碰 Pixi / DOM。**
 *
 * 每次调用 engine.step 后的固定顺序(SCAFFOLD §4):
 *   1) 钱包:start 步扣 charge;带 settlement 的步把 totalWin 入账(与存档同一同步块内,刷新不会丢钱/重复扣)
 *   2) 写 localStorage(slots:v2:<game> = result.state)
 *   3) bus.emit('step:begin')  → 4) await play(result)(表现层播放)→ 5) bus.emit('step:end')
 *   6) 有 settlement → bus.emit('balance:change'{win}) + bus.emit('round:end')
 * 动画与结果解耦:play 只播放,不能改 result。
 */
import { createEngine, EngineError } from '@engine/index';
import type {
  EngineEx, EngineState, GameId, SpinMode, SpinResult, RoundSettlement,
} from '@engine/index';
import type { MathConfig, AppBus } from '../core/types';
import { saveEngineState, loadEngineState, clearEngineState, type KeyValueStore, type Wallet } from '../core/storage';

export type PlayFn = (result: SpinResult, ctx: { resumed: boolean }) => Promise<void>;

export class InsufficientFunds extends Error {
  constructor(public need: number, public have: number) { super(`insufficient funds: need ${need}, have ${have}`); this.name = 'InsufficientFunds'; }
}

export interface ControllerOptions {
  game: GameId;
  config: MathConfig;
  engine?: EngineEx;
  bus: AppBus;
  store: KeyValueStore;
  wallet: Wallet;
  /** 新建存档时的种子 */
  seed: string | number;
  /** 注入已有存档(debug force 用);不传则读 localStorage */
  initialState?: EngineState | null;
}

export class Controller {
  readonly game: GameId;
  readonly engine: EngineEx;
  readonly config: MathConfig;
  private bus: AppBus;
  private store: KeyValueStore;
  private wallet: Wallet;
  private _state: EngineState;
  private _busy = false;
  /** 当前整局已扣的费用/下注(恢复局中显示用) */
  play: PlayFn = async () => {};
  /** 是否由存档恢复到局中 */
  readonly restoredMidRound: boolean;

  constructor(o: ControllerOptions) {
    this.game = o.game; this.config = o.config; this.bus = o.bus; this.store = o.store; this.wallet = o.wallet;
    this.engine = o.engine ?? createEngine(o.config);
    const loaded = o.initialState ?? loadEngineState(o.store, o.game);
    let st = loaded;
    if (st) {
      // 引擎在下一次 step 才校验;这里提前验证一次,坏档直接丢弃重建(不让页面卡死)
      try { this.validate(st); } catch (e) { console.warn(`[controller ${o.game}] 存档无效,已重建`, e); st = null; }
    }
    this._state = st ?? this.engine.createState(o.seed);
    this.restoredMidRound = !!st && st.round !== null;
    saveEngineState(this.store, this._state);
  }

  /** 校验存档:用一个“空闲则 start / 局中则 continue”的探测 step(纯函数,不落盘)。 */
  private validate(st: EngineState) {
    const cfg = this.config;
    if (st.round === null) {
      this.engine.step(st, { type: 'start', game: this.game, bet: cfg.betLevels[0], mode: 'normal' });
    } else {
      this.engine.step(st, { type: 'continue' });
    }
  }

  get state(): EngineState { return this._state; }
  get busy() { return this._busy; }
  get inRound() { return this._state.round !== null; }
  get displayBalance() { return this.wallet.display; }
  get minBet() { return Math.min(...this.config.betLevels); }
  buyCost(bet: number): number { return this.config.buy.priceMult * bet; }
  get buyEnabled(): boolean { return !!this.config.buy.enabled; }

  /** 替换存档(debug)。 */
  adoptState(s: EngineState) {
    this._state = s;
    saveEngineState(this.store, s);
  }
  resetState(seed: string | number) {
    clearEngineState(this.store, this.game);
    this._state = this.engine.createState(seed);
    saveEngineState(this.store, this._state);
  }

  /** 一步:先入账/存档,再事件+播放。 */
  private async doStep(req: Parameters<EngineEx['step']>[1], resumed = false): Promise<SpinResult> {
    const before = this._state;
    const r = this.engine.step(before, req);   // 失败直接抛 EngineError,无副作用
    if (r.charge > 0) {
      if (this.wallet.balance < r.charge) throw new InsufficientFunds(r.charge, this.wallet.balance);
      this.wallet.set(this.wallet.balance - r.charge);
    }
    if (r.settlement && r.settlement.totalWin > 0) this.wallet.set(this.wallet.balance + r.settlement.totalWin);
    this._state = r.state;
    saveEngineState(this.store, r.state);       // ★ 先存档,再播放
    if (r.charge > 0) {
      const round = r.state.round;
      this.wallet.display -= r.charge;
      this.bus.emit('round:start', {
        roundId: round?.roundId ?? r.settlement!.roundId,
        bet: (round?.bet ?? r.settlement!.bet), mode: round?.mode ?? r.settlement!.mode, charge: r.charge,
      });
      this.bus.emit('balance:change', { balance: this.wallet.display, delta: -r.charge, reason: 'charge' });
    }
    this.bus.emit('step:begin', { step: r.step });
    try {
      await this.play(r, { resumed });
    } finally {
      this.bus.emit('step:end', { step: r.step });
    }
    if (r.settlement) this.finishRound(r.settlement);
    return r;
  }

  private finishRound(s: RoundSettlement) {
    if (s.capped) this.bus.emit('cap:reached', { maxWin: s.totalWin });
    this.bus.emit('round:end', { settlement: s });
  }

  /**
   * 把已入账(wallet.balance)的赢额反映到显示余额,并发 balance:change{win}。
   * 由壳子在“大赢演出之后”调用,所以显示余额晚于真实余额;刷新后两者重新一致。
   */
  commitDisplayBalance(): number {
    const before = this.wallet.display;
    this.wallet.display = this.wallet.balance;
    if (this.wallet.display !== before)
      this.bus.emit('balance:change', { balance: this.wallet.display, delta: this.wallet.display - before, reason: 'win' });
    return this.wallet.display;
  }

  /** 开一局,只执行并播放第 1 步。 */
  async start(bet: number, mode: SpinMode = 'normal'): Promise<SpinResult> {
    if (this._busy) throw new Error('controller busy');
    this._busy = true;
    try { return await this.doStep({ type: 'start', game: this.game, bet, mode }); }
    finally { this._busy = false; }
  }
  /** 推进当前局的下一步。 */
  async continue(): Promise<SpinResult> {
    if (this._busy) throw new Error('controller busy');
    this._busy = true;
    try { return await this.doStep({ type: 'continue' }); }
    finally { this._busy = false; }
  }
  /** 存档恢复:round 非空则继续下一步;为空则无事发生(返回 null)。已扣的 charge 不会重复扣。 */
  async resume(): Promise<SpinResult | null> {
    if (!this._state.round) return null;
    if (this._busy) throw new Error('controller busy');
    this._busy = true;
    try { return await this.doStep({ type: 'continue' }, true); }
    finally { this._busy = false; }
  }

  /**
   * 整局驱动:start 后自动 continue 到 settlement(特色玩法期间不回 Idle)。
   * between() 在每两步之间调用,可用于自动旋转的暂停/中止(返回 false = 暂停,保留存档,稍后可 resume)。
   */
  async playRound(bet: number, mode: SpinMode = 'normal', between?: (next: SpinResult) => boolean | Promise<boolean>): Promise<RoundSettlement | null> {
    let r = await this.start(bet, mode);
    while (!r.settlement) {
      if (between && !(await between(r))) return null;
      r = await this.continue();
    }
    return r.settlement;
  }
  async resumeRound(between?: (last: SpinResult) => boolean | Promise<boolean>): Promise<RoundSettlement | null> {
    let r = await this.resume();
    if (!r) return null;
    while (!r.settlement) {
      if (between && !(await between(r))) return null;
      r = await this.continue();
    }
    return r.settlement;
  }
}

export { EngineError };
