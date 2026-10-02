// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Popups } from '../src/ui/Popups';
import { DesignPanel, highlight } from '../src/ui/DesignPanel';
import { getDesignCopy, DESIGN_COPY_VERSION } from '../src/content/designPanel';
import { t, setLang } from '../src/core/i18n';
import type { GameId } from '@engine/index';

const store: any = { url: (k: string) => `assets/${k}.webp` };
let host: HTMLElement; let p: Popups;
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const click = (id: string) => { const e = q(id); if (!e) throw new Error('missing ' + id); e.click(); };
const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { document.body.innerHTML = ''; host = document.createElement('div'); document.body.appendChild(host); p = new Popups(host, store); setLang('zh'); });

function openMenu(idle = true) {
  const calls = { reset: 0, sound: 0, design: 0 };
  p.menu({ idle, defaultBalance: 10000, soundOn: false, onReset: () => calls.reset++, onSound: () => calls.sound++, onDesign: () => calls.design++ });
  return calls;
}

describe('重置确认框(D-01)', () => {
  it('点重置先出确认框,不立即重置', async () => {
    const c = openMenu(); click('menu-reset'); await tick();
    expect(q('reset-confirm')).toBeTruthy(); expect(c.reset).toBe(0);
    expect(q('reset-confirm')!.textContent).toContain('10,000');
    expect(q('reset-ok')!.textContent).toBe(t('btn.resetOk')); expect(q('reset-cancel')!.textContent).toBe(t('btn.cancel'));
  });
  it('取消:不重置,回到菜单', async () => {
    const c = openMenu(); click('menu-reset'); await tick(); click('reset-cancel'); await tick();
    expect(c.reset).toBe(0); expect(q('reset-confirm')).toBeNull(); expect(q('menu-popup')).toBeTruthy(); expect(p.isOpen).toBe(true);
  });
  it('确认:重置一次并关闭菜单', async () => {
    const c = openMenu(); click('menu-reset'); await tick(); click('reset-ok'); await tick();
    expect(c.reset).toBe(1); expect(p.isOpen).toBe(false); expect(q('menu-popup')).toBeNull();
  });
  it('忙时重置按钮禁用(限制保持)', () => {
    openMenu(false); expect((q('menu-reset') as HTMLButtonElement).disabled).toBe(true);
  });
  it('en 文案也有', () => { setLang('en'); expect(t('menu.reset.confirmBody', { n: 1 })).toMatch(/Reset your balance/); });
});

describe('AUTO 次数菜单(D-05 UI)', () => {
  it('5 个选项 + 取消;选 10 返回 10', async () => {
    const pr = p.autoMenu();
    expect(['auto-10', 'auto-25', 'auto-50', 'auto-100', 'auto-feature'].every(id => !!q(id))).toBe(true);
    expect(q('auto-feature')!.textContent).toBe('直到特色玩法触发');
    click('auto-10'); expect(await pr).toBe(10); expect(p.isOpen).toBe(false);
  });
  it('选「直到特色」返回 feature;取消返回 null', async () => {
    let pr = p.autoMenu(); click('auto-feature'); expect(await pr).toBe('feature');
    pr = p.autoMenu(); click('auto-cancel'); expect(await pr).toBeNull(); expect(p.isOpen).toBe(false);
  });
});


