import { el, ImgBtn, place } from './dom';
import { t } from '../core/i18n';
import { fmt } from '../core/utils';
import type { TextureStore } from '../render/textures';
import type { GameId } from '@engine/index';

/** Hud 视图模型:壳子每次状态变化重新计算后 render(vm)。 */
export interface HudModel {
  game: GameId;
  balance: number;
  bet: number;
  canBetDown: boolean;
  canBetUp: boolean;
  canMax: boolean;
  spin: 'normal' | 'stop' | 'disabled';
  autoOn: boolean; autoRemaining: number | null; autoEnabled: boolean;
  turboOn: boolean;
  soundOn: boolean;
  infoEnabled: boolean; menuEnabled: boolean;
  buy: { visible: boolean; enabled: boolean; label: string; price: string };
  hint: string;
  disclaimer: string;
  locked: boolean; // 特色玩法/局中
}
export interface HudHandlers {
  onSpin(): void; onBetDelta(d: -1 | 1): void; onMax(): void; onAuto(): void; onTurbo(): void; onSound(): void;
  onInfo(): void; onMenu(): void; onBuy(): void; onTab(g: GameId): void;
}

/** 底部 DOM 外壳。位置参考 wireframe-portrait.png(逻辑坐标 1080×1920)。 */
export class Hud {
  readonly root: HTMLElement;
  private tabs = new Map<GameId, HTMLButtonElement>();
  private balanceNum!: HTMLElement; private betNum!: HTMLElement;
  private spin!: ImgBtn; private minus!: ImgBtn; private plus!: ImgBtn; private max!: ImgBtn;
  private auto!: ImgBtn; private turbo!: ImgBtn; private sound!: ImgBtn; private info!: ImgBtn; private menu!: ImgBtn;
  private buyBtn!: HTMLButtonElement; private buyLabel!: HTMLElement; private buySub!: HTMLElement;
  private hintEl!: HTMLElement; private disc!: HTMLElement; private autoCount!: HTMLElement;

  constructor(parent: HTMLElement, private store: TextureStore, h: HudHandlers) {
    this.root = el('div', '', parent); this.root.id = 'ui';
    const u = (k: string) => store.url(k);

    // 玩法 tab
    const tabs = el('div', '', this.root); tabs.id = 'tabs';
    for (const g of ['A', 'B'] as GameId[]) {
      const b = el('button', 'tab', tabs, t(`tab.${g}` as const));
      b.dataset.testid = `tab-${g}`;
      b.onclick = () => h.onTab(g);
      this.tabs.set(g, b);
    }

    // 余额 / 下注
    const mkPanel = (x: number, w: number, label: string, tid: string) => {
      const p = el('div', 'panel', this.root);
      p.style.left = `${x}px`; p.style.top = '1352px'; p.style.width = `${w}px`; p.style.height = '120px';
      p.style.borderImageSource = `url(${new URL(u('panel-info'), document.baseURI).href})`;
      el('div', 'lab', p, label);
      const n = el('div', 'num', p, '0'); n.dataset.testid = tid;
      return n;
    };
    this.balanceNum = mkPanel(30, 290, t('label.balance'), 'balance');
    this.betNum = mkPanel(430, 220, t('label.bet'), 'bet');
    const small = { w: 110, h: 110 };
    const ib = (name: string, x: number, y: number, w: number, hh: number, extra: Partial<ConstructorParameters<typeof ImgBtn>[1]> & { onClick: () => void; states: Record<string, string>; initial: string }) =>
      new ImgBtn(this.root, { x, y, w, h: hh, label: name, testId: name, ...extra });
    this.minus = ib('bet-minus', 372, 1412, small.w, small.h, { states: { normal: u('btn-minus_normal'), pressed: u('btn-minus_pressed'), disabled: u('btn-minus_disabled') }, initial: 'normal', pressed: 'pressed', onClick: () => h.onBetDelta(-1) });
    this.plus = ib('bet-plus', 708, 1412, small.w, small.h, { states: { normal: u('btn-plus_normal'), pressed: u('btn-plus_pressed'), disabled: u('btn-plus_disabled') }, initial: 'normal', pressed: 'pressed', onClick: () => h.onBetDelta(1) });
    this.max = ib('bet-max', 885, 1412, 170, 100, { states: { normal: u('btn-max_normal'), pressed: u('btn-max_pressed'), disabled: u('btn-max_disabled') }, initial: 'normal', pressed: 'pressed', onClick: h.onMax });

    this.spin = ib('spin', 540, 1660, 260, 260, { states: { normal: u('btn-spin_normal'), pressed: u('btn-spin_pressed'), disabled: u('btn-spin_disabled'), stop: u('btn-spin_stop') }, initial: 'normal', pressed: 'pressed', onClick: h.onSpin });
    this.auto = ib('auto', 235, 1660, 170, 100, { states: { off: u('btn-auto_off'), on: u('btn-auto_on'), pressed: u('btn-auto_pressed'), disabled: u('btn-auto_disabled') }, initial: 'off', pressed: 'pressed', onClick: h.onAuto });
    // AUTO 剩余次数:叠在按钮上(不拦截点击);「直到特色」显示 ∞
    this.autoCount = el('div', '', this.root); this.autoCount.id = 'auto-count'; this.autoCount.dataset.testid = 'auto-count';
    this.autoCount.style.left = '235px'; this.autoCount.style.top = '1696px'; this.autoCount.style.width = '170px';
    this.turbo = ib('turbo', 845, 1660, 170, 100, { states: { off: u('btn-turbo_off'), on: u('btn-turbo_on'), pressed: u('btn-turbo_pressed'), disabled: u('btn-turbo_disabled') }, initial: 'off', pressed: 'pressed', onClick: h.onTurbo });
    this.info = ib('info', 80, 1575, small.w, small.h, { states: { normal: u('btn-info_normal'), pressed: u('btn-info_pressed'), disabled: u('btn-info_disabled') }, initial: 'normal', pressed: 'pressed', onClick: h.onInfo });
    this.menu = ib('menu', 1000, 1575, small.w, small.h, { states: { normal: u('btn-menu_normal'), pressed: u('btn-menu_pressed'), disabled: u('btn-menu_disabled') }, initial: 'normal', pressed: 'pressed', onClick: h.onMenu });
    this.sound = ib('sound', 80, 1745, small.w, small.h, { states: { on: u('btn-sound_on'), off: u('btn-sound_off'), disabled: u('btn-sound_disabled') }, initial: 'off', onClick: h.onSound });

    this.hintEl = el('div', '', this.root); this.hintEl.id = 'hint'; this.hintEl.dataset.testid = 'hint';
    this.buyBtn = el('button', '', this.root); this.buyBtn.id = 'buy'; this.buyBtn.dataset.testid = 'buy';
    this.buyLabel = el('span', '', this.buyBtn); this.buySub = el('small', '', this.buyBtn);
    this.buyBtn.onclick = () => h.onBuy();
    this.disc = el('div', '', this.root); this.disc.id = 'disclaimer'; this.disc.dataset.testid = 'disclaimer';
    void place;
  }

