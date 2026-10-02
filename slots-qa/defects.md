# 缺陷清单(slots-app 验收)

- 测试日期:2026-10-01(Asia/Shanghai);被测:`/workspace/slots-app/`(prod 构建与现有 `dist/` `diff -r` 完全一致;交互用例跑在 `build:debug` 构建上)
- 严重度口径:P0 阻断(崩溃/资金错误/无法游玩);P1 严重(核心规则与文档不符);P2 一般(明确违反文档/影响可用性,有绕过方式);P3 轻微(体验、文案、文档、可后续优化)
- **未列入缺陷的事项**(已知未做/已决设计)见 `report.md` §6。
- 统计(第一轮):**P0=0,P1=0,P2=2,P3=5**,共 7 条。
- **统计(复测 Round 2,2026-10-02):D-01~D-06 已修复,D-07 部分修复(P3),新增 D-08(P3);当前未关闭:P0=0,P1=0,P2=0,P3=2(D-07、D-08)。** 详见 `retest_report.md`。
- **统计(复测 Round 3,2026-10-02,新增 three.js/shader 大赢演出):D-08 已修复;D-07 已接受(~1.01 MB,不再追踪);新增 D-09(P3)。当前未关闭:P0=0,P1=0,P2=0,P3=1(D-09)。** 详见 `retest_r3_report.md`。

| ID | 严重度 | 标题 | R2 复测状态 | R3 复测状态 |
|---|---|---|---|---|
| D-01 | P2 | 菜单「重置演示币」点击即重置,没有确认框 | 已修复 | 已修复(R2,R3 未回退) |
| D-02 | P2 | 手机视口下免责声明/提示行字号过小,几乎不可读 | 已修复 | 已修复(R2,R3 未回退) |
| D-03 | P3 | 玩法 A 画面的 logo 下方显示玩法 B 的名称「金鲤满仓」 | 已修复 | 已修复(R2,R3 未回退) |
| D-04 | P3 | 打包产物 `atlas.json` 残留旧称描述「W 锦鲤珍珠 Wild」 | 已修复 | 已修复(R2,R3 未回退) |
| D-05 | P3 | AUTO 没有次数选择(10/25/50/100/直到特色) | 已修复 | 已修复(R2,R3 未回退) |
| D-06 | P3 | AUTO 间隙调整投注不会停止 AUTO | 已修复 | 已修复(R2,R3 未回退) |
| D-07 | P3 | 首屏体积处于 1 MB 预算临界,且 `pnpm measure` 低估 | 部分修复 | **已接受**(首屏 1,013,863 B ≈1.01 MB,较 R2 +3,729 B;showcase 不在首屏) |
| D-08 | P3 | 设计说明面板:点过遮罩/标题后按 Esc 不能关闭(R2 新增) | 新增(未修复) | **已修复**(R3 实测 6/6 PASS) |
| D-09 | P3 | 大赢演出回退(Canvas2D)路径下 max 档标题为「MAX WIN」,与统一的「SUPER WIN」不符(R3 新增) | — | **新增(未修复)** |

---

## D-01【P2】菜单「重置演示币」点击即重置,没有确认框

> **【复测 Round 2 · 2026-10-02】状态:已修复**
> 菜单「重置演示币」→弹出确认框(标题「重置演示币」,「确定要把余额重置为 10,000 演示币吗?当前余额将被覆盖。」,按钮 取消/确认重置)。A、B 两玩法实测:取消→余额保持 13,100(显示+落盘);确认→10,000(显示+落盘);点遮罩=取消(12,345 不变);FS 中重置钮仍置灰。证据:`r2/logs/r2-01b-d01.results.json`(11/11)、`r2/screenshots/D01-reset-confirm-A.png`。
- **现象**:菜单里点「重置演示币」,余额立刻变回 10,000,菜单关闭,没有任何确认弹窗。
- **复现步骤**:
  1. 打开 `?game=A`(任意玩法皆可),完成若干局让余额不等于 10,000(例如赢到 13,100)。
  2. 空闲状态点右下菜单按钮 → 点「重置演示币」。
  3. 观察:没有确认框,余额直接变成 10,000,且已写入 localStorage。
  - 自动化:`scripts/qa-08-misc.mjs` 的 `BAL-03-confirm-A/B` 两项 FAIL(日志 `logs/qa-08-misc.log`)。代码依据:`src/ui/Popups.ts` 的 `reset.onclick = () => { o.onReset(); this.close(); }`。
