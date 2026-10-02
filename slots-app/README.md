# slots-app — 糖果锦鲤池 / 金鲤满仓(页面骨架)

PixiJS v8 + TypeScript(strict)+ Vite 5 + Vitest 2 + pnpm。DOM/CSS 外壳,不用 React/Vue。
逻辑画布 **1080×1920**,按短边等比缩放居中。风格 A「糖果甜心」。引擎在浏览器本地跑,从 `../slots-engine/src` 经 Vite alias 引用(**未复制、未改动**)。

## 命令
```bash
pnpm i
pnpm dev          # 开发服务器 http://localhost:5173 ,带调试开关
pnpm build        # tsc --noEmit && vite build → dist/(base './',可放子路径)
pnpm preview      # 预览 dist/ ,http://localhost:4173
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run(61 个用例,<2s;含 jsdom 的 DOM 用例)
pnpm build:debug  # 构建时保留调试开关(?game/?seed/?force/?reset 与 window.__slots)
pnpm assets       # 重新从 /workspace/slots-ui/assets 生成 public/assets(需要 python3 + Pillow)
pnpm e2e          # Playwright 端到端(需先 pnpm dev;会写 screenshots/)
pnpm e2e:hs       # H&S 状态条与盘面同步检查(每个 respin/enter 步结束时 K、R 与盘面/step 一致),并重拍稳定态 07 截图
pnpm measure      # 首屏传输体积(真实浏览器 + 自带 gzip 静态服务器,读 dist/;无 dist 会先 pnpm build;见「首包体积」)
pnpm e2e:new      # 第三轮新增行为的端到端(重置确认 / AUTO 次数 / 调投注停 AUTO / 设计说明面板 / logo A·B / 截图),需先 pnpm dev
pnpm measure:fonts   # 各手机视口(320×568…768×1024)小字实际渲染字号 + 布局不溢出检查(D-02),需先 pnpm dev
pnpm check:panel     # 设计说明面板 DOM 实测坐标/字号 vs UI 稿 panel-layout.json
pnpm shoot:panel     # 重拍面板截图并生成与 UI 稿并排的 compare-panel-*.png
pnpm sync:panel-copy # 从 slots-product/demo_panel_copy.json 同步面板文案(见「设计说明面板」)
```
Playwright 首次需 `npx playwright install chromium`;WebGL 无 GPU 环境用 `--use-gl=swiftshader --enable-unsafe-swiftshader`(见 `scripts/e2e.mjs`)。

## 目录(对应 SCAFFOLD §3)
```
src/
  main.ts               启动:字体 → 素材 → Stage → 2 个 Controller → Shell
  registry.ts           收集 games/*,按 id 返回 GameModule
  core/                 autoplay(AUTO 次数状态,纯逻辑) · bus 事件总线 · fsm 界面状态机 · storage 存档/钱包/设置 · textures(在 render/)
                        audio 音频(默认静音,无资源不报错) · i18n · fonts(@fontsource/fredoka 本地) · debug · utils · types
  engine-bridge/        Controller(持有 EngineState:start/continue/resume/playRound) · force(?force 构造存档)
  render/               Stage · ReelSet(转动/逐轴停轴) · SymbolView(含币值 BitmapText/中奖脉冲) · CoinLayer(H&S 锁币)
                        WinLines(逐线高亮) · Counters(WinBar/FsPanel/JackpotBar/HsHeader) · textures · layout(坐标常量)
  ui/                   Shell(流程编排) · Hud(底部 DOM) · Popups(购买确认/赔付表占位/菜单/重置确认/AUTO 次数菜单) · DesignPanel(设计说明面板+入口+首次气泡) · Banner(过场横幅/toast) · style.css
  content/              demo_panel_copy.json(设计说明文案,构建时静态数据) · designPanel.ts(取数)
  showcase/             index.ts(注册表 + 懒加载) · guard.ts(降级守卫) · timeline.ts / quality.ts / prefetch.ts(纯逻辑,主包内) · default-big.ts(Canvas2D 降级演出) · candy/(three.js + shader,懒加载块;含 glsl/assets/session/post 等)
  games/gameA|gameB/    index.ts(GameModule) · view.ts(展示配置) · presenters.ts(各 step 的表现)
  games/common.ts       线赢展示等共用表现;games/viewTypes.ts 展示配置扩展
test/                   restore · steps · events · independence · misc · hs-header · autoplay · popups-dom(jsdom)
scripts/                copy-assets.py · e2e.mjs · e2e-new.mjs · measure.mjs · measure-fonts.mjs · check-panel-layout.mjs · shoot-panel.mjs · compare-panel.py · sync-panel-copy.mjs · check-hs-sync.mjs · pw.mjs
public/assets/          symbols/ + ui/(见“素材”)
screenshots/            验收截图
```

