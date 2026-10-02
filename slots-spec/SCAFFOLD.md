# slots 脚手架规范 v2(技术负责人)

交付文件(都在 `/workspace/slots-spec/`):
- `protocol.ts`:引擎与界面之间的数据协议(请求、步、结果、存档、错误码)。
- `client.ts`:界面内部的模块契约(判定器、展示配置、事件总线、大奖演出插件、玩法模块)。
- 本文档:选型、目录、流程、构建与运行、给数学和游戏工程师的改动清单。

## 1. 选型(用户已拍板)
- 渲染:PixiJS v8(转轴、符号、特效、币飞入)。外壳:原生 TS + DOM/CSS,不用 React 或 Vue。
- 大奖演出:three.js 或自写 shader,做成懒加载插件,不进首包。
- 引擎:纯 TS、零依赖、跑在浏览器里(`slots-engine`,数学同事维护)。
- 构建:Vite + TypeScript(`strict`),测试用 Vitest,包管理用 pnpm。版本沿用引擎目录里已验证的 TypeScript 5.x 和 Vitest 2.x,避免大版本升级带来的意外。
- 竖屏优先:逻辑画布 1080×1920,按短边等比缩放居中;横屏用背景 cover 裁切加 UI 重排,不单独出横版素材。

## 2. 核心设计:逐步推进的纯函数引擎
```
state0 = engine.createState(seed)                    // 空闲存档
r1 = engine.step(state0, {type:'start', game, bet, mode})   // 第 1 步:基础旋转(或 buy 的 enter 步)
r2 = engine.step(r1.state, {type:'continue'})        // 第 2 步:按 state.round.next 推进
…                                                    // 直到某个 SpinResult.settlement !== null
```
- 每次请求只产出一步。`SpinResult.state` 是完整存档,含 RNG 状态和局内状态,JSON 安全。
- 界面规则:收到结果后,先把 `result.state` 写入 `localStorage`(键 `slots:v2:<game>`),再播放动画。刷新后读回存档,看 `state.round`:非空就继续这一局(从 `round.next` 开始),为空就回到空闲。
- 同一个 `(state, req)` 永远得到同一个结果,所以断线恢复不会换结果,也能做回放和测试。
- 钱:`charge` 在 start 那一步扣,`settlement.totalWin` 在整局最后一步一次性入账。局中界面只显示累计赢额(`step.cumulativeWin`)。
- 上限截断:触顶时该步 `capped = true` 且 `roundEnded = true`,剩余次数作废。
- 动画与结果解耦:跳过动画只加速或直接显示终态,不改步序列;自动旋转、Turbo 同理。

### 每步状态结构(精简对照)
| 步 kind | 触发时机 | 步后 `round.next` | 是否耗随机数 |
|---|---|---|---|
| `A_base_spin` | start normal | 触发则 `A_fs_enter`,否则整局结束 | 是 |
| `A_fs_enter` | 触发后或 buy start | `A_fs_spin` | 否 |
| `A_fs_spin` | continue | 还有次数则 `A_fs_spin`,否则结束 | 是 |
| `B_base_spin` | start normal | 触发则 `B_hs_enter`,否则结束 | 是(含起始币值) |
| `B_hs_enter` | 触发后或 buy start | 起始 15 个币则 `B_hs_settle`,否则 `B_hs_respin` | buy 时生成起始币,触发时否 |
| `B_hs_respin` | continue | 未结束则 `B_hs_respin`,否则 `B_hs_settle` | 是 |
| `B_hs_settle` | continue | 结束(`settlement` 非空) | 否 |

玩法 A 基础旋转触发 Free Spins 时,先把线赢和 Scatter 赢记入 `cumulativeWin`,再由 `A_fs_enter` 过场。buy 局第一步就是 `A_fs_enter`(A)或 `B_hs_enter`(B),`charge` 在这一步。

