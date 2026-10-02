import { describe, it, expect } from 'vitest';
import { ENGINE, CFG, runEngine, makeEnv, findTriggerSeed } from './helpers';
import { Controller } from '../src/engine-bridge/Controller';
import { createBus } from '../src/core/bus';
import { MemoryStore, Wallet, loadEngineState, stateKey, BALANCE_KEY } from '../src/core/storage';
import type { GameId, SpinResult } from '@engine/index';

const strip = (rs: SpinResult[]) => rs.map(r => JSON.stringify({ step: r.step, state: r.state, charge: r.charge, settlement: r.settlement }));

describe('存档恢复', () => {
  for (const game of ['A', 'B'] as const) {
    for (const mode of ['normal', 'buy'] as const) {
      it(`${game}/${mode}: 任意一步后 JSON 序列化再恢复,继续得到相同的步序列`, () => {
        const bet = CFG[game].betLevels[1];
        let checked = 0;
        for (let i = 0; i < (mode === 'buy' ? 12 : 150); i++) {
          const seed = mode === 'buy' ? `rb${i}` : `rn${i}`;
          const full = runEngine(game, seed, bet, mode);
          for (let k = 0; k < full.length - 1; k++) {
            const restored = JSON.parse(JSON.stringify(full[k].state));   // 刷新 = JSON 往返
            const e = ENGINE[game];
            const tail: SpinResult[] = [];
            let r = e.step(restored, { type: 'continue' }); tail.push(r);
            while (!r.settlement) { r = e.step(r.state, { type: 'continue' }); tail.push(r); }
            expect(strip(tail)).toEqual(strip(full.slice(k + 1)));
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(0);
      });
    }
  }

  for (const game of ['A', 'B'] as GameId[]) {
    it(`${game}: Controller 经 localStorage(MemoryStore)往返恢复,resume 后步序列一致、余额只扣一次`, async () => {
      const cfg = CFG[game]; const bet = cfg.betLevels[1];
      const cost = cfg.buy.priceMult * bet;
      const full = runEngine(game, 'ctl1', bet, 'buy');                 // 基准:引擎直跑
      const store = new MemoryStore();
      // 第一次“页面生命周期”:只播放第 1 步(start),然后“刷新”
      {
        const bus = createBus(); const wallet = new Wallet(store);
        const c = new Controller({ game, config: cfg, bus, store, wallet, seed: 'ctl1' });
        c.play = async () => {};
        const out = await c.playRound(bet, 'buy', () => false);          // 播完第 1 步就暂停(返回 null)
        expect(out).toBeNull();
        expect(wallet.balance).toBe(10000 - cost);
        expect(c.inRound).toBe(true);
      }
      // 存档里应该是引擎第 1 步后的状态
      expect(JSON.stringify(loadEngineState(store, game))).toBe(JSON.stringify(full[0].state));
      // 第二次“页面生命周期”:新的 Wallet/Controller,从存档恢复
      const bus = createBus(); const wallet = new Wallet(store);
      const resumed: SpinResult[] = [];
      const c = new Controller({ game, config: cfg, bus, store, wallet, seed: 'otherseed' });
      expect(c.restoredMidRound).toBe(true);
      const charges: number[] = [];
      bus.on('round:start', p => charges.push(p.charge));
      c.play = async r => { resumed.push(r); };
      const settlement = await c.resumeRound();
      expect(charges).toEqual([]);                                       // 不重复扣费
      expect(strip(resumed)).toEqual(strip(full.slice(1)));
      expect(settlement!.totalWin).toBe(full[full.length - 1].settlement!.totalWin);
      expect(wallet.balance).toBe(10000 - cost + settlement!.totalWin);  // 余额 = 初始 - 一次 charge + 赢额
      expect(Number(store.getItem(BALANCE_KEY))).toBe(wallet.balance);
      expect(c.inRound).toBe(false);
      expect(JSON.parse(store.getItem(stateKey(game))!).round).toBeNull();
    });
  }

  it('先存档再播放:play() 被调用时,localStorage 里已经是该步之后的状态', async () => {
    const { A, store } = makeEnv('sv1');
    let seen: string | null = null;
    A.play = async r => { seen = store.getItem(stateKey('A')); expect(seen).toBe(JSON.stringify(r.state)); };
    await A.start(100, 'normal');
    expect(seen).not.toBeNull();
  });

  it('坏档/版本不对:丢弃并新建空闲存档,不抛错', () => {
    const store = new MemoryStore();
    store.setItem(stateKey('A'), '{"v":999,"game":"A"}');
    store.setItem(stateKey('B'), 'not json');
    const env = makeEnv('x', 'y', store);
    expect(env.A.state.round).toBeNull();
    expect(env.B.state.round).toBeNull();
    store.setItem(stateKey('A'), JSON.stringify({ ...env.A.state, round: { game: 'A', next: 'bogus' } }));
    const env2 = makeEnv('x', 'y', store);
    expect(env2.A.state.round).toBeNull();
  });

  it('触发特色玩法的 normal 局(中途存档点在 enter 步之前)也能恢复', async () => {
    const seed = findTriggerSeed('A', 100, 50000);
    const full = runEngine('A', seed, 100, 'normal');
    const store = new MemoryStore();
    const bus = createBus(); const wallet = new Wallet(store);
    const c = new Controller({ game: 'A', config: CFG.A, bus, store, wallet, seed });
    c.play = async () => {};
    await c.playRound(100, 'normal', () => false);                      // 只播第 1 步
    expect(c.state.round!.next).toBe('A_fs_enter');
    const c2 = new Controller({ game: 'A', config: CFG.A, bus: createBus(), store, wallet: new Wallet(store), seed: 'zzz' });
    const kinds: string[] = []; c2.play = async r => { kinds.push(r.step.kind); };
    await c2.resumeRound();
    expect(kinds).toEqual(full.slice(1).map(r => r.step.kind));
  });
});
