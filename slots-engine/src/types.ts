/**
 * slots 引擎协议 v2(技术负责人定稿,取代 slots-engine/src/types.ts 的 v0.1 草案)
 *
 * 设计原则
 * 1. 逐步推进:每次请求只推进一步(一次基础旋转 / 一次免费旋转 / 一次重转 / 一个无随机的过场步)。
 * 2. 引擎是纯函数:step(state, req) → 新 state,不修改入参,不持有任何局内状态。
 *    RNG 状态也放在 state 里,所以 state 就是完整存档;同一个 state + 同一个 req 一定得到同一个结果。
 * 3. 金额全部是整数(最小货币单位)。grid[reel][row],reel 0..4 = 轴1..5,row 0..2 = 上/中/下。
 * 4. 钱的流向由界面层负责:start 时扣 charge,round 结束(settlement 非空)时一次性入账 totalWin。
 * 5. 数学与表现分离:引擎只出结果;表现层只播放,不重算。
 */

export const PROTOCOL_VERSION = 2;

export type GameId = 'A' | 'B';
export type SpinMode = 'normal' | 'buy';
export type JackpotTier = 'Mini' | 'Minor' | 'Major' | 'Grand';

// ───────────────────────── 图案 ─────────────────────────
export type SymbolIdA = 'H1' | 'H2' | 'H3' | 'H4' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'W' | 'S';
export type SymbolIdB = 'H1' | 'H2' | 'H3' | 'L1' | 'L2' | 'L3' | 'L4' | 'C';
export type SymbolId = SymbolIdA | SymbolIdB;
export type Grid<T = SymbolId> = T[][]; // [5][3]
export interface Pos { reel: number; row: number }

// ───────────────────────── 请求 ─────────────────────────
/** 开一局。仅当 state.round === null 时合法。bet 必须在 config.betLevels 内;buy 仅当 config.buy.enabled。 */
export interface StartRequest { type: 'start'; game: GameId; bet: number; mode: SpinMode }
/** 推进当前局的下一步(state.round.next 指明会发生什么)。仅当 state.round !== null 时合法。 */
export interface ContinueRequest { type: 'continue' }
export type SpinRequest = StartRequest | ContinueRequest;

// ───────────────────────── 赢线 / 币 ─────────────────────────
export interface LineWin {
  line: number;          // 1-based,对应规则文档赔付线编号
  symbol: SymbolId;      // 连线图案 X
  count: 3 | 4 | 5;
  positions: Pos[];      // 参与连线的格子
  payMult: number;       // 赔付表倍数(线投注倍数)
  win: number;           // 本线原始赢额 = payMult * lineBet(未乘 FS 倍数)
}
export interface ScatterWin { count: number; positions: Pos[]; payMult: number; win: number } // 总投注倍数

export type CoinValue = { kind: 'mult'; mult: number } | { kind: 'jp'; tier: JackpotTier };
/** payMult:该币结算时的总投注倍数(倍数币 = mult,Jackpot 币 = jackpotMult[tier])。 */
export interface Coin extends Pos { value: CoinValue; payMult: number }

// ───────────────────────── 局内状态(存档的一部分) ─────────────────────────
/** 下一步将发生什么。界面据此决定下一次 continue 前要显示的过场。 */
export type PhaseA = 'A_fs_enter' | 'A_fs_spin';
export type PhaseB = 'B_hs_enter' | 'B_hs_respin' | 'B_hs_settle';
export type Phase = PhaseA | PhaseB;

