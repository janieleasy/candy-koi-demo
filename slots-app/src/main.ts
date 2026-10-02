import './ui/style.css';
import { createBus } from './core/bus';
import { loadFonts } from './core/fonts';
import { setLang } from './core/i18n';
import { NO_DEBUG, parseDebug, randomSeed, stripParams } from './core/debug';
import { pickStore, Wallet, loadSettings, saveSettings, clearEngineState, BALANCE_KEY, SETTINGS_KEY } from './core/storage';
import { Controller } from './engine-bridge/Controller';
import { getGame } from './registry';
import { TextureStore } from './render/textures';
import { Stage } from './render/Stage';
import { Shell } from './ui/Shell';
import { H, W } from './render/layout';
import type { GameId } from '@engine/index';
import { schedulePrefetch } from './showcase/prefetch';
import { setShowcaseOptions } from './showcase/config';

async function boot() {
  const app = document.getElementById('app')!;
  const stageHost = document.getElementById('stage')!;
  const loading = document.createElement('div'); loading.id = 'loading'; loading.textContent = 'Loading…'; stageHost.appendChild(loading);

  // 构建期守卫:prod 构建里条件恒为 false,parseDebug / __slots / 演示代码整块被剔除
  const dbg = (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === '1') ? parseDebug(location.search) : NO_DEBUG;
  if (dbg.lang) setLang(dbg.lang);
  const store = pickStore();
  if (dbg.reset) { for (const k of ['A', 'B'] as GameId[]) clearEngineState(store, k); store.removeItem(BALANCE_KEY); store.removeItem(SETTINGS_KEY); store.removeItem('dn.hint'); stripParams('reset'); }

  const bus = createBus();
  const wallet = new Wallet(store);
  const settings = loadSettings(store);

  // 布局:短边等比缩放居中
  let stage: Stage | null = null;
  const fit = () => {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stageHost.style.transform = `translate(${-W * s / 2}px, ${-H * s / 2}px) scale(${s})`;
    stageHost.style.setProperty('--s', String(s)); // CSS 用:max(逻辑字号, 最小px / --s) 保证手机上文字不小于最小像素(D-02)
    stage?.setScale(s);
  };
  window.addEventListener('resize', fit); fit();

  await loadFonts();
  const textures = await TextureStore.load('assets/');
  // CSS 变量里的相对 URL 会按样式表位置解析(dist/assets/…),所以这里转成绝对 URL
  app.style.setProperty('--bgimg', `url(${new URL(textures.url('background-base'), document.baseURI).href})`);

  // 起始玩法:force 隐含玩法 > 存档里有未完成局的玩法 > ?game > 上次选择
  const forced = dbg.force;
  const seed = dbg.seed ?? randomSeed();
  const forcedGame: GameId | null = forced === 'fs' ? 'A' : forced === 'hs' ? 'B' : null;

  // 每个玩法一个 Controller:各自 EngineState / 各自存档键 slots:v2:<game>
  const controllers = {} as Record<GameId, Controller>;
  for (const g of ['A', 'B'] as GameId[]) {
    const m = getGame(g);
    let initialState = undefined;
    if ((import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === '1') && forced && g === forcedGame) {
      const bet = settings.bet[g] ?? m.mathConfig.betLevels[Math.min(2, m.mathConfig.betLevels.length - 1)];
      const { buildForcedState } = await import('./engine-bridge/force'); // 仅 dev / debug 构建;prod 整块剔除
      initialState = buildForcedState(forced, m.mathConfig, m.evaluator.engine, `${seed}`, bet);
      if (wallet.balance >= bet) wallet.set(wallet.balance - bet); // 视为已支付 charge
      wallet.display = wallet.balance;
    }
    controllers[g] = new Controller({ game: g, config: m.mathConfig, engine: m.evaluator.engine, bus, store, wallet, seed: `${seed}${g === 'A' ? '' : ':B'}`, initialState });
  }
  if (forced) stripParams('force'); // 一次性:刷新后走存档恢复
  const pending = (['A', 'B'] as GameId[]).find(g => controllers[g].inRound);
  const startGame: GameId = forcedGame ?? pending ?? dbg.game ?? settings.game;
  await textures.loadBackground(`logo-${startGame}`); // 首包只含当前玩法的 logo,另一张空闲时预取
  stage = await Stage.create(stageHost, textures, getGame(startGame).view);
  fit();

  const shell = new Shell({ bus, store, wallet, settings, controllers, textures, stage, uiHost: stageHost, stageHost, startGame });
  loading.remove();
  if ((import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === '1') && dbg.enabled) {
    (window as unknown as Record<string, unknown>).__slots = {
      shell, bus, controllers, wallet, snapshot: () => shell.debugSnapshot(),
      events: (() => { const log: { n: string; p: unknown }[] = []; bus.onAny((n, p) => { log.push({ n, p }); if (log.length > 500) log.shift(); }); return log; })(),
    };
  }
  saveSettings(store, settings);
  await shell.activate(startGame, true);
  document.documentElement.dataset.ready = '1';
  // 大赢演出:预热 three 块(空闲时只下载不执行;省流量/低端/无 WebGL/dev 不预取)
  schedulePrefetch();
  // 仅 dev / debug 构建:演示触发器 window.__slots.playBigWin + ?force=big|mega|epic|max|bigwin + ?quality=
  if (dbg.enabled && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG === '1')) {
    setShowcaseOptions({ debug: true, forcedQuality: dbg.quality });
    void import('./debug/bigwinDemo').then(m => m.installBigWinDemo(shell, dbg.demo));
    if (dbg.demo) stripParams('force');
  }
}

boot().catch(e => {
  console.error(e);
  const f = document.createElement('div'); f.id = 'fatal'; f.style.display = 'block'; f.textContent = `启动失败:${(e as Error)?.message ?? e}`;
  document.getElementById('stage')?.appendChild(f);
});
