#!/usr/bin/env node
// ============================================================
// server.js — 零依赖 Node 本地服务器
//
// 用法:  node server.js [端口]      (默认 3000)
// 打开:  http://127.0.0.1:3000/        站点
//        http://127.0.0.1:3000/editor.html   数据编辑器
//
// 功能:
//   1. 静态托管项目文件（替代 Live Server）
//   2. GET  /api/games              — 自动发现含 config.json 的游戏目录
//   3. GET  /api/{dir}/config       — 返回配置；日期类游戏自动扫描最新数据文件
//   4. GET  /api/{dir}/list         — 列出目录下可用数据文件
//   5. POST /api/{dir}/save         — 把编辑结果原子写回磁盘
//   6. GET  /api/watch              — SSE 文件监听，数据变化实时推送（前端自动刷新）
//
// 安全: 只绑定 127.0.0.1；所有文件操作带路径穿越防护；保存接口校验文件名。
// ============================================================
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;
const HOST = "127.0.0.1";
const MAX_BODY = 64 * 1024 * 1024; // 保存请求体上限 64MB

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

// 日期数据文件名：`游戏名_YYYY-MM-DD.json`（如 曙光英雄_2026-08-02.json）
const DATE_RE = /^(.+?)_(\d{4}-\d{2}-\d{2})\.json$/;
const SAFE_DIR_RE = /^[\w一-龥-]+$/;
const SAFE_FILE_RE = /^[\w一-龥-]+\.json$/;

// ---------- 基础工具 ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, code, text, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(text);
}

// 防路径穿越：把相对路径安全地解析到 ROOT 之内，否则返回 null
function safeResolve(rel) {
  const clean = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return null;
  const abs = path.resolve(ROOT, clean);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on("data", c => {
    size += c.length;
    if (size > MAX_BODY) {
      cb(null, new Error("请求体过大"));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => cb(Buffer.concat(chunks)));
  req.on("error", e => cb(null, e));
}

// ---------- 数据发现 ----------
function discoverGames() {
  const games = [];
  let entries;
  try { entries = fs.readdirSync(ROOT, { withFileTypes: true }); }
  catch { return games; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const cfgPath = path.join(ROOT, e.name, "config.json");
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
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
  return SAFE_DIR_RE.test(dir) && fs.existsSync(path.join(ROOT, dir, "config.json"));
}

// 扫描目录里所有 `*_YYYY-MM-DD.json`，按日期升序（最新在最后）
function scanDates(dir) {
  const dirPath = path.join(ROOT, dir);
  const dates = [];
  let files;
  try { files = fs.readdirSync(dirPath, { withFileTypes: true }); }
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
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, dir, "config.json"), "utf8"));
  if (cfg.hasDates) {
    const dates = scanDates(dir);
    if (dates.length) {
      cfg.dates = dates;
      cfg.defaultDate = dates[dates.length - 1].date; // 自动指向最新
    }
  }
  return cfg;
}

function listFiles(dir) {
  const dirPath = path.join(ROOT, dir);
  const files = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith(".json") && f.name !== "config.json")
    .map(f => f.name)
    .sort();
  return { dir, files };
}

// ---------- 保存 ----------
function handleSave(dir, body, res) {
  let payload;
  try { payload = JSON.parse(body); }
  catch { return sendJSON(res, 400, { ok: false, error: "请求体不是合法 JSON" }); }

  const file = String(payload.file || "");
  if (!SAFE_FILE_RE.test(file)) {
    return sendJSON(res, 400, { ok: false, error: "非法文件名: " + file });
  }
  const data = payload.data;
  if (data === undefined || data === null || typeof data !== "object") {
    return sendJSON(res, 400, { ok: false, error: "data 必须是对象或数组" });
  }

  const filePath = safeResolve(path.join(dir, file));
  if (!filePath || !filePath.startsWith(path.join(ROOT, dir) + path.sep)) {
    return sendJSON(res, 403, { ok: false, error: "路径越界" });
  }

  const json = JSON.stringify(data, null, 2);
  const tmp = filePath + ".tmp";
  try {
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, filePath); // 原子替换，避免写一半损坏
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    return sendJSON(res, 500, { ok: false, error: "写入失败: " + e.message });
  }
  const st = fs.statSync(filePath);
  sendJSON(res, 200, {
    ok: true,
    file,
    size: st.size,
    rows: Array.isArray(data) ? data.length : Object.keys(data).length,
    mtime: st.mtime.toISOString()
  });
}

