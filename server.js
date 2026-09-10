#!/usr/bin/env bun
// ============================================================
// server.js — bun 本地服务器（零依赖，需 bun ≥ 1.x）
// 单游戏架构：本项目的全部数据都在根目录（不再有多游戏目录发现）
//
// 用法:  bun server.js [端口]        (默认 3001，可用 PORT 环境变量覆盖)
// 打开:  http://127.0.0.1:3001/            梯度排行 (index.html)
//        http://127.0.0.1:3001/备战.html     备战管理器
//        http://127.0.0.1:3001/editor.html   数据编辑器
//
// 功能:
//   1. 静态托管项目文件（bun 原生 Bun.file 流式响应）
//   2. GET  /api/config        — 返回 config.json；日期自动扫描根目录
//                                `*_YYYY-MM-DD.json`，defaultDate 指向最新
//   3. GET  /api/list          — 列出根目录 JSON 数据文件
//   4. GET  /api/banners       — 列出横幅图目录（config.bannerDir，缺省 banner）
//   5. POST /api/save          — 编辑器写回数据（临时文件 + rename 原子替换）
//   6. GET  /api/watch         — SSE 文件监听，数据变化前端自动刷新
//   7. GET  /api/{heroes,lanes,players}  — 备战管理器：英雄列表 / 常用分路 / 擅长选手
//   8. GET|POST /api/data      — 备战方案数据（data.json）
//
// 安全: 只绑定 127.0.0.1；静态与写入均带路径穿越防护；写入校验文件名。
// ============================================================
import { watch, readFileSync, readdirSync, existsSync, renameSync, unlinkSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";

const ROOT = import.meta.dir; // bun: 当前文件所在目录
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3001;
const HOST = "127.0.0.1";
const MAX_BODY = 64 * 1024 * 1024; // 请求体上限 64MB

// 日期数据文件名：`游戏名_YYYY-MM-DD.json`（如 曙光英雄_2026-08-31.json）
const DATE_RE = /^(.+?)_(\d{4}-\d{2}-\d{2})\.json$/;
const SAFE_FILE_RE = /^[\w一-龥-]+\.json$/;

const CONFIG_FILE = resolve(ROOT, "config.json");
const INTRO_FILE = resolve(ROOT, "英雄介绍.json");
const BEI_DATA = resolve(ROOT, "data.json");
const HEADICON_DIR = resolve(ROOT, "HeadIcon");

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

function readJSON(abs, fallback) {
  try { return JSON.parse(readFileSync(abs, "utf8")); }
  catch { return fallback; }
}

// ---------- 配置 / 日期扫描 ----------
function readConfig() {
  return readJSON(CONFIG_FILE, null);
}

// 扫描根目录里所有 `*_YYYY-MM-DD.json`，按日期升序（最新在最后）
function scanDates() {
  const dates = [];
  let files;
  try { files = readdirSync(ROOT, { withFileTypes: true }); }
  catch { return dates; }
  for (const f of files) {
    if (!f.isFile()) continue;
    const m = DATE_RE.exec(f.name);
    if (m) dates.push({ date: m[2], file: f.name });
  }
  dates.sort((a, b) => a.date.localeCompare(b.date));
  return dates;
}

// 配置 + 自动扫描出的日期列表（defaultDate 始终指向最新一期）
function getConfig() {
  const cfg = readConfig();
  if (!cfg) return { error: "config.json 缺失或损坏" };
  if (cfg.hasDates) {
    const dates = scanDates();
    cfg.dates = dates;
    if (dates.length) cfg.defaultDate = dates[dates.length - 1].date;
  }
  return cfg;
}

function listDataFiles() {
  let files = [];
  try {
    files = readdirSync(ROOT, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith(".json") && f.name !== "config.json")
      .map(f => f.name)
      .sort();
  } catch { /* 忽略 */ }
  return { files };
}

// 列出横幅图（config.bannerDir，缺省 "banner"）
function listBanners() {
  const cfg = readConfig() || {};
  const sub = cfg.bannerDir || "banner";
  let files = [];
  try {
    files = readdirSync(resolve(ROOT, sub), { withFileTypes: true })
      .filter(f => f.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(f.name))
      .map(f => f.name)
      .sort();
  } catch { /* 目录不存在 → 空列表 */ }
  return { bannerDir: sub, files };
}

// ---------- 保存（原子写回根目录 JSON） ----------
async function handleSave(body) {
  let payload;
  try { payload = JSON.parse(body); }
  catch { return json({ ok: false, error: "请求体不是合法 JSON" }, 400); }

  const file = String(payload.file || "");
  if (!SAFE_FILE_RE.test(file)) return json({ ok: false, error: "非法文件名: " + file }, 400);
  const data = payload.data;
  if (data === undefined || data === null || typeof data !== "object") {
    return json({ ok: false, error: "data 必须是对象或数组" }, 400);
  }

  const filePath = safeResolve(file);
  if (!filePath) return json({ ok: false, error: "路径越界" }, 403);

  const tmp = filePath + ".tmp";
  try {
    await Bun.write(tmp, JSON.stringify(data, null, 2));
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

// ---------- 备战管理器数据接口 ----------

// 英雄列表：扫 HeadIcon 目录，文件名即英雄名
function listHeroNames() {
  try {
    return readdirSync(HEADICON_DIR, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.toLowerCase().endsWith(".png"))
      .map(f => f.name.slice(0, -4))
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  } catch { return []; }
}

// 读取 英雄介绍.json 的某个数组字段 → { 英雄名: string[] }（实时读取）
function readIntroField(field) {
  const arr = readJSON(INTRO_FILE, []);
  const map = {};
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (item && typeof item === "object" && typeof item.name === "string") {
        map[item.name] = Array.isArray(item[field]) ? item[field] : [];
      }
    }
  }
  return map;
}

function readBeiData() {
  const parsed = readJSON(BEI_DATA, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

async function writeBeiData(doc) {
  const tmp = BEI_DATA + ".tmp";
  await Bun.write(tmp, JSON.stringify(doc, null, 2));
  renameSync(tmp, BEI_DATA); // 原子替换
}

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

// ---------- 文件监听 / SSE ----------
const watchControllers = new Set();
let hbTimer = null;

function sseWrite(controller, text) {
  try { controller.enqueue(text); } catch { /* 客户端已断开 */ }
}

function broadcastChange(file) {
  const msg = JSON.stringify({ file, event: "change", ts: Date.now() });
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

let watchTimer = null;
function setupWatcher() {
  try {
    watch(ROOT, (_event, filename) => {
      const name = filename ? String(filename) : "";
      if (!name || name.endsWith(".tmp")) return;
      // 只推送梯度页关心的文件：日期数据 / 配置 / 英雄介绍
      const relevant = DATE_RE.test(name) || name === "config.json" || name === "英雄介绍.json";
      if (!relevant) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => broadcastChange(name), 300);
    }, { recursive: false });
  } catch { /* 忽略无法监听的情况 */ }
}

// ---------- API 路由 ----------
async function handleApi(req, pathname, method) {
  const segs = pathname.split("/").filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  const action = segs[1] || "";

  if (segs.length === 2) {
    try {
      // 服务器可用性探测 + 单游戏信息
      if (action === "games") {
        const cfg = readConfig() || {};
        return json({
          games: [{
            dir: "",
            gameId: cfg.gameId || "sg",
            gameName: cfg.gameName || "曙光英雄",
            gameIcon: cfg.gameIcon || "☀️",
            hasDates: !!cfg.hasDates
          }]
        });
      }
      if (action === "watch") return handleWatch();
      if (action === "config") return json(getConfig());
      if (action === "list") return json(listDataFiles());
      if (action === "banners") return json(listBanners());
      if (action === "heroes" || action === "lanes" || action === "players" || action === "data") {
        return handleBeiApi(req, action, method);
      }
      if (action === "save" && method === "POST") {
        const text = await req.text();
        if (text.length > MAX_BODY) return json({ ok: false, error: "请求体过大" }, 400);
        return handleSave(text);
      }
    } catch (e) {
      return json({ error: e.message }, 500);
    }
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
Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    if (pathname === "/api" || pathname === "/api/") {
      return json({
        endpoints: ["/api/config", "/api/list", "/api/banners", "/api/save", "/api/watch",
                    "/api/heroes", "/api/lanes", "/api/players", "/api/data"]
      });
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

    if (method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    return serveStatic(pathname);
  }
});

setupWatcher();

const cfg = readConfig() || {};
const dates = scanDates();
console.log("\n  曙光英雄梯度服务器已启动 (bun " + process.version + ")");
console.log(`  → 梯度排行: http://${HOST}:${PORT}/`);
console.log(`  → 备战管理: http://${HOST}:${PORT}/备战.html`);
console.log(`  → 数据编辑: http://${HOST}:${PORT}/editor.html`);
console.log("");
if (!existsSync(CONFIG_FILE)) {
  console.log("  ⚠️ config.json 缺失");
} else {
  console.log(`  📁 ${cfg.gameName || "曙光英雄"}  数据 ${dates.length} 期` +
    (dates.length ? `（最新 ${dates[dates.length - 1].date}）` : ""));
}
console.log("");
