# 曙光英雄梯度

> 数据驱动 · 算法透明 · React + Rust + SQLite

曙光英雄（手游）英雄梯度排行仪表盘 + 备战管理器（符文/出装方案）。当前有效期为 **2026-11-17**；`2026-10-19` 已恢复为历史期，旧 UID 已全部清空，未用 10-26 的 UID 填充。

---

## 新版前端（React + Rust）

```
apps/web/       React + Vite + Tailwind + shadcn 风格 + TanStack + Recharts
server-rs/      Rust + Axum + rusqlite（读取 data/tierlist.db / blacklist.json）
```

```bash
# 1. 构建前端
cd apps/web
pnpm install
pnpm build              # 输出 apps/web/dist

# 2. 构建并启动 Rust 服务（默认 3002）
cd ../..
./server-rs/build.ps1
./server-rs/target/release/sg-tierlist-server.exe
# 浏览器打开 http://127.0.0.1:3002/app/

# 3. 备战页仍由 Bun 提供（默认 3001）
bun server.js
```

- 新前端：`/app/`（排行榜表格/网格 + 英雄详情 + 战力排行 + 备战方案 + 失信名单）
- 备战方案：`/app/prepare`，符文、出装、选手方案，来自 `data.json`
- 数据导入：新版右上角「导入数据」选择 JSON，再粘贴出场排名/胜率文本，直接写入 SQLite
- 战力排行：按英雄查看玩家名次、UID、战力、失信状态与国前十英雄；战绩公开/单排/组排暂为占位
- 英雄详情支持常用分路、擅长选手编辑（写回 `英雄介绍.json`）与备战方案入口
- 擅长选手按 UID 显示最新榜单用户名，查不到时回退 UID
- 失信名单支持为每个 UID 填写失信原因
- 所有日期均剔除失信名单；历史期 UID 为空时按黑名单用户名兜底
- 表格上方展示「梯度变化」（较上一期梯度变化，表格梯度胶囊同步显示旧→新）
- 历史趋势按全局 min/max 归一化展示评分、胜率、头部均值、排名、出场排名
- 已移除职业字段与新视图的职业筛选
- 旧备战页：`http://127.0.0.1:3001/备战.html`
- Rust 已迁移：配置、期数、榜单读取、数据导入、英雄历史、失信名单读写

---

## Tauri 桌面版

```text
src-tauri/          Tauri 2 桌面壳 + Rust sidecar
```

首次启动会把 `data/tierlist.db`、`blacklist.json`、`player-flags.json`、`英雄介绍.json` 复制到：

```text
%LOCALAPPDATA%\com.shuguang.tierlist\data\
```

运行时只写 AppData，不写安装目录。

构建：

```powershell
cd apps/web
pnpm build
cd ..\..

.\server-rs\build.ps1
Copy-Item server-rs\target\release\sg-tierlist-server.exe src-tauri\resources\server\sg-tierlist-server.exe -Force
cargo build --release --manifest-path src-tauri/Cargo.toml
```

输出：

```text
src-tauri\target\release\sg-tierlist-desktop.exe
```

当前环境下载 WiX/NSIS 工具超时，安装包暂未生成；桌面 exe 已可用。

---

## 旧版快速开始（Bun + 原生页面）

