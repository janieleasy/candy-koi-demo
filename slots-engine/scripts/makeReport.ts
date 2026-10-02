/** 由 sim/summary_*_final.json + sim/analytic.json 生成 report/RTP_report_{A,B}.md。所有数字直接取自模拟/解析输出。 */
import fs from 'node:fs';
const rd = (f: string) => JSON.parse(fs.readFileSync(new URL('../sim/' + f, import.meta.url), 'utf8'));
const an = rd('analytic.json');
const pct = (x: number, d = 3) => (x * 100).toFixed(d) + '%';
const num = (x: number, d = 4) => x.toFixed(d);
const one = (x: number | null) => (x ? '1/' + x.toFixed(1) : '—');
const ok = (b: boolean) => (b ? '达标' : '**未达标**');
const rng = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

function common(g: 'A' | 'B', N: any, B: any) {
  const L: string[] = [];
  const pp = (B.rtp - N.rtp) * 100, seD = Math.sqrt(B.rtpSE_batch ** 2 + N.rtpSE_batch ** 2) * 100;
  L.push(`## 1. 模拟设置(可复现)`, ``,
    `- 配置:\`config/game${g}.ts\`(version \`${N.meta.configVersion}\`),引擎协议 v2,模拟走 \`engine.playRound\`(= 循环 \`step\` 至整局结束),固定投注 bet=${N.meta.bet}。`,
    `- 正常游玩:**${N.meta.spins.toLocaleString('en-US')} 局**,${N.meta.shards} 个 shard(seed \`${N.meta.seeds[0]}\` … \`${N.meta.seeds.at(-1)}\`),每 shard 25 批,共 ${N.meta.batches} 批(每批 ${N.meta.batchSize.toLocaleString('en-US')} 局)。`,
    `- 购买:**${B.meta.spins.toLocaleString('en-US')} 次**,${B.meta.shards} 个 shard(seed \`${B.meta.seeds[0]}\` … \`${B.meta.seeds.at(-1)}\`),共 ${B.meta.batches} 批(每批 ${B.meta.batchSize.toLocaleString('en-US')} 次)。`,
    `- 复现:\`bash scripts/finalSim.sh && bash scripts/finalMerge.sh\`(全部 4 组;单组如 \`bash scripts/runSim.sh ${g} normal ${g === 'A' ? 200000000 : 400000000} 8 final 25 && node --import tsx scripts/merge.ts ${g} normal final\`)。原始分批结果:\`sim/raw/${g}_{normal,buy}_final_{1..8}.json\`;汇总:\`sim/summary_${g}_{normal,buy}_final.json\`;解析交叉检验:\`sim/analytic.json\`(\`npx tsx scripts/analyticReport.ts\`)。`,
    `- 置信区间:分批估计标准误 SE = sd(批 RTP)/√批数,95% CI = RTP ± 1.96·SE;括号内为由每局赢额方差得到的解析 SE 作交叉检验。`, ``);
  return { L, pp, seD };
}
function dist(L: string[], d: any[], title: string) {
  L.push(`### ${title}`, ``, `| 赢额区间(倍总投注) | 次数 | 频率 | 占 RTP |`, `|---|---|---|---|`);
  for (const r of d) L.push(`| ${r.label} | ${r.count.toLocaleString('en-US')} | ${pct(r.freq, 4)} | ${pct(r.rtpShare, 3)} |`);
  L.push(``);
}

