import { describe, it, expect } from 'vitest';
import { makeEnv, CFG } from './helpers';
import { MemoryStore, stateKey, loadEngineState } from '../src/core/storage';
import { buildForcedState } from '../src/engine-bridge/force';
import { ENGINE } from './helpers';
import { Controller } from '../src/engine-bridge/Controller';
import { createBus } from '../src/core/bus';
import { Wallet } from '../src/core/storage';

describe('两个玩法状态独立', () => {
  it('各自存档键 slots:v2:A / slots:v2:B;A 局中推进不影响 B,反之亦然', async () => {
    const env = makeEnv('indA', 'indB');
    const { A, B, store } = env;
    // A 开 buy 局并只播第 1 步(局中)
    await A.playRound(100, 'buy', () => false);
    expect(A.inRound).toBe(true);
    const aSnap = JSON.stringify(A.state);
    expect(store.getItem(stateKey('A'))).toBe(aSnap);
    // “切到 B”:B 完整打一局(含 buy)
    const bBefore = JSON.stringify(B.state);
    expect(bBefore).not.toBe(aSnap);
    await B.playRound(50, 'buy');
    expect(B.inRound).toBe(false);
    expect(JSON.stringify(A.state)).toBe(aSnap);                        // A 没被串、没丢
    expect(store.getItem(stateKey('A'))).toBe(aSnap);
    expect(loadEngineState(store, 'B')!.game).toBe('B');
    expect(JSON.parse(store.getItem(stateKey('B'))!).roundSeq).toBe(1);
    // “切回 A”:从存档继续这一局
    const s = await A.resumeRound();
    expect(s!.game).toBe('A');
    expect(A.inRound).toBe(false);
    expect(JSON.parse(store.getItem(stateKey('B'))!).roundSeq).toBe(1); // B 仍是 1 局
  });

  it('两玩法共用一个钱包(全局余额键),各自 RNG 状态不同', async () => {
    const env = makeEnv('r1', 'r2');
    expect(env.A.state.rng).not.toBe(env.B.state.rng);
    const w0 = env.wallet.balance;
    await env.A.playRound(100, 'normal');
    const afterA = env.wallet.balance;
    await env.B.playRound(50, 'normal');
    expect(env.wallet.balance - afterA).toBeLessThanOrEqual(CFG.B.maxWinMult * 50 - 50);
    expect(afterA).not.toBe(w0 + 1e9);
    expect(env.store.getItem('slots:v2:balance')).toBe(String(env.wallet.balance));
  });
});

describe('?force 构造存档(不改引擎)', () => {
  it('force=fs:A 从 A_fs_enter 起,引擎接受并跑到结算', async () => {
    const st = buildForcedState('fs', CFG.A, ENGINE.A, 'f1', 100);
    expect(st.round!.next).toBe('A_fs_enter');
    const store = new MemoryStore(); const wallet = new Wallet(store);
    const c = new Controller({ game: 'A', config: CFG.A, bus: createBus(), store, wallet, seed: 'x', initialState: st });
    const kinds: string[] = []; c.play = async r => { kinds.push(r.step.kind); };
    const s = await c.resumeRound();
    expect(kinds[0]).toBe('A_fs_enter');
    expect(kinds.slice(1).every(k => k === 'A_fs_spin')).toBe(true);
    expect(kinds.length).toBeGreaterThanOrEqual(1 + 8);
    expect(s!.featureTriggered).toBe(true);
    expect(wallet.balance).toBe(10000 + s!.totalWin);                    // charge 由调用方(main.ts)预先扣除
  });
  it('force=hs:B 从 B_hs_enter 起,6 个起始币,引擎接受并跑到 B_hs_settle', async () => {
    const st = buildForcedState('hs', CFG.B, ENGINE.B, 'f2', 50);
    expect((st.round as any).hs.locked).toHaveLength(6);
    const c = new Controller({ game: 'B', config: CFG.B, bus: createBus(), store: new MemoryStore(), wallet: new Wallet(new MemoryStore()), seed: 'x', initialState: st });
    const kinds: string[] = []; c.play = async r => { kinds.push(r.step.kind); };
    await c.resumeRound();
    expect(kinds[0]).toBe('B_hs_enter');
    expect(kinds[kinds.length - 1]).toBe('B_hs_settle');
  });
});