describe('设计说明面板(UI 稿 panel-spec)', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
  let dp: DesignPanel; let ks: ReturnType<typeof mem>; let game: GameId;
  const mk = (g: GameId = 'A') => { game = g; ks = mem(); dp = new DesignPanel({ parent: host, url: k => `assets/${k}.webp`, store: ks, getGame: () => game }); return dp; };
  const items = () => qa('dp-item');

  it('数据:A、B 各 5 条要点,含标题与原文', () => {
    for (const g of ['A', 'B'] as const) {
      const c = getDesignCopy(g);
      expect(c.points).toHaveLength(5); expect(c.panelTitle).toBe('设计说明');
      for (const x of c.points) { expect(x.heading.length).toBeGreaterThan(0); expect(x.text.length).toBeGreaterThan(10); }
    }
    expect(DESIGN_COPY_VERSION).toBeTruthy();
    expect(getDesignCopy('A').title).toBe('糖果锦鲤池'); expect(getDesignCopy('B').title).toBe('金鲤满仓');
  });
  it('DOM 结构:role=dialog、aria-modal、tablist/tab/tabpanel、5 个 li;初始隐藏', () => {
    mk();
    const p = q('design-popup')!;
    expect(p.getAttribute('role')).toBe('dialog'); expect(p.getAttribute('aria-modal')).toBe('true'); expect(p.getAttribute('aria-labelledby')).toBe('dn-title');
    expect(p.hidden).toBe(true); expect(dp.isOpen).toBe(false);
    expect(host.querySelector('[role=tablist]')!.querySelectorAll('[role=tab]')).toHaveLength(2);
    expect(host.querySelector('[role=tabpanel]')!.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('#dn-open')!.getAttribute('aria-haspopup')).toBe('dialog');
  });
  it('打开 A:5 条要点按 JSON 原文渲染;标题、副标、序号 1~5', () => {
    mk('A'); dp.open();
    expect(items()).toHaveLength(5); expect(q('dn-title')!.textContent).toBe('设计说明'); expect(q('dp-game')!.textContent).toBe('糖果锦鲤池');
    const c = getDesignCopy('A');
    items().forEach((li, i) => {
      expect(li.querySelector('h3')!.textContent).toBe(c.points[i].heading);
      expect(li.querySelector('p')!.textContent).toBe(c.points[i].text); // 加粗不改字
      expect(li.querySelector('.dn-badge')!.textContent).toBe(String(i + 1));
      expect(li.dataset.id).toBe(c.points[i].id);
    });
    expect(q('design-popup')!.textContent).toContain('没有连消');
  });
  it('打开 B 默认当前玩法;面板内 Tab 切换内容、滚回顶部、aria-selected 同步', () => {
    mk('B'); dp.open();
    expect(q('dp-game')!.textContent).toBe('金鲤满仓'); expect(q('design-popup')!.textContent).toContain('不是累进奖池');
    expect(items().map(e => e.dataset.id)).toEqual(getDesignCopy('B').points.map(x => x.id));
    q('dp-list')!.scrollTop = 123;
    click('dn-tab-A');
    expect(q('dp-game')!.textContent).toBe('糖果锦鲤池'); expect(items()).toHaveLength(5);
    expect(items().map(e => e.dataset.id)).toEqual(getDesignCopy('A').points.map(x => x.id));
    expect(q('dn-tab-A')!.getAttribute('aria-selected')).toBe('true'); expect(q('dn-tab-B')!.getAttribute('aria-selected')).toBe('false');
    expect(q('dp-list')!.scrollTop).toBe(0);
    expect(q('design-popup')!.textContent).toContain('没有连消');
  });
  it('键盘:←/→/Home/End 切 Tab;Esc 关闭;点遮罩不关闭', () => {
    mk('A'); dp.open();
    const tabA = q('dn-tab-A')!; tabA.focus();
    tabA.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); expect(dp.game).toBe('B');
    q('dn-tab-B')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); expect(dp.game).toBe('A');
    q('dn-tab-A')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); expect(dp.game).toBe('B');
    q('dn-mask')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); q('dn-mask')!.click();
    expect(dp.isOpen).toBe(true);
    q('design-popup')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dp.isOpen).toBe(false);
  });
  it('D-08:焦点落到 BODY(点遮罩/标题后)时 Esc 仍能关闭;关闭后解除监听,不拦截其他弹窗的 Esc', () => {
    mk('A'); dp.open();
    q('dn-mask')!.click(); (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dp.isOpen).toBe(false);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
  it('焦点:打开聚焦 ×;面板外 inert;× / 关闭 / 关闭后焦点回入口', () => {
    mk('A'); dp.open();
    expect(document.activeElement).toBe(q('dn-close-x'));
    expect(host.querySelector('#dn-open')!.hasAttribute('inert')).toBe(true);
    click('dn-close'); expect(dp.isOpen).toBe(false);
    expect(host.querySelector('#dn-open')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(host.querySelector('#dn-open'));
    dp.open(); click('dn-close-x'); expect(dp.isOpen).toBe(false);
  });
  it('入口按钮点击打开面板', () => { mk('A'); (host.querySelector('#dn-open') as HTMLElement).click(); expect(dp.isOpen).toBe(true); });
  it('首次提示:1.2s 后出现并写 dn.hint;已写过则不出现', async () => {
    const { vi } = await import('vitest'); vi.useFakeTimers();
    try {
      mk('A'); expect(q('dn-hint')!.classList.contains('show')).toBe(false);
      vi.advanceTimersByTime(1300); expect(q('dn-hint')!.classList.contains('show')).toBe(true); expect(ks.m.get('dn.hint')).toBe('1');
      vi.advanceTimersByTime(5100); expect(q('dn-hint')!.classList.contains('show')).toBe(false);
      document.body.innerHTML = ''; host = document.createElement('div'); document.body.appendChild(host);
      ks = mem(); ks.setItem('dn.hint', '1'); dp = new DesignPanel({ parent: host, url: k => k, store: ks, getGame: () => 'A' });
      vi.advanceTimersByTime(2000); expect(q('dn-hint')!.classList.contains('show')).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('数字高亮:按稿面片段包 <strong>,英文词不误匹配,文字不变', () => {
    const a = getDesignCopy('A').points; const b = getDesignCopy('B').points;
    const strong = (txt: string) => [...highlight(txt).matchAll(/<strong>(.*?)<\/strong>/g)].map(m => m[1]);
    expect(strong(a[0].text)).toEqual(['5x3', '20', 'x1', 'x2', 'x3', 'x5']);
    expect(strong(a[1].text)).toEqual(['95.963%', '96%', '64.98%', '30.98%', '1/153', '2']);
    expect(strong(a[2].text)).toEqual(['75x', '61.5%', '48x', '96.083%', '0.12']);
    expect(strong(a[3].text)).toEqual([]); expect(strong(a[4].text)).toEqual(['5000x', '60']);
    expect(strong(b[0].text)).toEqual(['3', '1/128']); expect(strong(b[4].text)).toEqual(['10000x']);
    expect(strong(b[2].text)).toEqual(['10x', '25x', '100x', '1000x', '5.52%']);
    expect(strong(b[1].text)).toEqual(['96.023%', '96%', '32.98%', '63.05%', '4']); expect(strong(b[3].text)).toEqual(['60x', '136%', '85x', '96.017%', '-0.007']);
    for (const x of [...a, ...b]) expect(highlight(x.text).replace(/<\/?strong>/g, '').replace(/&amp;/g, '&')).toBe(x.text);
  });
  it('菜单里「设计说明」按钮触发 onDesign 并关菜单(忙时也可用)', () => {
    const c = openMenu(false); expect((q('menu-design') as HTMLButtonElement).disabled).toBe(false);
    click('menu-design'); expect(c.design).toBe(1); expect(q('menu-popup')).toBeNull();
  });
  it('文案无旧称', () => { expect(/牌坊|龙门|锦鲤珍珠/.test(JSON.stringify([getDesignCopy('A'), getDesignCopy('B')]))).toBe(false); });
});
