/**
 * 界面层状态机:Idle → Spinning → Presenting(step) → [Spinning/Presenting 下一步…] → Settling → Idle
 * 特色玩法期间不回 Idle(Presenting 可直接进入下一步的 Spinning/Presenting)。
 */
export type UiState = 'Idle' | 'Spinning' | 'Presenting' | 'Settling';

const ALLOWED: Record<UiState, UiState[]> = {
  Idle: ['Spinning', 'Presenting'],              // 购买局第一步(过场步)无转轴,直接 Presenting
  Spinning: ['Presenting'],
  Presenting: ['Spinning', 'Presenting', 'Settling'],
  Settling: ['Idle'],
};

export interface UiFsm {
  readonly state: UiState;
  /** 当前正在播放的 step.kind(Idle/Settling 时为 null) */
  readonly stepKind: string | null;
  readonly history: readonly string[];
  to(next: UiState, stepKind?: string | null): void;
  /** 异常恢复:无条件回 Idle */
  forceIdle(): void;
  onChange(fn: (s: UiState, prev: UiState) => void): () => void;
}

export function createFsm(): UiFsm {
  let state: UiState = 'Idle';
  let stepKind: string | null = null;
  const history: string[] = ['Idle'];
  const listeners = new Set<(s: UiState, prev: UiState) => void>();
  const set = (next: UiState, kind: string | null) => {
    const prev = state;
    state = next; stepKind = kind;
    history.push(kind ? `${next}(${kind})` : next);
    if (history.length > 200) history.shift();
    for (const fn of [...listeners]) fn(next, prev);
  };
  return {
    get state() { return state; },
    get stepKind() { return stepKind; },
    history,
    to(next, kind = null) {
      if (!ALLOWED[state].includes(next)) throw new Error(`illegal UI transition ${state} → ${next}`);
      set(next, kind);
    },
    forceIdle() { if (state !== 'Idle') set('Idle', null); },
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
