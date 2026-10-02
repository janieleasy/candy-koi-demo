/** 表现层(presenter)可调用的 DOM 外壳能力;DOM 实现见 Banner / Toast。 */
export type BannerKind = 'fs' | 'hs' | 'info' | 'end';
export interface BannerOpts {
  title: string;
  sub?: string;
  kind: BannerKind;
  ms: number;
  signal?: AbortSignal;
}
export interface UiApi {
  banner(o: BannerOpts): Promise<void>;
  toast(msg: string, ms?: number): void;
}
