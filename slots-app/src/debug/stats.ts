/** 仅 debug:three 块的资源创建/释放计数(同一份对象,由 three 块在加载后写入)。three 块未加载时为空计数。 */
import { stats } from '../showcase/candy/tracker';
export const showcaseStats = stats;
