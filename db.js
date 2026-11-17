// ============================================================
// db.js — SQLite 数据层（bun:sqlite，零 npm 依赖）
//
// 事实源：data/tierlist.db
// 快照：  data/snapshots/<date>/{period.json,power.json,players.json.gz}
//
// 旧数据（根目录 曙光英雄_YYYY-MM-DD.json）在首次启动时自动导入；
// 之后同名日期由数据库提供，旧的静态文件仅作历史备份。
// ============================================================
import { Database } from "bun:sqlite";
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
  renameSync, rmSync
} from "node:fs";
import { resolve, basename } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { getBlacklist, getBlacklistSet, filterRankRows } from "./blacklist.js";

export const ROOT = import.meta.dir;
export const DATA_DIR = resolve(ROOT, "data");
export const SNAPSHOT_DIR = resolve(DATA_DIR, "snapshots");
export const DB_PATH = resolve(DATA_DIR, "tierlist.db");

const INTRO_FILE = resolve(ROOT, "英雄介绍.json");
const HEADICON_DIR = resolve(ROOT, "HeadIcon");
const DATE_FILE_RE = /^(.+?)_(\d{4}-\d{2}-\d{2})\.json$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BUILTIN_ALIASES = { "许禇": "许褚" };

let db = null;
let aliasCache = null;

// ---------- 基础工具 ----------
function nowISO() {
  return new Date().toISOString();
}

function parseJSON(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function parseSource(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}

function writeAtomic(file, data) {
  const tmp = file + ".tmp";
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, file);
  } catch {
    try { rmSync(file, { force: true }); } catch { /* ignore */ }
    renameSync(tmp, file);
  }
}

function readIntro() {
  const parsed = parseJSON(readFileSync(INTRO_FILE, "utf8"), []);
  return Array.isArray(parsed) ? parsed : [];
}

export function canonicalName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const map = getAliasMap();
  return map.get(raw) || raw;
}

function getAliasMap() {
  if (aliasCache) return aliasCache;
  const map = new Map(Object.entries(BUILTIN_ALIASES));
  for (const item of readIntro()) {
    if (!item || typeof item.name !== "string") continue;
    map.set(item.name, item.name);
    for (const alias of (Array.isArray(item.aliases) ? item.aliases : [])) {
      if (typeof alias === "string" && alias.trim()) map.set(alias.trim(), item.name);
    }
  }
  aliasCache = map;
  return map;
}

function invalidateAliases() {
  aliasCache = null;
}

