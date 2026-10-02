# Round 3 复测报告(大赢演出 three.js/shader 展示 + 回归)

- 日期:2026-10-02(Asia/Shanghai);被测:`/workspace/slots-app/`(只读,未改任何代码)。
- 构建:`tsc --noEmit && vite build --outDir /workspace/slots-qa/r3/build/prod`(等价 `pnpm build`,输出到 QA 目录以免动 `dist/`;与现有 `slots-app/dist` `diff -r` **完全一致**);`VITE_ENABLE_DEBUG=1 vite build --outDir r3/build/debug`(等价 `build:debug`)。QA 自备 gzip 静态服务器:debug=4174、prod=4175(结束后已关闭)。
- 环境限制:只有软件渲染(SwiftShader),无真机 GPU/iOS/Android/Firefox/WebKit;帧率数字仅供相对比较。
- 本文**增量写入**:每完成一项追加一节。脚本在 `r3/scripts/`,日志 `r3/logs/`,截图 `r3/screenshots/`。

## 进度汇总(随时更新)
| 范围 | 项目 | 结果 | 备注 |
|---|---|---|---|
| 1 | 三档 Big/Mega/Super(max=Super 变体,标题统一) | 通过(1 项 P3:D-09) | 主路径 epic/max 均 SUPER WIN;降级路径 max 为 MAX WIN |
| 2 | 点击跳过 | 通过 | 终值/Idle/无重复入账 |
| 3 | 连播泄漏 | 通过 | 3 组 10/10 PASS |
| 4 | quality low/medium/high | 通过 | 14/14 PASS |
| 5 | reduced-motion | 通过 | 26/26 PASS |
| 6 | 失败降级 | 功能通过 / D-09 | 36 PASS,7 FAIL=6×D-09 + 1×three 库 console.error(非缺陷) |
| 7 | 余额/存档/续局/AUTO/快速停止/切 tab/面板/Esc | 通过 | S1 36、S2 6、S3 24、S4/S5 15 全 PASS |
| 8 | 首屏请求/懒加载/prod 无调试/体积 | 通过 | 19/19 PASS;D-07 已接受 |
| 9 | 回归(含 D-08) | 通过 | D-08 已修复;失败项均为已知脚本问题/环境产物 |

---
## 范围 1:三档 Big / Mega / Super(Max 为 Super 变体)—— 通过(附 1 条缺陷 D-09,见下)
- **触发**:`?force=big|mega|epic|max` 各自自动演示 1 次、tier/showcase 与参数一致(`candy-big/mega/epic/max`)、URL 参数被移除、不改余额(10,000 不变)、刷新不重播;`?force=bigwin` 依次 big→mega→epic→max 4 档(自然时长)。证据 `r3/logs/r3-01b-thresholds-force.log`(7 PASS/0 FAIL)。
- **标题**(three 主路径):网络请求实测 big→`title-big.png`,mega→`title-mega.png`,**epic 与 max 均只请求 `title-super.png`**(+`hero-koi.svg`、`crown.svg`),没有 title-epic/max 请求;截图目视 epic、max 均为「SUPER WIN」(`r3/screenshots/tier-epic-A-t50.png`、`tier-max-B-t50.png`)。**例外:Canvas2D 降级演出 `default-big` 的 max 档标题是「MAX WIN」→ D-09**。
- **多时刻截图**(A、B 各 4 档,t=6/15/30/50/70/88/97% + 整页 `*-pagescreenshot.png`):`r3/screenshots/tier-{big,mega,epic,max}-{A,B}-t*.png`。数字滚动序列单调递增到终值(例 A-epic 0→10838→14649→15979→16000)。32 项 PASS / 0 FAIL(`r3/logs/r3-01-tiers.log`)。
- **阈值**(走真实 `Shell.settle` 分档,边界值):A:19.99→无,20→big,49.99→big,50→mega,99.99→mega,100→epic,499.99→epic,500→max;B:同,max=1000。均符合 `view.ts`(A 20/50/100/500、B 20/50/100/1000)。**真实引擎局**也各档命中(见范围 7:24.4×→big、57.7×→mega、105.3×→epic、A 527×/B 1021× 离线搜到 max 级 seed)。
- **与文档对照(差异,非缺陷)**:设计 v1.2(A/B)、`INTERFACE.md`、`SCAFFOLD.md` **都没有规定大赢倍数阈值**(SCAFFOLD 只说"达到某个 `view.bigWin[].minMult`";`client.ts` 示例 20/50)。UI `slots-ui/assets/bigwin/README.md` 写"阈值 20/50/100/500 占位,待策划确认",且 B 的 max=1000 在 UI 文档里只是"玩法 B …/1000";README 也自述占位。结论:无法判定对错,**需策划确认**;A max=500=封顶 5000×的 10%,B max=1000=封顶 10000× 的 10%,口径一致。另:产品文档称样本最大赢额 A 845.4×、B 2187×,A≥500× 极罕见(离线 35.7 万局普通局找到 1 局 527×)。
- 时长:big 3.5s / mega 5s / epic=max 7s(按 tiers.json,README 已声明与需求原文 4.5/6/8s 的出入)。