- **影响范围**:A、B 两个玩法共用钱包。余额高于 10,000 的玩家误点一次就会丢失余额,不可撤销。重置本身(只在空闲可用,旋转/FS/H&S/购买确认中置灰)是对的。
- **截图**:`screenshots/BAL-03-menu-A.png`、`screenshots/BAL-03-menu-B.png`(菜单界面,可见按钮下面没有二次确认提示);`screenshots/BAL-03-menu-reset-disabled-in-FS.png`(特色玩法中置灰,此项正确)
- **按文档的预期**:`GameA_锦鲤_5轴线赢_FreeSpins.md` §10.1(第 281 行)"菜单(btn-menu)内提供「重置余额」:点击后**弹出确认框**,确认则余额恢复为 10000";GameB §9.1 同。
- **建议**:加确认框;或由产品确认演示版可以省略,并更新文档。

## D-02【P2】手机视口下免责声明/提示行字号过小

> **【复测 Round 2 · 2026-10-02】状态:已修复**
> 7 个视口(320/360/375/390/412/430/768)免责声明实际渲染字号均为 11px(原 5.6–7.6px),提示行 11px(768 宽 13.9px),购买确认框 .fine 11px;免责声明单行、在视口内、未截断、不与购买钮重叠。取 ≥10px 为通过线(无文档规定最小字号)。证据:`r2/logs/r2-viewport-fonts.json`、`r2/screenshots/D02-*.png`。
- **现象**:舞台是 1080×1920 逻辑画布整体等比缩放,免责声明(逻辑字号 19px,字重 400)在手机上被缩到约 6–8 CSS px,基本无法阅读。主界面的状态提示行(逻辑字号约 26px)也只有 7.7–10.4 px。
- **实测字号**(`logs/viewport-metrics.json`,按实际渲染测量):

  | 视口 | 缩放 | 免责声明 | 提示行 | 顶部 tab 高 |
  |---|---|---|---|---|
  | 320×568 | 0.296 | 5.6px | 7.7px | 18px |
  | 360×640 | 0.333 | 6.3px | 8.7px | 21px |
  | 375×667 | 0.347 | 6.6px | 9.0px | 22px |
  | 390×844 | 0.361 | 6.9px | 9.4px | 22px |
  | 412×915 | 0.381 | 7.2px | 9.9px | 24px |
  | 430×932 | 0.398 | 7.6px | 10.4px | 25px |
  | 768×1024 | 0.533 | 10.1px | 13.9px | 33px |

  购买确认框里的 `.fine` 说明文字(逻辑 20px)同样只有约 7–8px。
- **复现步骤**:Playwright 视口 360×640 打开 `?game=A`,看底部的"购买功能仅为演示……"一行;或点购买按钮看确认框。几何测量由 `scripts/qa-02-viewports.mjs` 产出。
- **影响范围**:全部手机竖屏用户;购买入口的免责声明是文档要求"必须显示"的合规文案,虽然显示了,但在 320–430 宽手机上几乎读不出来。其余所有控件在各视口都在可视区内、没有被遮挡(UI-01 通过)。
- **截图**:`screenshots/vp-360x640-A-idle.png`、`screenshots/vp-360x640-buy-confirm.png`、`screenshots/vp-390x844-A-idle.png`、`screenshots/vp-320x568-A-idle.png`
- **按文档的预期**:A §8 / B §8 要求购买入口常显免责声明,SCAFFOLD §3 要求竖屏适配。没有规定最小字号;可读性是验收角度的判断,所以定 P2,产品/UI 可降级。
- **建议**:免责声明与提示行逻辑字号加大到使 360 宽手机上不小于约 10–11px;或免责声明放入非等比缩放的 DOM 层。

## D-03【P3】玩法 A 画面的 logo 下方显示玩法 B 的名称「金鲤满仓」