interface RoundBase {
  roundId: string;          // `${roundSeq}`,由引擎在 start 时分配,单调递增
  mode: SpinMode;
  bet: number;
  cost: number;             // normal = bet;buy = priceMult * bet
  maxWin: number;           // = config.maxWinMult * bet
  cumulativeWin: number;    // 已发生的累计赢额(未入账,局终才入账)
  baseWin: number;
  featureWin: number;
  stepCount: number;        // 已产生的步数 = 下一步的 index
  next: Phase;              // 下一步类型
}
export interface RoundStateA extends RoundBase {
  game: 'A';
  fs: {
    source: 'scatter' | 'buy';
    awarded: number;        // 本局累计赠送次数(≤ 60)
    remaining: number;      // 尚未进行的次数
    played: number;         // 已进行次数
    ladderIndex: number;    // 当前阶梯下标 c(0..3)→ mult_x1/x2/x3/x5
  };
}
export interface RoundStateB extends RoundBase {
  game: 'B';
  hs: {
    source: 'trigger' | 'buy';
    locked: Coin[];         // 已锁定的币(按 reel,row 升序)
    R: number;              // 剩余重转次数
    respinCount: number;    // 已进行的重转次数
  };
}
export type RoundState = RoundStateA | RoundStateB;

/**
 * 引擎存档。round === null 表示空闲(可以 start)。
 * 界面把它原样 JSON 序列化即可(全部是 JSON 安全类型)。
 */
export interface EngineState {
  v: typeof PROTOCOL_VERSION;
  game: GameId;
  rng: string;              // Rng.getState() 的 32 位十六进制串
  roundSeq: number;         // 已开过的局数
  round: RoundState | null;
}

// ───────────────────────── Step(判别联合,字段 kind) ─────────────────────────
export interface StepBase {
  index: number;            // 0-based,整局内序号
  win: number;              // 本步入账(已含倍数、已含上限截断)
  cumulativeWin: number;    // 本步之后的整局累计赢额
  capped: boolean;          // 本步结算后触达最高赢取上限(此时 roundEnded 必为 true)
  roundEnded: boolean;      // 本步是整局最后一步;等价于 next === null
  next: Phase | null;       // 下一步类型;null = 整局结束
}

// ===== 玩法 A =====
export interface BaseSpinStepA extends StepBase {
  kind: 'A_base_spin';
  stops: number[];                 // 5 个轴停止位置(可见 3 行 = stop, stop+1, stop+2 循环)
  grid: Grid<SymbolIdA>;
  lineWins: LineWin[];
  lineTotal: number;
  scatter: ScatterWin | null;
  trigger: { freeSpins: number } | null;   // 触发赠送次数 8/12/20;next = 'A_fs_enter'(若未触顶)
}
/** 过场步,不消耗随机数。normal 触发或 buy 开局后都先出这一步。 */
export interface FsEnterStepA extends StepBase {
  kind: 'A_fs_enter';
  source: 'scatter' | 'buy';
  awarded: number;                 // 本次赠送次数
}
export interface FsSpinStepA extends StepBase {
  kind: 'A_fs_spin';
  fsIndex: number;                 // 第几次 Free Spin,1-based
  remainingBefore: number;         // 本次开始前剩余(含本次)
  remainingAfter: number;          // 本次结算后剩余(含重触发追加)
  ladderIndex: number;             // 本次使用的阶梯下标 c(0..3)
  multiplier: number;              // M[c]
  ladderAfter: number;             // 本次结算后的阶梯下标
  stops: number[];
  grid: Grid<SymbolIdA>;
  lineWins: LineWin[];             // win 为未乘倍数的原始赢额
  lineTotalRaw: number;            // L
  lineTotalMultiplied: number;     // L * m
  scatter: ScatterWin | null;      // 不乘倍数
  retrigger: { scatterCount: number; requested: number; added: number; totalAwarded: number } | null; // added<requested = 被 60 次上限截断
}