## 范围 2:点击跳过 —— 通过
- 合成演出,4 档 × 点击时刻 {30ms(加载/编译期)、400、1200、90% 处},另加重复点击:点击后 60ms 内数字=终值(epic@1200:点前 56,759→点后 123,466);≤0.6s 内结束(实测 180–577ms)、`#showcase` 无残留 canvas、`state=Idle`、`bigwin:start/end` 成对。点击发生在 three 块/素材加载阶段(@30ms)时插件尚未注册 `onAmount`,**画面上从未出现数字**,只做安全收尾(不是缺陷,记录)。真实鼠标点击 + 连点两次:数字=终值,余额不变。`r3/logs/r3-02-skip.log`。
- 真实局(含 FS/H&S 尾部大赢)各时刻点击 → 余额不重复入账,见范围 7 S2。

---

## 范围 5:prefers-reduced-motion(已完成)
- 脚本/日志:`r3/scripts/r3-05-reduced.mjs`、`r3/logs/r3-05-reduced.log`(**26 PASS / 0 FAIL**);截图脚本 `r3-05b-reduced-shots.mjs` → `r3/screenshots/reduced-*.png`。
- 方法:Playwright `reducedMotion: 'reduce'` 与常规各播 big/mega/epic/max 四档(`bigwin:` 调试入口,终值 77777),对比时长、粒子实例数、相机矩阵(震屏/推近)帧间变化、亮度跳变。

| 档位 | reduced 时长 | 常规时长 | reduced 粒子/实例峰值 | 常规 | reduced 相机变化 | 常规 | 亮度最大跳变 reduced / 常规 |
|---|---|---|---|---|---|---|---|
| big | 2504ms | 4094ms | 20 | 350 | 0 | 1.546 | 46.1 / 92.1 |
| mega | 2345ms | 5412ms | 32 | 560 | 0 | 5.098 | 49.0 / 119.9 |
| epic | 2397ms | 7477ms | 40 | 700 | 0 | 8.985 | 42.6 / 64.3 |
| max | 2417ms | 7452ms | 48 | 840 | 0 | 9.251 | 36.7 / 56.0 |

- 结论 **PASS**:reduced 下四档均 ≈2.4s(含素材/着色器首次编译)、强制 low 档(`reason=ok, quality=low`)、粒子 ≤48、相机矩阵完全不动(无震屏/推近)、亮度跳变与峰值均低于常规(闪白被关)、终值正确显示、演出正常 resolve、两轮无 console error。
- 说明:软渲染下总时长含加载与着色器编译,不能代表真机;reduced 的帧数少(仅 1 帧被采样到相机矩阵,故"相机变化=0"同时也与帧数少相关,但常规路径同方法能测到非零值,且 reduced 的相机在 low 路径本就不动,判为通过)。

---

## 范围 7:大赢期间的余额 / 存档 / 刷新续局 / AUTO / 快速停止 / 切 tab / 设计说明面板 / Esc(已完成)
- 脚本/日志:`r3/scripts/r3-07-behaviors.mjs`(S1–S5);`r3/logs/r3-07-S1.log`(36 PASS/0 FAIL)、`r3-07-S2.log` + `r3-07-S2-at100.log`(6 PASS/0 FAIL)、`r3-07-S3.log`(24 PASS/0 FAIL)、`r3-07-S4S5b.log`(AUTO/其它,**15 PASS/0 FAIL**,另有 1 条 NOTE)。全部走真实旋转(种子局),A/B × 普通/购买 × big/mega/epic。

### 7.1 余额(显示 vs 真实 vs 存档,commitDisplayBalance)— PASS
- 12 例(A/B × normal/buy × big/mega/epic):最终 真实=显示=DOM=localStorage=bal0−cost+win。
- 演出期间:存档与真实余额**已含赢额**(先落盘),**显示余额停在演出前扣费后的值**(如 9,900),直到 `bigwin:end` 之后才 `balance:change{reason:'win'}` **恰好 1 次**(commitDisplayBalance);Pixi 赢额条 = 本局总赢。事件序:`round:start → balance:change(charge) → feature:enter → round:end → bigwin:start → bigwin:end → balance:change(win)`。
- 点击跳过(@100ms/1500ms/3500ms,A normal / B normal / A buy):数字=终值、余额无重复入账、commit×1、bigwin start/end 各 1、回 Idle、赢额条=总赢。(@100ms 的首轮 3 个 FAIL 是脚本判据——点击早于插件首帧、画面尚无数字;改判后 `AT=100` 重跑 6/6 PASS。)

