// 初始化/刷新数据库
// 用法：
//   bun tools/db-setup.mjs                 # 首次初始化（已有数据则跳过）
//   bun tools/db-setup.mjs --force         # 重新导入根目录最新一期
//   bun tools/db-setup.mjs --force 2026-11-17
import { resolve } from "node:path";
import {
  ROOT, bootstrap, importExperimentalFile, listPeriods, getDates, getPeriod, getPower, getPlayers
} from "../db.js";

const force = process.argv.includes("--force");
const dateArg = process.argv.slice(2).find((a) => !a.startsWith("--"));

if (force) {
  const date = dateArg || getDates().sort().pop();
  if (!date) throw new Error("没有可导入的日期，请传入 YYYY-MM-DD");
  importExperimentalFile(resolve(ROOT, `曙光英雄_${date}.json`));
} else {
  bootstrap();
}

const periods = listPeriods();
console.log("periods:", JSON.stringify(periods, null, 2));
const date = dateArg || periods[periods.length - 1]?.date;
const p = date ? getPeriod(date) : null;
if (p) {
  console.log("date:", date, "heroes:", p.heroCount, "rankRows:", p.rowCount, "hasPower:", p.hasPower);
  console.log("top3:", p.heroes.slice(0, 3).map((h) => `${h.name} top9=${h.powerTop9} rank=${h.appearanceRank} wr=${h.winRate}`));
  const sample = p.heroes[0];
  const power = getPower(date, sample.name);
  const players = getPlayers(date, sample.name, 3);
  console.log("sample power rows:", power ? power.length : 0, "first:", power && power[0]);
  console.log("sample players:", players);
}
