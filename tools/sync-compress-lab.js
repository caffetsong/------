// ============================================================
// tools/sync-compress-lab.js —— 数据格式极致压缩实验台
//
// 目的：把 data.json（备战方案）压到尽可能小，并验证往返解码正确。
// 阶段：
//   v1  字节对齐索引打包（基准，已实测 1790 B）
//   v2  位打包（字段按需位宽）+ 文本内联
//   v3  位打包 + 文本独立块（deflate / brotli）
//   v4  v3 + 整体二次压缩（deflate / brotli）
//
// 用法： node tools/sync-compress-lab.js
// ============================================================
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const F = (p) => path.join(ROOT, p);

// ---------- 词表（真实 App 会内置同样的表） ----------
const heroes = fs.readdirSync(F("HeadIcon"))
  .filter((f) => /\.png$/i.test(f)).map((f) => f.replace(/\.png$/i, "")).sort();
const eqCatalog = JSON.parse(fs.readFileSync(F("equip.json"), "utf8"));
const equips = [];
for (const pos of Object.keys(eqCatalog))
  for (const tier of Object.keys(eqCatalog[pos]))
    for (const n of eqCatalog[pos][tier]) if (!equips.includes(n)) equips.push(n);
const prepSrc = fs.readFileSync(F("备战.js"), "utf8");
const rdStart = prepSrc.indexOf("const runeData");
const runeData = new Function(prepSrc.slice(rdStart, prepSrc.indexOf("\n};", rdStart) + 3) + "\nreturn runeData;")();
const runes = [];
for (const k of Object.keys(runeData)) runeData[k].forEach((r) => runes.push(r.name));

const data = JSON.parse(fs.readFileSync(F("data.json"), "utf8"));
const RAW = fs.statSync(F("data.json")).size;

// 分路词表
const laneSet = new Set();
for (const h of Object.keys(data)) {
  if (h === "__universal") continue;
  for (const b of data[h] || []) if (b.lane) laneSet.add(b.lane);
}
const lanes = [...laneSet].sort();
const RUNE_KEYS = ["colorful", "attack", "defense", "general"];

const hI = new Map(heroes.map((n, i) => [n, i]));
const eI = new Map(equips.map((n, i) => [n, i]));
const rI = new Map(runes.map((n, i) => [n, i]));
const lI = new Map(lanes.map((n, i) => [n, i]));
const vocabStr = heroes.join("|") + "##" + equips.join("|") + "##" + runes.join("|") + "##" + lanes.join("|");
const FP = zlib.crc32(vocabStr) >>> 0;

// ---------- 位写入 / 读取 ----------
class BitW {
  constructor() { this.b = []; this.acc = 0; this.n = 0; }
  bitLen() { return this.b.length * 8 + this.n; }
  w(v, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((v >> i) & 1);
      if (++this.n === 8) { this.b.push(this.acc & 0xff); this.acc = 0; this.n = 0; }
    }
  }
  bytes() { const out = this.b.slice(); if (this.n) out.push((this.acc << (8 - this.n)) & 0xff); return Buffer.from(out); }
}
class BitR {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  r(bits) {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      const byte = this.buf[this.pos >> 3];
      const bit = (byte >> (7 - (this.pos & 7))) & 1;
      v = (v << 1) | bit; this.pos++;
    }
    return v >>> 0;
  }
}

// 位宽
const W = { hero: 7, planCnt: 4, lane: 3, rune: 5, equip: 7, equipCnt: 6, uniCnt: 4, txtLen: 6, hasLane: 1 };