## 3. 目录结构
```
slots-app/                       # 前端工程(游戏工程师创建)
  index.html
  vite.config.ts                 # alias: @engine → ../slots-engine/src
  src/
    main.ts                      # 启动:装配 registry、加载素材、挂载壳子
    core/                        # 事件总线、状态机、存档(localStorage)、资源加载、音频、i18n
    engine-bridge/               # 把 slots-engine 包成界面用的 Controller(见 §4)
    render/                      # Pixi 场景:ReelSet、SymbolView、WinLines、CoinLayer、Counters、Fx
    ui/                          # DOM 外壳:下注区、余额、菜单、赔付表弹窗、购买确认
    showcase/                    # 大奖演出插件;index.ts 导出 ShowcaseRegistry
      default-big.ts             #   默认占位:Pixi 粒子 + 数字滚动
      (用户自己的 three.js/shader 演出放这里,懒加载)
    games/
      gameA/ index.ts view.ts presenters.ts    # GameModule:数学配置 + 判定器 + 展示配置 + 表现钩子
      gameB/ index.ts view.ts presenters.ts
    registry.ts                  # 收集 games/*,按 id 返回 GameModule
  public/assets/                 # 直接复制 /workspace/slots-ui/assets 的 symbols/ 与 ui/ 的 png、json
  test/                          # 存档恢复、步序列、事件顺序
slots-engine/                    # 已有(数学):src/ config/ scripts/ test/
```
新增一种玩法 = 在 `slots-engine` 增加该玩法的 config + evaluator,在 `slots-app/src/games/<id>/` 增加 `view.ts` 和 `index.ts`,在 registry 里加一行。Cluster Pays 只预留:`GameId` 以后加 `'C'`,无需改壳子。

## 4. 界面侧装配
- `engine-bridge/Controller`:持有 `EngineState`,暴露 `start(bet, mode)`、`continue()`、`resume()`。每次调用 `engine.step`,先存档,再 `bus.emit('step:begin')`,播完 `step:end`,有 `settlement` 就发 `round:end`。Controller 不碰 Pixi。
- `render/` 只监听 `step:begin`,按 `step.kind` 选择 presenter(`GameModule.presenters` 可覆盖默认)。presenter 返回 Promise,播完才进入下一步。
- 状态机(界面层):`Idle → Spinning → Presenting(step) → [Presenting 下一步…] → Settling → Idle`。特色玩法期间不回 Idle,下一步由 Controller 自动 `continue()`,自动旋转、暂停、跳过都在这里处理。
- 大奖演出:`Presenting` 结束后,若 `settlement.totalWin / bet` 达到某个 `view.bigWin[].minMult`,壳子 `import()` 对应插件,先 `load()`,再 `play(ctx)`;插件在壳子提供的叠加 canvas 上建 three.js 或 WebGL,尊重 `ctx.skip`。播完 `dispose()`。用户做的 shader 或 three.js 演出只需实现 `ShowcasePlugin` 并在 `showcase/index.ts` 注册,其他代码不动。

## 5. 素材加载(与 UI 约定)
- 符号:`Assets.load('assets/symbols/symbols-sheet.json')`,合图已含 `anchor 0.5`、`meta.scale = 2`。取 `sheet.textures['H1_koi']`,显示缩放 `165/256`,位置放格心再下移 2px。
- UI:读 `assets/ui/ui-manifest.json` 生成 `Assets.addBundle('ui', …)`,统一用 `png2x`、`resolution: 2`;背景只有 1x。九宫格边距取 manifest 的 `borders`。状态按钮用换 texture 的方式切换,不用 tint。
- 币数字:用 `BitmapText` 预生成 Fredoka 位图字体,叠到 `valueSlot`(圆心 (128,114),半径 46),字号约 50(256 坐标)。其他数字也用 Fredoka Bold,描边 `#3A1B5C`。
- 转轴叠放顺序:背景 → `reel-bg` → 符号层(mask 1000×620) → `reel-frame` → UI。格 (c,r) 的格心 = (95+204c, 95+215r),相对 `reel-bg` 左上。
- 首屏预算 < 1 MB(不含大奖演出、不含 FS/HS 背景):首包只带 base 背景、符号合图(1.3 MB 是 @2x 合图,必要时再压缩为 WebP 或降到首屏需要的帧)、UI 必需件;`background-fs/hs` 在进入特色玩法前懒加载。

