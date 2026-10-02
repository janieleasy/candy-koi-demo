/** three 块抛出后,守卫插件(guard.ts)据此在新 canvas 上回退到 default-big */
export class ShowcaseFallback extends Error {
  constructor(public reason: string) { super(`showcase fallback: ${reason}`); this.name = 'ShowcaseFallback'; }
}