## 界面状态机
`Idle → Spinning → Presenting(step) → [Spinning/Presenting 下一步…] → Settling → Idle`
- 有转轴的步(`*_base_spin` / `A_fs_spin` / `B_hs_respin`)走 `Spinning → Presenting`;过场步(`A_fs_enter` / `B_hs_enter` / `B_hs_settle`)直接 `Presenting`(buy 局第一步从 `Idle` 直接进 `Presenting`)。
- **特色玩法期间不回 Idle**:`Controller.playRound` 在 start 后自动 `continue()` 到出现 settlement;`Presenting` 不能直接跳 `Idle`(`fsm.to` 会抛错,有测试)。
- 每步:`engine.step` → 钱包扣 charge / 入账 → **先写 localStorage** → `step:begin` → 播放(转轴停稳 + presenter)→ `step:end`;有 settlement 再发 `cap:reached`(如有)与 `round:end`。大赢演出之后壳子才把显示余额同步为真实余额(`commitDisplayBalance`,发 `balance:change{win}`)。
- 点击舞台 / 点 STOP:`skip`(AbortSignal)→ 快速停轴、动画直接到终态,**不改结果**。特色玩法步骤期间 SPIN 置灰(不可 STOP 取消,但点画布可加速)。
- 各步可见表现:
  | step | 表现 |
  |---|---|
  | A_base_spin | 转轴 → 总览脉冲 → 逐线高亮循环 → 赢额滚动;糖果门预告钩子(`anticipation`:前几轴已有 ≥2 个 S 时,后续轴延迟停) |
  | A_fs_enter | 切 `background-fs`(懒加载)+ “FREE SPINS” 过场横幅 + 剩余次数面板 |
  | A_fs_spin | 剩余次数、倍数阶梯 ×1/×2/×3/×5 高亮、“×m” 浮字、累计赢、重触发 “+N”(含 60 上限提示)、结束横幅 |
  | B_base_spin | 转轴(C 带币值)→ 线赢;触发时 C 脉冲 |
  | B_hs_enter | 切 `background-hs`(懒加载)+ “HOLD & SPIN” 横幅,锁币逐个弹出(币面按币值变体,数字为 BitmapText;Jackpot 币用层级币面) |
  | B_hs_respin | 仅有空格的轴转动(空格转动时是半透明基础币),新币弹出锁定;剩余重转点 `dots_NofM` + `K/15` 计数 |
  | B_hs_settle | 币值逐个飞入赢额条并累加(Jackpot 币显示层级名),满屏奖励浮字,结束横幅 |
- 背景:`base / fs / hs`,fs/hs 在进入特色玩法时才加载(首包不含),加载期间保持原背景,到达后淡入。

## 玩法 A / B 切换(状态独立)
- 每个玩法一个 `Controller`,各自 `EngineState`、各自 RNG、各自存档键 **`slots:v2:A` / `slots:v2:B`**;两者共用一个舞台与一个钱包。切 tab 只重配舞台并按目标玩法的存档重建画面,不会串状态。
- **局中(界面忙 / 任一玩法存档 `round !== null`)禁止切换**,tab 显示锁定样式并弹提示“局中不能切换玩法,请先完成本局”。理由:特色玩法是同步自动进行的,没有“暂停”语义;禁止切换最不容易出错。
- 兜底:若刷新后某玩法存档是局中,启动时自动选中该玩法并从 `round.next` 继续(另一个玩法也可能有未完成存档——只可能发生在手工改存档;此时先续完一个,切到另一个时同样自动续局)。

## 存档与余额策略
| 键 | 内容 |
|---|---|
| `slots:v2:A` / `slots:v2:B` | 引擎 `EngineState` 原样 JSON(含 RNG、`round`) |
| `slots:v2:balance` | **全局共享**演示币余额(整数,默认 10000);**不按玩法拆分**——两玩法同一个钱包,更符合“演示币”的直觉,也避免重置要改两处 |
| `slots:v2:settings` | `{ sound, turbo, game, bet:{A,B} }`,声音默认关 |
- **扣费/入账与存档在同一同步块内完成**:start 步:`wallet -= charge`(`balance` 键立刻写入)→ 写引擎存档 → 才开始动画;局终步:`wallet += settlement.totalWin` → 写存档(round=null)→ 动画。所以“局中刷新”时余额里已经扣过 charge,`resume()` 只发 `continue`,**不会重复扣**(测试 `restore.test.ts` 断言 `round:start` 次数为 0)。
- 副作用:局终步一旦落盘,赢额就已入账(与动画无关),刷新后不会丢奖;界面显示余额(`wallet.display`)在动画/大赢演出结束后才跳到真实余额。
- 恢复流程:读 `slots:v2:<game>` → 版本/结构校验(坏档丢弃并新建空闲存档,不抛错)→ `round` 非空则从 `round.next` 继续那一局(提示“已恢复上次未完成的局”),为空则 Idle。
- localStorage 不可用(隐私模式)时退回内存存档并警告。
- 余额不足以支付最小档位:SPIN 置灰 + 提示“请在菜单中重置演示币”;不足以支付当前档位但够最小档:提示降低下注。菜单“重置演示币”仅空闲可用(UI 置灰 + `resetBalance()` 逻辑双重保护),点击后先弹确认框(见「重置确认」)。

## 购买特色
入口按钮仅在 `config.buy.enabled` 时显示。价格 = `config.buy.priceMult × 当前 bet`(A=48×,B=85×;代码里没有 75/60 字面量;`test/events.test.ts` 把 priceMult 改成 99 验证 charge 随 config 变化)。确认弹窗展示价格、购买后余额与 `config.buy.disclaimer`(按钮下方也常显)。余额不足时按钮置灰。

