import type { GameAConfig, GameBConfig } from './config.js';
import { createEngineA } from './engineA.js';
import { createEngineB } from './engineB.js';
import type { EngineEx } from './engineCommon.js';

export * from './types.js';
export * from './config.js';
export { Rng } from './rng.js';
export { createEngineA, createEngineB };
export type { EngineEx, RoundResult } from './engineCommon.js';

/** createEngine(config) —— 不再收 seed;seed 走 engine.createState(seed)。 */
export function createEngine(config: GameAConfig | GameBConfig): EngineEx {
  return config.game === 'A' ? createEngineA(config) : createEngineB(config);
}
