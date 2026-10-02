// 参考实现(测试用):接口变更前的「整局 play()」原样保留,仅作为逐步引擎的回归基准,不属于对外接口。
import { Rng, WeightedTable } from '../../src/rng.js';
import type { GameBConfig } from '../../src/config.js';
import type {
  Engine, EngineOptions, SpinRequest, SpinResult, Step, BaseSpinStepB, HsEnterStep, HsRespinStep, HsSettleStep,
  Coin, CoinValue, Pos, SymbolIdB,
} from './types_v01.js';
import { buildGrid, evalLines, sumWins, assertBet, applyCap } from '../../src/core.js';

type Tier = 'Mini' | 'Minor' | 'Major' | 'Grand';
const TIERS: Tier[] = ['Mini', 'Minor', 'Major', 'Grand'];

export function validateConfigBLegacy(cfg: GameBConfig): void {
  if (cfg.paylines.length !== 10) throw new Error('B: need 10 paylines');
  for (const b of cfg.betLevels) if (b % 10 !== 0) throw new Error(`B: bet ${b} not divisible by 10`);
  if (cfg.reels.base.length !== 5) throw new Error('B: need 5 strips');
  for (const s of cfg.reels.base) if (s.includes('W' as any) || s.includes('S' as any)) throw new Error('B: no W/S allowed');
  for (const k of Object.keys(cfg.paytable)) {
    const p = cfg.paytable[k];
    if (!(p[0] < p[1] && p[1] < p[2])) throw new Error(`B: paytable ${k} not strictly increasing`);
    for (const v of p) if (!Number.isInteger(v)) throw new Error('B: non-integer pay');
  }
  if (cfg.coin.values.some(v => !Number.isInteger(v) || v <= 0)) throw new Error('B: coin values must be positive integers');
  if (cfg.coin.values.length !== cfg.coin.startWeights.length || cfg.coin.values.length !== cfg.coin.respinWeights.length)
    throw new Error('B: coin weights length mismatch');
  if (cfg.pRespin.length !== 9) throw new Error('B: pRespin must have 9 entries (K=6..14)');
  cfg.pRespin.forEach((p, i) => {
    if (!(p > 0 && p < 1)) throw new Error('B: p out of (0,1)');
    if (i > 0 && p > cfg.pRespin[i - 1] + 1e-15) throw new Error('B: pRespin must be non-increasing');
  });
  if (!(cfg.coin.jackpotProb >= 0 && cfg.coin.jackpotProb < 1)) throw new Error('B: bad jackpotProb');
  for (const t of TIERS) if (!Number.isInteger(cfg.jackpotMult[t])) throw new Error('B: jackpot mult must be integer');
}

