# slots-engine 接口说明(协议 v2,逐步推进)

对外类型唯一来源:`src/types.ts`(= `/workspace/slots-spec/protocol.ts` 的拷贝,**未做字段改动**,保持同一份)。
引擎零运行时依赖,纯 TS,浏览器/Node 20 均可。

## 1. 入口与最小调用

```ts
import { createEngine } from './src/index';          // Vite 中见 §8
import { configA } from './config/gameA';

const engine = createEngine(configA);                 // 不再收 seed
let state = engine.createState('my-seed');            // 空闲存档(JSON 安全)

// 逐步:每次请求只推进一步
let r = engine.step(state, { type: 'start', game: 'A', bet: 100, mode: 'normal' }); // 第 1 步;r.charge = 扣费
save(r.state);                                        // 先存档,再播放动画
while (!r.settlement) {
  r = engine.step(r.state, { type: 'continue' });     // 按 r.state.round.next 推进
  save(r.state);
}
// r.settlement.totalWin 在此入账;r.state.round === null(空闲)

// 整局循环(sim/测试用):内部就是循环调用同一个 step 核心
const whole = engine.playRound(state, { type: 'start', game: 'A', bet: 100, mode: 'buy' });
// whole.steps: Step[](含 A_fs_enter 过场步) / whole.settlement / whole.charge / whole.state
```

- `step(state, req)` 是纯函数:不改入参(内部 `structuredClone` 局内状态);同 `(state, req)` 恒得同结果;失败的请求不产生任何副作用。
- 每次 step 从 `state.rng` 恢复 RNG,结束后把新 RNG 状态写回 `result.state.rng`。
- 钱:`charge` 只在 start 那一步非零;`settlement.totalWin` 只在整局最后一步(`step.roundEnded === true`)非空,此时一次性入账。
- 上限:触顶的那一步 `capped=true && roundEnded=true`;剩余次数作废。
- 断线恢复:`localStorage` 里存的 `EngineState`;读回后若 `state.round !== null` 就继续 `continue`,为空则空闲。

## 2. 请求与错误码

| 请求 | 合法时机 |
|---|---|
| `{type:'start', game, bet, mode:'normal'\|'buy'}` | `state.round === null` |
| `{type:'continue'}` | `state.round !== null` |

非法请求抛 `EngineError`(`err.code`):`WRONG_GAME`(game 与引擎/存档不符)、`INVALID_BET`(不在 `betLevels` / 非整数 / 不整除)、`BUY_DISABLED`、`INVALID_MODE`、`ROUND_IN_PROGRESS`(局中 start)、`NO_ACTIVE_ROUND`(空闲 continue)、`BAD_STATE`(存档版本/结构/RNG 串不合法,或 next 与玩法不符)。

## 3. 步序列(`state.round.next` 与每步的 `next`)

| kind | 产生时机 | 之后 next | 耗随机数 |
|---|---|---|---|
| `A_base_spin` | start/normal | 触发且未触顶 → `A_fs_enter`;否则 null | 是 |
| `A_fs_enter` | normal 触发后的 continue;或 start/buy(此步带 charge) | `A_fs_spin` | 否 |
| `A_fs_spin` | continue | 还有次数且未触顶 → `A_fs_spin`;否则 null | 是 |
| `B_base_spin` | start/normal | 触发且未触顶 → `B_hs_enter`;否则 null | 是(含起始币值) |
| `B_hs_enter` | normal 触发后的 continue(source=trigger);或 start/buy(source=buy,此步生成 6 个起始币并带 charge) | K=15 → `B_hs_settle`;否则 `B_hs_respin` | 仅 buy |
| `B_hs_respin` | continue | `ended`(R==0 或 15 满)→ `B_hs_settle`;否则 `B_hs_respin` | 是 |
| `B_hs_settle` | continue | null(含 settlement) | 否 |

## 4. 状态对象 `EngineState`(全部 JSON 安全,已由测试做 `JSON.parse(JSON.stringify())` 往返验证)