// ---------- v2/v3 编码 ----------
// textMode: "inline" | "block"
function encode(data, textMode, textCodec) {
  const hk = Object.keys(data).filter((k) => k !== "__universal");
  const uni = data.__universal || {};
  const texts = [];               // 文本按顺序收集（name, player 各一条，空串也占位）
  const bw = new BitW();

  bw.w(0x53, 8); bw.w(0x47, 8); bw.w(2, 4);          // "SG" + version 2
  bw.w(FP, 32);
  bw.w(textMode === "block" ? 1 : 0, 1);
  bw.w(hk.length, 7);
  const putText = (s) => { if (textMode === "inline") { const b = Buffer.from(s || "", "utf8"); bw.w(Math.min(b.length, 63), W.txtLen); for (const x of b.slice(0, 63)) bw.w(x, 8); } else texts.push(s || ""); };
  const putRunes = (runesObj) => {
    let mask = 0;
    RUNE_KEYS.forEach((k, i) => { if (runesObj?.[k]?.[0]) mask |= 1 << i; });
    bw.w(mask, 4);
    RUNE_KEYS.forEach((k, i) => { const nm = runesObj?.[k]?.[0]; if (mask & (1 << i)) bw.w(rI.get(nm) ?? 0, W.rune); });
  };
  const putEquips = (arr) => {
    const e = arr || [];
    bw.w(e.length, W.equipCnt);
    e.forEach((x) => bw.w(x && eI.has(x) ? eI.get(x) : 127, W.equip));
  };
  const putBackup = (arr, len) => {
    const a = arr || [];
    for (let i = 0; i < len; i++) bw.w(a[i] ? 1 : 0, 1);
    for (let i = 0; i < len; i++) if (a[i]) bw.w(eI.has(a[i]) ? eI.get(a[i]) : 127, W.equip);
  };

  for (const hero of hk) {
    bw.w(hI.get(hero) ?? 127, W.hero);
    const plans = data[hero] || [];
    bw.w(plans.length, W.planCnt);
    for (const b of plans) {
      bw.w(b.lane ? 1 : 0, W.hasLane);
      if (b.lane) bw.w(lI.get(b.lane) ?? 7, W.lane);
      putRunes(b.runes);
      const e = b.equips || [];
      putEquips(e);
      putBackup(b.equipsBackup, e.length);
      putBackup(b.equipsBackup2, e.length);
      putText(b.name); putText(b.player);
    }
  }
  const uk = Object.keys(uni);
  bw.w(uk.length, W.uniCnt);
  for (const hero of uk) {
    const t = uni[hero];
    bw.w(hI.get(hero) ?? 127, W.hero);
    bw.w((t.enabled ? 1 : 0) | (t.equipEnabled ? 2 : 0), 2);
    putRunes(t.runes);
    putEquips(t.equips);
  }

  const bitBuf = bw.bytes();
  if (textMode === "inline") return { buf: bitBuf, textBuf: null };

  // 文本块：长度(6bit)+字节 拼接 → 压缩
  const tw = new BitW();
  tw.w(texts.length, 16);
  for (const s of texts) { const b = Buffer.from(s, "utf8"); tw.w(b.length, 8); for (const x of b) tw.w(x, 8); }
  const textRaw = tw.bytes();
  const textPacked = textCodec === "brotli"
    ? zlib.brotliCompressSync(textRaw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } })
    : zlib.deflateSync(textRaw, { level: 9 });
  const head = Buffer.alloc(3);
  head.writeUInt16LE(textPacked.length, 0);
  head[2] = textCodec === "brotli" ? 1 : 0;
  // 顺序：位流 | 压缩文本块 | 3 字节头（头放末尾，解码时从尾部读取）
  const buf = Buffer.concat([bitBuf, textPacked, head]);
  return { buf, textBuf: { raw: textRaw.length, packed: textPacked.length } };
}