// ---------- 数据库 ----------
export function getDb() {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  initSchema();
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS heroes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      profession TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hero_aliases (
      alias TEXT PRIMARY KEY,
      hero_id INTEGER NOT NULL REFERENCES heroes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      captured_at TEXT,
      source TEXT,
      source_hash TEXT,
      hero_count INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0,
      has_power INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hero_stats (
      period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      hero_id INTEGER NOT NULL REFERENCES heroes(id),
      profession TEXT NOT NULL DEFAULT '',
      appearance_rank INTEGER,
      win_rate REAL,
      rank_count INTEGER NOT NULL DEFAULT 0,
      power_top1 INTEGER,
      power_top9 INTEGER,
      power_top50 INTEGER,
      power_top100 INTEGER,
      power_median INTEGER,
      legacy_guo9 REAL,
      PRIMARY KEY (period_id, hero_id)
    );

    CREATE TABLE IF NOT EXISTS rank_power (
      period_id INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
      hero_id INTEGER NOT NULL REFERENCES heroes(id),
      "rank" INTEGER NOT NULL,
      power INTEGER NOT NULL,
      player TEXT,
      uid TEXT,
      PRIMARY KEY (period_id, hero_id, "rank")
    ) WITHOUT ROWID;

    CREATE INDEX IF NOT EXISTS idx_rp_hero ON rank_power(hero_id, period_id, "rank");
    CREATE INDEX IF NOT EXISTS idx_hs_hero ON hero_stats(hero_id, period_id);
    PRAGMA user_version = 2;
  `);
}

function resolveHeroId(name) {
  const canon = canonicalName(name);
  const row = db.query("SELECT id FROM heroes WHERE name = ?").get(canon);
  if (row) return row.id;
  const alias = db.query("SELECT hero_id FROM hero_aliases WHERE alias = ?").get(canon);
  return alias ? alias.hero_id : null;
}

export function ensureHero(name, profession = "", aliases = []) {
  getDb();
  const raw = String(name || "").trim();
  if (!raw) throw new Error("英雄名为空");
  const canon = canonicalName(raw);
  let row = db.query("SELECT id, name, profession FROM heroes WHERE name = ?").get(canon);
  if (!row) {
    const viaAlias = db.query(
      "SELECT h.id, h.name, h.profession FROM heroes h JOIN hero_aliases a ON a.hero_id = h.id WHERE a.alias = ?"
    ).get(canon);
    row = viaAlias || null;
  }
  const now = nowISO();
  if (!row) {
    const info = db.run(
      "INSERT INTO heroes(name, profession, active, created_at) VALUES(?,?,?,?)",
      [canon, profession || "", 1, now]
    );
    row = { id: Number(info.lastInsertRowid), name: canon, profession: profession || "" };
  } else if (profession && profession !== row.profession) {
    db.run("UPDATE heroes SET profession = ? WHERE id = ?", [profession, row.id]);
  }

  const addAlias = (alias) => {
    const a = String(alias || "").trim();
    if (!a || a === row.name) return;
    if (!aliasCache) getAliasMap();
    aliasCache.set(a, row.name);
    db.run("INSERT OR IGNORE INTO hero_aliases(alias, hero_id) VALUES(?,?)", [a, row.id]);
  };
  addAlias(raw);
  for (const a of (Array.isArray(aliases) ? aliases : [])) addAlias(a);
  return row.id;
}

export function seedHeroes() {
  getDb();
  const intro = readIntro();
  for (const item of intro) {
    if (!item || typeof item.name !== "string") continue;
    ensureHero(item.name, item["职业"] || "", item.aliases || []);
  }
  try {
    for (const file of readdirSync(HEADICON_DIR)) {
      if (/\.png$/i.test(file)) ensureHero(file.replace(/\.png$/i, ""), "", []);
    }
  } catch { /* 目录不存在则忽略 */ }
  invalidateAliases();
}

// ---------- 归一化 / 派生 ----------
function toRate(value) {
  if (value === null || value === undefined || value === "") return null;
  let n = typeof value === "number" ? value : parseFloat(String(value).replace(/[%％]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n > 1) n /= 100;
  return Math.round(n * 1e6) / 1e6;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizePower(list) {
  if (!Array.isArray(list)) return [];
  return list.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error("战力必须为正数: " + v);
    return Math.trunc(n);
  });
}

function derived(power) {
  const n = power.length;
  const at = (i) => (i < n ? power[i] : null);
  let median = null;
  if (n) {
    median = n % 2 === 1
      ? power[(n - 1) / 2]
      : Math.round((power[n / 2 - 1] + power[n / 2]) / 2);
  }
  return {
    rankCount: n,
    top1: at(0),
    top9: at(8),
    top50: at(49),
    top100: at(99),
    median
  };
}

function validateMonotonic(power) {
  for (let i = 1; i < power.length; i++) {
    if (power[i] > power[i - 1]) {
      throw new Error(`战力不是按名次递减（第 ${i} 与第 ${i + 1} 名）`);
    }
  }
}

// ---------- 导入 ----------
export function importPeriod(payload, opts = {}) {
  getDb();
  if (!payload || typeof payload !== "object") throw new Error("导入数据必须是对象");
  const date = String(payload.periodStart || payload.date || "").trim();
  if (!DATE_RE.test(date)) throw new Error("日期格式必须是 YYYY-MM-DD: " + date);
  const heroes = Array.isArray(payload.heroes) ? payload.heroes : [];
  if (!heroes.length) throw new Error("导入数据没有 heroes 数组");

  const capturedAt = payload.capturedAt || nowISO();
  const source = typeof payload.source === "string"
    ? payload.source
    : JSON.stringify(payload.source || { type: "import" });
  const sourceHash = payload.sourceHash || "";
  const now = nowISO();

  let periodId = 0;
  let rowCount = 0;
  let hasPower = 0;

  const tx = db.transaction(() => {
    const existing = db.query("SELECT id FROM periods WHERE date = ?").get(date);
    if (existing) {
      periodId = existing.id;
      db.run(
        "UPDATE periods SET captured_at=?, source=?, source_hash=?, updated_at=? WHERE id=?",
        [capturedAt, source, sourceHash, now, periodId]
      );
      db.run("DELETE FROM rank_power WHERE period_id = ?", [periodId]);
      db.run("DELETE FROM hero_stats WHERE period_id = ?", [periodId]);
    } else {
      const info = db.run(
        "INSERT INTO periods(date, captured_at, source, source_hash, created_at, updated_at) VALUES(?,?,?,?,?,?)",
        [date, capturedAt, source, sourceHash, now, now]
      );
      periodId = Number(info.lastInsertRowid);
    }

    for (const item of heroes) {
      const name = String(item.name || item.heroName || "").trim();
      if (!name) throw new Error("存在没有英雄名的记录");
      const power = normalizePower(item.power || []);
      if (power.length) validateMonotonic(power);
      const players = Array.isArray(item.players) ? item.players : [];
      const playerByRank = new Map();
      for (const p of players) {
        const rank = toIntOrNull(p.rank);
        if (rank !== null) playerByRank.set(rank, p);
      }
      const heroId = ensureHero(name, item.profession || item["职业"] || "", item.aliases || []);
      const rate = toRate(item.winRate);
      const rank = toIntOrNull(item.appearanceRank);
      const d = derived(power);
      const legacy = item.legacyGuo9 ?? item["国9战力"] ?? null;
      const legacyGuo9 = legacy === "" ? null : toIntOrNull(legacy);

      db.run(
        `INSERT INTO hero_stats
         (period_id,hero_id,profession,appearance_rank,win_rate,rank_count,
          power_top1,power_top9,power_top50,power_top100,power_median,legacy_guo9)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          periodId, heroId, item.profession || item["职业"] || "", rank, rate, d.rankCount,
          d.top1, d.top9, d.top50, d.top100, d.median, legacyGuo9
        ]
      );

      for (let i = 0; i < power.length; i++) {
        const p = playerByRank.get(i + 1);
        db.run(
          'INSERT INTO rank_power(period_id,hero_id,"rank",power,player,uid) VALUES(?,?,?,?,?,?)',
          [periodId, heroId, i + 1, power[i], p ? (p.player ?? null) : null, p && p.uid != null ? String(p.uid) : null]
        );
      }
      rowCount += power.length;
      if (power.length) hasPower = 1;
    }

    db.run(
      "UPDATE periods SET hero_count=?, row_count=?, has_power=?, updated_at=? WHERE id=?",
      [heroes.length, rowCount, hasPower, now, periodId]
    );
  });
  tx();

  let snapshotError = null;
  if (opts.export !== false) {
    try { exportSnapshots(date); } catch (e) { snapshotError = e.message; }
  }
  return { date, periodId, heroCount: heroes.length, rowCount, hasPower: !!hasPower, snapshotError };
}

