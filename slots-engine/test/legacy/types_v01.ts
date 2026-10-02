/**
 * slots-engine 接口草案 v0.1(数学/数值 起草,待技术负责人确认)
 * 原则:引擎纯函数式、与界面无关、结果可复现;金额一律为整数(最小货币单位)。
 * 约定:grid[reel][row],reel 0..4 = 轴1..5,row 0..2 = 上/中/下行。
 * 一次 play() 返回「整局」(Round):基础旋转 + 其触发的全部特色步骤。UI 按 steps 顺序播放。
 * 断线恢复:UI 只需持久化 {SpinResult, stepIndex};引擎无需持有局内状态。
 */

export type GameId = 'A' | 'B';
export type SpinMode = 'normal' | 'buy';

// ---------- 请求 ----------
export interface SpinRequest {
  game: GameId;
  bet: number;        // 总投注,必须在 config.betLevels 内(A 能被 20 整除,B 能被 10 整除)
  mode: SpinMode;     // 'buy' 仅当 config.buy.enabled 为 true
}

// ---------- 图案 ----------
export type SymbolIdA = 'H1' | 'H2' | 'H3' | 'H4' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'W' | 'S';
export type SymbolIdB = 'H1' | 'H2' | 'H3' | 'L1' | 'L2' | 'L3' | 'L4' | 'C';
export type SymbolId = SymbolIdA | SymbolIdB;
export type Grid<T = SymbolId> = T[][]; // [5][3]

export interface Pos { reel: number; row: number }

// ---------- 赢线 ----------
export interface LineWin {
  line: number;          // 1-based,对应规则文档赔付线编号
  symbol: SymbolId;      // 连线图案 X
  count: 3 | 4 | 5;
  positions: Pos[];      // 参与连线的格子
  payMult: number;       // 赔付表倍数(线投注倍数)
  win: number;           // 本线原始赢额 = payMult * lineBet(未乘 FS 倍数)
}
export interface ScatterWin { count: number; positions: Pos[]; payMult: number; win: number } // 总投注倍数

// ---------- Step(判别联合,字段 kind) ----------
interface StepBase {
  index: number;          // 0-based,整局内序号
  win: number;            // 本步入账(已含倍数、已含上限截断)
  cumulativeWin: number;  // 本步之后的整局累计赢额
  capped: boolean;        // 本步结算后是否触达最高赢取上限(true 后整局立即结束)
}

// ===== 玩法 A =====
export interface BaseSpinStepA extends StepBase {
  kind: 'A_base_spin';
  stops: number[];                 // 5 个轴停止位置(轴带索引,可见 3 行 = stop, stop+1, stop+2 循环)
  grid: Grid<SymbolIdA>;
  lineWins: LineWin[];
  lineTotal: number;
  scatter: ScatterWin | null;
  trigger: { freeSpins: number } | null;      // 触发赠送次数 8/12/20
}
export interface FsSpinStepA extends StepBase {
  kind: 'A_fs_spin';
  fsIndex: number;                 // 第几次 Free Spin,1-based
  remainingBefore: number;         // 本次开始前剩余(含本次)
  remainingAfter: number;          // 本次结算后剩余(含重触发追加)
  ladderIndex: number;             // 本次使用的阶梯下标 c(0..3) -> mult_x1/x2/x3/x5
  multiplier: number;              // M[c]
  ladderAfter: number;             // 本次结算后的阶梯下标
  stops: number[];
  grid: Grid<SymbolIdA>;
  lineWins: LineWin[];             // win 为未乘倍数的原始赢额
  lineTotalRaw: number;            // L
  lineTotalMultiplied: number;     // L * m
  scatter: ScatterWin | null;      // 不乘倍数
  retrigger: { scatterCount: number; requested: number; added: number; totalAwarded: number } | null; // added<requested 表示被 60 次上限截断
}

// ===== 玩法 B =====
export type CoinValue =
  | { kind: 'mult'; mult: number }                         // 总投注整数倍
  | { kind: 'jp'; tier: 'Mini' | 'Minor' | 'Major' | 'Grand' };
export interface Coin extends Pos { value: CoinValue; payMult: number } // payMult:该币结算时的总投注倍数
export interface BaseSpinStepB extends StepBase {
  kind: 'B_base_spin';
  stops: number[];
  grid: Grid<SymbolIdB>;           // C 格为 'C',币值见 coins
  coins: Coin[];                   // 本次可见的 C 及其币值(按 reel,row 升序)
  lineWins: LineWin[];
  lineTotal: number;
  trigger: { startCoins: number } | null;      // C >= 6 触发
}
export interface HsEnterStep extends StepBase {
  kind: 'B_hs_enter';
  locked: Coin[];                  // 起始锁定(购买时为 6 个随机位置)
  K: number; R: number;            // K=起始数量,R=3
}
export interface HsRespinStep extends StepBase {
  kind: 'B_hs_respin';
  respinIndex: number;             // 1-based
  newCoins: Coin[];                // 本次新落下并锁定的 C(空数组表示无新 C)
  locked: Coin[];                  // 本次之后的全部锁定 C(含新)
  K: number; R: number;            // 本次停轴后的计数
  ended: boolean;                  // true:R==0 或 15 格满,下一步为结算
}
export interface HsSettleStep extends StepBase {
  kind: 'B_hs_settle';
  payouts: { pos: Pos; payMult: number; win: number; jackpot?: 'Mini' | 'Minor' | 'Major' | 'Grand' }[]; // 按轴1→5、每轴上→下,供币值飞入动画
  fullScreenBonus: { payMult: number; win: number } | null;   // 满屏 Grand 奖励
  rawTotal: number;                // 截断前总额(H&S 部分)
}

export type Step = BaseSpinStepA | FsSpinStepA | BaseSpinStepB | HsEnterStep | HsRespinStep | HsSettleStep;

// ---------- 结果 ----------
export interface SpinResult {
  game: GameId;
  mode: SpinMode;
  bet: number;
  cost: number;                    // 本局扣费:normal = bet;buy = 购买价格
  steps: Step[];
  totalWin: number;                // 整局入账总额(已截断)
  capped: boolean;                 // 是否触达最高赢取上限
  maxWin: number;                  // 上限金额 = maxWinMult * bet
  summary: {
    baseWin: number;               // 基础旋转赢额(购买局为 0)
    featureWin: number;            // 特色玩法赢额
    featureTriggered: boolean;
    fsSpinsPlayed?: number;        // A
    fsSpinsAwardedTotal?: number;  // A
    hsFinalK?: number;             // B
    hsRespins?: number;            // B
  };
  rng: { seed: string; stateBefore: string; stateAfter: string }; // 可复现:setState(stateBefore) 后重放得到相同结果
}

// ---------- 引擎 ----------
export interface Engine {
  play(req: SpinRequest): SpinResult;
  getRngState(): string;
  setRngState(s: string): void;
  readonly config: unknown;
}
export interface EngineOptions { seed: string | number }
// createEngine(config: GameAConfig | GameBConfig, opts: EngineOptions): Engine