// ---------- 解码（验证往返） ----------
function decode(buf) {
  const br = new BitR(buf);
  if (br.r(8) !== 0x53 || br.r(8) !== 0x47) throw new Error("魔数错误");
  const ver = br.r(4);
  const fp = br.r(32);
  if (fp !== FP) throw new Error("词表指纹不匹配");
  const blockMode = br.r(1) === 1;

  let texts = null, ti = 0;
  if (blockMode) {
    // 文本块位于 buffer 尾部：最后 3 字节是长度+codec
    const tail = buf.slice(buf.length - 3);
    const packedLen = tail.readUInt16LE(0);
    const codec = tail[2];
    const packed = buf.slice(buf.length - 3 - packedLen, buf.length - 3);
    const rawBytes = codec === 1 ? zlib.brotliDecompressSync(packed) : zlib.inflateSync(packed);
    const tr = new BitR(rawBytes);
    const n = tr.r(16); texts = [];
    for (let i = 0; i < n; i++) { const len = tr.r(8); let s = ""; for (let j = 0; j < len; j++) s += String.fromCharCode(tr.r(8)); texts.push(Buffer.from(s, "latin1").toString("utf8")); }
  }
  const getText = () => {
    if (texts) return texts[ti++] || "";
    const len = br.r(W.txtLen); const bytes = []; for (let j = 0; j < len; j++) bytes.push(br.r(8));
    return Buffer.from(bytes).toString("utf8");
  };
  const getRunes = () => {
    const mask = br.r(4); const out = { colorful: [], attack: [], defense: [], general: [] };
    RUNE_KEYS.forEach((k, i) => { if (mask & (1 << i)) out[k] = [runes[br.r(W.rune)]]; });
    return out;
  };
  const getEquips = () => { const n = br.r(W.equipCnt); const out = []; for (let i = 0; i < n; i++) { const v = br.r(W.equip); out.push(v === 127 ? null : equips[v]); } return out; };
  const getBackup = (len) => { const m = []; for (let i = 0; i < len; i++) m.push(br.r(1)); const out = []; for (let i = 0; i < len; i++) out.push(m[i] ? equips[br.r(W.equip)] : null); return out; };

  const out = {};
  const hn = br.r(7);
  for (let k = 0; k < hn; k++) {
    const hero = heroes[br.r(W.hero)];
    const n = br.r(W.planCnt); const arr = [];
    for (let j = 0; j < n; j++) {
      const hasLane = br.r(1); const lane = hasLane ? lanes[br.r(W.lane)] : null;
      const runesObj = getRunes();
      const eqs = getEquips();
      const b1 = getBackup(eqs.length); const b2 = getBackup(eqs.length);
      const name = getText(); const player = getText();
      const plan = { name, runes: runesObj, equips: eqs, equipsBackup: b1, equipsBackup2: b2 };
      if (lane) plan.lane = lane;
      if (player) plan.player = player;
      arr.push(plan);
    }
    out[hero] = arr;
  }
  const un = br.r(W.uniCnt); const uni = {};
  for (let k = 0; k < un; k++) {
    const hero = heroes[br.r(W.hero)];
    const fl = br.r(2);
    const runesObj = getRunes();
    const eqs = getEquips();
    uni[hero] = { enabled: !!(fl & 1), equipEnabled: !!(fl & 2), runes: runesObj, equips: eqs };
  }
  out.__universal = uni;
  return { out, ver };
}

// 语义归一化（比较用）
function norm(d) {
  const o = {};
  for (const hero of Object.keys(d)) {
    if (hero === "__universal") continue;
    o[hero] = (d[hero] || []).map((b) => {
      const n = (b.equips || []).length;
      const pad = (a) => { const x = Array.isArray(a) ? a.slice(0, n) : []; while (x.length < n) x.push(null); return x.map((v) => v || null); };
      return { name: b.name || "", lane: b.lane || null, player: b.player || null,
        runes: { colorful: b.runes?.colorful || [], attack: b.runes?.attack || [], defense: b.runes?.defense || [], general: b.runes?.general || [] },
        equips: (b.equips || []).map((v) => v || null), equipsBackup: pad(b.equipsBackup), equipsBackup2: pad(b.equipsBackup2) };
    });
  }
  const univ = {};
  for (const h of Object.keys(d.__universal || {})) {
    const t = d.__universal[h]; const n = (t.equips || []).length;
    const pad = (a) => { const x = Array.isArray(a) ? a.slice(0, n) : []; while (x.length < n) x.push(null); return x.map((v) => v || null); };
    univ[h] = { enabled: !!t.enabled, equipEnabled: !!t.equipEnabled,
      runes: { colorful: t.runes?.colorful || [], attack: t.runes?.attack || [], defense: t.runes?.defense || [], general: t.runes?.general || [] },
      equips: pad(t.equips) };
  }
  o.__universal = univ;
  return JSON.stringify(o);
}
const REF = norm(JSON.parse(JSON.stringify(data)));

// 文本占比统计（用于后续优化判断）
let textBytes = 0, planCnt = 0;
for (const h of Object.keys(data)) {
  if (h === "__universal") continue;
  for (const b of data[h] || []) { planCnt++; for (const s of [b.name || "", b.player || ""]) textBytes += Buffer.byteLength(s, "utf8"); }
}

