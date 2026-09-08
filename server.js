#!/usr/bin/env bun
// ============================================================
// server.js — bun 本地服务器（零依赖，需 bun ≥ 1.x）
//
// 用法:  bun server.js [端口]        (默认 3001)
// 打开:  http://127.0.0.1:3001/         站点 (index.html)
//        http://127.0.0.1:3001/editor.html  数据编辑器
//
// 功能:
//   1. 静态托管项目文件（bun 原生 Bun.file 流式响应）
//   2. GET  /api/games              — 自动发现含 config.json 的游戏目录
//   3. GET  /api/{dir}/config       — 返回配置；日期类游戏自动扫描目录内
//                                     `*_YYYY-MM-DD.json`，无需在 config.json 手写 dates
//   4. GET  /api/{dir}/list         — 列出目录下可用数据文件
//   5. POST /api/{dir}/save         — 把编辑结果原子写回磁盘
//   6. GET  /api/watch              — SSE 文件监听，数据变化实时推送（前端自动刷新）
//
// 安全: 只绑定 127.0.0.1；所有文件操作带路径穿越防护；保存接口校验文件名。
// ============================================================
import { watch, readFileSync, readdirSync, existsSync, renameSync, unlinkSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";

const ROOT = import.meta.dir; // bun: 当前文件所在目录
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3001;
const HOST = "127.0.0.1";
const MAX_BODY = 64 * 1024 * 1024; // 保存请求体上限 64MB

// 日期数据文件名：`游戏名_YYYY-MM-DD.json`（如 曙光英雄_2026-08-17.json）
const DATE_RE = /^(.+?)_(\d{4}-\d{2}-\d{2})\.json$/;
const SAFE_DIR_RE = /^[\w一-龥-]+$/;
const SAFE_FILE_RE = /^[\w一-龥-]+\.json$/;

// ---------- 基础工具 ----------
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

// 防路径穿越：把相对路径安全地解析到 ROOT 之内，否则返回 null
function safeResolve(rel) {
  const clean = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return null;
  const abs = resolve(ROOT, clean);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) return null;
  return abs;
}

// ---------- 数据发现 ----------
function discoverGames() {
  const games = [];
  let entries;
  try { entries = readdirSync(ROOT, { withFileTypes: true }); }
  catch { return games; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const cfgPath = resolve(ROOT, e.name, "config.json");
    if (!existsSync(cfgPath)) continue;
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      games.push({
        dir: e.name,
        gameId: cfg.gameId || e.name,
        gameName: cfg.gameName || e.name,
        gameIcon: cfg.gameIcon || "🎮",
        hasLanes: !!cfg.hasLanes,
        hasDates: !!cfg.hasDates
      });
    } catch { /* 忽略损坏的 config */ }
  }
  return games;
}

function isValidDir(dir) {
  return SAFE_DIR_RE.test(dir) && existsSync(resolve(ROOT, dir, "config.json"));
}

// 扫描目录里所有 `*_YYYY-MM-DD.json`，按日期升序（最新在最后）
function scanDates(dir) {
  const dirPath = resolve(ROOT, dir);
  const dates = [];
  let files;
  try { files = readdirSync(dirPath, { withFileTypes: true }); }
  catch { return dates; }
  for (const f of files) {
    if (!f.isFile()) continue;
    const m = DATE_RE.exec(f.name);
    if (m) dates.push({ date: m[2], file: f.name });
  }
  dates.sort((a, b) => a.date.localeCompare(b.date));
  return dates;
}

// 读取配置；日期类游戏把 dates 换成磁盘扫描结果，defaultDate 始终指向最新
function getConfig(dir) {
  const cfg = JSON.parse(readFileSync(resolve(ROOT, dir, "config.json"), "utf8"));
  if (cfg.hasDates) {
    const dates = scanDates(dir);
    if (dates.length) {
      cfg.dates = dates;
      cfg.defaultDate = dates[dates.length - 1].date; // 自动指向最新
    } else {
      cfg.dates = [];
    }
  }
  return cfg;
}

function listFiles(dir) {
  const dirPath = resolve(ROOT, dir);
  const files = readdirSync(dirPath, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith(".json") && f.name !== "config.json")
    .map(f => f.name)
    .sort();
  return { dir, files };
}

// 列出 {dir}/{bannerDir} 下的图片文件（详情页英雄介绍横幅用；目录缺省 "banner"）
function listBanners(dir) {
  const cfg = JSON.parse(readFileSync(resolve(ROOT, dir, "config.json"), "utf8"));
  const sub = cfg.bannerDir || "banner";
  const dirPath = resolve(ROOT, dir, sub);
  let files = [];
  try {
    files = readdirSync(dirPath, { withFileTypes: true })
      .filter(f => f.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(f.name))
      .map(f => f.name)
      .sort();
  } catch { /* 目录不存在 → 空列表 */ }
  return { dir, bannerDir: sub, files };
}