> **【复测 Round 2 · 2026-10-02】状态:已修复**
> logo 按玩法切换:A=logo-A、B=logo-B,切换/切回/直接以 B 启动均正确(Stage.logoTextureKey 校验);两张 logo 图主标题与英文副标题像素一致,仅丝带区域不同(A 丝带「20 线 · Free Spins」,B 丝带「金鲤满仓 / Hold & Spin」)。A 画面不再出现 B 名称(顶部 tab 上的「玩法 B · 金鲤满仓」是切换标签,属正常)。丝带文字为目视确认(无 OCR 工具)。证据:`r2/screenshots/D03-*.png`、`D03-compare-A-left-B-right.png`。
- **现象**:logo 图是共用的,标题下方的蓝色丝带写着「金鲤满仓」。玩法 A 的 tab 与标题是「糖果锦鲤池」,A 的 FS 画面中仍显示这条丝带,容易让玩家认为是 B 的内容。
- **复现步骤**:打开 `?game=A`,看 logo;进入 FS 后同样存在。
- **影响范围**:玩法 A 全部画面(空闲、FS)的品牌一致性。
- **截图**:`screenshots/assets/logo-from-dist.png`、`screenshots/existing-e2e/01-A-idle.png`、`screenshots/existing-e2e/10-A-fs-spin.png`、`screenshots/BAL-03-menu-A.png`
- **按文档的预期**:文档里的游戏名:A=「糖果锦鲤池」(主题)/「锦鲤」,B=「金鲤满仓」;未规定 A 画面使用 B 的名称。该 logo 来自 `slots-ui` 的 README 规定(logo 带该副标、两玩法共用),所以可能是设计意图,**需要产品/UI 确认**,因此定 P3。
- 注:这些名称是游戏名,不是 Scatter 旧称,不属于「糖果门」文案一致性问题。

## D-04【P3】打包产物 `atlas.json` 残留旧称描述

> **【复测 Round 2 · 2026-10-02】状态:已修复**
> `dist/assets/symbols/atlas.json:218` 与 `public/...` 现为 "W 彩虹珍珠 Wild"。`rg 锦鲤珍珠|龙门|牌坊门|Dragon|Torii` 在 src、public、dist、index.html、本轮 prod/debug 构建产物均 0 命中(test/ 与 scripts/copy-assets.py 里只有守卫断言/替换表,不随包发布;`slots-design/GameA_v1.0_backup.md` 的「龙门」是旧版备份文档本身)。证据:`r2/logs/r2-text-scan.log`。
- **现象**:`slots-app/dist/assets/symbols/atlas.json` 第 218 行(源 `public/assets/symbols/atlas.json`)的描述写着 "W 锦鲤珍珠 Wild"。
- **复现步骤**:`rg "锦鲤珍珠" slots-app/dist slots-app/public`。
- **影响范围**:该文件不被应用加载,**不在 UI 可见文本中**(UI 赔付简表写的是"珍珠(Wild)");只是随包发布的元数据残留,v1.2 里 Wild 叫"彩虹珍珠"。
- **截图**:无(文本类问题,证据为 rg 输出,见 `logs/text-scan.log`)。
- **按文档的预期**:v1.2 要求清除旧称、使用最新名称。
- 注:「龙门」「牌坊门」「Dragon」「Torii」在 src、index.html、public、dist、两套构建产物中**均无**,「糖果门」文案一致性通过。

## D-05【P3】AUTO 没有次数选择

> **【复测 Round 2 · 2026-10-02】状态:已修复**
> 点 AUTO 弹次数菜单:10/25/50/100/直到特色触发(+取消);弹出时不开始、取消不开始;选 10 → 剩余次数徽标 10→1 递减、恰好 10 局后自动停;选 25/50/100 → 起始 remaining 分别为 25/50/100;「直到特色」→ A 触发 FS、B 触发 H&S 后 AUTO 自动停止。证据:`r2/logs/r2-01-defects.log`(D05-*)、`r2/screenshots/D05-auto-menu.png`、`D05-auto-running.png`。
- **现象**:点 AUTO 直接无限连转(到余额不足/触发特色玩法才停),没有次数菜单。
- **复现步骤**:空闲点 AUTO,没有任何选项弹出,`snapshot().autoOn=true`,连续转到手动关闭。`scripts/qa-08-misc.mjs` 的 `AUTO-03`。
- **影响范围**:A、B 两个玩法的 AUTO 功能。
- **截图**:无专门截图(无新界面可截,证据为 `logs/qa-08-misc.log`)。
- **按文档的预期**:A §11.1 "可选次数:10、25、50、100(产品可调),另可选「直到特色玩法触发」"。
- 注:README 已知限制 #8 自述了此点,但它不在本次"已知未做"清单内,所以仍记录。

## D-06【P3】AUTO 两局间调整投注不会停止 AUTO

