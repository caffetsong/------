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

// ---------- 备战管理器（页面: /备战.html，文件均在本项目根目录） ----------
// 页面/脚本/数据: 备战.html、备战.js、data.json、equip.json、equipicon/
// 接口: /api/{heroes,lanes,players,data}
// 头像: /HeadIcon/* → 映射到 曙光英雄/HeadIcon（不重复存一份）
const BEI_DATA = resolve(ROOT, "data.json");
const SG_HEADICON = resolve(ROOT, "曙光英雄", "HeadIcon");
const SG_INTRO = resolve(ROOT, "曙光英雄", "英雄介绍.json");

// 英雄列表：扫曙光英雄头像目录，文件名即英雄名
function listHeroNames() {
  try {
    return readdirSync(SG_HEADICON, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.toLowerCase().endsWith(".png"))
      .map(f => f.name.slice(0, -4))
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  } catch { return []; }
}

// 读取 英雄介绍.json 的某个数组字段 → { 英雄名: string[] }（实时读取，可被其他工具编辑）
function readIntroField(field) {
  try {
    const arr = JSON.parse(readFileSync(SG_INTRO, "utf8"));
    const map = {};
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === "object" && typeof item.name === "string") {
          map[item.name] = Array.isArray(item[field]) ? item[field] : [];
        }
      }
    }
    return map;
  } catch { return {}; }
}

function readBeiData() {
  try {
    const parsed = JSON.parse(readFileSync(BEI_DATA, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

async function writeBeiData(doc) {
  const tmp = BEI_DATA + ".tmp";
  await Bun.write(tmp, JSON.stringify(doc, null, 2));
  renameSync(tmp, BEI_DATA); // 原子替换
}

// 从指定目录提供静态文件（支持目录 → index.html）
async function serveFromDir(dirBase, rel) {
  const clean = String(rel).replace(/\\/g, "/").replace(/^\/+/, "");
  let target = resolve(dirBase, clean || "index.html");
  if (target !== dirBase && !target.startsWith(dirBase + sep)) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    if (statSync(target).isDirectory()) target = resolve(target, "index.html");
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  const f = Bun.file(target);
  if (!(await f.exists())) return new Response("Not Found", { status: 404 });
  return new Response(f, {
    headers: { "Content-Type": f.type || "application/octet-stream", "Cache-Control": "no-cache" }
  });
}

// 备战管理器数据接口：/api/{heroes,lanes,players,data}
async function handleBeiApi(req, action, method) {
  if (action === "heroes" && method === "GET") return json({ heroes: listHeroNames() });
  if (action === "lanes" && method === "GET") return json({ lanes: readIntroField("常用分路") });
  if (action === "players" && method === "GET") return json({ players: readIntroField("擅长选手") });
  if (action === "data") {
    if (method === "GET") return json(readBeiData());
    if (method === "POST" || method === "PUT") {
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: "请求体过大" }, 400);
      let doc;
      try { doc = JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return json({ error: "body must be an object" }, 400);
      }
      try { await writeBeiData(doc); } catch (e) { return json({ error: "写入失败: " + e.message }, 500); }
      return json({ ok: true });
    }
    return json({ error: "method not allowed" }, 405);
  }
  return json({ error: "接口不存在: " + action }, 404);
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
  // 备战管理器数据接口
  if (segs.length === 2 && ["heroes", "lanes", "players", "data"].includes(segs[1])) {
    return handleBeiApi(req, segs[1], method);
  }

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
      return json({ endpoints: ["/api/games", "/api/{dir}/config", "/api/{dir}/list", "/api/{dir}/banners", "/api/{dir}/save", "/api/watch", "/api/{heroes,lanes,players,data}"] });
    }
    if (pathname.startsWith("/api/")) return handleApi(req, pathname, method);

    // 中文路径需先解码再匹配（url.pathname 是百分号编码的）
    let decodedPath = pathname;
    try { decodedPath = decodeURIComponent(pathname); } catch { /* 保留原值 */ }

    // 旧地址兼容：/备战管理器[/] → /备战.html（保留 ?hero= 参数）
    if (decodedPath === "/备战管理器" || decodedPath === "/备战管理器/") {
      return new Response(null, {
        status: 301,
        headers: { Location: encodeURI("/备战.html") + (url.search || "") }
      });
    }

    // 备战管理器头像：复用 曙光英雄/HeadIcon（不重复存一份）
    if (decodedPath.startsWith("/HeadIcon/")) {
      return serveFromDir(SG_HEADICON, decodedPath.slice("/HeadIcon/".length));
    }

    if (method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    return serveStatic(pathname);
  }
});

setupWatchers();

console.log("\n  曙光英雄梯度服务器已启动 (bun " + process.version + ")");
console.log(`  → 梯度排行: http://${HOST}:${PORT}/`);
console.log(`  → 备战管理: http://${HOST}:${PORT}/备战.html`);
console.log(`  → 数据编辑: http://${HOST}:${PORT}/editor.html`);
console.log(`  → API:      http://${HOST}:${PORT}/api/games`);
console.log("");
const games = discoverGames();
if (!games.length) console.log("  （未发现含 config.json 的游戏目录）");
games.forEach(g => {
  const extra = g.hasDates ? "（日期自动扫描，无需手写 config dates）" : g.hasLanes ? "（分路模式）" : "";
  console.log(`  📁 ${g.gameName}  ${extra}`);
});
console.log("");