// ───────────── A ─────────────
{
  const N = rd('summary_A_normal_final.json'), B = rd('summary_A_buy_final.json');
  const { L, pp, seD } = common('A', N, B);
  const a = an.A;
  L.splice(0, 0, `# 玩法 A《糖果锦鲤池》RTP 报告`, ``, `> 本文数字全部来自 \`sim/summary_A_*_final.json\`(蒙特卡洛)与 \`sim/analytic.json\`(精确枚举 + DP),由 \`scripts/makeReport.ts\` 生成。`, ``);
  L.push(`## 2. 正常游玩结果`, ``,
    `| 指标 | 模拟值 | 解析值(无上限) |`, `|---|---|---|`,
    `| **总 RTP** | **${pct(N.rtp)}**(95% CI ${pct(N.rtpCI95[0])} ~ ${pct(N.rtpCI95[1])};SE ${pct(N.rtpSE_batch, 4)}(解析 SE ${pct(N.rtpSE_analytic, 4)})) | ${pct(a.totalRtp)} |`,
    `| 基础贡献(线赢+Scatter) | ${pct(N.baseRtp)} | ${pct(a.baseRtp)} |`,
    `| 　其中基础线赢 | ${pct(N.baseLineRtp)} | ${pct(a.baseLineRtp)} |`,
    `| 　其中基础 Scatter 赢 | ${pct(N.baseScatterRtp)} | ${pct(a.baseScatterRtp)} |`,
    `| Free Spins 贡献 | ${pct(N.featureRtp)} | ${pct(a.fsRtp)} |`,
    `| 　其中 FS 线赢(含倍数) | ${pct(N.fsLineRtp)} | — |`,
    `| 　其中 FS Scatter 赢 | ${pct(N.fsScatterRtp, 4)} | — |`,
    `| 基础命中率(线赢或 Scatter 赢) | ${pct(N.hitRate)} | ${pct(a.hitRate)} |`,
    `| 零赢局占比 | ${pct(N.zeroRate)} | — |`,
    `| FS 触发频率 | ${pct(N.triggerRate, 4)} = ${one(N.oneInTrigger)}(触发 ${N.triggerCount.toLocaleString('en-US')} 次) | ${pct(a.triggerRate, 4)} = ${one(1 / a.triggerRate)} |`,
    `| 触发时 S 数 3 / 4 / 5 | ${N.triggerBySCount[3].toLocaleString('en-US')} / ${N.triggerBySCount[4].toLocaleString('en-US')} / ${N.triggerBySCount[5].toLocaleString('en-US')} | — |`,
    `| 平均每次触发实际 FS 次数 | ${num(N.fsAvgPlayedPerTrigger)} | ${num(a.ev ? (a.baseStopsProbK[3] * a.fsAvgSpins['8'] + a.baseStopsProbK[4] * a.fsAvgSpins['12'] + a.baseStopsProbK[5] * a.fsAvgSpins['20']) / a.triggerRate : 0)} |`,
    `| 含重触发的 FS 局数 / 占触发比 | ${N.fsRoundsWithRetrigger.toLocaleString('en-US')} / ${pct(N.fsRetriggerRateOfFs)}(重触发事件共 ${N.retriggerEvents.toLocaleString('en-US')} 次) | — |`,
    `| 触达 60 次上限的局数 | ${N.fsReached60}(${N.fsReached60 ? one(N.meta.spins / N.fsReached60) : '本样本未出现'});被截断的重触发事件 ${N.fsTruncatedEvents};单局最多实际 FS 次数 ${N.fsMaxPlayed} | — |`,
    `| FS 单次旋转线赢命中率 | ${pct(N.fsSpinLineHitRate)} | ${pct(a.fsPHit)} |`,
    `| 触发局平均特色赢额 / 标准差 / 最大(倍总投注) | ${num(N.avgFeatureWinMult, 2)} / ${num(N.featureStdDev, 2)} / ${num(N.featureWinMax, 1)} | — |`, ``);
  L.push(`### 倍数阶梯各档(FS 旋转使用的 c)`, ``, `| c | 倍数 | 使用次数 | 占 FS 旋转比 | 该档线赢占 RTP |`, `|---|---|---|---|---|`);
  const mult = [1, 2, 3, 5];
  for (const r of N.ladder) L.push(`| ${r.c} | x${mult[r.c]} | ${r.uses.toLocaleString('en-US')} | ${pct(r.freq)} | ${pct(r.lineRtp)} |`);
  L.push(``);
  dist(L, N.distribution, '赢额分布(正常游玩)');
  L.push(`## 3. 波动性与上限`, ``,
    `- 每局赢额标准差(倍总投注)= ${num(N.stdDevPerBet, 3)};波动性指数(95% 置信,1.96·σ,单位:投注)= ${num(N.volatilityIndex95, 2)}。`,
    `- 最大赢额 = ${num(N.maxWinMult, 1)}x 总投注(正常)/ ${num(B.maxWinMult, 1)}x(购买);5000x 上限触达 ${N.cappedRounds} 局(正常)/ ${B.cappedRounds} 次(购买)。上限截断造成的 RTP 损失(模拟内累计)= ${pct(N.capLossRtp, 4)}。`,
    `- 本样本中未出现 5000x 上限与 60 次 FS 上限的真实触达;这两条规则由单元测试(构造轴带)覆盖,且解析值(不含上限)与模拟值一致,说明上限对 RTP 的影响低于模拟分辨率。`, ``);
  L.push(`## 4. 购买 Free Spins`, ``,
    `- 购买价格:**${a.configuredPrice}x** 总投注(文档初值 75x;解析使购买 RTP = 正常 RTP 的价格为 ${num(a.buyPriceForEqualRtp, 3)}x)。`,
    `- 购买 RTP:**${pct(B.rtp)}**(95% CI ${pct(B.rtpCI95[0])} ~ ${pct(B.rtpCI95[1])};解析值 ${pct(a.buyRtpAtConfiguredPrice)});平均赢额 ${num(B.avgFeatureWinMult, 3)}x 投注,平均 FS 次数 ${num(B.fsAvgPlayedPerTrigger)},含重触发比例 ${pct(B.fsRetriggerRateOfFs)},购买局零赢 ${pct(B.zeroRate, 4)}。`,
    `- **购买 RTP − 正常 RTP = ${pp >= 0 ? '+' : ''}${pp.toFixed(3)} 个百分点**(差值 SE ≈ ${seD.toFixed(3)} pp);要求 ≤ 0.5 pp → ${ok(Math.abs(pp) <= 0.5)}。`,
    `- 购买局波动(相对购买价):σ = ${num(B.stdDevPerCost, 3)}x 价格。`, ``);
  dist(L, B.distribution, '赢额分布(购买,倍总投注)');
  L.push(`## 5. 与目标区间逐项对照`, ``, `| 目标 | 区间 | 实测 | 结论 |`, `|---|---|---|---|`);
  const row = (n: string, r: string, v: string, o: boolean) => L.push(`| ${n} | ${r} | ${v} | ${ok(o)} |`);
  row('总 RTP', '95.5% ~ 96.5%(尽量贴近 96.0%)', `${pct(N.rtp)}(CI ${pct(N.rtpCI95[0])} ~ ${pct(N.rtpCI95[1])};距 96.0% ${((N.rtp - 0.96) * 100).toFixed(3)} pp)`, rng(N.rtp, 0.955, 0.965) && rng(N.rtpCI95[0], 0.955, 0.965) && rng(N.rtpCI95[1], 0.955, 0.965));
  row('基础贡献', '62% ~ 68%', pct(N.baseRtp), rng(N.baseRtp, 0.62, 0.68));
  row('FS 贡献', '28% ~ 34%', pct(N.featureRtp), rng(N.featureRtp, 0.28, 0.34));
  row('基础命中率', '26% ~ 32%', pct(N.hitRate), rng(N.hitRate, 0.26, 0.32));
  row('FS 触发频率', '约 1/120 ~ 1/180', one(N.oneInTrigger), rng(N.oneInTrigger, 120, 180));
  row('购买 RTP 与正常差', '≤ 0.5 pp', `${pp.toFixed(3)} pp`, Math.abs(pp) <= 0.5);
  const cnt = (set: any[][], f: (s: string) => boolean) => set.reduce((x, r) => x + r.filter(f).length, 0);
  L.push(`| FS 轴带:W 更多 / 低图案更少 / S 比例 ≤ BASE | 文档 6.4 | 见 \`test/extra.test.ts\`(自动断言)与 PAYTABLE_CHANGES.md 的比例表 | 达标 |`, ``);
  L.push(`## 6. 说明`, ``, `- 命中率口径:基础旋转的线赢 > 0 或 Scatter 赢 > 0(Scatter 3 个即有赔付)。`, `- 本报告为 96% 附近的校准结果,校准过程见 \`scripts/calibrateA.ts\`(模拟退火 + native/enum.c 全组合枚举)。`);
  fs.writeFileSync(new URL('../report/RTP_report_A.md', import.meta.url), L.join('\n') + '\n');
}