### 7.2 存档与刷新续局 — PASS(24/24)
- 刷新时机:旋转后 250ms / 演出开始后 150ms / 演出开始后 2500ms,A normal / B normal / A buy / B buy:
  - 旋转 250ms 刷新:存档处于 `A_fs_enter/A_fs_spin/B_hs_enter/B_hs_respin` 等特色中间态,刷新后续局完成,最终余额 = bal0−cost+win,**只入账一次**,无第二次扣费(无第二个 `round:start`)。
  - 演出开始后刷新:局已落盘,刷新后为 Idle、余额已含赢额、显示=真实=LS、**不重播演出**、赢额条归 0(与 README 描述一致)。观察:玩家刷新后看不到"已错过的大赢演出",属设计取舍,不判缺陷。

### 7.3 AUTO — PASS
- 单步大赢(A:As16 21×;B:Bs727 40×):演出期间 AUTO 保持开启、**不开新局**(演出前仅 1 局);演出结束后 AUTO 继续(2.5s 内出现新 `round:start`,剩余次数 10→9)。
- AUTO 遇到 FS / H&S:AUTO 按原规则关闭,随后的大赢演出结束后不续转(`round:start` 仅 1 次)。
- 演出期间点 AUTO 按钮位置 = 跳过演出,AUTO 仍在运行(不会误停 AUTO,也无法在演出期间停 AUTO;观察记录)。

### 7.4 快速停止 — PASS
- 点 STOP 加速停轴后仍正常出大赢(A An80 24.4×、B Bn495 31×),结果倍数不变,点击跳过后余额=预期(12,340 / 11,500),无重复入账。
- Turbo:big 演出 2595ms(判据仅为"明显短于常规上限 3.5s",含冷启动与软渲染,**无法精确验证 ×0.5**;精确系数由单测 `showcaseDurationMs` 覆盖,此处只做粗判)。

### 7.5 切玩法/切 tab — PASS
- 演出期间 HUD 按钮(auto/spin/bet+/buy/menu/turbo/设计说明/tab-B)全部被 `#showcase` 遮罩盖住(点击 = 跳过演出,不会误触);`switchGame('B')` 被拒(返回 false,仍为 A)并有提示「局中不能切换玩法,请先完成本局」;回 Idle 后可切到 B,B 存档未被改动。
- 未测:浏览器真实"标签页进入后台/可见性变化"的节流行为(headless 无法可靠模拟,见"受限"一节)。

### 7.6 设计说明面板与 Esc
- 演出中把焦点用脚本移到「设计说明」入口再按 Enter(键盘路径),可以把设计说明面板强行打开(NOTE;真实玩家需先用 Tab 聚焦被遮罩盖住的按钮,可能性很低):面板 z-index 1001 > `#showcase` 820,所以面板盖在演出之上,**演出不受影响继续**;演出中打开面板后 Esc 关闭面板且不影响演出(PASS)。通过鼠标无法触达(顶栏按钮被遮罩盖住)。仅记录现状,不判缺陷。
- Esc 在大赢演出中:不报错、演出继续(**Esc 不是跳过键**;文档未规定,记录现状)。
- D-08(点遮罩/标题后 Esc)见下"回归 / D-08"一节。
- 截图:`r3/screenshots/reduced-{big,mega,epic,max}-t{约600,约1150,约1700}ms.png`(`r3/logs/r3-05b.log` 记录每张的数字与遮罩不透明度;终帧数字=77777,无闪白)。

---

## 范围 6:失败降级(回退 Canvas2D `default-big`)(已完成)
- 脚本/日志:`r3/scripts/r3-06-fallback.mjs`、`r3/logs/r3-06-fallback.log`(**36 PASS / 7 FAIL**:其中 6 项是同一缺陷 D-09 在 6 个场景的重复命中,1 项是 three 库自己的 console.error,见下);第一次运行因脚本把种子对象当字符串传(`seed=[object Object]`)导致"真实局"项判据无效,已修正并保留旧日志 `r3-06-fallback.run1-badseed.log`。回退中途截图见 `r3/screenshots/fallback-shot-*.png`、`fallback-*-after-real.png`。
- 方法(debug 构建,`playBigWin(tier)` 合成 + 一局真实大赢 As16=21×,A 玩法):
  1. `nogl`:`getContext('webgl*')` 返回 null(模拟无 WebGL);2. `three-chunk-abort`:route.abort three 块;3. `candy-chunk-abort`:abort candy(index)块;4. 双块 abort;5. `atlas-abort`:abort `particles-atlas.webp`;6. `chunk-404`:three 块返回 404;7. 演出中途 WebGL context lost;8. 浏览器 `--disable-gpu --disable-webgl` 启动(仅记录)。