export function importLegacyFile(filePath) {
  const fileName = basename(filePath);
  const m = DATE_FILE_RE.exec(fileName);
  if (!m) throw new Error("不是日期数据文件: " + fileName);
  const date = m[2];
  const arr = parseJSON(readFileSync(filePath, "utf8"), null);
  if (!Array.isArray(arr)) throw new Error("旧数据不是数组: " + fileName);
  const heroes = arr.map((h) => ({
    name: h.heroName || h.name,
    profession: h["职业"] || h.profession || "",
    appearanceRank: h.appearanceRank,
    winRate: h.winRate,
    legacyGuo9: h["国9战力"] ?? h.combatPower ?? null,
    power: []
  }));
  const result = importPeriod(
    { date, capturedAt: null, source: { type: "legacy", file: fileName }, heroes },
    { export: false }
  );
  exportSnapshots(date);
  return result;
}

// 实验期数据：数组，含 power / players；作为数据库第一条数据
export function importExperimentalFile(filePath) {
  const fileName = basename(filePath);
  const m = DATE_FILE_RE.exec(fileName);
  if (!m) throw new Error("不是日期数据文件: " + fileName);
  const date = m[2];
  const arr = parseJSON(readFileSync(filePath, "utf8"), null);
  if (!Array.isArray(arr)) throw new Error("实验数据不是数组: " + fileName);
  const heroes = arr.map((h) => ({
    name: h.heroName || h.name,
    profession: h["职业"] || h.profession || "",
    appearanceRank: h.appearanceRank,
    winRate: h.winRate,
    legacyGuo9: h["国9战力"] ?? null,
    power: Array.isArray(h.power) ? h.power : [],
    players: Array.isArray(h.players) ? h.players : []
  }));
  return importPeriod({
    date,
    capturedAt: "2026-10-25T11:49:00+08:00",
    source: {
      type: "experimental",
      file: fileName,
      xlsx: "曙光英雄_大神榜_全英雄_20261025.xlsx"
    },
    heroes
  });
}