> **【复测 Round 2 · 2026-10-02】状态:已修复**
> A、B 各测 + / − / MAX:AUTO 两局间隙点击后 AUTO 立刻关闭,3 秒后仍关闭、无新局(局数 1→1);另用 Playwright 真实点击再验一次通过。证据:`r2/logs/r2-01-defects.log`(D06-*,7 项)。
- **现象**:AUTO 进行中,在两局之间点 + 调整投注,下注从 100 变成 200,AUTO 仍保持开启并继续按新投注转。
- **复现步骤**:见 `scripts/qa-08c-auto04.mjs`:开 AUTO → 在 Idle 间隙点 bet-plus → 200ms 和 3s 之后 `autoOn` 均为 true(日志 `logs/qa-08c-auto04.log`)。代码:`Shell.setBetIndex` 没有调用 `stopAuto()`。
- **影响范围**:AUTO 与投注调整的交互;玩家不会因此多扣超过其自己调整后的投注,但与文档停止条件不符。
- **截图**:无(证据为日志)。
- **按文档的预期**:A §11.3 "以下任一情况停止并回到关闭状态:……玩家调整了投注……"。
- 对照:触发 FS/H&S 时 AUTO 自动关闭(AUTO-01,约 1.7 秒后关闭,`logs/qa-08b-auto01.log`)、余额不足时停止并提示(AUTO-02)都正确。

## D-07【P3】首屏体积在 1 MB 预算临界,且 `pnpm measure` 低估

> **【复测 Round 3 · 2026-10-02】状态:已接受(不再追踪)**
> 新增大赢演出后首屏 `pnpm measure`:39 请求 / 1,013,863 B(990.1 KiB ≈ 1.014 MB),较 R2 的 1,010,134 B 增加 3,729 B(+0.37%),无重复请求;自测(去重)与 measure 逐字节一致。three.js(gz≈127 KB)、candy 块(gz≈17 KB)与全部大赢美术均**不在首屏**,首屏及空闲 +5s 的大赢相关请求为 0;ready 后约 8–14s 才空闲预取两个 JS 块(不预取美术)。按用户确认接受 ~1.01 MB。证据:`r3/logs/r3-pnpm-measure.log`、`r3/logs/r3-08-firstscreen.log`。

> **【复测 Round 2 · 2026-10-02】状态:部分修复**
> 首屏传输体积(gzip,冷缓存,同一 QA 口径)从 1,075,029 B(含重复)/1,023,731 B(去重)降到 **1,061,432 B(含重复)/1,010,134 B(去重)**;`pnpm measure` 已改为服务器逐请求日志口径,首屏 39 请求/1,010,134 B,无重复,与我的去重数完全一致(不再低估;旧版 563,814 B)。按 1 MB=10^6 B 仍超 1.0%(1.010 MB);按 MiB(1,048,576)为 0.963 MiB,低于预算。预算口径(MB/MiB、是否去重)仍需产品确认,所以只判部分修复。证据:`r2/logs/perf-payload.json`、`r2/logs/r2-perf-dedup.json`、`r2/logs/r2-pnpm-measure.log`。
- **现象**:
  - `pnpm measure` 输出 563,814 B(0.54 MB),但该脚本只统计主线程请求,漏掉 Worker 里解码的贴图,会严重低估。
  - QA 自备 gzip 静态服务器、冷缓存、首屏就绪后 1 秒:总传输 **1,075,029 B(1.025 MiB)**,其中 `background-base` 和 `panel-info` 被请求两次;去重后 **1,023,731 B(≈1.024 MB,0.976 MiB)**。空闲 5 秒(含按钮其余状态预载)1,280,741 B(1.22 MiB)。
  - README 自称 0.98 MB。
- **复现步骤**:`pnpm build` → 用 gzip 静态服务器(`scripts/static-server.mjs`)serve → `scripts/qa-06-perf.mjs`;日志 `logs/perf-payload.json`、`logs/measure.log`。
- **影响范围**:加载时间/流量。重复请求有可能是我的服务器 `cache-control: no-store` 造成的(未能排除),因此以该口径下为准。
- **截图**:`screenshots/perf-first.png`、`screenshots/perf-idle.png`、`screenshots/measure-prod.png`
- **按文档的预期**:SCAFFOLD §5 首屏预算 < 1 MB(不含大奖演出、不含 FS/HS 背景)。README 待确认问题 #5 已指出口径未定。按 MB(1e6)含重复请求 1.075 MB 超出,去重后 1.024 MB 略超,按 MiB 去重后 0.976 MiB 略低于。属临界,**口径需产品确认**。
- **建议**:再压缩约 5–10%(例如 symbols-sheet.webp 395 KB、reel-frame 58 KB、logo 58 KB),并修正 `pnpm measure` 以统计 Worker 请求。

