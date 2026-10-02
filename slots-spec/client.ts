/**
 * slots 客户端契约 v2(技术负责人):玩法模块、判定器、展示配置、事件总线、大奖演出插件。
 * 与 protocol.ts 配套:protocol.ts 是「引擎 ↔ 界面」的数据协议;本文件是「界面内部」的模块契约。
 */
import type {
  EngineState, GameId, RoundState, SpinRequest, Step, StepKind, RoundSettlement, JackpotTier,
} from './protocol';

// ───────────────────────── 1. 判定器(新增玩法的唯一代码入口) ─────────────────────────
/** 判定器每次只产出一步,不碰存档、不碰余额。随机数一律从 ctx.rng 取。 */
export interface Rng { int(n: number): number; float(): number }
export interface EvalContext<C> { cfg: C; rng: Rng; round: RoundState | null }
export interface StepOutcome {
  step: Step;
  round: RoundState | null;       // 步后的局内状态;null = 整局结束
}
export interface GameEvaluator<C = unknown> {
  readonly id: GameId;
  /** 启动时校验配置(轴带、赔付表、约束),不合法直接抛错。 */
  validateConfig(cfg: C): void;
  /** 处理 start:normal → 基础旋转;buy → 进入特色玩法的 enter 步。 */
  start(ctx: EvalContext<C>, req: Extract<SpinRequest, { type: 'start' }>): StepOutcome;
  /** 处理 continue:按 ctx.round.next 推进一步。 */
  advance(ctx: EvalContext<C>): StepOutcome;
}
/**
 * 通用引擎外壳 createEngine(cfg, evaluator) 负责:校验请求合法性、取/存 RNG 状态、分配 roundId、
 * 计算 charge 与 settlement、组装 SpinResult。判定器只关心「这一步发生什么」。
 */

// ───────────────────────── 2. 展示配置(与数学配置分开) ─────────────────────────
export interface SymbolView {
  frame: string;                  // symbols-sheet.json 里的帧名,如 'H1_koi'
  winScale?: number;              // 中奖放大,默认 1.12
}
export interface BigWinTier { minMult: number; showcase: string }  // 赢额 ≥ minMult × bet 时用哪个演出插件
export interface GameViewConfig {
  id: GameId;
  title: string;
  background: { base: string; feature: string };      // ui-manifest 的键:background-base / -fs / -hs
  symbols: Record<string, SymbolView>;                // 键 = SymbolId;币面变体由 coinFrames 决定
  coinFrames?: { base: string; multLow: string; multMid: string; multHigh: string; jp: Record<JackpotTier, string> };
  reel: {
    cols: 5; rows: 3;
    cell: { w: 190; h: 190; gapX: 14; gapY: 25 };     // 与 UI 规范一致
    symbolSize: 165;
    spinSpeed: number;                                // 逻辑像素/秒
    stopStaggerMs: number;                            // 相邻轴停止间隔
    easing: 'backOut' | 'cubicOut' | string;
    turboFactor: number;                              // Turbo 时时间乘数(<1)
    anticipation?: { symbol: string; minCount: number }; // 例如 A:S 预告
  };
  bigWin: BigWinTier[];                               // 例:[{minMult:20,showcase:'default-big'},{minMult:50,showcase:'default-mega'},...]
  audio?: Record<string, string>;
}