// ---------- 编辑器保存（只更新统计，保留分布） ----------
export function saveLegacyRows(date, rows) {
  getDb();
  if (!DATE_RE.test(date)) throw new Error("日期格式必须是 YYYY-MM-DD: " + date);
  if (!Array.isArray(rows) || !rows.length) throw new Error("没有可保存的行");
  const now = nowISO();
  let periodId = 0;
  let hasPower = 0;

  const tx = db.transaction(() => {
    const existing = db.query("SELECT id, has_power FROM periods WHERE date = ?").get(date);
    if (existing) {
      periodId = existing.id;
      hasPower = existing.has_power;
    } else {
      const info = db.run(
        "INSERT INTO periods(date, captured_at, source, source_hash, created_at, updated_at) VALUES(?,?,?,?,?,?)",
        [date, now, JSON.stringify({ type: "editor" }), "", now, now]
      );
      periodId = Number(info.lastInsertRowid);
    }

    const keep = new Set();
    for (const row of rows) {
      const name = String(row.heroName || row.name || "").trim();
      if (!name) continue;
      const heroId = ensureHero(name, row["职业"] || row.profession || "", row.aliases || []);
      keep.add(heroId);
      const rate = toRate(row.winRate);
      const rank = toIntOrNull(row.appearanceRank);
      const guo9raw = row["国9战力"] ?? row.legacyGuo9 ?? null;
      const guo9 = guo9raw === "" ? null : toIntOrNull(guo9raw);
      const current = db.query(
        "SELECT rank_count, legacy_guo9 FROM hero_stats WHERE period_id=? AND hero_id=?"
      ).get(periodId, heroId);

      if (current) {
        db.run(
          "UPDATE hero_stats SET profession=?, appearance_rank=?, win_rate=?, legacy_guo9=? WHERE period_id=? AND hero_id=?",
          [
            row["职业"] || row.profession || "",
            rank, rate,
            hasPower ? current.legacy_guo9 : guo9,
            periodId, heroId
          ]
        );
      } else {
        db.run(
          `INSERT INTO hero_stats
           (period_id,hero_id,profession,appearance_rank,win_rate,rank_count,
            power_top1,power_top9,power_top50,power_top100,power_median,legacy_guo9)
           VALUES(?,?,?,?,?,0,NULL,NULL,NULL,NULL,NULL,?)`,
          [periodId, heroId, row["职业"] || row.profession || "", rank, rate, guo9]
        );
      }
    }

    // 编辑器提交的是整期表格：移除本次未出现的英雄
    const old = db.query("SELECT hero_id FROM hero_stats WHERE period_id=?").all(periodId);
    for (const r of old) {
      if (keep.has(r.hero_id)) continue;
      db.run("DELETE FROM rank_power WHERE period_id=? AND hero_id=?", [periodId, r.hero_id]);
      db.run("DELETE FROM hero_stats WHERE period_id=? AND hero_id=?", [periodId, r.hero_id]);
    }

    const agg = db.query(
      "SELECT COUNT(*) AS heroes, COALESCE(SUM(rank_count),0) AS rows, COALESCE(MAX(CASE WHEN rank_count>0 THEN 1 ELSE 0 END),0) AS hp FROM hero_stats WHERE period_id=?"
    ).get(periodId);
    db.run(
      "UPDATE periods SET hero_count=?, row_count=?, has_power=?, updated_at=? WHERE id=?",
      [agg.heroes, agg.rows, agg.hp, now, periodId]
    );
  });
  tx();
  exportSnapshots(date);
  return { date, rows: rows.length, hasPower: !!hasPower };
}