| 场景 | 回退 backend / reason | big/epic/max 耗时 | 不卡流程 | 真实局入账 +2000、显示=真实、回 Idle | epic 标题 | max 标题 |
|---|---|---|---|---|---|---|
| nogl | fallback / `webgl:THREE.WebGLRenderer: Error creating WebGL context.` | 3.6s / 7.1s / 7.1s(≈名义时长) | ✔ | ✔(12.2s 走完) | SUPER WIN ✔ | **MAX WIN ✘(D-09)** |
| three 块 abort | fallback / `chunk-load-failed` | 3.8 / 7.2 / 7.2s | ✔ | ✔ | ✔ | ✘ |
| candy 块 abort | fallback / `chunk-load-failed` | 3.8 / 7.1 / 7.2s | ✔ | ✔ | ✔ | ✘ |
| 双块 abort | fallback / `chunk-load-failed` | 3.8 / 7.2 / 7.1s | ✔ | ✔ | ✔ | ✘ |
| atlas abort | fallback / `assets:load …particles-atlas.webp` | 3.7 / 7.1 / 7.1s | ✔ | ✔ | ✔ | ✘ |
| chunk 404 | fallback / `chunk-load-failed` | 3.8 / 7.3 / 7.3s | ✔ | ✔ | ✔ | ✘ |
| context lost(演出中) | fallback / `context-lost` | 5.9s 内 resolve | ✔(Idle) | — | — | — |

- 每个场景:回退后 `#showcase canvas` 数 0、遮罩已关、`isBusy=false`、UI 回 Idle;真实局事件序 `round:start>balance:change>round:end>bigwin:start>bigwin:end>balance:change`,余额 10,000→12,000(+赢额−投注 = +2,000),显示=真实=LS;无未捕获异常(pageerror)。
- **结论 PASS(功能性)**:任何一种加载/WebGL 失败都会在原定时长内回退为 Canvas2D 的 BIG/MEGA/SUPER 标题 + 数字滚动,不卡流程、余额入账正确、回 Idle。context lost 中途也能回退并 resolve。
- **缺陷 D-09(P3,新)**:回退路径 `max` 档标题为 **「MAX WIN」**,与"max 标题统一为 SUPER WIN"(README、`timeline.ts`、three 路径均如此)不一致——六个回退场景全部复现。详见 `defects.md` D-09。
- 观察 N-R3-1(不判缺陷):`nogl` 场景 three.js 自己向 console.error 打印 `THREE.WebGLRenderer: Error creating WebGL context.`(每次尝试一条,已被应用捕获并回退),不是未捕获异常;生产监控若以 console.error 计数需注意。其余 5 个场景 0 条 console.error。
- 观察 N-R3-2:`--disable-gpu --disable-webgl` 启动整个应用时,应用仍能进入 ready(`data-ready`)且无报错(Pixi 主舞台回退情况与大赢演出无关,仅记录,未进一步测)。

---

## 范围 8:首屏请求、懒加载时机、prod 无调试、首屏体积(已完成)
- 脚本/日志:`r3/scripts/r3-08-firstscreen.mjs`、`r3/logs/r3-08-firstscreen.log`(**19 PASS / 0 FAIL**;前两次运行因脚本问题——种子对象误当字符串、存档注入未带 RNG 状态、选了需要 10 步的免费旋转种子导致 20s 内等不到大赢——判据无效,日志保留为 `*.run2-nostate.log`、`*.run3-fsseed.log`);`pnpm measure` 副本 `r3/logs/r3-pnpm-measure.{log,json}`;prod 截图 `r3/screenshots/prod-bigwin-early.png`、`prod-bigwin-late(.png`。
- 全部在 **prod 构建**(`r3/build/prod`,与 `slots-app/dist` `diff -r` 一致)上测,服务器带 gzip、no-store。

### 8.1 首屏无 three / bigwin / showcase 请求 — PASS
- `data-ready` 时刻(约 1.1s,软渲染)及其后 3s:匹配 `assets/three-* | candy 块(index-CHMVNXUN.js) | default-big-* | bigwin/*` 的请求 = **0**。`pnpm measure` 首屏与空闲 +5s 的"大赢演出相关请求"也均为 0。
- 首屏 10s 无 console error / pageerror(仅 SwiftShader 的 `GPU stall due to ReadPixels` 警告,环境产物)。

