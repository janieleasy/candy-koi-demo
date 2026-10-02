import { el } from './dom';
import { sleep } from '../core/utils';
import type { BannerOpts, UiApi } from './UiApi';

/** 过场横幅与轻提示(DOM)。banner 不拦截指针,点击仍作用于 SPIN/跳过。 */
export class BannerLayer implements UiApi {
  private layer: HTMLElement;
  private toasts: HTMLElement;
  constructor(parent: HTMLElement) {
    this.layer = el('div', '', parent); this.layer.id = 'banner-layer';
    this.toasts = el('div', '', parent); this.toasts.id = 'toast-layer';
  }
  async banner(o: BannerOpts): Promise<void> {
    const b = el('div', `banner ${o.kind}`, this.layer);
    b.dataset.testid = 'banner';
    el('div', 't', b, o.title);
    if (o.sub) el('div', 's', b, o.sub);
    await sleep(o.ms, o.signal);
    b.classList.add('out');
    await sleep(o.signal?.aborted ? 0 : 260);
    b.remove();
  }
  toast(msg: string, ms = 2200): void {
    const t = el('div', 'toast', this.toasts, msg);
    t.style.animationDuration = `${ms}ms`;
    setTimeout(() => t.remove(), ms + 100);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
  }
  clear() { this.layer.replaceChildren(); }
}
