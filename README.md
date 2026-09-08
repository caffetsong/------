# MOBA 英雄梯度排行榜

> 多游戏 · 数据驱动 · 算法透明 · 零依赖

基于统计数据的 MOBA 英雄梯度排行仪表盘，支持 **英雄联盟手游（LoLM）** 和 **曙光英雄**。纯静态页面，双击即可在浏览器中打开。

---

## 快速开始

> 需要 [bun](https://bun.sh)（v1.x）。bun 服务器同时托管站点与编辑器，并自动扫描日期数据文件。

```bash
cd MOBA游戏梯度
bun server.js          # 默认端口 3001
# 浏览器打开 http://127.0.0.1:3001/          （站点 index.html）
#            http://127.0.0.1:3001/editor.html （数据编辑器）
```

> ⚠️ 日期类游戏（曙光英雄）依赖服务器自动扫描目录，请务必通过 bun 服务器访问，不要直接双击 index.html（静态打开无法枚举本地文件）。

---

## 项目结构

```
MOBA游戏梯度/
├── server.js            # bun 服务器（静态托管 + API + 日期自动扫描 + SSE 热刷新）
├── index.html           # 统一入口，游戏选择器 + 渲染壳
├── css/tier-list.css    # 公共样式（深色主题，响应式）
├── js/tierlist.js       # 核心引擎（算法 + 渲染 + 搜索 + 排序）
├── js/dataSource.js     # 数据访问层（探测服务器，回退静态直读）
├── lolm/
│   ├── config.json      # LoLM 配置（分路、算法参数、列定义）
│   ├── 上路.json         # 上路数据
│   ├── 打野.json         # 打野数据
│   ├── 中路.json         # 中路数据
│   ├── 下路.json         # ADC 数据
│   ├── 辅助.json         # 辅助数据
│   └── HeadIcon/         # 英雄头像 (PNG, 按名命名)
└── 曙光英雄/
    ├── config.json      # 曙光配置（无分路；dates 由服务器自动扫描，无需手写）
    ├── 曙光英雄_YYYY-MM-DD.json   # 多期数据，命名按起始日期（8-17~8-23 → 曙光英雄_2026-08-17.json）
    └── HeadIcon/         # 英雄头像 (PNG, 按名命名)
```

---

## 功能

| 功能 | LoLM | 曙光英雄 |
|------|------|---------|
| 分路导航 | ✅ 5 路切换 | — 无分路，全量排行 |
| 算法选择 | Z-score / 简易公式 | 加权和 (0.15/0.70/0.15) |
| 视图模式 | 分路排名 + 全局排名 | 全量排名 |
| 搜索 | ✅ 跨分路搜索 | ✅ 全量搜索 |
| 英雄头像 | ✅ 圆形头像图标 | — |
| 排序 | ✅ 点击表头排序 | ✅ 点击表头排序 |
| URL 分享 | ✅ `?game=lolm&lane=mid` | ✅ `?game=sg` |
| 响应式 | ✅ 768px 断点 | ✅ 768px 断点 |
| 统计卡片 | 平均胜率/出场率/Ban率 | 平均战力/胜率区间 |

---

## 算法

### LoLM：Z-score 加权

对每个分路独立计算：

```
Z-score 加权: 0.5×Z(胜率) + 1.0×Z(出场率) + 3.0×Z(Ban率)
简易公式: 胜率^0.3 × (出场率 + 2.5×Ban率) × 100
```

- 分路内 min-max 归一化 → 0~100 分路评分
- 全局 min-max 归一化 → 0~100 全局评分
- 百分位定 T0~T4

### 曙光英雄：加权和（高端局导向）

> 2026-08 更新：战力信号改为 **国9战力**（config `algorithm.combatField`），权重改为 **0.15/0.70/0.15**——让"高端局强度"（国9 顶端玩家表现）主导排名。

```
出场分 = 1 - (出场排名 - 1) / (英雄总数 - 1)
战力分 = (国9战力 - min) / (max - min)        # 国9战力 min-max 归一化（默认取 combatPower，可配置）
胜率分 = (胜率 - min胜率) / (max胜率 - min胜率)  # min-max 归一化

rawPower = 0.15 × 出场分 + 0.70 × 战力分 + 0.15 × 胜率分
最终评分 = (rawPower - min) / (max - min) × 100
```

**权重设计逻辑（高端局导向）：**

| 维度 | 权重 | 理由 |
|------|------|------|
| 加权战力分（国9） | **0.70** | 顶端玩家信号，直接反映英雄高端局上限；国9 比国50/100 更能代表"高熟练度强度" |
| 胜率 | **0.15** | 大众表现参考，但会被低分段拉低（高熟练度英雄胜率常偏低），故压低权重 |
| 出场排名 | **0.15** | 主要惩罚"没人玩但数据好"的个例；冷门高上限英雄（如拉姆）数据无法体现其强度，需人工修正 |

### 梯度定义

| 梯度 | 百分位 | 含义 |
|------|--------|------|
| T0 | 前 8% | 版本答案，非 Ban 必选 |
| T0.5 | 前 8%~12% | 强势，接近 T0 |
| T1 | 前 12%~30% | 优秀，稳定上分 |
| T2 | 前 30%~60% | 中规中矩，可玩 |
| T3 | 前 60%~88% | 弱势，需绝活 |
| T4 | 末 12% | 版本弃子 |

---

## 添加新游戏

只需创建 `新游戏/config.json` + 数据 JSON 即可，无需修改任何代码。

```jsonc
{
  "gameId": "新游戏ID",
  "gameName": "游戏名",
  "gameIcon": "🎮",
  "hasLanes": true,          // true=有分路, false=无分路
  "headIconPath": "HeadIcon/{name}.png",  // 可选，英雄头像路径模板

  // 有分路时的配置：
  "lanes": [
    { "id": "top", "name": "上路", "dataFile": "上路.json" }
  ],

  // 无分路时的配置：
  "dataFile": "全量数据.json",

  "algorithm": {
    // 可选: "zscore" | "simple" | "weighted"
    "type": "weighted",
    "combatField": "国9战力",   // 可选: 战力信号字段名，默认 combatPower
    "weights": { "appearance": 0.15, "combat": 0.70, "winrate": 0.15 }
  },

  "columns": [
    { "label": "#", "field": "rank", "type": "rank" },
    { "label": "英雄", "field": "name", "type": "text" },
    { "label": "梯度", "field": "tier", "type": "tier" },
    { "label": "评分", "field": "score", "type": "score" }
    // type: "rank" | "text" | "tier" | "score" | "pct" | "int"
    // colorClass (可选): "wr" 胜率着色, "cw" 战力着色
  ],

  "statCards": [
    { "label": "平均胜率", "field": "wr", "format": "pct" }
    // format: "pct" | "int" | "text"
    // 特殊 field: "winRateRange" 胜率区间, "count" 英雄总数
  ],

  "footer": "页脚文案"
}
```

### 数据类型说明

| type | 显示效果 | 适用字段 |
|------|---------|---------|
| `rank` | 排名数字（前三名金银铜着色） | rank, globalRank |
| `tier` | 彩色梯度标签 | tier |
| `score` | 分数进度条 | score |
| `pct` | 百分比（可着色） | winRate, pickRate, banRate |
| `int` | 整数（可着色） | combatPower, appearanceRank |
| `text` | 纯文本 | heroName, lane |

### 算法配置

| type | 说明 | 必需参数 |
|------|------|---------|
| `zscore` | 分路内 Z-score + 全局归一化 | `weights.wr`, `weights.pr`, `weights.br` |
| `simple` | 简易公式（LOLM 第二算法） | `simpleWrExp`, `simpleBrBoost` |
| `weighted` | 加权和 + min-max 归一化（曙光算法） | `weights.{维度名}`；可选 `combatField` 指定战力信号字段 |

> ⚠️ 目前仅 `zscore`、`weighted` 两种算法已完整实现。添加 `simple` 类型需要在 `tierlist.js` 中补充渲染逻辑。

---

## 技术栈

- **纯原生 HTML/CSS/JS** — 零框架、零构建、零外部依赖
- **深色主题** — GitHub dark 风格
- **响应式** — 768px 断点适配移动端
- **客户端计算** — 所有算法在浏览器中运行

---

## 参考文献

- [hok-meta-analyzer](https://github.com/lnsdeep/hok-meta-analyzer) — 王者荣耀元数据分析器（架构参考）
- [statsWR](https://github.com/HuiDiHu/statsWR) — Wild Rift 梯度排行（MERN 全栈参考）

---

## 验证结果（曙光英雄）

> ⚠️ 以下为 2026-08 改版（国9战力信号 + 0.15/0.70/0.15）之前的旧算法验证记录。

| 验证项 | 结果 |
|--------|------|
| Spearman 秩相关 | 出场排名 ρ=+0.86, 战力分 ρ=+0.82, 胜率 ρ=+0.86 |
| 敏感性（±0.05 微调） | T0 名单完全不变 |
| 权重鲁棒性 | 微调不影响 Top10 集合 |



# 曙光备注
文件命名应为起始数据,例如8-17到8-23的数据命名为8-17