### 8.2 懒加载时机 — PASS(含一条与字面要求的偏差观察)
- **预取**(`schedulePrefetch`,README 所述 data-ready+8s,再等 requestIdleCallback ≤6s,插入 `<link rel=prefetch as=script>`):实测 ready 后约 14.6s 出现且**仅**两个 JS 块 `three-CmTFYVpb.js`(gz≈127 KB)与 `index-CHMVNXUN.js`(candy,gz≈17 KB),**不预取任何 bigwin 美术素材**(PASS)。即预取后首屏之外多出 ≈144 KB 低优先级流量;`prefetch` 只下载不执行。
- early(ready 后 0.8s 内就点 SPIN,尚未预取):大赢前请求 0;大赢时才请求 three+candy 两个 JS 块 + 美术(`particles-atlas.json/.webp`、`ray.png`、`ramp-big.png`、`noise-256.png`、`title-big.png`),演出正常出现。
- late(ready 后 17s,预取之后):大赢前仅有两个预取的 JS 块、无美术;大赢时才请求美术(同上),演出正常出现。
- 偏差观察 **N-R3-3**:需求字面是"首屏不请求 three,仅大赢时才懒加载";实现为"首屏之后 ~8–14s 空闲预取 JS(省流量/2g-3g/低端/无 WebGL2 跳过)"。这是 README 明确写了的设计取舍,首屏口径未受影响,按设计文档化,不判缺陷;如产品要求"绝对不预取"需确认。

### 8.3 prod 构建无调试代码且调试开关无效 — PASS
- prod 包内 grep:**无** `playBigWin`、`showcaseLast`、`bigwinDemo`;`window.__slots` 在 prod 不存在。
- 带 `?reset=1&game=B&seed=abc&force=epic&quality=low&lang=en&noprefetch` 访问 prod:余额 12,345 保留(reset 无效)、仍为玩法 A、界面仍为中文、1.5s 内无演出且无 showcase 请求(force 无效)、URL 未被改写(参数被忽略而非消费)。
- 观察 **N-R3-4**:prod 包里仍有 `parseDebug` / `force.ts`(fs/hs 强制状态)的代码和 `window.__slots=` 赋值语句,被运行时 `enabled=false` 守卫(上面的实测证明无效)。README 称"prod 没有此类代码"只对 `playBigWin` 成立;不影响行为,仅记录(想要彻底剔除需把守卫改成构建期常量)。

### 8.4 首屏体积 — 与 R2 同量级,D-07 记"已接受"
- 官方口径 `pnpm measure`(副本,对 dist):首屏 **39 请求 / 1,013,863 B(990.1 KiB ≈ 1.014 MB 十进制)**,无重复;空闲 +5s 61 请求 / 1,162,521 B。我自测(390×844 dsf2,no-store gzip 服务器)首屏含重复 41 请求 1,065,161 B,去重 39 / 1,013,863 B,与 measure 逐字节一致;空闲 72/1,278,319,去重 61/1,162,521。
- 对比 R2 的 1,010,134 B:**+3,729 B**(+0.37%)。showcase 本身不在首屏(three 126 KB gz、candy 17 KB gz、美术均懒加载)。增量归因未做逐模块分析(推测为 main 内的 showcase 接入/预取调度代码,未验证)。
- 预算口径:以 1 MB(1,000,000 B 十进制)为线则仍略超 1.4%、以 1 MiB 则余量 ≈ 3.3%;你已接受 ~1.01 MB,**D-07 记"已接受,不再追踪"**。

---

## 范围 3:连播泄漏(GL 资源 / context / DOM / 监听 / dispose)(已完成)
- 脚本/日志:`r3/scripts/r3-03-leak.mjs`(参数 mode N quality);三组最终日志 **各 10 PASS / 0 FAIL**:`r3/logs/r3-03-leak-mixed-high.log`(20 次,1/4 完整播完 + 3/4 点击跳过,high)、`r3-03-leak-skipfast-low.log`(20 次快速跳过,low)、`r3-03-leak-natural-medium.log`(10 次完整播完,medium);原始序列 `*.series.json`、`*.results.json`。每组按 big/mega/epic/max 轮换。
- 方法:每次演出前后采样——引擎资源登记表(renderer/geometry/material/texture/render target 的 created/disposed)、`renderer.info`、WebGL 黑盒计数(hook `createX/deleteX`)、存活 WebGL context 列表、DOM 节点数与 `#showcase canvas`、CDP `DOMCounters` 监听器数、强制 GC 后 JS 堆。

