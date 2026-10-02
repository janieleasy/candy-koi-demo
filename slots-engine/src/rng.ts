/**
 * 可复现 RNG:xoshiro128**(128 位状态),种子经 cyrb128 散列。
 * 状态可序列化为 32 位十六进制字符串。int(n) 使用拒绝采样,无取模偏差。
 * 注意:这是「可复现的演示/模拟 RNG」,真钱环境应替换为通过认证的 RNG(见 INTERFACE.md)。
 */
export class Rng {
  private s0 = 0; private s1 = 0; private s2 = 0; private s3 = 0;

  constructor(seed: string | number) { this.seed(seed); }

  seed(seed: string | number): void {
    const str = String(seed);
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    this.s0 = (h1 ^ h2 ^ h3 ^ h4) >>> 0;
    this.s1 = (h2 ^ h1) >>> 0;
    this.s2 = (h3 ^ h1) >>> 0;
    this.s3 = (h4 ^ h1) >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
    for (let i = 0; i < 16; i++) this.u32(); // warm-up
  }

  /** 32 位无符号随机数 */
  u32(): number {
    const s1 = this.s1;
    const x = Math.imul(s1, 5);
    const result = Math.imul((x << 7) | (x >>> 25), 9) >>> 0;
    const t = s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = (this.s3 << 11) | (this.s3 >>> 21);
    return result;
  }

  /** [0, n) 均匀整数(拒绝采样,n 为 1..2^32) */
  int(n: number): number {
    if (n <= 1) return 0;
    const limit = 4294967296 - (4294967296 % n);
    let x = this.u32();
    while (x >= limit) x = this.u32();
    return x % n;
  }

  /** [0,1) 53 位精度浮点 */
  float(): number {
    const a = this.u32() >>> 5;  // 27 bits
    const b = this.u32() >>> 6;  // 26 bits
    return (a * 67108864 + b) / 9007199254740992;
  }

  getState(): string {
    const h = (v: number) => (v >>> 0).toString(16).padStart(8, '0');
    return h(this.s0) + h(this.s1) + h(this.s2) + h(this.s3);
  }

  setState(s: string): void {
    if (!/^[0-9a-f]{32}$/.test(s)) throw new Error('invalid RNG state');
    this.s0 = parseInt(s.slice(0, 8), 16) >>> 0;
    this.s1 = parseInt(s.slice(8, 16), 16) >>> 0;
    this.s2 = parseInt(s.slice(16, 24), 16) >>> 0;
    this.s3 = parseInt(s.slice(24, 32), 16) >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) throw new Error('invalid RNG state (all zero)');
  }
}

/** 累积权重表抽样:返回下标。weights 为正整数。 */
export class WeightedTable {
  readonly cum: number[] = [];
  readonly total: number;
  constructor(weights: number[]) {
    let t = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w <= 0) throw new Error('weights must be positive integers');
      t += w; this.cum.push(t);
    }
    this.total = t;
  }
  pick(rng: Rng): number {
    const r = rng.int(this.total);
    for (let i = 0; i < this.cum.length; i++) if (r < this.cum[i]) return i;
    return this.cum.length - 1;
  }
}
