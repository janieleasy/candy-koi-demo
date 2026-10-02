/** 资源跟踪:每个 Session 创建的 renderer / geometry / material / texture / render target 都登记在此,dispose 时逐个释放并计数。 */
export interface Disposable { dispose(): void }
export type ResKind = 'renderer' | 'geometry' | 'material' | 'texture' | 'target';
export interface ShowcaseStats {
  sessions: number; disposedSessions: number;
  created: Record<ResKind, number>; disposed: Record<ResKind, number>;
  canvasesLive: number;
  lastInfo: { geometries: number; textures: number; programs: number } | null;
  lastDispose: number | null;
  t0: number;               // 当前演出时钟起点(performance.now);debug 截图按演出时间取点用
  shown: number;            // 最近一次壳子回传的滚动数字(skip 验证用)
}
export const stats: ShowcaseStats = {
  sessions: 0, disposedSessions: 0,
  created: { renderer: 0, geometry: 0, material: 0, texture: 0, target: 0 },
  disposed: { renderer: 0, geometry: 0, material: 0, texture: 0, target: 0 },
  canvasesLive: 0, lastInfo: null, lastDispose: null, t0: 0, shown: 0,
};
export class Tracker {
  private items: { kind: ResKind; obj: Disposable; done: boolean }[] = [];
  add<T extends Disposable>(kind: ResKind, obj: T): T { this.items.push({ kind, obj, done: false }); stats.created[kind]++; return obj; }
  release(obj: Disposable) { const it = this.items.find(i => i.obj === obj); if (it && !it.done) { it.done = true; try { obj.dispose(); } catch { /* ignore */ } stats.disposed[it.kind]++; } }
  /** 除 renderer 外全部释放(renderer 最后由 Session 处理) */
  disposeAll(except?: Disposable) {
    for (const it of this.items) if (!it.done && it.obj !== except) { it.done = true; try { it.obj.dispose(); } catch { /* ignore */ } stats.disposed[it.kind]++; }
  }
}