// ---------- v5：位打包 + 文本字典 + 可跳过的空备用 + 6 位长度 ----------
function collectTexts(data) {
  const out = [];
  for (const hero of Object.keys(data)) {
    if (hero === "__universal") continue;
    for (const b of data[hero] || []) { out.push(b.name || ""); out.push(b.player || ""); }
  }
  return out;
}
function anyBackup(data) {
  for (const hero of Object.keys(data)) {
    if (hero === "__universal") continue;
    for (const b of data[hero] || []) {
      if ((b.equipsBackup || []).some(Boolean)) return true;
      if ((b.equipsBackup2 || []).some(Boolean)) return true;
    }
  }
  return false;
}
function encode5(data, { codec = "brotli", useDict = true } = {}) {
  const hk = Object.keys(data).filter((k) => k !== "__universal");
  const uni = data.__universal || {};
  const hasBackup = anyBackup(data);
  const texts = collectTexts(data);

  // 文本字典（出现 ≥2 次的值）
  const counts = new Map();
  texts.forEach((t) => { if (t) counts.set(t, (counts.get(t) || 0) + 1); });
  const dict = useDict
    ? [...counts.entries()].filter(([, c]) => c >= 2).map(([v]) => v).sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b)).slice(0, 63)
    : [];
  const dI = new Map(dict.map((v, i) => [v, i]));

  const bw = new BitW();
  bw.w(0x53, 8); bw.w(0x47, 8); bw.w(5, 4);          // "SG" v5
  bw.w(FP, 32);
  bw.w(hasBackup ? 1 : 0, 1);                        // 是否有备用装备
  bw.w(useDict ? 1 : 0, 1);
  if (useDict) {
    bw.w(dict.length, 6);
    for (const s of dict) { const b = Buffer.from(s, "utf8"); bw.w(b.length, 5); for (const x of b) bw.w(x, 8); }
  }
  bw.w(hk.length, 7);

  // 文本块：字典引用(1bit + 6bit 索引) 或 字面量(1bit + 5bit 长度 + 字节)
  const tw = new BitW();
  tw.w(texts.length, 16);
  for (const s of texts) {
    const idx = dI.get(s);
    if (idx !== undefined) { tw.w(1, 1); tw.w(idx, 6); }
    else { tw.w(0, 1); const b = Buffer.from(s, "utf8"); tw.w(Math.min(b.length, 31), 5); for (const x of b.slice(0, 31)) tw.w(x, 8); }
  }
  const textRaw = tw.bytes();
  const textPacked = codec === "deflate"
    ? zlib.deflateSync(textRaw, { level: 9 })
    : zlib.brotliCompressSync(textRaw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });

  const putRunes = (ro) => {
    let mask = 0; RUNE_KEYS.forEach((k, i) => { if (ro?.[k]?.[0]) mask |= 1 << i; });
    bw.w(mask, 4);
    RUNE_KEYS.forEach((k, i) => { if (mask & (1 << i)) bw.w(rI.get(ro[k][0]) ?? 0, W.rune); });
  };
  const putEquips = (arr) => {
    const e = arr || [];
    bw.w(e.length, W.equipCnt);
    e.forEach((x) => bw.w(x && eI.has(x) ? eI.get(x) : 127, W.equip));
  };
  const putBackup = (arr, len) => {
    if (!hasBackup) return;                          // 全局无备用 → 整个跳过
    const a = arr || [];
    for (let i = 0; i < len; i++) bw.w(a[i] ? 1 : 0, 1);
    for (let i = 0; i < len; i++) if (a[i]) bw.w(eI.get(a[i]) ?? 127, W.equip);
  };

  for (const hero of hk) {
    bw.w(hI.get(hero) ?? 127, W.hero);
    const plans = data[hero] || [];
    bw.w(plans.length, W.planCnt);
    for (const b of plans) {
      bw.w(b.lane ? 1 : 0, 1);
      if (b.lane) bw.w(lI.get(b.lane) ?? 7, W.lane);
      putRunes(b.runes);
      const e = b.equips || [];
      putEquips(e);
      putBackup(b.equipsBackup, e.length);
      putBackup(b.equipsBackup2, e.length);
    }
  }
  const uk = Object.keys(uni);
  bw.w(uk.length, W.uniCnt);
  for (const hero of uk) {
    const t = uni[hero];
    bw.w(hI.get(hero) ?? 127, W.hero);
    bw.w((t.enabled ? 1 : 0) | (t.equipEnabled ? 2 : 0), 2);
    putRunes(t.runes);
    putEquips(t.equips);
  }

  const head = Buffer.alloc(3);
  head.writeUInt16LE(textPacked.length, 0);
  head[2] = codec === "deflate" ? 0 : 1;
  const buf = Buffer.concat([bw.bytes(), textPacked, head]);
  return { buf, textBuf: { raw: textRaw.length, packed: textPacked.length }, dict: dict.length, hasBackup };
}
function decode5(buf) {
  const head = buf.slice(buf.length - 3);
  const packedLen = head.readUInt16LE(0);
  const codec = head[2];
  const packed = buf.slice(buf.length - 3 - packedLen, buf.length - 3);
  const textRaw = codec === 1 ? zlib.brotliDecompressSync(packed) : zlib.inflateSync(packed);
  const br = new BitR(buf);
  if (br.r(8) !== 0x53 || br.r(8) !== 0x47) throw new Error("魔数错误");
  const ver = br.r(4);
  const fp = br.r(32);
  if (fp !== FP) throw new Error("词表指纹不匹配");
  const hasBackup = br.r(1) === 1;
  const useDict = br.r(1) === 1;
  let dict = [];
  if (useDict) { const n = br.r(6); for (let i = 0; i < n; i++) { const len = br.r(5); const b = []; for (let j = 0; j < len; j++) b.push(br.r(8)); dict.push(Buffer.from(b).toString("utf8")); } }
  // 文本块解出为顺序队列
  const tr = new BitR(textRaw);
  const tn = tr.r(16); const texts = [];
  for (let i = 0; i < tn; i++) {
    const isRef = tr.r(1);
    if (isRef) texts.push(dict[tr.r(6)] || "");
    else { const len = tr.r(5); const b = []; for (let j = 0; j < len; j++) b.push(tr.r(8)); texts.push(Buffer.from(b).toString("utf8")); }
  }
  let ti = 0;
  const getText = () => texts[ti++] || "";
  const getRunes = () => {
    const mask = br.r(4); const o = { colorful: [], attack: [], defense: [], general: [] };
    RUNE_KEYS.forEach((k, i) => { if (mask & (1 << i)) o[k] = [runes[br.r(W.rune)]]; });
    return o;
  };
  const getEquips = () => { const n = br.r(W.equipCnt); const o = []; for (let i = 0; i < n; i++) { const v = br.r(W.equip); o.push(v === 127 ? null : equips[v]); } return o; };
  const getBackup = (len) => {
    if (!hasBackup) return new Array(len).fill(null);
    const m = []; for (let i = 0; i < len; i++) m.push(br.r(1));
    const o = []; for (let i = 0; i < len; i++) o.push(m[i] ? equips[br.r(W.equip)] : null);
    return o;
  };
  const out = {};
  const hn = br.r(7);
  for (let k = 0; k < hn; k++) {
    const hero = heroes[br.r(W.hero)];
    const n = br.r(W.planCnt); const arr = [];
    for (let j = 0; j < n; j++) {
      const hasLane = br.r(1); const lane = hasLane ? lanes[br.r(W.lane)] : null;
      const ro = getRunes(); const eqs = getEquips();
      const b1 = getBackup(eqs.length), b2 = getBackup(eqs.length);
      const name = getText(), player = getText();
      const plan = { name, runes: ro, equips: eqs, equipsBackup: b1, equipsBackup2: b2 };
      if (lane) plan.lane = lane;
      if (player) plan.player = player;
      arr.push(plan);
    }
    out[hero] = arr;
  }
  const un = br.r(W.uniCnt); const uni = {};
  for (let k = 0; k < un; k++) {
    const hero = heroes[br.r(W.hero)];
    const fl = br.r(2);
    uni[hero] = { enabled: !!(fl & 1), equipEnabled: !!(fl & 2), runes: getRunes(), equips: getEquips() };
  }
  out.__universal = uni;
  return { out, ver };
}

