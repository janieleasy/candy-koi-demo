import copy from './demo_panel_copy.json';
import type { GameId } from '@engine/index';

/** 设计说明面板文案(构建时静态数据,来源见 README「设计说明面板」)。文案原样展示,不在代码里改写。 */
export interface DesignPoint { id: string; heading: string; text: string }
export interface DesignCopy { title: string; panelTitle: string; points: DesignPoint[] }

export const DESIGN_COPY_VERSION: string = copy.version;
export function getDesignCopy(game: GameId): DesignCopy {
  const g = (copy.games as Record<string, DesignCopy>)[game];
  return { title: g.title, panelTitle: g.panelTitle, points: g.points.map(p => ({ ...p })) };
}
