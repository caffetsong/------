// 2026-10-19 实验期梯度分析（算法 v4：全榜分布）
// 用法：bun tools/analyze-experimental.mjs
import fs from "node:fs";
import { resolve } from "node:path";
import { getPeriodFull } from "../db.js";
import "../js/algorithm.js";

const ROOT = resolve(import.meta.dir, "..");
const DATE = "2026-10-19";
const config = JSON.parse(fs.readFileSync(resolve(ROOT, "config.json"), "utf8"));
const period = getPeriodFull(DATE);
if (!period) throw new Error("数据库中没有 " + DATE);

const raw = period.heroes.map((h) => ({
  heroName: h.name,
  appearanceRank: h.appearanceRank,
  winRate: h.winRate,
  power: h.power
}));
const result = globalThis.SGAlgorithm.compute(raw, config);
const byRank = result.sorted;

// ---------- 统计工具 ----------
function rankArray(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i + 1;
    while (j < order.length && order[j].v === order[i].v) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) out[order[k].i] = avg;
    i = j;
  }
  return out;
}
function spearman(x, y) {
  const rx = rankArray(x), ry = rankArray(y);
  const n = rx.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy || 1);
}
const pct = (v) => v == null ? "-" : (v * 100).toFixed(2) + "%";
const one = (v) => v == null ? "-" : Number(v).toFixed(1);
const tierCounts = {};
for (const h of byRank) tierCounts[h.tier] = (tierCounts[h.tier] || 0) + 1;

function computeVariant(mutate) {
  const cfg = JSON.parse(JSON.stringify(config));
  mutate(cfg.algorithm);
  return globalThis.SGAlgorithm.compute(raw, cfg);
}
const baselineT0 = new Set(byRank.filter((h) => h.tier === "T0").map((h) => h.name));
const variants = [
  ["头部/全榜 0.4/0.6", (a) => { a.metricWeights = { head: 0.4, mean: 0.6 }; }],
  ["头部/全榜 0.6/0.4", (a) => { a.metricWeights = { head: 0.6, mean: 0.4 }; }],
  ["头部比例 15%", (a) => { a.headFraction = 0.15; }],
  ["头部比例 20%", (a) => { a.headFraction = 0.20; }],
  ["战力权重 0.65", (a) => { a.weights = { appearance: 0.175, combat: 0.65, winrate: 0.175 }; }],
  ["战力权重 0.75", (a) => { a.weights = { appearance: 0.125, combat: 0.75, winrate: 0.125 }; }]
].map(([label, mutate]) => {
  const r = computeVariant(mutate);
  const t0 = new Set(r.sorted.filter((h) => h.tier === "T0").map((h) => h.name));
  const top10 = new Set(r.sorted.slice(0, 10).map((h) => h.name));
  const baseTop10 = new Set(byRank.slice(0, 10).map((h) => h.name));
  return {
    label,
    t0Overlap: [...baselineT0].filter((n) => t0.has(n)).length,
    top10Overlap: [...baseTop10].filter((n) => top10.has(n)).length,
    t0Added: [...t0].filter((n) => !baselineT0.has(n)),
    t0Removed: [...baselineT0].filter((n) => !t0.has(n))
  };
});

const corr = [
  ["评分 vs 头部均值", spearman(byRank.map((h) => h.score), byRank.map((h) => h.headMean))],
  ["评分 vs 全榜均值", spearman(byRank.map((h) => h.score), byRank.map((h) => h.fullMean))],
  ["评分 vs 出场排名", spearman(byRank.map((h) => h.score), byRank.map((h) => h.appearanceRank))],
  ["评分 vs 胜率", spearman(byRank.map((h) => h.score), byRank.map((h) => h.winRate))],
  ["评分 vs 榜长", spearman(byRank.map((h) => h.score), byRank.map((h) => h.rankCount))],
  ["评分 vs 旧国9(参考)", spearman(byRank.map((h) => h.score), byRank.map((h) => h.power[8] ?? 0))]
];

const short = byRank.filter((h) => h.rankCount < 100);
const shortTiers = {};
for (const h of short) shortTiers[h.tier] = (shortTiers[h.tier] || 0) + 1;
const highPowerLowWr = [...byRank]
  .filter((h) => h.headMean >= 6300 && h.winRate < 0.49)
  .sort((a, b) => b.headMean - a.headMean)
  .slice(0, 8);