| 判据 | mixed/high ×20 | skipfast/low ×20 | natural/medium ×10 |
|---|---|---|---|
| session 全部 disposed | 20/20 | 20/20 | 10/10 |
| 引擎登记 created==disposed | renderer 20/20、geometry 250/250、material 290/290、texture 160/160、target 160/160 | 20/20、205/205、205/205、160/160、0/0(low 无后处理) | 10/10、123/123、143/143、78/78、80/80 |
| 最后一次 dispose 后 `renderer.info` | geometries/textures/programs = 0 | 0 | 0 |
| 黑盒 Buffer/Program/Shader/VAO create==delete | 665/665、230/230、460/460、290/290 | 590/590、145/145、290/290、205/205 | 329/329、115/115、230/230、143/143 |
| `#showcase` 内同时最多 WebGL context | 1 | 1 | 1 |
| 演出结束后存活 context | 回到基线 2(Pixi 主舞台 + 应用启动自带的非 DOM 0×0 探测 context) | 同 | 同 |
| DOM 节点(首次→末次)/ 残留 showcase canvas | 77→80 / 0 | 77→80 / 0 | 77→80 / 0 |
| 事件监听器(首→末,基线 107) | 116→116 | 116→116 | 116→116 |
| JS 堆(GC 后,初始→末;软渲染,仅参考) | 5.9→9.2 MB(Δ3.3) | 5.9→8.9 MB(Δ3.0) | 5.9→9.0 MB(Δ3.1);第 1 次后即 ≈8.0–8.3 MB,之后不再增长 |
| console error / "Too many active WebGL contexts" | 0 | 0 | 0 |

- **结论 PASS(无泄漏)**:几何/着色器/缓冲/VAO 完全释放;每次演出独立创建并 `forceContextLoss` 销毁 renderer,同时只有 1 个 showcase context,连续 20 次不触发浏览器的 context 上限警告;监听器与 DOM 不累积;堆在首次演出后趋于平稳。
- 观察 **N-R3-7**(不判缺陷):黑盒显示每个 session 固定遗留 Texture 4 个、Framebuffer 3 个未被显式 `delete`(three.js 内部的 empty texture / 内部 FBO,在 `forceContextLoss` 时随 context 一起释放;per-session 增量在所有档位、所有次数下完全恒定,不随次数增长)。如果以后改为长期复用同一个 context,需要重新评估。
- 限制:软件渲染(SwiftShader)下无法测显存/真机 GPU 内存;仅用 JS 堆、GL 对象计数做代理指标。

---

## 范围 4:`?quality=low|medium|high` 降级(已完成)
- 脚本/日志:`r3/scripts/r3-04-quality.mjs`、`r3/logs/r3-04-quality.log`(**14 PASS / 0 FAIL**);自适应降档 `r3-04b-auto-degrade.mjs` → `r3/logs/r3-04b-auto-degrade.results.json`(2 项 ok)。debug 构建(`?quality=` 仅 debug 有效,prod 已在范围 8 验证无效)。
- 方法:强制 `?quality=X`(关闭自适应)后各播 big/mega/epic/max,记录 `showcaseLast`(backend/quality)、最大绘制实例数(粒子+背景件)、后处理 FBO 绑定数、视口、软渲染帧间隔。

| 档位 | 最大实例数 big / mega / epic / max | 后处理(FBO 绑定) | backend / quality | 软渲染帧率(参考) |
|---|---|---|---|---|
| low | 75 / 120 / 150 / 180 | 无(0) | three / low | ≈12 fps(中位帧间隔 ≈70ms) |
| medium | 190 / 304 / 380 / 456 | 有(≈96–114) | three / medium | ≈4 fps(≈220ms) |
| high | 350 / 560 / 700 / 840 | 有(≈128–144) | three / high | ≈4 fps(≈220ms) |

- 判据全部 PASS:三档均 backend=three、quality 与设置一致、4 档位各自跑完无 console error/pageerror;实例数严格 low<medium<high;low 关闭后处理,medium/high 开启。
- 渲染分辨率(viewport):low 432×768,medium/high 在 540 CSS px 视口下均被设备像素封顶为 540×960(即 high 与 medium 在小屏上分辨率相同,差异在粒子数/后处理强度)。
- **自适应降档**(不带 `?quality`,软渲染约 4 fps):完整播完 mega、epic 后 quality 从 high 自动降到 **medium**;big(3.5s,仅约 14 帧,不足以触发"连续 15 帧过慢")保持 high。降档只在本次 session 内生效,不跨 session 记忆(观察/建议,不判缺陷)。
- 限制:SwiftShader 软渲染,帧率仅用于三档相对比较;真机 GPU 的实际流畅度、发热、掉帧无法测。

---

## 范围 9:回归(已完成)
所有回归脚本均为 R1/R2 脚本的**副本**(`r3/scripts/r3-qa-*.mjs`、`r3-e2e*.copy.mjs`),不改原文件;交互类跑在 debug 构建(4174),`qa-07` 的 prod 项跑在 prod 构建(4175)。日志在 `r3/logs/`。

