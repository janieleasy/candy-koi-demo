# 复测 Round 2 报告(slots-app)

- 日期:2026-10-02(Asia/Shanghai),测试人:QA。被测:`/workspace/slots-app/`(开发修复后重新构建)。
- 未修改任何被测目录(slots-app / engine / design / spec / ui / product);本轮输出全部在 `/workspace/slots-qa/`,第一轮文件保留(`report.md`、`checklist.md`、`defects.md` 的原内容未删,另存备份于 `r2/*.round1.bak.md`)。
- 本轮文件:`retest_report.md`(本文)、`defects.md`(已在每条缺陷下追加 R2 状态,并新增 D-08)、`r2/logs/`、`r2/screenshots/`、`r2/build/`(本轮 prod / debug 构建产物)、`scripts/r2-*.mjs`(本轮脚本)。

## 1. 结论:**有条件通过(conditional accept)**
- D-01 ~ D-06 **全部已修复**;D-07 **部分修复**(体积降到 1,010,134 B 去重 / 1,061,432 B 含重复,仍略超 1 MB=10^6 B 口径,按 MiB 口径 0.963 MiB 通过;口径待产品确认)。
- 新「设计说明」面板:入口、首次气泡、A/B 文案(逐字比对 60 项 0 差异)、Esc/焦点/滚动、局中打开不影响结算、手机布局,**均通过**,仅发现 **1 个 P3(D-08:点过遮罩/标题后按 Esc 关不掉)**。
- 回归:`pnpm test` 60/60、typecheck 通过、构建通过、现有 e2e 50/50、`e2e:new` 43/43、`e2e:hs` 0 失败、我的 A/B 流程/存档/购买/余额/文案脚本全部通过(两项脚本时序问题已复核,见 §4)。无 P0/P1/P2。
- 当前未关闭缺陷:**P0=0,P1=0,P2=0,P3=2(D-07 部分修复、D-08 新增)**。建议:可以验收;D-07 由产品确认体积口径,D-08 排期修复。

## 2. D-01 ~ D-07 复测

