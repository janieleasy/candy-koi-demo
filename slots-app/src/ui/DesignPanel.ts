import { el } from './dom';
import { t } from '../core/i18n';
import { getDesignCopy } from '../content/designPanel';
import type { GameId } from '@engine/index';

/**
 * 设计说明面板(按 UI 稿 slots-ui/assets/design-notes/panel-spec.md 实现,DOM/CSS,不用 Pixi)。
 * 结构:入口按钮 #dn-open + 首次提示气泡 #dn-hint + 遮罩 .dn-mask + aside#dn-panel[role=dialog]。
 * 样式全部在 style.css 的「设计说明面板」段(.dn-*),UI 再改稿只需改那一段与本文件的 DOM。
 * 纯展示:不读写游戏状态,不阻塞转轴/结算/AUTO(打开期间动画照常);遮罩覆盖整个舞台,故点不到 SPIN 等控件。
 */
const GAMES: GameId[] = ['A', 'B'];
const HINT_KEY = 'dn.hint';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** 数字片段包 <strong>(正则来自 panel-spec §8;先转义再包,不改文案) */
export const highlight = (text: string) => esc(text).replace(/(?<![A-Za-z])-?x?\d+(?:[.,/x]\d+)*[x%]?/g, '<strong>$&</strong>');

export interface DesignPanelOpts {
  parent: HTMLElement;
  url: (key: string) => string;                   // 素材 URL(TextureStore.url)
  store: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  getGame: () => GameId;                          // 打开时默认显示的玩法
}

export class DesignPanel {
  readonly entry: HTMLButtonElement;
  readonly hint: HTMLElement;
  readonly mask: HTMLElement;
  readonly panel: HTMLElement;
  private entryImg: HTMLImageElement;
  private titleEl: HTMLElement; private subEl: HTMLElement;
  private tabs = new Map<GameId, HTMLButtonElement>();
  private scroll: HTMLElement; private list: HTMLElement;
  private fadeTop: HTMLElement; private fadeBot: HTMLElement;
  private closeX: HTMLButtonElement; private closeBtn: HTMLButtonElement;
  private _open = false;
  private shown: GameId = 'A';
  private hintTimers: number[] = [];
  private closeTimer = 0;
  private inerted: HTMLElement[] = [];