// ---------- 查询 ----------
function periodInfo(date) {
  return getDb().query("SELECT * FROM periods WHERE date = ?").get(date) || null;
}

export function hasPeriod(date) {
  return !!periodInfo(date);
}

export function periodHasPower(date) {
  const p = periodInfo(date);
  return !!(p && p.has_power);
}

export function listPeriods() {
  getDb();
  return db.query(
    "SELECT date, captured_at, hero_count, row_count, has_power FROM periods ORDER BY date"
  ).all().map((p) => ({
    date: p.date,
    capturedAt: p.captured_at,
    heroCount: p.hero_count,
    rowCount: p.row_count,
    hasPower: !!p.has_power
  }));
}

export function deletePeriod(date) {
  getDb();
  const p = periodInfo(date);
  if (!p) return false;
  const tx = db.transaction(() => {
    db.run("DELETE FROM rank_power WHERE period_id = ?", [p.id]);
    db.run("DELETE FROM hero_stats WHERE period_id = ?", [p.id]);
    db.run("DELETE FROM periods WHERE id = ?", [p.id]);
  });
  tx();
  exportIndex();
  return true;
}

export function getDates() {
  return listPeriods().map((p) => p.date);
}

export function getPeriod(date) {
  getDb();
  const p = periodInfo(date);
  if (!p) return null;
  const rows = db.query(`
    SELECT h.name,
           COALESCE(NULLIF(hs.profession,''), h.profession) AS profession,
           hs.appearance_rank, hs.win_rate, hs.rank_count,
           hs.power_top1, hs.power_top9, hs.power_top50, hs.power_top100,
           hs.power_median, hs.legacy_guo9
    FROM hero_stats hs
    JOIN heroes h ON h.id = hs.hero_id
    WHERE hs.period_id = ?
    ORDER BY CASE WHEN hs.appearance_rank IS NULL THEN 1 ELSE 0 END,
             hs.appearance_rank, h.name
  `).all(p.id);

  return {
    date: p.date,
    capturedAt: p.captured_at,
    source: parseSource(p.source),
    heroCount: p.hero_count,
    rowCount: p.row_count,
    hasPower: !!p.has_power,
    heroes: rows.map((r) => ({
      name: r.name,
      profession: r.profession || "",
      appearanceRank: r.appearance_rank,
      winRate: r.win_rate,
      rankCount: r.rank_count,
      hasPower: r.rank_count > 0,
      powerTop1: r.power_top1,
      powerTop9: r.power_top9,
      powerTop50: r.power_top50,
      powerTop100: r.power_top100,
      powerMedian: r.power_median,
      legacyGuo9: r.legacy_guo9
    }))
  };
}