---

## 备注(不计缺陷)
- N-1:`?lang=en`(仅 dev/debug 构建可用的调试语言)下,`info.*`、`buy.*`、`banner.hs.title` 及 Pixi 内硬编码的"赢额/累计赢额/已锁定/剩余重转"仍是中文。默认语言 zh,不影响正式界面。
- N-2:README 写"35 个测试",实际 `pnpm test` 为 36 个用例,文档小偏差。
- N-3:WebGL 控制台 4 条 warning 均为 SwiftShader "GPU stall due to ReadPixels",属无 GPU 环境产物,真机未测。


---

## 复测 Round 2 新增缺陷

## D-08【P3】设计说明面板:点过遮罩或标题后按 Esc 不能关闭

> **【复测 Round 3 · 2026-10-02】状态:已修复**
> `r3/scripts/r3-05-esc.mjs` 6/6 PASS(`ESC-baseline`、`ESC-after-mask-click`(焦点=BODY)、`ESC-after-title-click`(焦点=BODY)、`ESC-after-card-click`、`ESC-after-tab`、`ESC-after-wheel`);`DesignPanel` 的 keydown 已改挂 `document`。大赢演出期间(面板被强行打开)Esc 也能关闭面板、不影响演出。证据:`r3/logs/r3-05-esc.log`、`r3/screenshots/D08-esc-after-mask-click.png`(此次 Esc 后面板已关闭)。
- **状态**:新增,未修复(2026-10-02,`r2/logs/r2-05-esc.results.json`)
- **现象**:打开「设计说明」面板后,如果先点了遮罩(面板外)或标题文字,再按 Esc,面板不关闭。直接打开后按 Esc、点卡片文字/切 Tab/滚轮后按 Esc 都能关。
- **复现步骤**:
  1. 打开 `?game=A`,点顶栏「设计说明」。
  2. 鼠标点一下面板外的遮罩(按设计不会关闭),或点面板标题「设计说明」文字。
  3. 按 Esc → 面板仍然打开(此时 `document.activeElement` 是 `BODY`);再按一次 Tab 把焦点拉回面板内后,Esc 才有效。
  - 自动化:`scripts/r2-05-esc.mjs`(`ESC-after-mask-click`、`ESC-after-title-click` 两项 FAIL,另 4 项 PASS)。
- **原因(读代码,未改)**:`ui/DesignPanel.ts` 的 `keydown` 监听挂在面板元素上(`this.panel.addEventListener('keydown', …)`),点遮罩/标题后焦点落到 `BODY`,事件到不了面板。
- **影响范围**:桌面/带键盘的用户,A、B 两个玩法同样;手机触屏用户基本无影响(还有 × 与「关闭」按钮可用)。
- **截图**:`r2/screenshots/D08-esc-after-mask-click.png`(按 Esc 之后面板仍显示)
- **按文档的预期**:`slots-ui/assets/design-notes/panel-spec.md` 第 166 行"**Esc 关闭**"(未限定焦点位置)。
- **建议**:把 Esc 监听挂到 `document`(面板打开期间),或遮罩/面板 `mousedown` 时把焦点放回面板。

## 备注(Round 2 新增,不计缺陷)
- N-4:用 `net::ERR_ABORTED` 记录到少量"按钮状态图 `btn-*@2x.webp`"请求被取消(`qa-08-misc` 11 条、`r2-01-defects` 18 条,其余脚本 0 条)。无 console.error、无 HTTP≥400、界面状态正常。我做了 5 组专门复现(静置、导航、点 SPIN、AUTO+turbo、状态图快速切换),R2 与 R1 构建均为 0,**未能复现、未能归因**;推测是我的 `no-store` 静态服务器下按钮 `<img>` 切换 `src` 时取消了在途请求(未验证)。记录备查,不判缺陷。
- N-5:Esc 不会关闭菜单 / 重置确认 / 购买确认等普通弹窗(文档未要求,只记录现状)。
- N-6:`dn.hint` 在气泡"显示"的瞬间就写入,不是等玩家看到/关闭后才写;只要显示过一次,之后永不再出现。符合"看过不再出现"的预期,仅记录实现方式。