// ───────────────────────── 3. 事件总线 ─────────────────────────
/** 事件名与载荷。表现层、UI 外壳、音频互相只通过它们通信。 */
export interface EventMap {
  'engine:ready': { game: GameId };
  'round:start': { roundId: string; bet: number; mode: 'normal' | 'buy'; charge: number };
  'spin:begin': { stepIndex: number };                  // 开始转(收到结果后才开始减速)
  'reel:stop': { reel: number; stepIndex: number };     // 每轴停轴(含预告延迟)
  'spin:end': { stepIndex: number };                    // 5 轴全部停下
  'step:begin': { step: Step };                         // 开始播放某一步的结果
  'step:end': { step: Step };
  'win:line': { step: Step; line: number };             // 逐线高亮
  'win:present': { amount: number; cumulative: number };
  'balance:change': { balance: number; delta: number; reason: 'charge' | 'win' | 'reset' };
  'feature:enter': { kind: 'free_spins' | 'hold_and_spin'; awarded?: number; startCoins?: number };
  'feature:progress': { kind: 'free_spins' | 'hold_and_spin'; remaining?: number; ladder?: number; K?: number; R?: number };
  'feature:exit': { kind: 'free_spins' | 'hold_and_spin'; total: number };
  'coin:lock': { reel: number; row: number; payMult: number; jackpot?: JackpotTier };
  'coin:fly': { reel: number; row: number; payMult: number };
  'bigwin:start': { tier: string; amount: number; showcase: string };
  'bigwin:end': { tier: string };
  'cap:reached': { maxWin: number };
  'round:end': { settlement: RoundSettlement };
  'ui:autoplay': { on: boolean; remaining: number | null };
  'ui:turbo': { on: boolean };
  'ui:skip': {};                                        // 跳过动画(不改结果)
  'error': { code: string; message: string };
}
export type EventName = keyof EventMap;
export interface EventBus {
  on<K extends EventName>(name: K, fn: (p: EventMap[K]) => void): () => void;
  emit<K extends EventName>(name: K, payload: EventMap[K]): void;
}

// ───────────────────────── 4. 大奖演出插件(three.js / shader 接入位) ─────────────────────────
export interface ShowcaseContext {
  tier: string;                 // 'big' | 'mega' | 'epic' | 'max' 等,由 GameViewConfig.bigWin 决定
  amount: number;               // 本局总赢额
  bet: number;
  multiple: number;             // amount / bet
  canvas: HTMLCanvasElement;    // 由壳子提供的叠加层 canvas(插件在上面建 three.js/WebGL 上下文)
  width: number; height: number; dpr: number;
  durationMs: number;           // 建议时长;可被 skip 提前结束
  skip: AbortSignal;            // 玩家点击跳过时 abort,插件应尽快收尾并 resolve
  onAmount(cb: (shown: number) => void): void;   // 插件把正在滚动的数字回报给壳子(壳子更新 DOM 数字),可选
}
export interface ShowcasePlugin {
  readonly id: string;
  /** 按需懒加载 three.js、着色器、纹理等;只在首次需要时调用一次。 */
  load(): Promise<void>;
  /** 播放演出;resolve 后壳子才继续主流程。必须尊重 ctx.skip。 */
  play(ctx: ShowcaseContext): Promise<void>;
  /** 释放 GPU 资源,播完或切换玩法时调用。 */
  dispose(): void;
}
export type ShowcaseLoader = () => Promise<{ default: ShowcasePlugin }>;
/** 注册表:showcase/index.ts 导出 { 'default-big': () => import('./default-big'), 'my-shader': () => import('./my-shader') } */
export type ShowcaseRegistry = Record<string, ShowcaseLoader>;

// ───────────────────────── 5. 玩法模块(注册单位) ─────────────────────────
/** games/<id>/index.ts 默认导出这个对象;registry 只负责收集。新增玩法 = 新增一个这样的目录。 */
export interface GameModule<C = unknown> {
  id: GameId;
  mathConfig: C;                  // 数学配置(轴带、赔付表、特色参数),来自 slots-engine/config
  evaluator: GameEvaluator<C>;    // 判定器
  view: GameViewConfig;           // 展示配置
  /** 玩法专属的表现钩子(可选),只接受 Step,不得访问引擎。例如 B 的币值飞入、A 的阶梯徽章。 */
  presenters?: Partial<Record<StepKind, (step: Step, ctx: PresentContext) => Promise<void>>>;
}
export interface PresentContext {
  bus: EventBus;
  skip: AbortSignal;
  turbo: boolean;
  getState(): EngineState;
}