| ID | 原严重度 | R2 结果 | 关键证据 |
|---|---|---|---|
| D-01 重置无确认框 | P2 | **已修复** | A、B 都弹确认框「重置演示币 / 确定要把余额重置为 10,000 演示币吗?当前余额将被覆盖。 / 取消·确认重置」。余额设为 13,100 → 弹框时仍 13,100;**取消**→ 13,100(显示与 localStorage 都不变,回到菜单);**确认**→ 10,000(显示+落盘);点遮罩=取消(12,345 不变);FS 中菜单重置钮仍置灰。`r2/logs/r2-01b-d01.results.json` 11/11;`r2/screenshots/D01-reset-confirm-A.png` |
| D-02 手机字号过小 | P2 | **已修复** | 免责声明实际渲染字号(computed × 舞台缩放,实测):320×568、360×640、375×667、390×844、412×915、430×932、768×1024 **全部 11px**(第一轮 5.6/6.3/6.6/6.9/7.2/7.6/10.1px)。提示行 11px(768 宽 13.9px),购买确认框 .fine 11px;免责声明单行、不截断、在视口内、不与购买钮重叠,购买确认框在视口内。通过线我取 ≥10px(文档没有规定最小字号)。`r2/logs/r2-viewport-fonts.json`;截图 `r2/screenshots/D02-{320x568,360x640,390x844,430x932,…}-{idle,disclaimer-crop,buy-confirm}.png` |
| D-03 A 画面显示 B 名称 | P3 | **已修复** | `Stage.logoTextureKey`:A 启动 `logo-A`;切 B → `logo-B`;切回 A → `logo-A`;直接以 B 启动 → `logo-B`。两张 logo 图主标题/英文副标题像素一致,仅丝带不同:A 丝带「20 线 · Free Spins」,B 丝带「金鲤满仓 / Hold & Spin」。A 的空闲画面截图里除顶部 tab(「玩法 B · 金鲤满仓」是切换标签)外没有 B 名称。注:丝带文字靠目视图片确认(无 OCR 工具)。`r2/screenshots/D03-compare-A-left-B-right.png`、`D03-asset-logo-A/B.png`、`D03-ribbon-A/B.png` |
| D-04 atlas.json 旧称 | P3 | **已修复** | `dist/assets/symbols/atlas.json:218` 与 `public/…` 现为「W 彩虹珍珠 Wild」。`rg 锦鲤珍珠\|龙门\|牌坊门\|Dragon\|Torii` 在 src、public、dist、index.html、本轮 prod+debug 构建产物均 **0 命中**。test/ 与 `scripts/copy-assets.py` 里只有守卫断言/替换表(不随包发布);`slots-design/GameA_v1.0_backup.md:58` 的「龙门」是旧版备份文档本身。`r2/logs/r2-text-scan.log` |
| D-05 AUTO 无次数选择 | P3 | **已修复** | 点 AUTO 弹菜单 10/25/50/100/直到特色(+取消);弹出时 autoOn=false,取消不开始;选 10 → 徽标 10→1 递减、恰 10 局后自动停(remaining 序列 [10..1]);选 25/50/100 → 起始 remaining 为 25/50/100(我只验证起始值并手动停,没有跑满 25/50/100 局);直到特色 → A 触发 FS、B 触发 H&S 后 AUTO 自动停。`r2/logs/r2-01-defects.log`;`D05-auto-menu.png`、`D05-auto-running.png` |
| D-06 调投注不停 AUTO | P3 | **已修复** | A、B 各测 +、−、MAX(6 项):AUTO 两局间隙点击后 AUTO 立即关闭,3 秒后仍关闭、无新局(局数 1→1),投注确实变化;另用 Playwright 真实点击再验通过。`r2/logs/r2-01-defects.log`(D06-*) |
| D-07 首屏体积 | P3 | **部分修复** | 我的 gzip 服务器(`no-store`,冷缓存,ready 后 1s):**含重复 1,061,432 B(41 请求)/ 去重 1,010,134 B(39 唯一 URL)**;第一轮 1,075,029 / 1,023,731。重复项:`background-base`(46,754 B)与 `panel-info@2x`(4,544 B)各取两次(`no-store` 下浏览器内部重复请求)。`pnpm measure`(新口径,服务器日志 + 缓存头 max-age):首屏 39 请求 **1,010,134 B,无重复**(≈986.5 KiB),与我的去重数**完全一致**,不再低估(第一轮旧版 563,814 B)。对 1 MB 预算:按 10^6 B → 1.010 MB(超 1.0%);按 MiB → 0.963 MiB(通过);含重复 1.061 MB / 1.012 MiB。空闲 5s(含按钮状态图预载):含重复 1,274,590 / 去重 1,158,792。**没有出现 Worker 专有请求**(measure 报告 Worker 发起的仅 context 可见请求 0 个;服务器日志口径本身覆盖 Worker)。README 称"约 0.96 MB"≈ 我的 0.963 MiB(按 MiB 口径)。口径(MB/MiB、是否去重)需产品确认。`r2/logs/perf-payload.json`、`r2-perf-dedup.json`、`r2-pnpm-measure.log` |

## 3. 新「设计说明」面板

文案源:`/workspace/slots-product/demo_panel_copy.json`(version 1.0),与 `slots-app/src/content/demo_panel_copy.json` **字节一致**。

