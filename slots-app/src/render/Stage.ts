import { Application, Container, Sprite, Text, Ticker, type Texture } from 'pixi.js';
import type { TextureStore } from './textures';
import { ReelSet } from './ReelSet';
import { CoinLayer } from './CoinLayer';
import { WinLines } from './WinLines';
import { AmountText, FsPanel, HintStrip, HsHeader, JackpotBar, WinBar, installBitmapFonts, CJK_STACK } from './Counters';
import { NUM_FONT_GOLD, coinFrame } from './SymbolView';
import { FRAME, H, LOGO, W } from './layout';
import type { AppViewConfig } from '../games/viewTypes';
import type { MathConfig } from '../core/types';
import { clamp, ease, tween } from '../core/utils';
import type { GameId, JackpotTier } from '@engine/index';

export type BgKind = 'base' | 'fs' | 'hs';
export type StagePhase = 'base' | 'fs' | 'hs';

/**
 * Pixi 舞台。叠放顺序(自下而上):背景 → logo/信息带 → reel-bg → 符号层(mask) → 锁币层(mask) → reel-frame → 赢线/特效 → 赢额条。
 */
export class Stage {
  readonly root = new Container();
  private bgSprite = new Sprite();
  private bgKind: BgKind = 'base';
  private bgToken = 0;
  private logo: Sprite;
  private logoKey = '';
  private logoToken = 0;
  readonly reels: ReelSet;
  readonly coins: CoinLayer;
  readonly lines: WinLines;
  readonly winBar: WinBar;
  readonly fx = new Container();
  private frame: Sprite;
  private band = new Container();
  private hint: HintStrip | null = null;
  private fsPanel: FsPanel | null = null;
  private jackpot: JackpotBar | null = null;
  private hsHeader: HsHeader | null = null;
  private view!: AppViewConfig;
  private cfg!: MathConfig;
  private game: GameId = 'A';
  phase: StagePhase = 'base';

  private constructor(readonly app: Application, readonly store: TextureStore, view: AppViewConfig) {
    this.logoKey = store.has('logo-A') ? 'logo-A' : 'logo-B';
    this.logo = new Sprite(store.texture(this.logoKey)); this.logo.anchor.set(0.5);
    this.logo.position.set(LOGO.x, LOGO.y); this.logo.scale.set(LOGO.scale);
    this.bgSprite.texture = store.texture('background-base');
    this.reels = new ReelSet(store, view, app.ticker);
    this.coins = new CoinLayer(store, view);
    this.frame = new Sprite(store.texture('reel-frame')); this.frame.position.set(FRAME.x, FRAME.y);
    this.lines = new WinLines(this.reels);
    this.winBar = new WinBar(store);
    this.root.addChild(this.bgSprite, this.logo, this.band, this.reels, this.coins, this.frame, this.lines, this.winBar, this.fx);
    app.stage.addChild(this.root);
    app.ticker.add(this.onTick, this);
  }

  static async create(host: HTMLElement, store: TextureStore, view: AppViewConfig): Promise<Stage> {
    installBitmapFonts();
    const app = new Application();
    await app.init({
      width: W, height: H, background: 0x2b1b4d, antialias: true, resolution: 1, autoDensity: false,
      preference: 'webgl', powerPreference: 'high-performance',
    });
    const c = app.canvas;
    c.style.width = '100%'; c.style.height = '100%'; c.style.display = 'block'; c.style.touchAction = 'none';
    host.appendChild(c);
    return new Stage(app, store, view);
  }

  /** 视口缩放时调整渲染分辨率(逻辑尺寸固定 1080×1920) */
  setScale(cssScale: number) {
    const res = clamp(cssScale * (window.devicePixelRatio || 1), 0.6, 2);
    this.app.renderer.resize(W, H, res);
    const c = this.app.canvas; c.style.width = '100%'; c.style.height = '100%';
  }

  /** 切玩法:重配转轴/锁币层/信息带 */
  configure(game: GameId, view: AppViewConfig, cfg: MathConfig, bet: number) {
    this.game = game; this.view = view; this.cfg = cfg;
    this.reels.configure(view);
    this.coins.setView(view); this.coins.clear();
    this.reels.setGhostFiller(false);
    this.lines.clear();
    this.band.removeChildren();
    this.hint = this.fsPanel = this.jackpot = this.hsHeader = null;
    if (view.band === 'fs' && cfg.game === 'A') {
      this.hint = new HintStrip(this.store, '');
      this.fsPanel = new FsPanel(this.store, cfg.fs.ladder);
      this.band.addChild(this.hint, this.fsPanel);
    } else if (cfg.game === 'B') {
      this.jackpot = new JackpotBar(this.store, cfg.jackpotMult);
      this.jackpot.setBet(bet);
      this.hsHeader = new HsHeader(this.store);
      this.band.addChild(this.jackpot, this.hsHeader);
    }
    this.setPhase('base');
    void this.setLogo(game);
    void this.setBackground('base');
    this.winBar.amount.setValue(0);
  }

