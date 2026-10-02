import { el } from './dom';
import { t } from '../core/i18n';
import { fmt } from '../core/utils';
import type { TextureStore } from '../render/textures';
import type { MathConfig } from '../core/types';
import type { GameId } from '@engine/index';
import { AUTO_CHOICES, type AutoChoice } from '../core/autoplay';

type MenuOpts = { idle: boolean; defaultBalance: number; soundOn: boolean; onReset: () => void; onSound: () => void; onDesign: () => void };

/** 弹窗:购买确认 / 赔付表(占位简表)/ 菜单。panel-popup 九宫格用 CSS border-image。 */
export class Popups {
  private host: HTMLElement;
  private current: HTMLElement | null = null;
  constructor(parent: HTMLElement, private store: TextureStore) {
    this.host = el('div', '', parent); this.host.id = 'popups';
  }
  get isOpen() { return !!this.current; }
  close() { this.current?.remove(); this.current = null; }

  private open(title: string, testId: string): { body: HTMLElement; box: HTMLElement; back: HTMLElement } {
    this.close();
    const back = el('div', 'backdrop', this.host);
    back.dataset.testid = testId;
    const box = el('div', 'popup', back);
    box.style.borderImageSource = `url(${new URL(this.store.url('panel-popup'), document.baseURI).href})`;
    el('h2', '', box, title);
    const body = el('div', 'body', box);
    this.current = back;
    return { body, box, back };
  }

  /** 购买确认。返回 true=确认。价格文字由调用方(从 config.buy.priceMult × 当前 bet 计算)传入。 */
  confirmBuy(o: { game: GameId; mult: number; bet: number; cost: number; balance: number; detail: string; disclaimer: string }): Promise<boolean> {
    return new Promise(resolve => {
      const { body, back } = this.open(t('buy.title'), 'buy-confirm');
      el('div', '', body, o.detail);
      const price = el('div', 'price', body, t('buy.price', { mult: o.mult, bet: fmt(o.bet), cost: fmt(o.cost) }));
      price.dataset.testid = 'buy-price';
      price.dataset.cost = String(o.cost);
      price.dataset.mult = String(o.mult);
      const after = o.balance - o.cost;
      el('div', '', body, t('buy.after', { n: fmt(Math.max(0, after)) }));
      const fine = el('div', 'fine', body, o.disclaimer);
      fine.dataset.testid = 'buy-disclaimer';
      const row = el('div', 'row', body);
      const cancel = el('button', 'pbtn alt', row, t('btn.cancel')); cancel.dataset.testid = 'buy-cancel';
      const ok = el('button', 'pbtn gold', row, t('btn.confirm')); ok.dataset.testid = 'buy-ok';
      ok.disabled = after < 0;
      const done = (v: boolean) => { this.close(); resolve(v); };
      cancel.onclick = () => done(false);
      ok.onclick = () => done(true);
      back.addEventListener('pointerdown', e => { if (e.target === back) done(false); });
    });
  }

  /** 赔付表入口(占位):UI 正在更新赔付表页面,这里按当前数学配置渲染简表,不依赖 paytable 素材。 */
  info(game: GameId, cfg: MathConfig, frames: Record<string, string>, bet: number): void {
    const { body, box } = this.open(t('info.title'), 'info-popup');
    box.style.width = '900px';
    el('div', 'fine', body, t('info.placeholder'));
    const wrap = el('div', 'scroll', body);
    const table = el('table', 'ptable', wrap);
    const head = el('tr', '', table);
    el('td', '', head, ''); el('td', '', head, '×3'); el('td', '', head, '×4'); el('td', '', head, '×5');
    const { w: sw, h: sh } = this.store.sheetSize;
    for (const [sym, row] of Object.entries(cfg.paytable)) {
      const tr = el('tr', '', table);
      const c0 = el('td', 'sym', tr);
      const f = frames[sym];
      if (f) {
        const r = this.store.frameRect(f);
        const k = 56 / r.w;
        const i = el('span', 'sym-i', c0);
        i.style.backgroundImage = `url(${new URL(this.store.sheetUrl, document.baseURI).href})`;
        i.style.backgroundSize = `${sw * k}px ${sh * k}px`;
        i.style.backgroundPosition = `${-r.x * k}px ${-r.y * k}px`;
      }
      for (const v of row) el('td', '', tr, `${v}×`);
    }
    const lines: string[] = [t('info.pay')];
    if (cfg.game === 'A') {
      const sc = cfg.scatterPay;
      lines.push(t('info.scatterA', { a: sc['3'], b: sc['4'], c: sc['5'] }));
      lines.push(t('info.wildA'));
      lines.push(t('info.fsA', { a: cfg.fs.award['3'], b: cfg.fs.award['4'], c: cfg.fs.award['5'], ladder: cfg.fs.ladder.map(x => `×${x}`).join(' → ') }));
    } else {
      lines.push(t('info.hsB', { n: cfg.triggerMin, r: cfg.respins }));
      lines.push(['Mini', 'Minor', 'Major', 'Grand'].map(k => `${k} ${cfg.jackpotMult[k as 'Mini']}×`).join(' · '));
    }
    lines.push(t('info.max', { n: fmt(cfg.maxWinMult) }));
    const txt = el('div', 'body left', body);
    txt.style.marginTop = '14px';
    txt.innerHTML = lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
    void bet;
    const row = el('div', 'row', body);
    const close = el('button', 'pbtn alt', row, t('btn.close')); close.dataset.testid = 'popup-close';
    close.onclick = () => this.close();
  }