| 项目 | 结果 | 证据 / 说明 |
|---|---|---|
| 顶栏入口按钮 | ✅ | 可见、可点、未被遮挡、在视口内;图标逻辑位置 (800,97) 210×76,与 UI 稿一致;`aria-label=设计说明`。`DN-02-entry-topbar-A.png` |
| 菜单项「设计说明」 | ✅ | 菜单里有该项;点击后面板打开、菜单关闭。`DN-04-menu-with-design-item.png` |
| 首次提示气泡(干净 localStorage) | ✅ | 新 context 首进:ready 时 `dn.hint` 未写、气泡未显示;稍后淡入(`看看设计思路`),约 5s 自动淡出;之后**刷新、切到 B、再次进入均不再出现**。点任意处→立即收起且不再出现;气泡出现前就打开面板→不出现且不再出现。prod 构建(无调试开关)首进同样出现。`DN-01-hint-bubble.png`、`DN-01b-hint-prod-390x844.png` |
| 默认展示当前玩法 | ✅ | A 上打开显示 A,B 上打开显示 B |
| 关闭方式 | ✅/⚠️ | ×、底部「关闭」、Esc 均可关;关闭后焦点回入口;点遮罩不关(设计如此,panel-spec 第 32 行)。**D-08**:点过遮罩或标题后 Esc 不能关 |
| 焦点陷阱 / inert | ✅ | Tab 6 次焦点始终在面板内;面板外元素 `inert`;点背景(SPIN 区域)不会开局 |
| A/B 文案 vs JSON | ✅ **0 差异** | 比对 60 项(面板标题、副标题、两个 Tab 标签、卡片数、每张卡片 id/heading/text/序号,A、B 各 5 张),`r2/logs/r2-panel-copy-diff.json`:`mismatches: []`。DOM 的 `textContent`(数字高亮 `<strong>` 不改变文字)与 JSON 逐字相同;面板 `innerText` 含全部 text;prod 构建 JS 含全部 10 张卡片字符串。无旧称;文中「糖果门」用法正确。DOM 原文:`r2/logs/r2-panel-dom-{A,B}.json` |
| 滚动 | ✅ | 360×640、390×844、320×568、430×932 的 A、B 内容区均可滚动(scrollHeight 1629/1681 > 可见 1368,逻辑 px),滚轮滚到底后最后一张卡片完整可见,顶/底渐隐状态正确;触摸:CDP `dispatchTouchEvent` 序列滑动 scrollTop=261(通过),滑动不带动页面。**注**:`Input.synthesizeScrollGesture` 在我的环境连一个**普通 div 的对照页面**也滚不动(scrollTop=0),属测试工具限制,不是面板问题;**真机触摸未测** |
| 移动布局/溢出 | ✅ | 360×640、390×844、320×568、430×932 × A/B:面板完全在视口内、无横向溢出、×/关闭钮可点不被遮挡、页面无滚动条。正文实际渲染 11–14.3px,声明 11px,卡片标题 13–17.5px。`DN-mob-*.png`(含 top/bottom) |
| 局中打开(对照实验) | ✅ | 同 seed 对照局 vs 局中开面板(并在面板内切 Tab、滚轮、Esc 关闭)。场景:A 基础旋转(旋转中 / 展示阶段打开)、A 自然 FS(第 2 次免费旋转后,开 4s;另经菜单入口)、B 自然 H&S(第 1 次重转后,开 4s;结算飞币阶段)、A 购买 FS(第 1 转后)。**逐项一致**:事件序列(含 balance:change / step:begin / round:end)、每步 step 数据与面板读数(剩余次数/倍数阶梯/K/R/赢额条)、结算 settlement、局终 localStorage(A/B 存档+余额)、界面余额。打开期间局照常推进(FS/H&S 自动 continue 正常),面板内切 Tab 不改变 `shell.gameId`;打开中刷新→面板默认关闭、局续玩并结算。44 项 PASS / 0 FAIL(`r2/logs/r2-04-midround.log`,逐局事件 JSON 见 `r2/logs/mid/`)。**比较口径说明**:FS 累计赢额计数器 `fs.total` 是滚动动画值,取样时刻不同会不同(同 seed 两次**对照局**之间也有差异,`r2/logs/r2-04c-ctrlvar.json`),因此比对时排除了该字段;其精确终值由 `winBar` 与结算验证。局耗时变化不超过测量抖动(例如 FS 对照 59.3s / 测试 58.5s)。 |
| 控制台 | ✅ | 面板全部场景 + 局中开面板:0 console.error、0 pageerror、0 HTTP≥400;警告仅 SwiftShader「GPU stall due to ReadPixels」。仅 `qa-08-misc` / `r2-01-defects` 两个脚本记录到少量 `net::ERR_ABORTED`(按钮状态图 `btn-*@2x.webp`),见 N-4,我无法复现和归因 |