  /** D-03:logo 按玩法切换纹理(A=logo-A,B=logo-B;三张 800×330、位置一致,只换纹理)。未加载则懒加载后再换。 */
  async setLogo(game: GameId): Promise<void> {
    const key = game === 'A' ? 'logo-A' : 'logo-B';
    const token = ++this.logoToken;
    if (this.logoKey === key) return;
    const tex = await this.store.loadBackground(key).catch(() => null);
    if (!tex || token !== this.logoToken) return;
    this.logo.texture = tex; this.logoKey = key;
  }
  get logoTextureKey() { return this.logoKey; }

  setHint(msg: string) { this.hint?.setText(msg); }
  setBet(bet: number) { this.jackpot?.setBet(bet); }
  get fsPanelRef() { return this.fsPanel; }
  get hsHeaderRef() { return this.hsHeader; }

  /** 阶段 → 信息带/logo 可见性(背景另行 setBackground) */
  setPhase(p: StagePhase) {
    this.phase = p;
    if (this.fsPanel) this.fsPanel.visible = p === 'fs';
    if (this.hint) this.hint.visible = p !== 'fs';
    if (this.hsHeader) this.hsHeader.visible = p === 'hs';
    this.logo.visible = p !== 'hs';
    this.winBar.setLabel(p === 'base' ? '赢额' : '累计赢额');
  }

  /** 背景切换;fs/hs 懒加载,加载未完成时先保持原背景,完成后淡入。返回加载 Promise。 */
  async setBackground(kind: BgKind): Promise<void> {
    const token = ++this.bgToken;
    let tex: Texture;
    try { tex = kind === 'base' ? this.store.texture('background-base') : await this.store.loadBackground(`background-${kind}`); }
    catch (e) { console.warn('[stage] background load failed', kind, e); return; }
    if (token !== this.bgToken) return;
    this.bgKind = kind;
    const old = this.bgSprite.texture;
    if (old === tex) return;
    const ghost = new Sprite(old); ghost.zIndex = 0;
    this.root.addChildAt(ghost, 0);
    this.bgSprite.texture = tex;
    await tween(380, t => { ghost.alpha = 1 - t; }, ease.cubicOut);
    ghost.destroy();
  }
  get background(): BgKind { return this.bgKind; }

  /** 币飞行:from → to 抛物线,到达后 resolve。frame = 符号合图帧 */
  async flyCoin(frame: string, from: { x: number; y: number }, to: { x: number; y: number }, ms: number, label?: string, signal?: AbortSignal): Promise<void> {
    const box = new Container();
    const s = new Sprite(this.store.symbol(frame)); s.anchor.set(0.5); s.scale.set(0.46);
    box.addChild(s);
    if (label) {
      const t = new AmountText(NUM_FONT_GOLD, 44, 140);
      t.setText(label); t.position.set(0, 4); t.scale.set(0.9);
      box.addChild(t);
    }
    box.position.set(from.x, from.y);
    this.fx.addChild(box);
    const cx = (from.x + to.x) / 2 + (from.x < to.x ? -120 : 120), cy = Math.min(from.y, to.y) - 160;
    await tween(ms, t => {
      const u = 1 - t;
      box.x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
      box.y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
      box.scale.set(1 - 0.5 * t);
      box.alpha = t > 0.85 ? (1 - t) / 0.15 : 1;
    }, ease.cubicInOut, signal);
    box.destroy({ children: true });
  }

  /** 浮字(如 FS 倍数 ×3) */
  async floatText(msg: string, at: { x: number; y: number }, ms = 900, color = 0xffe066, size = 64) {
    const t = new Text({ text: msg, style: { fontFamily: CJK_STACK, fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0x3a1b5c, width: size * 0.18, join: 'round' } } });
    t.anchor.set(0.5); t.position.set(at.x, at.y);
    this.fx.addChild(t);
    await tween(ms, p => { t.y = at.y - 80 * p; t.alpha = p < 0.7 ? 1 : (1 - p) / 0.3; t.scale.set(0.8 + 0.3 * Math.min(1, p * 4)); }, ease.cubicOut);
    t.destroy();
  }

  private onTick(_t: Ticker) { this.coins.tick(performance.now()); }

  coinFrameFor(c: Parameters<typeof coinFrame>[1]) { return coinFrame(this.view, c); }
  jackpotTierPos(_t: JackpotTier) { return { x: W / 2, y: 300 }; }
  get gameId() { return this.game; }
}
