# 曙光英雄梯度 · Tauri 桌面版

## 结构

```text
src-tauri/
├── tauri.conf.json       # 窗口、资源、打包配置
├── build.rs
├── src/main.rs           # 启动 Rust sidecar + AppData 首次建库 + 创建窗口
├── resources/server/     # sidecar：sg-tierlist-server.exe
└── icons/
```

## 构建

先构建前端和 Rust 服务：

```powershell
cd apps/web
pnpm build

cd ..\..
.\server-rs\build.ps1
Copy-Item server-rs\target\release\sg-tierlist-server.exe src-tauri\resources\server\sg-tierlist-server.exe -Force
```

再构建桌面程序：

```powershell
# 需要 Visual Studio 2022 C++ Build Tools
cargo build --release --manifest-path src-tauri/Cargo.toml
```

输出：

```text
src-tauri/target/release/sg-tierlist-desktop.exe
```

## 首次启动行为

1. 从安装资源复制 `data/tierlist.db` 到：
   ```text
   %LOCALAPPDATA%\com.shuguang.tierlist\data\tierlist.db
   ```
2. 同步复制：
   - `blacklist.json`
   - `player-flags.json`
   - `英雄介绍.json`
3. 启动 Rust sidecar，使用 AppData 数据目录
4. 创建窗口并加载：
   ```text
   http://127.0.0.1:<随机端口>/app/
   ```

不会写安装目录。

## 打包

Tauri CLI 可生成 NSIS / MSI：

```powershell
cd src-tauri
pnpm dlx @tauri-apps/cli@2 build --bundles nsis
```

当前机器下载 WiX/NSIS 工具超时，安装包暂未生成；桌面 exe 已可用，不再生成便携包。

## 当前范围

已包含：

- 梯度排行 / 网格
- 英雄详情（不显示头图）
- 战力排行
- 备战方案
- 失信名单
- 导入数据
- SQLite / AppData 数据

暂未包含：

- 旧编辑器
- 备战方案外部页面
- 自动更新 / 代码签名