function blacklistFilter() {
  const set = getBlacklistSet();
  const names = new Set();
  if (set.size) {
    const entries = getBlacklist().entries ?? [];
    const uids = entries.length ? entries.map((entry) => entry.uid) : [...set];
    const audit = findUidAppearances(uids);
    for (const info of Object.values(audit.appearances)) {
      for (const name of [...info.names, ...info.latestNames]) {
        if (name) names.add(String(name).trim());
      }
    }
  }
  return { set, names };
}

export function getPeriodFull(date) {
  getDb();
  const p = getPeriod(date);
  if (!p) return null;
  const info = periodInfo(date);
  const rows = db.query(`
    SELECT h.name AS hero, rp."rank" AS rank, rp.power, rp.uid, rp.player
    FROM rank_power rp JOIN heroes h ON h.id = rp.hero_id
    WHERE rp.period_id = ?
    ORDER BY h.name, rp."rank"
  `).all(info.id);

  const map = {};
  for (const r of rows) (map[r.hero] ||= []).push(r);

  const { set: blSet, names: blNames } = blacklistFilter();
  let keptTotal = 0;
  let removedTotal = 0;
  for (const h of p.heroes) {
    const all = map[h.name] || [];
    const kept = filterRankRows(all, blSet, blNames);
    h.power = kept.map((r) => r.power);
    const d = derived(h.power);
    h.rankCount = d.rankCount;
    h.powerTop1 = d.top1;
    h.powerTop9 = d.top9;
    h.powerTop50 = d.top50;
    h.powerTop100 = d.top100;
    h.powerMedian = d.median;
    h.legacyGuo9 = d.top9 ?? d.top1;
    keptTotal += d.rankCount;
    removedTotal += all.length - d.rankCount;
  }

  p.rawRowCount = p.rowCount;
  p.rowCount = keptTotal;
  p.blacklistRemoved = removedTotal;
  p.blacklistCount = blSet.size;
  return p;
}

export function getLegacyRows(date) {
  const period = getPeriodFull(date);
  if (!period) return null;
  return period.heroes.map((h) => ({
    heroName: h.name,
    "职业": h.profession,
    appearanceRank: h.appearanceRank,
    "国9战力": h.powerTop9 ?? h.powerTop1 ?? h.legacyGuo9 ?? "",
    winRate: h.winRate === null || h.winRate === undefined
      ? ""
      : (h.winRate * 100).toFixed(2) + "%"
  }));
}

export function getPower(date, heroName) {
  getDb();
  const p = periodInfo(date);
  if (!p) return null;
  const heroId = resolveHeroId(heroName);
  if (!heroId) return null;
  const rows = db.query(
    'SELECT "rank", power, player, uid FROM rank_power WHERE period_id=? AND hero_id=? ORDER BY "rank"'
  ).all(p.id, heroId);
  const { set: blSet, names: blNames } = blacklistFilter();
  return filterRankRows(rows, blSet, blNames);
}

export function getPlayers(date, heroName, limit = 100) {
  return getPower(date, heroName)?.slice(0, Math.max(1, Math.min(limit, 100))) || null;
}

export function getHistory(heroName) {
  getDb();
  const heroId = resolveHeroId(heroName);
  if (!heroId) return null;

  const rows = db.query(`
    SELECT p.id, p.date, p.captured_at, hs.appearance_rank, hs.win_rate
    FROM periods p
    JOIN hero_stats hs ON hs.period_id = p.id
    WHERE hs.hero_id = ?
    ORDER BY p.date
  `).all(heroId);

  const { set: blSet, names: blNames } = blacklistFilter();
  return rows.map((r) => {
    const powerRows = db.query(
      'SELECT "rank", power, uid, player FROM rank_power WHERE period_id=? AND hero_id=? ORDER BY "rank"'
    ).all(r.id, heroId);
    const power = filterRankRows(powerRows, blSet, blNames).map((x) => x.power);
    const d = derived(power);
    return {
      date: r.date,
      capturedAt: r.captured_at,
      appearanceRank: r.appearance_rank,
      winRate: r.win_rate,
      rankCount: d.rankCount,
      powerTop1: d.top1,
      powerTop9: d.top9,
      powerTop50: d.top50,
      powerTop100: d.top100,
      powerMedian: d.median,
      legacyGuo9: d.top9 ?? d.top1
    };
  });
}