// ===== 玩法 B =====
export interface BaseSpinStepB extends StepBase {
  kind: 'B_base_spin';
  stops: number[];
  grid: Grid<SymbolIdB>;           // C 格为 'C',币值见 coins
  coins: Coin[];                   // 本次可见的 C 及其币值(按 reel,row 升序)
  lineWins: LineWin[];
  lineTotal: number;
  trigger: { startCoins: number } | null;  // C >= 6 触发;next = 'B_hs_enter'(若未触顶)
}
/** 过场步,不消耗随机数(normal 触发时);buy 开局时它是第一步,币的生成发生在这一步。 */
export interface HsEnterStep extends StepBase {
  kind: 'B_hs_enter';
  source: 'trigger' | 'buy';
  locked: Coin[];                  // 起始锁定
  K: number; R: number;            // K=起始数量,R=3;K==15 时 next = 'B_hs_settle'
}
export interface HsRespinStep extends StepBase {
  kind: 'B_hs_respin';
  respinIndex: number;             // 1-based
  newCoins: Coin[];                // 本次新落下并锁定的 C(空数组 = 无新 C)
  locked: Coin[];                  // 本次之后的全部锁定 C(含新)
  K: number; R: number;            // 本次停轴后的计数
  ended: boolean;                  // true:R==0 或 15 格满,next = 'B_hs_settle'
}
export interface HsSettleStep extends StepBase {
  kind: 'B_hs_settle';
  payouts: { pos: Pos; payMult: number; win: number; jackpot?: JackpotTier }[]; // 按轴1→5、每轴上→下,供币值飞入动画
  fullScreenBonus: { payMult: number; win: number } | null;   // 满屏 Grand 奖励
  rawTotal: number;                // 截断前 H&S 部分总额
}

export type Step =
  | BaseSpinStepA | FsEnterStepA | FsSpinStepA
  | BaseSpinStepB | HsEnterStep | HsRespinStep | HsSettleStep;
export type StepKind = Step['kind'];

// ───────────────────────── 结果 ─────────────────────────
/** 整局汇总,仅在 roundEnded 那一步随 SpinResult 返回。界面此时入账 totalWin。 */
export interface RoundSettlement {
  roundId: string;
  game: GameId;
  mode: SpinMode;
  bet: number;
  cost: number;
  totalWin: number;                // 整局入账总额(已截断)
  capped: boolean;
  baseWin: number;
  featureWin: number;
  steps: number;
  featureTriggered: boolean;
  fsSpinsPlayed?: number;          // A
  fsSpinsAwardedTotal?: number;    // A
  hsFinalK?: number;               // B
  hsRespins?: number;              // B
}

/** 每次请求的返回 = 一步。 */
export interface SpinResult {
  step: Step;
  state: EngineState;              // 本步之后的完整存档(界面须在播放前先持久化它)
  charge: number;                  // 本步需从余额扣除的金额:start 时 = cost,其余为 0
  settlement: RoundSettlement | null; // 仅整局最后一步非空
  rng: { before: string; after: string }; // 审计/复现:把 state.rng 设为 before 重放同一请求可得同一步
}

// ───────────────────────── 引擎接口 ─────────────────────────
export type EngineErrorCode =
  | 'WRONG_GAME' | 'INVALID_BET' | 'BUY_DISABLED' | 'INVALID_MODE'
  | 'ROUND_IN_PROGRESS'   // 局中收到 start
  | 'NO_ACTIVE_ROUND'     // 空闲时收到 continue
  | 'BAD_STATE';          // 存档版本/结构不合法
export class EngineError extends Error {
  constructor(public code: EngineErrorCode, message?: string) { super(message ?? code); this.name = 'EngineError'; }
}

export interface Engine {
  readonly game: GameId;
  readonly config: unknown;
  /** 新存档:空闲、roundSeq=0、RNG 由 seed 初始化。 */
  createState(seed: string | number): EngineState;
  /** 纯函数:不修改 state;同样的 (state, req) 恒得同样的结果。非法请求抛 EngineError。 */
  step(state: EngineState, req: SpinRequest): SpinResult;
}
// createEngine(config: GameAConfig | GameBConfig): Engine   —— 注意:不再传 seed,seed 走 createState
