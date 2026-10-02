import { describe, it, expect } from 'vitest';
import { makeEnv, CFG, runEngine } from './helpers';
import { createFsm } from '../src/core/fsm';
import { createBus } from '../src/core/bus';
import { createEngine } from '@engine/index';
import { Controller, InsufficientFunds } from '../src/engine-bridge/Controller';
import { MemoryStore, Wallet } from '../src/core/storage';

describe('事件顺序', () => {
  it('buy 局:round:start → balance:change(charge) → (step:begin → step:end)* → round:end;round:end 之前没有入账', async () => {
    const env = makeEnv();
    const { A, events, wallet } = env;
    const bet = 100; const cost = 48 * bet;
    const out = await A.playRound(bet, 'buy');
    const names = events.map(e => e.n);
    expect(names[0]).toBe('round:start');
    expect(events[0].p.charge).toBe(cost);
    expect(names[1]).toBe('balance:change');
    expect(events[1].p).toMatchObject({ reason: 'charge', delta: -cost });
    // step:begin/step:end 严格交替
    const steps = names.filter(n => n === 'step:begin' || n === 'step:end');
    steps.forEach((n, i) => expect(n).toBe(i % 2 === 0 ? 'step:begin' : 'step:end'));
    expect(names[names.length - 1]).toBe('round:end');
    expect(names.indexOf('round:end')).toBeGreaterThan(names.lastIndexOf('step:end') - 1);
    // 局中显示余额 = 初始 - charge(赢额还没显示),入账由壳子在动画/大赢之后 commitDisplayBalance
    expect(wallet.display).toBe(10000 - cost);
    expect(wallet.balance).toBe(10000 - cost + out!.totalWin);
    A.commitDisplayBalance();
    expect(wallet.display).toBe(wallet.balance);
  });

  it('局中 step:begin 的 cumulativeWin 单调不减;settlement.totalWin 等于最后一步累计', async () => {
    const env = makeEnv('mono');
    let last = 0;
    env.bus.on('step:begin', ({ step }) => { expect(step.cumulativeWin).toBeGreaterThanOrEqual(last); last = step.cumulativeWin; });
    const s = await env.B.playRound(50, 'buy');
    expect(s!.totalWin).toBe(last);
  });

  it('play 抛错也会发 step:end,错误向上抛、状态仍已存档', async () => {
    const env = makeEnv();
    env.A.play = async () => { throw new Error('boom'); };
    await expect(env.A.start(100, 'normal')).rejects.toThrow('boom');
    expect(env.events.map(e => e.n)).toContain('step:end');
    expect(env.A.busy).toBe(false);
  });

  it('余额不足:不调用引擎、不改状态,抛 InsufficientFunds', async () => {
    const store = new MemoryStore(); store.setItem('slots:v2:balance', '30');
    const env = makeEnv('a', 'b', store);
    await expect(env.A.start(100, 'normal')).rejects.toBeInstanceOf(InsufficientFunds);
    expect(env.A.state.round).toBeNull();
    expect(env.wallet.balance).toBe(30);
  });

  it('购买价读 config:把 priceMult 改成 99,charge 随之变化(没有写死 48/75)', async () => {
    const cfg = { ...CFG.A, buy: { ...(CFG.A as any).buy, priceMult: 99 } } as any;
    const store = new MemoryStore(); const bus = createBus(); const wallet = new Wallet(store, 100000);
    const c = new Controller({ game: 'A', config: cfg, engine: createEngine(cfg), bus, store, wallet, seed: 's' });
    c.play = async () => {};
    expect(c.buyCost(200)).toBe(99 * 200);
    await c.start(200, 'buy');
    expect(wallet.balance).toBe(100000 - 99 * 200);
  });
});

describe('界面状态机', () => {
  it('合法路径 Idle→Spinning→Presenting→Presenting→Settling→Idle;购买局可 Idle→Presenting', () => {
    const f = createFsm();
    f.to('Spinning', 'A_base_spin'); f.to('Presenting', 'A_base_spin'); f.to('Spinning', 'A_fs_spin'); f.to('Presenting', 'A_fs_spin');
    f.to('Presenting', 'A_fs_spin'); f.to('Settling'); f.to('Idle');
    expect(f.state).toBe('Idle');
    f.to('Presenting', 'A_fs_enter');
    expect(f.state).toBe('Presenting');
  });
  it('非法跳转抛错;特色玩法期间不会回到 Idle(Presenting 不能直接到 Idle)', () => {
    const f = createFsm();
    expect(() => f.to('Settling')).toThrow();
    f.to('Spinning'); f.to('Presenting');
    expect(() => f.to('Idle')).toThrow();
  });
});

describe('引擎直驱对照', () => {
  it('Controller.playRound 播放出的 step 序列 = 引擎直跑序列(动画与结果解耦)', async () => {
    const env = makeEnv('cmp');
    await env.B.playRound(50, 'buy');
    const direct = runEngine('B', 'tB'.replace('tB', 'tB'), 50, 'buy');
    expect(env.played.map(s => s.kind)).toEqual(direct.map(r => r.step.kind));
  });
});