export function createLegacyB(cfg: GameBConfig, opts: EngineOptions): Engine {
  validateConfigBLegacy(cfg);
  const rng = new Rng(opts.seed);
  const seedStr = String(opts.seed);
  const startTable = new WeightedTable(cfg.coin.startWeights);
  const respinTable = new WeightedTable(cfg.coin.respinWeights);
  const jpTable = new WeightedTable(TIERS.map(t => cfg.coin.jackpotWeights[t]));

  const mkMult = (pos: Pos, table: WeightedTable): Coin => {
    const v = cfg.coin.values[table.pick(rng)];
    return { ...pos, value: { kind: 'mult', mult: v }, payMult: v };
  };
  const mkRespinCoin = (pos: Pos): Coin => {
    if (cfg.coin.jackpotProb > 0 && rng.float() < cfg.coin.jackpotProb) {
      const tier = TIERS[jpTable.pick(rng)];
      return { ...pos, value: { kind: 'jp', tier } as CoinValue, payMult: cfg.jackpotMult[tier] };
    }
    return mkMult(pos, respinTable);
  };
  const sortCoins = (c: Coin[]) => c.sort((a, b) => a.reel - b.reel || a.row - b.row);

  function play(req: SpinRequest): SpinResult {
    if (req.game !== 'B') throw new Error('engine is game B');
    assertBet(req.bet, cfg.betLevels, 10);
    if (req.mode === 'buy' && !cfg.buy.enabled) throw new Error('buy feature disabled');
    if (req.mode !== 'buy' && req.mode !== 'normal') throw new Error('invalid mode');
    const bet = req.bet, lineBet = bet / 10, maxWin = cfg.maxWinMult * bet;
    const stateBefore = rng.getState();
    const steps: Step[] = [];
    let cum = 0, capped = false, baseWin = 0, featureWin = 0;
    let startCoins: Coin[] | null = null;
    const cost = req.mode === 'buy' ? cfg.buy.priceMult * bet : bet;

    if (req.mode === 'normal') {
      const stops = cfg.reels.base.map(s => rng.int(s.length));
      const grid = buildGrid(cfg.reels.base, stops);
      const coins: Coin[] = [];
      for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) if (grid[r][w] === 'C') coins.push(mkMult({ reel: r, row: w }, startTable));
      const lineWins = evalLines(grid, cfg.paylines, { paytable: cfg.paytable, lineBet });
      const lineTotal = sumWins(lineWins);
      const r = applyCap(0, lineTotal, maxWin);
      cum = r.cum; capped = r.capped; baseWin = r.win;
      const trig = coins.length >= cfg.triggerMin;
      const step: BaseSpinStepB = {
        kind: 'B_base_spin', index: 0, win: r.win, cumulativeWin: cum, capped,
        stops, grid, coins, lineWins, lineTotal, trigger: trig ? { startCoins: coins.length } : null,
      };
      steps.push(step);
      if (trig && !capped) startCoins = coins;
    } else {
      // 购买:startCoins 个随机位置(部分 Fisher-Yates),币值取起始权重,仅倍数币
      const cells: Pos[] = [];
      for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) cells.push({ reel: r, row: w });
      for (let i = 0; i < cfg.buy.startCoins; i++) { const j = i + rng.int(15 - i); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      startCoins = sortCoins(cells.slice(0, cfg.buy.startCoins).map(p => mkMult(p, startTable)));
    }

    let hsFinalK: number | undefined, hsRespins: number | undefined;
    if (startCoins) {
      const locked: Coin[] = startCoins.slice();
      const occupied = new Set(locked.map(c => c.reel * 3 + c.row));
      let R = cfg.respins, respinIdx = 0;
      steps.push({
        kind: 'B_hs_enter', index: steps.length, win: 0, cumulativeWin: cum, capped: false,
        locked: locked.map(c => ({ ...c })), K: locked.length, R,
      } as HsEnterStep);
      while (R > 0 && locked.length < 15) {
        respinIdx++;
        const p = cfg.pRespin[locked.length - cfg.triggerMin];
        const newCoins: Coin[] = [];
        for (let r = 0; r < 5; r++) for (let w = 0; w < 3; w++) {
          if (occupied.has(r * 3 + w)) continue;
          if (rng.float() < p) newCoins.push(mkRespinCoin({ reel: r, row: w }));
        }
        for (const c of newCoins) { occupied.add(c.reel * 3 + c.row); locked.push(c); }
        sortCoins(locked);
        R = newCoins.length > 0 ? cfg.respins : R - 1;
        const ended = R === 0 || locked.length === 15;
        steps.push({
          kind: 'B_hs_respin', index: steps.length, win: 0, cumulativeWin: cum, capped: false,
          respinIndex: respinIdx, newCoins, locked: locked.map(c => ({ ...c })), K: locked.length, R, ended,
        } as HsRespinStep);
      }
      hsFinalK = locked.length; hsRespins = respinIdx;
      // 结算
      const payouts: HsSettleStep['payouts'] = [];
      let raw = 0;
      for (const c of locked) {
        const win = c.payMult * bet; raw += win;
        payouts.push({ pos: { reel: c.reel, row: c.row }, payMult: c.payMult, win, ...(c.value.kind === 'jp' ? { jackpot: c.value.tier } : {}) });
      }
      let fullScreenBonus: HsSettleStep['fullScreenBonus'] = null;
      if (locked.length === 15) {
        fullScreenBonus = { payMult: cfg.fullScreenMult, win: cfg.fullScreenMult * bet };
        raw += fullScreenBonus.win;
      }
      const r = applyCap(cum, raw, maxWin);
      cum = r.cum; capped = r.capped; featureWin = r.win;
      steps.push({
        kind: 'B_hs_settle', index: steps.length, win: r.win, cumulativeWin: cum, capped,
        payouts, fullScreenBonus, rawTotal: raw,
      } as HsSettleStep);
    }

    return {
      game: 'B', mode: req.mode, bet, cost, steps, totalWin: cum, capped, maxWin,
      summary: { baseWin, featureWin, featureTriggered: !!startCoins, hsFinalK, hsRespins },
      rng: { seed: seedStr, stateBefore, stateAfter: rng.getState() },
    };
  }
  return { play, getRngState: () => rng.getState(), setRngState: s => rng.setState(s), config: cfg };
}