> 需要 [bun](https://bun.sh)（v1.x）。bun 服务器同时托管页面、初始化 SQLite、提供数据 API。

```bash
cd 曙光英雄梯度
bun server.js                        # 默认端口 3001
# 浏览器打开：
#   http://127.0.0.1:3001/            梯度排行（主页）
#   http://127.0.0.1:3001/备战.html    备战管理器（符文 + 出装）
#   http://127.0.0.1:3001/blacklist.html 失信名单（UID 黑名单）
```

首次启动时，如果 `data/tierlist.db` 不存在，会用根目录最新一期 JSON 自动建库（当前 `曙光英雄_2026-11-17.json`，103 英雄 / 9,896 行玩家）。

```bash
bun tools/db-setup.mjs --force 2026-11-17   # 重新导入指定日期
python tools/merge_experimental.py <xlsx> --no-stats 曙光英雄_YYYY-MM-DD.json
```

> 以上为旧版 Bun 页面；新版 React 前端走 Rust 服务 `http://127.0.0.1:3002/app/`。旧编辑器写回仍由 3001 的 Bun 负责。

---

## 项目结构

```
曙光英雄梯度/
├── apps/web/                     # 新版 React 前端（Vite / Tailwind / TanStack / Recharts）
├── server-rs/                    # 新版 Rust 后端（Axum / rusqlite / 静态托管）
├── server.js                    # 旧 bun 服务器（静态托管 + SQLite API + SSE）
├── db.js                        # SQLite 数据层（schema / 导入 / 查询 / 快照）
├── index.html                   # 梯度排行主页
├── 备战.html / 备战.js            # 备战管理器（符文 + 出装方案）
├── editor.html                  # JSON 数据编辑器
├── blacklist.html               # 失信名单维护页（UID 文本录入）
├── blacklist.js                 # 失信名单读取 / 写入 / 榜单过滤
├── css/tier-list.css            # 公共样式（GitHub dark 主题）
├── js/algorithm.js              # 梯度算法 v4（头部均值 + 全榜均值，纯函数）
├── js/tierlist.js               # 排行页面引擎（加载 / 渲染 / 搜索 / 排序）
├── js/dataSource.js             # 数据访问层（SQLite API，回退静态 JSON）
├── js/chart.min.js              # Chart.js（分布 / 趋势图）
├── config.json                  # 配置（算法权重、梯度阈值、表格列）
├── data/
│   ├── tierlist.db              # SQLite 事实源（随安装包分发）
│   ├── blacklist.json           # 失信 UID 名单（手动维护）
│   ├── snapshots/2026-11-17/    # period.json / power.json / players.json.gz
│   └── analysis/                # 导出的评分数据（10-19 已归档）
├── reports/                     # 实验期梯度分析报告
├── tools/                       # merge / db-setup / analyze 脚本
├── 曙光英雄_2026-11-17.json      # 当前有效期合并数据（含 power / players）
├── 英雄介绍.json                  # 英雄主数据（name / aliases / 常用分路 / 擅长选手）
├── HeadIcon/                    # 英雄头像（PNG，按英雄名命名）
├── banner/                      # 英雄详情横幅图（PNG/JPG，按英雄名命名）
├── equip.json                   # 装备目录（定位 → tier → 装备名）
├── data.json                    # 备战方案数据（页面自动读写，勿手改）
├── equipicon/                   # 装备图标（PNG，按装备名命名）
├── runeicon/                    # 符文图标（PNG，按符文名命名；n1~n4 为四类底图）
├── 装备数据说明.md                # 装备/方案数据格式说明
└── 英雄介绍详情.html              # 介绍卡视觉模板（参考）
```

---

## 功能

| 页面 | 功能 |
|------|------|
| **梯度排行** (`/`) | 全量梯度排行 · 表格/网格视图 · 分路筛选 · 搜索 · 表头排序 · 英雄详情（介绍卡 + 1–N 战力分布图） |
| **备战管理器** (`/备战.html`) | 英雄备战方案（多套）· 四类符文槽（彩色/攻击/防御/通用）· 出装编辑（6 格起、可增格、备用装备、右键菜单、槽位拖拽）· 通用符文 |
| **数据编辑器** (`/editor.html`) | 表格化编辑数据 JSON · 快速加载项目数据 · 文本导入（CSV 解析）· 多值粘贴填充 · 写回磁盘 |
| **失信名单** (`/blacklist.html`) | 按 UID 手动维护黑名单 · 榜单读取时动态剔除 · 原始 DB/快照不修改 |

### 失信名单

- 入口：`/blacklist.html`，一行一个 UID；也可以直接编辑 `data/blacklist.json`。
- 生效方式：读取 `/api/periods/:date`、详情和 `/api/heroes/:name/history` 时动态过滤，不修改数据库和快照。
- 剔除后剩余玩家**重新连续编号**，`rankCount`、`power` 数组、头部/全榜统计随之重算。
- 原始 JSON、SQLite、`data/snapshots/` 保留全量数据；把 UID 从名单移除后立即恢复。
- 接口：`GET /api/blacklist`、`POST /api/blacklist`（`{ "uids": ["..."] }`）。

**文本导入**：编辑器「📥 文本导入」可粘贴周数据文本（`登场排名,英雄,胜率,击杀/死亡比,辅助数,场均经济`），只取前三列；导入后填入表格，点击「💾 保存」写入。新版战力由分布自动推导，文本导入只负责出场/胜率统计。

**入口串联**：梯度排行点开英雄 → 详情右上「🧩 备战方案」→ 直达该英雄的备战方案页（`/备战.html?hero=英雄名`）。

---

## 算法 v4（大神榜全榜分布）

> 当前配置见 `config.json` → `algorithm`。核心实现：`js/algorithm.js`。
>
> v4 已取消固定「国9」口径：不再取第 9 名，改用「头部均值 + 全榜均值」。

```
头部均值 = mean(power[0 .. k-1])，k = max(3, ceil(10% × n))
全榜均值 = mean(power[0 .. n-1])        # 归一化 AUC，覆盖整条 1–N 曲线

头部分 = percentile(头部均值)             # 103 人内 0..1
全榜分 = percentile(全榜均值)
战力分 = 0.50 × 头部分 + 0.50 × 全榜分

出场分 = 1 − (出场排名 − 1) / (英雄总数 − 1)
胜率分 = minmax(胜率)
raw    = 0.15 × 出场分 + 0.70 × 战力分 + 0.15 × 胜率分
评分   = minmax(raw) × 100
```

| 维度 | 权重 | 理由 |
|------|------|------|
| 头部均值（前 10%，至少 3 名） | **0.50** | 高端上限；按榜长比例取，不绑定第 9 名 |
| 全榜均值（归一化 AUC） | **0.50** | 整条战力曲线的平均，衡量整体深度 |
| 胜率 | **0.15** | 大众表现参考 |
| 出场排名 | **0.15** | 惩罚"没人玩但数据好"的个例 |

> 短榜不补 0：27 个英雄不足 100 名（最短 14），头部按自身榜长取前 10%，且至少 3 名。

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

## 数据流

```
XLSX 大神榜 + 当期统计 JSON
        │ tools/merge_experimental.py
        ▼
曙光英雄_YYYY-MM-DD.json（含 power / players）
        │ bun tools/db-setup.mjs --force YYYY-MM-DD
        ▼
data/tierlist.db  ── 快照导出 ──► data/snapshots/YYYY-MM-DD/
        │ GET /api/periods/YYYY-MM-DD
        ▼
js/algorithm.js（浏览器 / 分析脚本共用）→ 梯度表 / 详情分布图
```

> `tools/merge_experimental.py` 会校验统计 JSON 的日期与输出文件日期；不一致时默认拒绝，避免把上一期的 `winRate / appearanceRank` 复制到新一期。只有战力分布时用 `--no-stats <输出.json>`。

---

## 服务器接口

| 接口 | 说明 |
|------|------|
| `GET /api/games` | 单游戏信息（前端探测服务器是否可用） |
| `GET /api/config` | config.json；`dates` / `defaultDate` 来自 SQLite |
| `GET/POST /api/blacklist` | 读取 / 保存失信 UID 名单；榜单读取时动态过滤 |
| `POST /api/import-period` | JSON 数据 + 出场排名/胜率文本导入 SQLite |
| `GET /api/periods` | 期数索引（日期 / 英雄数 / 行数 / 是否有分布） |
| `GET /api/periods/:date` | 一整期：103 英雄统计 + 每人 `power` 数组 |
| `GET /api/heroes/:name/history` | 单个英雄的跨期统计（当前仅 1 期） |
| `GET /api/list` | 列出根目录 JSON 数据文件 |
| `GET /api/banners` | 横幅图目录文件 |
| `POST /api/save` | 编辑器写回（日期文件同时同步 SQLite） |
| `GET /api/watch` | SSE 文件监听，前端自动刷新 |
| `GET /api/heroes` | 备战页英雄列表（扫 `HeadIcon/`） |
| `GET /api/lanes` / `GET /api/players` | 读 `英雄介绍.json` 的 常用分路 / 擅长选手 |
| `GET/POST /api/data` | 读取 / 保存备战方案（`data.json`） |

---

## 技术栈

- **纯原生 HTML/CSS/JS** — 零框架、零构建、零 npm 依赖
- **SQLite** — bun 内置 `bun:sqlite`，单文件事实源，WAL 模式
- **JSON 快照** — 每期自动导出 `period.json / power.json / players.json.gz`，可 git、可重建
- **深色主题** — GitHub dark 风格
- **客户端计算** — 梯度算法在浏览器运行（分析脚本复用同一份代码）
- **bun 薄服务器** — 静态托管 + SQLite API + SSE

---

## 历史验证（2026-10-19，恢复版）

> 该期已恢复为历史期，旧 UID 已全部清空（9,167 行 UID 为空）；以下为历史报告。
>
> 详细报告：[reports/实验性梯度分析_2026-10-19.md](reports/实验性梯度分析_2026-10-19.md)

| 验证项 | 结果 |
|--------|------|
| 数据规模 | 103 英雄 / 9,167 行 / 76 人满榜 / 27 人短榜 |
| Spearman | 评分 vs 头部均值 ρ=+0.976，vs 全榜均值 ρ=+0.977，vs 出场排名 ρ=-0.879，vs 胜率 ρ=+0.663 |
| T0 | 9 人：貂蝉、张角、赵云、铁扇公主、白浩、黛西、艾璐妮、刘备、艾蒙 |
| 敏感性 | 头部/全榜权重互换、头部比例 15%/20%、战力权重 ±0.05 下，T0 9/9 稳定；Top10 9–10/10 |
| 与旧口径对比 | 评分 vs 旧国9 ρ=+0.967；诸葛亮因全榜均值偏低从 T0 降到 T0.5 |

---

## 备注

- **旧 6 期已删除**：不再保留 `archive/legacy/`，当前只保留 10-19 与 11-17 两期。
- **10-19 已恢复**：该期 JSON / DB / 快照已恢复，9,025 个旧 UID 已全部清空，当前 9,167 行 UID 为空；日期列表包含 `2026-10-19` 与 `2026-11-17`。原始归档仍在 `archive/invalid/2026-10-19/`。
- **一期 JSON 的容量**：合并后约 740 KB（含 9,167 行玩家明细），单期可以承载；多期会线性增长，长期存放走 SQLite + 快照。
- **张角**：新英雄，头像、横幅与介绍均已补；`许禇` 已通过 alias 归一为 `许褚`。
- **短榜**：27 个英雄不足 100 名，算法不补 0；详情图只画实际名次。
- **实验性**：当前只有 1 期，趋势图/波动横幅暂无历史对比；确认算法后再考虑回填或继续采集。
- 横幅图/头像缺失时页面自动降级显示（不破图）。