// ---------- 保存 ----------
async function handleSave(dir, body) {
  let payload;
  try { payload = JSON.parse(body); }
  catch { return json({ ok: false, error: "请求体不是合法 JSON" }, 400); }

  const file = String(payload.file || "");
  if (!SAFE_FILE_RE.test(file)) return json({ ok: false, error: "非法文件名: " + file }, 400);
  const data = payload.data;
  if (data === undefined || data === null || typeof data !== "object") {
    return json({ ok: false, error: "data 必须是对象或数组" }, 400);
  }

  const filePath = safeResolve(dir + "/" + file);
  if (!filePath || !filePath.startsWith(resolve(ROOT, dir) + sep)) {
    return json({ ok: false, error: "路径越界" }, 403);
  }

  const jsonStr = JSON.stringify(data, null, 2);
  const tmp = filePath + ".tmp";
  try {
    await Bun.write(tmp, jsonStr);
    renameSync(tmp, filePath); // 原子替换，避免写一半损坏
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    return json({ ok: false, error: "写入失败: " + e.message }, 500);
  }
  const st = statSync(filePath);
  return json({
    ok: true,
    file,
    size: st.size,
    rows: Array.isArray(data) ? data.length : Object.keys(data).length,
    mtime: st.mtime.toISOString()
  });
}

// ---------- 文件监听 / SSE ----------
const watchControllers = new Set();
let hbTimer = null;

function sseWrite(controller, text) {
  try { controller.enqueue(text); } catch { /* 客户端已断开 */ }
}

function broadcastChange(dir, file) {
  const msg = JSON.stringify({ dir, file, event: "change", ts: Date.now() });
  for (const c of watchControllers) sseWrite(c, `data: ${msg}\n\n`);
}

function handleWatch() {
  let controller;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
      watchControllers.add(c);
      sseWrite(c, ": connected\n\n");
      if (!hbTimer) {
        hbTimer = setInterval(() => {
          for (const c of watchControllers) sseWrite(c, ": ping\n\n");
        }, 25000);
      }
    },
    cancel() {
      watchControllers.delete(controller);
      if (!watchControllers.size && hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}

const watchTimers = new Map();
function setupWatchers() {
  for (const g of discoverGames()) {
    try {
      watch(resolve(ROOT, g.dir), (_event, filename) => {
        const name = filename ? String(filename) : "";
        if (!name || name.endsWith(".tmp")) return;
        clearTimeout(watchTimers.get(g.dir));
        watchTimers.set(g.dir, setTimeout(() => broadcastChange(g.dir, name), 300));
      });
    } catch { /* 忽略无法监听的目录 */ }
  }
}

// ---------- API 路由 ----------
async function handleApi(req, pathname, method) {
  const segs = pathname.split("/").filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });

  if (segs.length === 2 && segs[1] === "games") return json({ games: discoverGames() });
  if (segs.length === 2 && segs[1] === "watch") return handleWatch();

  if (segs.length === 3) {
    const dir = segs[1];
    const action = segs[2];
    if (!isValidDir(dir)) return json({ error: "未知游戏目录: " + dir }, 404);
    try {
      if (method === "GET" && action === "config") return json(getConfig(dir));
      if (method === "GET" && action === "list") return json(listFiles(dir));
      if (method === "GET" && action === "banners") return json(listBanners(dir));
      if (method === "POST" && action === "save") {
        const text = await req.text();
        if (text.length > MAX_BODY) return json({ ok: false, error: "请求体过大" }, 400);
        return handleSave(dir, text);
      }
    } catch (e) {
      return json({ error: e.message }, 500);
    }
    return json({ error: "未知操作: " + action }, 404);
  }
  return json({ error: "接口不存在" }, 404);
}

// ---------- 静态服务 ----------
async function serveStatic(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return new Response("Bad Request", { status: 400 }); }
  if (rel === "/") rel = "index.html";
  const filePath = safeResolve(rel);
  if (!filePath) return new Response("Forbidden", { status: 403 });
  try {
    const f = Bun.file(filePath);
    if (!(await f.exists())) return new Response("Not Found", { status: 404 });
    return new Response(f, {
      headers: {
        "Content-Type": f.type || "application/octet-stream",
        "Cache-Control": "no-cache"
      }
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

// ---------- 启动 ----------
const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    if (pathname === "/api" || pathname === "/api/") {
      return json({ endpoints: ["/api/games", "/api/{dir}/config", "/api/{dir}/list", "/api/{dir}/banners", "/api/{dir}/save", "/api/watch"] });
    }
    if (pathname.startsWith("/api/")) return handleApi(req, pathname, method);
    if (method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    return serveStatic(pathname);
  }
});

setupWatchers();

console.log("\n  MOBA 梯度数据服务器已启动 (bun " + process.version + ")");
console.log(`  → 站点:   http://${HOST}:${PORT}/`);
console.log(`  → 编辑器: http://${HOST}:${PORT}/editor.html`);
console.log(`  → API:    http://${HOST}:${PORT}/api/games`);
console.log("");
const games = discoverGames();
if (!games.length) console.log("  （未发现含 config.json 的游戏目录）");
games.forEach(g => {
  const extra = g.hasDates ? "（日期自动扫描，无需手写 config dates）" : g.hasLanes ? "（分路模式）" : "";
  console.log(`  📁 ${g.gameName}  ${extra}`);
});
console.log("");