// ============================================================
// v6：增量编码（以"接收方已持有上一版"为前提，只传变化部分）
// 格式：SD + 版本 + 词表指纹 + 基准快照CRC + 每个英雄各方案的"未变"位
// ============================================================
function baseId(d) { return zlib.crc32(JSON.stringify(d)) >>> 0; }
function samePlan(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function encodeDelta(oldData, newData) {
  const hk = Object.keys(newData).filter((k) => k !== "__universal");
  const texts = [];
  const bw = new BitW();
  bw.w(0x53, 8); bw.w(0x44, 8); bw.w(6, 4);            // "SD" v6
  bw.w(FP, 32);
  bw.w(baseId(oldData), 32);                            // 基准快照 CRC（接收方校验）
  bw.w(hk.length, 7);
  const t0 = bw.bitLen();

  const putRunes = (ro) => {
    let mask = 0; RUNE_KEYS.forEach((k, i) => { if (ro?.[k]?.[0]) mask |= 1 << i; });
    bw.w(mask, 4);
    RUNE_KEYS.forEach((k, i) => { if (mask & (1 << i)) bw.w(rI.get(ro[k][0]) ?? 0, W.rune); });
  };
  const putEquips = (arr) => { const e = arr || []; bw.w(e.length, W.equipCnt); e.forEach((x) => bw.w(x && eI.has(x) ? eI.get(x) : 127, W.equip)); };
  const putBackup = (arr, len) => { const a = arr || []; for (let i = 0; i < len; i++) bw.w(a[i] ? 1 : 0, 1); for (let i = 0; i < len; i++) if (a[i]) bw.w(eI.get(a[i]) ?? 127, W.equip); };
  const putText = (s) => { const b = Buffer.from(s || "", "utf8"); bw.w(Math.min(b.length, 63), 6); for (const x of b.slice(0, 63)) bw.w(x, 8); };
  const putPlan = (b) => {
    bw.w(b.lane ? 1 : 0, 1); if (b.lane) bw.w(lI.get(b.lane) ?? 7, W.lane);
    putRunes(b.runes);
    const e = b.equips || [];
    putEquips(e); putBackup(b.equipsBackup, e.length); putBackup(b.equipsBackup2, e.length);
    // 文本只在文本块里存（1 字节长度前缀 + UTF-8），位流里不再重复存长度
    texts.push(Buffer.from(b.name || "", "utf8"));
    texts.push(Buffer.from(b.player || "", "utf8"));
  };

  let changed = 0, total = 0;
  for (const hero of hk) {
    bw.w(hI.get(hero) ?? 127, W.hero);
    const plans = newData[hero] || [], oldPlans = oldData[hero] || [];
    bw.w(plans.length, W.planCnt);
    plans.forEach((p, i) => {
      total++;
      const same = i < oldPlans.length && samePlan(oldPlans[i], p);
      bw.w(same ? 1 : 0, 1);
      if (!same) { changed++; putPlan(p); }
    });
  }
  // 通用条目（逐个比对）
  const t1 = bw.bitLen();
  const uid = Object.keys(newData.__universal || {});
  bw.w(uid.length, W.uniCnt);
  for (const hero of uid) {
    const t = newData.__universal[hero], old = (oldData.__universal || {})[hero];
    bw.w(hI.get(hero) ?? 127, W.hero);
    const same = old && JSON.stringify(old) === JSON.stringify(t);
    bw.w(same ? 1 : 0, 1);
    if (!same) {
      bw.w((t.enabled ? 1 : 0) | (t.equipEnabled ? 2 : 0), 2);
      putRunes(t.runes); putEquips(t.equips);
    }
  }
  // 文本块（改动方案的名字/选手名，字节流内联，最后整体 brotli）
  const tw = Buffer.concat(texts.map((b) => Buffer.concat([Buffer.from([b.length]), b])));
  const packed = zlib.brotliCompressSync(tw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  const head = Buffer.alloc(3);
  head.writeUInt16LE(packed.length, 0);
  head[2] = 1;
  const buf = Buffer.concat([bw.bytes(), packed, head]);
  const t2 = bw.bitLen();
  return { buf, changed, total, textRaw: tw.length, textPacked: packed.length,
    bits: { header: t0, heroFlags: t1 - t0, universal: t2 - t1, total: t2 } };
}
function decodeDelta(oldData, buf) {
  const head = buf.slice(buf.length - 3);
  const packed = buf.slice(buf.length - 3 - head.readUInt16LE(0), buf.length - 3);
  const tw = zlib.brotliDecompressSync(packed);
  let tp = 0;
  const readText = () => { const n = tw[tp++]; const s = tw.slice(tp, tp + n).toString("utf8"); tp += n; return s; };
  const br = new BitR(buf);
  if (br.r(8) !== 0x53 || br.r(8) !== 0x44) throw new Error("魔数错误");
  const ver = br.r(4);
  if (br.r(32) !== FP) throw new Error("词表指纹不匹配");
  const base = br.r(32);
  if (base !== baseId(oldData)) throw new Error("基准快照不匹配（需要先同步基准）");
  const getRunes = () => { const mask = br.r(4); const o = { colorful: [], attack: [], defense: [], general: [] }; RUNE_KEYS.forEach((k, i) => { if (mask & (1 << i)) o[k] = [runes[br.r(W.rune)]]; }); return o; };
  const getEquips = () => { const n = br.r(W.equipCnt); const o = []; for (let i = 0; i < n; i++) { const v = br.r(W.equip); o.push(v === 127 ? null : equips[v]); } return o; };
  const getBackup = (len) => { const m = []; for (let i = 0; i < len; i++) m.push(br.r(1)); const o = []; for (let i = 0; i < len; i++) o.push(m[i] ? equips[br.r(W.equip)] : null); return o; };

  const out = {};
  const hn = br.r(7);
  for (let h = 0; h < hn; h++) {
    const hero = heroes[br.r(W.hero)];
    const n = br.r(W.planCnt); const arr = []; const oldPlans = oldData[hero] || [];
    for (let i = 0; i < n; i++) {
      const same = br.r(1) === 1;
      if (same) { arr.push(JSON.parse(JSON.stringify(oldPlans[i]))); continue; }
      const hasLane = br.r(1); const lane = hasLane ? lanes[br.r(W.lane)] : null;
      const ro = getRunes(); const eqs = getEquips();
      const b1 = getBackup(eqs.length), b2 = getBackup(eqs.length);
      const plan = { name: readText(), runes: ro, equips: eqs, equipsBackup: b1, equipsBackup2: b2 };
      if (lane) plan.lane = lane;
      const pl = readText(); if (pl) plan.player = pl;
      arr.push(plan);
    }
    out[hero] = arr;
  }
  const un = br.r(W.uniCnt); const uni = {};
  for (let k = 0; k < un; k++) {
    const hero = heroes[br.r(W.hero)];
    const same = br.r(1) === 1;
    if (same) { uni[hero] = JSON.parse(JSON.stringify(oldData.__universal[hero])); continue; }
    const fl = br.r(2);
    uni[hero] = { enabled: !!(fl & 1), equipEnabled: !!(fl & 2), runes: getRunes(), equips: getEquips() };
  }
  out.__universal = uni;
  return { out, ver };
}

// ---------- 跑各阶段 ----------
const rows = [];
const check = (label, enc, decodeFn) => {
  const r = decodeFn(enc.buf);
  const ok = norm(r.out) === REF;
  rows.push({ label, size: enc.buf.length, ok, extra: enc.textBuf });
  return ok;
};

check("v2 位打包 + 文本内联", encode(data, "inline"), decode);
check("v3 位打包 + 文本deflate", encode(data, "block", "deflate"), decode);
check("v3 位打包 + 文本brotli", encode(data, "block", "brotli"), decode);

// v5：文本字典 + 跳过空备用 + 6 位长度
const e5b = encode5(data, { codec: "brotli" });
const r5 = decode5(e5b.buf);
rows.push({ label: "v5 + 文本字典(brotli)", size: e5b.buf.length, ok: norm(r5.out) === REF, extra: e5b.textBuf });
const e5d = encode5(data, { codec: "deflate" });
rows.push({ label: "v5 + 文本字典(deflate)", size: e5d.buf.length, ok: norm(decode5(e5d.buf).out) === REF });
// v5 再去掉字典（量化字典本身的收益）
const e5n = encode5(data, { codec: "brotli", useDict: false });
rows.push({ label: "v5 无字典(对照)", size: e5n.buf.length, ok: norm(decode5(e5n.buf).out) === REF });
// v5 + 整体二次压缩
const b5 = zlib.brotliCompressSync(e5b.buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
rows.push({ label: "v5 + 整体brotli", size: b5.length, ok: norm(decode5(zlib.brotliDecompressSync(b5)).out) === REF });

// v4：在 v3(brotli 文本) 基础上整体二次压缩
const v3b = encode(data, "block", "brotli");
const defl = zlib.deflateSync(v3b.buf, { level: 9 });
const brot = zlib.brotliCompressSync(v3b.buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
// 整体二次压缩后无法直接走位解码（需先解压）→ 解压再验证
const okDefl = norm(decode(zlib.inflateSync(defl)).out) === REF;
const okBrot = norm(decode(zlib.brotliDecompressSync(brot)).out) === REF;
rows.push({ label: "v4 = v3 + 整体deflate", size: defl.length, ok: okDefl });
rows.push({ label: "v4 = v3 + 整体brotli", size: brot.length, ok: okBrot });

// ---------- v6 增量实测：用 git 历史里的真实两版 ----------
let deltaRows = [];
try {
  const { execFileSync } = require("child_process");
  const sh = (rev) => JSON.parse(execFileSync("git", ["show", rev + ":data.json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const pairs = [["a605818", "4dd4e40"]];
  for (const [a, b] of pairs) {
    const oldD = sh(a), newD = sh(b);
    const fullNew = encode(newD, "block", "brotli");
    const d = encodeDelta(oldD, newD);
    const back = decodeDelta(oldD, d.buf);
    const ok = norm(back.out) === norm(JSON.parse(JSON.stringify(newD)));
    deltaRows.push({ pair: a + " → " + b, full: fullNew.buf.length, delta: d.buf.length, changed: d.changed, total: d.total, ok,
      textRaw: d.textRaw, textPacked: d.textPacked, bits: d.bits });
  }
} catch (e) {
  deltaRows.push({ error: e.message });
}

console.log("=== data.json 极致压缩实测（原始 " + RAW + " B） ===");
for (const r of rows) {
  const base64 = Math.ceil(r.size / 3) * 4;
  console.log("  " + r.label.padEnd(26) + String(r.size).padStart(6) + " B  " +
    (RAW / r.size).toFixed(1).padStart(5) + "×   往返:" + (r.ok ? "✓" : "✗") +
    "   等长Base64URL:" + String(base64).padStart(5) + " B");
}
console.log("");
console.log("  文本块(latin/utf8 原始 → 压缩): " + rows[1].extra.raw + " B → deflate " + rows[1].extra.packed + " B / brotli " + rows[2].extra.packed + " B");
console.log("  v5 文本块: " + e5b.textBuf.raw + " B → brotli " + e5b.textBuf.packed + " B | 字典条目 " + e5b.dict + " | 存在备用装备: " + e5b.hasBackup);
console.log("  自由文本原始 UTF-8 字节: " + textBytes + " B（" + planCnt + " 套方案）");
console.log("  词表: 英雄 " + heroes.length + " / 装备 " + equips.length + " / 符文 " + runes.length + " / 分路 " + lanes.length + " | 指纹 0x" + FP.toString(16));
console.log("");
console.log("  二维码容量参考(字节模式)：v30-M 1373 / v35-M 1689 / v40-M 2331 / v40-L 2953");
console.log("");
console.log("=== 增量同步实测（真实 git 版本对） ===");
for (const d of deltaRows) {
  if (d.error) { console.log("  取版本失败: " + d.error); continue; }
  console.log("  " + d.pair);
  console.log("    该版全量快照(v3): " + d.full + " B");
  console.log("    增量载荷:         " + d.delta + " B   往返:" + (d.ok ? "✓" : "✗") +
    "   (变化方案 " + d.changed + "/" + d.total + "，文本 " + d.textRaw + "→" + d.textPacked + " B)");
  console.log("    增量/全量 = " + (d.delta / d.full * 100).toFixed(1) + "%   相对原始 data.json 压缩 " + (RAW / d.delta).toFixed(1) + "×");
  const b = d.bits;
  const bitstream = Math.ceil((b.header + b.heroFlags + b.universal) / 8);
  console.log("    —— " + d.delta + " B 的构成 ——");
  console.log("       头部(魔数/版本/词表指纹/基准CRC/英雄数): " + Math.ceil(b.header / 8) + " B");
  console.log("       英雄与方案\"未变\"位图 + 变化方案字段:     " + Math.ceil(b.heroFlags / 8) + " B");
  console.log("       通用条目:                                " + Math.ceil(b.universal / 8) + " B");
  console.log("       文本块(变化方案的 名字/选手名, brotli):    " + d.textPacked + " B  (压缩前 " + d.textRaw + " B)");
  console.log("       文本块头:                                3 B");
  console.log("       = 位流 " + bitstream + " B + 文本 " + d.textPacked + " B + 头 3 B = " + (bitstream + d.textPacked + 3) + " B");
}
