import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { allStrings, setLang, t } from '../src/core/i18n';
import { parseDebug } from '../src/core/debug';
import { ShowcaseRegistry } from '../src/showcase';
import { CFG } from './helpers';
import { getGame, GAME_IDS } from '../src/registry';
import { viewA } from '../src/games/gameA/view';
import { viewB } from '../src/games/gameB/view';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

describe('文案守卫', () => {
  it('界面文案/源码不含「牌坊门」「龙门」,Scatter 对外名为「糖果门」', () => {
    for (const s of allStrings()) expect(s).not.toMatch(/牌坊|龙门/);
    const srcFiles = walk(path.resolve(__dirname, '../src')).filter(f => /\.(ts|css|html)$/.test(f));
    for (const f of srcFiles) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/牌坊|龙门/);
    setLang('zh'); expect(t('hint.A')).toContain('糖果门');
  });
  it('config 里的免责声明字符串也不含旧称', () => {
    expect(CFG.A.buy.disclaimer).not.toMatch(/牌坊|龙门/);
  });
});

describe('调试开关', () => {
  it('非 dev 构建忽略全部参数', () => {
    expect(parseDebug('?game=B&seed=x&force=hs', false)).toMatchObject({ game: null, seed: null, force: null });
  });
  it('dev 下解析 game/seed/force/reset', () => {
    expect(parseDebug('?game=b&seed=abc&force=fs&reset=1', true)).toMatchObject({ game: 'B', seed: 'abc', force: 'fs', reset: true });
    expect(parseDebug('?force=zzz&game=Z', true)).toMatchObject({ game: null, force: null });
  });
});

describe('注册表与展示配置', () => {
  it('registry 收集 A/B,GameModule 字段齐全', () => {
    expect(GAME_IDS.sort()).toEqual(['A', 'B']);
    for (const id of GAME_IDS) {
      const m = getGame(id);
      expect(m.id).toBe(id);
      expect(m.mathConfig.game).toBe(id);
      expect(m.evaluator.engine.game).toBe(id);
      expect(m.view.reel).toMatchObject({ cols: 5, rows: 3, symbolSize: 165, easing: 'backOut' });
      expect(m.view.reel.stopStaggerMs).toBeGreaterThan(0);
      expect(m.view.reel.spinSpeed).toBeGreaterThan(0);
    }
  });
  it('view 的符号覆盖轴带里出现的全部图案(含 B 的 C 币面)', () => {
    const symsOf = (g: 'A' | 'B') => new Set((CFG[g].reels as any).base.flat() as string[]);
    for (const s of symsOf('A')) expect(viewA.symbols[s], `A symbol ${s}`).toBeTruthy();
    for (const s of symsOf('B')) if (s !== 'C') expect(viewB.symbols[s], `B symbol ${s}`).toBeTruthy();
    expect(viewB.coinFrames).toBeTruthy();
  });
  it('showcase 注册表含 default-big 且按需 import;bigWin 档位引用的演出都已注册', () => {
    expect(typeof ShowcaseRegistry['default-big']).toBe('function');
    for (const v of [viewA, viewB]) for (const b of v.bigWin) expect(ShowcaseRegistry[b.showcase]).toBeTruthy();
  });
  it('buy 开关:仅 config.buy.enabled 时显示(两个 config 当前均为 true)', () => {
    expect(CFG.A.buy.enabled && CFG.B.buy.enabled).toBe(true);
  });
});