## 4. 回归

| 项目 | 结果 | 证据 |
|---|---|---|
| `pnpm test` | **8 文件 60 用例全过**(README 写 60,一致) | `logs/r2-app-test.log` |
| `pnpm typecheck` | 通过 | `logs/r2-app-typecheck.log` |
| `pnpm build` / `build:debug` | 通过(`r2/build/prod` 与 `slots-app/dist` `diff -r` 一致) | `r2/logs/build-prod.log`、`build-debug.log` |
| 现有 `scripts/e2e.mjs`(debug 构建) | **50/50** | `r2/logs/existing-e2e.log` |
| `e2e:new`(开发新增) | **43/43** | `r2/logs/app-e2e-new.log` |
| `e2e:hs`(H&S 状态条同步) | 8 个 step:end 检查 0 失败,无 pageerror | `r2/logs/app-e2e-hs.log` |
| `r2-qa-02-viewports`(7 视口布局/弹窗) | 35 PASS / 0 FAIL | `r2/logs/r2-qa-02-viewports.log` |
| `r2-qa-03-flowA` | 33 / 0:基础旋转、FS 阶梯 ×1→×2→×3→×5、重触发 +5、购买 48×(100→4800)+免责声明、取消不扣费、余额不足提示、每步先存档逐字节对拍 | `r2/logs/r2-qa-03-flowA.log` |
| `r2-qa-04-flowB` | 25 / 0:基础旋转、H&S 触发(C≥6)、重转 R 重置为 3(非累加)、K/R 状态条同步、Jackpot 飞币、满屏(15 币)+50,000、购买 85×(50→4250) | `r2/logs/r2-qa-04-flowB.log` |
| `r2-qa-05-save`(每步存档 + 刷新续局 + 状态独立) | 34 PASS / 1 FAIL —— FAIL 是 `SAVE-04-last-game-B` 的**脚本断言问题**(与第一轮相同);`r2-qa-05b-lastgame` 复测 2/2 PASS。A FS、B H&S 各在 10 个不同步骤后刷新,均续局到结束并与离线重放逐字节一致;购买局中途刷新不重复扣费 | `r2/logs/r2-qa-05-save.log`、`r2-qa-05b-lastgame.results.json` |
| `r2-qa-07-text-prod`(prod 构建文案/调试开关/控制台) | 5 / 0:161 段 UI 文本无旧称(「糖果门」zh 5 段、en「Candy Gate」1 段);prod 无 `window.__slots`,`?force/?game/?reset/?seed` 被忽略;连点 12 局 0 错误 | `r2/logs/r2-qa-07-text-prod.log` |
| `r2-qa-08-misc`(购买价/余额/AUTO/封顶) | 23 PASS / 1 FAIL —— FAIL 是 `AUTO-01` 的**脚本时序问题**(同第一轮:在触发后 300ms 检查,应用要等进入横幅表现结束才关 AUTO)。`r2-qa-08b-auto01` 复测:触发 FS 后 **1859ms** AUTO 关闭、按钮 off,FS 结束后不自动续转(局数=1)。BUY 价:A 48× 全档(100→4800、200→9600;400/1000 档在 10,000 余额下置灰,与第一轮相同)、B 85×(50→4250、100→8500);价格−1 余额置灰、=价格可点;BAL-02 余额不足提示、BAL-03 重置(已适配确认框)、A-06/B-07 封顶(构造场景)均 PASS | `r2/logs/r2-qa-08-misc.log`、`r2-qa-08b-auto01.log` |
| `r2-qa-09-mobile-feature`(手机 FS/H&S 画面) | 4 / 0 | `r2/logs/r2-qa-09-mobile-feature.log` |
| tab 状态独立 | ✅ 两玩法存档键/下注独立、共用钱包;特色玩法中禁止切 tab 为既定设计,未当缺陷 | `r2-qa-05-save`(SAVE-04/05) |
| 竖屏 | ✅ 见 §2 D-02 与 §3 移动布局 | |
| 旧称/文案 | ✅ 「糖果门」,无旧称(见 D-04、qa-07) | |
| 控制台 | ✅ 0 console.error / 0 pageerror(各脚本汇总见 `r2/logs/*.results.json` 的 `errs` 字段) | |