## 素材
- 来源 `/workspace/slots-ui/assets/{symbols,ui}`(只读),`scripts/copy-assets.py` 生成 `public/assets/`。**未复制 paytable**。
- **与规范的偏差(请确认)**:为满足首屏预算,把 `png2x`/背景/合图转成 **WebP(q=80,带 alpha)**,并改写副本里的 `ui-manifest.json` / `symbols-sheet.json` 指向 `.webp`。原始 PNG 方案(`ASSET_FORMAT=png pnpm assets`)合图单张 1.3 MB、UI+符号合计约 7 MB,远超 1 MB。目前肉眼无明显劣化;若美术不接受换回 PNG 即可(代码只读 manifest)。
- 符号:`Assets.load('assets/symbols/symbols-sheet.json')`(`meta.scale=2`、`anchor 0.5`),显示缩放 `165/256`,格心再下移 2px,开 mipmap。
- UI:按 manifest 生成 `Assets.addBundle('ui')`,统一 `png2x` + `resolution 2`,背景 1x;九宫格边距取 manifest `borders`(win-bar 仅水平三段)。按钮用 DOM `<img>` 换 `src` 表示 normal/pressed/disabled/on/off/stop,**不用 tint**。
- 转轴叠放:背景 → reel-bg(放在 (37,490)=窗口-3)→ 符号层(mask 1000×620)→ 锁币层(同 mask)→ reel-frame → 赢线 → 赢额条;格心 `(95+204c, 95+215r)` 相对 reel-bg 左上(`scripts/e2e.mjs` 在运行时断言 15 个格的 sprite 全局坐标与缩放)。
- 字体:`@fontsource/fredoka`(latin 700,woff2 随构建打包,无外网依赖)。Pixi 数字用 `BitmapFont.install` 预生成两套位图字体(白字 / #FFE066 金字,描边 #3A1B5C,宽=字号×0.18)。**中文没有打包字体**,走系统 Noto Sans SC / PingFang / 微软雅黑兜底。
- 声音:`AudioManager` 接口在(`view.audio` 映射、事件→音效名),无资源时静默;默认静音,点声音按钮开启并持久化。

## 重置确认(D-01)
菜单「重置演示币」→ 弹确认框(DOM,`Popups.confirmReset`,同 `panel-popup` 九宫格风格,标题“重置演示币”,正文“确定要把余额重置为 10,000 演示币吗?当前余额将被覆盖。”,按钮 **取消 / 确认重置**,testid `reset-confirm` / `reset-cancel` / `reset-ok`)。
- **取消**(或点遮罩):不重置,回到菜单;**确认**:调用 `Shell.resetBalance()`(仍有“仅空闲”的逻辑保护)并关闭菜单,弹 toast。
- 仅空闲可用的限制保持:局中菜单里的重置按钮置灰。文案在 `i18n.ts`(`menu.reset.confirm*`、`btn.resetOk`,中英双语)。

## AUTO 自动旋转(D-05 / D-06)
- 点 AUTO(关闭状态、空闲时)→ 弹次数菜单:**10 / 25 / 50 / 100 / 直到特色玩法触发**(testid `auto-menu`、`auto-10` … `auto-feature`、`auto-cancel`);选后立即开始。取消不开始。
- **次数口径**:选 N = **最多 N 局**。`remaining` = 尚未结算完的局数(含正在进行的这一局):选 10 → 开始时 `ui:autoplay{on:true, remaining:10}`,第 1 局结算后 9 …… 第 10 局结算后 0 → 自动停并发 `{on:false, remaining:null}`。逻辑在 `core/autoplay.ts`(纯逻辑,`test/autoplay.test.ts` 单测)。
- **「直到特色」**:`remaining=null`(不计数),遇到 FS / H&S 触发(`A_fs_enter` / `B_hs_enter`)立即停并提示。
- AUTO 按钮下沿叠一个徽标显示剩余次数(`#auto-count`,testid `auto-count`,`data-remaining`=数字或 `inf`;“直到特色”显示 ∞);再点 AUTO = 手动停(正在进行的一局仍会跑完,不再开新局)。
- **停止条件(都会回到关闭态)**:次数用完 / 手动再点 AUTO / 触发特色 / 余额不足(含按局前检查)/ 切玩法 / 出错 / **调整投注(D-06)**:`Shell.setBetIndex` 调 `stopAuto('bet')`,+ / − / MAX 均会停止 AUTO,两局间点击不会再开新一局(e2e 在 500ms 间隙内同步点击验证)。
- 局中不能开启 AUTO;AUTO 进行中 AUTO 按钮仍可点(用于停止)。

## 设计说明面板(UI 稿已出,按 `slots-ui/assets/design-notes/panel-spec.md` 实现)
- **数据源**:`src/content/demo_panel_copy.json` = `/workspace/slots-product/demo_panel_copy.json` 的拷贝(构建时静态 import,**运行时不跨目录读取**)。更新:产品改文案后运行 `pnpm sync:panel-copy [源路径]`(校验结构后覆盖拷贝),再 `pnpm build`。`games.A/B.title / panelTitle / points[].heading|text` 原样展示,不改写;用语保持「糖果门」。当前 `version 1.0`。
- **入口**(两处):① 顶栏右侧按钮 `#dn-open`(`btn-design-notes` 三态素材,视觉 210×76 @ **(800,97)**,DOM 热区外扩 10px = 230×96;z-index 800);② 菜单里「设计说明」项(testid `menu-design`)。首次进入显示 `hint-bubble`(1.2s 后淡入、5s 后淡出,点任意处/打开面板即消失,写 `localStorage['dn.hint']='1'`;`?reset=1` 会清掉)。
- **面板**:`ui/DesignPanel.ts`,`aside#dn-panel[role=dialog][aria-modal]`,遮罩(点遮罩**不**关闭,仅 ×/关闭/Esc)+ 标题栏(`panelTitle` + 当前玩法名)+ Tab 条(两玩法,`role=tablist`)+ 卡片滚动区(5 张卡片,`overflow-y:auto`,顶/底渐隐)+ 固定页脚(「演示项目,无真实货币」+ 关闭大按钮)。数字片段(正则取自 spec §8)包 `<strong>` 高亮,JSON 文字不变。动效按 spec(遮罩 180ms、面板 220ms、关闭 160ms、Tab 内容 140ms、卡片错开 40ms;`prefers-reduced-motion` 全部置 0)。键盘:Esc 关闭、焦点陷阱、←/→/Home/End 切 Tab、关闭后焦点回入口、面板外元素 `inert`。
- **样式集中**:`src/ui/style.css` 末尾「设计说明面板」段(`.dn-*`)+ `DesignPanel.ts` 的 DOM;UI 再改稿只动这两处。坐标 = 1080×1920 逻辑像素,`pnpm check:panel` 用 DOM 实测对比 `panel-layout.json`。
- **与游戏的关系**:纯展示,**任何时候可打开**(含局中/特色玩法中),不读写游戏状态;打开期间转轴、结算、FS/H&S 的自动 continue、AUTO 照常进行(e2e 验证局中打开后局能走完、FS 打开期间 FS 正常结束);遮罩覆盖舞台,所以点不到 SPIN 等控件。
- **字号**:正文 36 / 标题 44 / 声明 28(逻辑像素,= 稿面);另有 `max(…, 最小px/缩放)` 兜底(见下)。
- 素材:`copy-assets.py` 只复制入口按钮 normal/pressed 与 hint-bubble(首屏,DOM `<img>`);稿面参考图 panel-A/B(-scrolled)/wireframe 与 disabled 态**不复制**。

## 手机小字号(D-02)
- 舞台整体按 `s=min(宽/1080, 高/1920)` 缩放,手机上 `s≈0.3–0.4`,逻辑 19–26px 的小字渲染后只有 6–9px。`fit()` 把 `s` 写成 CSS 变量 `--s`,小字统一用 `font-size: max(逻辑字号, calc(var(--min-px) / var(--s)))`(`--min-px: 11px`,见 `style.css` 顶部)。适用:免责声明、提示行、`.fine`(购买确认等弹窗小字)、设计说明正文/声明。
- 免责声明改为 `bottom: 4px; left/right: 14px` 贴舞台底、单行;购买按钮上移到 y=1790、高 76,避免被加大后的免责声明遮挡。`pnpm measure:fonts` 在 320×568 … 768×1024 七个视口测实际渲染字号与布局(控件在视口内且不被遮挡、免责声明不与购买钮重叠、弹窗在视口内)。

## 素材更新(设计说明 / logo)
- logo 按玩法切换(D-03 已按 UI 确认处理):A=`ui/logo-A`,B=`ui/logo-B`(800×330 同位置,只换纹理);`Stage.setLogo(game)` 在 `configure()` 时调用,切 tab 同步更新。启动时只加载当前玩法的 logo,另一张在第一次切换时懒加载(@2x)。通用 `logo` 不用(不复制)。
- `atlas.json` 里旧称“W 锦鲤珍珠 Wild”在 `copy-assets.py` 的副本里替换为“W 彩虹珍珠 Wild”(D-04;`slots-ui` 源文件未改)。`rg "锦鲤珍珠|龙门|牌坊门" dist public src` 无命中。
- 符号合图用 WebP `method=6, q=78`(`SHEET_QUALITY` 可调),比 q80/method4 小约 8%(395→358 KB),PSNR 约 −0.5 dB,肉眼无差;其余图保持 q80。

## 大赢演出(three.js + shader,懒加载)
**所有 three 代码与美术素材都在独立懒加载块里,绝不进首屏**;主包里只有很小的"壳"(档位表/时间轴/降级决策/预取调度,约 +3.7 KB gzip)。

### 档位与时间轴(参数全部取自 UI 的 `assets/bigwin/tiers.json` + README)
| 玩法档位(`view.bigWin[].tier`) | 美术 | 时长 | 遮罩 | 震屏 | 闪白 | 说明 |
|---|---|---|---|---|---|---|
| `big`(A/B ≥20×) | Big | 3.5 s | #2B0F26 α.70 | 6 px / 300 ms | .35 / 120 ms | 标题弹入、金币+糖果星雨、光束、冲击波 |
| `mega`(≥50×) | Mega | 5 s | #170E45 α.76 | 10 px / 450 ms | .50 / 150 ms | + mini-koi(金/粉/紫)绕圈、更密粒子、气泡上浮 |
| `epic`(≥100×) | **Super 基础款** | 7 s | #120A2E α.82 | 16 px / 700 ms | .70 / 180 ms | + 巨型金锦鲤、皇冠、烟花式爆发、慢推近 |
| `max`(A ≥500× / B ≥1000×) | **Super 变体** | 7 s | 同 Super | 同 Super | 同 Super | 皇冠 1.35×、彩虹光环、粒子 +20%、终局二次爆发;**标题仍是 SUPER WIN**(UI 只出了三档美术) |

- 坐标(1080×1920,全屏叠加,`#showcase` 现在就是全屏):标题 y=690、数字 y=900、主视觉 y=1000(层模式偏移不用,README 里的 480/690/790 与全屏 -270/-60/+40 都已在 `timeline.ts: LAYOUT` 留档)。
- 时间轴(`timeline.ts: timelineFor`)按 tiers.json 的 enter / climax / count / hold / fadeOut(固定 300 ms);数字滚动从 `onAmount` 注册时刻开始(three 初始化与素材加载耗时不吃滚动时间),easeOutCubic。
- Turbo 时长 ×0.5;**reduced-motion**:总时长 2000 ms、关震屏/闪白/推近、粒子 ≤40、强制 low 档。
- **与需求原文的出入(以 tiers.json 为准)**:原文 big 4.5 s / mega 6 s / epic 8 s;tiers.json 为 3.5 / 5 / 7 / 7 s,已按 tiers.json。`core/i18n.ts` 的 `bigwin.epic` 与 `default-big` 标题表由 EPIC WIN 改为 SUPER WIN。

### 视觉构成(每档共用管线,按档位开关)
- **背景**:档位遮罩色 + **程序化水面 shader**(波纹法线、焦散、彩虹薄膜、光柱;噪声取 `noise-256.png`,缺失则用解析噪声)。UI 没出焦散/荷叶贴图,所以水面仍程序化。
- **光束**:`ray.png` 实例化加色(旋转缓慢摆动,近原点淡出避免盖住数字)。
- **粒子**:`particles-atlas`(coin / candy-star / sparkle / ribbon×3 / petal / bubble / mini-koi×3 / glow / crown)用 JSON 里的 three.js 归一化 uv;**GPU 实例化 + 解析式模拟**(雨、喷泉、气泡上浮、事件爆发、烟花),CPU 零逐帧循环;粒子配比按档位表。
- **标题**:`title-big/mega/super`(1800×520 WebP / 900×260 PNG,透明底),弹入(easeOutBack)+ 弯曲网格 + 高光扫过;**不再用 Canvas 生成标题**,Canvas 文字只在标题图加载失败时兜底(e2e 有覆盖)。数字:Canvas 数字表(等宽 + 软阴影)+ ×倍数徽章。
- **Mega**:`mini-koi` 三色环游;**Super/Max**:程序化 SDF 水下锦鲤(背景层)+ 巨型金锦鲤(`hero-koi.svg` 光栅化到 1024 宽,比 512×384 位图锐利;位图 webp 兜底)+ 皇冠(`crown.svg`);Max 加彩虹光环。
- **后处理**(`post.ts` 自写,不依赖 three/examples):提亮 → 1/4、1/8、1/16 可分离高斯 → bloom + 色差 + 冲击波畸变 + 暗角 + 软肩(保留 alpha,不遮住下面的游戏画面);震屏/推近/闪白在 shader 与 CSS transform 里做。
- **质量三档**(`quality.ts`):high(渲染比 .75,实体粒子 700 / 光晕 420 / bloom 3 级)、medium、low(无后处理,150/60)。首帧 >400 ms 或连续 15 帧 >25 ms 自动降档(最多 2 次);`?quality=` 强制时关闭自适应。

### 素材(来自 `slots-ui/assets/bigwin/`,**原样复制,未重新编码**,故无画质损失;`scripts/copy-assets.py` 负责)
按档位分批加载(`candy/assets.ts`),**big 只载自己需要的**:
| 批次 | 内容 | 传输体积(约) |
|---|---|---|
| 通用(任意档首次) | `particles-atlas.webp` 22.5 KB + `.json` 0.9 KB(gz) + `ray.png` 14.1 KB + `noise-256.png` 38.9 KB | ≈ 76 KB |
| 每档追加 | `ramp-<art>.png`(<0.3 KB) + 标题:**PNG 900×260 约 15–17 KB**(默认)/ **WebP 1800×520 31–34 KB**(仅 high 且 dpr ≥1.5) | big ≈ 93 KB(PNG)/ 111 KB(WebP);mega ≈ 92 / 108 KB |
| Super(epic/max)追加 | `hero-koi.svg` 1.6 KB(gz) + `crown.svg` 0.9 KB(gz);位图 `hero-koi.webp` 14.5 KB 仅作 SVG 失败兜底 | ≈ 97 KB(PNG)/ 114 KB(WebP) |
整个 `public/assets/bigwin/` 共 ≈ 247 KB(未压缩,含全部档位的 png+webp 两套标题);任何一档最多加载其中约 1/2。参考稿 `ref-*.png`(色阶化)与 mini-koi/sprites 目录里的单张 SVG 不复制(atlas 已含)。

### 代码块(懒加载,与素材分开计)
| 块 | raw | gzip |
|---|---|---|
| `three-*.js`(three.js 0.186 的实际被引用部分,独立 chunk) | 513 KB | **127.6 KB** |
| `index-*.js`(candy 插件:glsl / 构建 / 后处理 / session) | 43.4 KB | **17.1 KB** |
| **合计** | | **≈ 144.7 KB(< 200 KB 预算)** |
| `default-big-*.js`(Canvas2D 降级演出) | 1.7 KB | 0.9 KB |
- **预取**(`prefetch.ts`):`data-ready` 之后 8 s、再等 `requestIdleCallback`,插入 `<link rel=prefetch as=script>` 预热 candy+three 两个块(只下载不执行,最低优先级;美术素材不预取,到演出时才按档位加载)。跳过:saveData / 2g-3g / 低端设备(`hardwareConcurrency≤4` 且 `deviceMemory≤4`)/ 无 WebGL2 / dev 服务器。清单由 vite 插件 `showcaseChunks` 在构建期写入。`pnpm measure` 的首屏口径里大赢相关请求为 0(脚本会单独打印;`--idle=22000` 能看到 three 块被预取)。
- **首屏口径**:1,010,134 B → **1,013,863 B(+3,729 B,全部是主包里的壳逻辑)**,仍 <1 MB(990.1 KB)。

### 降级与健壮性
- 守卫插件(`guard.ts`):无 WebGL / three 块加载失败 / 必需素材失败(atlas、json、ray、ramp)/ `play` 抛错 / WebGL context lost → **在新 canvas 上回退 `default-big`(剩余时长 ≥700 ms),不报错、不卡流程**;仅标题图失败 → 仍用 three + Canvas 兜底标题。
- **skip**(点击/触摸 `#showcase`,`pointerdown`):数字立刻置终值;插件取消未来事件,播 ≤280 ms 收尾(淡出 + 一次小闪光);壳子看门狗(正常 D+6 s,skip 后 1.2 s)保证一定 resolve。点击发生在素材加载/着色器编译阶段同样可用(e2e 覆盖)。
- **dispose**:Session 创建的 renderer / geometry / material / texture / render target 全部登记在 `tracker`,结束时逐个 `dispose()`,再 `renderer.dispose()` + `forceContextLoss()` + 移除 canvas;`dispose` 幂等。
- 演示不入账:`playBigWin` 只调用 `shell.playShowcase`,不改余额与存档。

### 调试用法(仅 dev,或 `pnpm build:debug`;prod 构建里没有这些代码(parseDebug、force.ts、window.__slots、演示块均由构建期常量剔除),已用 `rg "parseDebug|playBigWin|force=fs" dist` 验证)
- `?force=big|mega|epic|max` 启动后自动演示一次对应档位;`?force=bigwin` 依次四档。`?quality=high|medium|low` 强制质量档;`?noprefetch`。
- 控制台:`__slots.playBigWin('mega', 8000)`、`__slots.showcaseStats`(资源创建/释放计数)、`__slots.showcaseLast.current`(上次用了 three 还是回退、原因、质量档)。
- 截图:`node scripts/shoot-showcase.mjs <A|B> big,mega,epic,max high 1` → `screenshots/showcase-{tier}-{A|B}-{enter,peak,done}.png`(按演出时钟取点,合成到演出前的游戏画面上)。
- 验证:`pnpm e2e:showcase`(skip / 降级 / reduced-motion / 20 次连播泄漏 / high 档 RT / `?force=`,30 项)。

### 与 UI README 的出入 / 已知问题
- `ray.png`:README 写"原点在底部中心",实际亮端在**图像顶行**(row 0 alpha=255,向下渐隐);实现里取亮端为光束原点。若 UI 其实想要底部为原点,需要重导出图。
- 主视觉锦鲤与皇冠用 SVG 光栅化(比位图锐利),位图只作兜底。
- 视觉只能在软渲染(swiftshader)下验证:high 档约 **4–8 fps**(真机 GPU 帧率未测,**需要一台真机跑 `?force=bigwin` 看帧率与降档**)。
- Super 的巨型锦鲤与数字区域有重叠,但在数字/标题下层;层模式(1080×1000)不支持,锦鲤需缩 0.75,当前只做全屏。
- `max` 没有独立标题(沿用 SUPER WIN)。

## 调试开关(仅 dev,或 `pnpm build:debug`)
| 参数 | 作用 |
|---|---|
| `?game=A\|B` | 起始玩法(存档里有未完成局的玩法优先) |
| `?seed=xxx` | 新建存档的 RNG 种子(默认随机;B 用 `xxx:B`) |
| `?force=fs` | 玩法 A:构造 `round.next='A_fs_enter'`、8 次免费旋转的存档并续局 |
| `?force=hs` | 玩法 B:构造 `round.next='B_hs_enter'`、6 个起始币(位置/币值写死的演示值)的存档并续局 |
| `?reset=1` | 清空两个玩法存档、余额、设置 |
| `?lang=en` | 切英文文案 |
- `force` 只构造 `EngineState`,不改引擎,之后每一步都由真实引擎推进;视为已支付 1 倍 bet(从余额扣一次)。是一次性的:应用后从地址栏移除,刷新走存档恢复。
- **降级说明**:force 局没有“触发它的基础旋转盘面”(没有线赢、A 的 FS 面板之外画面用空闲盘面)。
- dev 下 `window.__slots` 暴露 `shell / bus / controllers / wallet / snapshot() / events`,e2e 脚本依赖它。

## 测试
**当前 `pnpm test` = 10 个文件、88 个用例**(新增 `showcase-timeline` 15:时长/时间轴/数字滚动/skip 收尾/震屏闪白;`showcase-quality` 12:质量档选择/降档/调速器/预取决策/reduced-motion;其余沿用前几轮)。
`pnpm test`(Vitest;含 `test/popups-dom.test.ts` 用 jsdom 25 测 DOM 弹窗/面板):存档恢复(A/B × normal/buy,**每个中间步**序列化再恢复,后续步骤逐字节一致;Controller 经 store 往返、不重复扣费、先存档再播放;坏档丢弃)、步序列(300 局/玩法)、事件顺序、UI 状态机、两玩法状态独立与共用钱包、`?force` 存档可被引擎接受、文案守卫(无“牌坊门/龙门”)、调试开关解析、registry/view 覆盖轴带符号。
`pnpm e2e`(Playwright,dev server)有 50 项断言与截图(含重置确认框断言);`pnpm e2e:showcase` 30 项见「大赢演出」;`pnpm e2e:new` 另有 43 项:AUTO(选 10 最多 10 局且 remaining 递减、再点停止、余额不足停、遇 FS / H&S 即停)、D-06(+/−/MAX 在两局间隙同步点击均停 AUTO 且不再开新局)、设计说明面板(入口位置、A/B 各 5 条、切 Tab、Esc/焦点、局中/FS 中打开不卡死)、logo A/B 切换。`test/hs-header.test.ts` 与 `pnpm e2e:hs` 断言:每个 `B_hs_enter`/`B_hs_respin` 步表现结束后,状态条 K = 盘面锁定币数 = `step.K`,R = `step.R`。

## 已知限制
1. **横屏**:只做了等比缩放居中 + 虚化背景铺满,没有 UI 重排(SCAFFOLD 要求的“横屏背景 cover + UI 重排”未做)。
2. **赔付表**:INFO 打开的是按当前数学配置渲染的**占位简表**(不用 paytable 素材,等 UI 更新)。
3. **大赢档位阈值**(20/50/100/500|1000)为占位,待策划确认;演出由 three.js 实现(见「大赢演出」),`dpr` 固定 1(舞台逻辑尺寸 1080×1920)。
4. 局中刷新后的画面是“恢复态”:A 的 FS 用空闲盘面 + 面板数值;B 的 H&S 用存档里的锁币重建;不会重放已播放步骤的盘面(引擎存档不含上一步盘面)。
5. A 的 `S` 预告只是延长后几轴的停轴时间,没有专属特效。
6. 中奖线用折线 + 圆点,线序颜色循环,没有“线号”标签。
7. 无音效资源;无 `Noto Sans SC` 打包。
8. Turbo 只是缩短转动/停轴/展示时间(`turboFactor`)。AUTO 的次数口径见「AUTO 自动旋转」。
9. 触发特色玩法时 AUTO 自动关闭,需要玩家手动重新开启。
10. 首屏体积约 **0.96 MB**(gzip 口径,见「首包体积」),仍贴近预算线,再加素材需继续压缩。
11. 设计说明面板仅做了竖屏稿(规范里横屏“居中 1056 宽×满高 1000”未做,目前依赖整舞台等比缩放)。

## 首包体积(`pnpm measure`,D-07 新口径)
- **旧版的问题**:只用 CDP 主线程会话统计,Pixi 在 Worker 里加载的贴图不在其中(上一版另按文件清单核算)。**新版**:`scripts/measure.mjs` 用 Playwright 真实 Chromium 加载 `dist/`,脚本自带 gzip 静态服务器(html/js/css/json/svg gzip,webp/woff2 原样;缓存头 `public, max-age=31536000`),以**服务器逐请求日志**为权威(任何来源——含 Worker——的请求都会到服务器),并用 context 级 `request/response` 事件交叉校验;同时给出**去重**(每个 URL 一次)与**未去重**(每个请求一次)字节。`--nocache` 改用 `no-store`,能看到浏览器内重复请求的“未去重”真实值。
- **结果(gzip 传输字节,新窗口空缓存)**:

  | 口径 | 请求数 | 未去重 | 去重 |
  |---|---|---|---|
  | 首屏(`data-ready` 刻) | 39 | **1,010,134 B(986.5 KB)** | **1,010,134 B**(无重复) |
  | 空闲 +5s(含全部按钮状态图预载) | 61 | 1,158,792 B(1131.6 KB) | 1,158,792 B(无重复) |
  | `--nocache`:首屏 | 41 | 1,061,432 B(1036.6 KB) | 1,010,134 B |
  | `--nocache`:空闲 +5s | 72 | 1,274,590 B(1244.7 KB) | 1,158,792 B |

  `--nocache` 下的重复请求:`background-base`、`panel-info@2x`(Pixi 与 CSS 各取一次)以及预载阶段的按钮图;正常缓存头下浏览器缓存命中,不会重复回源。浏览器侧 context 级交叉校验(响应体+响应头)首屏 1,017,854 B,比服务器口径多约 7.7 KB(响应头);context 级请求数比服务器日志多 2(本机未逐条追查是哪两个,不影响字节口径)。
- 本次运行里“仅 context 级可见(Worker 发起)”的请求数为 0;但服务器日志已覆盖任何来源的请求,所以即便有 Worker 贴图也会被计入(对照:旧的 CDP 主线程口径在同一 dist、同一服务器上只统计到 44 个请求 / 471,572 B,而服务器日志是 39 个请求 / 1,010,134 B(首屏时刻)——旧口径明显漏统计;漏的具体是哪些请求本次未逐条追查,两者统计时刻也不完全相同(旧口径等待 8 秒,含预载的一部分),所以只能说“差距很大”,不是精确归因)。
- 首屏最大几项:`symbols-sheet.webp` 358 KB · `pixi` 178 KB(gz)· `logo-A@2x` 58 KB · `reel-frame@2x` 58 KB · `background-base` 47 KB · 应用 JS 35 KB(gz)。懒加载(不在首屏):`background-fs` 56 KB、`background-hs` 34 KB、`logo-B`(切到 B 时)、面板素材 0(面板纯 CSS + 九宫格复用 `panel-popup`)、`default-big` <1 KB gz。`dist/` 共 ≈2.2 MB(未压缩)。
- 相比上一版(按文件清单核算 1003 KB,口径略有不同):合图 −37 KB(395→358);新增首屏素材:入口按钮 normal@2x 8.0 KB、hint-bubble@2x 7.3 KB(pressed@2x 7.4 KB 在空闲预载),logo 由通用 logo 换成 logo-A(58 KB,与原通用 logo 相当)。当前首屏 986.5 KB(<1 MB)。

## 待确认问题(交技术负责人 / 数学 / 策划)
1. **“连消(cascade)”**:需求提到 A 的连消,但 `protocol.ts` / 引擎里**没有任何连消步骤**(A 只有 `A_base_spin / A_fs_enter / A_fs_spin`)。FS 里的“阶梯倍数”(c: ×1→×2→×3→×5,有线赢升级)才是引擎里唯一类似机制,已按它实现。**没有臆造连消**;若策划确实要连消,需要数学先出协议和步类型。
2. **GameEvaluator 契约与引擎实现不一致**:`client.ts` 的 `GameEvaluator{validateConfig,start,advance}` + `createEngine(cfg, evaluator)` 在当前引擎里不存在(引擎是 `createEngine(config)` 直接返回 `Engine`)。本工程的 `GameModule.evaluator` 是对 `EngineEx` 的薄适配(`{id, engine, validateConfig}`),`GameModule` 也扩展了几个字段(`spinPlan / anticipation / begin / restore / reset`,presenters 签名带 `AppPresentContext`)。是否要把 spec 对齐到实际?
3. **`ShowcaseContext.onAmount(cb)`**:签名是“插件传入回调”,我理解为壳子驱动数字滚动、调用插件注册的回调(插件显示数字)。若本意是插件上报数字给壳子,方向相反,请确认。
4. **Jackpot 牌**(B 的 jackpot-bar)显示 `jackpotMult × 当前 bet`,是固定倍数展示,不是累进奖池——与 config 一致,请策划确认文案。
5. **WebP 替代 PNG**(见素材)与首屏预算 <1 MB 的口径:是否按 gzip 后传输字节、是否包含按钮全部状态。
6. **FS 线赢展示**:`FsSpinStep.lineWins[].win` 是未乘倍数的原始值,界面逐线高亮不显示每线金额,只在“×m”浮字与累计赢额里体现倍数。需要逐线金额时要不要显示乘后值(`win × multiplier`)?
7. **B 基础旋转触发后** `B_hs_enter` 里 `locked` 与 `B_base_spin.coins` 相同,表现上是“盘面 C 脉冲 → 清盘 → 锁币逐个弹出”,不是原地锁定;策划是否要原地锁定?
8. **局中禁止切换**是我的判断(见上)。若产品希望“局中也能切、切回续玩”,代码层只需放开 `Shell.switchGame` 的限制(存档与状态已独立),但特色玩法的自动 continue 需要改成可暂停。
9. 大赢档位阈值、`spinSpeed 3400px/s`、`stopStaggerMs`(A 280 / B 260)均为占位数值,待策划调节。
10. `bet % 20 / 10` 已在 config 保证;界面未做 bet 与余额的“按比例”提示以外的限制。

## 部署
`dist/` 纯静态,`vite base './'`,可放 GitHub Pages / Netlify / 任意子路径。本机预览 `pnpm preview`(或 `python3 -m http.server -d dist`)。
本阶段**未**做公网临时暴露(box 上没有现成隧道,也未经授权对外开放)。