  constructor(private o: DesignPanelOpts) {
    const u = (k: string) => new URL(o.url(k), document.baseURI).href;
    // ── 入口按钮:视觉 210×76 @ (800,97);DOM 热区外扩 10px(230×96)
    this.entry = el('button', 'dn-entry', o.parent); this.entry.id = 'dn-open'; this.entry.type = 'button';
    this.entry.dataset.testid = 'dn-open';
    this.entry.setAttribute('aria-haspopup', 'dialog'); this.entry.setAttribute('aria-controls', 'dn-panel'); this.entry.setAttribute('aria-label', t('dn.entry'));
    const normal = u('design-notes/btn-design-notes_normal'); const pressed = u('design-notes/btn-design-notes_pressed');
    this.entryImg = el('img', '', this.entry); this.entryImg.src = normal; this.entryImg.alt = ''; this.entryImg.draggable = false;
    const press = (on: boolean) => { this.entryImg.src = on ? pressed : normal; };
    this.entry.addEventListener('pointerdown', () => press(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) this.entry.addEventListener(ev, () => press(false));
    this.entry.addEventListener('click', () => this.open());
    const warm = () => { new Image().src = pressed; };
    if (document.readyState === 'complete') setTimeout(warm, 1200); else window.addEventListener('load', () => setTimeout(warm, 1200), { once: true });

    // ── 首次提示气泡(aria-hidden)
    this.hint = el('div', 'dn-hint', o.parent); this.hint.id = 'dn-hint'; this.hint.dataset.testid = 'dn-hint'; this.hint.setAttribute('aria-hidden', 'true');
    this.hint.style.backgroundImage = `url(${u('design-notes/hint-bubble')})`;
    this.hint.textContent = ''; // 文字已在素材内;保留 sr 文案由入口 aria-label 负责

    // ── 遮罩 + 面板
    this.mask = el('div', 'dn-mask', o.parent); this.mask.hidden = true; this.mask.dataset.testid = 'dn-mask';
    this.panel = el('aside', 'dn-panel', o.parent); this.panel.id = 'dn-panel'; this.panel.hidden = true; this.panel.dataset.testid = 'design-popup';
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-labelledby', 'dn-title');
    const bg = el('div', 'dn-bg', this.panel); bg.style.borderImageSource = `url(${u('panel-popup')})`;
    const head = el('header', 'dn-titlebar', this.panel);
    this.titleEl = el('h2', '', head); this.titleEl.id = 'dn-title'; this.titleEl.dataset.testid = 'dn-title';
    this.subEl = el('p', 'dn-sub', head); this.subEl.id = 'dn-sub'; this.subEl.dataset.testid = 'dp-game';
    this.closeX = el('button', 'dn-x', head, '×'); this.closeX.type = 'button'; this.closeX.setAttribute('aria-label', t('design.close')); this.closeX.dataset.testid = 'dn-close-x';
    const tablist = el('div', 'dn-tabs', this.panel); tablist.setAttribute('role', 'tablist'); tablist.setAttribute('aria-label', t('dn.tablist'));
    for (const g of GAMES) {
      const b = el('button', 'dn-tab', tablist, getDesignCopy(g).title); b.type = 'button'; b.id = `dn-tab-${g}`; b.dataset.testid = `dn-tab-${g}`;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'dn-body');
      b.onclick = () => this.show(g, true);
      b.onkeydown = e => this.tabKey(e, g);
      this.tabs.set(g, b);
    }
    this.scroll = el('div', 'dn-scroll', this.panel); this.scroll.id = 'dn-body'; this.scroll.dataset.testid = 'dp-list';
    this.scroll.setAttribute('role', 'tabpanel'); this.scroll.tabIndex = 0; this.scroll.setAttribute('aria-label', t('dn.content'));
    this.list = el('ol', 'dn-cards', this.scroll);
    this.fadeTop = el('div', 'dn-fade top', this.panel); this.fadeBot = el('div', 'dn-fade bot', this.panel);
    this.scroll.addEventListener('scroll', () => this.updateFade(), { passive: true });
    const foot = el('footer', 'dn-foot', this.panel);
    el('p', 'dn-disc', foot, t('dn.disclaimer'));
    this.closeBtn = el('button', 'dn-close', foot, t('design.close')); this.closeBtn.type = 'button'; this.closeBtn.dataset.testid = 'dn-close';
    this.closeX.onclick = () => this.close(); this.closeBtn.onclick = () => this.close();
    // 点击遮罩不关闭(避免误触):仅 ×/关闭/Esc

    this.scheduleHint();
    // 任意点击也收起提示(不拦截)
    document.addEventListener('pointerdown', () => this.dismissHint(), { capture: true });
  }

  get isOpen() { return this._open; }
  get game(): GameId { return this.shown; }

  open(game: GameId = this.o.getGame()): void {
    if (this._open) return;
    window.clearTimeout(this.closeTimer);
    this._open = true; this.dismissHint();
    document.addEventListener('keydown', this.keydown);
    this.mask.hidden = false; this.panel.hidden = false;
    this.mask.classList.remove('out'); this.panel.classList.remove('out');
    this.mask.classList.add('in'); this.panel.classList.add('in');
    // 面板外元素 inert,防焦点/键盘穿透
    this.inerted = [...this.o.parent.children].filter(c => c instanceof HTMLElement && c !== this.mask && c !== this.panel) as HTMLElement[];
    for (const c of this.inerted) c.setAttribute('inert', '');
    this.show(game, false);
    this.closeX.focus({ preventScroll: true });
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    document.removeEventListener('keydown', this.keydown);
    this.mask.classList.remove('in'); this.panel.classList.remove('in');
    this.mask.classList.add('out'); this.panel.classList.add('out');
    const finish = () => {
      this.mask.hidden = true; this.panel.hidden = true; this.mask.classList.remove('out'); this.panel.classList.remove('out');
    };
    for (const c of this.inerted) c.removeAttribute('inert');
    this.inerted = [];
    this.entry.focus({ preventScroll: true }); // 关闭后焦点回入口按钮
    window.clearTimeout(this.closeTimer);
    if (reduced()) finish(); else this.closeTimer = window.setTimeout(finish, 160);
  }

