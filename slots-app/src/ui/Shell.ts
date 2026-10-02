/**
 * Shell:装配与流程编排。
 *   - 两个玩法各一个 Controller(各自 EngineState、各自存档键 slots:v2:<game>),共用一个钱包与一个舞台。
 *   - 界面状态机 Idle → Spinning → Presenting(step) → … → Settling → Idle。
 *   - 大赢演出:Presenting 结束后按 view.bigWin[].minMult 懒加载 showcase 插件并 play(尊重 skip)。
 */
import type { GameId, RoundSettlement, SpinResult, Step } from '@engine/index';
import { EngineError } from '@engine/index';
import type { AppBus, AppGameModule, AppPresentContext } from '../core/types';
import { createFsm, type UiFsm } from '../core/fsm';
import { Wallet, saveSettings, type KeyValueStore, type Settings } from '../core/storage';
import { AudioManager } from '../core/audio';
import { t } from '../core/i18n';
import { AutoPlay, type AutoChoice, type AutoStopReason } from '../core/autoplay';
import { DesignPanel } from './DesignPanel';
import { fmt, sleep } from '../core/utils';
import { Controller, InsufficientFunds } from '../engine-bridge/Controller';
import { getGame, allGames } from '../registry';
import type { Stage } from '../render/Stage';
import type { TextureStore } from '../render/textures';
import { H, W } from '../render/layout';
import { Hud, type HudModel } from './Hud';
import { Popups } from './Popups';
import { BannerLayer } from './Banner';
import { loadShowcase } from '../showcase';
import { numberAt, showcaseDurationMs } from '../showcase/timeline';
import { prefersReducedMotion } from '../showcase/quality';
import type { ShowcaseContext } from '@spec/client';
import { el } from './dom';

const BASE_KINDS = new Set(['A_base_spin', 'B_base_spin']);

export interface ShellDeps {
  bus: AppBus;
  store: KeyValueStore;
  wallet: Wallet;
  settings: Settings;
  controllers: Record<GameId, Controller>;
  textures: TextureStore;
  stage: Stage;
  uiHost: HTMLElement;
  stageHost: HTMLElement;
  startGame: GameId;
}

export class Shell {
  readonly bus: AppBus;
  readonly fsm: UiFsm = createFsm();
  readonly audio = new AudioManager();
  readonly hud: Hud;
  readonly popups: Popups;
  readonly banners: BannerLayer;
  readonly designPanel: DesignPanel;
  private game: GameId;
  private busy = false;
  private skipAc: AbortController | null = null;
  private readonly auto: AutoPlay;
  private get autoOn() { return this.auto.on; }
  private currentKind: string | null = null;
  private lastBaseStep: Step | null = null;
  private showcaseEl: HTMLElement;
  private showcaseAc: AbortController | null = null;
  private switching = false;
  private d: ShellDeps;

  constructor(d: ShellDeps) {
    this.d = d; this.bus = d.bus; this.game = d.startGame;
    this.auto = new AutoPlay(p => d.bus.emit('ui:autoplay', p));
    d.stage.app.canvas.addEventListener('pointerdown', () => this.skip());
    this.hud = new Hud(d.uiHost, d.textures, {
      onSpin: () => this.onSpin(), onBetDelta: dlt => this.changeBet(dlt), onMax: () => this.setBetIndex(this.module.mathConfig.betLevels.length - 1),
      onAuto: () => this.toggleAuto(), onTurbo: () => this.toggleTurbo(), onSound: () => this.toggleSound(),
      onInfo: () => this.openInfo(), onMenu: () => this.openMenu(), onBuy: () => void this.onBuy(), onTab: g => void this.switchGame(g),
    });
    this.banners = new BannerLayer(d.uiHost);
    this.popups = new Popups(d.uiHost, d.textures);
    this.designPanel = new DesignPanel({ parent: d.uiHost, url: k => d.textures.url(k), store: d.store, getGame: () => this.game });
    this.showcaseEl = el('div', '', d.uiHost); this.showcaseEl.id = 'showcase';
    this.showcaseEl.addEventListener('pointerdown', () => this.showcaseAc?.abort());

    this.audio.setMuted(!d.settings.sound);
    this.audio.attach(d.bus);
    this.fsm.onChange(() => this.refresh());
    for (const n of ['balance:change', 'round:start', 'round:end', 'ui:autoplay', 'ui:turbo'] as const) d.bus.on(n, () => this.refresh());
    for (const g of ['A', 'B'] as GameId[]) d.controllers[g].play = (r, c) => this.playStep(g, r, c.resumed);
  }

