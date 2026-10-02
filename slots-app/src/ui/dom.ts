export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
export function place(e: HTMLElement, x: number, y: number, w: number, h: number) {
  e.style.left = `${x - w / 2}px`; e.style.top = `${y - h / 2}px`; e.style.width = `${w}px`; e.style.height = `${h}px`;
}

export interface ImgBtnOpts {
  x: number; y: number; w: number; h: number;     // 中心 + 尺寸(逻辑像素)
  states: Record<string, string>;                  // 状态名 → 图片 URL
  initial: string;
  pressed?: string;                                // pointerdown 时临时切换的状态名
  label: string;                                   // aria-label
  onClick: () => void;
  testId?: string;
}

/** 图片按钮:同一个 <img> 换 src 表示状态(normal/pressed/disabled/on/off/stop),不使用 tint。 */
export class ImgBtn {
  readonly el: HTMLButtonElement;
  private img: HTMLImageElement;
  private state: string;
  private enabled = true;
  private holding = false;
  constructor(parent: HTMLElement, private o: ImgBtnOpts) {
    this.el = el('button', 'ibtn', parent);
    place(this.el, o.x, o.y, o.w, o.h);
    this.el.setAttribute('aria-label', o.label);
    if (o.testId) this.el.dataset.testid = o.testId;
    this.img = el('img', '', this.el);
    this.img.alt = o.label; this.img.draggable = false;
    // 其余状态延后到空闲时预载(避免换态闪烁,又不占首屏带宽)
    const preload = () => { for (const u of Object.values(o.states)) { const p = new Image(); p.src = u; } };
    if (document.readyState === 'complete') setTimeout(preload, 1200); else window.addEventListener('load', () => setTimeout(preload, 1200), { once: true });
    this.state = o.initial;
    this.render();
    this.el.addEventListener('pointerdown', () => { if (this.enabled && o.pressed) { this.holding = true; this.render(); } });
    const up = () => { if (this.holding) { this.holding = false; this.render(); } };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointerleave', up);
    this.el.addEventListener('pointercancel', up);
    this.el.addEventListener('click', ev => { ev.preventDefault(); if (this.enabled) o.onClick(); });
  }
  private render() {
    const key = !this.enabled && this.o.states.disabled ? 'disabled' : this.holding && this.o.pressed ? this.o.pressed : this.state;
    this.img.src = this.o.states[key];
    this.el.classList.toggle('disabled', !this.enabled);
    this.el.dataset.state = this.enabled ? this.state : `${this.state}:disabled`;
  }
  /** 设置当前状态(不含 disabled;disabled 由 setEnabled 控制) */
  setState(s: string) { if (this.state !== s) { this.state = s; this.render(); } }
  setEnabled(on: boolean) { this.enabled = on; this.render(); }
  get isEnabled() { return this.enabled; }
}
