# Rust 后端（Axum + SQLite）

这是新 React 前端（`/app/`）的 Rust API/静态服务，读取现有的 `data/tierlist.db` 和 `data/blacklist.json`，不修改数据库 schema。

## 构建

需要 Rust stable + VS 2022 C++ 工具链（`rusqlite` 使用 bundled SQLite）。

```powershell
./server-rs/build.ps1
```

## 运行

在项目根目录：

```powershell
./server-rs/target/release/sg-tierlist-server.exe
# 或
PORT=3003 ./server-rs/target/release/sg-tierlist-server.exe
```

默认端口 **3002**。

## 已迁移

- `/app/` React 前端静态托管
- `GET /api/config`
- `GET /api/periods`
- `GET /api/periods/:date`（含失信名单动态过滤、重新编号）
- `GET /api/heroes/:name/history`
- `GET /api/profiles`
- `GET/PUT /api/heroes/:name/profile`（常用分路 / 擅长选手，写回 `英雄介绍.json`）
- `POST /api/players/lookup`（擅长选手 UID → 最新榜单用户名）
- `GET/POST /api/blacklist`（UID + 失信原因；含 UID 审计、最新榜单用户名）
- `/` 重定向到 `/app/`

## 暂未迁移

- 旧编辑器写回 `/api/save`、SSE `/api/watch`
- 备战管理器的 `/api/heroes`、`/api/lanes`、`/api/players`、`/api/data`

旧页面仍由 Bun 服务（默认 `3001`）提供；新前端右上角的编辑器/备战链接默认指向 `VITE_LEGACY_BASE`（默认 `http://127.0.0.1:3001`）。