**FS 重触发、H&S 满屏、封顶、"60 次上限"提示**:与第一轮相同,是构造/注入场景,不是自然出现(见 report.md §7)。

## 5. 新缺陷
| ID | 严重度 | 现象 | 复现 | 影响 | 截图 |
|---|---|---|---|---|---|
| **D-08** | **P3** | 设计说明面板打开后,点过遮罩(面板外)或标题文字,再按 Esc,面板不关闭(焦点落在 `BODY`);直接 Esc、点卡片/切 Tab/滚轮后 Esc 正常 | `?game=A` → 点「设计说明」→ 点遮罩 → 按 Esc。`scripts/r2-05-esc.mjs` | 键盘用户少数操作路径;触屏用户有 ×/关闭钮,基本无影响 | `r2/screenshots/D08-esc-after-mask-click.png` |

详见 `defects.md` 末尾「复测 Round 2 新增缺陷」(含原因分析与建议)。

## 6. 未测 / 受限(如实说明)
1. 无真 GPU:全部用 SwiftShader;真机 iOS/Android、Firefox、WebKit、真实触摸手势、安全区均**未测**。
2. 触摸滚动只用 CDP `dispatchTouchEvent` 模拟,未用真机。
3. 引擎 `slots-engine` 自上轮后文件无改动(我按修改时间核对了 `src`/`config`),所以**没有重跑**引擎批量对拍与 RTP 模拟,第一轮结论沿用;本轮只用 UI 流程与离线重放对拍。
4. 「直到特色」我只验证到触发后停止,没有验证 25/50/100 次跑满。
5. D-03 的丝带文字靠目视图像(无 OCR 工具);图像文字无法逐像素 OCR。
6. 已知未做(横屏、官方赔付表页面占位、公网部署、大赢第三方演出占位)与已决设计(A 无连消、局中禁切 tab)按约定未计缺陷。
7. 体积结论取决于单位与是否去重,见 D-07;我的 `no-store` 服务器会放大重复请求。
8. N-4 的 `net::ERR_ABORTED`:5 组专门复现均为 0,**未能归因**。

## 7. 备注(不计缺陷)
- N-4 / N-5 / N-6 见 `defects.md` 末尾。
- 第一轮备注 N-1(`?lang=en` 部分文案仍中文)、N-2(README 测试数)未重测;README 现写 60 个用例,与实际一致。

## 8. 命令与服务清理
- 我启动的 `static-server.mjs`(端口 4174/4175/4176)已全部结束(`ss -ltnp` 验证 417x 端口无监听,`pgrep` 无残留 QA 进程)。端口 5173 的 `pnpm dev`(PID 883405,启动于 02:09,早于本轮)不是我启动的,未动。
- 复测命令:`pnpm test`、`pnpm typecheck`、`pnpm build --outDir /workspace/slots-qa/r2/build/prod`、`VITE_ENABLE_DEBUG=1 pnpm exec vite build --outDir …/debug`、`pnpm measure`;其余为 `scripts/r2-*.mjs`。