  menu(o: MenuOpts): void {
    const { body } = this.open(t('menu.title'), 'menu-popup');
    const row1 = el('div', 'row', body);
    const reset = el('button', 'pbtn gold', row1, t('menu.reset')); reset.dataset.testid = 'menu-reset';
    reset.disabled = !o.idle;
    // D-01:先弹确认框;确认才重置并关菜单,取消回到菜单
    reset.onclick = async () => {
      const ok = await this.confirmReset(o.defaultBalance);
      if (ok) { o.onReset(); this.close(); } else this.menu(o);
    };
    el('div', 'fine', body, o.idle ? t('menu.reset.hint', { n: fmt(o.defaultBalance) }) : t('menu.reset.busy'));
    const rowD = el('div', 'row', body);
    const design = el('button', 'pbtn alt', rowD, t('menu.design')); design.dataset.testid = 'menu-design';
    design.onclick = () => { this.close(); o.onDesign(); };
    const row2 = el('div', 'row', body);
    const snd = el('button', 'pbtn alt', row2, `${t('menu.sound')}:${o.soundOn ? t('menu.sound.on') : t('menu.sound.off')}`); snd.dataset.testid = 'menu-sound';
    snd.onclick = () => { o.onSound(); this.close(); };
    el('div', 'fine', body, t('menu.about'));
    const row3 = el('div', 'row', body);
    const close = el('button', 'pbtn', row3, t('btn.close')); close.dataset.testid = 'popup-close';
    close.onclick = () => this.close();
  }

  /** 重置确认框(D-01):返回 true=确认重置。 */
  confirmReset(defaultBalance: number): Promise<boolean> {
    return new Promise(resolve => {
      const { body, back } = this.open(t('menu.reset.confirmTitle'), 'reset-confirm');
      el('div', '', body, t('menu.reset.confirmBody', { n: fmt(defaultBalance) }));
      const row = el('div', 'row', body);
      const cancel = el('button', 'pbtn alt', row, t('btn.cancel')); cancel.dataset.testid = 'reset-cancel';
      const ok = el('button', 'pbtn gold', row, t('btn.resetOk')); ok.dataset.testid = 'reset-ok';
      const done = (v: boolean) => { resolve(v); };
      cancel.onclick = () => done(false);
      ok.onclick = () => done(true);
      back.addEventListener('pointerdown', e => { if (e.target === back) done(false); });
    });
  }

  /** AUTO 次数菜单(D-05):返回选择,取消返回 null。 */
  autoMenu(): Promise<AutoChoice | null> {
    return new Promise(resolve => {
      const { body, box, back } = this.open(t('auto.title'), 'auto-menu');
      box.classList.add('auto-popup');
      const grid = el('div', 'auto-grid', body);
      for (const c of AUTO_CHOICES) {
        const b = el('button', c === 'feature' ? 'pbtn gold wide' : 'pbtn alt', grid, c === 'feature' ? t('auto.feature') : t('auto.n', { n: c }));
        b.dataset.testid = `auto-${c}`;
        b.onclick = () => { this.close(); resolve(c); };
      }
      el('div', 'fine', body, t('auto.hint'));
      const row = el('div', 'row', body);
      const cancel = el('button', 'pbtn', row, t('btn.cancel')); cancel.dataset.testid = 'auto-cancel';
      const done = () => { this.close(); resolve(null); };
      cancel.onclick = done;
      back.addEventListener('pointerdown', e => { if (e.target === back) done(); });
    });
  }
}

function escapeHtml(s: string) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