// ---------- 文件监听 / SSE ----------
const watchClients = new Set();
const watchTimers = new Map();

function notifyChange(dir, file) {
  const msg = JSON.stringify({ dir, file, event: "change", ts: Date.now() });
  watchClients.forEach(c => { try { c.write(`data: ${msg}\n\n`); } catch {} });
}

function setupWatchers() {
  for (const g of discoverGames()) {
    const dirPath = path.join(ROOT, g.dir);
    try {
      fs.watch(dirPath, (event, filename) => {
        const name = filename ? String(filename) : "";
        if (!name || name.endsWith(".tmp")) return;
        clearTimeout(watchTimers.get(g.dir));
        watchTimers.set(g.dir, setTimeout(() => notifyChange(g.dir, name), 300));
      });
    } catch { /* 忽略无法监听的目录 */ }
  }
}

function handleWatch(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.write(": connected\n\n");
  watchClients.add(res);
  const cleanup = () => watchClients.delete(res);
  req.on("close", cleanup);
  res.on("close", cleanup);
  // 心跳，防止空闲连接被断开
  const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25000);
  res.on("close", () => clearInterval(hb));
}

// ---------- API 路由 ----------
function handleApi(req, res, pathname, method) {
  const segs = pathname.split("/").filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  // segs[0] === "api"

  if (segs.length === 2 && segs[1] === "games") {
    return sendJSON(res, 200, { games: discoverGames() });
  }
  if (segs.length === 2 && segs[1] === "watch") {
    return handleWatch(req, res);
  }
  if (segs.length === 3) {
    const dir = segs[1];
    const action = segs[2];
    if (!isValidDir(dir)) return sendJSON(res, 404, { error: "未知游戏目录: " + dir });
    try {
      if (method === "GET" && action === "config") return sendJSON(res, 200, getConfig(dir));
      if (method === "GET" && action === "list") return sendJSON(res, 200, listFiles(dir));
      if (method === "POST" && action === "save") {
        return readBody(req, (body, err) => {
          if (err) return sendJSON(res, 400, { ok: false, error: err.message });
          handleSave(dir, body, res);
        });
      }
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
    return sendJSON(res, 404, { error: "未知操作: " + action });
  }
  return sendJSON(res, 404, { error: "接口不存在" });
}

// ---------- 静态服务 ----------
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return sendText(res, 400, "Bad Request"); }
  if (rel === "/") rel = "index.html";
  const filePath = safeResolve(rel);
  if (!filePath) return sendText(res, 403, "Forbidden");
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return sendText(res, 404, "Not Found");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- 启动 ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const pathname = url.pathname;

  if (pathname === "/api" || pathname === "/api/") {
    return sendJSON(res, 200, {
      endpoints: ["/api/games", "/api/{dir}/config", "/api/{dir}/list", "/api/{dir}/save", "/api/watch"]
    });
  }
  if (pathname.startsWith("/api/")) return handleApi(req, res, pathname, req.method);
  if (req.method !== "GET") return sendText(res, 405, "Method Not Allowed");
  serveStatic(req, res, pathname);
});

setupWatchers();

server.listen(PORT, HOST, () => {
  console.log("\n  MOBA 梯度数据服务器已启动");
  console.log(`  → 站点:   http://${HOST}:${PORT}/`);
  console.log(`  → 编辑器: http://${HOST}:${PORT}/editor.html`);
  console.log(`  → API:    http://${HOST}:${PORT}/api/games`);
  console.log("");
  const games = discoverGames();
  if (!games.length) console.log("  （未发现含 config.json 的游戏目录）");
  games.forEach(g => {
    const extra = g.hasDates ? "（日期自动扫描）" : g.hasLanes ? "（分路模式）" : "";
    console.log(`  📁 ${g.gameName}  ${extra}`);
  });
  console.log("");
});