// 失信名单校验：每个 UID 在全部期数的出现情况 + 最新一期用户名。
export function findUidAppearances(uids) {
  getDb();
  const list = [...new Set((Array.isArray(uids) ? uids : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean))];
  const latest = db.query("SELECT date FROM periods ORDER BY date DESC LIMIT 1").get()?.date || null;
  const out = {};
  for (const uid of list) {
    out[uid] = { uid, found: false, allCount: 0, names: [], latest: [], latestNames: [] };
  }
  if (!list.length) return { latestDate: latest, appearances: out };

  const placeholders = list.map(() => "?").join(",");
  const rows = db.query(`
    SELECT rp.uid, p.date, h.name AS hero, rp."rank" AS rank, rp.power, rp.player
    FROM rank_power rp
    JOIN periods p ON p.id = rp.period_id
    JOIN heroes h ON h.id = rp.hero_id
    WHERE rp.uid IN (${placeholders})
    ORDER BY p.date DESC, rp."rank"
  `).all(...list);

  for (const r of rows) {
    const item = out[String(r.uid)];
    if (!item) continue;
    item.found = true;
    item.allCount++;
    if (r.player && !item.names.includes(r.player)) item.names.push(r.player);
    if (r.date === latest) {
      item.latest.push({ hero: r.hero, rank: r.rank, power: r.power, player: r.player || "" });
      if (r.player && !item.latestNames.includes(r.player)) item.latestNames.push(r.player);
    }
  }
  for (const item of Object.values(out)) {
    item.latest.sort((a, b) => a.rank - b.rank);
  }
  return { latestDate: latest, appearances: out };
}

// ---------- 快照 ----------
export function exportSnapshots(date) {
  getDb();
  const p = getPeriod(date);
  if (!p) return null;
  const dir = resolve(SNAPSHOT_DIR, date);
  mkdirSync(dir, { recursive: true });

  const powerRows = db.query(`
    SELECT h.name AS hero, rp."rank" AS rank, rp.power, rp.player, rp.uid
    FROM rank_power rp JOIN heroes h ON h.id = rp.hero_id
    WHERE rp.period_id = (SELECT id FROM periods WHERE date = ?)
    ORDER BY h.name, rp."rank"
  `).all(date);

  const powerMap = {};
  const players = [];
  for (const r of powerRows) {
    (powerMap[r.hero] ||= []).push(r.power);
    players.push({ hero: r.hero, rank: r.rank, power: r.power, player: r.player, uid: r.uid });
  }

  if (powerRows.length) {
    writeAtomic(resolve(dir, "power.json"), JSON.stringify({
      schema: 2,
      periodStart: date,
      rankFrom: 1,
      heroes: powerMap
    }));
    writeAtomic(
      resolve(dir, "players.json.gz"),
      gzipSync(Buffer.from(JSON.stringify({
        schema: 2,
        periodStart: date,
        players
      })), { level: 9 })
    );
  } else {
    rmSync(resolve(dir, "power.json"), { force: true });
    rmSync(resolve(dir, "players.json.gz"), { force: true });
  }

  const periodDoc = {
    schema: 2,
    periodStart: date,
    capturedAt: p.capturedAt,
    source: p.source,
    metricsVersion: 1,
    heroes: p.heroes
  };
  writeAtomic(resolve(dir, "period.json"), JSON.stringify(periodDoc, null, 2));
  exportIndex();
  return dir;
}

