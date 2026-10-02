/**
 * 存档:引擎状态(每玩法一键)+ 余额(全局一键)+ 设置(一键)。
 *   slots:v2:<game>     EngineState(原样 JSON)
 *   slots:v2:balance    演示币余额(全局共享,两个玩法同一个钱包)
 *   slots:v2:settings   { sound, turbo, game, bet:{A,B} }
 */
import { PROTOCOL_VERSION, type EngineState, type GameId } from '@engine/index';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

/** 取 localStorage,不可用(隐私模式/被禁用)时退回内存并警告。 */
export function pickStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__slots_probe__';
    ls.setItem(probe, '1'); ls.removeItem(probe);
    return ls;
  } catch {
    console.warn('[storage] localStorage 不可用,退回内存存档(刷新后丢失)');
    return new MemoryStore();
  }
}

export const stateKey = (game: GameId) => `slots:v2:${game}`;
export const BALANCE_KEY = 'slots:v2:balance';
export const SETTINGS_KEY = 'slots:v2:settings';
export const DEFAULT_BALANCE = 10000;

export function saveEngineState(store: KeyValueStore, state: EngineState): void {
  store.setItem(stateKey(state.game), JSON.stringify(state));
}
export function clearEngineState(store: KeyValueStore, game: GameId): void {
  store.removeItem(stateKey(game));
}
/** 读存档;结构/版本不对返回 null(调用方新建)。真正的合法性由引擎 assertState 在下一次 step 时校验。 */
export function loadEngineState(store: KeyValueStore, game: GameId): EngineState | null {
  const raw = store.getItem(stateKey(game));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as EngineState;
    if (!s || s.v !== PROTOCOL_VERSION || s.game !== game || typeof s.rng !== 'string') return null;
    return s;
  } catch { return null; }
}

/** 演示币钱包:每次变化立即落盘。 */
export class Wallet {
  private _balance: number;
  /** 界面显示用余额:charge 立即扣,win 在局终动画后才加(与已持久化的 balance 分开) */
  display: number;
  constructor(private store: KeyValueStore, private initial = DEFAULT_BALANCE) {
    const raw = store.getItem(BALANCE_KEY);
    const n = raw === null ? NaN : Number(raw);
    this._balance = Number.isInteger(n) && n >= 0 ? n : initial;
    if (raw === null || !(Number.isInteger(n) && n >= 0)) this.persist();
    this.display = this._balance;
  }
  get balance() { return this._balance; }
  set(n: number) {
    if (!Number.isInteger(n) || n < 0) throw new Error(`invalid balance ${n}`);
    this._balance = n; this.persist();
  }
  reset() { this.set(this.initial); this.display = this._balance; }
  get defaultBalance() { return this.initial; }
  private persist() { try { this.store.setItem(BALANCE_KEY, String(this._balance)); } catch { /* ignore */ } }
}

export interface Settings {
  sound: boolean;     // 默认 false(静音)
  turbo: boolean;
  game: GameId;
  bet: Partial<Record<GameId, number>>;
}
export function loadSettings(store: KeyValueStore): Settings {
  const def: Settings = { sound: false, turbo: false, game: 'A', bet: {} };
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: !!s.sound, turbo: !!s.turbo,
      game: s.game === 'B' ? 'B' : 'A',
      bet: s.bet && typeof s.bet === 'object' ? s.bet : {},
    };
  } catch { return def; }
}
export function saveSettings(store: KeyValueStore, s: Settings) {
  try { store.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