## 6. 构建与运行
```
pnpm i
pnpm dev        # Vite 热更新,引擎在浏览器本地跑,seed 取 URL 参数 ?seed=xxx(默认随机)
pnpm build      # 静态包 dist/,可直接放 GitHub Pages / Vercel / Netlify
pnpm preview    # 本地预览构建结果
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest:引擎(数学维护)+ 界面侧存档恢复与步序列测试
pnpm sim        # 引擎侧 RTP 模拟(数学维护,tsx scripts/sim.ts)
```
- 调试开关(仅 dev):URL 参数 `?game=A|B`、`?seed=`、`?force=fs|hs`(从预设存档开始,方便演示和录屏)。`force` 通过构造存档实现,不改引擎。
- CI 门槛:typecheck、test 通过;首包体积不超预算。
- 部署:`dist/` 静态托管即可;不需要后端。

## 7. 给数学/数值的引擎改动清单(基于 slots-engine 现有代码)
1. `types.ts` 以 `/workspace/slots-spec/protocol.ts` 为准(可以复制进 `src/`,保持同一份)。
2. 引擎从 `play(req) → 整局` 改为 `step(state, req) → 一步`:`createEngine(config)` 不再收 seed,seed 走 `createState(seed)`;`Engine` 不再持有 RNG,每次 `step` 从 `state.rng` 恢复 RNG(`new Rng(0).setState(state.rng)`),结束后把新状态写回返回的 `state.rng`。
3. 把现有 `engineA.play` / `engineB.play` 里的循环拆开:每个 while 迭代对应一次 `continue`;局内变量(A 的 `remaining / awardedTotal / c / fsPlayed`,B 的 `locked / R / respinIdx`)存进 `RoundStateA/B`。`cum`、`baseWin`、`featureWin` 放 `RoundBase`。
4. 新增过场步 `A_fs_enter`(A)。B 的 `B_hs_enter` 现有结构保留,加 `source`;buy 局的起始币在 buy 的 start 那一步生成并立刻记入 `state.round.hs.locked`。
5. 每步都要填 `next` 和 `roundEnded`;整局最后一步返回 `settlement`,汇总字段与原 `summary` 一致。
6. 保持不变:`core.ts`、`rng.ts`、`config.ts`、两份 config、校准脚本。RTP 不应改变:同一个 seed 下,逐步推进得到的步序列应与现有整局 `play()` 的 `steps` 完全一致,请把它当回归测试(旧 `play` 可保留为 `playRound(state)`:循环 `step` 到结束,供 `sim` 使用)。
7. 新增测试:(a) 逐步结果与整局结果等价;(b) 任意一步后序列化存档再恢复,后续步骤不变;(c) 非法请求抛 `EngineError`(局中 start、空闲 continue、投注不在档位、buy 未开启)。
8. 新增 `scripts/sim.ts` 的适配:模拟用 `playRound`,RTP 与现有报告对照。

## 8. 与规则文档的对齐点(请游戏工程师注意)
- A 的 S 对外名称是「糖果门 / Candy Gate」;规则文档里仍有「牌坊门、龙门」旧称,界面文案以 UI 规范为准。
- 赔付表页面稿的数值以数学最终 config 为准;购买价格已被数学调整(A 为 48×、B 为 85×),界面必须从 config 读取,不要写死 75 或 60。
- 5000×(A)、10000×(B)上限、`BUY_FEATURE_ENABLED` 和免责声明文案都来自 config,界面只展示。
- 演示币:默认 10000,菜单可重置,只在空闲状态可用;余额不足以支付最小档位时旋转置灰并提示重置。

## 9. 待用户拍板的取舍
本阶段用户已经确定的五项不再重复。还剩两个小取舍,默认值我已选好,不确认也能开工:
1. 存档位置:默认 `localStorage`,刷新可续局;不做账号或云存档。
2. 声音:默认静音启动(浏览器自动播放限制),玩家点击后开启;音效资源首版可选,优先保证画面和节奏。