## D-09【P3】大赢演出回退路径(Canvas2D default-big)下 max 档标题为「MAX WIN」,与统一的「SUPER WIN」不符
- **状态**:R3 新增,未修复(2026-10-02,`r3/logs/r3-06-fallback.log`)
- **现象**:当 three 演出无法运行而回退到内置 Canvas2D `default-big` 时,`epic` 档标题是「SUPER WIN」(正确),但 `max` 档(A ≥500× / B ≥1000×)标题画成「**MAX WIN**」。正常(three)路径下 max 与 epic 同为 SUPER WIN(只请求 `title-super.png`)。
- **复现步骤**(debug 构建,`r3/build/debug`,端口 4174):
  1. 让 three 块加载失败:例如浏览器 DevTools 屏蔽 `assets/three-*.js`,或禁用 WebGL。
  2. 打开 `/?game=A&seed=7&reset=1`,控制台执行 `await __slots.playBigWin('max', 54321)`(或真实局打到 ≥500×)。
  3. 观察标题:「MAX WIN」。`__slots.showcaseLast.current` = `{backend:'fallback', reason:'chunk-load-failed'}`。
  - 自动化:`r3/scripts/r3-06-fallback.mjs` 的 `FB-*-max-title`——nogl / three 块 abort / candy 块 abort / 双块 abort / atlas abort / chunk 404 六个场景全部 FAIL(`fillText 标题=["MAX WIN"]`),epic 在同样六个场景均 PASS。
- **原因(读代码,未改)**:`src/showcase/default-big.ts` 第 7 行 `TITLES = { …, epic: 'SUPER WIN', max: 'MAX WIN' }`(README 与 `timeline.ts` 均写"max 并入 SUPER WIN";`core/i18n.ts` 的 `bigwin.max:'MAX WIN'` 也未被引用)。
- **影响范围**:仅降级路径(无 WebGL / 块加载失败 / 素材加载失败 / context lost)且仅 max 档(A ≥500× / B ≥1000×,极罕见)。资金、流程、回 Idle 均正常。因只在失败降级 + 极端大奖才出现,判 P3;若按"违反明确的标题统一要求"口径也可升 P2。
- **截图**:`r3/screenshots/fallback-shot-max-t2200.png`(回退 max 档,标题「MAX WIN」)、对照 `r3/screenshots/fallback-shot-epic-t2200.png`(回退 epic 档,「SUPER WIN」);正常路径 max 档 `r3/screenshots/tier-max-A-t*.png` 为 SUPER WIN。
- **按文档/需求的预期**:`slots-ui/assets/bigwin/README.md` §标题表:`max` → Super 变体,标题 SUPER WIN;`slots-app/README.md` 第 187 行"`max` 没有独立标题(沿用 SUPER WIN)"。
- **建议**:把 `default-big.ts` 的 `TITLES.max` 改为 `'SUPER WIN'`(或统一从 `timeline.ts` 的 tier 配置取 title)。

## 备注(Round 3 新增,不计缺陷)
- N-R3-1:无 WebGL 时 three.js 自己向 `console.error` 打印 `THREE.WebGLRenderer: Error creating WebGL context.`(每次尝试一条),已被应用捕获并回退;不是未捕获异常。
- N-R3-3:ready 后约 8–14s 会空闲预取 three 与 candy 两个 JS 块(≈144 KB gz,低优先级,不预取美术;省流量/2g-3g/低端/无 WebGL2/dev 不预取)——与"首屏不请求 three、仅大赢时才懒加载"字面略有出入,但 README 明确这样设计,首屏口径不受影响。
- N-R3-4:prod 包中仍含 `parseDebug` / `force.ts` / `window.__slots=` 赋值代码,运行时被 `enabled=false` 守卫(实测 `?reset/?game/?seed/?force/?lang/?quality` 全无效、`window.__slots` 不存在);`playBigWin/showcaseLast/bigwinDemo` 确已不在 prod 包。
- N-R3-5:大赢演出期间 Esc 不是跳过键;设计说明面板可被键盘(Tab 聚焦被遮罩盖住的按钮 + Enter)强行打开,z-index 1001 > 遮罩 820,不影响演出;只能点击遮罩跳过。
- N-R3-6:演出一旦开始就刷新页面,局已落盘、余额已含赢额,刷新后不重播演出(与 README 一致)。

- N-4(R2 备注)R3 跟进:首跑 qa-07 LOG-01-prod 曾因多脚本并发出现 `btn-*@2x.webp ERR_ABORTED`;隔离重跑 qa-07 为 5/0,未复现,继续不判缺陷。