  /** 切换显示的玩法(面板内 Tab):重渲染卡片、副标、滚回顶部;不影响游戏本身。 */
  show(game: GameId, animate: boolean): void {
    this.shown = game;
    const c = getDesignCopy(game);
    this.titleEl.textContent = c.panelTitle; this.subEl.textContent = c.title;
    this.panel.dataset.game = game;
    for (const [g, b] of this.tabs) {
      const on = g === game;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on);
    }
    this.scroll.setAttribute('aria-labelledby', `dn-tab-${game}`);
    this.list.replaceChildren();
    c.points.forEach((p, i) => {
      const li = el('li', 'dn-card', this.list); li.dataset.testid = 'dp-item'; li.dataset.id = p.id;
      li.style.setProperty('--i', String(i));
      const badge = el('span', 'dn-badge', li, String(i + 1)); badge.setAttribute('aria-hidden', 'true');
      el('h3', '', li, p.heading);
      const para = el('p', '', li); para.innerHTML = highlight(p.text); // 文案原样;仅给数字包 <strong>
    });
    this.scroll.scrollTop = 0;
    // 内容区淡入 + 卡片错开入场(仅打开/切 Tab 时)
    this.scroll.classList.remove('swap'); void this.scroll.offsetWidth; this.scroll.classList.add('swap');
    void animate;
    this.updateFade();
  }

  private updateFade() {
    const s = this.scroll;
    this.fadeTop.classList.toggle('on', s.scrollTop > 1);
    this.fadeBot.classList.toggle('on', s.scrollTop + s.clientHeight < s.scrollHeight - 1);
  }

  // ── 键盘:Esc 关闭;焦点陷阱;Tablist ←/→/Home/End
  private focusables(): HTMLElement[] {
    return [this.closeX, ...(GAMES.map(g => this.tabs.get(g)!).filter(b => b.tabIndex === 0)), this.scroll, this.closeBtn];
  }
  /** 挂在 document 上(焦点落到 BODY 时也能响应);仅面板打开期间有效,关闭即解除,不影响其他弹窗的 Esc。 */
  private readonly keydown = (e: KeyboardEvent): void => {
    if (!this._open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (e.key !== 'Tab') return;
    const f = this.focusables(); const i = f.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  };
  private tabKey(e: KeyboardEvent, g: GameId) {
    let n: GameId | null = null;
    const i = GAMES.indexOf(g);
    if (e.key === 'ArrowRight') n = GAMES[(i + 1) % GAMES.length];
    else if (e.key === 'ArrowLeft') n = GAMES[(i + GAMES.length - 1) % GAMES.length];
    else if (e.key === 'Home') n = GAMES[0];
    else if (e.key === 'End') n = GAMES[GAMES.length - 1];
    if (!n) return;
    e.preventDefault(); this.show(n, true); this.tabs.get(n)!.focus();
  }

  // ── 首次提示:首次进入游戏 1.2s 后淡入,5s 后淡出;点击任意处/打开面板即消失;写 dn.hint='1'
  private scheduleHint() {
    if (this.o.store.getItem(HINT_KEY)) return;
    this.hintTimers.push(window.setTimeout(() => {
      if (this._open) return;
      this.hint.classList.add('show'); this.o.store.setItem(HINT_KEY, '1');
      this.hintTimers.push(window.setTimeout(() => this.dismissHint(), 5000));
    }, 1200));
  }
  dismissHint() {
    for (const h of this.hintTimers) window.clearTimeout(h);
    this.hintTimers = [];
    if (this.hint.classList.contains('show')) { this.hint.classList.remove('show'); this.o.store.setItem(HINT_KEY, '1'); }
    else if (!this.o.store.getItem(HINT_KEY) && this._open) this.o.store.setItem(HINT_KEY, '1');
  }
}
