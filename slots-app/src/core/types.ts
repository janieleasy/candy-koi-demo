/**
 * 界面侧共用类型。协议类型来自引擎(= slots-spec/protocol.ts 的拷贝),
 * 模块契约类型来自 slots-spec/client.ts(仅 type import,构建时擦除)。
 */
import type {
  EngineEx, EngineState, GameId, SpinResult, Step, StepKind, RoundSettlement, GameAConfig, GameBConfig,
} from '@engine/index';
import type {
  EventBus, EventMap, EventName, GameViewConfig, PresentContext,
} from '@spec/client';
import type { Stage } from '../render/Stage';
import type { UiApi } from '../ui/UiApi';
import type { AppViewConfig } from '../games/viewTypes';

export type {
  EngineEx, EngineState, GameId, SpinResult, Step, StepKind, RoundSettlement, GameAConfig, GameBConfig,
  EventBus, EventMap, EventName, GameViewConfig, PresentContext,
};
export type MathConfig = GameAConfig | GameBConfig;

/** 带 onAny 的总线(测试/调试/音频用)。 */
export interface AppBus extends EventBus {
  onAny(fn: (name: EventName, payload: unknown) => void): () => void;
}

/**
 * 判定器适配器。
 * 说明:spec 里 GameEvaluator(start/advance + createEngine(cfg, evaluator))在当前引擎实现中并未导出,
 * 引擎是 createEngine(config) 直接返回 Engine。因此 GameModule.evaluator 在本工程中是对 EngineEx 的薄包装,
 * 见 README“待确认问题”。
 */
export interface GameEvaluatorAdapter<C extends MathConfig = MathConfig> {
  readonly id: GameId;
  readonly engine: EngineEx;
  validateConfig(cfg: C): void;
}

/** 表现层上下文:在 spec 的 PresentContext 上扩展舞台与 UI 句柄。 */
export interface AppPresentContext extends PresentContext {
  stage: Stage;
  ui: UiApi;
  view: AppViewConfig;
  cfg: MathConfig;
  /** 当前整局的下注(从 getState().round 取不到时兜底,如已结束) */
  bet: number;
}
export interface SpinPlan {
  /** 停轴后的盘面 [reel][row];null = 空格 */
  grid: import('../render/SymbolView').CellSpec[][];
  /** 只转这些轴(H&S 重转),缺省全转 */
  spinReels?: boolean[];
  /** 转动填充物用半透明基础币(H&S) */
  ghost?: boolean;
}
export type Presenter<S extends Step = Step> = (step: S, ctx: AppPresentContext) => Promise<void>;

export interface AppGameModule<C extends MathConfig = MathConfig> {
  id: GameId;
  mathConfig: C;
  evaluator: GameEvaluatorAdapter<C>;
  view: AppViewConfig;
  /** 该步是否有转轴旋转,以及停轴后的盘面;返回 null = 无转轴的过场步。 */
  spinPlan(step: Step, ctx: AppPresentContext): SpinPlan | null;
  /** 停轴预告:返回每根轴额外延迟(ms);A 的糖果门预告钩子。 */
  anticipation?(step: Step): number[] | null;
  /** 每步“转轴停稳之后”的表现(必填:无则只做默认赢线展示)。 */
  presenters: Partial<Record<StepKind, Presenter>>;
  /** 每步开始(收到结果、转轴开始转之前)的同步钩子,如更新 FS 剩余次数。 */
  begin?: Partial<Record<StepKind, (step: Step, ctx: AppPresentContext) => void>>;
  /** 从存档恢复(刷新/切回)时重建玩法专属画面。 */
  restore(state: EngineState, ctx: AppPresentContext): Promise<void> | void;
  /** 整局结束/切走时清理玩法专属画面。 */
  reset(ctx: AppPresentContext): void;
}