  render(m: HudModel) {
    for (const [g, b] of this.tabs) {
      b.classList.toggle('active', g === m.game);
      b.classList.toggle('locked', m.locked);
      b.dataset.active = g === m.game ? '1' : '0';
    }
    this.balanceNum.textContent = fmt(m.balance);
    this.betNum.textContent = fmt(m.bet);
    this.minus.setEnabled(m.canBetDown); this.plus.setEnabled(m.canBetUp); this.max.setEnabled(m.canMax);
    this.spin.setEnabled(m.spin !== 'disabled');
    this.spin.setState(m.spin === 'stop' ? 'stop' : 'normal');
    this.auto.setEnabled(m.autoEnabled); this.auto.setState(m.autoOn ? 'on' : 'off');
    const cnt = m.autoOn ? (m.autoRemaining === null ? '∞' : String(m.autoRemaining)) : '';
    this.autoCount.textContent = cnt; this.autoCount.classList.toggle('show', m.autoOn);
    this.autoCount.dataset.remaining = m.autoOn ? (m.autoRemaining === null ? 'inf' : String(m.autoRemaining)) : '';
    this.auto.el.setAttribute('aria-label', m.autoOn ? (m.autoRemaining === null ? t('auto.aria.inf') : t('auto.aria', { n: m.autoRemaining })) : 'AUTO');
    this.turbo.setState(m.turboOn ? 'on' : 'off');
    this.sound.setState(m.soundOn ? 'on' : 'off');
    this.info.setEnabled(m.infoEnabled); this.menu.setEnabled(m.menuEnabled);
    this.buyBtn.style.display = m.buy.visible ? '' : 'none';
    this.buyBtn.disabled = !m.buy.enabled;
    this.buyLabel.textContent = m.buy.label; this.buySub.textContent = m.buy.price;
    this.hintEl.textContent = m.hint; this.hintEl.classList.toggle('show', !!m.hint);
    this.disc.textContent = m.buy.visible ? m.disclaimer : '';
    this.root.dataset.game = m.game;
  }
  setBalanceText(n: number) { this.balanceNum.textContent = fmt(n); }
}