| 回归项 | 结果 | 证据 |
|---|---|---|
| `pnpm test`(vitest) | **10 文件 / 88 用例全过** | `r3-app-test.log` |
| `pnpm typecheck` | 通过(0 错误) | `r3-app-typecheck.log` |
| build prod / debug | 通过;prod 与 `slots-app/dist` `diff -r` 完全一致 | `r3-build-prod.log`、`r3-build-debug.log` |
| 应用自带 `e2e.mjs` | **50/50** | `app-e2e.log` |
| 应用自带 `e2e-new`(含设计说明面板 A/B 内容、Tab 切换) | **43/43** | `app-e2e-new.log` |
| `e2e:hs`(H&S 步骤同步) | 8 个 step:end 检查,0 失败 | `app-e2e-hs.log` |
| `e2e:showcase`(应用自带大赢专项,对 debug **构建**跑) | 29 通过 / 1 失败(见下"环境产物") | `app-e2e-showcase.log` |
| qa-02 视口(7 个手机/平板视口:布局、字号、弹窗在视口内) | **35/0** | `r3-qa-02-viewports.log`、`r3-viewport-metrics.json`、`vp-*.png` |
| qa-03 玩法 A 核心流 | 首跑 32/1(A-05-retrig 横幅空串,与其它并发进程同时跑);**隔离重跑 33/0** | `r3-qa-03-flowA.log` / `.rerun.log` |
| qa-04 玩法 B 核心流 | **25/0** | `r3-qa-04-flowB.log` |
| qa-05 存档/刷新续局 | 34/1(SAVE-04-last-game-B 为 R1/R2 即已知的脚本断言问题,见下);SAVE-01/02/03 各步刷新续局、不重复扣费/发奖全 PASS | `r3-qa-05-save.log` |
| qa-07 文案 + prod 控制台 | 首跑 4/1(LOG-01-prod 出现 `btn-*@2x.webp ERR_ABORTED`,即 R2 的 N-4);**隔离重跑 5/0**(N-4 未复现) | `r3-qa-07-text-prod.log` / `.rerun.log` |
| qa-08 杂项(余额/AUTO/菜单…) | 首跑 22/2,隔离重跑 **23/1**(A-06 toast 空串已转 PASS;仅剩 AUTO-01,见下) | `r3-qa-08-misc.log` / `.rerun.log` |
| qa-09 手机特色玩法 | **4/0** | `r3-qa-09-mobile-feature.log` |

### 关键点
- **购买价**:A 确认框 `48 × 100 = 4,800`、B 确认框 `85 × 50 = 4,250`(BUY-01-A/B PASS);确认框含免责声明原文「购买功能仅为演示。在部分真钱市场该功能可能不被允许。」与"购买后余额"(BUY-02);取消不扣费;扣费恰一次、购买局每步先存档(BUY-03)。主界面购买钮显示「购买免费旋转 48× = 4,800」(截图 `portrait-430x932-big.png`)。
- **「糖果门」文案**:FS 进入横幅「糖果门开启!获得 8 次免费旋转」、重触发「糖果门再次出现 +5 次」;运行时抓取的 164–166 段 UI 文本(中英)无旧称「龙门/牌坊/Dragon」,「糖果门」出现 5 段、en「Candy Gate」1 段(TXT-02/02b PASS)。顶栏提示「集齐 3 个「糖果门」触发免费旋转」(截图可见)。
- **刷新续局**:qa-05 与范围 7 S3(24/24)均 PASS;**余额不足**:BAL-02(余额 60<投注 100 → SPIN 置灰并提示「余额不足以支付当前下注」)、AUTO-02(余额不足时 AUTO 停止并提示)PASS。
- **控制台**:各脚本 0 个 console.error / pageerror(除下面的环境产物);唯一的告警是 SwiftShader 的 `GPU stall due to ReadPixels`(软渲染产物)。
- **设计说明面板 sanity**:`e2e-new` 覆盖 A/B 内容、Tab 切换、滚动(截图 `design-panel-*.png`),43/43 PASS;大赢演出期间面板层级见范围 7.6。
- **D-08(Esc)**:`r3/scripts/r3-05-esc.mjs`(`r3-05-esc.log`)**6/6 PASS**——打开后直接 Esc、点遮罩后 Esc(焦点=BODY)、点标题后 Esc(焦点=BODY)、点卡片文字后 Esc、切 Tab 后 Esc、滚轮后 Esc,均能关闭。**D-08 已修复**。
- **D-01~D-06 抽查**(未回退):D-01 BAL-03 确认框 PASS;D-02 7 个视口免责声明/提示行字号均 11px(768 宽提示行 13.9px),见 `r3-viewport-metrics.json`;D-03 截图目视 A 玩法 logo 为「糖果锦鲤池 Candy Koi Pond」;D-04 prod 包内搜索无「锦鲤珍珠 Wild」;D-05 AUTO-03 次数选择菜单 PASS;D-06 AUTO-04 间隙点 + 号后 AUTO 停止 PASS。
- **竖屏 showcase 布局**(`r3-09-portrait.mjs`、`r3-09b-portrait-big.mjs`,日志 `r3-09-portrait*.log`):360×640、390×844、430×932 下 big/mega/epic/max 全部 12 个组合,`#showcase canvas` 与 `#stage` 位置与尺寸一致(例 390×844:x0 y75.3 390×693.3;360×640:0,0 360×640;430×932:0,83.8 430×764.4),无横向滚动(scrollWidth = 视口宽),backend=three,无 console error。截图 `r3/screenshots/portrait-{360x640,390x844,430x932}-{big,mega,epic,max}.png`、`portrait-*-big-warm.png`、`portrait-*-big-b.png`。标题/数字/倍数居中且完整(epic/max「SUPER WIN」+ 数字 + 倍数徽章)。脚本首轮 3 个 FAIL(big 档)是判据问题:首次 `playBigWin` 前 `showcaseLast` 为 null,几何本身一致;big 档因软渲染下截图耗时 2.6–3.5s,需在数字开始滚动后立即截图,改用 `r3-09b` 重拍,三个视口 big 布局均正常。