function row(h) {
  return `| ${h.rank} | ${h.name} | ${h.tier} | ${one(h.score)} | ${h.appearanceRank} | ${h.headMean} | ${h.fullMean} | ${h.rankCount} | ${pct(h.winRate)} |`;
}
const tableHead = `| 排名 | 英雄 | 梯度 | 评分 | 出场排名 | 头部均值 | 全榜均值 | 榜长 | 胜率 |\n|---:|---|---|---:|---:|---:|---:|---:|---:|`;
const tierNames = (t) => byRank.filter((h) => h.tier === t).map((h) => h.name).join("、");

const report = `# 曙光英雄梯度分析 · 2026-10-19 实验期

> 数据：大神榜全英雄 1–N 战力分布（103 英雄 / 9,167 行玩家）+ 2026-10-19 出场排名与胜率  
> 算法：v4（取消固定「国9」口径，改用头部均值 + 全榜均值）  
> 旧数据已封存于 \`archive/legacy/\`

---

## 1. 数据概况

| 项 | 值 |
|---|---:|
| 英雄数 | ${result.heroes.length} |
| 玩家榜行数 | ${period.rowCount} |
| 满 100 名 | ${result.heroes.filter((h) => h.rankCount === 100).length} |
| 不足 100 名 | ${short.length}（最短 ${Math.min(...short.map((h) => h.rankCount))}） |
| 采集时间 | ${period.capturedAt || "-"} |
| 数据来源 | 大神榜 XLSX + 10-19 JSON |

> 短榜不补 0，只用实际存在的名次。

---

## 2. 算法 v4（不再使用国9）

旧版用「国9战力」是因为当时只有国1/国9/国50等几个标量；现在有完整 1–N 分布，固定取第 9 名没有统计依据，且对短榜不公平。v4 直接使用整条战力曲线：

\`\`\`
头部均值 = mean(power[0 .. k-1])，k = max(3, ceil(10% × n))
全榜均值 = mean(power[0 .. n-1])        # 归一化 AUC，覆盖整条曲线

头部分 = percentile(头部均值)             # 103 人内 0..1
全榜分 = percentile(全榜均值)
战力分 = 0.50 × 头部分 + 0.50 × 全榜分

出场分 = 1 − (出场排名 − 1) / (N − 1)
胜率分 = minmax(胜率)
raw    = 0.15 × 出场分 + 0.70 × 战力分 + 0.15 × 胜率分
评分   = minmax(raw) × 100
\`\`\`

设计说明：
- **头部均值**取前 10%（至少 3 名），衡量「高端上限」，不绑定第 9 名；
- **全榜均值**是整条战力曲线的归一化面积，衡量「整体深度」；
- 两项各占 0.50，避免只奖励头部或只奖励人数；
- 榜长不再作为分数项，短榜按自身比例计算头部；
- 换英雄、换版本时算法不需要重新定义「第几名」。

---

## 3. 梯度结果

| 梯度 | 人数 |
|---|---:|
| T0 | ${tierCounts.T0 || 0} |
| T0.5 | ${tierCounts["T0.5"] || 0} |
| T1 | ${tierCounts.T1 || 0} |
| T2 | ${tierCounts.T2 || 0} |
| T3 | ${tierCounts.T3 || 0} |
| T4 | ${tierCounts.T4 || 0} |

### T0（${tierCounts.T0 || 0}）

${tableHead}
${byRank.filter((h) => h.tier === "T0").map(row).join("\n")}

### T0.5（${tierCounts["T0.5"] || 0}）

${byRank.filter((h) => h.tier === "T0.5").map((h) => `${h.rank}. **${h.name}**（${one(h.score)}）`).join("　")}

### Top 20

${tableHead}
${byRank.slice(0, 20).map(row).join("\n")}

### 完整分层名单

- **T0**：${tierNames("T0")}
- **T0.5**：${tierNames("T0.5")}
- **T1**：${tierNames("T1")}
- **T2**：${tierNames("T2")}
- **T3**：${tierNames("T3")}
- **T4**：${tierNames("T4")}

---

## 4. 相关性

| 关系 | Spearman ρ |
|---|---:|
${corr.map(([k, v]) => `| ${k} | ${v.toFixed(3)} |`).join("\n")}

- 评分与头部均值、全榜均值都高度相关，说明两项都在起作用；
- 与出场排名负相关：战力高的英雄往往出场排名数字更大（玩得少但上限高）；
- 与旧国9仍有较高相关（口径相近），但排序不再由第 9 名单独决定。

---

## 5. 敏感性

| 变体 | T0 保留 | Top10 保留 | T0 新进 | T0 掉出 |
|---|---:|---:|---|---|
${variants.map((v) => `| ${v.label} | ${v.t0Overlap}/9 | ${v.top10Overlap}/10 | ${v.t0Added.join("、") || "-"} | ${v.t0Removed.join("、") || "-"} |`).join("\n")}

> 头部/全榜权重互换、头部比例 15%/20%、战力权重 ±0.05 下，T0 主体稳定。

---

## 6. 值得注意的英雄

- **貂蝉（T0，第 1）**：头部均值 6406、全榜均值 5992，两项都高，综合第一。
- **张角（T0，第 2）**：新英雄，头部 6327、全榜 5940；头像/横幅/介绍均已补齐。
- **铁扇公主（T0，第 4）**：头部均值 6509 最高，但全榜均值只有 5077，是典型「头部强、尾部薄」；v4 仍让它留在 T0，但不再像旧版那样排第 1。
- **诸葛亮（T0.5，第 11）**：头部均值 6427 很高，但全榜均值 4997 偏低，从旧版 T0 掉到 T0.5；这是取消国9后最明显的变化。
- **艾璐妮（T0，第 7）**：头部均值 6629 全榜最高，胜率只有 46.79%，靠分布留在 T0。
- **岚（T1，第 15）**：头部 6345 不低，但全榜 4697，掉到 T1。
- **低胜率但高头部**：${highPowerLowWr.map((h) => `${h.name}（头部 ${h.headMean} / 胜率 ${pct(h.winRate)}）`).join("、")}。

---

## 7. 短榜影响

不足 100 名的英雄：${short.length} 个，梯度分布：${Object.entries(shortTiers).map(([t, c]) => `${t} ${c}`).join(" / ")}。

- 头部按自身榜长取前 10%，且至少 3 名；短榜不会因为「没有 100 人」被直接判低。
- 全榜均值仍是整条曲线的平均，短榜只覆盖实际名次，因此缺少榜尾深度；这是数据事实。
- 短榜最高只到 ${short.sort((a, b) => a.rank - b.rank)[0]?.tier || "-"}。

---

## 8. 结论与下一步

1. **国9口径已取消**：v4 不再引用第 9 名，改用「头部均值 + 全榜均值」；两项都来自完整 1–N 分布。
2. 结果变化符合预期：全能型/深度型（貂蝉、张角、艾蒙）上升，头部强但尾部薄的（诸葛亮、岚）下降。
3. 一期 JSON 可以承载：合并后约 740 KB（含 9,167 行玩家明细）；长期仍用 SQLite + 快照。
4. 下一步：确认头部比例（10% vs 15%）与两项权重（50/50 vs 40/60），再把版本号固化；旧期数据继续封存。
`;

const outDir = resolve(ROOT, "data", "analysis");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(resolve(outDir, "2026-10-19-scores.json"), JSON.stringify({
  schema: 2,
  date: DATE,
  algorithm: config.algorithm,
  meta: result.meta,
  tiers: tierCounts,
  heroes: byRank.map((h) => ({
    rank: h.rank,
    tier: h.tier,
    name: h.name,
    appearanceRank: h.appearanceRank,
    winRate: h.winRate,
    rankCount: h.rankCount,
    headCount: h.headCount,
    headMean: h.headMean,
    fullMean: h.fullMean,
    leaderPower: h.leaderPower,
    lastPower: h.lastPower,
    combatScore: h.combatScore,
    score: h.score
  }))
}, null, 2));

const reportPath = resolve(ROOT, "reports");
fs.mkdirSync(reportPath, { recursive: true });
fs.writeFileSync(resolve(reportPath, "实验性梯度分析_2026-10-19.md"), report);

console.log("T0:", byRank.filter((h) => h.tier === "T0").map((h) => h.name).join("、"));
console.log("tiers:", tierCounts);
console.log("wrote:", resolve(reportPath, "实验性梯度分析_2026-10-19.md"));
console.log("wrote:", resolve(outDir, "2026-10-19-scores.json"));