  // ───────────── 访问器 ─────────────
  get module(): AppGameModule { return getGame(this.game); }
  get ctrl(): Controller { return this.d.controllers[this.game]; }
  get gameId(): GameId { return this.game; }
  get isBusy() { return this.busy; }
  get bet(): number {
    const levels = this.module.mathConfig.betLevels;
    const b = this.d.settings.bet[this.game];
    return b !== undefined && levels.includes(b) ? b : levels[Math.min(2, levels.length - 1)];
  }
  private get betIndex() { return this.module.mathConfig.betLevels.indexOf(this.bet); }
  private get wallet(): Wallet { return this.d.wallet; }
  private get inFeatureStep() { return this.busy && this.currentKind !== null && !BASE_KINDS.has(this.currentKind); }

  private presentCtx(signal: AbortSignal): AppPresentContext {
    const c = this.ctrl;
    return {
      bus: this.bus, skip: signal, turbo: this.d.settings.turbo, getState: () => c.state,
      stage: this.d.stage, ui: this.banners, view: this.module.view, cfg: this.module.mathConfig, bet: c.state.round?.bet ?? this.bet,
    };
  }

  // ───────────── 激活玩法 / 启动 ─────────────
  /** 切到某玩法的视图(重配舞台,按其存档恢复画面);若存档局中,自动继续。 */
  async activate(game: GameId, boot = false): Promise<void> {
    this.game = game;
    this.d.settings.game = game; saveSettings(this.d.store, this.d.settings);
    const m = this.module;
    this.d.stage.configure(game, m.view, m.mathConfig, this.bet); // 含 logo 按玩法切换(D-03)
    this.d.stage.setBet(this.bet);
    this.d.stage.setHint(game === 'A' ? t('hint.A') : t('hint.B'));
    this.audio.setSources(m.view.audio);
    const pc = this.presentCtx(new AbortController().signal);
    await m.restore(this.ctrl.state, pc);
    this.refresh();
    if (this.ctrl.inRound) {
      this.banners.toast(t('toast.resumed'), 2400);
      void boot;
      void this.runRound(() => this.ctrl.resumeRound(r => this.between(r)));
    }
  }

  // ───────────── 事件处理 ─────────────
  private skip() { if (this.busy) this.skipAc?.abort(); }

  private onSpin() {
    if (this.popups.isOpen) return;
    if (this.busy) { if (!this.inFeatureStep && (this.fsm.state === 'Spinning' || this.fsm.state === 'Presenting')) this.skip(); return; }
    this.startRound('normal');
  }

  private canAfford(cost: number) { return this.wallet.balance >= cost; }

  private startRound(mode: 'normal' | 'buy') {
    const bet = this.bet; const c = this.ctrl;
    const cost = mode === 'buy' ? c.buyCost(bet) : bet;
    if (this.busy || c.inRound) return;
    if (!this.canAfford(cost)) { this.banners.toast(t('hint.noMoney')); this.stopAuto('funds'); return; }
    void this.runRound(() => c.playRound(bet, mode, r => this.between(r)));
  }

  private between(_last: SpinResult): boolean { return true; }

  private async onBuy() {
    if (this.busy || !this.ctrl.buyEnabled || this.popups.isOpen) return;
    const cfg = this.module.mathConfig; const bet = this.bet; const cost = this.ctrl.buyCost(bet);
    const n = cfg.game === 'A' ? cfg.buy.initialSpins : (cfg.buy as { startCoins: number }).startCoins;
    const ok = await this.popups.confirmBuy({
      game: this.game, mult: cfg.buy.priceMult, bet, cost, balance: this.wallet.balance,
      detail: t(this.game === 'A' ? 'buy.A.desc' : 'buy.B.desc', { n }), disclaimer: cfg.buy.disclaimer,
    });
    if (ok) this.startRound('buy');
  }

  private changeBet(dlt: -1 | 1) { if (!this.busy) this.setBetIndex(this.betIndex + dlt); }
  private setBetIndex(i: number) {
    if (this.busy || this.ctrl.inRound) return;
    this.stopAuto('bet'); // D-06:AUTO 两局间调整投注 → 停止 AUTO
    const levels = this.module.mathConfig.betLevels;
    const k = Math.max(0, Math.min(levels.length - 1, i));
    this.d.settings.bet[this.game] = levels[k]; saveSettings(this.d.store, this.d.settings);
    this.d.stage.setBet(levels[k]);
    this.refresh();
  }