### 失败项逐条说明(均非新缺陷)
1. `qa-08 AUTO-01`(开 AUTO 后触发 FS,快照 autoOn 在断言时刻仍为 true):R1/R2 即存在的**脚本时序问题**;R3 用更可靠的判据(范围 7.3 `AUTO-feature-A/B`)证明 AUTO 在 FS/H&S 触发时被关闭、之后不续转,PASS。
2. `qa-05 SAVE-04-last-game-B`:R1/R2 即已知的脚本断言问题(范围 7 S3 与 qa-05 其余项均证明刷新后玩法与存档正确)。
3. `e2e:showcase`「降级: three 块加载失败 → 回退」:该脚本按 dev 服务器路径 `showcase/candy/index` 拦截,在打包(哈希文件名)的构建上拦不到,故 three 照常运行;**环境产物**。同一场景用真实哈希文件名在范围 6(`three-chunk-abort`、`candy-chunk-abort`、`both-chunks-abort`、`chunk-404`)中全部回退成功。
4. 并发注意:首跑时多个脚本并行,带来 A-05-retrig / A-06 / N-4 的偶发,隔离重跑均消失。

---

## 受限 / 未测
- 仅 SwiftShader 软渲染:无法评估真机 GPU 帧率、发热、显存;三档帧率数据只作相对比较。
- 未测:iOS Safari / Android 真机 / Firefox / WebKit、真机触摸与多点、横屏(未做,已知非缺陷)、标签页进入后台时的节流与恢复(headless 无法可靠模拟)。
- 三档美术阈值(A 20/50/100/500×、B 20/50/100/1000×)与设计文档无对照项(v1.2/INTERFACE/SCAFFOLD 均未规定大赢阈值,只有 client.ts 示例与 UI 的 bigwin README 占位"待策划确认"),仅验证了实现自身一致(边界值 20/50/100/500、20/50/100/1000 全部符合 `view.ts`)。
- 官方赔付表占位、公网部署:已知非缺陷,未测。
- 测试服务器为自建静态服务器(gzip、no-store),体积为 gzip 口径,与真实 CDN 可能不同。

---

## 缺陷汇总(R3)
| ID | 严重度 | 标题 | 状态 |
|---|---|---|---|
| D-09 | P3 | 回退(Canvas2D)路径下 max 档标题为「MAX WIN」,与统一的「SUPER WIN」不符 | 新增,未修复(详见 `defects.md`) |
- 本轮未发现 P0/P1/P2。
- **D-07**(首屏体积 ~1 MB 预算):**已接受**(首屏 1,013,863 B ≈ 1.01 MB,较 R2 +3,729 B;showcase/three/美术均不在首屏)。
- **D-08**(设计说明面板 Esc):**已修复**(6/6 PASS)。

## 结论
**Conditional accept(有条件通过)**:范围 1–9 的功能、资金正确性、跳过、泄漏、质量降档、reduced-motion、失败回退、懒加载与 prod 无调试均通过;未发现 P0/P1/P2。唯一新增缺陷 D-09(P3,仅回退路径+max 档标题)建议顺手修(`default-big.ts` 一行);如产品坚持"标题统一"为硬性要求,可将其升为 P2 后再 accept。需策划确认的非缺陷项:三档阈值、prefetch 是否允许(N-R3-3)。真机性能与浏览器兼容未覆盖。
