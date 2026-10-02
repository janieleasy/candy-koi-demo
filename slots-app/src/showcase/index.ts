import type { ShowcaseRegistry as ShowcaseRegistryType, ShowcasePlugin, ShowcaseContext } from '@spec/client';
import { createGuardedPlugin } from './guard';

/**
 * 大赢演出注册表(SCAFFOLD §4 / client.ts ShowcaseRegistry)。
 *   - candy-big / candy-mega / candy-epic / candy-max:糖果甜心主题 three.js 演出(同一份代码,按档位出不同强度)。
 *     注册表里放的是主包内的极小"守卫插件"(guard.ts),three 本体在 ./candy,首次需要时才被动态 import,
 *     失败/无 WebGL 自动回退到 default-big。
 *   - default-big:Canvas2D 占位,同时作为回退实现。
 * 新增演出 = 在这里加一行。
 */
export const ShowcaseRegistry: ShowcaseRegistryType = {
  'default-big': () => import('./default-big'),
  'candy-big': async () => ({ default: createGuardedPlugin('candy-big') }),
  'candy-mega': async () => ({ default: createGuardedPlugin('candy-mega') }),
  'candy-epic': async () => ({ default: createGuardedPlugin('candy-epic') }),
  'candy-max': async () => ({ default: createGuardedPlugin('candy-max') }),
};

const loaded = new Map<string, ShowcasePlugin>();

/** 懒加载并(首次)调用 load();未注册的 id 返回 null(壳子跳过演出,不报错)。 */
export async function loadShowcase(id: string): Promise<ShowcasePlugin | null> {
  const hit = loaded.get(id);
  if (hit) return hit;
  const loader = ShowcaseRegistry[id];
  if (!loader) { console.warn(`[showcase] 未注册的演出 ${id}`); return null; }
  const mod = await loader();
  await mod.default.load();
  loaded.set(id, mod.default);
  return mod.default;
}
export type { ShowcaseContext };
