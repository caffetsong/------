/* ============================================================
   blacklist.js — 失信名单（按 UID + 备注）
   文件：data/blacklist.json
   榜单读取时动态剔除，不修改原始 DB / snapshot。
   ============================================================ */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = import.meta.dir;
export const BLACKLIST_FILE = resolve(ROOT, "data", "blacklist.json");

let cache = { mtime: -1, entries: [], uids: [], set: new Set(), updatedAt: null };

export function normalizeUid(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function entryOf(value) {
  if (typeof value === "string") return { uid: normalizeUid(value), reason: "" };
  if (value && typeof value === "object") {
    return {
      uid: normalizeUid(value.uid),
      reason: String(value.reason ?? "").trim()
    };
  }
  return { uid: "", reason: "" };
}

export function normalizeEntries(input) {
  let list;
  if (Array.isArray(input)) list = input;
  else if (input && typeof input === "object" && Array.isArray(input.entries)) list = input.entries;
  else if (input && typeof input === "object" && Array.isArray(input.uids)) list = input.uids;
  else list = String(input ?? "").split(/[\s,;，；]+/);

  const seen = new Set();
  const entries = [];
  for (const item of list) {
    const entry = entryOf(item);
    if (!entry.uid || entry.uid.startsWith("#") || seen.has(entry.uid)) continue;
    seen.add(entry.uid);
    entries.push(entry);
  }
  return entries;
}

export function normalizeUids(input) {
  return normalizeEntries(input).map((entry) => entry.uid);
}

function readCache() {
  if (!existsSync(BLACKLIST_FILE)) {
    cache = { mtime: -1, entries: [], uids: [], set: new Set(), updatedAt: null };
    return cache;
  }
  let mtime;
  try { mtime = statSync(BLACKLIST_FILE).mtimeMs; } catch { mtime = -1; }
  if (cache.mtime === mtime) return cache;

  let entries = [];
  let updatedAt = null;
  try {
    const raw = JSON.parse(readFileSync(BLACKLIST_FILE, "utf8"));
    if (Array.isArray(raw)) entries = normalizeEntries(raw);
    else entries = normalizeEntries(raw.entries ?? raw.uids ?? []);
    updatedAt = raw && !Array.isArray(raw) ? (raw.updatedAt || null) : null;
  } catch (e) {
    console.warn("[blacklist] 读取失败:", e.message);
  }
  const uids = entries.map((entry) => entry.uid);
  cache = { mtime, entries, uids, set: new Set(uids), updatedAt };
  return cache;
}

export function getBlacklist() {
  const c = readCache();
  return {
    file: "data/blacklist.json",
    count: c.entries.length,
    uids: [...c.uids],
    entries: c.entries.map((entry) => ({ ...entry })),
    reasons: Object.fromEntries(c.entries.map((entry) => [entry.uid, entry.reason])),
    updatedAt: c.updatedAt
  };
}

export function getBlacklistSet() {
  return readCache().set;
}

export function setBlacklist(input) {
  const existing = new Map(readCache().entries.map((entry) => [entry.uid, entry.reason]));
  let entries = normalizeEntries(input);

  // 旧编辑器只提交 uids 时，保留已有备注。
  const hasExplicitEntries = Array.isArray(input)
    ? input.some((item) => item && typeof item === "object")
    : Boolean(input && typeof input === "object" && Array.isArray(input.entries));
  if (!hasExplicitEntries) {
    entries = entries.map((entry) => ({
      uid: entry.uid,
      reason: entry.reason || existing.get(entry.uid) || ""
    }));
  }

  mkdirSync(dirname(BLACKLIST_FILE), { recursive: true });
  const uids = entries.map((entry) => entry.uid);
  const doc = {
    schema: 2,
    updatedAt: new Date().toISOString(),
    uids,
    entries
  };
  writeFileSync(BLACKLIST_FILE, JSON.stringify(doc, null, 2) + "\n", "utf8");
  const mtime = statSync(BLACKLIST_FILE).mtimeMs;
  cache = { mtime, entries, uids, set: new Set(uids), updatedAt: doc.updatedAt };
  return getBlacklist();
}

// 输入按原 rank 排序的行；剔除命中 UID 后重新按 1..N 编号。
// 对于 UID 已清空的历史期，额外按黑名单 UID 对应的选手名兜底过滤。
export function filterRankRows(rows, set = getBlacklistSet(), names = new Set()) {
  if (!Array.isArray(rows)) return [];
  const kept = set.size || names.size
    ? rows.filter((r) => {
        const uid = normalizeUid(r.uid);
        if (uid) return !set.has(uid);
        return !names.has(String(r.player ?? "").trim());
      })
    : rows.slice();
  return kept.map((r, i) => ({ ...r, rank: i + 1 }));
}
