import type { AppBus, EventName } from './types';

type Fn = (p: any) => void;

/** 极简类型化事件总线;监听器异常不影响其他监听器。 */
export function createBus(): AppBus {
  const map = new Map<EventName, Set<Fn>>();
  const any = new Set<(name: EventName, payload: unknown) => void>();
  return {
    on(name, fn) {
      let set = map.get(name);
      if (!set) map.set(name, (set = new Set()));
      set.add(fn as Fn);
      return () => { set!.delete(fn as Fn); };
    },
    emit(name, payload) {
      for (const fn of [...(map.get(name) ?? [])]) {
        try { fn(payload); } catch (e) { console.error(`[bus] listener for ${name} threw`, e); }
      }
      for (const fn of [...any]) {
        try { fn(name, payload); } catch (e) { console.error('[bus] onAny threw', e); }
      }
    },
    onAny(fn) { any.add(fn); return () => { any.delete(fn); }; },
  };
}
