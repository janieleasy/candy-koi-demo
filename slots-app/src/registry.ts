import type { GameId } from '@engine/index';
import type { AppGameModule } from './core/types';
import gameA from './games/gameA';
import gameB from './games/gameB';

/** 注册表:新增玩法 = games/<id>/ 新目录 + 这里加一行。 */
const modules: Record<GameId, AppGameModule> = {
  A: gameA as AppGameModule,
  B: gameB as AppGameModule,
};
export const GAME_IDS = Object.keys(modules) as GameId[];
export function getGame(id: GameId): AppGameModule {
  const m = modules[id];
  if (!m) throw new Error(`unknown game ${id}`);
  return m;
}
export function allGames(): AppGameModule[] { return GAME_IDS.map(getGame); }