```
EngineState { v: 2, game, rng: <32 位十六进制 RNG 状态>, roundSeq, round: RoundState | null }
RoundBase   { roundId, mode, bet, cost, maxWin, cumulativeWin, baseWin, featureWin, stepCount, next }
RoundStateA = RoundBase & { game:'A', fs: { source:'scatter'|'buy', awarded(≤60), remaining, played, ladderIndex(c) } }
RoundStateB = RoundBase & { game:'B', hs: { source:'trigger'|'buy', locked: Coin[], R, respinCount } }
```
对应用户要求的字段:RNG 状态=`rng`;阶段=`round.next`(空闲=`round===null`);本局投注=`round.bet`;累计赢额=`round.cumulativeWin`;A 剩余/阶梯 c/已授予=`fs.remaining/ladderIndex/awarded`;B 锁定格与币值/R/K/累计线赢=`hs.locked`(K=`locked.length`)/`hs.R`/`round.baseWin`(基础线赢,B 的 H&S 赢额只在结算步发放,所以局中 `cumulativeWin === baseWin`)。

## 5. 配置字段(`src/config.ts`,未改动)与最终值

见 `config/gameA.ts`、`config/gameB.ts`;全部变更项见 `report/PAYTABLE_CHANGES.md`。运行时从 config 读取:`betLevels`、`paytable`、`scatterPay`、`reels`、`fs.*`、`coin.*`(`values/startWeights/respinWeights/jackpotProb/jackpotWeights`)、`jackpotMult`、`fullScreenMult`、`pRespin[K-6]`、`maxWinMult`、`buy.{enabled,priceMult,initialSpins|startCoins,disclaimer}`。界面不得写死 75/60。
`createEngine(cfg)` 会校验配置(轴带约束、S 间距、FS 的 S 比例 ≤ BASE、赔付单调、p(K) 单调且 ∈(0,1)、币值/Jackpot 倍数整数),不合法直接抛错。

## 6. RNG 与重放

- 算法:xoshiro128**(128 位状态),种子经 cyrb128 散列;`int(n)` 拒绝采样(无取模偏差);状态 = 32 位十六进制串。**演示/模拟 RNG,真钱环境必须换成通过认证的 RNG**(替换点:`src/rng.ts` 的 `Rng` 类,接口 `u32/int/float/getState/setState`)。
- 重放某一步:取 `result.rng.before`(= 该步入参 `state.rng`),把它放进任意 `EngineState`(结构相同)后用同一请求 `step`,得到逐字节相同的结果;`result.rng.after === result.state.rng`。
- 整局重放:保存开局前的 `EngineState` 与 start 请求,`playRound` 或逐步 `step` 都得到同一步序列(测试保证)。
- 随机数消耗顺序(影响可复现性,改动即视为破坏兼容):A:每轴按轴1→5 各 `int(stripLen)`;B:同上,之后按 reel→row 升序对每个 C 抽起始币值(`WeightedTable.pick` = 1 次 `int`);重转:对空格按 reel→row 升序,每格 1 次 `float()`,落币时再抽(Jackpot 判定 1 次 `float()`,Jackpot 层级 1 次 `int`,否则币值 1 次 `int`);buy:部分 Fisher-Yates 的 6 次 `int`,再按 reel→row 抽 6 个币值。

## 7. 规则解释记录(文档未写死处的实现决定)