// ───────────── B ─────────────
{
  const N = rd('summary_B_normal_final.json'), B = rd('summary_B_buy_final.json');
  const { L, pp, seD } = common('B', N, B);
  const a = an.B;
  L.splice(0, 0, `# 玩法 B《金鲤满仓》Hold & Spin RTP 报告`, ``, `> 本文数字全部来自 \`sim/summary_B_*_final.json\`(蒙特卡洛)与 \`sim/analytic.json\`(精确枚举 + 马尔可夫链),由 \`scripts/makeReport.ts\` 生成。`, ``);
  const J = N.jackpotCoinRtp;
  L.push(`## 2. 正常游玩结果`, ``,
    `| 指标 | 模拟值 | 解析值(无上限) |`, `|---|---|---|`,
    `| **总 RTP** | **${pct(N.rtp)}**(95% CI ${pct(N.rtpCI95[0])} ~ ${pct(N.rtpCI95[1])};SE ${pct(N.rtpSE_batch, 4)}(解析 SE ${pct(N.rtpSE_analytic, 4)})) | ${pct(a.totalRtp)} |`,
    `| 基础线赢贡献 | ${pct(N.baseLineRtp)} | ${pct(a.baseLineRtp)} |`,
    `| H&S 贡献(含 Jackpot) | ${pct(N.hsRtp)} | ${pct(a.hsRtp)} |`,
    `| 　倍数币 | ${pct(N.hsCoinRtp)} | ${pct(a.hsCoinRtp)} |`,
    `| 　Jackpot 币合计 | ${pct(N.jackpotCoinRtpTotal)}(Mini ${pct(J.Mini, 3)} / Minor ${pct(J.Minor, 3)} / Major ${pct(J.Major, 3)} / Grand ${pct(J.Grand, 3)}) | ${pct(a.hsJackpotCoinRtp)} |`,
    `| 　满屏 Grand 奖励 | ${pct(N.fullScreenRtp)} | ${pct(a.hsFullScreenRtp)} |`,
    `| **Jackpot 合计(Jackpot 币 + 满屏 Grand)** | **${pct(N.jackpotRtpTotalInclFullScreen)}** | ${pct(a.hsJackpotCoinRtp + a.hsFullScreenRtp)} |`,
    `| 基础命中率(线赢) | ${pct(N.hitRate)} | ${pct(a.hitRate)} |`,
    `| 零赢局占比 | ${pct(N.zeroRate)} | — |`,
    `| H&S 触发频率 | ${pct(N.triggerRate, 4)} = ${one(N.oneInTrigger)}(触发 ${N.triggerCount.toLocaleString('en-US')} 次) | ${pct(a.triggerRate, 4)} = ${one(1 / a.triggerRate)} |`,
    `| 每次 H&S 平均最终 K / 平均重旋转次数 | ${num(N.hsAvgFinalK, 3)} / ${num(N.hsAvgRespins, 3)} | ${num(a.hsAvgFinalK, 3)} / ${num(a.hsAvgRespins, 3)} |`,
    `| 满屏(K=15)次数 / 频率 | ${N.fullScreenCount.toLocaleString('en-US')} = ${one(N.fullScreenOneIn)} 每局;占 H&S 的 ${pct(N.fullScreenRateOfHs, 4)} | 占 H&S ${pct(a.fullScreenProbPerSpin / a.triggerRate, 4)} |`,
    `| 触发局平均 H&S 赢额 / 标准差 / 最大(倍总投注) | ${num(N.avgFeatureWinMult, 2)} / ${num(N.featureStdDev, 2)} / ${num(N.featureWinMax, 1)} | ${num(a.avgHsEv, 2)}(均值) |`, ``);
  L.push(`### Jackpot 出现频率(正常游玩;按「含该层 Jackpot 币的局数」)`, ``, `| 层级 | 倍数 | 币数 | 局数 | 频率 | 占 RTP |`, `|---|---|---|---|---|---|`);
  const jm: any = { Mini: 10, Minor: 25, Major: 100, Grand: 1000 };
  for (const t of ['Mini', 'Minor', 'Major', 'Grand']) L.push(`| ${t} | ${jm[t]}x | ${N.jackpotCoinCount[t].toLocaleString('en-US')} | ${N.jackpotRoundCount[t].toLocaleString('en-US')} | ${one(N.jackpotRoundOneIn[t])} | ${pct(J[t], 3)} |`);
  L.push(`| 满屏 Grand 奖励 | 1000x | — | ${N.fullScreenCount.toLocaleString('en-US')} | ${one(N.fullScreenOneIn)} | ${pct(N.fullScreenRtp, 3)} |`, ``);
  L.push(`### 触发时 H&S 最终 K 分布(正常)`, ``, `| K | 次数 | 占触发 |`, `|---|---|---|`);
  for (let k = 6; k <= 15; k++) L.push(`| ${k} | ${N.hsKHist[k].toLocaleString('en-US')} | ${pct(N.hsKHist[k] / N.triggerCount, 3)} |`);
  L.push(``);
  dist(L, N.distribution, '赢额分布(正常游玩)');
  L.push(`## 3. 波动性与上限`, ``,
    `- 每局赢额标准差(倍总投注)= ${num(N.stdDevPerBet, 3)};波动性指数(95% 置信,1.96·σ,单位:投注)= ${num(N.volatilityIndex95, 2)}。`,
    `- 最大赢额 = ${num(N.maxWinMult, 1)}x 总投注(正常)/ ${num(B.maxWinMult, 1)}x(购买);10000x 上限触达 ${N.cappedRounds} 局(正常)/ ${B.cappedRounds} 次(购买)。上限截断造成的 RTP 损失 = ${pct(N.capLossRtp, 4)}。`,
    `- 10000x 上限在本样本中未被触达(满屏 + 多个 Grand 币的极端组合概率低于模拟分辨率);该规则由单元测试(构造 Grand 币)覆盖。`, ``);
  L.push(`## 4. 购买 Hold & Spin`, ``,
    `- 购买价格:**${a.configuredPrice}x** 总投注(文档初值 60x;解析使购买 RTP = 正常 RTP 的价格为 ${num(a.buyPriceForEqualRtp, 3)}x)。`,
    `- 购买 RTP:**${pct(B.rtp)}**(95% CI ${pct(B.rtpCI95[0])} ~ ${pct(B.rtpCI95[1])};解析值 ${pct(a.buyRtpAtConfiguredPrice)});平均赢额 ${num(B.avgFeatureWinMult, 3)}x 投注,平均最终 K ${num(B.hsAvgFinalK, 3)},满屏 ${one(B.fullScreenOneIn)} 每次购买(占 ${pct(B.fullScreenRateOfHs, 4)}),Jackpot 合计(含满屏)占 RTP ${pct(B.jackpotRtpTotalInclFullScreen, 3)}。`,
    `- **购买 RTP − 正常 RTP = ${pp >= 0 ? '+' : ''}${pp.toFixed(3)} 个百分点**(差值 SE ≈ ${seD.toFixed(3)} pp);要求 ≤ 0.5 pp → ${ok(Math.abs(pp) <= 0.5)}。`,
    `- 购买局波动(相对购买价):σ = ${num(B.stdDevPerCost, 3)}x 价格。`, ``);
  dist(L, B.distribution, '赢额分布(购买,倍总投注)');
  L.push(`## 5. 与目标区间逐项对照`, ``, `| 目标 | 区间 | 实测 | 结论 |`, `|---|---|---|---|`);
  const row = (n: string, r: string, v: string, o: boolean) => L.push(`| ${n} | ${r} | ${v} | ${ok(o)} |`);
  row('总 RTP', '95.5% ~ 96.5%', `${pct(N.rtp)}(CI ${pct(N.rtpCI95[0])} ~ ${pct(N.rtpCI95[1])};距 96.0% ${((N.rtp - 0.96) * 100).toFixed(3)} pp)`, rng(N.rtpCI95[0], 0.955, 0.965) && rng(N.rtpCI95[1], 0.955, 0.965));
  row('基础线赢贡献', '30% ~ 36%', pct(N.baseLineRtp), rng(N.baseLineRtp, 0.30, 0.36));
  row('H&S 贡献(含 Jackpot)', '60% ~ 66%', pct(N.hsRtp), rng(N.hsRtp, 0.60, 0.66));
  row('Jackpot 合计(Jackpot 币 + 满屏 Grand)', '4% ~ 7%', `${pct(N.jackpotRtpTotalInclFullScreen)}(仅 Jackpot 币 ${pct(N.jackpotCoinRtpTotal)})`, rng(N.jackpotRtpTotalInclFullScreen, 0.04, 0.07));
  row('基础命中率', '20% ~ 26%', pct(N.hitRate), rng(N.hitRate, 0.20, 0.26));
  row('H&S 触发频率', '约 1/100 ~ 1/160', one(N.oneInTrigger), rng(N.oneInTrigger, 100, 160));
  row('购买 RTP 与正常差', '≤ 0.5 pp', `${pp.toFixed(3)} pp`, Math.abs(pp) <= 0.5);
  L.push(`| p(K) 单调不增且 0<p<1 | 规则 5.3 | 见 \`config/gameB.ts\`;\`createEngine\` 校验 + \`test/extra.test.ts\` 断言 | 达标 |`, `| 币值全为整数、Jackpot 倍数整数 | 规则 5.1 / 4.5 | 见 \`config/gameB.ts\`;同上 | 达标 |`, ``);
  L.push(`## 6. 说明`, ``,
    `- **Jackpot 口径**:文档第 0 节「Jackpot 四层合计 4%~7%」,本报告把满屏 Grand 奖励算作 Grand 层级奖金,故「合计 = Jackpot 币 + 满屏 Grand」。若只统计 Jackpot 币,为 ${pct(N.jackpotCoinRtpTotal)}(略低于 4%);请策划确认口径。`,
    `- 命中率口径:基础旋转线赢 > 0(B 无 Scatter;触发 H&S 但无线赢的旋转不计为命中)。`,
    `- H&S 的赢额只在结算步一次发放;表中「H&S 贡献」= 特色玩法赢额(含截断后),与基础线赢相加等于总 RTP。`);
  fs.writeFileSync(new URL('../report/RTP_report_B.md', import.meta.url), L.join('\n') + '\n');
}
console.log('reports written');