  /** AUTO:关闭时点击 → 弹次数菜单,选后开始;进行中点击 → 停止。 */
  private async toggleAuto() {
    if (this.autoOn) { this.stopAuto('manual'); return; }
    if (this.popups.isOpen || this.busy || !this.isIdle()) return;
    const choice = await this.popups.autoMenu();
    if (choice === null) return;
    this.startAuto(choice);
  }
  /** 直接以指定次数开始 AUTO(菜单选择后调用;测试也可直调)。 */
  startAuto(choice: AutoChoice): boolean {
    if (this.autoOn || this.busy || !this.isIdle()) return false;
    if (!this.canAfford(this.bet)) { this.banners.toast(t('hint.noMoney')); return false; }
    this.auto.start(choice);
    this.startRound('normal');
    return true;
  }
  private stopAuto(reason: AutoStopReason = 'manual') { this.auto.stop(reason); }
  private toggleTurbo() {
    this.d.settings.turbo = !this.d.settings.turbo; saveSettings(this.d.store, this.d.settings);
    this.bus.emit('ui:turbo', { on: this.d.settings.turbo }); this.refresh();
  }
  private toggleSound() {
    const on = this.audio.isMuted; // 当前静音 → 开启
    this.audio.setMuted(!on);
    this.d.settings.sound = on; saveSettings(this.d.store, this.d.settings);
    this.banners.toast(on ? t('toast.sound.on') : t('toast.sound.off'), 1200);
    this.refresh();
  }
  private openInfo() {
    if (this.popups.isOpen) return;
    const m = this.module;
    const frames: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.view.symbols)) frames[k] = v.frame;
    this.popups.info(this.game, m.mathConfig, frames, this.bet);
  }
  private openMenu() {
    if (this.popups.isOpen) return;
    this.popups.menu({
      idle: this.isIdle(), defaultBalance: this.wallet.defaultBalance, soundOn: !this.audio.isMuted,
      onReset: () => this.resetBalance(), onSound: () => this.toggleSound(),
      onDesign: () => this.openDesign(),
    });
  }
  /** 设计说明面板:纯展示,任何时候可开(不阻塞转轴/结算/AUTO;遮罩覆盖舞台所以点不到控件)。默认显示当前玩法。 */
  openDesign(): boolean {
    if (this.designPanel.isOpen) return false;
    this.designPanel.open(this.game);
    return true;
  }
  /** 重置演示币:仅空闲可用(UI 与逻辑双重保护) */
  resetBalance(): boolean {
    if (!this.isIdle()) { this.banners.toast(t('menu.reset.busy')); return false; }
    const before = this.wallet.balance;
    this.wallet.reset();
    this.bus.emit('balance:change', { balance: this.wallet.balance, delta: this.wallet.balance - before, reason: 'reset' });
    this.banners.toast(t('toast.reset', { n: fmt(this.wallet.balance) }), 1800);
    this.refresh();
    return true;
  }
  isIdle() { return !this.busy && this.fsm.state === 'Idle' && !this.ctrl.inRound; }

  /** 切 tab:局中(任一玩法有进行中的局,或界面忙)禁止并提示。 */
  async switchGame(g: GameId): Promise<boolean> {
    if (g === this.game) return true;
    if (this.busy || this.switching || this.ctrl.inRound || this.popups.isOpen) {
      this.banners.toast(t('toast.noSwitch'), 2200); return false;
    }
    this.switching = true;
    try { this.stopAuto('switch'); this.d.stage.lines.clear(); await this.activate(g); }
    finally { this.switching = false; }
    return true;
  }

  // ───────────── 一局的编排 ─────────────
  private async runRound(fn: () => Promise<RoundSettlement | null>) {
    this.busy = true; this.refresh();
    let settlement: RoundSettlement | null = null;
    try {
      settlement = await fn();
      if (settlement) await this.settle(settlement);
    } catch (e) {
      this.handleError(e);
    } finally {
      this.ctrl.commitDisplayBalance();
      this.busy = false; this.currentKind = null;
      this.fsm.forceIdle();
      this.refresh();
    }
    if (settlement && this.autoOn) {
      if (!this.auto.roundSettled()) { this.banners.toast(t('toast.autoDone')); return; } // 次数用完
      await sleep(this.d.settings.turbo ? 150 : 500);
      if (this.autoOn && this.isIdle()) {
        if (this.canAfford(this.bet)) this.startRound('normal'); else { this.stopAuto('funds'); this.banners.toast(t('hint.noMoney')); }
      }
    }
  }

  private handleError(e: unknown) {
    this.stopAuto('error');
    if (e instanceof InsufficientFunds) { this.banners.toast(t('hint.noMoney')); return; }
    const msg = e instanceof EngineError ? `${e.code}` : (e as Error)?.message ?? String(e);
    console.error('[shell] round error', e);
    this.bus.emit('error', { code: e instanceof EngineError ? e.code : 'UI_ERROR', message: msg });
    this.banners.toast(t('toast.error', { m: msg }), 3500);
    this.banners.clear();
  }

  /** Controller.play:播放一步(转轴 → 表现)。结果已先存档。 */
  private async playStep(game: GameId, r: SpinResult, _resumed: boolean): Promise<void> {
    if (game !== this.game) return; // 理论上不会发生(局中禁止切换)
    const step = r.step; const kind = step.kind; const m = this.module; const stage = this.d.stage;
    const ac = new AbortController(); this.skipAc = ac;
    const pc = this.presentCtx(ac.signal);
    this.currentKind = kind;
    stage.lines.clear();
    if (step.index === 0) { stage.winBar.amount.setValue(0); this.lastBaseStep = null; }
    m.begin?.[kind]?.(step, pc);
    const plan = m.spinPlan(step, pc);
    if (plan) {
      this.fsm.to('Spinning', kind);
      stage.reels.setGhostFiller(!!plan.ghost);
      this.bus.emit('spin:begin', { stepIndex: step.index });
      await stage.reels.spin(plan.grid, {
        turbo: this.d.settings.turbo, skip: ac.signal, spinReels: plan.spinReels,
        extraDelay: m.anticipation?.(step) ?? undefined,
        onReelStop: reel => this.bus.emit('reel:stop', { reel, stepIndex: step.index }),
      });
      this.bus.emit('spin:end', { stepIndex: step.index });
    }
    this.fsm.to('Presenting', kind);
    const p = m.presenters[kind];
    if (p) await p(step, pc);
    if (BASE_KINDS.has(kind)) this.lastBaseStep = step;
    // 触发特色玩法时自动旋转暂停(README §7)
    if (this.autoOn && (kind === 'A_fs_enter' || kind === 'B_hs_enter')) { this.stopAuto('feature'); this.banners.toast(t('toast.autoFeature'), 2200); }
    if (r.settlement) this.lastSettlementStep = step;
  }
  private lastSettlementStep: Step | null = null;

  /** 局终:大赢演出 → 入账显示 → 回 Idle(Idle 由 runRound.finally 执行) */
  private async settle(s: RoundSettlement): Promise<void> {
    this.fsm.to('Settling');
    const view = this.module.view;
    const mult = s.bet > 0 ? s.totalWin / s.bet : 0;
    const tiers = [...view.bigWin].sort((a, b) => b.minMult - a.minMult);
    const tier = tiers.find(x => mult >= x.minMult);
    if (tier) await this.playShowcase(tier.showcase, tier.tier, s);
    this.ctrl.commitDisplayBalance();
    // 基础局有线赢:空闲时循环展示
    const last = this.lastBaseStep;
    if (last && (last.kind === 'A_base_spin' || last.kind === 'B_base_spin') && s.featureTriggered === false && (last.lineWins.length > 0 || ('scatter' in last && last.scatter))) {
      void this.d.stage.lines.loop(last.lineWins, 'scatter' in last ? last.scatter : null);
    }
  }

  /**
   * 大赢演出(公开:debug 构建的 playBigWin 也走这里,但不改余额与存档)。
   * - 数字滚动由壳子驱动:计时从插件调用 onAmount 注册时开始(three 初始化/编译耗时不吃滚动时间),easeOutCubic,滚完停留 ~0.8s(见 showcase/timeline)。
   * - skip(点击):数字立刻置终值,插件播 ≤300ms 收尾后 resolve。
   * - 看门狗:插件挂死 / 未响应 skip 时强制结束,绝不卡主流程。
   */
  async playShowcase(id: string, tier: string, s: Pick<RoundSettlement, 'totalWin' | 'bet'>) {
    this.bus.emit('bigwin:start', { tier, amount: s.totalWin, showcase: id });
    const ac = new AbortController(); this.showcaseAc = ac;
    let raf = 0; let wd: ReturnType<typeof setTimeout> | undefined; let plugin: Awaited<ReturnType<typeof loadShowcase>> = null;
    try {
      plugin = await loadShowcase(id);
      if (!plugin) return;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      this.showcaseEl.replaceChildren(canvas); this.showcaseEl.classList.add('on');
      const durationMs = showcaseDurationMs(tier, this.d.settings.turbo, prefersReducedMotion());
      let cb: ((n: number) => void) | null = null;
      const ctx: ShowcaseContext = {
        tier, amount: s.totalWin, bet: s.bet, multiple: s.bet > 0 ? s.totalWin / s.bet : 0, canvas, width: W, height: H, dpr: 1, durationMs, skip: ac.signal,
        onAmount: f => {
          cb = f;
          if (ac.signal.aborted) { f(s.totalWin); return; }
          const t0 = performance.now();
          const tick = () => {
            if (ac.signal.aborted) return;
            f(numberAt(s.totalWin, performance.now() - t0, tier, durationMs));
            raf = requestAnimationFrame(tick);
          };
          tick();
        },
      };
      ac.signal.addEventListener('abort', () => { cancelAnimationFrame(raf); cb?.(s.totalWin); }, { once: true });
      // 看门狗:正常 = 时长 + 6s;skip 后 = 1.2s(收尾 ≤300ms + 余量)
      const hard = new Promise<void>(res => {
        wd = setTimeout(res, durationMs + 6000);
        ac.signal.addEventListener('abort', () => { clearTimeout(wd); wd = setTimeout(res, 1200); }, { once: true });
      });
      await Promise.race([plugin.play(ctx), hard]);
    } catch (e) {
      console.error('[showcase] failed', e);
    } finally {
      clearTimeout(wd); cancelAnimationFrame(raf);
      try { plugin?.dispose(); } catch (e) { console.error('[showcase] dispose failed', e); }
      this.showcaseEl.classList.remove('on'); this.showcaseEl.replaceChildren(); this.showcaseAc = null;
      this.bus.emit('bigwin:end', { tier });
    }
  }

  // ───────────── HUD ─────────────
  refresh() {
    const m = this.module; const cfg = m.mathConfig; const levels = cfg.betLevels;
    const idle = this.isIdle();
    const bal = this.wallet.display;
    const bet = this.bet; const i = levels.indexOf(bet);
    const minBet = Math.min(...levels);
    const broke = this.wallet.balance < minBet;
    const cantBet = this.wallet.balance < bet;
    let spin: HudModel['spin'] = 'disabled';
    if (idle) spin = cantBet ? 'disabled' : 'normal';
    else if (this.busy && !this.inFeatureStep && (this.fsm.state === 'Spinning' || this.fsm.state === 'Presenting')) spin = 'stop';
    const cost = this.ctrl.buyCost(bet);
    const hint = idle ? (broke ? t('hint.noMoneyMin') : cantBet ? t('hint.betOnly') : '') : '';
    this.hud.render({
      game: this.game, balance: bal, bet,
      canBetDown: idle && i > 0, canBetUp: idle && i < levels.length - 1, canMax: idle && i < levels.length - 1,
      spin, autoOn: this.autoOn, autoRemaining: this.auto.remaining, autoEnabled: idle || this.autoOn, turboOn: this.d.settings.turbo, soundOn: !this.audio.isMuted,
      infoEnabled: true, menuEnabled: true,
      buy: {
        visible: !!cfg.buy.enabled, enabled: idle && this.wallet.balance >= cost,
        label: t(this.game === 'A' ? 'btn.buy.A' : 'btn.buy.B'),
        price: `${cfg.buy.priceMult}× = ${fmt(cost)}`,
      },
      hint, disclaimer: cfg.buy.disclaimer, locked: this.busy || this.ctrl.inRound,
    });
  }

  /** 供测试/调试读取 */
  debugSnapshot() {
    return {
      game: this.game, ui: this.fsm.state, busy: this.busy, history: [...this.fsm.history], bet: this.bet,
      balance: this.wallet.balance, displayBalance: this.wallet.display, autoOn: this.autoOn, autoRemaining: this.auto.remaining,
      states: { A: this.d.controllers.A.state, B: this.d.controllers.B.state },
    };
  }
  get games() { return allGames(); }
}