1. A:基础旋转触发 FS 时,线赢+Scatter 赢先入 `cumulativeWin`(同一步),再出过场步 `A_fs_enter`;触顶则无 `A_fs_enter`,整局结束。
2. A:剩余次数在每次 FS 开始时先减 1;重触发追加在该次结算时加入;`remaining` 只在 `remaining>0` 时才允许 continue。重触发追加量 = `min(请求量, 60 − 已授予总数)`;满 60 后 Scatter 照付。
3. A:阶梯更新只看线赢 L(未乘倍数)是否 >0;仅 Scatter 赢 → c 重置为 0;重触发不重置阶梯;FS 结束清零(不带回基础)。
4. A:上限截断发生在每次旋转结算的最后(第 7 步),不在一次旋转内部拆分;`maxWin = maxWinMult × 本局投注`(购买时仍为投注,不是购买价)。
5. A buy:不转基础旋转,不付触发 Scatter,直接 8 次 FS(`awarded=8`,`source='buy'`)。
6. B:基础线赢先入账;C ≥ 6 触发;起始 C 的币值在基础旋转那一步生成(耗随机数),仅倍数币,使用 `startWeights`;`B_hs_enter` 本身不耗随机数。
7. B:重转对每个空格独立以 `p(K)`(K = 当前锁定数)判定;同次多币只重置一次 R=3;无新币 R−1;`R==0` 或 15 满即结束(`ended`)。Jackpot 币仅在重转中出现(概率 q,再按层级权重),起始币与 buy 起始币永不为 Jackpot。
8. B:H&S 赢额只在 `B_hs_settle` 一次性计入 `cumulativeWin`(重转步 `win=0`),随后与线赢合计受 10000× 截断;满屏奖励 = `fullScreenMult×bet`,与 Grand 币叠加;起始 15 个 C 时 `B_hs_enter` 的 next 直接是 `B_hs_settle`(无重转)。
9. B buy:6 个随机位置(部分 Fisher-Yates)+ 起始权重币值,仅倍数币;`B_hs_enter`(source='buy')是第 1 步,带 charge。
10. 金额全为整数:`bet` 必须整除 20(A)/10(B);倍数币/Jackpot/满屏均为整数倍总投注。
11. 模拟与报告里「Jackpot 合计」= Jackpot 币赢额 + 满屏 Grand 奖励(两者都是 Jackpot 层级奖金);同时分别给出两项。

## 8. 测试钩子

- `createEngine(customConfig)` 可注入任意配置(`test/helpers.ts` 的 `cfgA(base, fs, over)` / `cfgB(base, over)`、`allS()`、`noWin`、`rep()` 构造确定性轴带:每轴长度 3 时可见窗口恒为整条轴带,停位不影响结果)。
- `engine.playRound(state, startReq)` = 循环 step;`test/step.test.ts` 用它与逐步/存档恢复对拍。
- `test/legacy/engine{A,B}_legacy.ts`:接口变更前的整局 `play()` 原样保留,作为回归基准(逐步结果必须与其 steps 逐字段一致,含 RNG 终态)。
- `test/helpers.ts` 的 `engA/engB(cfg, seed)`:把逐步引擎包成旧的整局 `play()` 视图(去掉 `A_fs_enter`),供场景测试复用。
- 运行:`npm test`(vitest)。`test/rtp.test.ts` 约 3 分钟(每组 150 万局,4σ 内断言 RTP 区间);仅跑快速测试:`npx vitest run --exclude test/rtp.test.ts`。

## 9. Vite 中如何 import

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: {
    '@engine': path.resolve(__dirname, '../slots-engine/src'),
    '@engine-config': path.resolve(__dirname, '../slots-engine/config'),
  } },
  server: { fs: { allow: ['..'] } },   // 允许读取兄弟目录
});
```
```ts
import { createEngine, type EngineState, type SpinResult } from '@engine/index';
import { configA } from '@engine-config/gameA';
import { configB } from '@engine-config/gameB';
```
源码内部使用 `./x.js` 形式的相对导入,Vite/tsx/vitest 均能解析为 `.ts`;`config/*.ts` 依赖 `scripts/paylines.ts`(仅一个纯数据文件)。`config/*.json`(reels*.json、calibration、tune 结果)只被校准脚本使用,**浏览器包不需要**。tsconfig 建议 `moduleResolution: "Bundler"`。

## 10. 脚本

| 命令 | 作用 |
|---|---|
| `npx tsx scripts/analyticReport.ts` | 精确枚举 + DP/马尔可夫的解析 RTP(不含上限),写 `sim/analytic.json` |
| `npx tsx scripts/calibrateA.ts <seed> <iters> out.json` / `calibrateB.ts` / `tuneB.ts` | 轴带退火 / B 币值权重·p(K)·q 调参(未改动) |
| `bash scripts/runSim.sh <A\|B> <normal\|buy> <总局数> <shards> <seedPrefix> [批数]` | 并行模拟,原始结果 `sim/raw/` |
| `bash scripts/finalSim.sh && bash scripts/finalMerge.sh` | 最终模拟(见报告里的 seed 与规模)与合并,汇总 `sim/summary_*.json` |
