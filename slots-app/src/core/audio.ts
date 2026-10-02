import type { AppBus, EventName } from './types';

/**
 * 音频:接口在、资源可空。默认静音;未配置资源或播放失败一律静默忽略(不报错)。
 * 资源映射来自 GameViewConfig.audio:{ spin: 'assets/audio/spin.mp3', ... }。
 */
export class AudioManager {
  private muted = true;
  private urls: Record<string, string> = {};
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer | null>();

  setSources(urls: Record<string, string> | undefined) { this.urls = urls ?? {}; this.buffers.clear(); }
  get isMuted() { return this.muted; }
  setMuted(m: boolean) {
    this.muted = m;
    if (!m) this.ensureCtx(); // 必须在用户手势内调用(点击声音按钮)
  }
  private ensureCtx() {
    try {
      if (!this.ctx) {
        const AC = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      void this.ctx?.resume();
    } catch { /* ignore */ }
  }
  /** 播放命名音效;无资源则 no-op */
  async play(name: string): Promise<void> {
    if (this.muted) return;
    const url = this.urls[name];
    if (!url || !this.ctx) return;
    try {
      let buf = this.buffers.get(name);
      if (buf === undefined) {
        this.buffers.set(name, null);
        const res = await fetch(url);
        if (!res.ok) return;
        buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
      }
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.connect(this.ctx.destination); src.start();
    } catch { /* 资源缺失/解码失败:静默 */ }
  }
  /** 把总线事件映射到音效名 */
  attach(bus: AppBus): void {
    const map: Partial<Record<EventName, string>> = {
      'spin:begin': 'spin', 'reel:stop': 'reelStop', 'win:present': 'win', 'coin:lock': 'coinLock',
      'coin:fly': 'coinFly', 'feature:enter': 'featureEnter', 'bigwin:start': 'bigwin', 'round:end': 'roundEnd',
    };
    bus.onAny(name => { const s = map[name]; if (s) void this.play(s); });
  }
}
