import type { Quality } from './quality';
/** 演出运行时选项(主包内的极小模块;three 块也从这里读)。debug 参数只在 dev / debug 构建里被写入。 */
export const showcaseOptions: { forcedQuality: Quality | null; debug: boolean } = { forcedQuality: null, debug: false };
export function setShowcaseOptions(o: Partial<typeof showcaseOptions>) { Object.assign(showcaseOptions, o); }