export function exportIndex() {
  getDb();
  const periods = listPeriods();
  const doc = {
    schema: 2,
    generatedAt: nowISO(),
    periods
  };
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  writeAtomic(resolve(SNAPSHOT_DIR, "index.json"), JSON.stringify(doc, null, 2));
  return doc;
}

function snapshotHasPower(dir) {
  const file = resolve(dir, "power.json");
  if (!existsSync(file)) return false;
  const doc = parseJSON(readFileSync(file, "utf8"), null);
  return !!(doc && doc.heroes && Object.values(doc.heroes).some((a) => Array.isArray(a) && a.length));
}

export function importSnapshotDir(dir) {
  const periodFile = resolve(dir, "period.json");
  if (!existsSync(periodFile)) return null;
  const period = parseJSON(readFileSync(periodFile, "utf8"), null);
  if (!period || !Array.isArray(period.heroes)) return null;
  const date = period.periodStart || basename(dir);
  const powerFile = resolve(dir, "power.json");
  const powerDoc = existsSync(powerFile) ? parseJSON(readFileSync(powerFile, "utf8"), {}) : {};
  const playersFile = resolve(dir, "players.json.gz");
  let playersDoc = { players: [] };
  if (existsSync(playersFile)) {
    try {
      playersDoc = JSON.parse(gunzipSync(readFileSync(playersFile)).toString("utf8"));
    } catch { playersDoc = { players: [] }; }
  }
  const playersByHero = {};
  for (const p of (Array.isArray(playersDoc.players) ? playersDoc.players : [])) {
    (playersByHero[p.hero] ||= []).push(p);
  }
  const heroes = period.heroes.map((h) => ({
    name: h.name,
    profession: h.profession || "",
    appearanceRank: h.appearanceRank,
    winRate: h.winRate,
    legacyGuo9: h.legacyGuo9,
    power: (powerDoc.heroes && powerDoc.heroes[h.name]) || [],
    players: playersByHero[h.name] || []
  }));
  return importPeriod({
    date,
    capturedAt: period.capturedAt,
    source: period.source,
    sourceHash: period.sourceHash,
    heroes
  }, { export: false });
}

export function syncSnapshots() {
  if (!existsSync(SNAPSHOT_DIR)) return 0;
  let imported = 0;
  for (const entry of readdirSync(SNAPSHOT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(SNAPSHOT_DIR, entry.name);
    const periodFile = resolve(dir, "period.json");
    if (!existsSync(periodFile)) continue;
    const period = parseJSON(readFileSync(periodFile, "utf8"), null);
    const date = period && period.periodStart ? period.periodStart : entry.name;
    if (!DATE_RE.test(date)) continue;
    if (!hasPeriod(date) || (!periodHasPower(date) && snapshotHasPower(dir))) {
      try { importSnapshotDir(dir); imported++; } catch (e) { console.warn("[db] 快照导入失败", dir, e.message); }
    }
  }
  return imported;
}

// ---------- 启动引导 ----------
// 旧数据已封存在 archive/legacy/，不自动导入；DB 为空时优先用快照，
// 否则导入根目录最新一期 JSON（不再硬编码 10-19）。
export function bootstrap() {
  getDb();
  seedHeroes();
  let importedSnapshots = 0;
  let importedExperimental = 0;

  if (!getDates().length) {
    // 优先从快照重建（如果存在）
    importedSnapshots = syncSnapshots();
  }
  if (!getDates().length) {
    const candidates = readdirSync(ROOT)
      .filter((name) => /^曙光英雄_\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();
    const latest = candidates[candidates.length - 1];
    if (latest) {
      importExperimentalFile(resolve(ROOT, latest));
      importedExperimental = 1;
    }
  }
  exportIndex();
  return {
    periods: listPeriods().length,
    importedSnapshots,
    importedExperimental
  };
}
